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

/* Вывод итога вынесен в функцию: его же зовёт общий перехват, когда прогон
   падает на полпути. Иначе крушение обрывало вывод на середине и наружу
   уходила тишина, неотличимая от «чисто». */
let summaryPrinted = false;
function report() {
  if (summaryPrinted) return;
  summaryPrinted = true;
  if (problems.length) {
    console.log(`\n❌ НАРУШЕНИЙ: ${problems.length}`);
    problems.slice(0, 15).forEach((p) => console.log(`  · ${p}`));
    process.exit(1);
  }
  console.log('\n✅ Нарушений нет.');
}
/* Отчёт об успехе печатается, только если с прошлого отчёта нарушений не
   прибавилось. Раньше строки успеха стояли за циклами безусловно, и приёмка
   рапортовала «обе темы держат AA» одновременно с записью нарушения — я сам
   на этом ошибся, прочитав вывод вместо списка проблем. */
let reported = 0;
const ok = (m) => {
  if (problems.length === reported) console.log(m);
  reported = problems.length;
};

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
    /* Ограничение по длине снято, проверяется смысл. Прежнее правило в 60
       знаков вместе с приставкой бренда обрывало семьдесят два заголовка
       многоточием посреди вопроса, а механическое сокращение по границе
       смысла давало «Какие протоколы использует умный дом (KNX?» и «У меня
       уже стоит система от другого подрядчика?» — второе спрашивает совсем
       не то, что страница отвечает. Длину выдача всё равно режет по ширине в
       пикселях; врать заголовком нельзя, а быть длинным можно. */
    if (t.includes('…')) fail(`${url}: заголовок обрывается многоточием — «${t}»`);
    if (/ (?:с|со|в|во|к|о|об|у|за|на|по|из|от|до|при|для|и|а|но|или)\?$/i.test(t)) {
      fail(`${url}: заголовок обрывается служебным словом — «${t}»`);
    }
    if (/\([^)]*$/.test(t)) fail(`${url}: заголовок обрывается внутри скобки — «${t}»`);
    titles.set(t, [...(titles.get(t) || []), url]);
  }

  const d = (s.match(/name="description" content="([^"]*)"/) || [])[1];
  /* Описание — это текст, который человек прочтёт в выдаче целиком. Обрыв
     посреди придаточного («…без единого проекта,…») читается как сбой: резать
     надо по границе смысла. Сто тридцать два из ста тридцати девяти
     заканчивались так, потому что отсчитывали ровно 157 знаков. */
  if (d && /[,;:]…$/.test(d)) fail(`${url}: описание обрывается посреди придаточного — «…${d.slice(-40)}»`);
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

  /* Компания объявляется один раз и дальше только упоминается по
     идентификатору. Вторая запись с тем же именем, но без описания и года
     основания — для машины отдельная организация, которую не с чем свести:
     так было на 79 страницах, где статья объявляла своего издателя заново. */
  const орг = (s.match(/"@type":"Organization"/g) || []).length;
  if (орг > 1) fail(`${url}: организация объявлена ${орг} раза вместо одной записи со ссылками на неё`);
  if (!s.includes('#organization')) fail(`${url}: у организации нет единого идентификатора`);

  /* Прототип жил на хэш-роутере, и его адреса переехали в контент вместе с
     текстом: на собранном сайте "#/service" не ведёт никуда. Тридцать две
     такие ссылки пролежали в сборке, пока их никто не открыл глазами. */
  const dead = s.match(/href="#\/[^"]*"/g);
  if (dead) fail(`${url}: ссылки в никуда из хэш-роутера: ${[...new Set(dead)].slice(0, 3).join(', ')}`);

  /* Хлебные крошки страница рисует сама; вторые приезжают внутри
     перенесённого содержимого, и адрес получает две разные цепочки. */
  const crumbs = (s.match(/class="crumbs"/g) || []).length;
  if (crumbs > 1) fail(`${url}: хлебных крошек ${crumbs} вместо одной цепочки`);

  /* Пометка о непроверенном обязана выглядеть пометкой. Значок без обёртки —
     это значок, который опубликуют не заметив: на странице дизайнеров разметка
     оказалась экранирована (class=\"prov\" пришло в браузер вместе со слэшами),
     на кейсах значок стоял внутри жирного текста, а на разделах шаблон печатал
     текстовое поле вместо HTML. Считаем, убрав из документа сами пометки. */
  const visible = s
    .replace(/<script[\s\S]*?<\/script>/g, ' ')
    .replace(/<meta[^>]*>/g, ' ')
    /* Тег любой: пометка бывает и в строке, и отдельным абзацем. Проверка,
       знающая только про span, объявила бы абзац нарушением. */
    .replace(/<(\w+) class="prov">[\s\S]*?<\/\1>/g, ' ');
  const loose = (visible.match(/⚠️/g) || []).length;
  if (loose) fail(`${url}: пометок вне .prov: ${loose} — значок есть, выделения нет`);

  /* И ни одна пометка не уходит в описание страницы: его цитируют поиск и
     машина. Вырезать один значок нельзя — тогда неподтверждённое поедет
     туда как утверждённое, поэтому предложение с пометкой выбрасывается
     целиком там, где описание собирается. */
  for (const m of s.matchAll(/<meta (?:name|property)="(?:description|og:description|twitter:description)" content="([^"]*)"/g)) {
    if (m[1].includes('⚠️')) {
      fail(`${url}: пометка о непроверенном ушла в описание страницы`);
      break;
    }
  }
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
  /* Карточка, обёрнутая в ссылку целиком, красит и подчёркивает каждый абзац
     внутри. Тот же дефект чинился в компонентах, а в перенесённом содержимом
     приехал своей копией: восемь карточек датчиков читались стеной
     подчёркнутого текста. Граница после имени тега обязательна — без неё
     «<a» совпадает с началом «<article», на чём я уже один раз ошибся. */
  /* Пустой контейнер в перенесённом содержимом — это место, которое наполнял
     скрипт прототипа, и заголовок над ним обещает то, чего на сайте нет. */
  for (const [url, page] of Object.entries(content.pages)) {
    const empty = (page.html.match(/<div[^>]*>\s*<\/div>/g) || []).length;
    if (empty) fail(`${url}: пустых контейнеров в перенесённом содержимом: ${empty} — заголовок над пустотой`);
  }

  /* Два одинаковых заголовка подряд на одной странице означают, что один из
     них остался от пустышки, а второй принёс компонент. */
  for (const f of files) {
    const url = `/${relative(OUT, f).replace(/index\.html$/, '')}`;
    const heads = [...readFileSync(f, 'utf8').matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/g)]
      .map((m) => m[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim());
    const dup = heads.filter((h, i) => h && heads.indexOf(h) !== i);
    if (dup.length) fail(`${url}: заголовок повторяется на странице: «${dup[0]}»`);
  }

  /* Список, в котором элемент состоит из одной запятой, — след сломанного
     разбора: выгрузка рвала строку на экранированном знаке и выдавала обрубки
     вместо пунктов. Страница при этом рисовалась, только пустыми строчками. */
  for (const [key, rec] of Object.entries({ ...content.sections, ...content.comparisons })) {
    for (const field of ['items', 'risks']) {
      const junk = (rec[field] || []).filter((x) => (x.text || '').trim().length < 3);
      if (junk.length) fail(`/${key}: в списке «${field}» ${junk.length} пустых элементов — разбор выгрузки сломан`);
    }
  }

  /* Проверяем всё перенесённое, а не только страницы-хабы: разделы и
     сравнения приезжают из того же прототипа теми же шаблонами, и дефект,
     который ищем, приходит одной дорогой. */
  const imported = [
    ...Object.entries(content.pages).map(([k, v]) => [k, v.html]),
    ...Object.entries(content.sections).map(([k, v]) => [`/${k}`, JSON.stringify(v)]),
    ...Object.entries(content.comparisons).map(([k, v]) => [`/${k}`, JSON.stringify(v)]),
  ];
  for (const [url, html] of imported) {
    const wrapped = (html.match(/<a[\s>][^>]*class=\\?"[^"\\]*\bcard\b/g) || []).length;
    if (wrapped) fail(`${url}: карточек, обёрнутых в ссылку целиком: ${wrapped} — внутри подчёркнут весь текст`);
    const dead = (html.match(/<button[\s>]/g) || []).length;
    if (dead) fail(`${url}: в перенесённом содержимом ${dead} кнопок без обработчика — на сайте они не делают ничего`);
  }

  /* Кнопка без обработчика — это кнопка, которая ничего не делает. В
     прототипе форму открывал скрипт; на сайте таких кнопок оказалось
     двенадцать, и каждая выглядела рабочей. */
  ok(`перенесённые страницы: разметка сбалансирована, кнопок без действия нет (${Object.keys(content.pages).length})`);
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
    if (!missing.length && !extra.length) ok(`карта сайта: ${inMap.size} адресов, ровно столько же страниц`);
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
    ok(`совпадение страниц: ни одной пары выше 60% (сравнено ${docs.length * (docs.length - 1) / 2} пар)`);
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
    if (!dead.length && !chained.length) ok(`редиректы: ${rules.length} правил, все ведут на существующие страницы одним переходом`);
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
/* Шаг цепочки — это имя, а не предложение. Заголовок раздела на листе
   третьего уровня разворачивал крошки на три строки, и путь переставал
   читаться с одного взгляда. */
{
  const long = [];
  for (const f of files) {
    const url = `/${relative(OUT, f).replace(/index\.html$/, '')}`;
    const m = readFileSync(f, 'utf8').match(/class="crumbs"[^>]*>([\s\S]*?)<\/nav>/);
    if (!m) continue;
    for (const step of m[1].replace(/<[^>]+>/g, '\u0001').split('\u0001')
      .map((x) => x.replace(/\s+/g, ' ').trim()).filter((x) => x && x !== '/')) {
      if (step.length > 46) long.push(`${url}: «${step.slice(0, 50)}…»`);
    }
  }
  if (long.length) fail(`шаг цепочки длиннее имени: ${long.slice(0, 2).join('; ')} (всего ${long.length})`);
}

/* Ответы по теме обязаны быть разными на разных страницах. Разделы и сами
   ответы считаем ПОРОЗНЬ: у ответов подборка идёт по кластеру и разнообразна
   сама по себе, и вместе с ними сорок четыре одинаковых списка на разделах
   тонули в общей статистике — проверка их не увидела. */
for (const [heading, label] of [['Ответы по теме', 'разделах'], ['Ещё по теме', 'страницах ответов']]) {
  const used = new Map();
  let pagesWith = 0;
  for (const f of files) {
    const src = readFileSync(f, 'utf8');
    if (!src.includes(heading)) continue;
    pagesWith += 1;
    const links = [...src.matchAll(/class="stretch" href="(\/answers\/[^"]+)"/g)].map((m) => m[1]);
    for (const l of new Set(links.slice(-3))) used.set(l, (used.get(l) || 0) + 1);
  }
  if (pagesWith <= 5) continue;
  const distinct = used.size;
  const worst = [...used.entries()].sort((a, b) => b[1] - a[1])[0];
  if (distinct < Math.min(20, pagesWith)) {
    fail(`ответов по теме всего ${distinct} разных на ${pagesWith} ${label} — подборка не зависит от темы`);
  }
  if (worst && worst[1] > pagesWith * 0.5) {
    fail(`один ответ предлагается на ${worst[1]} ${label} из ${pagesWith}: ${worst[0]}`);
  }
  ok(`ответы по теме на ${label}: ${distinct} разных на ${pagesWith}, чаще всего один встречается ${worst ? worst[1] : 0} раз`);
}

ok(`хлебные крошки: на экране и в разметке совпадают (${files.filter((f) => /class="crumbs"/.test(readFileSync(f, 'utf8'))).length})`);

/* Бюджет веса. Меряем со сжатием, потому что по проводу уезжает сжатое:
   без него локальный сервер показывает 548 КБ там, где реально 128.
   Пороги взяты с запасом к измеренному, чтобы ловить не колебания, а рост
   в разы — страница, которая незаметно набрала вдвое, ловится, а +10 % нет. */
{
  const { gzipSync } = await import('node:zlib');
  const gz = (f) => gzipSync(readFileSync(f), { level: 9 }).length;
  const LIMIT = { '/answers/': 200 * 1024, '*': 60 * 1024 };
  const heavy = [];
  for (const f of files) {
    const url = `/${relative(OUT, f).replace(/index\.html$/, '')}`;
    const size = gz(f);
    const cap = LIMIT[url] || LIMIT['*'];
    if (size > cap) heavy.push(`${url}: ${(size / 1024).toFixed(0)} КБ при пороге ${(cap / 1024).toFixed(0)}`);
  }
  if (heavy.length) fail(`страницы тяжелее бюджета: ${heavy.slice(0, 3).join('; ')}`);

  const chunks = [];
  (function walk(dir) {
    for (const e of readdirSync(dir)) {
      const p = join(dir, e);
      if (statSync(p).isDirectory()) walk(p);
      else if (e.endsWith('.js')) chunks.push(p);
    }
  })(join(OUT, '_next/static'));
  const jsGz = chunks.reduce((n, f) => n + gz(f), 0);
  if (jsGz > 260 * 1024) fail(`скриптов ${(jsGz / 1024).toFixed(0)} КБ со сжатием при пороге 260`);
  ok(`вес со сжатием: скрипты ${(jsGz / 1024).toFixed(0)} КБ, самая тяжёлая страница ${
    (Math.max(...files.map(gz)) / 1024).toFixed(0)} КБ`);
}

/* Карточка для пересылки. Ссылку на инженерный проект пересылают дизайнеру
   и архитектору, и без картинки она приходит голой строкой. Проверяем, что
   мета указывает на файл, который действительно собран, и что заголовок с
   описанием не пустые — иначе в переписке появится «example.invalid». */
{
  const miss = [], noImg = [];
  for (const f of files) {
    const url = `/${relative(OUT, f).replace(/index\.html$/, '')}`;
    const src = readFileSync(f, 'utf8');
    const img = (src.match(/property="og:image" content="([^"]*)"/) || [])[1];
    const t = (src.match(/property="og:title" content="([^"]*)"/) || [])[1];
    const d = (src.match(/property="og:description" content="([^"]*)"/) || [])[1];
    if (!img) noImg.push(url);
    else {
      const local = img.replace(/^https?:\/\/[^/]+/, '');
      if (!existsSync(join(OUT, local))) miss.push(`${url} → ${local}`);
    }
    if (!t || !d) miss.push(`${url}: пустой заголовок или описание карточки`);
  }
  if (noImg.length) fail(`страниц без картинки для пересылки: ${noImg.length} (${noImg.slice(0, 3).join(', ')})`);
  if (miss.length) fail(`карточка для пересылки битая: ${miss.slice(0, 2).join('; ')} (всего ${miss.length})`);
  if (!noImg.length && !miss.length) ok('карточка для пересылки: есть на всех страницах, файл на месте');
}

/* Файлы, на которые никто не ссылается, уезжают на хостинг вместе с сайтом.
   Восемь значков устройств и две фотографии зала лежали мёртвым грузом. */
{
  const referenced = new Set();
  for (const f of files) {
    for (const m of readFileSync(f, 'utf8').matchAll(/["'(]([^"'()\s]*\.(?:png|jpg|jpeg|webp|svg))/g)) {
      referenced.add(m[1].replace(/^https?:\/\/[^/]+/, ''));
    }
  }
  for (const f of readdirSync(join(OUT, '_next/static'), { recursive: true })) {
    const p = join(OUT, '_next/static', String(f));
    if (!statSync(p).isFile() || !/\.(css|js)$/.test(String(f))) continue;
    for (const m of readFileSync(p, 'utf8').matchAll(/["'(]([^"'()\s]*\.(?:png|jpg|jpeg|webp|svg))/g)) {
      referenced.add(m[1]);
    }
  }
  const dead = [];
  (function walkImg(dir, base) {
    for (const e of readdirSync(dir)) {
      const p = join(dir, e);
      if (statSync(p).isDirectory()) { if (e !== '_next') walkImg(p, `${base}${e}/`); continue; }
      if (!/\.(png|jpg|jpeg|webp|svg)$/.test(e)) continue;
      if (!referenced.has(`${base}${e}`)) dead.push([`${base}${e}`, statSync(p).size]);
    }
  })(OUT, '/');
  if (dead.length) {
    const kb = Math.round(dead.reduce((n, [, s]) => n + s, 0) / 1024);
    fail(`картинки, на которые никто не ссылается: ${dead.length} на ${kb} КБ — ${dead.slice(0, 3).map(([p]) => p).join(', ')}`);
  } else ok('лишних картинок в сборке нет');
}

/* Страница ошибки. Next отдавал английское «404: This page could not be
   found» на русском сайте и без единого следующего шага. Сюда попадают по
   старым ссылкам с пяти доменов — всё, чего нет в карте из 194 правил. */
{
  const p404 = join(OUT, '404.html');
  if (!existsSync(p404)) fail('нет страницы 404');
  else {
    const h = readFileSync(p404, 'utf8');
    if (/could not be found|This page/i.test(h)) fail('страница 404 отдаёт английское сообщение по умолчанию');
    const t = (h.match(/<title>([^<]*)<\/title>/) || [])[1] || '';
    if (!/не найдена/i.test(t)) fail(`у страницы 404 заголовок «${t}» — не про ошибку`);
    const plain = h.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ')
      .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (plain.length < 700) fail(`на странице 404 всего ${plain.length} знаков — тупик без выхода`);
    if (!/href="\/answers\/"/.test(h)) fail('со страницы 404 нельзя перейти к ответам');
    if (!/<meta name="robots"[^>]*noindex/i.test(h)) fail('страница 404 не закрыта от индексации');
    ok(`страница 404: по-русски, ${plain.length} знаков, выходы на месте`);
  }
}

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

  /* Ссылка в содержимом на страницу, где человек уже стоит, — тупик под видом
     действия: нажатие перезагружает то же место. Кнопки прототипа брали цель
     только из своей пометки, а блок «Что дальше» рисовался и на тех страницах,
     куда сам вёл. Меню и подвал не в счёт: там ссылка на текущий раздел —
     норма, и текущий пункт объявлен отдельно. */
  const selfies = [];
  for (const f of files) {
    const url = `/${relative(OUT, f).replace(/index\.html$/, '')}`;
    const body = readFileSync(f, 'utf8')
      .replace(/<script[\s\S]*?<\/script>/g, ' ')
      .replace(/<header[\s\S]*?<\/header>/g, ' ')
      .replace(/<footer[\s\S]*?<\/footer>/g, ' ');
    for (const m of body.matchAll(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)) {
      if (m[1] === url) {
        selfies.push(`${url} → «${m[2].replace(/<[^>]+>/g, '').trim().slice(0, 30)}»`);
        break;
      }
    }
  }
  if (selfies.length) fail(`действие ведёт на ту же страницу: ${selfies.slice(0, 3).join('; ')}`);
  else ok('в содержимом нет ссылок на страницу, где читатель уже стоит');

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
    ok(`внутренние ссылки: все ведут в существующие страницы и на каждую есть ссылка (адресов ${known.size})`);
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
/* Общий перехват на браузерную часть. Одно исключение — не нажалась кнопка,
   исчез элемент — уносило весь прогон, и всё, что шло ниже, не выполнялось.
   Стенд показывал шесть слепых гейтов подряд, хотя слеп был один. Крушение
   обязано быть громким нарушением, а не тишиной: тишина читается как «чисто».
   Проверки выше него при этом уже записаны и попадут в отчёт. */
process.on('uncaughtException', (e) => {
  fail(`приёмка упала на полпути: ${String(e && e.message || e).split('\n')[0].slice(0, 120)}`);
  report();
});
process.on('unhandledRejection', (e) => {
  fail(`приёмка упала на полпути: ${String(e && e.message || e).split('\n')[0].slice(0, 120)}`);
  report();
});

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
ok(form ? 'форма: согласие обязательно, метка и политика на месте, назначение полей объявлено' : '');

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
ok('согласие и тема: аналитика ждёт ответа, отказ сохраняется, системная настройка учитывается');

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
  /* Открытое меню обязано помещаться на экран целиком. Пункты наследовали
     отступ обычного списка — по двенадцать пикселей на строку, сто пятьдесят
     шесть на тринадцать разделов, — и «Контакты» оказывались за нижним краем:
     раздел есть, а дотянуться можно только прокруткой внутри панели, о которой
     ничто не сообщает. */
  {
    await pg.goto(`${ORIGIN}/`);
    await pg.waitForTimeout(200);
    const burger = await pg.$('.burger');
    if (!burger) fail('на узком экране нет кнопки меню');
    else {
      /* Клик в try: исключение здесь убивало весь прогон, и всё, что идёт
         ниже — вес страницы, разметка места, доступность таблиц, список к
         заполнению, превосходства — не выполнялось вовсе. Стенд показывал
         шесть слепых гейтов подряд, хотя слеп был один: этот. Не открылось —
         это нарушение, а не крушение. */
      try {
        await burger.click({ timeout: 4000 });
      } catch {
        fail('кнопка меню не нажимается на узком экране');
      }
      await pg.waitForTimeout(250);
      const fit = await pg.evaluate(() => {
        const items = [...document.querySelectorAll('.nav-panel a')];
        if (!items.length) return null;
        const last = items[items.length - 1].getBoundingClientRect();
        return { имя: items[items.length - 1].textContent.trim(),
          низ: Math.round(last.bottom), экран: window.innerHeight };
      });
      if (!fit) fail('меню открылось пустым');
      else if (fit.низ > fit.экран) {
        fail(`меню не помещается: «${fit.имя}» уходит на ${fit.низ - fit.экран} px за нижний край`);
      }

      /* Обход клавиатурой замкнут на открытой панели. Иначе четырнадцать
         пунктов меню заканчивались провалом на страницу за ним: панель
         закрывает экран, а фокус уходил в содержимое, которого не видно.
         Tab нажимаем по-настоящему: переставить фокус скриптом — значит
         обойти сам обработчик и не проверить ничего. */
      const count = await pg.evaluate(() => document.querySelectorAll('.nav-panel a').length);
      let escaped = false;
      for (let i = 0; i < count + 3 && !escaped; i += 1) {
        await pg.keyboard.press('Tab');
        escaped = await pg.evaluate(() => !document.activeElement?.closest('.nav-panel'));
      }
      if (escaped) fail('обход клавиатурой уходит из открытого меню на скрытую страницу');
    }
  }

  /* Переход по якорю не должен прятать цель под липкой шапкой. Ссылка
     «К содержанию» уводила туда, где первые 63 пикселя закрыты шапкой:
     человек с клавиатуры прыгал к содержанию и не видел его начала. */
  {
    await pg.goto(`${ORIGIN}/answers/`);
    await pg.waitForTimeout(200);
    const hidden = await pg.evaluate(() => {
      const head = document.querySelector('header.site');
      const h = head ? head.getBoundingClientRect().height : 0;
      const out = [];
      for (const sel of ['#main', 'h1', 'h2']) {
        const t = document.querySelector(sel);
        if (!t) continue;
        t.scrollIntoView();
        const top = t.getBoundingClientRect().top;
        if (top < h) out.push(`${sel} на ${Math.round(h - top)} px`);
      }
      return out;
    });
    if (hidden.length) fail(`переход по якорю прячет цель под шапкой: ${hidden.join(', ')}`);
  }

  ok('узкий экран: за край не выходит, шапка заголовок не накрывает, меню помещается, якорь не уходит под шапку');
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
  else ok('тёмная тема: элементы управления оформлены, а не оставлены браузеру');
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
    /* По одной странице на каждый шаблон отрисовки, а не случайная выборка:
       контраст задаётся стилями и шаблоном, а не содержимым, и семь случайных
       страниц оставляли шаблоны без представителя. Полный обход всех 137 в
       обеих темах прогонялся отдельно и дал ноль — держать его в приёмке
       значит добавлять к каждому прогону минуты ради того же ответа. */
    for (const u of ['/', '/answers/', '/answers/chto-delat-esli-topyat-sosedi/',
      '/pricing/', '/portfolio/', '/contacts/', '/privacy/',
      '/equipment/sensors/leak/', '/compare/knx/', '/service/']) {
      /* Ждём не время, а признак: тема проставлена и стили применены. Замер
         сразу после появления data-mode ловит ещё браузерный белый фон — на
         полном обходе это дало 501 мнимое нарушение. */
      await pg.goto(`${ORIGIN}${u}`, { waitUntil: 'networkidle' });
      await pg.waitForFunction(() => document.documentElement.dataset.mode
        && !['rgba(0, 0, 0, 0)', 'rgb(255, 255, 255)']
          .includes(getComputedStyle(document.body).backgroundColor)).catch(() => {});
      await pg.waitForTimeout(120);
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
  ok('контраст: обе темы держат AA');
}

/* Проверки «прокрутка таблицы достижима клавиатурой» больше нет. Ниже 700 px
   таблицы разложены карточками, выше — помещаются целиком: ширины, при которой
   они прокручиваются вбок, не существует ни одной. Гейт требовал условия,
   которого не бывает, то есть падать ему было не на чем — а в отчёте он
   выглядел работающим. Свойство, ставшее настоящим (строка раскладывается и
   каждая ячейка сохраняет подпись столбца), проверяется ниже, на самой
   длинной таблице сайта. */

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
  /* И ведёт оно не на ту страницу, где человек уже стоит. На контактах кнопка
     указывала на контакты: нажатие перезагружало то же место — тупик на
     единственной странице, где до обращения один шаг, да ещё поверх формы. */
  {
    const c3 = await browser.newContext({ viewport: { width: 390, height: 844 },
      isMobile: true, hasTouch: true });
    const p3 = await c3.newPage();
    /* Пока баннер согласия спрашивает, липкая полоса намеренно спрятана —
       и проверять на ней нечего. Решаем вопрос заранее: так сайт видит
       всякий, кто зашёл во второй раз. */
    await p3.goto(`${ORIGIN}/`);
    await p3.evaluate(() => { try { localStorage.setItem('mm-analytics-consent', 'no'); } catch { /* хранилище запрещено */ } });
    for (const u of ['/', '/pricing/', '/contacts/', '/portfolio/']) {
      await p3.goto(`${ORIGIN}${u}`);
      await p3.evaluate(() => window.scrollTo(0, 1200));
      await p3.waitForTimeout(200);
      const to = await p3.evaluate(() => document.querySelector('.sticky-cta a')?.getAttribute('href'));
      if (to === u) fail(`${u}: липкое действие ведёт на ту же страницу — нажатие ничего не меняет`);
    }

    /* И не ложится на кнопку отправки заявки. Полоса перекрывала «Отправить
       заявку» ровно в тот момент, когда человек дошёл до конца формы. */
    /* Ждём, пока страница оживёт: обработчик прокрутки навешивается при
       гидратации, и до неё полоса остаётся скрытой независимо от положения —
       проверка мерила бы состояние, в котором дефекта не бывает. */
    await p3.goto(`${ORIGIN}/contacts/`, { waitUntil: 'networkidle' });
    await p3.waitForTimeout(300);
    /* Кнопку ставим к нижнему краю, а не в середину: посередине экрана
       липкая полоса до неё не достаёт, и проверка мерила бы положение,
       в котором дефект невозможен. Человек застаёт кнопку внизу. */
    await p3.evaluate(() => document.querySelector('#leadForm button[type=submit]')
      ?.scrollIntoView({ block: 'end' }));
    await p3.waitForTimeout(500);
    const clash = await p3.evaluate(() => {
      const btn = document.querySelector('#leadForm button[type=submit]');
      const bar = document.querySelector('.sticky-cta');
      if (!btn || !bar || bar.getAttribute('data-shown') !== 'yes') return 0;
      const a = btn.getBoundingClientRect(), b = bar.getBoundingClientRect();
      return a.bottom > b.top && a.top < b.bottom ? Math.round(a.bottom - b.top) : 0;
    });
    if (clash) fail(`липкая полоса лежит на кнопке отправки заявки на ${clash} px`);
    await c3.close();
  }
  if (after.высота < 44) fail(`липкое действие высотой ${after.высота} px — меньше пальца`);
  ok('липкое действие: ждёт ответа о согласии, появляется после первого экрана');
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
  ok('доступность: id, alt, уровни заголовков, фокус, консоль, масштаб 200% — чисто');
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
  else ok('запрещённое хранилище: страница живёт');
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
  else ok('reduced-motion: переходы отключены');
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
    ok('текст сайта: превосходства без критерия нет, каждая пометка называет предмет');
  }
  await c.close();
}

/* Адрес шоурума в разметке и адрес на странице обязаны совпадать. В разметке
   он записан руками, на странице живёт внутри фразы — разойтись они могут
   молча, и тогда машина отправит человека не туда. */
{
  const c = await browser.newContext({ javaScriptEnabled: false });
  const pg = await c.newPage();
  await pg.goto(`${ORIGIN}/showroom/`);
  const r = await pg.evaluate(() => {
    const ld = [...document.querySelectorAll('script[type="application/ld+json"]')]
      .map((n) => JSON.parse(n.textContent || '{}'))
      .find((x) => x['@type'] === 'LocalBusiness');
    return { ld, text: (document.querySelector('main')?.innerText || '') };
  });
  if (!r.ld) fail('на странице шоурума нет разметки места (LocalBusiness)');
  else {
    const street = r.ld.address?.streetAddress || '';
    /* Сравниваем по опорным частям: «набережная» и «наб.» — одно и то же
       место, записанное по-разному, и требовать дословного совпадения
       значит запретить писать на странице по-человечески. */
    const key = street.split(/[\s,]+/).filter((w) => w.length > 3).slice(0, 1)
      .concat(street.match(/\d+[а-яё]?\d*/gi) || []);
    const missing = key.filter((k) => !r.text.toLowerCase().includes(k.toLowerCase().slice(0, 8)));
    if (missing.length) fail(`адрес в разметке расходится со страницей: в разметке «${street}», на странице этого нет: ${missing.join(', ')}`);
    const hours = r.ld.openingHoursSpecification?.[0];
    if (!hours?.opens || !hours?.closes) fail('в разметке места не указаны часы работы');
    else if (!r.text.includes(hours.opens) || !r.text.includes(hours.closes)) {
      fail(`часы в разметке (${hours.opens}–${hours.closes}) не совпадают с указанными на странице`);
    }
    /* Телефон в разметке должен совпадать с тем, что на странице. Раньше это
       правило звучало наоборот — «телефона в разметке быть не должно», —
       потому что номер был заглушкой; теперь он настоящий, и запрет из старой
       эпохи молча лишал бы локальный поиск главного поля. */
    const tel = r.ld.telephone;
    if (!tel) fail('в разметке места нет телефона');
    else {
      const digits = (x) => String(x).replace(/\D/g, '');
      if (!digits(r.text).includes(digits(tel).slice(1))) {
        fail(`телефон в разметке (${tel}) не совпадает с указанным на странице`);
      }
    }
    if (r.ld.email) fail('в разметке места есть почта, а на сайте это заглушка');
    if (!missing.length) ok('шоурум: адрес, часы и телефон в разметке совпадают со страницей');
  }
  await c.close();
}

/* Текущий раздел объявляется разметкой. Правило для aria-current в стилях
   стояло с самого начала, а ставить атрибут было некому: тот, кто слушает
   страницу, не знал, в каком разделе находится. */
{
  const c = await browser.newContext({ javaScriptEnabled: false });
  const pg = await c.newPage();
  for (const [u, want] of [['/pricing/', 'Цены'], ['/answers/', 'Ответы'],
    ['/equipment/sensors/leak/', 'Оборудование'], ['/portfolio/', 'Кейсы']]) {
    await pg.goto(`${ORIGIN}${u}`);
    const got = await pg.evaluate(() => [...document.querySelectorAll(
      'header [aria-current="page"], .nav-panel [aria-current="page"]')]
      .map((n) => (n.textContent || '').trim()));
    if (!got.length) fail(`${u}: в меню не объявлен текущий раздел`);
    else if (!got.every((x) => x === got[0])) fail(`${u}: в меню объявлено несколько разделов: ${got.join(', ')}`);
    else if (got[0] !== want) fail(`${u}: текущим объявлен «${got[0]}» вместо «${want}»`);
  }
  ok('меню: текущий раздел объявлен разметкой на всех проверенных');
  await c.close();
}

/* Список того, что ждёт клиента, обязан совпадать с тем, что на сайте.
   Он вёлся руками и устаревал молча: знал 76 пунктов, когда на сайте было 79.
   Пункт, которого нет в списке, не попадёт ни в один разговор с клиентом —
   то есть останется на сайте навсегда. */
{
  let list = '';
  try { list = readFileSync(resolve('site-foundation/fill-list.md'), 'utf8'); } catch { /* нет файла */ }
  if (!list) fail('нет site-foundation/fill-list.md — списка того, что ждёт данных клиента');
  else {
    const inList = new Set([...list.matchAll(/^\| (.+?) \|/gm)].map((m) => m[1].trim()));
    const onSite = new Set();
    for (const f of files) {
      for (const m of readFileSync(f, 'utf8').matchAll(/class="prov">⚠️\s*([^<]+)</g)) {
        onSite.add(m[1].replace(/\s+/g, ' ').trim());
      }
    }
    const missing = [...onSite].filter((x) => !inList.has(x));
    if (missing.length) {
      fail(`пометок на сайте нет в списке к заполнению: ${missing.length} (${missing.slice(0, 2).join('; ')})`);
    } else {
      ok(`список к заполнению: все ${onSite.size} пометок сайта в нём есть`);
    }
  }
}

/* Обход всех страниц на признаки пустоты и наложений. Выборочный осмотр
   глазами находил такие вещи случайно: два одинаковых заголовка подряд на
   решениях и направлениях лежали там, пока я не открыл именно ту страницу.
   Здесь проверяются все, и не разметка, а положение на экране. */
{
  const c = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const pg = await c.newPage();
  await pg.goto(`${ORIGIN}/`);
  await pg.evaluate(() => { try { localStorage.setItem('mm-analytics-consent', 'no'); } catch { /* нет хранилища */ } });
  const bad = [];
  for (const f of files) {
    const url = `/${relative(OUT, f).replace(/index\.html$/, '')}`;
    await pg.goto(`${ORIGIN}${url}`, { waitUntil: 'domcontentloaded' });
    const found = await pg.evaluate(() => {
      const out = [];
      const main = document.querySelector('#main');
      if (!main) return ['нет главной области'];
      /* Заголовок внутри карточки законно бывает последним — там он подпись,
         а не обещание раздела. Первая версия правила этого не знала и
         объявила дефектом 126 страниц из 137. */
      const heads = [...main.querySelectorAll('h2,h3')]
        .filter((h) => !h.closest('.card,.case,.next,.handover'));
      for (const h of heads) {
        let n = h.nextElementSibling;
        while (n && n.offsetHeight === 0) n = n.nextElementSibling;
        if (!n && !h.parentElement.nextElementSibling) {
          out.push(`заголовок обещает раздел, за которым ничего нет: «${h.textContent.trim().slice(0, 40)}»`);
        } else if (n && /^H[1-3]$/.test(n.tagName)) {
          out.push(`заголовок сразу за заголовком: «${h.textContent.trim().slice(0, 30)}»`);
        }
      }
      for (const n of main.querySelectorAll('section,div.grid,dl,table')) {
        if (n.offsetParent !== null && n.getBoundingClientRect().height < 2 && (n.textContent || '').trim()) {
          out.push(`блок нулевой высоты с текстом: ${n.className}`);
        }
      }
      for (const n of main.querySelectorAll('p,h1,h2,h3,li,dd')) {
        const par = n.parentElement;
        if (!par || par === main) continue;
        const a = n.getBoundingClientRect(), b = par.getBoundingClientRect();
        if (a.height > 0 && b.height > 0 && a.bottom > b.bottom + 4
          && getComputedStyle(par).overflow === 'visible') {
          out.push(`текст выходит за свой блок: ${n.tagName.toLowerCase()}`);
        }
      }
      for (const n of main.querySelectorAll('.card')) {
        if (!(n.textContent || '').trim()) out.push('пустая карточка');
      }
      return [...new Set(out)];
    });
    for (const x of found) bad.push(`${url}: ${x}`);
  }
  if (bad.length) fail(`признаки пустоты и наложений: ${bad.length} — ${bad.slice(0, 2).join('; ')}`);
  else ok(`обход ${files.length} страниц: пустых обещаний и наложений нет`);
  await c.close();
}

/* Размер агентского вознаграждения на сайт не выносится. Он входит в цену
   объекта, и заказчику незачем читать его у подрядчика: узнав ставку, он
   считает, что переплачивает через дизайнера, и идёт мимо партнёра — то есть
   публикация ломает ровно тот канал, ради которого написана страница.

   Ищем процент рядом со словами о вознаграждении, а не любой процент:
   влажность 45% и «движение ниже 30%» — техника, и запрещать её нельзя. */
{
  const c = await browser.newContext({ javaScriptEnabled: false });
  const pg = await c.newPage();
  const hits = [];
  for (const u of ['/partners/', '/partners/designers/', '/about/', '/pricing/', '/contacts/', '/']) {
    await pg.goto(`${ORIGIN}${u}`);
    const found = await pg.evaluate(() => {
      const text = (document.querySelector('#main')?.innerText || '').replace(/\s+/g, ' ');
      const re = /(вознагражден|агентск|комисси|бонусн)[^.!?]{0,80}?\d{1,2}\s?%|\d{1,2}\s?%[^.!?]{0,80}?(вознагражден|агентск|комисси|от итоговой стоимости|с каждого проекта)/gi;
      return [...text.matchAll(re)].map((m) => m[0].slice(0, 110));
    });
    for (const f of found) hits.push(`${u}: «${f}»`);
  }
  if (hits.length) fail(`размер вознаграждения виден заказчику: ${hits.slice(0, 2).join('; ')}`);
  else ok('вознаграждение: размер на сайт не вынесен, механика описана без цифр');
  await c.close();
}

/* Цели нажатия. У прототипа такая проверка есть, у сайта не было — а разметку
   с тех пор писали заново. Растянутые ссылки карточек и ссылки внутри абзацев
   исключаем: у первых цель — вся карточка, у вторых её задаёт строка текста. */
{
  const c = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const pg = await c.newPage();
  const small = [];
  for (const u of ['/', '/answers/', '/pricing/', '/about/', '/partners/',
    '/scenarios/', '/contacts/', '/equipment/', '/portfolio/', '/showroom/']) {
    await pg.goto(`${ORIGIN}${u}`);
    await pg.waitForTimeout(150);
    const found = await pg.evaluate(() => [...document.querySelectorAll('a,button')]
      .filter((n) => n.offsetParent !== null)
      .filter((n) => !n.classList.contains('stretch'))
      .filter((n) => !n.closest('p,li,td,th,.crumbs,.foot-legal,.answer,.conclusion'))
      .filter((n) => {
        const b = n.getBoundingClientRect();
        return b.width > 0 && b.height > 0 && b.height < 24;
      })
      .map((n) => `${n.tagName.toLowerCase()}.${(n.className || '').toString().slice(0, 20)} ${
        Math.round(n.getBoundingClientRect().height)}px «${(n.textContent || '').trim().slice(0, 30)}»`));
    for (const f of found) small.push(`${u} ${f}`);
  }
  if (small.length) fail(`цели нажатия ниже 24 px: ${[...new Set(small)].slice(0, 3).join('; ')}`);
  else ok('цели нажатия: ниже 24 px нет ни одной вне текста');
  await c.close();
}

/* Печать. Страницу цен распечатывают и несут на встречу: на бумаге не должно
   быть меню, липкой кнопки и вопроса о согласии, а у ссылок должен быть виден
   адрес — на бумаге по ним не нажать. */
{
  const c = await browser.newContext();
  const pg = await c.newPage();
  await pg.goto(`${ORIGIN}/pricing/`);
  await pg.emulateMedia({ media: 'print' });
  await pg.waitForTimeout(300);
  const r = await pg.evaluate(() => {
    const shown = (sel) => {
      const n = document.querySelector(sel);
      return n ? getComputedStyle(n).display !== 'none' : false;
    };
    const link = document.querySelector('main a[href^="/"]');
    return {
      лишнее: ['header.site', '.sticky-cta', '.consent', '.foot-map', '.next'].filter(shown),
      фон: getComputedStyle(document.body).backgroundColor,
      адресУСсылки: link ? getComputedStyle(link, '::after').content : '',
    };
  });
  if (r.лишнее.length) fail(`на печать уходит экранное: ${r.лишнее.join(', ')}`);
  if (!/255,\s*255,\s*255/.test(r.фон)) fail(`фон при печати ${r.фон} — на бумагу уйдёт заливка`);
  if (!/attr|\//.test(r.адресУСсылки)) fail('у ссылок при печати не виден адрес');
  ok('печать: экранное убрано, фон белый, адреса ссылок видны');
  await c.close();
}

/* Встречная проверка к списку к заполнению: та идёт от сайта к списку и
   молчит, если пометка исчезла с обеих сторон сразу. Шесть оговорок разделов
   так и уехали — поле было в прототипе, выгрузка его не читала, и страницы
   про пожарные датчики и лицензию МЧС вышли с утверждением и без оговорки.
   Здесь наоборот: что помечено в контенте, обязано стоять на странице. */
{
  const src = JSON.parse(readFileSync(join(OUT, '..', 'lib', 'content.json'), 'utf8'));
  const c = await browser.newContext({ javaScriptEnabled: false });
  const pg = await c.newPage();
  let checked = 0;
  for (const dict of [src.sections, src.comparisons]) {
    for (const [key, rec] of Object.entries(dict)) {
      if (!rec.prov) continue;
      const want = rec.prov.replace(/^⚠️\s*/, '').trim();
      await pg.goto(`${ORIGIN}/${key}/`);
      const has = await pg.evaluate((t) =>
        [...document.querySelectorAll('.prov')].some((e) => e.textContent.includes(t)), want);
      if (!has) fail(`/${key}/: оговорка раздела не выведена — «${want.slice(0, 50)}…»`);
      checked += 1;
    }
  }
  console.log(`оговорки разделов: выведены на всех ${checked} страницах, где заданы`);
  await c.close();
}

/* Сравнение без таблицы сравнения — это не страница сравнения. Данные лежали
   в конфиге прототипа, выгрузка читала семь полей из десяти, и три страницы
   выходили с заголовком «vs KNX» и без единой строки. Проверка смотрит на
   собранный файл, а не на выгрузку: между ними шаблон, и он тоже умеет
   потерять данные. */
{
  const c = await browser.newContext({ javaScriptEnabled: false });
  const pg = await c.newPage();
  const cmpUrls = files
    .map((f) => `/${relative(OUT, f).replace(/index\.html$/, '')}`)
    .filter((u) => /^\/compare\/.+/.test(u));
  if (!cmpUrls.length) fail('страниц сравнения нет вовсе');
  for (const u of cmpUrls) {
    await pg.goto(`${ORIGIN}${u}`);
    const got = await pg.evaluate(() => {
      const t = document.querySelector('main table');
      return {
        строк: t ? t.querySelectorAll('tbody tr').length : 0,
        колонок: t ? t.querySelectorAll('thead th').length : 0,
        когда: document.body.textContent.includes('Когда выигрывает'),
      };
    });
    if (got.строк < 3) fail(`${u}: в таблице сравнения ${got.строк} строк — сравнивать нечего`);
    if (got.колонок < 3) fail(`${u}: в таблице сравнения ${got.колонок} колонки вместо критерия и двух сторон`);
    if (!got.когда) fail(`${u}: не сказано, когда выигрывает каждый вариант`);
  }
  console.log(`сравнения: таблица и разбор по сторонам на всех ${cmpUrls.length} страницах`);
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
  ok(`кейсы: объектов без скриптов ${n}, пометка в каждой карточке`);
  await c.close();
}

/* Без скриптов не должно остаться элементов управления, которым нечему
   отвечать. Кнопка меню была на телефоне единственным входом в навигацию и
   при выключенных скриптах не делала ничего; переключатель темы, отбор кейсов
   и калькулятор — то же самое. Мёртвая кнопка хуже отсутствующей. */
{
  const c = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
  const pg = await c.newPage();
  await pg.goto(`${ORIGIN}/`);
  const dead = await pg.evaluate(() => {
    const shown = (sel) => [...document.querySelectorAll(sel)]
      .filter((n) => n.getBoundingClientRect().width > 0).length;
    return {
      меню: shown('.burger'), тема: shown('.theme-toggle'),
      липкое: shown('.sticky-cta a'),
      навигация: shown('nav.main a'),
    };
  });
  if (dead.меню) fail('без скриптов показана кнопка меню, которая ничего не открывает');
  if (dead.тема) fail('без скриптов показан переключатель темы, который ничего не переключает');
  if (dead.липкое) fail('без скриптов показано липкое действие, которое не появляется по прокрутке');
  if (dead.навигация < 10) fail(`без скриптов на телефоне доступно ${dead.навигация} ссылок навигации — входа в разделы нет`);
  await pg.goto(`${ORIGIN}/portfolio/`);
  const filter = await pg.evaluate(() => [...document.querySelectorAll('.filter .chip')]
    .filter((n) => n.getBoundingClientRect().width > 0).length);
  if (filter) fail(`без скриптов показан отбор кейсов из ${filter} кнопок, который ничего не отбирает`);
  ok(`без скриптов: мёртвых кнопок нет, навигация из ${dead.навигация} ссылок на месте`);
  await c.close();
}


/* Каждая страница обязана заканчиваться действием. Точка входа из поиска —
   не главная, а любой ответ и любой раздел; до сих пор сто с лишним страниц
   упирались в подвал. Исключение одно — политика обработки данных: там
   призывать не к чему. */
{
  const c = await browser.newContext({ javaScriptEnabled: false });
  const pg = await c.newPage();
  const noCta = [], small = [];
  for (const f of files) {
    const url = `/${relative(OUT, f).replace(/index\.html$/, '')}`;
    if (url === '/privacy/') continue;
    const src = readFileSync(f, 'utf8');
    if (!/class="next"|id="leadForm"/.test(src)) { noCta.push(url); continue; }
    if (noCta.length + small.length > 0) continue;
  }
  if (noCta.length) fail(`страниц без целевого действия: ${noCta.length} (${noCta.slice(0, 4).join(', ')})`);

  /* На выборке проверяем, что кнопка действительно доступна и достаточного
     размера: наличие класса в разметке ещё не значит, что до неё дойдут. */
  for (const u of ['/', '/answers/', '/portfolio/', '/equipment/sensors/leak/', '/compare/knx/']) {
    await pg.goto(`${ORIGIN}${u}`);
    const cta = await pg.evaluate(() => {
      const b = document.querySelector('.next a.btn-primary, #leadForm button[type="submit"]');
      if (!b) return null;
      const r = b.getBoundingClientRect();
      return { href: b.getAttribute('href'), w: Math.round(r.width), h: Math.round(r.height) };
    });
    if (!cta) fail(`${u}: целевое действие не найдено на странице`);
    else if (cta.h < 44) fail(`${u}: кнопка высотой ${cta.h} px — меньше пальца`);
  }
  ok(`целевое действие: есть на всех ${files.length - 1} страницах кроме политики, размер проверен на пяти`);
  await c.close();
}

/* Вопрос «сколько» обязан получить число — в прямом ответе или, если цифры
   ещё нет, названную пометку о том, какой именно цифры не хватает. Ответ без
   числа и без пометки проигрывает молча: спросив «сколько стоит», машина
   процитирует того, кто число назвал, а наш текст останется рассуждением. */
{
  const данные = JSON.parse(readFileSync(resolve('site/lib/content.json'), 'utf8'));
  const без = [];
  for (const a of данные.answers) {
    if (!/сколько|какая цена|во сколько/i.test(a.question)) continue;
    const прямой = a.answer.replace(/<[^>]+>/g, '');
    if (/\d/.test(прямой)) continue;
    /* Годится не любая пометка, а та, что называет недостающую цифру: у этих
       ответов есть и другие оговорки, и на них проверка проходила, ничего не
       требуя. Соглашение — такая пометка начинается со слова «поставить». */
    if (/⚠️\s*поставить/.test(`${a.expandedText || ''} ${прямой}`)) continue;
    без.push(a.question);
  }
  if (без.length) fail(`вопрос «сколько» без числа и без пометки о недостающей цифре: ${без.slice(0, 3).join(' | ')}`);
  else ok('вопросы «сколько»: у каждого либо число, либо названо, какой цифры не хватает');

  /* Первое предложение — то, что машина возьмёт в выдержку. Длиннее двухсот
     сорока знаков оно обрывается на середине мысли, и вместо ответа наружу
     уходит его начало. Четыре ответа были перечислениями, где список и есть
     ответ: у них первым идёт короткое утверждение, перечень — следом. */
  const длинные = данные.answers
    .map((a) => [a.question, (a.answer.replace(/<[^>]+>/g, '').split(/(?<=[.!?])\s+/)[0] || '').length])
    .filter(([, n]) => n > 240);
  if (длинные.length) {
    fail(`первое предложение ответа длиннее 240 знаков — в выдержку войдёт обрывок: ${длинные.slice(0, 3).map(([q, n]) => `${q} (${n})`).join(' | ')}`);
  } else ok('первое предложение каждого ответа умещается в выдержку');
}

/* Файлы для машин обязаны лежать в сборке, а не только в основаниях проекта.
   llms.txt писался прямо для обходчиков языковых моделей и не попадал на сайт
   вовсе; pricing.md был на него сослан и тоже отсутствовал — ссылка из файла
   для машин вела в никуда. И числа в нём должны совпадать с содержимым:
   «78 ответов» переживёт семьдесят девятый и соврёт. */
{
  const данные = JSON.parse(readFileSync(resolve('site/lib/content.json'), 'utf8'));
  for (const имя of ['llms.txt', 'robots.txt', 'sitemap.xml', 'pricing.md']) {
    if (!existsSync(join(OUT, имя))) fail(`файл для машин не попал в сборку: /${имя}`);
  }
  const l = existsSync(join(OUT, 'llms.txt')) ? readFileSync(join(OUT, 'llms.txt'), 'utf8') : '';
  if (l) {
    const заявлено = Number((l.match(/\[(\d+) ответов/) || [])[1] || 0);
    if (заявлено !== данные.answers.length) {
      fail(`llms.txt заявляет ${заявлено} ответов, на сайте ${данные.answers.length}`);
    }
    for (const m of l.matchAll(/\]\((\/[^)]*)\)/g)) {
      const путь = m[1].replace(/\/$/, '');
      const естьСтраница = files.some((f) => `/${relative(OUT, f).replace(/index\.html$/, '').replace(/\/$/, '')}` === путь);
      if (!естьСтраница && !existsSync(join(OUT, путь.slice(1)))) {
        fail(`llms.txt ссылается в никуда: ${m[1]}`);
      }
    }
    /* В машиночитаемых файлах не должно остаться внутренней нотации: скобки
       вида «[ФАКТ: вилка]» и «[подтвердить]» писались для нас, а читает их
       агент, у которого нет ни вёрстки, ни контекста пометки. */
    const цены = existsSync(join(OUT, 'pricing.md')) ? readFileSync(join(OUT, 'pricing.md'), 'utf8') : '';
    const нотация = цены.match(/\[(?:ФАКТ|подтвердить)[^\]]*\]/g);
    if (нотация) fail(`в pricing.md осталась внутренняя нотация: ${[...new Set(нотация)].slice(0, 2).join(', ')}`);
    /* Число с единицей, которого нет на сайте, — это факт, существующий
       только для машин. Так в файле цен оказалось «400 м²»: площадь, которую
       сайт не называет нигде. Файлы для агентов пересказывают сайт, а не
       дополняют его. */
    const сайт = JSON.stringify(данные);
    for (const [имя, текст] of [['llms.txt', l], ['pricing.md', цены]]) {
      const числа = [...new Set(текст.match(/\d+[\d\s—–-]*(?:м²|млн|тыс|₽|года|лет|%)/g) || [])];
      const лишние = числа.filter((n) => !сайт.includes(n.trim()));
      if (лишние.length) fail(`${имя} называет числа, которых нет на сайте: ${лишние.slice(0, 3).join(', ')}`);
    }
    ok(`файлы для машин на месте, llms.txt сходится с содержимым (${заявлено} ответов)`);
  }
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
    ok('поиск: основа слова, набор по мере ввода и развёрнутая часть — на месте; внутри слов не совпадает');
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
    ok(`калькулятор: состояний перебрано ${stages.length * 4}, состав выдан, непомеченных цен нет`);
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
    /* Маска проходимости и нарисованный план обязаны быть одним файлом.
       Их было два, с разной высотой и расхождением альфы на 3,64%: житель
       проходил сквозь нарисованную стену и упирался в пустое место, а в
       тёмной теме план вдобавок не читался — 1,36 : 1 против 15,2 : 1. */
    const plan = await pg.evaluate(() => {
      const st = document.querySelector('.house-stage');
      if (!st) return null;
      const drawn = getComputedStyle(st, '::before').backgroundImage || '';
      const m = drawn.match(/\/plan\/[^"')]+/);
      return { маска: st.getAttribute('data-mask'), рисуется: m ? m[0] : null };
    });
    if (!plan || !plan.маска) fail('план не объявляет файл маски проходимости');
    else if (plan.маска !== plan.рисуется) {
      fail(`маска проходимости ${plan.маска} не совпадает с нарисованным планом ${plan.рисуется}`);
    }
    /* На экране, куда нельзя навести, план обязан показывать себя сам.
       На телефоне следы шли только за намеренной протяжкой пальцем, о которой
       нигде не сказано: касание не давало ничего, и главный элемент страницы
       выглядел тёмным прямоугольником. И обратное: при запрете анимации
       житель не ходит — движение без спроса не украшение. */
    {
      const mob = await browser.newContext({ viewport: { width: 390, height: 844 },
        isMobile: true, hasTouch: true });
      const mp = await mob.newPage();
      mp.on('pageerror', (e) => { mp.evaluate((m) => { window.__err = m; }, String(e)).catch(() => {}); });
      await mp.goto(`${ORIGIN}/`, { waitUntil: 'networkidle' });
      /* Считаем появления накопительно, а не следы в моменте: след живёт
         полторы секунды и гаснет, между двумя шагами на плане бывает пусто,
         и мгновенный замер давал ложный ноль на занятой машине. */
      await mp.evaluate(() => {
        const stage = document.querySelector('.house-stage');
        window.__steps = 0;
        if (!stage) return;
        new MutationObserver((rows) => {
          for (const r of rows) {
            for (const n of r.addedNodes) {
              if (n.nodeType === 1 && n.classList.contains('footprint')) window.__steps += 1;
            }
          }
        }).observe(stage, { childList: true });
        stage.scrollIntoView({ block: 'center' });
      });
      /* Бюджет с запасом. Проверяемое свойство — «план ходит сам», а не
         «ходит за шесть секунд»: замер внутри полного прогона дал разброс
         403–4864 мс, потому что к этому месту машина занята полутора десятками
         закрытых контекстов. В изоляции стабильные 512 мс, то есть настоящему
         телефону это не грозит; тесная рамка ловила загрузку машины, а не
         дефект сайта. Двенадцати секунд тоже не хватило, когда рядом шёл стенд
         мутаций: проверяемое свойство — «ходит сам», без обещания срока. */
      let walked = 0;
      for (let i = 0; i < 60 && !walked; i += 1) {
        await mp.waitForTimeout(400);
        walked = await mp.evaluate(() => window.__steps || 0);
      }
      if (!walked) {
        /* Диагностика на месте: без неё отказ раз в несколько прогонов
           невозможно отличить от настоящего дефекта. */
        const why = await mp.evaluate(() => {
          const st = document.querySelector('.house-stage');
          const r = st?.getBoundingClientRect();
          return { сцена: !!st, наведения: matchMedia('(hover: none)').matches,
            анимация: matchMedia('(prefers-reduced-motion: reduce)').matches,
            верх: r ? Math.round(r.top) : null, низ: r ? Math.round(r.bottom) : null,
            экран: window.innerHeight, ошибки: window.__err || null };
        });
        fail(`на телефоне план стоит мёртвым: без касания ни одного следа (${JSON.stringify(why)})`);
      }
      await mob.close();

      const calm = await browser.newContext({ viewport: { width: 390, height: 844 },
        isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
      const cp = await calm.newPage();
      await cp.goto(`${ORIGIN}/`);
      await cp.evaluate(() => document.querySelector('.house-stage')?.scrollIntoView({ block: 'center' }));
      await cp.waitForTimeout(2200);
      const moved = await cp.evaluate(() => document.querySelectorAll('.footprint').length);
      if (moved) fail(`при запрете анимации житель всё равно ходит: следов ${moved}`);
      await calm.close();
      ok('план на телефоне: ходит сам, при запрете анимации стоит');
    }

    ok(`модель дома: сценариев ${btns.length}, состояние объявляемо, следов за 14 шагов ${best}; маска совпадает с планом`);
  }
  await c.close();
}

await browser.close();
server.close();

console.log(`страниц: ${files.length}`);
console.log(`уникальных: title ${titles.size} · description ${descs.size} · canonical ${canons.size}`);
console.log(`минимум текста в HTML: ${minText} знаков (${minTextPage})`);

report();
