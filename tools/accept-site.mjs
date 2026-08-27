#!/usr/bin/env node
/**
 * Приёмка собранного сайта. Работает с готовыми файлами из site/out — тем, что
 * реально уедет на хостинг, а не с исходником.
 *
 * Главное отличие от приёмки прототипа: там всё жило в одном документе и
 * проверялось через hash-маршруты. Здесь у каждого адреса свой файл, и именно
 * это надо подтвердить — что содержимое лежит в HTML до исполнения скриптов.
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/* ESM не читает NODE_PATH — та же оговорка, что в приёмке прототипа.
   Ищем playwright рядом, потом в глобальной установке. */
async function loadChromium() {
  const candidates = ['playwright', ...(process.env.NODE_PATH || '').split(':')
    .filter(Boolean).map((d) => `${d}/playwright/index.mjs`)
    .filter((f) => existsSync(f) || existsSync(f.replace('/index.mjs', '')))];
  for (const c of candidates) {
    try { return (await import(c.startsWith('/') ? pathToFileURL(c).href : c)).chromium; } catch (e) { /* следующий */ }
  }
  console.error('playwright не найден. Установите его или укажите NODE_PATH к глобальным модулям.');
  process.exit(2);
}

const OUT = resolve(process.argv[2] || 'site/out');
const problems = [];
const fail = (m) => problems.push(m);

const files = [];
(function walk(dir) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p);
    /* Страницы ошибок не индексируются и меты не имеют по своей природе. */
    else if (e === 'index.html' && !/\/(404|_not-found)\//.test(`${p}/`)) files.push(p);
  }
})(OUT);

const titles = new Map(), descs = new Map(), canons = new Map();
let minText = Infinity, minTextPage = '';

for (const f of files) {
  const url = `/${relative(OUT, f).replace(/index\.html$/, '')}`;
  const s = readFileSync(f, 'utf8');

  const plain = s.replace(/<script[\s\S]*?<\/script>/g, ' ')
    .replace(/<style[\s\S]*?<\/style>/g, ' ')
    .replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' ')
    .replace(/\s+/g, ' ').trim();

  const h1 = (s.match(/<h1[\s>]/g) || []).length;
  if (h1 !== 1) fail(`${url}: h1 ${h1} вместо одного`);

  const t = (s.match(/<title>([\s\S]*?)<\/title>/) || [])[1];
  if (!t) fail(`${url}: нет title`);
  else {
    if (t.length > 60) fail(`${url}: title ${t.length} знаков вместо 60 и меньше`);
    titles.set(t, [...(titles.get(t) || []), url]);
  }

  const d = (s.match(/name="description" content="([^"]*)"/) || [])[1];
  if (!d) fail(`${url}: нет description`);
  else {
    if (d.length < 60 || d.length > 165) fail(`${url}: description ${d.length} знаков вне 60–165`);
    descs.set(d, [...(descs.get(d) || []), url]);
  }

  const c = (s.match(/rel="canonical" href="([^"]*)"/) || [])[1];
  if (!c) fail(`${url}: нет canonical`);
  else canons.set(c, [...(canons.get(c) || []), url]);

  /* Смысл всей затеи: текст обязан быть в файле до исполнения скриптов. */
  if (plain.length < 400) fail(`${url}: всего ${plain.length} знаков текста в HTML`);
  if (plain.length < minText) { minText = plain.length; minTextPage = url; }

  if (!/"@type":\s*"Organization"/.test(s)) fail(`${url}: нет разметки Organization`);

  /* Прототип жил на хэш-роутере, и его адреса переехали в контент вместе с
     текстом: на собранном сайте "#/service" не ведёт никуда. Тридцать две
     такие ссылки пролежали в сборке, пока их никто не открыл глазами. */
  const dead = s.match(/href="#\/[^"]*"/g);
  if (dead) fail(`${url}: ссылки в никуда из хэш-роутера: ${[...new Set(dead)].slice(0, 3).join(', ')}`);

  /* Хлебные крошки страница рисует сама; вторые приезжают внутри
     перенесённого содержимого, и адрес получает две разные цепочки. */
  const crumbs = (s.match(/class="crumbs"/g) || []).length;
  if (crumbs > 1) fail(`${url}: хлебных крошек ${crumbs} вместо одной цепочки`);
}

for (const [k, v] of titles) if (v.length > 1) fail(`один title на ${v.length} адресов: ${v.slice(0, 3).join(', ')}`);
for (const [k, v] of descs) if (v.length > 1) fail(`одно description на ${v.length} адресов: ${v.slice(0, 3).join(', ')}`);
for (const [k, v] of canons) if (v.length > 1) fail(`один canonical на ${v.length} адресов: ${v.slice(0, 3).join(', ')}`);

/* Строковые проверки не годятся для формы: имена атрибутов в HTML
   регистронезависимы, и поиск по исходнику однажды уже дал ложную тревогу.
   Смотрим отрендеренную страницу — и намеренно без скриптов, чтобы убедиться,
   что форма остаётся рабочей у того, у кого JavaScript не выполнился. */
const chromium = await loadChromium();

/* Сайт отдаётся по HTTP, а не открывается файлом: при file:// пути к скриптам
   ведут в корень файловой системы, гидратация не запускается, и проверка
   поведения меряет несуществующую поломку. Это уже случилось однажды. */
const { createServer } = await import('node:http');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.xml': 'application/xml',
  '.txt': 'text/plain; charset=utf-8', '.woff2': 'font/woff2' };
const server = createServer((req, res) => {
  const clean = decodeURIComponent((req.url || '/').split('?')[0]);
  let file = join(OUT, clean);
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(file, 'index.html');
  if (!existsSync(file)) { res.statusCode = 404; res.end('not found'); return; }
  const ext = file.slice(file.lastIndexOf('.'));
  res.setHeader('content-type', MIME[ext] || 'application/octet-stream');
  res.end(readFileSync(file));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const ORIGIN = `http://127.0.0.1:${server.address().port}`;

/* Путь к Chromium зашивать нельзя: в этом контейнере он лежит в /opt, а в CI
   playwright ставит свой и находит его сам. Прибитый путь роняет прогон там,
   где всё исправно — это и случилось на первом же запуске конвейера. */
const EXEC = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium';
const browser = await chromium.launch(existsSync(EXEC) ? { executablePath: EXEC } : {});
const ctx = await browser.newContext({ javaScriptEnabled: false });
const page = await ctx.newPage();
await page.goto(`${ORIGIN}/contacts/`);
const form = await page.evaluate(() => {
  const f = document.querySelector('#leadForm');
  if (!f) return null;
  const consent = f.querySelector('#lead-consent');
  const inputs = [...f.querySelectorAll('input')];
  return {
    согласиеЕсть: !!consent,
    согласиеОбязательно: !!consent && consent.required,
    меткаСвязана: !!consent && !!consent.labels && consent.labels.length > 0,
    ссылкаНаПолитику: !!f.querySelector('a[href*="privacy"]'),
    безНазначения: inputs.filter((e) => e.required && e.type !== 'checkbox'
      && !e.getAttribute('autocomplete')).map((e) => e.name),
  };
});
if (!form) fail('на /contacts нет формы заявки');
else {
  if (!form.согласиеЕсть) fail('в форме нет чекбокса согласия на обработку ПД');
  if (!form.согласиеОбязательно) fail('согласие на обработку ПД не обязательно');
  if (!form.меткаСвязана) fail('у чекбокса согласия нет связанной метки');
  if (!form.ссылкаНаПолитику) fail('в форме нет ссылки на политику обработки данных');
  if (form.безНазначения.length) fail(`у обязательных полей не объявлено назначение (WCAG 1.3.5): ${form.безНазначения.join(', ')}`);
}
await ctx.close();
console.log(form ? 'форма: согласие обязательно, метка и политика на месте, назначение полей объявлено' : '');

/* Согласие и тема: то, что закреплено законом и замером, а не вкусом. */
{
  const c = await browser.newContext();
  const pg = await c.newPage();
  const foreign = [];
  pg.on('request', (r) => { if (!r.url().startsWith(ORIGIN)) foreign.push(r.url().slice(0, 70)); });
  await pg.goto(`${ORIGIN}/`);
  await pg.waitForTimeout(600);
  if (foreign.length) fail(`страница запрашивает чужие адреса: ${foreign[0]}`);
  if (await pg.evaluate(() => !!window.__analyticsLoaded)) fail('аналитика стартовала без согласия');
  const bar = () => pg.evaluate(() => !!document.querySelector('[aria-label*="аналитическ"]'));
  if (!(await bar())) fail('баннер согласия не показан');
  await pg.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => /Только необходимые/.test(x.textContent || ''));
    b && b.click();
  });
  await pg.waitForTimeout(200);
  if (await pg.evaluate(() => !!window.__analyticsLoaded)) fail('аналитика стартовала после явного отказа');
  await pg.goto(`${ORIGIN}/`);
  await pg.waitForTimeout(500);
  if (await bar()) fail('после отказа баннер спрашивает снова — решение не восстановлено');
  await c.close();
}
for (const [scheme, expect] of [['light', 'day'], ['dark', 'night']]) {
  const c = await browser.newContext({ colorScheme: scheme });
  const pg = await c.newPage();
  await pg.goto(`${ORIGIN}/`);
  await pg.waitForTimeout(500);
  const got = await pg.evaluate(() => document.documentElement.getAttribute('data-mode'));
  if (got !== expect) fail(`при системной теме ${scheme} сайт открывается в «${got}» вместо «${expect}»`);
  await c.close();
}
console.log('согласие и тема: аналитика ждёт ответа, отказ сохраняется, системная настройка учитывается');

/* Поиск. Проверяем не «что-то нашлось», а три свойства: форма слова приводится
   к основе, набор по мере ввода работает, и совпадение внутри слова не считается
   находкой — «ёлка» не должна открывать ответ из-за слова «переделка». */
{
  const c = await browser.newContext();
  const pg = await c.newPage();
  await pg.goto(`${ORIGIN}/answers/`);
  await pg.waitForTimeout(500);
  const box = await pg.$('#q');
  if (!box) fail('на странице ответов нет поля поиска');
  else {
    const count = async (q) => {
      await box.fill(q);
      await pg.waitForTimeout(220);
      return pg.evaluate(() => {
        const g = document.querySelector('[data-search-results]');
        /* Считаем карточки, а не ссылки-карточки: обёртка вокруг всего
           содержимого красила каждый абзац в цвет ссылки, и её убрали.
           Селектор по 'a.card' после этого возвращал ноль всегда — и три
           встречные проверки «совпадение внутри слова» сравнивали ноль с нулём. */
        return g ? g.querySelectorAll('.card').length : 0;
      });
    };
    if (!(await count('протечка'))) fail('поиск «протечка» не находит ответов — сломан стеммер');
    if (!(await count('протечкам'))) fail('поиск «протечкам» не находит ничего — форма слова не приводится к основе');
    if (!(await count('протеч'))) fail('поиск не находит по началу слова «протеч» — набор по мере ввода сломан');
    if (!(await count('рекуператор'))) fail('поиск не находит «рекуператор» — развёрнутая часть выпала из индекса');
    for (const mid of ['ёлка', 'ереде']) {
      if (await count(mid)) fail(`поиск «${mid}» находит совпадение внутри слова, а не с начала`);
    }
    await box.fill('<img src=x onerror=alert(1)>');
    await pg.waitForTimeout(220);
    if (await pg.evaluate(() => document.querySelectorAll('img[src="x"]').length)) {
      fail('ввод в поиск попадает в разметку');
    }
    console.log('поиск: основа слова, набор по мере ввода и развёрнутая часть — на месте; внутри слов не совпадает');
  }
  await c.close();
}

/* Калькулятор. Правило одно и жёсткое: он показывает состав работ и не
   называет цену, потому что методики нет. Опубликованный порог — позиция
   компании, он помечен, и пометку из проверки вырезаем вместе со строкой. */
{
  const c = await browser.newContext();
  const pg = await c.newPage();
  await pg.goto(`${ORIGIN}/pricing/`);
  await pg.waitForTimeout(500);
  const calc = await pg.$('#calc');
  if (!calc) fail('на /pricing нет калькулятора состава работ');
  else {
    const money = /\d[\d\s\u00a0\u202f]*(?:[.,]\d+)?\s*(?:₽|руб|тыс|млн|миллион|тысяч)/i;
    const stages = await pg.$$('#calc button[aria-pressed]');
    const boxes = await pg.$$('#calc input[type=checkbox]');
    let maxLen = 0; const bad = [];
    for (let si = 0; si < stages.length; si += 1) {
      await stages[si].click();
      for (const pattern of [[], [0], [0, 3, 7], boxes.map((_, i) => i)]) {
        for (let bi = 0; bi < boxes.length; bi += 1) {
          const want = pattern.includes(bi);
          if ((await boxes[bi].isChecked()) !== want) await boxes[bi].click();
        }
        await pg.waitForTimeout(60);
        const seen = await pg.evaluate(() => {
          const out = document.querySelector('.calc-out');
          if (!out) return { text: '', len: 0 };
          const clone = out.cloneNode(true);
          clone.querySelectorAll('.prov').forEach((m) => {
            const line = m.closest('p,li,div') || m;
            line.remove();
          });
          return { text: clone.textContent || '', len: (out.textContent || '').trim().length };
        });
        maxLen = Math.max(maxLen, seen.len);
        if (money.test(seen.text)) bad.push(seen.text.replace(/\s+/g, ' ').slice(0, 90));
      }
    }
    if (maxLen < 200) fail(`калькулятор ни в одном состоянии не выдаёт состав работ (максимум ${maxLen} знаков)`);
    if (bad.length) fail(`калькулятор называет непомеченную цену: ${bad[0]}`);
    console.log(`калькулятор: состояний перебрано ${stages.length * 4}, состав выдан, непомеченных цен нет`);
  }
  await c.close();
}

/* Модель дома. Проверяем три вещи: активный сценарий объявляется разметкой,
   а не только заливкой кнопки; следы под курсором появляются и видны; сквозь
   стены житель не проходит. */
{
  const c = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const pg = await c.newPage();
  await pg.goto(`${ORIGIN}/`);
  await pg.waitForTimeout(900);
  const stage = await pg.$('#houseStage');
  if (!stage) fail('на главной нет интерактивной модели дома');
  else {
    await stage.scrollIntoViewIfNeeded();
    await pg.waitForTimeout(400);
    const btns = await pg.$$('.scen-btn');
    if (btns.length < 6) fail(`кнопок сценариев ${btns.length}, ожидалось не меньше шести`);
    const pressed = async () => pg.evaluate(() => document.querySelectorAll('.scen-btn[aria-pressed="true"]').length);
    if ((await pressed()) !== 1) fail('нажатых кнопок сценария не ровно одна — состояние не объявлено разметкой');
    const before = await pg.evaluate(() => document.getElementById('houseStage').className);
    if (btns[3]) await btns[3].click();
    await pg.waitForTimeout(250);
    const after = await pg.evaluate(() => document.getElementById('houseStage').className);
    if (before === after) fail('сценарий не меняет состояние модели дома');
    if ((await pressed()) !== 1) fail('после переключения нажатых кнопок не ровно одна');

    const bb = await stage.boundingBox();
    await pg.evaluate(() => {
      window.__made = 0;
      const s = document.getElementById('houseStage');
      const orig = s.appendChild.bind(s);
      s.appendChild = (n) => { if (n.className === 'footprint') window.__made += 1; return orig(n); };
    });
    /* Полос две: какая свободна, зависит от расстановки на плане, и привязка
       к одной ловила бы план, а не регрессию. */
    let best = 0;
    for (const band of [0.55, 0.3]) {
      await pg.evaluate(() => { window.__made = 0; });
      await pg.mouse.move(bb.x + 60, bb.y + bb.height * band);
      await pg.waitForTimeout(140);
      for (let i = 1; i <= 14; i += 1) {
        await pg.mouse.move(bb.x + 60 + i * 12, bb.y + bb.height * band);
        await pg.waitForTimeout(95);
      }
      best = Math.max(best, await pg.evaluate(() => window.__made));
    }
    if (best < 5) fail(`следы под курсором почти не появляются: лучшая полоса дала ${best} за 14 шагов`);
    const foot = await pg.evaluate(() => {
      const e = document.querySelector('.footprint');
      if (!e) return null;
      const r = e.getBoundingClientRect();
      return { ширина: Math.round(r.width), задержка: getComputedStyle(e).transitionDelay };
    });
    if (foot && foot.ширина < 6) fail(`след шириной ${foot.ширина}px — на плане его не различить`);
    if (foot && parseFloat(foot.задержка) <= 0) fail('след гаснет сразу: он виден только в середине перехода');
    console.log(`модель дома: сценариев ${btns.length}, состояние объявляемо, следов за 14 шагов ${best}`);
  }
  await c.close();
}

await browser.close();
server.close();

console.log(`страниц: ${files.length}`);
console.log(`уникальных: title ${titles.size} · description ${descs.size} · canonical ${canons.size}`);
console.log(`минимум текста в HTML: ${minText} знаков (${minTextPage})`);

if (problems.length) {
  console.log(`\n❌ НАРУШЕНИЙ: ${problems.length}`);
  problems.slice(0, 15).forEach((p) => console.log(`  · ${p}`));
  process.exit(1);
}
console.log('\n✅ Нарушений нет.');
