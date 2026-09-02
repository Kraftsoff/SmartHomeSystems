#!/usr/bin/env node
/**
 * Выгружает содержимое прототипа в структурированный JSON.
 *
 * Зачем: сейчас весь контент живёт внутри одного HTML-файла, и перенос на любой
 * стек начинается с ручного выковыривания. Эта выгрузка — то, что переносится:
 * 75 ответов с прямым ответом, развёрнутой частью и кластером, плюс страницы
 * разделов. Решение по SSR (A4 в tz-site/16) на неё не влияет: JSON пригодится
 * и Next.js, и любому другому генератору, и просто как резервная копия текста.
 *
 *   node tools/export-content.mjs [файл.json]
 *
 * Выгрузка идёт из ИСХОДНИКА, без браузера: содержимое <template> в DOM не
 * попадает, а нам нужно именно оно.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SRC = 'tz-site/prototype/mimismart-v5.html';
const OUT = process.argv[2] || 'site-foundation/content-export.json';
const html = readFileSync(resolve(SRC), 'utf8');

/* Слаг строится тем же алгоритмом, что в прототипе: иначе выгрузка разъедется
   с URL, по которым уже настроены редиректы. */
const TR = { а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ж:'zh',з:'z',и:'i',й:'y',к:'k',л:'l',м:'m',
  н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',х:'h',ц:'c',ч:'ch',ш:'sh',щ:'sch',
  ъ:'',ы:'y',ь:'',э:'e',ю:'yu',я:'ya' };
function slugify(t) {
  const x = t.toLowerCase().replace(/[«»"'`]/g, '').replace(/ё/g, 'е');
  let o = '';
  for (const c of x) o += TR[c] !== undefined ? TR[c] : c;
  return o.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').split('-').slice(0, 7).join('-');
}
const text = (s) => s.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ')
  .replace(/&laquo;/g, '«').replace(/&raquo;/g, '»').replace(/&mdash;/g, '—')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/\s+/g, ' ')
  /* Инлайновые теги при снятии превращаются в пробел, и перед знаком препинания
     остаётся лишний. Без этого выгрузка расходится с живой страницей на 11 ответах
     из 75 — везде, где стоит пометка ⚠️ в конце предложения. */
  .replace(/\s+([.,;:!?»)])/g, '$1')
  .trim();

const body = html.slice(html.indexOf('<section class="cluster"'));
const answers = [];
const seen = new Set();
for (const sec of body.matchAll(/<section class="cluster"[^>]*>([\s\S]*?)<\/section>/g)) {
  const cluster = text((sec[1].match(/class="cluster-h">([^<]*)</) || [, ''])[1]);
  for (const card of sec[1].matchAll(/<div class="card reveal">([\s\S]*?)(?=<div class="card reveal">|<\/div>\s*<\/div>\s*$)/g)) {
    const c = card[1];
    const q = (c.match(/<h3[^>]*>([\s\S]*?)<\/h3>/) || [])[1];
    const a = (c.match(/<p>([\s\S]*?)<\/p>/) || [])[1];
    if (!q || !a) continue;
    const question = text(q);
    let slug = slugify(question);
    while (seen.has(slug)) slug += '-2';
    seen.add(slug);
    const more = (c.match(/<template class="more">([\s\S]*?)<\/template>/) || [])[1] || '';
    answers.push({
      slug,
      url: `/answers/${slug}`,
      cluster,
      kicker: text((c.match(/class="kicker">([^<]*)</) || [, ''])[1]),
      question,
      answer: text(a),          /* прямой ответ — он же в разметке FAQPage */
      answerHtml: a.trim(),
      expandedHtml: more.trim(),
      expandedText: text(more),
      unverified: [...c.matchAll(/class="prov">([^<]*)</g)].map((m) => text(m[1])),
    });
  }
}

/* Разделы и сравнения живут в конфигах роутера, а не в разметке: без них
   выгрузка описывает только ответы, и генератор пришлось бы дописывать руками. */
function jsBlock(name) {
  const i = html.indexOf(`var ${name}=`);
  if (i < 0) return {};
  let depth = 0, start = html.indexOf('{', i), j = start;
  for (; j < html.length; j += 1) {
    if (html[j] === '{') depth += 1;
    else if (html[j] === '}') { depth -= 1; if (!depth) break; }
  }
  const src = html.slice(start, j + 1);
  const out = {};
  /* Разбираем ключи верхнего уровня по позиции скобок, а не регуляркой:
     внутри значений есть и кавычки, и вложенные массивы. */
  const keyRe = /'([a-z0-9/-]+)':\s*\{/gi;
  let m;
  while ((m = keyRe.exec(src))) {
    let d = 1, k = keyRe.lastIndex;
    for (; k < src.length; k += 1) {
      if (src[k] === '{') d += 1;
      else if (src[k] === '}') { d -= 1; if (!d) break; }
    }
    const bodySrc = src.slice(keyRe.lastIndex, k);
    const field = (f) => {
      const r = new RegExp(`${f}:'((?:[^'\\\\]|\\\\.)*)'`);
      const mm = bodySrc.match(r);
      return mm ? mm[1].replace(/\\'/g, "'") : '';
    };
    const list = (f) => {
      const r = new RegExp(`${f}:\\[([\\s\\S]*?)\\]`);
      const mm = bodySrc.match(r);
      if (!mm) return [];
      /* Один обратный слэш, а не два. Было «\\\\.» — это требует ДВУХ слэшей
         подряд, и строка с обычным экранированием («class=\\"prov\\"») рвалась на
         середине: вместо шести пунктов получалось шесть запятых. Дефект лежал
         здесь с самого начала и молчал, пока в списках не появилось ни одного
         экранированного знака. */
      return [...mm[1].matchAll(/'((?:[^'\\]|\\.)*)'/g)].map((x) => x[1].replace(/\\'/g, "'"));
    };
    /* Массив массивов: таблица сравнения и мифы лежат так. Разбираем по
       вложенным скобкам, а не одной регуляркой — внутри строк есть и запятые,
       и кавычки. Без этого три страницы сравнений выходили без самого
       сравнения: заголовок «vs KNX» и ни одной строки таблицы. */
    const pairs = (f) => {
      const at = bodySrc.indexOf(`${f}:[`);
      if (at < 0) return [];
      let d = 0, k = at + f.length + 1;
      for (; k < bodySrc.length; k += 1) {
        if (bodySrc[k] === '[') d += 1;
        else if (bodySrc[k] === ']') { d -= 1; if (!d) break; }
      }
      const inner = bodySrc.slice(at + f.length + 2, k);
      return [...inner.matchAll(/\[([\s\S]*?)\]/g)]
        .map((row) => [...row[1].matchAll(/(['"])((?:[^\\]|\\.)*?)\1/g)]
          .map((c) => c[2].replace(/\\(['"])/g, '$1')));
    };
    out[m[1]] = {
      url: `/${m[1]}`,
      crumb: field('crumb'), eyebrow: field('eyebrow'), title: field('title'),
      label: field('label'),
      answerHtml: field('answer'), answer: text(field('answer')),
      items: list('items').map((x) => ({ html: x, text: text(x) })),
      risks: list('risks').map((x) => ({ html: x, text: text(x) })),
      prov: field('prov'),
      rows: pairs('rows'),
      myths: pairs('myths'),
      whenA: field('whenA'), whenB: field('whenB'),
    };
    keyRe.lastIndex = k;
  }
  return out;
}
/* Страницы-хабы и текстовые разделы живут прямо в разметке прототипа, а не в
   конфигах: без них выгрузка не покрывает десять адресов, на которые ведут
   редиректы. Берём внутренность секции как есть — там уже готовая вёрстка. */
/* Прототип жил на хэш-роутере: внутри страниц адреса вида "#/service" и свои
   хлебные крошки, обёрнутые ещё в один .shell. На настоящем сайте такой адрес
   никуда не ведёт — тридцать две ссылки вели в пустоту, — крошки удваиваются с
   теми, что рисует шаблон, а вложенная оболочка сдвигает всю страницу вправо.
   Приводим здесь, в выгрузке: контент входит в сайт единственной дверью. */
/* Подписи столбцов переносим в сами ячейки. На экране 390 px таблица из
   трёх-пяти столбцов нечитаема: подпись строки занимает треть ширины,
   описание переносится в семь строк, остальное уезжает за край — двадцать
   восемь сценариев так не прочесть. С этими подписями узкий экран
   раскладывает строку в блок, где у каждого значения видно, что это.
   Восемьдесят таблиц сайта приходят через выгрузку, поэтому и правка здесь. */
function labelCells(html) {
  return html.replace(/<table[\s\S]*?<\/table>/g, (table) => {
    const head = table.match(/<thead>([\s\S]*?)<\/thead>/);
    if (!head) return table;
    const cols = [...head[1].matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)]
      .map((m) => m[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim());
    if (!cols.length) return table;
    const body = table.match(/<tbody>([\s\S]*?)<\/tbody>/);
    if (!body) return table;
    const marked = body[1].replace(/<tr>([\s\S]*?)<\/tr>/g, (row, inner) => {
      let i = 0;
      const cells = inner.replace(/<(th|td)([^>]*)>/g, (_, tag, attrs) => {
        const label = cols[i] || '';
        i += 1;
        return label ? `<${tag}${attrs} data-col="${label.replace(/"/g, '&quot;')}">` : `<${tag}${attrs}>`;
      });
      return `<tr>${cells}</tr>`;
    });
    return table.replace(body[0], `<tbody>${marked}</tbody>`);
  });
}

function fixLinks(s) {
  return s
    .replace(/href="#\/"/g, 'href="/"')
    .replace(/href="#\/([^"]*?)\/?"/g, (_, path) => `href="/${path}/"`);
}
/* Пустой контейнер — это место, которое в прототипе наполнял скрипт, а
   заголовок над ним называет то, чего на собранном сайте нет. Перечислять
   идентификаторы по одному оказалось мало: fnIdx и solIdx в список не попали,
   и на направлениях с решениями остался заголовок над пустотой рядом с
   настоящим списком — два одинаковых заголовка подряд.

   Заголовку запрещено перешагивать через свой закрывающий тег: с ленивым
   квантификатором движок отматывался до следующего </h2> и уносил весь блок
   между ними — со страницы сравнений так пропала таблица. */
function stripEmpty(html) {
  /* Пустышки вложены одна в другую: убрав внутреннюю, обнажаем внешнюю.
     Повторяем, пока строка не перестанет меняться. */
  let prev;
  let out = html;
  do {
    prev = out;
    out = out.replace(/(?:<h2[^>]*>(?:(?!<\/h2>)[\s\S])*<\/h2>\s*)?<div[^>]*>\s*<\/div>\s*/g, '');
  } while (out !== prev);
  return out;
}

/* Сетка из шести карточек сметы уступает место диаграмме: шесть абзацев
   подряд человек не читает, а доли видны сразу. Тексты не теряются — они
   переезжают в сам компонент и остаются в разметке целиком, потому что их
   извлекает машина. Здесь остаётся метка, по которой шаблон разрезает
   страницу и вставляет диаграмму ровно туда, где были карточки. */
/* Раздел уступает место интерактивной подаче: на его место шаблон ставит
   компонент. Метка нужна, чтобы он встал именно туда, где о нём речь, —
   вставка в конец страницы оставляла бы и таблицу, и её замену. */
function вырезатьРаздел(seg, заголовок, метка) {
  const i = seg.indexOf(`<h2 class="cluster-h">${заголовок}</h2>`);
  if (i < 0) return seg;
  const начало = seg.lastIndexOf('<section', i);
  const конец = seg.indexOf('</section>', i);
  if (начало < 0 || конец < 0) return seg;
  return `${seg.slice(0, начало)}<!--${метка}-->${seg.slice(конец + '</section>'.length)}`;
}

function вырезатьКарточкиСметы(seg) {
  return вырезатьРаздел(
    вырезатьРаздел(
      вырезатьРаздел(seg, 'Из чего складывается смета', 'ESTIMATE-CHART'),
      'Что меняется от типа объекта', 'OBJECT-TYPES',
    ),
    'Двадцать восемь сценариев', 'SCENARIO-BOARD',
  );
}

function forRealSite(seg, ownUrl) {
  return вырезатьКарточкиСметы(stripEmpty(fixLinks(seg)
    .replace(/<p class="crumbs">[\s\S]*?<\/p>\s*/g, '')
    /* Вложенную оболочку снимаем классом, а не тегом. Регулярка по <div
       class="shell">…</div> закрывается на первом же </div> внутри — на
       странице цен от этого карточки вложились одна в другую вместо ряда.
       Тег остаётся на месте, уходит только отступ, который дублирует внешний. */
    .replace(/(<div[^>]*)\sclass="(?:sub-hero|shell)"/g, '$1')
    /* Калькулятор состава работ приезжал из прототипа статической формой,
       которую оживлял его же скрипт: на сайте это были поля, не делающие
       ничего. Логику перенесли в компонент, разметку убираем здесь вместе
       с заголовком — их приносит компонент. */
    /* Область с горизонтальной прокруткой обязана быть достижима клавиатурой:
       иначе до правой половины таблицы не добраться без мыши (WCAG 2.1.1).
       Роль и подпись нужны, чтобы озвучивалось, что это за область. */
    .replace(/<div class="tbl-wrap">/g,
      '<div class="tbl-wrap" tabindex="0" role="region" aria-label="Таблица, прокручивается вбок">')
    /* Карточка, обёрнутая в ссылку целиком, красит и подчёркивает каждый
       абзац внутри: на странице оборудования восемь карточек датчиков читались
       стеной подчёркнутого текста. Тот же дефект чинился в компонентах сайта,
       но в перенесённом содержимом он приехал своей копией. Ссылку оставляем
       на заголовке, кликабельность даёт растянутая область. */
    .replace(/<a class="([^"]*)card([^"]*)" href="([^"]*)">([\s\S]*?)<\/a>/g,
      (whole, pre, post, href, body) => {
        if (!/<h3[^>]*>/.test(body)) return whole;
        const cls = `${pre}card${post}`.replace(/card-link/g, '').replace(/\s+/g, ' ').trim();
        const inner = body.replace(/<h3([^>]*)>([\s\S]*?)<\/h3>/,
          (_, attrs, text) => `<h3${attrs}><a class="stretch" href="${href}">${text}</a></h3>`);
        return `<article class="${cls}">${inner}</article>`;
      })
    /* Кнопки прототипа открывали форму скриптом, которого на сайте нет:
       двенадцать кнопок не делали ничего. Превращаем в ссылки — цель берём
       из data-goal, всё остальное ведёт туда, где заявку принимают. */
    .replace(/<button([^>]*?)data-form([^>]*?)>([\s\S]*?)<\/button>/g, (_, a, b, text) => {
      const attrs = a + b;
      const goal = (attrs.match(/data-goal="([^"]+)"/) || [])[1];
      let href = goal === 'showroom' ? '/showroom/' : goal === 'partner' ? '/partners/' : '/contacts/';
      /* Кнопка, ведущая на страницу, где человек уже стоит, — тупик под видом
         действия: нажатие перезагружает то же место. Цель бралась только из
         data-goal, без оглядки на страницу, и на контактах, партнёрах и в
         шоуруме кнопки указывали сами на себя. На контактах уводим к форме,
         которая тут же на странице; в остальных случаях — туда, где заявку
         принимают. */
      if (ownUrl && href === `${ownUrl}/`) href = ownUrl === '/contacts' ? '#leadForm' : '/contacts/';
      const cls = (attrs.match(/class="([^"]+)"/) || [1, 'btn btn-ghost'])[1];
      return `<a class="${cls}" href="${href}">${text}</a>`;
    })
    /* Заголовок и абзац перед формой остаются: они объясняют, почему
       калькулятор не считает деньги. Уходит только сама форма. */
    .replace(/<div[^>]*id="calc"[\s\S]*?<div[^>]*id="cOut"[^>]*>\s*<\/div>\s*<\/div>\s*/g, ''))
    .trim());
}

const PAGE_URL = {
  'p-scenarios': '/scenarios', 'p-equipment': '/equipment', 'p-cases': '/portfolio', 'p-pricing': '/pricing',
  'p-privacy': '/privacy', 'p-showroom': '/showroom', 'p-functions-idx': '/functions',
  'p-solutions-idx': '/solutions', 'p-compare-idx': '/compare', 'p-partners': '/partners',
  'p-about': '/about', 'p-contacts': '/contacts',
};
const pages = {};
for (const [id, url] of Object.entries(PAGE_URL)) {
  const i = html.indexOf(`id="${id}"`);
  if (i < 0) continue;
  /* Конец страницы ищем по балансу тегов. Обрезка по первому </section>
     заканчивала сегмент на закрытии ВЛОЖЕННОЙ секции — разметка приезжала
     с незакрытым тегом, и любая чистка по ней вела себя непредсказуемо. */
  const open = html.lastIndexOf('<section', i);
  const first = html.indexOf('</section>', i);
  let depth = 0, j = open;
  for (; j < html.length; j += 1) {
    if (html.startsWith('<section', j)) depth += 1;
    else if (html.startsWith('</section>', j)) { depth -= 1; if (!depth) break; }
  }
  /* Если баланс не сошёлся — в прототипе есть страницы с незакрытой секцией —
     возвращаемся к первому закрытию. Иначе захват уезжает до конца файла:
     на контактах так набралось 132 КБ вместо четырёх. */
  const close = depth === 0 && j < html.length ? j : first;
  const seg = html.slice(html.indexOf('>', i) + 1, close);
  const h1 = seg.match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
  const eyebrow = seg.match(/class="eyebrow"[^>]*>([\s\S]*?)</);
  const lede = seg.match(/class="lede"[^>]*>([\s\S]*?)<\/(?:p|div)>/);
  pages[url] = {
    url, id,
    title: h1 ? text(h1[1]) : '',
    eyebrow: eyebrow ? text(eyebrow[1]) : '',
    lede: lede ? text(lede[1]) : '',
    html: forRealSite(seg, url),
    textLength: text(seg).length,
  };
}

/* Кейсы лежат в скрипте прототипа и вставляются на страницу уже в браузере,
   поэтому выгрузка страницы забирала пустой контейнер: на собранном сайте
   раздел «Реализованные объекты» открывался без единого объекта. Разбираем
   массив отдельно — читаем как данные, а не как разметку. */
function caseList() {
  const i = html.indexOf('var CASES=[');
  if (i < 0) return [];
  let depth = 0, start = html.indexOf('[', i), j = start;
  for (; j < html.length; j += 1) {
    if (html[j] === '[') depth += 1;
    else if (html[j] === ']') { depth -= 1; if (!depth) break; }
  }
  const src = html.slice(start, j + 1);
  const rows = Function(`"use strict";return ${src}`)();
  return rows.map((c) => ({
    title: c.t, stage: c.stage, pain: c.pain || '',
    task: c.task || '', systems: c.sys, result: c.res, tags: c.tags,
    /* Паспорт объекта: тип, площадь, город, год. Пустые поля не выдумываем —
       карточка просто не покажет строку, которой нет. */
    type: c.type || '', area: c.area || 0, city: c.city || '', year: c.year || '',
    /* Измеримый результат и то, что не получилось. Ни того, ни другого нет ни
       у одного игрока рынка — искали прицельно. */
    metric: c.metric || '', hard: c.hard || '',
  }));
}
const cases = caseList();

/* Сценарии разбираются из той же таблицы, что и показывались: двадцать восемь
   строк по три столбца. Вписывать их в компонент нельзя — вписанное разойдётся
   с источником при первой же правке текста, а источник тут один.

   Системы в третьем столбце названы по-разному в разных строках («свет»,
   «диммирование», «диммируемый свет»), поэтому сводятся к семействам. Это
   разбор нашего же текста, а не суждение о работе: каждое отнесение видно
   в таблице ниже и проверяется чтением. */
const СЕМЕЙСТВА = [
  ['Свет', ['свет', 'диммир', 'освещ']],
  /* «Приточная установка» не попадала ни в одно семейство: ключ был «приток»,
     а в тексте «приточная». Проверка ниже требует, чтобы без семейства не
     осталось ни одного сценария — иначе отбор молча теряет строку. */
  ['Климат', ['климат', 'приточ', 'приток', 'увлажн', 'co', 'отоплен', 'вытяж']],
  ['Шторы', ['штор']],
  ['Безопасность', ['охран', 'датчик движ', 'протеч', 'кран', 'камер', 'видеонабл', 'дым']],
  ['Мультимедиа', ['мультимедиа', 'мультирум']],
  ['Доступ', ['ворот', 'калитк', 'домофон']],
  ['Электрика', ['розетк']],
  ['Приложение', ['приложени', 'геолокац', 'расписан', 'лицензи', 'прав']],
];

function сценарии() {
  /* Читаем из исходного прототипа, а не из выгруженной страницы: к моменту
     разбора таблица из неё уже вырезана под замену, и сценариев оказывалось
     ноль. Порядок здесь важнее краткости. */
  const i = html.indexOf('<h2 class="cluster-h">Двадцать восемь сценариев</h2>');
  const h = i < 0 ? '' : html.slice(i, html.indexOf('</section>', i));
  const строки = [...h.matchAll(/<tr>([\s\S]*?)<\/tr>/g)]
    .map((m) => [...m[1].matchAll(/<(?:td|th)[^>]*>([\s\S]*?)<\/(?:td|th)>/g)].map((c) => c[1]))
    .filter((r) => r.length === 3);
  return строки.slice(1).map((r) => {
    const нужно = text(r[2]);
    const семьи = СЕМЕЙСТВА
      .filter(([, ключи]) => ключи.some((к) => нужно.toLowerCase().includes(к)))
      .map(([имя]) => имя);
    const имя = text(r[0]);
    return {
      номер: (имя.match(/^\d+/) || [''])[0],
      имя: имя.replace(/^\d+\.\s*/, ''),
      что: text(r[1]),
      чтоHtml: r[1].trim(),
      нужно,
      семьи,
    };
  });
}

/* Ни один сценарий не должен остаться без семейства: отбор по системам его
   просто не покажет, и строка исчезнет со страницы молча. */
{
  const без = сценарии().filter((s) => !s.семьи.length);
  if (без.length) {
    console.error(`сценарии без семейства систем: ${без.map((s) => s.имя).join(', ')}`);
    process.exit(1);
  }
}

const sections = jsBlock('SUB');
const comparisons = jsBlock('CMP');

/* Адреса из хэш-роутера встречаются не только в страницах, но и в ответах,
   разделах и сравнениях. Проходим по всему дереву один раз: пропустить ветку
   значит оставить ссылку, которая на сайте никуда не ведёт. */
function deepFixLinks(v) {
  /* Подписи столбцов ставим здесь же: таблицы живут не только в страницах,
     но и в ответах с развёрнутой частью — восемьдесят штук по всему сайту. */
  if (typeof v === 'string') return labelCells(fixLinks(v));
  if (Array.isArray(v)) return v.map(deepFixLinks);
  if (v && typeof v === 'object') {
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, deepFixLinks(x)]));
  }
  return v;
}

const out = {
  source: SRC,
  generated: 'проставляется при выгрузке',
  pages,
  scenarios: сценарии(),
  cases,
  sections,
  comparisons,
  counts: {
    pages: Object.keys(pages).length,
    cases: cases.length,
    scenarios: сценарии().length,
    sections: Object.keys(sections).length,
    comparisons: Object.keys(comparisons).length,
    answers: answers.length,
    withExpanded: answers.filter((a) => a.expandedHtml).length,
    unverifiedMarkers: answers.reduce((n, a) => n + a.unverified.length, 0),
    charsDirect: answers.reduce((n, a) => n + a.answer.length, 0),
    charsExpanded: answers.reduce((n, a) => n + a.expandedText.length, 0),
  },
  clusters: [...new Set(answers.map((a) => a.cluster))],
  answers,
};
/* Ни одна пометка о непроверенном не имеет права потеряться по дороге.
   Шесть таких пометок жили в поле `prov`, которого выгрузка не читала, и на
   сайт уезжали утверждения о пожарной безопасности, лицензии МЧС, порогах CO₂
   и времени переключения АВР — без оговорки, что данные не подтверждены.

   Сравниваем не весь файл, а только те места, откуда контент действительно
   берётся: конфиги разделов и сравнений плюс секции страниц из PAGE_URL.
   Главная прототипа и его собственные подписи в сравнение не идут — на сайте
   главная написана заново, и её пометки там свои. */
{
  const zones = [];
  for (const nm of ['SUB', 'CMP']) {
    const at = html.indexOf(`var ${nm}=`);
    if (at < 0) continue;
    let d = 0, k = html.indexOf('{', at);
    const from = k;
    for (; k < html.length; k += 1) {
      if (html[k] === '{') d += 1;
      else if (html[k] === '}') { d -= 1; if (!d) break; }
    }
    zones.push(html.slice(from, k + 1));
  }
  for (const url of Object.values(PAGE_URL)) {
    const rec = pages[url];
    if (rec) zones.push(rec.html);
  }
  const inZones = new Set(
    zones.flatMap((z) => [...z.matchAll(/⚠️\s*([^'"<]{6,90})/g)].map((m) => m[1].trim())),
  );
  const inOut = JSON.stringify(out);
  const lost = [...inZones].filter((t) => !inOut.includes(t));
  if (lost.length) {
    console.error(`выгрузка потеряла пометки о непроверенном: ${lost.length}`);
    lost.slice(0, 6).forEach((t) => console.error(`  · ${t}`));
    process.exit(1);
  }
  console.log(`пометок в источниках контента ${inZones.size}, все дошли до выгрузки`);
}

writeFileSync(resolve(OUT), JSON.stringify(deepFixLinks(out), null, 2) + '\n', 'utf8');
console.log(`${OUT}: ответов ${out.counts.answers}, из них с развёрнутой частью ${out.counts.withExpanded}`);
console.log(`кластеров ${out.clusters.length}, пометок ⚠️ ${out.counts.unverifiedMarkers}`);
console.log(`знаков: прямые ответы ${out.counts.charsDirect}, развёрнутая часть ${out.counts.charsExpanded}`);
