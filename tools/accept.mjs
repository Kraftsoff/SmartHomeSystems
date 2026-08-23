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
import { existsSync, readFileSync } from 'node:fs';

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
/* В контейнере проекта Chromium лежит по фиксированному пути, в CI его ставит
   сам playwright. Если пути нет — не навязываем его, пусть решает playwright. */
const EXEC_CANDIDATE = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium';
const LAUNCH = existsSync(EXEC_CANDIDATE) ? { executablePath: EXEC_CANDIDATE } : {};

const problems = [];
const fail = (m) => problems.push(m);

const browser = await chromium.launch(LAUNCH);
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });

const errs = [];
page.on('pageerror', (e) => errs.push('PE: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push('CE: ' + m.text()); });

/* ---------- 1. Обход: собираем все маршруты по ссылкам ---------- */
const routes = new Set();
const inbound = new Map();
const queue = ['#/'];
while (queue.length) {
  const h = queue.shift();
  if (routes.has(h)) continue;
  routes.add(h);
  await page.goto(F + h);
  await page.waitForTimeout(100);
  /* мегаменю скрыто до наведения — раскрываем, иначе половина ссылок не видна обходу */
  await page.evaluate(() => document.querySelectorAll('.megamenu').forEach((m) => (m.hidden = false)));
  /* Считаем только ссылки внутри видимой страницы: сквозные меню и подвал есть
     везде и связность ими не измеряется. */
  const links = await page.evaluate(() => {
    const v = [...document.querySelectorAll('section.page')]
      .filter((s) => getComputedStyle(s).display !== 'none')[0];
    const all = [...new Set([...document.querySelectorAll('a[href^="#/"]')].map((a) => a.getAttribute('href')))];
    const inPage = v ? [...new Set([...v.querySelectorAll('a[href^="#/"]')].map((a) => a.getAttribute('href')))] : [];
    return { all, inPage };
  });
  links.inPage.forEach((x) => {
    if (!inbound.has(x)) inbound.set(x, new Set());
    inbound.get(x).add(h);
  });
  links.all.forEach((x) => { if (!routes.has(x)) queue.push(x); });
}
/* Страница, до которой ведёт один путь, весит меньше и теряется при обходе.
   Замерено: 21 ответ из 75 висел на одной ссылке из общего списка. */
{
  const lonely = [...routes].filter((h) => h.startsWith('#/answers/') && (inbound.get(h) || new Set()).size <= 1);
  lonely.forEach((h) => fail(`страница ответа с одной входящей ссылкой: ${h}`));
  const counts = [...routes].filter((h) => h.startsWith('#/answers/')).map((h) => (inbound.get(h) || new Set()).size);
  if (counts.length) {
    console.log(`перелинковка ответов: минимум входящих ${Math.min(...counts)}, максимум ${Math.max(...counts)}`);
  }
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
      /* Крошки нужны в двух видах: разметкой — поисковику, видимой строкой —
         человеку. Проверка читала только разметку, поэтому исчезновение видимой
         навигации проходило молча: переименование класса на всех шестнадцати
         страницах не давало ни одного отказа. */
      sk, h1: vis.querySelectorAll('h1').length, crumbs,
      crumbsVisible: [...vis.querySelectorAll('.crumbs')].filter((e) => e.offsetParent !== null
        && (e.textContent || '').trim().length > 3).length,
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
  if (!d.crumbs) { noCrumbs++; fail(`нет хлебных крошек в разметке: ${h}`); }
  /* На главной крошек нет и быть не должно: она сама корень пути. */
  if (h !== '#/' && !d.crumbsVisible) { noCrumbs++; fail(`нет видимых хлебных крошек: ${h}`); }
  if (d.is404) { soft404++; fail(`маршрут отдаёт 404: ${h}`); }
  if (d.raw) { rawTags++; fail(`видимые сырые теги в тексте: ${h}`); }
  if (!d.desc) fail(`пустой description: ${h}`);
  /* Длина меты по требованию из site-foundation/yandex-first.md. Исключение —
     страницы ответов: там заголовок и есть вопрос пользователя, и укоротить его
     значит потерять совпадение с запросом, ради которого страница существует. */
  else if (d.desc.length < 120 || d.desc.length > 160) fail(`description ${d.desc.length} знаков вместо 120–160: ${h}`);
  if (d.title.length > 60 && !h.startsWith('#/answers/')) fail(`title ${d.title.length} знаков вместо 60 и меньше: ${h}`);
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

/* robots.txt и решение по 410 расходятся молча. Путь, закрытый в robots, бот не
   запросит, значит не увидит 410, и адрес останется в индексе записью без содержимого.
   Проверки ссылок в llms.txt и pricing.md — ниже, в разделе 7h. */
{
  const { readFileSync: readRb } = await import('node:fs');
  const rb = existsSync(resolve('site-foundation/robots.txt')) ? readRb(resolve('site-foundation/robots.txt'), 'utf8') : '';
  const rd = existsSync(resolve('site-foundation/redirects.md')) ? readRb(resolve('site-foundation/redirects.md'), 'utf8') : '';
  if (rb && rd) {
    const at = rd.indexOf('Служебное / e-commerce');
    const gone = at < 0 ? [] : [...rd.slice(at, at + 400).matchAll(/`(\/[a-zA-Z][\w-]*)`/g)].map((m) => m[1]);
    const disallowed = new Set([...rb.matchAll(/^Disallow: (\S+)/gm)].map((m) => m[1]));
    const clash = gone.filter((g) => disallowed.has(g));
    clash.forEach((g) => fail(`${g} отдаёт 410, но закрыт в robots.txt — бот не увидит 410 и адрес останется в индексе`));
    console.log(`robots против 410: путей на удаление ${gone.length}, ошибочно закрыто ${clash.length}`);
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

/* ---------- 5b. Таблицы ответов на телефоне ---------- */
{
  await page.setViewportSize({ width: 360, height: 900 });
  await page.goto(F);
  await page.waitForTimeout(400);
  const first = await page.evaluate(() => {
    const a = document.querySelector('.cluster .card-link');
    return a && a.getAttribute('href');
  });
  /* Таблицы есть не только на страницах ответов: хабы и разборы сравнений тоже. */
  const tableRoutes = [first, '#/compare', '#/solutions', '#/functions', '#/compare/knx',
    '#/about', '#/equipment', '#/partners', '#/showroom'].filter(Boolean);
  let checked = 0, labelled = 0, cells = 0;
  for (const h of tableRoutes) {
    if (!routes.has(h)) continue;
    await page.goto(F + h);
    await page.waitForTimeout(320);
    const r = await page.evaluate(() => {
      const v = [...document.querySelectorAll('section.page')]
        .filter((s) => getComputedStyle(s).display !== 'none')[0];
      const ws = [...v.querySelectorAll('.tbl-wrap')];
      if (!ws.length) return null;
      /* Прокрутка вбок внутри блока прячет колонки и ничем себя не выдаёт:
         на узком экране строка должна разворачиваться в блок с подписями. */
      return {
        scrolls: ws.some((w) => w.scrollWidth > w.clientWidth + 1),
        labelled: v.querySelectorAll('tbody td[data-label]').length,
        cells: v.querySelectorAll('tbody td').length,
      };
    });
    if (!r) continue;
    checked++; labelled += r.labelled; cells += r.cells;
    if (r.scrolls) fail(`на 360px таблица прокручивается вбок, колонки не видны: ${h}`);
    if (r.cells && r.labelled < r.cells) fail(`${h}: ячеек без подписи колонки ${r.cells - r.labelled}`);
  }
  console.log(`таблицы на 360px: маршрутов ${checked}, без боковой прокрутки, подписей ${labelled}/${cells}`);
  await page.setViewportSize({ width: 1400, height: 1000 });
}

/* ---------- 5c. Оформление ячеек на широком экране ---------- */
{
  await page.setViewportSize({ width: 1400, height: 1000 });
  for (const h of ['#/about', '#/compare', '#/solutions', '#/functions', '#/equipment', '#/partners', '#/showroom']) {
    if (!routes.has(h)) continue;
    await page.goto(F + h);
    await page.waitForTimeout(280);
    const r = await page.evaluate(() => {
      const t = document.querySelector('section.page.on .tbl-wrap table');
      if (!t) return null;
      const td = t.querySelector('tbody td');
      if (!td) return null;
      const st = getComputedStyle(td);
      /* Правила ячеек были привязаны к контейнеру ответа, и таблицы на хабах
         оставались без отступов и линеек — строки наезжали друг на друга. */
      return { pad: parseFloat(st.paddingTop), line: parseFloat(st.borderBottomWidth) };
    });
    if (!r) continue;
    if (r.pad < 4) fail(`ячейки таблицы без отступов: ${h}`);
    if (!r.line) fail(`строки таблицы без разделителя: ${h}`);
  }
  console.log('оформление таблиц вне страниц ответов: отступы и линейки на месте');
}

/* ---------- 6. Разметка: валидность и согласие с DOM ---------- *//* ---------- 6. Разметка: валидность и согласие с DOM ---------- */
await page.goto(F);
await page.waitForTimeout(600);
const ld = await page.evaluate(() => {
  const out = { types: [], faq: 0, cards: 0, cardsClean: 0, invalid: [], marked: [] };
  document.querySelectorAll('script[type="application/ld+json"]').forEach((e) => {
    try {
      const j = JSON.parse(e.textContent);
      out.types.push(e.id + ':' + (j['@type'] || '-'));
      if (j['@type'] === 'FAQPage') {
        out.faq = j.mainEntity.length;
        /* Редакционная пометка не должна попасть в то, что забирает поисковик:
           машина процитирует «от 2–3 млн ₽ ⚠️ порог уточняется» как наш ответ. */
        j.mainEntity.forEach((q) => {
          /* Только знак: слова «уточняется», «заполнить» встречаются в обычной речи
             («уточняется на этапе проекта»), и по ним проверка краснела бы на
             нормальном тексте. Редакционная пометка всегда несёт ⚠. */
          if (/⚠/.test(q.acceptedAnswer.text)) out.marked.push(q.name);
        });
        /* Прямой ответ обязан оставаться текстом: разметка внутри ответа означает,
           что развёрнутый блок утёк в то, что читает краулер. */
        j.mainEntity.forEach((q) => { if (/<[a-z]/i.test(q.acceptedAnswer.text)) out.invalid.push(q.name); });
      }
    } catch (x) { out.invalid.push('невалидный JSON-LD: ' + e.id); }
  });
  out.cards = document.querySelectorAll('.cluster .card h3').length;
  out.cardsClean = [...document.querySelectorAll('.cluster .card')]
    .filter((c) => c.querySelector('h3') && c.querySelector('p') && !c.querySelector('p .prov')).length;
  return out;
});
if (ld.invalid.length) ld.invalid.forEach((x) => fail('разметка: ' + x));
/* Заглушка, опубликованная в структурированных данных, хуже отсутствующего поля:
   на странице её видно как ⚠️, а машина прочтёт её как факт. */
{
  const org = await page.evaluate(() => {
    try { return JSON.parse(document.getElementById('ldOrg').textContent); } catch (e) { return null; }
  });
  if (!org) fail('разметка Organization не парсится');
  else {
    for (const f of ['name', 'description', 'areaServed', 'knowsAbout']) {
      if (!org[f]) fail(`в разметке Organization нет поля ${f}`);
    }
  }
  const first = await page.evaluate(() => {
    const a = document.querySelector('.cluster .card-link');
    return a && a.getAttribute('href');
  });
  if (first) {
    await page.goto(F + first);
    await page.waitForTimeout(250);
    const art = await page.evaluate(() => {
      const e = document.getElementById('ldAnswer');
      if (!e) return null;
      try { return JSON.parse(e.textContent); } catch (x) { return 'bad'; }
    });
    if (art === 'bad') fail('разметка Article на странице ответа не парсится');
    else if (art) {
      if (art['@type'] !== 'Article') fail(`тип разметки ответа ${art['@type']}, ожидался Article`);
      if (!art.dateModified) fail('в разметке Article нет dateModified');
      const dump = JSON.stringify(art) + JSON.stringify(org || {});
      if (/⚠️|заполнить|уточня/i.test(dump)) fail('в структурированных данных осталась заглушка');
      console.log('структурированные данные: заглушек нет');
    }
    await page.goto(F);
    await page.waitForTimeout(200);
  }
}
/* Разметка — подмножество карточек по замыслу: ответ, у которого в прямой части
   стоит непроверенное, в FAQPage не идёт. Записи вернутся, когда факты подтвердят. */
if (ld.faq !== ld.cardsClean)
  fail(`разметка FAQPage (${ld.faq}) разошлась с карточками без пометок (${ld.cardsClean})`);
ld.marked.slice(0, 3).forEach((n) => fail(`в разметке FAQPage осталась пометка: «${String(n).slice(0, 60)}»`));
console.log('JSON-LD:', ld.types.join(' '),
  `| FAQPage ${ld.faq} = карточек без пометок ${ld.cardsClean} из ${ld.cards}`);

/* ---------- 7. Что видит краулер без JavaScript ---------- */
const ctx = await browser.newContext({ javaScriptEnabled: false });
const nojs = await ctx.newPage();
await nojs.goto(F);
const noJsFaq = await nojs.evaluate(() => {
  try { return JSON.parse(document.getElementById('ldFaq').textContent).mainEntity.length; } catch (e) { return 0; }
});
if (noJsFaq !== ld.faq) fail(`без JS в разметке ${noJsFaq} ответов вместо ${ld.faq} — разметка собирается скриптом`);
/* Что достаётся краулеру, который парсит сырой HTML, а не рендерит DOM — так
   работает большинство ИИ-ботов. Развёрнутая часть лежит в <template>: в сыром
   HTML она есть, в отрендеренном дереве её нет. Для прототипа это осознанный
   размен, для продакшена — пункт D7 в tz-site/16. */
const rawSrc = (await import('node:fs')).readFileSync(resolve(FILE), 'utf8');
const plainText = rawSrc
  .replace(/<script(?![^>]*application\/ld)[\s\S]*?<\/script>/g, ' ')
  .replace(/<style[\s\S]*?<\/style>/g, ' ')
  .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const inTpl = (rawSrc.match(/<template class="more">[\s\S]*?<\/template>/g) || []).join(' ')
  .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
if (plainText.length < 100000) fail(`в сыром HTML только ${plainText.length} знаков текста — краулеру нечего извлекать`);
console.log(`без JavaScript: ответов в разметке ${noJsFaq}; в сыром HTML ${plainText.length} знаков, из них ${inTpl.length} в <template>`);
await ctx.close();

/* ---------- 7b. Исходный HTML: то, что браузер молча чинит ---------- */
{
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(resolve(FILE), 'utf8');
  /* Ячейка, открытая как th и закрытая как td, парсером восстанавливается,
     поэтому в DOM её не видно — а в исходнике это ошибка разметки. */
  const mixed = src.match(/<th[^>]*>[^<]*<\/td>|<td[^>]*>[^<]*<\/th>/g);
  if (mixed) mixed.forEach((m) => fail(`несогласованная ячейка таблицы: ${m.slice(0, 70)}`));
  /* Незакрытые парные теги в блоках контента */
  for (const tag of ['table', 'thead', 'tbody', 'tr', 'dl', 'ol', 'ul']) {
    const open = (src.match(new RegExp(`<${tag}[\\s>]`, 'g')) || []).length;
    const close = (src.match(new RegExp(`</${tag}>`, 'g')) || []).length;
    if (open !== close) fail(`тег <${tag}>: открыт ${open} раз, закрыт ${close}`);
  }
  console.log('исходный HTML: парные теги сходятся, ячейки таблиц согласованы');
}

/* ---------- 7a. Масштаб 200% (WCAG 1.4.4) ---------- */
{
  /* 1280x1024 при двукратном увеличении — это 640x512 CSS-пикселей.
     Текст должен переверстаться, а не уехать в горизонтальную прокрутку. */
  const ctx = await browser.newContext({ viewport: { width: 640, height: 512 } });
  const z = await ctx.newPage();
  for (const h of ['#/', '#/answers', '#/pricing', '#/contacts']) {
    if (!routes.has(h)) continue;
    await z.goto(F + h);
    await z.waitForTimeout(280);
    const over = await z.evaluate(() =>
      document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    if (over) fail(`при масштабе 200% появляется горизонтальная прокрутка: ${h}`);
  }
  await ctx.close();
  console.log('масштаб 200%: горизонтальной прокрутки нет');
}

/* ---------- 7b. Размер целей нажатия (WCAG 2.5.8) ---------- */
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const t = await ctx.newPage();

  /* Блок шире экрана. Проверка переполнения страницы это пропускала: вылет
     прятался под overflow:hidden у предков, а на экране план дома молча терял
     правую треть — кухню, гостиную и гараж. Причина была в том, что элемент
     грида не сжимается уже своего содержимого, и нераскрывающийся inline-flex
     задавал колонке 444 px при экране 390. Меряем ключевые блоки напрямую. */
  await t.goto(F);
  await t.waitForTimeout(400);
  const wide = await t.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const out = [];
    for (const sel of ['.house-stage', '.house-wrap', '.shell', '.qualify', '.scen-row']) {
      document.querySelectorAll(sel).forEach((e) => {
        if (e.offsetParent === null) return;
        const w = e.getBoundingClientRect().width;
        if (w > vw + 1) out.push(`${sel} ${Math.round(w)}px при экране ${vw}px`);
      });
    }
    return out;
  });
  wide.forEach((w) => fail(`шире экрана телефона: ${w}`));

  /* Подписи кнопок не должны обрезаться. У кнопки в шапке overflow:hidden ради
     декоративного блика, поэтому обрезанный текст не даёт переполнения и выглядит
     просто как «ПРЕДВАРИТЕЛЬНЫЙ Р…». Меряем саму подпись, а не кнопку: блики за
     край заходят намеренно.
     Ширины взяты по месту поломки: на 360 не помещалась короткая подпись, на 1024
     меню занимает строку и не помещалась длинная. На 390 обе проходили, поэтому
     одной ширины для проверки мало. */
  for (const vw of [360, 390, 1024]) {
    const c2 = await browser.newContext({ viewport: { width: vw, height: 900 } });
    const t2 = await c2.newPage();
    await t2.goto(F);
    await t2.waitForTimeout(380);
    const cut = await t2.evaluate(() => {
      const out = [];
      document.querySelectorAll('button, a.btn').forEach((btn) => {
        if (btn.offsetParent === null) return;
        const box = btn.getBoundingClientRect();
        const cs = getComputedStyle(btn);
        const padL = parseFloat(cs.paddingLeft) || 0;
        const padR = parseFloat(cs.paddingRight) || 0;
        [...btn.querySelectorAll('span, b')].forEach((sp) => {
          /* Обёртку декоратора пропускаем: она содержит обе подписи, включая
             скрытую, и её прямоугольник охватывает обе. */
          if (sp.querySelector('span, b')) return;
          if (!(sp.textContent || '').trim()) return;
          if (getComputedStyle(sp).display === 'none') return;
          const r = sp.getBoundingClientRect();
          if (r.width < 1) return;
          if (r.left < box.left + padL - 1 || r.right > box.right - padR + 1) {
            out.push(`«${sp.textContent.trim().slice(0, 26)}»`);
          }
        });
      });
      return [...new Set(out)];
    });
    cut.forEach((c) => fail(`подпись кнопки обрезана при ширине ${vw}: ${c}`));

    /* Таблицы на узком экране разбираются в карточки: строка становится блоком,
       ячейка получает подпись своей колонки. Ширина первой колонки задана
       правилом с большей специфичностью и переживала этот разбор — заголовок
       строки оставался в 22%, то есть 53 px, с текстом в пять строк. */
    if (vw <= 560) {
      const squeezed = await t2.evaluate(async () => {
        const link = [...document.querySelectorAll('.cluster .card-link')]
          .find((a) => a.parentElement.querySelector('.more, template.more'));
        if (!link) return null;
        location.hash = link.getAttribute('href');
        await new Promise((r) => setTimeout(r, 350));
        const row = document.querySelector('#a-a table tbody tr');
        if (!row) return null;
        const rw = row.getBoundingClientRect().width;
        const narrow = [...row.children]
          .filter((c) => c.getBoundingClientRect().width < rw * 0.6)
          .map((c) => `${c.tagName.toLowerCase()} ${Math.round(c.getBoundingClientRect().width)}px из ${Math.round(rw)}`);
        return { narrow, unlabelled: [...row.querySelectorAll('td')].filter((d) => !d.getAttribute('data-label')).length };
      });
      if (squeezed && squeezed.narrow.length) {
        fail(`на узком экране ячейка таблицы не разложилась: ${squeezed.narrow[0]}`);
      }
      if (squeezed && squeezed.unlabelled) {
        fail(`ячеек без подписи колонки на узком экране: ${squeezed.unlabelled} — в карточке не видно, что это за столбец`);
      }
    }
    await c2.close();
  }

  console.log(wide.length ? 'ширина блоков на телефоне: нарушения ниже' : 'ширина блоков на телефоне: всё вписывается');

  for (const h of ['#/', '#/answers', '#/contacts', '#/pricing']) {
    if (!routes.has(h)) continue;
    await t.goto(F + h);
    await t.waitForTimeout(320);
    const small = await t.evaluate(() => {
      const out = [];
      const sel = 'a[href],button,input[type=checkbox],select';
      [...document.querySelectorAll('section.page.on ' + sel + ', header ' + sel)]
        .filter((e) => e.offsetParent !== null)
        .forEach((e) => {
          /* Цель — вся кликабельная область. У чекбокса с меткой нажимается
             метка целиком, поэтому мерить надо её, а не сам квадратик. */
          const lab = e.closest('label')
            || (e.id ? document.querySelector(`label[for="${CSS.escape(e.id)}"]`) : null);
          const target = lab && lab.contains(e) ? lab : (lab || e);
          const r = target.getBoundingClientRect();
          if (r.height < 1 || (r.height >= 24 && r.width >= 24)) return;
          /* Исключение «Inline» из критерия: ссылка внутри предложения или
             хлебных крошек ограничена межстрочным интервалом соседнего текста
             и под требование не подпадает. */
          if (target.closest('p,li,td,th,.crumbs,.lede,.answer')) return;
          out.push(`${target.tagName}.${(target.className || '-').toString().split(' ')[0]} ${Math.round(r.width)}x${Math.round(r.height)}`);
        });
      return [...new Set(out)];
    });
    small.forEach((x) => fail(`цель нажатия меньше 24px вне исключения (${h}): ${x}`));
  }
  await ctx.close();
  console.log('размер целей нажатия: вне исключения «в тексте» нарушений нет');
}

/* ---------- 7c. Клавиатура: фокус виден на каждом шаге ---------- */
{
  for (const h of ['#/', '#/answers']) {
    if (!routes.has(h)) continue;
    await page.goto(F + h);
    await page.waitForTimeout(450);
    const bad = [];
    for (let i = 0; i < 30; i++) {
      await page.keyboard.press('Tab');
      /* Пауза обязательна: без неё вычисленные стили читаются в том же кадре,
         что и нажатие, и отдают нули. Так однажды нашлись восемь несуществующих
         нарушений, которые я чуть не «починил». */
      await page.waitForTimeout(60);
      const r = await page.evaluate(() => {
        const e = document.activeElement;
        if (!e || e === document.body) return null;
        const st = getComputedStyle(e);
        const visible = (parseFloat(st.outlineWidth) > 0 && st.outlineStyle !== 'none')
          || (st.boxShadow && st.boxShadow !== 'none');
        return visible ? null : `${e.tagName}.${(e.className || '-').toString().slice(0, 24)}`;
      });
      if (r) bad.push(r);
    }
    [...new Set(bad)].forEach((x) => fail(`нет видимого фокуса при обходе Tab на ${h}: ${x}`));
  }
  console.log('клавиатура: фокус виден на каждом шаге обхода');
}

/* ---------- 7d. Уважение к настройке «уменьшить движение» ---------- */
{
  const ctx = await browser.newContext({ reducedMotion: 'reduce' });
  const q = await ctx.newPage();
  await q.goto(F);
  await q.waitForTimeout(700);
  const rm = await q.evaluate(() => {
    const el = document.querySelector('.reveal');
    if (!el) return null;
    const st = getComputedStyle(el);
    /* Контент, который проявляется анимацией, при отключённом движении обязан
       быть виден сразу, а не остаться прозрачным навсегда. */
    return { dur: st.transitionDuration, opacity: parseFloat(st.opacity) };
  });
  if (rm) {
    if (parseFloat(rm.dur) > 0.05) fail(`при reduced-motion переходы не отключены: ${rm.dur}`);
    if (rm.opacity < 0.99) fail(`при reduced-motion контент остаётся полупрозрачным: ${rm.opacity}`);
    /* Модель дома сама пролистывает сценарии. Для человека с чувствительностью к
       движению это худшее, что может делать страница: движение без его участия.
       Отключение переходов этого не покрывает — автопрокрутка живёт на таймере. */
    /* Страницу надо открыть сразу в этом режиме: прототип читает настройку один
       раз при загрузке, и включение её после уже не останавливает запущенный
       таймер — проверка тогда падала на исправном коде. */
    const ctxRM = await browser.newContext({ viewport: { width: 1400, height: 1000 }, reducedMotion: 'reduce' });
    const pRM = await ctxRM.newPage();
    await pRM.goto(F, { waitUntil: 'load' });
    await pRM.waitForTimeout(1200);
    const auto = await pRM.evaluate(async () => {
      const idx = () => [...document.querySelectorAll('.scen-btn')].findIndex((b) => b.classList.contains('on'));
      const before = idx();
      await new Promise((r) => setTimeout(r, 4500));
      return { before, after: idx() };
    });
    await ctxRM.close();
    if (auto.before !== auto.after) {
      fail(`при reduced-motion модель дома сама меняет сценарии (${auto.before} → ${auto.after})`);
    }
    console.log(`reduced-motion: переходы ${rm.dur}, контент виден`);
  }
  await ctx.close();
}

/* ---------- 7e. Дублирование текста между страницами ---------- */
{
  /* Один и тот же ответ в трёх местах делит вес и заставляет ИИ-поиск выбирать
     между копиями. Раз уже случалось: три ответа стояли дословно на главной,
     в списке и на своей странице. */
  const seen = new Map();
  const check = [...routes].filter((h) => !h.startsWith('#/answers/')).slice(0, 30);
  for (const h of check) {
    await page.goto(F + h);
    await page.waitForTimeout(90);
    const sentences = await page.evaluate(() => {
      const v = [...document.querySelectorAll('section.page')]
        .filter((s) => getComputedStyle(s).display !== 'none')[0];
      if (!v) return [];
      /* Берём только прозу и только вне ссылок: заголовки карточек «Ответы по
         теме» повторяются по построению — это навигация, а не текст. Карточки
         кейсов на главной — тизер того же блока, тоже не дубль контента. */
      const nodes = [...v.querySelectorAll('p, li, dd, blockquote')]
        .filter((e) => !e.closest('a[href]') && !e.closest('.case') && e.offsetParent !== null);
      return nodes
        .flatMap((e) => e.innerText.split(/(?<=[.!?])\s+/))
        .map((x) => x.trim().replace(/\s+/g, ' '))
        .filter((x) => x.length > 90);
    });
    for (const s of sentences) {
      if (!seen.has(s)) seen.set(s, []);
      seen.get(s).push(h);
    }
  }
  const dups = [...seen.entries()].filter(([, hs]) => new Set(hs).size > 1);
  dups.slice(0, 5).forEach(([sent, hs]) => {
    fail(`одно предложение дословно на ${new Set(hs).size} страницах (${[...new Set(hs)].slice(0, 3).join(', ')}): «${sent.slice(0, 60)}…»`);
  });
  console.log(`дублирование текста: проверено маршрутов ${check.length}, повторов ${dups.length}`);
}

/* ---------- Выгрузка содержимого не устарела ---------- */
{
  /* content-export.json — то, что переносится на боевой стек. Файл производный,
     и устаревает молча: правку в прототипе легко забыть выгрузить. Сверяем состав
     и тексты, а не только количество. */
  const { readFileSync: readEx } = await import('node:fs');
  if (existsSync(resolve('site-foundation/content-export.json'))) {
    const ex = JSON.parse(readEx(resolve('site-foundation/content-export.json'), 'utf8'));
    const live = new Map();
    for (const h of [...routes].filter((x) => x.startsWith('#/answers/'))) {
      await page.goto(F + h);
      await page.waitForTimeout(30);
      const t = await page.evaluate(() => {
        const p = document.querySelector('#a-a p');
        return p ? p.innerText.replace(/\s+/g, ' ').trim() : '';
      });
      live.set(h.replace('#', ''), t);
    }
    const missing = [...live.keys()].filter((u) => !ex.answers.some((a) => a.url === u));
    const extra = ex.answers.map((a) => a.url).filter((u) => !live.has(u));
    const changed = ex.answers.filter((a) => live.has(a.url) && live.get(a.url) !== a.answer);
    missing.slice(0, 3).forEach((u) => fail(`выгрузка устарела: ответа ${u} в ней нет`));
    extra.slice(0, 3).forEach((u) => fail(`выгрузка устарела: ${u} есть в ней, но не на сайте`));
    changed.slice(0, 3).forEach((a) => fail(`выгрузка устарела: текст ${a.url} расходится с сайтом`));
    console.log(`выгрузка содержимого: ответов ${ex.answers.length}, расхождений ${missing.length + extra.length + changed.length}`);
  }
}

/* ---------- Текст ссылается на то, чего на странице нет ---------- */
{
  /* Нашлось так: два ответа обещали «демо на этой странице», а интерактивная модель
     дома стоит только на главной. Обещание, которое читатель опровергает одним
     взглядом, дороже технической ошибки. Ложных срабатываний на текущем сайте нет,
     поэтому проверка блокирующая — в отличие от tools/hint-list-counts.mjs. */
  const REFS = [
    [String.raw`таблиц\w*\s+(ниже|выше|рядом)`, 'table'],
    [String.raw`списк\w*\s+(ниже|выше)`, 'ol,ul'],
    [String.raw`(калькулятор|расч[её]т)\w*\s+(на этой странице|ниже|здесь)`, '#calc'],
    [String.raw`форм\w+\s+(ниже|на этой странице|здесь)`, 'form'],
    [String.raw`(демо|модел\w+)(\s+[а-яё]+){0,2}\s+(на этой странице|здесь)`, '#houseStage'],
  ];
  let broken = 0;
  for (const h of [...routes]) {
    await page.goto(F + h);
    await page.waitForTimeout(35);
    const bad = await page.evaluate((refs) => {
      const v = [...document.querySelectorAll('section.page')].find((s) => getComputedStyle(s).display !== 'none');
      if (!v) return [];
      const out = [];
      for (const [src, sel] of refs) {
        const m = v.innerText.match(new RegExp(src, 'i'));
        if (!m) continue;
        const scope = sel.startsWith('#') ? document : v;
        if (![...scope.querySelectorAll(sel)].some((e) => e.offsetParent !== null)) out.push({ m: m[0], sel });
      }
      return out;
    }, REFS);
    for (const x of bad) { broken++; fail(`${h}: текст обещает «${x.m}», но ${x.sel} на странице нет`); }
  }
  console.log(`ссылки текста на элементы страницы: проверено ${routes.size} маршрутов, несуществующих ${broken}`);
}

/* ---------- Повторы между страницами ответов ---------- */
{
  /* Проверка выше исключает #/answers/ и это обосновано: прямой ответ по построению
     стоит и на странице списка, и на своей странице — так и задумано, он же уходит
     в разметку FAQPage. Замерено: из 10–18 предложений страницы ответа в списке
     присутствуют 3–5, остальное уникально.
     Но отсюда следует пробел: дубль между двумя РАЗНЫМИ ответами не ловит никто,
     а такие уже находились вручную дважды. Здесь сравниваем ответы между собой,
     предварительно выбросив всё, что есть на странице списка. */
  await page.goto(F + '#/answers');
  await page.waitForTimeout(200);
  const byLine = new Map();
  for (const h of [...routes].filter((x) => x.startsWith('#/answers/'))) {
    await page.goto(F + h);
    await page.waitForTimeout(35);
    const sents = await page.evaluate(() => {
      const v = [...document.querySelectorAll('section.page')].find((x) => getComputedStyle(x).display !== 'none');
      if (!v) return [];
      return [...v.querySelectorAll('p, li, td, th')]
        .filter((e) => !e.closest('a[href]') && e.offsetParent !== null)
        .flatMap((e) => e.innerText.split(/(?<=[.!?])\s+/))
        .map((x) => x.trim().replace(/\s+/g, ' '))
        .filter((x) => x.length > 80);
    });
    for (const x of sents) {
      /* Исключения по странице списка здесь не было нужно, а вреда оно давало
         много: на списке лежит каждый прямой ответ, поэтому дословный дубль
         прямого ответа между двумя страницами проверка не видела никогда.
         Сам список в сравнение не входит — сравниваются только /answers/*, —
         так что свой ответ встречается ровно один раз и без исключения. */
      if (!byLine.has(x)) byLine.set(x, new Set());
      byLine.get(x).add(h);
    }
  }
  const repeats = [...byLine.entries()].filter(([, hs]) => hs.size > 1);
  repeats.slice(0, 5).forEach(([sent, hs]) =>
    fail(`одно предложение на ${hs.size} страницах ответов (${[...hs].slice(0, 3).join(', ')}): «${sent.slice(0, 60)}…»`));
  /* Вопрос «да/нет» должен получать «да» или «нет» первым словом. Уход в
     обстоятельства читается как отказ отвечать — и человеком, и машиной,
     которая ищет прямой ответ в начале. Два ответа разъехались после правок,
     и без проверки это было незаметно. */
  {
    const yn = await page.evaluate(() => {
      const d = JSON.parse(document.getElementById('ldFaq').textContent).mainEntity;
      const re = /^(можно ли|нужно ли|стоит ли|есть ли|будет ли|придётся ли|смогу ли|смогут ли|обязательно ли|правда ли|реально ли|работает ли|нужен ли|остан[уе]тся ли|получится ли|возможно ли|окупается ли|проводится ли)/i;
      const bad = [];
      for (const e of d) {
        if (!re.test(e.name.trim())) continue;
        const first = e.acceptedAnswer.text.trim().split(/[\s,—:]/)[0].toLowerCase().replace(/[.,]/g, '');
        if (first !== 'да' && first !== 'нет') bad.push(e.name);
      }
      return { всего: d.filter((e) => re.test(e.name.trim())).length, плохих: bad };
    });
    if (yn.плохих.length) fail(`вопрос «да/нет» без прямого ответа первым словом: ${yn.плохих[0]}`);
    console.log(`прямые ответы на «да/нет»: ${yn.всего} вопросов, уходов ${yn.плохих.length}`);
    /* Число у кластера читатель видит рядом с его названием. Оно правится руками
       при добавлении ответа и разъезжается молча: список обещает восемь, внутри
       девять. Поиск подменяет это число на количество найденного и возвращает
       обратно, поэтому меряем без активного запроса. */
    await page.goto(F + '#/answers');
    await page.waitForTimeout(400);
    const clusters = await page.evaluate(() => {
      const out = [];
      document.querySelectorAll('.cluster').forEach((cl) => {
        const n = cl.querySelector('.cluster-n');
        const h = cl.querySelector('.cluster-h');
        if (!n || !h) return;
        out.push({
          имя: h.firstChild.textContent.trim(),
          заявлено: Number(n.textContent.trim()),
          карточек: cl.querySelectorAll('.card').length,
        });
      });
      return out;
    });
    const drift = clusters.filter((c) => c.заявлено !== c.карточек);
    if (drift.length) {
      fail(`число у кластера расходится с составом: «${drift[0].имя}» обещает ${drift[0].заявлено}, внутри ${drift[0].карточек}`);
    }
    console.log(`числа у кластеров: ${clusters.length} кластеров, расхождений ${drift.length}`);
  }

  console.log(`повторы между ответами: сравнено ${[...routes].filter((x) => x.startsWith('#/answers/')).length}, повторов ${repeats.length}`);
}

/* ---------- Близкие копии страниц ---------- */
{
  /* Проверка выше ловит дословный повтор предложения. Она не видит страницу,
     пересказанную своими словами, — а для ИИ-поиска это тот же отказ: вес делится,
     и машине приходится выбирать между двумя версиями одного ответа.
     Считаем пересечение по четырёхсловным окнам (мера Жаккара).
     Порог 0.35 взят с запасом: измеренный максимум по сайту — 0.18, и это
     тематически близкие разделы, а не копии. Клонировать узел при сборе текста
     нельзя: у открепленной копии нет стилей, и innerText соберёт все страницы сразу. */
  const texts = new Map();
  for (const h of [...routes]) {
    await page.goto(F + h);
    await page.waitForTimeout(35);
    const t = await page.evaluate(() => {
      const v = [...document.querySelectorAll('section.page')].find((s) => getComputedStyle(s).display !== 'none');
      if (!v) return '';
      let txt = v.innerText;
      for (const sel of ['.crumbs', '#a-related', '#a-rel-h']) {
        const e = v.querySelector(sel);
        if (e && e.innerText) txt = txt.split(e.innerText).join(' ');
      }
      return txt.replace(/\s+/g, ' ').trim();
    });
    if (t.length > 400) texts.set(h, t);
  }
  const shingle = (t) => {
    const w = t.toLowerCase().replace(/[^а-яёa-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
    const set = new Set();
    for (let i = 0; i + 4 <= w.length; i++) set.add(w.slice(i, i + 4).join(' '));
    return set;
  };
  const sets = new Map([...texts].map(([k, v]) => [k, shingle(v)]));
  const keys = [...sets.keys()];
  let worst = 0, worstPair = '';
  const near = [];
  for (let i = 0; i < keys.length; i++) {
    for (let j = i + 1; j < keys.length; j++) {
      const a = sets.get(keys[i]), c = sets.get(keys[j]);
      if (a.size < 25 || c.size < 25) continue;
      let inter = 0;
      for (const x of a) if (c.has(x)) inter++;
      const jac = inter / (a.size + c.size - inter);
      if (jac > worst) { worst = jac; worstPair = `${keys[i]} ↔ ${keys[j]}`; }
      if (jac > 0.35) near.push([jac, keys[i], keys[j]]);
    }
  }
  near.slice(0, 5).forEach(([jac, a, c]) =>
    fail(`страницы совпадают на ${Math.round(jac * 100)}%: ${a} и ${c} — вес делится между копиями`));
  console.log(`близкие копии: сравнено маршрутов ${keys.length}, максимум сходства ${Math.round(worst * 100)}% (${worstPair}), выше порога ${near.length}`);
}

/* ---------- 7f. Карта сайта против реализованных маршрутов ---------- */
{
  /* Карта сайта — то, как поисковик узнаёт о страницах. Разъезд в любую сторону
     стоит дорого: маршрут не в карте не находят, строка без маршрута ведёт в 404.
     Один раз 75 страниц ответов отсутствовали в карте целиком. */
  const { readFileSync: readSm } = await import('node:fs');
  let sm = '';
  /* Комментарии вырезаем: в них лежат примеры разметки для ещё не построенных
     разделов, и без этого в подсчёт попадают несуществующие URL. */
  try { sm = readSm(resolve('site-foundation/sitemap.xml'), 'utf8').replace(/<!--[\s\S]*?-->/g, ''); } catch (e) {}
  if (sm) {
    const inSitemap = new Set([...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].replace('BASE_URL', '')));
    const implemented = [...routes].map((h) => h.slice(1));
    /* Исключений быть не должно: карта содержит только то, что отдаёт 200.
       /blog был здесь, пока карта его рекламировала; строку из карты убрали. */
    const PLANNED = new Set();
    const missingFromSitemap = implemented.filter((r) => !inSitemap.has(r));
    const missingFromSite = [...inSitemap].filter((r) => !implemented.includes(r) && !PLANNED.has(r));
    missingFromSitemap.slice(0, 6).forEach((r) => fail(`маршрут есть, в sitemap.xml его нет: ${r}`));
    missingFromSite.slice(0, 6).forEach((r) => fail(`в sitemap.xml есть, маршрута нет: ${r}`));
    console.log(`sitemap: строк ${inSitemap.size}, маршрутов ${implemented.length}, расхождений ${missingFromSitemap.length + missingFromSite.length}`);
  }
}

/* ---------- 7g. robots.txt: персональные группы не открывают служебное ---------- */
{
  /* Бот исполняет только свою группу; правила из «User-agent: *» не наследуются,
     а заменяются. Персональный блок с одним «Allow: /» открывает боту /admin и
     /settings — ровно это и было в файле. */
  const { readFileSync: readRb } = await import('node:fs');
  let rb = '';
  try { rb = readRb(resolve('site-foundation/robots.txt'), 'utf8'); } catch (e) {}
  if (rb) {
    const groups = [...rb.matchAll(/User-agent:\s*(\S+)\n((?:(?:Allow|Disallow):.*\n)+)/g)];
    const service = [...(rb.match(/^Disallow: (\S+)$/gm) || [])]
      .map((l) => l.split(':')[1].trim()).filter((x) => x !== '/');
    const need = [...new Set(service)];
    let open = 0;
    for (const [, ua, body] of groups) {
      const closedAll = /Disallow:\s*\/\s*$/m.test(body) && !/Allow:/.test(body);
      if (closedAll) continue;
      const have = new Set((body.match(/Disallow:\s*(\S+)/g) || []).map((l) => l.split(':')[1].trim()));
      const missing = need.filter((x) => !have.has(x));
      if (missing.length) { open++; fail(`robots.txt: группа ${ua} открывает служебное — ${missing.join(', ')}`); }
    }
    /* YandexBot закрывать нельзя: Алиса берёт кандидатов из обычной выдачи Яндекса. */
    const yandex = groups.find(([, ua]) => ua === 'YandexBot');
    if (!yandex) fail('robots.txt: нет группы YandexBot');
    /* Раньше проверка молчала, если в группе была любая строка Allow — а она там
       есть всегда («Allow: /»). То есть закрыть бота строкой «Disallow: /» можно
       было незаметно для гейта: мутационный прогон это и показал. Смотрим корневой
       запрет и корневое разрешение отдельно; при обоих сразу правила равной длины,
       и поведение краулеров расходится — это тоже повод сказать вслух. */
    else {
      const rootDisallow = /^\s*Disallow:\s*\/\s*$/m.test(yandex[2]);
      const rootAllow = /^\s*Allow:\s*\/\s*$/m.test(yandex[2]);
      if (rootDisallow && !rootAllow) fail('robots.txt: YandexBot закрыт — Алиса берёт кандидатов из обычной выдачи Яндекса');
      if (rootDisallow && rootAllow) fail('robots.txt: у YandexBot одновременно Allow: / и Disallow: / — краулеры разрешают такой конфликт по-разному');
    }
    console.log(`robots.txt: групп ${groups.length}, служебных путей ${need.length}, групп с утечкой ${open}`);
  }
}

/* ---------- 7h. Ссылки в llms.txt и pricing.md ведут на существующие маршруты ---------- */
{
  /* Эти файлы читают агенты и краулеры, а проверить их обходом сайта нельзя:
     они лежат в корне и на них ничто не ссылается. В llms.txt стояли пути
     старого сайта — /smart-home, /climate, /curtains-light, — то есть каждая
     ссылка вела в 404. */
  const { readFileSync: readTxt } = await import('node:fs');
  const FILES_OK = new Set(['/pricing.md', '/sitemap.xml', '/llms.txt', '/robots.txt']);
  let smRaw = '';
  try { smRaw = readTxt(resolve('site-foundation/sitemap.xml'), 'utf8'); } catch (e) {}
  const known = new Set([...smRaw.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].replace('BASE_URL', '')));
  for (const name of ['llms.txt', 'pricing.md']) {
    let body = '';
    try { body = readTxt(resolve('site-foundation/' + name), 'utf8'); } catch (e) { continue; }
    const links = [...new Set([...body.matchAll(/\]\((\/[^)]*)\)/g)].map((m) => m[1]))];
    const bare = [...new Set((body.match(/(?<=\s)\/[a-z0-9/-]{2,}/g) || []))];
    const all = [...new Set([...links, ...bare])];
    const broken = all.filter((l) => !known.has(l) && !FILES_OK.has(l));
    broken.forEach((l) => fail(`${name}: ссылка на несуществующий маршрут ${l}`));
    console.log(`${name}: ссылок ${all.length}, вне карты сайта ${broken.length}`);
  }
}

/* ---------- 7i. Цели редиректов существуют ---------- */
{
  /* Редирект на несуществующую страницу хуже отсутствующего: он тратит вес и
     отдаёт посетителю 404 вместо старой страницы, которая хотя бы работала. */
  const { readFileSync: readRd } = await import('node:fs');
  let rd = '';
  try { rd = readRd(resolve('site-foundation/redirects.md'), 'utf8'); } catch (e) {}
  if (rd) {
    let smRaw2 = '';
    try { smRaw2 = readRd(resolve('site-foundation/sitemap.xml'), 'utf8'); } catch (e) {}
    const known2 = new Set([...smRaw2.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].replace('BASE_URL', '')));
    const dests = [...new Set([...rd.matchAll(/destination: '([^']+)'/g)].map((m) => m[1]))];
    const broken = dests.filter((d) => !known2.has(d));
    broken.forEach((d) => fail(`редирект ведёт на несуществующую страницу: ${d}`));
    console.log(`редиректы: уникальных целей ${dests.length}, вне карты сайта ${broken.length}`);
  }
}

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
    /* «протечка» саму по себе текст содержит семь раз, поэтому отключённый
       стеммер эту проверку переживал. «протечкам» не встречается ни разу, а её
       основа — постоянно: находки по этой форме бывают только при нормализации. */
    await input.fill('протечкам');
    await page.waitForTimeout(400);
    const stemmed = await page.evaluate(() =>
      [...document.querySelectorAll('.cluster .card')].filter((c) => c.offsetParent !== null).length);
    if (!stemmed) fail('поиск «протечкам» не находит ничего — форма слова не приводится к основе');
    await input.fill('протечка');
    await page.waitForTimeout(250);
    /* Термины, которые встречаются только в развёрнутой части. Она лежит в
       <template>, её текста нет в DOM карточки — и поиск переставал их видеть. */
    for (const term of ['рекуператор', 'нейтраль', 'SIP', 'арендатор']) {
      await input.fill(term);
      await page.waitForTimeout(280);
      const n = await page.evaluate(() =>
        [...document.querySelectorAll('.cluster .card')].filter((c) => c.offsetParent !== null).length);
      if (!n) fail(`поиск не находит «${term}» — развёрнутая часть выпала из индекса`);
    }
    /* Совпадение внутри слова — не совпадение. Простой indexOf находил «елка»
       внутри «переделка» и открывал ответ, не имеющий к запросу отношения.
       Набор по мере ввода при этом обязан работать: «протеч» → «протечки». */
    const midWord = {};
    for (const term of ['елка', 'ереде', 'онтроллер']) {
      await input.fill(term);
      await page.waitForTimeout(260);
      midWord[term] = await page.evaluate(() =>
        [...document.querySelectorAll('.cluster .card')].filter((c) => c.offsetParent !== null).length);
      if (midWord[term]) fail(`поиск «${term}» находит ${midWord[term]} — совпадение внутри слова, а не с начала`);
    }
    for (const term of ['протеч', 'гарант', 'кабел']) {
      await input.fill(term);
      await page.waitForTimeout(260);
      const n = await page.evaluate(() =>
        [...document.querySelectorAll('.cluster .card')].filter((c) => c.offsetParent !== null).length);
      if (!n) fail(`поиск не находит по началу слова «${term}» — набор по мере ввода сломан`);
    }
    await input.fill('');
    await page.waitForTimeout(300);
    const all = await page.evaluate(() =>
      [...document.querySelectorAll('.cluster .card')].filter((c) => c.offsetParent !== null).length);
    /* Число не зашиваем: ответы добавляются, и константа устареет молча. */
    if (all !== ld.cards) fail(`сброс поиска показывает ${all} ответов вместо ${ld.cards}`);
    /* Кнопка очистки должна быть одна. У поля type="search" браузер рисует свою,
       и рядом с нашей их оказывалось две: браузерная без подписи, скринридеру не
       видна и мимо нашего сброса фильтра. */
    const clr = await page.evaluate(async () => {
      const inp = document.querySelector('#q, input[type=search], .searchbar input');
      if (!inp) return null;
      /* Кнопка очистки появляется только при непустом запросе — вводим его здесь,
         иначе проверка идёт после сброса и не находит ни одной. */
      inp.value = 'протечка';
      inp.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise((r) => setTimeout(r, 250));
      const ib = inp.getBoundingClientRect();
      const own = [...inp.parentElement.querySelectorAll('button')]
        .filter((b) => b.offsetParent !== null && b.getBoundingClientRect().right <= ib.right + 2);
      /* Браузерную кнопку из теневого дерева querySelectorAll не видит, поэтому
         посчитать её нельзя — проверяем наличие правила, которое её убирает. */
      let подавлена = false;
      for (const sh of document.styleSheets) {
        try {
          for (const r of sh.cssRules) {
            if (r.selectorText && /search-cancel-button/.test(r.selectorText)
              && /none/.test(r.style.cssText)) подавлена = true;
          }
        } catch (e) { /* чужой лист */ }
      }
      const out = {
        подавлена,
        своих: own.length,
        безПодписи: own.filter((b) => !(b.getAttribute('aria-label') || b.textContent.trim())).length,
      };
      inp.value = '';
      inp.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise((r) => setTimeout(r, 150));
      return out;
    });
    if (clr && clr.своих !== 1) fail(`кнопок очистки поиска: ${clr.своих} вместо одной`);
    if (clr && clr.безПодписи) fail(`кнопка очистки поиска без подписи: ${clr.безПодписи}`);
    if (clr && !clr.подавлена) fail('браузерная кнопка очистки не подавлена — в поле их будет две');
    console.log(`поиск: «протечка» → ${found}, обрывки внутри слов → 0, сброс → ${all}, кнопка очистки одна и подписана`);
  }

  /* Калькулятор состава работ. Цену он называть не должен: методика не подтверждена. */
  await page.goto(F + '#/pricing');
  await page.waitForTimeout(400);
  const boxes = await page.$$('#calc input[type=checkbox]');
  if (!boxes.length) fail('калькулятор состава работ не найден');
  else {
    /* Одно состояние ничего не доказывает: цена могла бы появляться только при
       большой площади или на конкретной стадии. Перебираем сочетания полей и
       ищем не только «N ₽», но и «тыс», «млн», «от N» — вилку тоже называть нельзя. */
    const r = await page.evaluate(async () => {
      const c = document.getElementById('calc');
      const sels = [...c.querySelectorAll('select')];
      const chks = [...c.querySelectorAll('input[type=checkbox]')];
      const area = c.querySelector('#cArea,[name=cArea]');
      const out = c.querySelector('[id*=out],[class*=out],[class*=result]');
      /* Прежний шаблон требовал трёх знаков после первой цифры и опирался на \b
         перед «от» — в JavaScript граница слова кириллицу не видит, так что эта
         ветка не срабатывала вовсе. Проверено: «от 2,5 млн ₽», «от 2 млн» и
         «цена 12,1 млн» проходили насквозь, хотя порог в документах проекта
         записан именно так. Теперь: число с любым разделителем разрядов и
         дробной частью, за которым идёт денежная единица. */
      const money = /\d[\d\s\u00a0\u202f]*(?:[.,]\d+)?\s*(?:₽|руб|тыс|млн|миллион|тысяч)/i;
      const patterns = [() => false, () => true, (i) => i % 2 === 0];
      const tick = () => new Promise((res) => setTimeout(res, 0));
      let tried = 0, maxLen = 0;
      const bad = [];
      for (const a of ['0', '40', '150', '1200', '99999']) {
        if (area) { area.value = a; area.dispatchEvent(new Event('input', { bubbles: true })); area.dispatchEvent(new Event('change', { bubbles: true })); }
        for (let i0 = 0; i0 < (sels[0] ? sels[0].options.length : 1); i0++)
          for (let i1 = 0; i1 < (sels[1] ? sels[1].options.length : 1); i1++)
            for (let pi = 0; pi < patterns.length; pi++) {
              if (sels[0]) sels[0].selectedIndex = i0;
              if (sels[1]) sels[1].selectedIndex = i1;
              sels.forEach((x) => x.dispatchEvent(new Event('change', { bubbles: true })));
              chks.forEach((x, i) => { x.checked = patterns[pi](i); x.dispatchEvent(new Event('change', { bubbles: true })); });
              await tick();
              const node = out || c;
              /* Вывод содержит опубликованный порог «от 2–3 млн ₽» с пометкой
                 ⚠️ — это позиция компании, а не расчёт. Запрещено другое: число,
                 выданное как результат ввода и не помеченное. Поэтому вырезаем
                 всё помеченное и требуем, чтобы в остатке денег не было. */
              const marked = [...node.querySelectorAll('.prov')];
              let t = node.innerText;
              for (const mk of marked) {
                const line = (mk.closest('p,li,div,td,h4') || mk).innerText;
                if (line) t = t.split(line).join(' ');
              }
              tried++;
              maxLen = Math.max(maxLen, node.innerText.trim().length);
              const mm = t.match(money);
              if (mm) bad.push(a + '/' + i0 + '/' + i1 + ': …' + t.replace(/\s+/g, ' ').slice(Math.max(0, mm.index - 60), mm.index + 60));
            }
      }
      return { tried, maxLen, bad: bad.slice(0, 3), badCount: bad.length };
    });
    if (r.maxLen < 200) fail(`калькулятор ни в одном состоянии не выдаёт состав работ (максимум ${r.maxLen} знаков)`);
    if (r.badCount) fail(`калькулятор называет непомеченную цену в ${r.badCount} состояниях из ${r.tried}: ${r.bad[0]}`);
    console.log(r.badCount || r.maxLen < 200
      ? `калькулятор: перебрано ${r.tried} состояний, нарушения перечислены ниже`
      : `калькулятор: перебрано ${r.tried} состояний, состав выдан, непомеченных цен нет`);
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

  /* Одной первой загрузки мало: РКН прямо не считает согласием формулу
     «продолжая пользоваться сайтом». Проверяем два случая, в которых
     согласие могло бы «появиться» само. */
  for (const h of ['#/pricing', '#/answers', '#/contacts']) {
    await page.goto(F + h);
    await page.waitForTimeout(200);
  }
  if (await page.evaluate(() => !!window.__analyticsLoaded))
    fail('аналитика включилась просто от переходов по сайту — это не согласие (ст. 9 ФЗ-152)');

  /* Явный отказ: аналитика не стартует и решение переживает переход. */
  const deny = await page.$('text=Только необходимые');
  if (deny) {
    await page.goto(F);
    await page.waitForTimeout(300);
    const d2 = await page.$('text=Только необходимые');
    if (d2) {
      await d2.click();
      await page.waitForTimeout(250);
      await page.goto(F + '#/pricing');
      await page.waitForTimeout(300);
      const st = await page.evaluate(() => ({
        loaded: !!window.__analyticsLoaded,
        stored: Object.keys(localStorage).some((k) => /consent/i.test(k)),
      }));
      if (st.loaded) fail('аналитика стартовала после явного отказа');
      if (!st.stored) fail('отказ от аналитики не сохранён — баннер спросит снова и решение потеряется');
      /* Наличие ключа с подходящим именем ничего не доказывает: запись под другим
         ключом проверку переживала. Решение считается сохранённым тогда, когда
         после перезагрузки баннер больше не спрашивает. */
      await page.goto(F);
      await page.waitForTimeout(350);
      /* Именно видимость: узел баннера остаётся в дереве и после ответа, поэтому
         поиск по тексту находит его всегда и проверка была бы всегда красной. */
      const asksAgain = await page.evaluate(() => {
        const el = [...document.querySelectorAll('*')]
          .find((e) => /Только необходимые/.test(e.textContent || '') && !e.children.length);
        const box = el ? el.closest('div,section,aside') : null;
        if (!box) return false;
        const cs = getComputedStyle(box);
        return box.offsetParent !== null && cs.visibility !== 'hidden' && cs.opacity !== '0';
      });
      if (asksAgain) fail('после отказа баннер спрашивает снова — решение не восстановлено');
      console.log('согласие на аналитику: без ответа не стартует, отказ сохраняется и переживает переход');
    }
  }

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
      /* Ловушка фокуса и его возврат. Без первого клавиатурный пользователь
         уходит табом за окно и заполняет форму вслепую; без второго теряет
         место, откуда пришёл. Ломается от любой правки разметки окна. */
      await page.goto(F + '#/contacts');
      await page.waitForTimeout(400);
      const op2 = await page.$('[data-form]');
      if (op2) {
        await op2.focus();
        await page.keyboard.press('Enter');
        await page.waitForTimeout(350);
        const opened = await page.evaluate(() => {
          const m = document.querySelector('.modal.open');
          return m ? {
            фокусВнутри: m.contains(document.activeElement),
            диалог: m.getAttribute('role') === 'dialog',
            подписан: !!(m.getAttribute('aria-label') || m.getAttribute('aria-labelledby')),
          } : null;
        });
        if (opened) {
          if (!opened.фокусВнутри) fail('при открытии формы фокус остаётся за окном');
          if (!opened.диалог) fail('окно формы не объявлено диалогом');
          if (!opened.подписан) fail('у окна формы нет подписи для скринридера');
          /* Обойти надо все элементы окна и ещё несколько сверху: в форме два
             десятка полей, и двадцати нажатий не хватало, чтобы дойти до края —
             фокус оставался внутри сам по себе, и снятая ловушка не замечалась. */
          const cnt = await page.evaluate(() => {
            const m = document.querySelector('.modal.open');
            return m ? m.querySelectorAll('a[href],button,input,select,textarea,[tabindex]').length : 0;
          });
          let escaped = 0;
          for (let i = 0; i < cnt + 4; i += 1) {
            await page.keyboard.press('Tab');
            const out = await page.evaluate(() => {
              const m = document.querySelector('.modal.open');
              return m ? !m.contains(document.activeElement) : true;
            });
            if (out) escaped += 1;
          }
          if (escaped) fail(`фокус уходит за пределы формы: ${escaped} раз за полный обход`);
          await page.keyboard.press('Escape');
          await page.waitForTimeout(300);
          const back = await page.evaluate(() => document.activeElement.hasAttribute
            && document.activeElement.hasAttribute('data-form'));
          if (!back) fail('после закрытия формы фокус не вернулся на кнопку, которая её открыла');
          console.log('форма: фокус заперт в окне, при закрытии возвращается на кнопку');
        }
      }
      /* WCAG 1.3.5: у полей с личными данными должно быть объявлено назначение —
     иначе браузер и вспомогательные технологии не могут подставить и распознать
     имя и телефон. Уровень AA, тот же, что сайт держит по остальным критериям. */
  const purpose = await page.evaluate(() => {
    const form = document.querySelector('#leadForm') || document.querySelector('form');
    if (!form) return null;
    const need = { text: 'имя', tel: 'телефон', email: 'почта' };
    const out = [];
    [...form.querySelectorAll('input')].forEach((e) => {
      if (!e.required) return;
      if (e.type === 'checkbox') return;
      if (!e.getAttribute('autocomplete')) out.push(need[e.type] || e.type);
    });
    return out;
  });
  if (purpose && purpose.length) {
    fail(`у обязательных полей не объявлено назначение (WCAG 1.3.5): ${purpose.join(', ')}`);
  }
  console.log('форма заявки: согласие обязательно, метка и политика на месте, Esc закрывает, назначение полей объявлено');
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
  /* Дальше идут проверки, которым нужна сама модель. Без защиты пропавший
     дом ронял прогон исключением на первом же обращении, и всё, что стоит
     после него, не выполнялось вовсе: одно нарушение прятало остальные. */
  const reacts = await page.evaluate(async () => {
    const st = document.getElementById('houseStage');
    if (!st) return true;                     /* об отсутствии уже сказано выше */
    const btns = [...document.querySelectorAll('.scen-btn')];
    if (btns.length < 3) return false;
    const snap = () => st.innerHTML.length;
    const a = snap();
    btns[2].click();
    await new Promise((r) => setTimeout(r, 700));
    return snap() !== a;
  });
  if (!reacts) fail('сценарий не меняет состояние модели дома');
  /* Текст называет, что делает сценарий. Проверяем по факту: «Жара за окном»
     обещала включать увлажнение, а увлажнение в модели было включено и до неё —
     сценарий его не трогает. Такое расхождение не видно ничем, кроме сверки
     обещания с измеренным поведением. */
  {
    /* Перед замером возвращаем страницу в исходное состояние: проверки выше уже
       кликали по сценариям, и «до» приходило с выключенным отоплением — тогда
       условие сравнивало не то и срабатывало на исправном тексте. */
    await page.goto(F);
    await page.waitForTimeout(900);
    const heat = await page.evaluate(async () => {
      const st = document.getElementById('houseStage');
      if (!st) return null;
      const snap = () => [...st.querySelectorAll('*')].map((e) => (e.className || '').toString()).join('|');
      const before = snap();
      const btn = [...document.querySelectorAll('.scen-btn')].find((b) => /Жара/i.test(b.textContent));
      if (!btn) return null;
      btn.click();
      await new Promise((r) => setTimeout(r, 700));
      const after = snap();
      return {
        отоплениеСнято: /is-heating/.test(before) && !/is-heating/.test(after),
        вентиляцияПоявилась: !/is-vent/.test(before) && /is-vent/.test(after),
        увлажнениеПоявилось: !/is-mist/.test(before) && /is-mist/.test(after),
        шторыЗакрылись: !/is-closed/.test(before) && /is-closed/.test(after),
      };
    });
    if (heat) {
      /* Фраза живёт в развёрнутых блоках, а они лежат в <template> и на главной
         не отрисованы: чтение innerText давало пустую строку, и проверка молча
         пропускала всё. Берём из разметки документа. */
      const claim = await page.evaluate(() => {
        const m = document.documentElement.innerHTML.match(/«Жара за окном»[^.<]{0,200}\./);
        return m ? m[0] : '';
      });
      if (claim) {
        if (/увлажнени/i.test(claim) && !heat.увлажнениеПоявилось) {
          fail('текст обещает, что «Жара за окном» включает увлажнение, а сценарий его не меняет');
        }
        if (/вентиляц/i.test(claim) && !heat.вентиляцияПоявилась) {
          fail('текст обещает вентиляцию в сценарии «Жара за окном», а она не включается');
        }
        if (/отоплени/i.test(claim) && !heat.отоплениеСнято) {
          fail('текст обещает отключение отопления в сценарии «Жара за окном», а оно остаётся');
        }
      }
      console.log('обещания о сценарии «Жара за окном» сверены с его поведением');
    }
  }
  /* Активный сценарий отмечен заливкой кнопки. Для скринридера цвет — не состояние,
     поэтому оно должно дублироваться в aria-pressed, и ровно на одной кнопке. */
  const scn = await page.evaluate(() => {
    const bs = [...document.querySelectorAll('.scen-btn')];
    const row = bs[0] && bs[0].parentElement;
    return {
      всего: bs.length,
      сPressed: bs.filter((b) => b.hasAttribute('aria-pressed')).length,
      нажатых: bs.filter((b) => b.getAttribute('aria-pressed') === 'true').length,
      сКлассом: bs.filter((b) => b.classList.contains('on')).length,
      совпадает: bs.every((b) => (b.getAttribute('aria-pressed') === 'true') === b.classList.contains('on')),
      подписьГруппы: row ? (row.getAttribute('aria-label') || '') : '',
    };
  });
  if (scn.сPressed !== scn.всего) fail(`кнопки сценариев без aria-pressed: ${scn.всего - scn.сPressed} из ${scn.всего} — активный сценарий передаётся только цветом`);
  if (scn.нажатых !== 1) fail(`нажатых кнопок сценария ${scn.нажатых}, должна быть ровно одна`);
  if (!scn.совпадает) fail('aria-pressed разошёлся с классом .on — состояние в разметке не то, что видно глазом');
  if (!scn.подписьГруппы) fail('ряд кнопок сценариев без подписи группы — читается как восемь несвязанных кнопок');
  /* Следы под курсором. Проверяем не «есть ли механика», а виден ли результат:
     после двух уменьшений подряд отпечаток стал пятном в 9 px, которое вдобавок
     всегда показывалось в середине угасания — на экране это читалось как полное
     отсутствие следов, хотя элементы исправно создавались. */
  {
    const st2 = await page.$('.house-stage');
    /* Если модели нет или она не отрисована, об этом уже сказано выше. Здесь
       выходим молча: раньше ожидание видимости валило прогон целиком, и одно
       нарушение прятало все остальные. */
    const bb = st2 ? await st2.boundingBox().catch(() => null) : null;
    if (bb) {
    await st2.scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);
    /* Что проверяем: следы появляются под курсором и свежий след виден полностью.
       После двух уменьшений подряд отпечаток стал пятном в 9 px и вдобавок гас с
       первого же кадра — на экране это читалось как их полное отсутствие, хотя
       элементы исправно создавались.
       Считаем созданные, а не живые: след живёт 1,4 с, и при накладных расходах
       браузера до конца прохода доживают единицы независимо от исправности.
       Проходим три полосы и берём лучшую — какая свободна, зависит от расстановки
       мебели, и привязка к одной ловила бы план, а не регрессию. */
    await page.evaluate(() => {
      const st = document.querySelector('.house-stage');
      window.__fpMade = 0; window.__fpFresh = 0;
      const orig = st.appendChild.bind(st);
      st.appendChild = function (n) {
        const res = orig(n);
        if (n.className === 'footprint') {
          window.__fpMade += 1;
          /* Держится ли след в полную силу перед угасанием. Прозрачность в момент
             вставки читать бесполезно — переход ещё не начался и она всегда 1;
             смотрим саму задержку, из-за отсутствия которой след был виден только
             в середине перехода и читался как грязное пятно. */
          const cs = getComputedStyle(n);
          window.__fpDelay = parseFloat(cs.transitionDelay) || 0;
          window.__fpW = n.getBoundingClientRect().width;
        }
        return res;
      };
    });
    let best = { всего: 0, задержка: 0, ширина: 0 };
    for (const band of [0.3, 0.45, 0.6]) {
      await page.mouse.move(bb.x - 40, bb.y - 40);   // уход со сцены сбрасывает жителя
      await page.waitForTimeout(120);
      await page.evaluate(() => { window.__fpMade = 0; window.__fpFresh = 0; });
      await page.mouse.move(bb.x + 50, bb.y + bb.height * band);
      await page.waitForTimeout(140);
      for (let i = 1; i <= 12; i += 1) {
        await page.mouse.move(bb.x + 50 + i * 14, bb.y + bb.height * band);
        await page.waitForTimeout(95);
      }
      const got = await page.evaluate(() => ({ всего: window.__fpMade, задержка: window.__fpDelay || 0, ширина: window.__fpW || 0 }));
      if (got.всего > best.всего) best = got;
    }
    const fp = best;
    if (fp.всего < 3) fail(`следы под курсором почти не появляются: лучшая полоса дала ${fp.всего} за 12 шагов`);
    if (fp.задержка < 0.15) fail(`след гаснет сразу (задержка ${fp.задержка}s): он виден только в середине перехода и читается как пятно`);
    if (fp.ширина < 7) fail(`след шириной ${fp.ширина}px — на плане его не различить`);
    console.log(`следы под курсором: лучшая полоса ${fp.всего} за 12 шагов, ширина ${fp.ширина}px, держится ${fp.задержка}s`);
    }
  }

  console.log(`модель дома: сценариев ${house.scenes}, реагирует на переключение; состояние кнопок объявляемо (${scn.нажатых} из ${scn.всего})`);
}

/* ---------- 9. Целостность разметки: то, что браузер молча чинит ----------
   Дубли id и ссылки на несуществующие id браузер не показывает как ошибку — он
   просто берёт первый элемент или игнорирует связь. В одностраничнике на 17 страниц
   это ловится только проверкой. Отдельно проверяется содержимое <template>: в DOM
   его нет, а на странице ответа оно становится живой разметкой. */
{
  const page9 = await browser.newPage();
  await page9.goto(F, { waitUntil: 'load' });
  await page9.waitForTimeout(400);
  const v = await page9.evaluate(() => {
    const counts = {};
    document.querySelectorAll('[id]').forEach((e) => { counts[e.id] = (counts[e.id] || 0) + 1; });
    const dupIds = Object.keys(counts).filter((k) => counts[k] > 1);

    const dangling = new Set();
    document.querySelectorAll('label[for]').forEach((e) => {
      if (!document.getElementById(e.getAttribute('for'))) dangling.add('label for="' + e.getAttribute('for') + '"');
    });
    ['aria-labelledby', 'aria-describedby', 'aria-controls'].forEach((attr) => {
      document.querySelectorAll('[' + attr + ']').forEach((e) => {
        (e.getAttribute(attr) || '').split(/\s+/).forEach((id) => {
          if (id && !document.getElementById(id)) dangling.add(attr + '="' + id + '"');
        });
      });
    });

    /* Разворачиваем каждый развёрнутый блок и проверяем его как настоящую разметку */
    const box = document.createElement('div');
    let blocks = 0;
    document.querySelectorAll('template.more, .more').forEach((t) => {
      blocks++;
      /* Клонируем узлы, а не пересобираем из строки. insertAdjacentHTML разбирал
         разметку заново, и разбор разносит вложенные <a> и <p> по соседним узлам —
         проверка уничтожала ровно тот дефект, который ищет, и не могла упасть
         никогда. Проверено: вложенность, созданная через DOM, до неё не доходила. */
      box.appendChild(t.content ? t.content.cloneNode(true) : t.cloneNode(true));
    });
    document.body.appendChild(box);
    const routes = new Set([...document.querySelectorAll('.cluster .card-link')].map((a) => a.getAttribute('href')));
    const broken = [...box.querySelectorAll('a[href^="#/answers/"]')]
      .map((a) => a.getAttribute('href')).filter((h) => !routes.has(h));
    const tablesNoTh = [...box.querySelectorAll('table')].filter((t) => !t.querySelector('th')).length;
    const badListChild = [...box.querySelectorAll('ul,ol')]
      .reduce((n, l) => n + [...l.children].filter((c) => c.tagName !== 'LI').length, 0);
    /* Заголовок блока идёт под h1 вопроса, поэтому допустим только h2 */
    const wrongLevel = [...box.querySelectorAll('h1,h3,h4,h5,h6')].length;
    const nestedP = box.querySelectorAll('p p').length;
    const nestedA = box.querySelectorAll('a a').length;
    box.remove();
    const svgБезИмени = [...document.querySelectorAll('svg')].filter((g) =>
      !g.closest('[aria-hidden="true"]') && !g.hasAttribute('aria-hidden')
      && !g.hasAttribute('role') && !g.querySelector('title') && !g.getAttribute('aria-label')).length;
    const imgБезAlt = [...document.querySelectorAll('img')].filter((i) => !i.hasAttribute('alt')).length;
    return { dupIds, dangling: [...dangling], blocks, broken, tablesNoTh, badListChild, wrongLevel, nestedP, nestedA,
             svgБезИмени, imgБезAlt, lang: document.documentElement.lang || '' };
  });
  if (v.dupIds.length) fail(`дубли id: ${v.dupIds.slice(0, 8).join(', ')}`);
  if (v.dangling.length) fail(`ссылка на несуществующий id: ${v.dangling.slice(0, 6).join(', ')}`);
  if (v.broken.length) fail(`ссылка из развёрнутого блока ведёт в никуда: ${v.broken.slice(0, 5).join(', ')}`);
  if (v.tablesNoTh) fail(`таблиц без подписи колонок в развёрнутых блоках: ${v.tablesNoTh}`);
  if (v.badListChild) fail(`не-LI внутри списка в развёрнутых блоках: ${v.badListChild}`);
  if (v.wrongLevel) fail(`заголовок не h2 в развёрнутом блоке: ${v.wrongLevel} — под h1 вопроса пропуск уровня`);
  if (v.nestedP) fail(`<p> внутри <p> в развёрнутых блоках: ${v.nestedP}`);
  if (v.nestedA) fail(`<a> внутри <a> в развёрнутых блоках: ${v.nestedA}`);
  if (v.lang !== 'ru') fail(`язык документа «${v.lang}» вместо ru`);
  /* Декоративная графика без имени: скринридер объявит её как безымянный объект
     поверх текста, который то же самое уже говорит. Либо имя, либо aria-hidden. */
  if (v.svgБезИмени) fail(`SVG без имени и без aria-hidden: ${v.svgБезИмени}`);
  if (v.imgБезAlt) fail(`изображений без атрибута alt: ${v.imgБезAlt}`);
  const clean9 = !v.dupIds.length && !v.dangling.length && !v.broken.length && !v.tablesNoTh
    && !v.badListChild && !v.wrongLevel && !v.nestedP && !v.nestedA && v.lang === 'ru'
    && !v.svgБезИмени && !v.imgБезAlt;
  console.log(clean9
    ? `целостность разметки: ${v.blocks} развёрнутых блоков, id уникальны, ссылок в никуда нет`
    : `целостность разметки: проверено ${v.blocks} блоков, нарушения перечислены ниже`);
  await page9.close();
}

/* ---------- 10. Тема: выбор пользователя и системная настройка ----------
   Тумблер стартовал жёстко с ночи: выбор терялся при перезагрузке, а человек со
   светлой темой в системе получал тёмный сайт. Проверяем оба пути и то, что при
   запрещённом хранилище страница не падает — доступ к localStorage бросает
   исключение в приватном окне, а не возвращает null. */
{
  const mode = async (ctxOpts, steps) => {
    const c = await browser.newContext(ctxOpts);
    const pg = await c.newPage();
    const errs = [];
    pg.on('pageerror', (e) => errs.push(String(e).slice(0, 80)));
    if (steps && steps.blockStorage) {
      await pg.addInitScript(() => {
        Object.defineProperty(window, 'localStorage', { get() { throw new Error('заблокировано'); } });
      });
    }
    await pg.goto(F, { waitUntil: 'load' });
    await pg.waitForTimeout(500);
    let out = { start: await pg.evaluate(() => document.documentElement.getAttribute('data-mode')), errs };
    if (steps && steps.toggleAndReload) {
      await pg.click('#dnToggle');
      await pg.waitForTimeout(250);
      out.afterClick = await pg.evaluate(() => document.documentElement.getAttribute('data-mode'));
      await pg.reload({ waitUntil: 'load' });
      await pg.waitForTimeout(500);
      out.afterReload = await pg.evaluate(() => document.documentElement.getAttribute('data-mode'));
    }
    await c.close();
    return out;
  };
  const light = await mode({ colorScheme: 'light' });
  if (light.start !== 'day') fail(`при светлой теме системы сайт открывается в «${light.start}» — системная настройка игнорируется`);
  const dark = await mode({ colorScheme: 'dark' });
  if (dark.start !== 'night') fail(`при тёмной теме системы сайт открывается в «${dark.start}»`);
  const kept = await mode({ colorScheme: 'dark' }, { toggleAndReload: true });
  if (kept.afterReload !== kept.afterClick) fail(`выбор темы не переживает перезагрузку: выбрано «${kept.afterClick}», после перезагрузки «${kept.afterReload}»`);
  const blocked = await mode({ colorScheme: 'light' }, { blockStorage: true });
  if (blocked.errs.length) fail(`при запрещённом хранилище страница падает: ${blocked.errs[0]}`);
  if (!blocked.start) fail('при запрещённом хранилище тема не выставлена');
  const themeOk = light.start === 'day' && dark.start === 'night'
    && kept.afterReload === kept.afterClick && !blocked.errs.length && !!blocked.start;
  console.log(themeOk
    ? `тема: система светлая → ${light.start}, тёмная → ${dark.start}; выбор переживает перезагрузку; при запрете хранилища ошибок нет`
    : `тема: проверено четыре случая, нарушения перечислены ниже`);
}

/* ---------- 11. Числа в тексте и имя раздела ----------
   На главной висело «60 вопросов», когда их было 77, а в пустом состоянии поиска — «75».
   Числа теперь вычисляются, и проверка следит, что они не разъехались. Раздел
   назывался то «Ответы», то «Статьи»: для читателя это два разных места, для
   машины — два имени одной сущности. */
{
  const pg = await browser.newPage();
  await pg.goto(F + '#/answers', { waitUntil: 'load' });
  await pg.waitForTimeout(700);
  const t = await pg.evaluate(() => {
    const cards = document.querySelectorAll('#p-news .cluster .card').length;
    const names = new Set();
    document.querySelectorAll('a[href="#/answers"]').forEach((a) => {
      const s = (a.textContent || '').replace(/[←→\s]+/g, ' ').trim();
      if (s && s.length < 40) names.add(s.replace(/^Все /i, '').toLowerCase());
    });
    const crumb = document.querySelector('#p-news .crumbs');
    return {
      cards,
      наГлавной: (document.getElementById('answersCount') || {}).textContent || '',
      вПустом: (document.getElementById('qresetCount') || {}).textContent || '',
      имена: [...names],
      крошка: crumb ? crumb.textContent.replace(/\s+/g, ' ').trim() : '',
      осталосьСтатьи: /Стать[ияей]/.test([...document.querySelectorAll('section.page')].map((x) => x.textContent).join(' ')),
      числаВТексте: (() => {
        const out = [];
        /* \w в JavaScript не покрывает кириллицу — нужен явный диапазон,
           иначе «статей-рычагов» не совпадёт и число проедет мимо проверки. */
        const re = /(\d{2,3})\s+(вопрос[а-яё]*|ответ[а-яё]*|стат[а-яё]*-рычаг[а-яё]*|рычаг[а-яё]*)/gi;
        let m;
        /* textContent всех страниц, а не innerText видимой: числа стоят на разных
           маршрутах, и проверка на одной странице их просто не видит. */
        const text = [...document.querySelectorAll('section.page')]
          .map((x) => x.textContent).join(' ').replace(/\s+/g, ' ');
        while ((m = re.exec(text))) out.push([m[0], m[1]]);
        return out;
      })(),
    };
  });
  if (String(t.cards) !== t.наГлавной) fail(`на главной «${t.наГлавной}» ответов вместо ${t.cards}`);
  if (String(t.cards) !== t.вПустом) fail(`в пустом состоянии поиска «${t.вПустом}» вместо ${t.cards}`);
  /* Проверка по id ловит только те два числа, что мы сделали вычисляемыми. Любое
     другое количество, вписанное строкой, устареет так же молча — ищем их в тексте. */
  for (const [frag, num] of t.числаВТексте) {
    if (Number(num) !== t.cards) fail(`в тексте «${frag}», а ответов ${t.cards}`);
  }
  if (t.имена.length > 1) fail(`раздел ответов назван по-разному: ${t.имена.join(' / ')}`);
  if (t.осталосьСтатьи) fail('на странице осталось слово «Статьи» — раздел должен называться одинаково везде');
  console.log(`числа и имя раздела: ${t.cards} ответов везде, раздел «${t.имена[0] || '—'}», крошка «${t.крошка}»`);
  await pg.close();
}

/* ---------- 12. Пометки о непроверенном ----------
   Пустая пометка бесполезна дважды: читателю не сказано, чему не верить, а клиенту —
   что заполнять. Отдельно следим, чтобы значок не ставили как типографский символ:
   класс .prov исключает ответ из разметки FAQPage, и декоративное употребление
   молча выкинуло бы верный ответ. */
{
  const pg = await browser.newPage();
  await pg.goto(F, { waitUntil: 'load' });
  await pg.waitForTimeout(500);
  const pr = await pg.evaluate(() => {
    const all = [...document.querySelectorAll('.prov')];
    const clean = (e) => (e.textContent || '').replace(/[\u26a0\ufe0f\s]/g, '');
    const empty = all.filter((e) => !clean(e)).length;
    const short = all.filter((e) => clean(e) && clean(e).length < 6)
      .map((e) => e.textContent.trim().slice(0, 40));
    /* Пометка должна быть привязана к факту. Первая версия правила требовала, чтобы
       она не была единственным содержимым родителя, — и поймала восемь законных
       случаев: ячейки таблиц, где смысл задаёт заголовок строки, и абзацы после
       подписи «Телефон». Правило сужено до настоящего сиротства: пометка одна
       в родителе, слева ничего нет и это не ячейка таблицы. */
    const alone = all.filter((e) => {
      const p = e.parentElement;
      if (!p || p.children.length !== 1) return false;
      if ((p.textContent || '').trim() !== (e.textContent || '').trim()) return false;
      if (/^(td|th)$/i.test(p.tagName)) return false;
      return !p.previousElementSibling;
    }).length;
    return { всего: all.length, пустых: empty, слишкомКороткие: short, отдельноСтоящих: alone };
  });
  if (pr.пустых) fail(`пометок ⚠️ без пояснения: ${pr.пустых} — не сказано, что именно не подтверждено`);
  if (pr.слишкомКороткие.length) fail(`пометки без внятного текста: ${pr.слишкомКороткие.join(', ')}`);
  if (pr.отдельноСтоящих) fail(`пометок, стоящих отдельным абзацем: ${pr.отдельноСтоящих} — непонятно, к какому факту относятся`);
  /* Кейсы описывают объекты с площадью, городом и историей. Пока они шаблоны,
     каждая карточка обязана говорить это сама: её пересылают и извлекают машиной
     отдельно от вводного абзаца страницы, и без пометки придуманный объект
     читается как сданный. */
  await pg.goto(F + '#/portfolio', { waitUntil: 'load' });
  await pg.waitForTimeout(600);
  const cs = await pg.evaluate(() => {
    const cards = [...document.querySelectorAll('.case')];
    return {
      всего: cards.length,
      безПометки: cards.filter((c) => !c.querySelector('.prov')).length,
      сПлощадью: cards.filter((c) => /\d{2,4}\s*м²/.test(c.textContent)).length,
    };
  });
  if (cs.всего && cs.безПометки) {
    fail(`карточек кейсов без пометки: ${cs.безПометки} из ${cs.всего} — придуманный объект читается как сданный`);
  }
  console.log(pr.пустых || pr.слишкомКороткие.length || pr.отдельноСтоящих || cs.безПометки
    ? `пометки о непроверенном: ${pr.всего}, нарушения перечислены ниже`
    : `пометки о непроверенном: ${pr.всего}, все с пояснением и при своём факте; кейсы-шаблоны помечены (${cs.всего})`);
  await pg.close();
}

/* ---------- 13. Превосходство без критерия ----------
   «Лучший», «первый», «номер один» без документально обоснованного критерия — это
   ст. 14.2 и 14.3 ФЗ-135, штраф от 100 000 ₽ (audit/06). Замер выдачи показал, что
   со старого сайта такая формулировка уже разошлась по ИИ-сводкам как факт о нас,
   поэтому на новом её быть не должно.
   Оговорка: чужие превосходные формулировки мы цитируем, чтобы их опровергнуть,
   поэтому совпадения внутри кавычек не считаются — их разбирает соседний текст. */
{
  const pg = await browser.newPage();
  await pg.goto(F, { waitUntil: 'load' });
  await pg.waitForTimeout(500);
  const sup = await pg.evaluate(() => {
    /* Между узлами вставляем пробел: textContent склеивает соседние элементы
       вплотную («…ответовПервые на рынке»), и проверка границы слова срывается —
       слово оказывается предварено кириллицей и правило его не видит. */
    const text = [...document.querySelectorAll('section.page *')]
      .filter((e) => !e.children.length)
      .map((e) => e.textContent)
      .join(' \n ')
      .replace(/[ \t]+/g, ' ');
    /* вырезаем цитаты целиком: внутри них разбираются чужие утверждения */
    const outside = text.replace(/«[^»]{0,300}»/g, ' ').replace(/"[^"]{0,300}"/g, ' ');
    /* Опасна не превосходная степень сама по себе, а сравнение с рынком: именно
       «лучший в России», «первые на рынке» подпадают под ст. 14.2/14.3 ФЗ-135.
       Первая версия правила ловила слово где угодно и дала семь ложных срабатываний
       на живом тексте: заголовок-вопрос «Кто лучшие интеграторы в Москве?», порядковые
       «первый вариант» и «первая стадия», отрицания «не утверждаем, что лучшее
       качество» и «лучший момент» про время закладки трасс. Поэтому требуем рядом
       рыночный маркер и отбрасываем вопросы и отрицания.
       Без \b: в JavaScript граница слова опирается на \w, который не знает кириллицы,
       и \bлучший\b не совпадает никогда — проверка молча пропускала бы всё. */
    const MARKET = '(в России|на рынке|в Москве|среди [а-яё]+|из всех)';
    /* «Первый» в техническом тексте почти всегда порядковое: «первый вариант»,
       «первая стадия». Для него рыночный маркер должен стоять вплотную, иначе
       «первый вариант работы в России» ловится как заявление о лидерстве. */
    const res = [
      new RegExp('(?:^|[^а-яёa-z])(сам(?:ый|ая|ое|ые)|лучш(?:ий|ая|ее|ие)|единственн(?:ый|ая|ое|ые)|лидер[а-яё]*|крупнейш[а-яё]*)(?![а-яёa-z])[^.!?]{0,40}?' + MARKET, 'gi'),
      new RegExp('(?:^|[^а-яёa-z])(первы(?:й|е))(?![а-яёa-z])\\s{0,3}' + MARKET, 'gi'),
    ];
    const hits = [];
    let m;
    for (const re of res)
    while ((m = re.exec(outside))) {
      const frag = outside.slice(Math.max(0, m.index - 60), m.index + 90);
      /* вопрос — это формулировка пользователя, отрицание — отказ от утверждения */
      if (/\?/.test(frag)) continue;
      /* снова без \b — кириллица */
      if (/(?:^|[^а-яё])не\s+(утвержда|заявля|обеща|говор)/i.test(frag)) continue;
      hits.push(frag.trim());
    }
    return { hits: [...new Set(hits)].slice(0, 6), count: hits.length };
  });
  if (sup.count) fail(`превосходство без критерия (ФЗ-135, ст. 14.2/14.3): ${sup.count} — ${sup.hits[0]}`);
  console.log(sup.count
    ? 'превосходные формулировки: нарушения перечислены ниже'
    : 'превосходные формулировки: вне цитат не встречаются');
  await pg.close();
}

await browser.close();

if (problems.length) {
  console.log(`\n❌ НАРУШЕНИЙ: ${problems.length}`);
  problems.forEach((x) => console.log('  ·', x));
  process.exit(1);
}
console.log('\n✅ Нарушений нет.');
