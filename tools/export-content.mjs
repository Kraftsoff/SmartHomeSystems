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
      return [...mm[1].matchAll(/'((?:[^'\\\\]|\\\\.)*)'/g)].map((x) => x[1].replace(/\\'/g, "'"));
    };
    out[m[1]] = {
      url: `/${m[1]}`,
      crumb: field('crumb'), eyebrow: field('eyebrow'), title: field('title'),
      label: field('label'),
      answerHtml: field('answer'), answer: text(field('answer')),
      items: list('items').map((x) => ({ html: x, text: text(x) })),
      risks: list('risks').map((x) => ({ html: x, text: text(x) })),
    };
    keyRe.lastIndex = k;
  }
  return out;
}
const sections = jsBlock('SUB');
const comparisons = jsBlock('CMP');

const out = {
  source: SRC,
  generated: 'проставляется при выгрузке',
  sections,
  comparisons,
  counts: {
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
writeFileSync(resolve(OUT), JSON.stringify(out, null, 2) + '\n', 'utf8');
console.log(`${OUT}: ответов ${out.counts.answers}, из них с развёрнутой частью ${out.counts.withExpanded}`);
console.log(`кластеров ${out.clusters.length}, пометок ⚠️ ${out.counts.unverifiedMarkers}`);
console.log(`знаков: прямые ответы ${out.counts.charsDirect}, развёрнутая часть ${out.counts.charsExpanded}`);
