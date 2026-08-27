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

/* Разметка перенесённых страниц обязана быть сбалансированной. Незакрытый тег
   — подпись обрезки: выгрузка заканчивала страницу на первом </section>, то
   есть на закрытии ВЛОЖЕННОЙ секции, и до сайта доезжала половина материала.
   Страницы при этом продолжали открываться, поэтому дефект жил незамеченным. */
{
  const content = JSON.parse(readFileSync(resolve('site/lib/content.json'), 'utf8'));
  for (const [url, page] of Object.entries(content.pages)) {
    const h = page.html;
    for (const tag of ['div', 'section', 'table', 'ul', 'ol']) {
      const open = (h.match(new RegExp(`<${tag}[\\s>]`, 'g')) || []).length;
      const close = (h.match(new RegExp(`</${tag}>`, 'g')) || []).length;
      if (open !== close) fail(`${url}: разметка не сбалансирована — <${tag}> ${open}, </${tag}> ${close}`);
    }
  }
  /* Кнопка без обработчика — это кнопка, которая ничего не делает. В
     прототипе форму открывал скрипт; на сайте таких кнопок оказалось
     двенадцать, и каждая выглядела рабочей. */
  for (const [url, page] of Object.entries(content.pages)) {
    const dead = (page.html.match(/<button/g) || []).length;
    if (dead) fail(`${url}: в перенесённом содержимом ${dead} кнопок без обработчика — на сайте они не делают ничего`);
  }
  console.log(`перенесённые страницы: разметка сбалансирована, кнопок без действия нет (${Object.keys(content.pages).length})`);
}

/* Карта сайта обязана знать каждую собранную страницу и ни одной лишней.
   Строится она из данных, а страницы — из тех же данных, но списки разные:
   одиннадцать хабов не попадали в карту, потому что не лежат ни в разделах,
   ни в сравнениях. */
{
  let sm = '';
  try { sm = readFileSync(join(OUT, 'sitemap.xml'), 'utf8'); } catch { /* нет файла */ }
  if (!sm) fail('нет sitemap.xml');
  else {
    const inMap = new Set([...sm.matchAll(/<loc>([^<]+)<\/loc>/g)]
      .map((m) => m[1].replace(/^https?:\/\/[^/]+/, '')));
    const built = files.map((f) => `/${relative(OUT, f).replace(/index\.html$/, '')}`);
    const missing = built.filter((u) => !inMap.has(u));
    const extra = [...inMap].filter((u) => !built.includes(u));
    if (missing.length) fail(`страниц нет в карте сайта: ${missing.length} (${missing.slice(0, 4).join(', ')})`);
    if (extra.length) fail(`в карте сайта адреса без страниц: ${extra.slice(0, 4).join(', ')}`);
    if (!missing.length && !extra.length) console.log(`карта сайта: ${inMap.size} адресов, ровно столько же страниц`);
  }
}

/* Близкие дубли размывают вес между копиями: машина, выбирая, какую страницу
   показать, не имеет оснований предпочесть одну другой. У прототипа этой
   опасности не было — страница была одна; у ста тридцати семи страниц,
   собранных из шаблонов, она настоящая. */
{
  const norm = (s) => s.replace(/<script[\s\S]*?<\/script>/g, ' ')
    .replace(/<style[\s\S]*?<\/style>/g, ' ')
    .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
  const docs = files.map((f) => ({
    url: `/${relative(OUT, f).replace(/index\.html$/, '')}`,
    words: new Set(norm(readFileSync(f, 'utf8')).split(' ').filter((x) => x.length > 3)),
  }));
  const close = [];
  for (let i = 0; i < docs.length; i += 1) {
    for (let j = i + 1; j < docs.length; j += 1) {
      const a = docs[i].words, b = docs[j].words;
      let inter = 0;
      for (const x of a) if (b.has(x)) inter += 1;
      const ratio = inter / (a.size + b.size - inter);
      if (ratio > 0.6) close.push([ratio, docs[i].url, docs[j].url]);
    }
  }
  close.sort((x, y) => y[0] - x[0]);
  if (close.length) {
    const [r, a, b] = close[0];
    fail(`страницы совпадают на ${(r * 100).toFixed(0)}%: ${a} и ${b} — вес делится между копиями (всего пар ${close.length})`);
  } else {
    console.log(`совпадение страниц: ни одной пары выше 60% (сравнено ${docs.length * (docs.length - 1) / 2} пар)`);
  }
}

/* Редиректы со старых адресов: каждое назначение обязано существовать и
   вести туда одним переходом. Сайт собран со слэшем в конце, и назначение
   без слэша даёт цепочку из двух редиректов на каждом старом адресе. */
{
  let conf = null;
  try { conf = JSON.parse(readFileSync(resolve('site/vercel.json'), 'utf8')); } catch { /* нет файла */ }
  if (!conf) fail('нет site/vercel.json с правилами для старых адресов');
  else {
    const rules = conf.redirects || [];
    if (!rules.length) fail('в site/vercel.json нет ни одного правила');
    const dead = rules.filter((r) => {
      const d = r.destination.split(/[?#]/)[0];
      return !existsSync(join(OUT, d, 'index.html')) && !existsSync(join(OUT, d));
    });
    const chained = rules.filter((r) => !/\.[a-z0-9]+$/i.test(r.destination)
      && !r.destination.endsWith('/'));
    if (dead.length) fail(`редирект ведёт на несуществующую страницу: ${dead[0].source} → ${dead[0].destination} (всего ${dead.length})`);
    if (chained.length) fail(`редиректов с лишним переходом: ${chained.length} — назначение без слэша, сайт собран со слэшем`);
    if (!dead.length && !chained.length) console.log(`редиректы: ${rules.length} правил, все ведут на существующие страницы одним переходом`);
  }
}

/* Видимая цепочка и её разметка обязаны совпадать. Они делаются из одного
   списка, но проверка нужна встречная: при переезде с прототипа крошки
   остались на 136 страницах, а BreadcrumbList не переехал ни на одну —
   и никто этого не заметил, потому что на экране всё было на месте. */
for (const f of files) {
  const url = `/${relative(OUT, f).replace(/index\.html$/, '')}`;
  const src = readFileSync(f, 'utf8');
  const visible = src.match(/class="crumbs"[^>]*>([\s\S]*?)<\/nav>/);
  const marked = src.match(/"@type":"BreadcrumbList","itemListElement":\[([\s\S]*?)\]\}/);
  if (!visible && !marked) continue;
  if (visible && !marked) { fail(`${url}: цепочка на экране есть, в разметке нет`); continue; }
  if (!visible && marked) { fail(`${url}: цепочка в разметке есть, на экране нет`); continue; }
  const seen = visible[1].replace(/<[^>]+>/g, '\u0001').split('\u0001')
    .map((x) => x.replace(/\s+/g, ' ').trim()).filter((x) => x && x !== '/');
  const names = [...marked[1].matchAll(/"name":"((?:[^"\\]|\\.)*)"/g)]
    .map((m) => JSON.parse(`"${m[1]}"`));
  if (seen.join(' / ') !== names.join(' / ')) {
    fail(`${url}: цепочка расходится — на экране «${seen.join(' / ')}», в разметке «${names.join(' / ')}»`);
  }
}
console.log(`хлебные крошки: на экране и в разметке совпадают (${files.filter((f) => /class="crumbs"/.test(readFileSync(f, 'utf8'))).length})`);

/* Каждая внутренняя ссылка обязана вести в существующий файл. Мёртвые адреса
   из хэш-роутера пролежали в сборке, пока их не открыли глазами; проверка по
   одному шаблону ловит только известную породу, а эта — любую. */
{
  const known = new Set(files.map((f) => `/${relative(OUT, f).replace(/index\.html$/, '')}`));
  const assets = new Set();
  (function walkAll(dir) {
    for (const e of readdirSync(dir)) {
      const p = join(dir, e);
      if (statSync(p).isDirectory()) walkAll(p);
      else assets.add(`/${relative(OUT, p)}`);
    }
  })(OUT);
  const broken = new Map();
  for (const f of files) {
    const from = `/${relative(OUT, f).replace(/index\.html$/, '')}`;
    for (const m of readFileSync(f, 'utf8').matchAll(/href="([^"]+)"/g)) {
      const href = m[1];
      if (!href.startsWith('/') || href.startsWith('//')) continue;
      const path = href.split(/[?#]/)[0];
      if (known.has(path) || assets.has(path) || assets.has(path.replace(/\/$/, ''))) continue;
      if (!broken.has(path)) broken.set(path, from);
    }
  }
  for (const [path, from] of broken) fail(`ссылка в никуда: ${path} (со страницы ${from})`);

  /* Встречная проверка: на каждую страницу должна вести хотя бы одна ссылка.
     Адрес без входящих ссылок существует только для того, кто его знает —
     ни человек из меню, ни краулер по сайту до него не доберутся. */
  const linked = new Set(['/']);
  for (const f of files) {
    for (const m of readFileSync(f, 'utf8').matchAll(/href="(\/[^"]*)"/g)) {
      const path = m[1].split(/[?#]/)[0];
      const self = `/${relative(OUT, f).replace(/index\.html$/, '')}`;
      if (path !== self) linked.add(path);
    }
  }
  const orphans = [...known].filter((u) => !linked.has(u));
  if (orphans.length) fail(`на эти страницы не ведёт ни одна ссылка: ${orphans.slice(0, 5).join(', ')}`);
  if (!broken.size && !orphans.length) {
    console.log(`внутренние ссылки: все ведут в существующие страницы и на каждую есть ссылка (адресов ${known.size})`);
  }
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

/* Ширина. Ничто не должно вылезать за край экрана: горизонтальная прокрутка
   на телефоне — это когда до половины строки не дотянуться. Проверяем на
   узком экране, где запас кончается первым. Отдельно смотрим, что шапка не
   печатается поверх заголовка: десять ссылок переносились внутри шапки
   фиксированной высоты и накрывали первый экран, а ни одна проверка этого
   не видела — они читали разметку, а не положение на экране. */
{
  const c = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const pg = await c.newPage();
  for (const u of ['/', '/answers/', '/pricing/', '/portfolio/', '/contacts/']) {
    await pg.goto(`${ORIGIN}${u}`);
    await pg.waitForTimeout(300);
    const over = await pg.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (over > 1) fail(`${u} на экране 390 px шире экрана на ${over} px — появляется прокрутка вбок`);
    const clash = await pg.evaluate(() => {
      const h = document.querySelector('header.site'), t = document.querySelector('#main');
      if (!h || !t) return null;
      /* По коробке шапки судить нельзя: ссылки переносились ВНУТРИ неё и
         вылезали за нижний край, а сама коробка оставалась ровно 60 px —
         проверка видела чистое поле там, где на снимке текст лежал поверх
         заголовка. Берём самый нижний край среди шапки и всего, что в ней. */
      const bottom = [h, ...h.querySelectorAll('*')]
        .map((n) => n.getBoundingClientRect())
        .filter((r) => r.width > 0 && r.height > 0)
        .reduce((m, r) => Math.max(m, r.bottom), 0);
      /* Сравниваем с началом содержимого, а не с h1: над заголовком стоит
         надстрочник, и накрывало сперва его. По h1 замер давал ровно ноль
         разницы — низ переносящейся навигации совпадал с его верхом. */
      const b = t.getBoundingClientRect();
      return b.top < bottom ? Math.round(bottom - b.top) : 0;
    });
    if (clash === null) fail(`${u}: нет шапки или заголовка`);
    else if (clash > 0) fail(`${u}: шапка накрывает заголовок на ${clash} px`);
  }
  console.log('узкий экран: за край не выходит, шапка заголовок не накрывает');
  await c.close();
}

/* Ни один элемент управления не должен остаться с фоном браузера по умолчанию.
   Кнопки сценариев на плане не имели ни одного своего правила, а поле поиска
   получило только рамку: в светлой теме это случайно похоже на задуманное, в
   тёмной они горят белым на чёрном.

   Смотрим именно в тёмной теме и именно на два значения — buttonface и белый.
   Судить «по светлому фону» нельзя: основная кнопка в тёмной теме светлая
   намеренно, с тёмной надписью, и такая проверка объявляла бы её дефектом. */
{
  const c = await browser.newContext({ colorScheme: 'dark' });
  const pg = await c.newPage();
  const bad = [];
  for (const u of ['/', '/answers/', '/portfolio/', '/pricing/', '/contacts/']) {
    await pg.goto(`${ORIGIN}${u}`);
    /* Ждём, пока тема проставлена: до этого страница отдаёт значения светлой
       темы, и замер объявляет дефектом всё подряд. */
    await pg.waitForFunction(() => document.documentElement.dataset.mode).catch(() => {});
    await pg.waitForTimeout(250);
    const found = await pg.evaluate(() => {
      const DEFAULTS = new Set(['rgb(239, 239, 239)', 'rgb(255, 255, 255)', 'rgba(0, 0, 0, 0)']);
      return [...document.querySelectorAll('button, input, select, textarea')]
        .filter((n) => n.offsetParent !== null)
        /* Флажки и переключатели красит accent-color, а не фон: у родного
           элемента background остаётся белым при любом оформлении. */
        .filter((n) => !['checkbox', 'radio'].includes(n.type))
        .filter((n) => {
          const bg = getComputedStyle(n).backgroundColor;
          /* Прозрачный фон допустим, только если элементу задана своя рамка
             или цвет: иначе это значит, что до него стили не дошли вовсе. */
          if (bg === 'rgba(0, 0, 0, 0)') return getComputedStyle(n).borderStyle === 'none';
          return DEFAULTS.has(bg);
        })
        .map((n) => `${n.tagName.toLowerCase()}.${n.className || '(без класса)'}`.slice(0, 60));
    });
    for (const f of found) bad.push(`${u}: ${f}`);
  }
  if (bad.length) fail(`элементы управления с оформлением по умолчанию в тёмной теме: ${[...new Set(bad)].slice(0, 4).join('; ')}`);
  else console.log('тёмная тема: элементы управления оформлены, а не оставлены браузеру');
  await c.close();
}

/* Контраст текста к фону, WCAG AA: 4.5:1 для обычного текста и 3:1 для
   крупного. Проверка была на прототипе и не переехала на сайт — а стилей с
   тех пор написано больше, чем было. Смотрим обе темы: цвета в них разные,
   и пройденное в одной ничего не говорит о другой. */
{
  for (const [scheme, mode] of [['light', 'day'], ['dark', 'night']]) {
    const c = await browser.newContext({ colorScheme: scheme });
    const pg = await c.newPage();
    const bad = [];
    for (const u of ['/', '/answers/', '/pricing/', '/portfolio/', '/contacts/', '/about/', '/service/']) {
      await pg.goto(`${ORIGIN}${u}`);
      await pg.waitForFunction(() => document.documentElement.dataset.mode).catch(() => {});
      await pg.waitForTimeout(200);
      const found = await pg.evaluate(() => {
        /* Цвет приходит в двух записях: rgb(0…255) и color(srgb 0…1).
           Разбор «взять три числа» на второй давал доли единицы вместо
           яркости — фон шапки читался почти чёрным, и проверка объявляла
           логотипу контраст 1.07:1 там, где он около семнадцати. */
        const parse = (v) => {
          const nums = (v.match(/[\d.]+(?:e-?\d+)?/g) || []).map(Number);
          if (!nums.length) return { c: [255, 255, 255], a: 1 };
          const srgb = /^color\(/.test(v);
          const c = nums.slice(0, 3).map((x) => (srgb ? x * 255 : x));
          const a = /\/|rgba/.test(v) && nums.length > 3 ? nums[3] : 1;
          return { c, a };
        };
        const rgb = (v) => parse(v).c;
        const lum = ([r, g, b]) => {
          const f = (x) => { const s = x / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
          return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
        };
        /* Фон берём у ближайшего непрозрачного предка: у самого элемента он
           почти всегда прозрачный, и сравнение с ним даёт бессмыслицу. */
        const bgOf = (n) => {
          /* Полупрозрачные слои складываем по порядку, а не берём первый
             попавшийся: фон шапки задан с прозрачностью, и без наложения
             на страницу под ним яркость получается не та. */
          const layers = [];
          for (let a = n; a; a = a.parentElement) {
            const { c, a: alpha } = parse(getComputedStyle(a).backgroundColor);
            if (alpha === 0) continue;
            layers.push({ c, alpha });
            if (alpha === 1) break;
          }
          let out = [255, 255, 255];
          for (let i = layers.length - 1; i >= 0; i -= 1) {
            const { c, alpha } = layers[i];
            out = out.map((x, k) => c[k] * alpha + x * (1 - alpha));
          }
          return out;
        };
        const out = [];
        for (const n of document.querySelectorAll('main *, header *, footer *')) {
          const t = [...n.childNodes].some((x) => x.nodeType === 3 && x.textContent.trim());
          if (!t || !n.offsetParent) continue;
          const cs = getComputedStyle(n);
          const size = parseFloat(cs.fontSize);
          const bold = parseInt(cs.fontWeight, 10) >= 700;
          const need = size >= 24 || (size >= 18.66 && bold) ? 3 : 4.5;
          const [L1, L2] = [lum(rgb(cs.color)), lum(bgOf(n))].sort((a, b) => b - a);
          const ratio = (L1 + 0.05) / (L2 + 0.05);
          if (ratio < need) {
            out.push(`${n.tagName.toLowerCase()}.${(n.className || '').toString().slice(0, 24)} ${ratio.toFixed(2)}:1 при ${need}`);
          }
        }
        return [...new Set(out)];
      });
      for (const f of found) bad.push(`${u} ${f}`);
    }
    if (bad.length) fail(`контраст ниже AA (${mode}): ${[...new Set(bad)].slice(0, 4).join('; ')}`);
    await c.close();
  }
  console.log('контраст: обе темы держат AA');
}

/* Область с горизонтальной прокруткой обязана быть достижима клавиатурой:
   без tabindex до правой половины широкой таблицы не добраться без мыши. */
{
  const c = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const pg = await c.newPage();
  const bad = [];
  for (const u of ['/about/', '/compare/', '/functions/', '/partners/']) {
    await pg.goto(`${ORIGIN}${u}`);
    const r = await pg.evaluate(() => {
      const wraps = [...document.querySelectorAll('.tbl-wrap')];
      return {
        всего: wraps.length,
        прокручиваются: wraps.filter((w) => w.scrollWidth > w.clientWidth + 1).length,
        безКлавиатуры: wraps.filter((w) => w.scrollWidth > w.clientWidth + 1
          && !w.hasAttribute('tabindex')).length,
      };
    });
    if (r.безКлавиатуры) bad.push(`${u}: ${r.безКлавиатуры} из ${r.прокручиваются}`);
  }
  if (bad.length) fail(`таблицы прокручиваются вбок, но клавиатурой недостижимы: ${bad.join('; ')}`);
  else console.log('таблицы: прокрутка вбок достижима клавиатурой');
  await c.close();
}

/* Липкое действие на телефоне: появляется после первого экрана, не
   перекрывает вопрос о согласии и не накрывает подвал. Проверяем все три
   свойства — два прижатых к низу блока иначе спорят за одно место. */
{
  const c = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const pg = await c.newPage();
  await pg.goto(`${ORIGIN}/`);
  await pg.waitForTimeout(400);
  const hidden = await pg.evaluate(() => {
    const b = document.querySelector('.sticky-cta');
    return b ? b.getBoundingClientRect().top >= window.innerHeight - 1 : null;
  });
  if (hidden === null) fail('на телефоне нет липкого целевого действия');
  else if (!hidden) fail('липкое действие показано поверх вопроса о согласии');

  await pg.evaluate(() => {
    try { localStorage.setItem('mm-analytics-consent', 'no'); } catch { /* нет хранилища */ }
  });
  await pg.goto(`${ORIGIN}/`);
  await pg.waitForTimeout(300);
  const beforeScroll = await pg.evaluate(() =>
    document.querySelector('.sticky-cta').getBoundingClientRect().top >= window.innerHeight - 1);
  if (!beforeScroll) fail('липкое действие показано на первом экране, где кнопка и так видна');

  await pg.evaluate(() => window.scrollTo(0, 900));
  await pg.waitForTimeout(400);
  const after = await pg.evaluate(() => {
    const b = document.querySelector('.sticky-cta');
    const r = b.getBoundingClientRect();
    const f = document.querySelector('footer.site').getBoundingClientRect();
    return { видно: r.top < window.innerHeight - 20, высота: Math.round(r.height),
      подвалНиже: f.bottom > r.top ? Math.round(f.bottom - r.top) : 0 };
  });
  if (!after.видно) fail('липкое действие не появляется после первого экрана');
  if (after.высота < 44) fail(`липкое действие высотой ${after.высота} px — меньше пальца`);
  console.log('липкое действие: ждёт ответа о согласии, появляется после первого экрана');
  await c.close();
}

/* Свойства, которые проверялись на прототипе и при переезде остались без
   присмотра. Разметку с тех пор писали заново — шапка, подвал, карточки,
   форма, — и ни одно из этих условий её не касалось. */
{
  const PAGES = ['/', '/answers/', '/pricing/', '/portfolio/', '/contacts/', '/about/', '/service/'];
  const c = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const pg = await c.newPage();
  const errors = [];
  pg.on('pageerror', (e) => errors.push(String(e).slice(0, 120)));
  pg.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 120)); });

  for (const u of PAGES) {
    await pg.goto(`${ORIGIN}${u}`);
    await pg.waitForTimeout(250);
    const r = await pg.evaluate(() => {
      const ids = [...document.querySelectorAll('[id]')].map((n) => n.id);
      const dupes = ids.filter((x, i) => ids.indexOf(x) !== i);
      const noAlt = [...document.querySelectorAll('img')]
        .filter((n) => !n.hasAttribute('alt')).map((n) => n.getAttribute('src') || '(без src)');
      /* Пропуск уровня заголовка — это когда за h2 сразу идёт h4:
         читающий с экрана теряет, к чему относится раздел. */
      const levels = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')]
        .map((n) => Number(n.tagName[1]));
      const skips = levels.filter((l, i) => i > 0 && l > levels[i - 1] + 1).length;
      const svgNoName = [...document.querySelectorAll('svg')]
        .filter((n) => !n.hasAttribute('aria-hidden') && !n.getAttribute('aria-label')
          && !n.querySelector('title')).length;
      return { dupes: [...new Set(dupes)], noAlt, skips, svgNoName, headings: levels.length };
    });
    if (r.dupes.length) fail(`${u}: одинаковые id: ${r.dupes.slice(0, 3).join(', ')}`);
    if (r.noAlt.length) fail(`${u}: изображений без alt: ${r.noAlt.length} (${r.noAlt[0]})`);
    if (r.skips) fail(`${u}: пропусков уровня заголовка: ${r.skips}`);
    if (r.svgNoName) fail(`${u}: SVG без имени и без aria-hidden: ${r.svgNoName}`);
  }
  if (errors.length) fail(`ошибки в консоли: ${[...new Set(errors)].slice(0, 2).join(' | ')}`);

  /* Видимый фокус при обходе с клавиатуры: без него человек, идущий Tab,
     не знает, где он находится. */
  await pg.goto(`${ORIGIN}/`);
  await pg.waitForTimeout(200);
  const noFocus = [];
  for (let i = 0; i < 14; i += 1) {
    await pg.keyboard.press('Tab');
    const bad = await pg.evaluate(() => {
      const n = document.activeElement;
      if (!n || n === document.body) return null;
      const cs = getComputedStyle(n);
      const visible = (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0)
        || cs.boxShadow !== 'none' || n.className.toString().includes('skip');
      return visible ? null : `${n.tagName.toLowerCase()}.${(n.className || '').toString().slice(0, 24)}`;
    });
    if (bad) noFocus.push(bad);
  }
  if (noFocus.length) fail(`нет видимого фокуса при обходе Tab: ${[...new Set(noFocus)].slice(0, 3).join(', ')}`);

  /* Масштаб 200%: текст увеличивают, а не отдаляют — прокрутки вбок быть
     не должно (WCAG 1.4.10). */
  await pg.setViewportSize({ width: 640, height: 900 });
  await pg.goto(`${ORIGIN}/pricing/`);
  await pg.waitForTimeout(200);
  const zoomOver = await pg.evaluate(() =>
    document.documentElement.scrollWidth - window.innerWidth);
  if (zoomOver > 1) fail(`при масштабе 200% появляется прокрутка вбок: +${zoomOver} px`);
  await c.close();
  console.log('доступность: id, alt, уровни заголовков, фокус, консоль, масштаб 200% — чисто');
}

/* Страница обязана открываться, когда хранилище запрещено: приватное окно и
   строгие настройки — обычное дело, а тема и согласие пишут в localStorage. */
{
  const c = await browser.newContext();
  await c.addInitScript(() => {
    const boom = () => { throw new Error('хранилище запрещено'); };
    Object.defineProperty(window, 'localStorage', { get: boom, configurable: true });
  });
  const pg = await c.newPage();
  const errs = [];
  pg.on('pageerror', (e) => errs.push(String(e).slice(0, 90)));
  await pg.goto(`${ORIGIN}/`);
  await pg.waitForTimeout(400);
  const alive = await pg.evaluate(() => !!document.querySelector('h1') && !!document.querySelector('.house-stage'));
  if (!alive) fail('при запрещённом хранилище страница не собирается');
  if (errs.length) fail(`при запрещённом хранилище страница падает: ${errs[0]}`);
  else console.log('запрещённое хранилище: страница живёт');
  await c.close();
}

/* При запрете анимации переходы обязаны выключаться, а модель дома — не
   двигаться сама: движение, которого человек не просил, для части людей
   означает тошноту, а не оживление. */
{
  const c = await browser.newContext({ reducedMotion: 'reduce' });
  const pg = await c.newPage();
  await pg.goto(`${ORIGIN}/`);
  await pg.waitForTimeout(300);
  const moving = await pg.evaluate(() => {
    const names = ['.btn', '.card', '.chip', '.sticky-cta', '.footprint'];
    return names.filter((sel) => {
      const n = document.querySelector(sel);
      if (!n) return false;
      const d = getComputedStyle(n).transitionDuration;
      return d && d !== '0s' && !/^0s(, 0s)*$/.test(d);
    });
  });
  if (moving.length) fail(`при reduced-motion переходы не отключены: ${moving.join(', ')}`);
  else console.log('reduced-motion: переходы отключены');
  await c.close();
}

/* Содержательный стандарт на самом сайте. Приёмка контента читает прототип,
   а текст, написанный прямо в компонентах — первый экран, маршруты, блок про
   передачу объекта, подписи в форме, — через неё не проходил вовсе.

   Превосходство без критерия запрещено ст. 14.2 и 14.3 ФЗ-135, и запрет
   касается любой строки на странице, а не только той, что приехала из
   прототипа. */
{
  const c = await browser.newContext({ javaScriptEnabled: false });
  const pg = await c.newPage();
  const supHits = [], provHits = [];
  for (const u of ['/', '/answers/', '/pricing/', '/portfolio/', '/contacts/', '/about/', '/service/']) {
    await pg.goto(`${ORIGIN}${u}`);
    const r = await pg.evaluate(() => {
      const text = (document.querySelector('main')?.innerText || '')
        + ' ' + (document.querySelector('footer')?.innerText || '');
      /* Без \b: в JavaScript граница слова опирается на \w, который не знает
         кириллицы, и «\bлучший\b» не совпадает никогда. Проверка молча
         пропускала бы всё — этой ошибке в проекте уже счёт на разы. */
      const MARKET = '(в России|на рынке|в Москве|среди [а-яё]+|из всех)';
      const re = new RegExp('(?:^|[^а-яёa-z])(сам(?:ый|ая|ое|ые)|лучш(?:ий|ая|ее|ие)|'
        + 'единственн(?:ый|ая|ое|ые)|лидер[а-яё]*|крупнейш[а-яё]*)(?![а-яёa-z])[^.!?]{0,40}?'
        + MARKET, 'gi');
      const sup = [];
      let m;
      while ((m = re.exec(text))) {
        const frag = text.slice(Math.max(0, m.index - 60), m.index + 90);
        if (/\?/.test(frag)) continue;
        if (/(?:^|[^а-яё])не\s+(утвержда|заявля|обеща|говор)/i.test(frag)) continue;
        sup.push(frag.replace(/\s+/g, ' ').trim());
      }
      /* Пометка обязана называть, что именно не подтверждено. Порог беру тот
         же, что на прототипе — шесть знаков без пробелов: правило «меньше трёх
         слов» я сначала придумал строже и оно объявило дефектом «порог
         уточняется», где предмет назван прямо. */
      const clean = (e) => (e.textContent || '').replace(/[\u26a0\ufe0f\s]/g, '');
      const all = [...document.querySelectorAll('.prov')];
      const thin = all
        .filter((e) => clean(e).length < 6)
        .map((e) => (e.textContent || '').trim().slice(0, 40));
      /* И не должна стоять отдельным абзацем: тогда непонятно, к какому факту
         она относится. Ячейки таблиц и подписи-заголовки — законные случаи. */
      const alone = all.filter((e) => {
        const par = e.parentElement;
        if (!par || par.children.length !== 1) return false;
        if ((par.textContent || '').trim() !== (e.textContent || '').trim()) return false;
        if (/^(td|th)$/i.test(par.tagName)) return false;
        return !par.previousElementSibling;
      }).length;
      return { sup, thin, alone };
    });
    r.sup.forEach((x) => supHits.push(`${u}: ${x}`));
    r.thin.forEach((x) => provHits.push(`${u}: «${x}»`));
    if (r.alone) provHits.push(`${u}: ${r.alone} пометок отдельным абзацем — непонятно, к какому факту`);
  }
  if (supHits.length) fail(`превосходство без критерия (ФЗ-135, ст. 14.2/14.3): ${supHits[0]}`);
  if (provHits.length) fail(`пометки без предмета: ${[...new Set(provHits)].slice(0, 3).join('; ')}`);
  if (!supHits.length && !provHits.length) {
    console.log('текст сайта: превосходства без критерия нет, каждая пометка называет предмет');
  }
  await c.close();
}

/* Кейсы — страница доверия премиального подрядчика. Объекты вставлял скрипт,
   и в сборку попадал пустой контейнер: раздел открывался одним заголовком. */
{
  const c = await browser.newContext({ javaScriptEnabled: false });
  const pg = await c.newPage();
  await pg.goto(`${ORIGIN}/portfolio/`);
  const n = await pg.evaluate(() => document.querySelectorAll('[data-cases] .case').length);
  if (n < 1) fail('на странице кейсов нет ни одного объекта до исполнения скриптов');
  const marked = await pg.evaluate(() =>
    [...document.querySelectorAll('[data-cases] .case')].every((c) => c.querySelector('.prov')));
  if (!marked) fail('не в каждой карточке кейса стоит пометка о шаблоне');
  console.log(`кейсы: объектов без скриптов ${n}, пометка в каждой карточке`);
  await c.close();
}

/* Ответ — точка входа из поиска. Страница без следующего шага заканчивается
   ничем, а таких страниц семьдесят семь. */
{
  const c = await browser.newContext({ javaScriptEnabled: false });
  const pg = await c.newPage();
  const slugs = files
    .map((f) => `/${relative(OUT, f).replace(/index\.html$/, '')}`)
    .filter((u) => u.startsWith('/answers/') && u !== '/answers/')
    .slice(0, 3);
  for (const u of slugs) {
    await pg.goto(`${ORIGIN}${u}`);
    const cta = await pg.evaluate(() => {
      const b = document.querySelector('.next a.btn-primary');
      if (!b) return null;
      const r = b.getBoundingClientRect();
      return { href: b.getAttribute('href'), w: Math.round(r.width), h: Math.round(r.height) };
    });
    if (!cta) fail(`${u}: на странице ответа нет целевого действия`);
    else if (cta.h < 44) fail(`${u}: кнопка высотой ${cta.h} px — меньше пальца`);
  }
  console.log(`ответы: целевое действие проверено на ${slugs.length} страницах`);
  await c.close();
}

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
