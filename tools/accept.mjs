/*
 * Приёмка прототипа: один прогон вместо шести разрозненных скриптов.
 *
 *   node tools/accept.mjs [путь-к-html]
 *
 * Требуется playwright и Chromium. В контейнере проекта:
 *   NODE_PATH=/opt/node22/lib/node_modules node tools/accept.mjs
 *
 * Скрипт лежит в репозитории намеренно. Раньше проверки жили во временной папке
 * сессии, то есть исчезали вместе с контейнером, и каждая следующая правка
 * проверялась заново написанным кодом. Здесь они переживают сессию.
 *
 * Выход: 0 — всё чисто, 1 — есть нарушения. Годится для CI.
 */
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';

/* playwright ищем сначала обычным способом, потом в глобальной установке.
   ESM не читает NODE_PATH, поэтому без этого скрипт работает только там,
   где рядом лежит node_modules. */
async function loadChromium() {
  const candidates = ['playwright', ...(process.env.NODE_PATH || '').split(':')
    .filter(Boolean).map((d) => `${d}/playwright/index.mjs`)
    .filter((f) => existsSync(f) || existsSync(f.replace('/index.mjs', ''))) ];
  for (const c of candidates) {
    try { return (await import(c.startsWith('/') ? pathToFileURL(c).href : c)).chromium; } catch (e) {}
  }
  console.error('playwright не найден. Установите его или укажите NODE_PATH к глобальным модулям.');
  process.exit(2);
}
const chromium = await loadChromium();

const FILE = process.argv[2] || 'tz-site/prototype/mimismart-v5.html';
const F = pathToFileURL(resolve(FILE)).href;
const EXEC = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium';

const problems = [];
const fail = (m) => problems.push(m);

const browser = await chromium.launch({ executablePath: EXEC });
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });

const errs = [];
page.on('pageerror', (e) => errs.push('PE: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push('CE: ' + m.text()); });

/* ---------- 1. Обход: собираем все маршруты по ссылкам ---------- */
const routes = new Set();
const queue = ['#/'];
while (queue.length) {
  const h = queue.shift();
  if (routes.has(h)) continue;
  routes.add(h);
  await page.goto(F + h);
  await page.waitForTimeout(100);
  /* мегаменю скрыто до наведения — раскрываем, иначе половина ссылок не видна обходу */
  await page.evaluate(() => document.querySelectorAll('.megamenu').forEach((m) => (m.hidden = false)));
  const links = await page.evaluate(() =>
    [...new Set([...document.querySelectorAll('a[href^="#/"]')].map((a) => a.getAttribute('href')))]);
  links.forEach((x) => { if (!routes.has(x)) queue.push(x); });
}

/* ---------- 2. Постраничные проверки ---------- */
const titles = new Map(), descs = new Map(), canons = new Map();
let broken = 0, skips = 0, badH1 = 0, noCrumbs = 0, soft404 = 0, rawTags = 0;

for (const h of routes) {
  await page.goto(F + h);
  await page.waitForTimeout(90);
  const d = await page.evaluate(() => {
    const vis = [...document.querySelectorAll('section.page')]
      .filter((m) => getComputedStyle(m).display !== 'none')[0];
    if (!vis) return { bad: 1 };
    const levels = [...vis.querySelectorAll('h1,h2,h3,h4')].map((e) => +e.tagName[1]);
    let sk = 0;
    for (let i = 1; i < levels.length; i++) if (levels[i] - levels[i - 1] > 1) sk++;
    let crumbs = 0;
    try { crumbs = JSON.parse(document.getElementById('ldBreadcrumb').textContent).itemListElement.length; } catch (e) {}
    return {
      bad: (!vis.querySelector('h1') || vis.innerText.length < 150) ? 1 : 0,
      sk, h1: vis.querySelectorAll('h1').length, crumbs,
      is404: vis.id === 'p-404' ? 1 : 0,
      title: document.title,
      desc: (document.querySelector('meta[name=description]') || {}).content || '',
      canon: (document.getElementById('canonicalLink') || {}).href || '',
      /* Видимые сырые теги. Ловит вставку размеченного текста через textContent —
         страница остаётся валидной, а пользователь читает <span class="...">. */
      raw: /<\/?(span|b|strong|em|a|p|div)\b[^>]*>/.test(vis.innerText) ? 1 : 0,
    };
  });
  if (d.bad) { broken++; fail(`пустая или битая страница: ${h}`); continue; }
  skips += d.sk;
  if (d.h1 !== 1) { badH1++; fail(`H1 на странице ${h}: ${d.h1}`); }
  if (!d.crumbs) { noCrumbs++; fail(`нет хлебных крошек: ${h}`); }
  if (d.is404) { soft404++; fail(`маршрут отдаёт 404: ${h}`); }
  if (d.raw) { rawTags++; fail(`видимые сырые теги в тексте: ${h}`); }
  if (!d.desc) fail(`пустой description: ${h}`);
  if (d.canon && !d.canon.endsWith(h) && h !== '#/') fail(`canonical не совпадает с адресом: ${h}`);
  for (const [map, val] of [[titles, d.title], [descs, d.desc], [canons, d.canon]]) {
    if (!map.has(val)) map.set(val, []);
    map.get(val).push(h);
  }
}
if (skips) fail(`пропусков уровней заголовков: ${skips}`);
for (const [name, map] of [['title', titles], ['description', descs], ['canonical', canons]]) {
  for (const [val, hs] of map) {
    if (hs.length > 1) fail(`один ${name} на ${hs.length} маршрутов (${hs.slice(0, 4).join(', ')}${hs.length > 4 ? ', …' : ''}): ${String(val).slice(0, 50)}`);
  }
}

console.log(`МАРШРУТЫ ${routes.size} | битых ${broken} | пропусков заголовков ${skips} | не-один-H1 ${badH1} | без крошек ${noCrumbs} | случайных 404 ${soft404} | сырых тегов ${rawTags}`);
console.log(`МЕТА уникальных: title ${titles.size} · description ${descs.size} · canonical ${canons.size} — из ${routes.size} маршрутов`);
if (errs.length) fail(`ошибок консоли: ${errs.length} — ${errs[0]}`);
console.log('ошибок консоли/страницы:', errs.length);

/* ---------- 3. Доступность по набору правил ---------- */
const A11Y_ROUTES = ['#/', '#/pricing', '#/answers', '#/compare', '#/contacts', '#/solutions/flat'];
for (const h of A11Y_ROUTES) {
  if (!routes.has(h)) continue;
  await page.goto(F + h);
  await page.waitForTimeout(120);
  const found = await page.evaluate(() => {
    const out = [];
    const vis = (e) => e.offsetParent !== null;
    [...document.querySelectorAll('img')].filter(vis).forEach((x) => {
      if (!x.hasAttribute('alt')) out.push('картинка без alt');
    });
    [...document.querySelectorAll('input,select,textarea')].filter(vis).forEach((x) => {
      const lab = x.id && document.querySelector(`label[for="${CSS.escape(x.id)}"]`);
      if (!lab && !x.closest('label') && !x.getAttribute('aria-label') && !x.getAttribute('aria-labelledby'))
        out.push('поле без метки');
    });
    const ids = {};
    document.querySelectorAll('[id]').forEach((e) => { ids[e.id] = (ids[e.id] || 0) + 1; });
    Object.entries(ids).filter(([, n]) => n > 1).forEach(([k]) => out.push('дубль id: ' + k));
    ['aria-labelledby', 'aria-controls', 'aria-describedby'].forEach((at) => {
      document.querySelectorAll('[' + at + ']').forEach((e) => {
        e.getAttribute(at).split(/\s+/).forEach((t) => {
          if (t && !document.getElementById(t)) out.push(at + ' в никуда: ' + t);
        });
      });
    });
    document.querySelectorAll('[tabindex]').forEach((e) => {
      if (+e.getAttribute('tabindex') > 0) out.push('tabindex>0 ломает естественный порядок');
    });
    document.querySelectorAll('ul,ol').forEach((l) => {
      [...l.children].forEach((c) => {
        if (!['LI', 'SCRIPT', 'TEMPLATE'].includes(c.tagName)) out.push('не-LI внутри списка: ' + c.tagName);
      });
    });
    /* Пустой шаблон таблицы, который заполняет JS, нарушением не является. */
    document.querySelectorAll('table').forEach((t) => {
      if (!t.querySelector('td,th')) return;
      if (!t.querySelector('th')) out.push('таблица без th');
    });
    return out;
  });
  found.forEach((f) => fail(`доступность ${h}: ${f}`));
}

/* ---------- 4. Контраст WCAG AA в обеих темах ---------- */
for (const mode of ['night', 'day']) {
  await page.goto(F);
  await page.waitForTimeout(500);
  if (mode === 'day') {
    const t = await page.$('#dnToggle');
    if (t) { await t.click(); await page.waitForTimeout(350); }
  }
  const bad = await page.evaluate(() => {
    const lum = (c) => {
      const [r, g, b] = c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const parse = (s) => {
      const m = String(s).match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/);
      return m ? { c: [+m[1], +m[2], +m[3]], a: m[4] === undefined ? 1 : +m[4] } : null;
    };
    /* Фон берём с реального предка, а не из константы: захардкоженный тёмный
       фон однажды дал три ложных нарушения на светлой теме. */
    const rootBg = parse(getComputedStyle(document.body).backgroundColor)
      || parse(getComputedStyle(document.documentElement).backgroundColor);
    const bgOf = (el) => {
      let e = el;
      while (e && e !== document.documentElement) {
        const st = getComputedStyle(e);
        const b = parse(st.backgroundColor);
        if (b && b.a > 0.5) return b.c;
        /* Фон градиентом: backgroundColor прозрачен, и обход уходит к фону
           страницы — так кнопка с оранжевым градиентом читалась как 1.13:1.
           Берём первый цвет градиента. */
        if (st.backgroundImage && st.backgroundImage !== 'none') {
          const g = parse(st.backgroundImage);
          /* Только непрозрачный градиент считается фоном. Полупрозрачная
             подложка поверх секции фоном не является — если её засчитать,
             светлый текст на тёмной секции читается как 1.00:1. */
          if (g && g.a > 0.5) return g.c;
        }
        e = e.parentElement;
      }
      return rootBg ? rootBg.c : [255, 255, 255];
    };
    const ratio = (f, b) => {
      const a = Math.max(lum(f), lum(b)), z = Math.min(lum(f), lum(b));
      return (a + 0.05) / (z + 0.05);
    };
    const out = [], seen = new Set();
    const sel = 'p, .prov, .kicker, .muted, .cut, .hint, .crumbs, .meta, .tag, .lede, .go, dd, dt, li, td, th, h1, h2, h3, h4, a';
    [...document.querySelectorAll(sel)].forEach((el) => {
      if (el.offsetParent === null || !el.textContent.trim()) return;
      const st = getComputedStyle(el);
      let fg = parse(st.color); if (!fg) return;
      /* Градиентная заливка текста: background-clip:text плюс прозрачная заливка.
         Тогда градиент — это цвет букв, а не фон, и мерить надо его против
         фона предка. Без этой ветки заголовок сравнивается сам с собой: 1.00:1. */
      const clipText = (st.webkitBackgroundClip || st.backgroundClip) === 'text';
      if (clipText) {
        const g = parse(st.backgroundImage);
        if (g) fg = g;
      }
      const size = parseFloat(st.fontSize), bold = +st.fontWeight >= 700;
      const large = size >= 24 || (size >= 18.66 && bold);
      const r = ratio(fg.c, bgOf(clipText ? el.parentElement : el));
      if (r < (large ? 3 : 4.5)) {
        const k = el.className + '|' + Math.round(r * 100);
        if (!seen.has(k)) { seen.add(k); out.push(`${el.tagName}.${el.className || '—'} ${r.toFixed(2)}:1`); }
      }
    });
    return out;
  });
  bad.forEach((x) => fail(`контраст (${mode}): ${x}`));
  console.log(`контраст ${mode}: нарушений ${bad.length}`);
}

/* ---------- 5. Горизонтальное переполнение ---------- */
for (const w of [360, 390, 768, 1024, 1440]) {
  await page.setViewportSize({ width: w, height: 900 });
  await page.goto(F);
  await page.waitForTimeout(200);
  const over = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  if (over) fail(`горизонтальное переполнение на ${w}px`);
}
await page.setViewportSize({ width: 1400, height: 1000 });

/* ---------- 6. Разметка: валидность и согласие с DOM ---------- */
await page.goto(F);
await page.waitForTimeout(600);
const ld = await page.evaluate(() => {
  const out = { types: [], faq: 0, cards: 0, invalid: [] };
  document.querySelectorAll('script[type="application/ld+json"]').forEach((e) => {
    try {
      const j = JSON.parse(e.textContent);
      out.types.push(e.id + ':' + (j['@type'] || '-'));
      if (j['@type'] === 'FAQPage') {
        out.faq = j.mainEntity.length;
        /* Прямой ответ обязан оставаться текстом: разметка внутри ответа означает,
           что развёрнутый блок утёк в то, что читает краулер. */
        j.mainEntity.forEach((q) => { if (/<[a-z]/i.test(q.acceptedAnswer.text)) out.invalid.push(q.name); });
      }
    } catch (x) { out.invalid.push('невалидный JSON-LD: ' + e.id); }
  });
  out.cards = document.querySelectorAll('.cluster .card h3').length;
  return out;
});
if (ld.invalid.length) ld.invalid.forEach((x) => fail('разметка: ' + x));
if (ld.faq !== ld.cards) fail(`разметка FAQPage (${ld.faq}) разошлась с карточками в DOM (${ld.cards})`);
console.log('JSON-LD:', ld.types.join(' '), `| FAQPage ${ld.faq} = карточек ${ld.cards}`);

/* ---------- 7. Что видит краулер без JavaScript ---------- */
const ctx = await browser.newContext({ javaScriptEnabled: false });
const nojs = await ctx.newPage();
await nojs.goto(F);
const noJsFaq = await nojs.evaluate(() => {
  try { return JSON.parse(document.getElementById('ldFaq').textContent).mainEntity.length; } catch (e) { return 0; }
});
if (noJsFaq !== ld.faq) fail(`без JS в разметке ${noJsFaq} ответов вместо ${ld.faq} — разметка собирается скриптом`);
console.log('без JavaScript: ответов в разметке', noJsFaq);
await ctx.close();

/* ---------- 8. Интерактив: то, что не видно в разметке ---------- */
{
  /* Поиск по ответам */
  await page.goto(F + '#/answers');
  await page.waitForTimeout(500);
  const input = await page.$('#leverSearch, input[type=search]');
  if (!input) fail('поле поиска по ответам не найдено');
  else {
    await input.fill('протечка');
    await page.waitForTimeout(400);
    const found = await page.evaluate(() =>
      [...document.querySelectorAll('.cluster .card')].filter((c) => c.offsetParent !== null).length);
    /* Запрос в единственном числе, в тексте — «протечки». Проверяем, что
       стеммер на месте: без него поиск отдавал ноль. */
    if (!found) fail('поиск «протечка» не находит ответов — сломан стеммер');
    await input.fill('');
    await page.waitForTimeout(300);
    const all = await page.evaluate(() =>
      [...document.querySelectorAll('.cluster .card')].filter((c) => c.offsetParent !== null).length);
    if (all !== 75) fail(`сброс поиска показывает ${all} ответов вместо 75`);
    console.log(`поиск: «протечка» → ${found}, сброс → ${all}`);
  }

  /* Калькулятор состава работ. Цену он называть не должен: методика не подтверждена. */
  await page.goto(F + '#/pricing');
  await page.waitForTimeout(400);
  const boxes = await page.$$('#calc input[type=checkbox]');
  if (!boxes.length) fail('калькулятор состава работ не найден');
  else {
    for (const c of boxes.slice(0, 3)) await c.check();
    await page.waitForTimeout(300);
    const r = await page.evaluate(() => {
      const c = document.getElementById('calc');
      return { len: c.innerText.trim().length, price: /\d[\d\s]{3,}\s*₽/.test(c.innerText) };
    });
    if (r.len < 200) fail('калькулятор не выдаёт состав работ');
    if (r.price) fail('калькулятор называет цену — методика не подтверждена, цифры быть не должно');
    console.log('калькулятор: состав выдан, цены нет');
  }

  /* Переключатель темы */
  await page.goto(F);
  await page.waitForTimeout(400);
  const before = await page.evaluate(() => document.documentElement.getAttribute('data-mode'));
  const toggle = await page.$('#dnToggle');
  if (!toggle) fail('переключатель темы не найден');
  else {
    await toggle.click();
    await page.waitForTimeout(350);
    const after = await page.evaluate(() => document.documentElement.getAttribute('data-mode'));
    if (before === after) fail('переключатель темы не меняет тему');
  }

  /* Аналитика не стартует без согласия — ст. 9 ФЗ-152 */
  await page.goto(F);
  await page.waitForTimeout(500);
  const gated = await page.evaluate(() => !window.__analyticsLoaded);
  if (!gated) fail('аналитика стартовала без согласия на cookie');

  /* Форма заявки: согласие обязательно, метка на месте, Esc закрывает */
  await page.goto(F + '#/contacts');
  await page.waitForTimeout(400);
  const opener = await page.$('[data-modal], .btn-primary');
  if (!opener) fail('на /contacts нет кнопки, открывающей форму');
  else {
    await opener.click();
    await page.waitForTimeout(450);
    const form = await page.evaluate(() => {
      const fm = document.querySelector('form.form');
      if (!fm || fm.offsetParent === null) return null;
      fm.querySelectorAll('input[required]').forEach((i) => {
        if (i.type !== 'checkbox') i.value = i.type === 'tel' ? '+79990000000' : 'тест';
      });
      const cb = fm.querySelector('#lead-consent');
      if (!cb) return { noConsent: true };
      cb.checked = false; const without = fm.checkValidity();
      cb.checked = true; const with_ = fm.checkValidity();
      return {
        without, with_, required: cb.required,
        label: !!document.querySelector('label[for=lead-consent]'),
        policy: /политик/i.test(fm.innerText),
      };
    });
    if (!form) fail('форма заявки не открылась');
    else if (form.noConsent) fail('в форме нет чекбокса согласия на обработку ПД');
    else {
      if (!form.required) fail('согласие на обработку ПД не обязательно');
      if (form.without) fail('форма отправляется без согласия на обработку ПД');
      if (!form.with_) fail('форма не проходит валидацию даже с согласием');
      if (!form.label) fail('у чекбокса согласия нет связанной метки');
      if (!form.policy) fail('в форме нет ссылки на политику обработки данных');
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
      const closed = await page.evaluate(() => {
        const fm = document.querySelector('form.form');
        return !fm || fm.offsetParent === null;
      });
      if (!closed) fail('Esc не закрывает форму заявки');
      console.log('форма заявки: согласие обязательно, метка и политика на месте, Esc закрывает');
    }
  }

  /* Интерактивная модель дома */
  await page.goto(F);
  await page.waitForTimeout(1000);
  const house = await page.evaluate(() => ({
    stage: !!document.getElementById('houseStage'),
    scenes: document.querySelectorAll('.scen-btn').length,
  }));
  if (!house.stage) fail('интерактивная модель дома отсутствует');
  if (house.scenes < 6) fail(`кнопок сценариев ${house.scenes}, ожидалось не меньше шести`);
  const reacts = await page.evaluate(async () => {
    const btns = [...document.querySelectorAll('.scen-btn')];
    if (btns.length < 3) return false;
    const snap = () => document.getElementById('houseStage').innerHTML.length;
    const a = snap();
    btns[2].click();
    await new Promise((r) => setTimeout(r, 700));
    return snap() !== a;
  });
  if (!reacts) fail('сценарий не меняет состояние модели дома');
  console.log(`модель дома: сценариев ${house.scenes}, реагирует на переключение`);
}

await browser.close();

if (problems.length) {
  console.log(`\n❌ НАРУШЕНИЙ: ${problems.length}`);
  problems.forEach((x) => console.log('  ·', x));
  process.exit(1);
}
console.log('\n✅ Нарушений нет.');
