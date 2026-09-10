#!/usr/bin/env node
/**
 * Ловит расхождение между тем, что документы утверждают о прототипе, и тем,
 * что в прототипе на самом деле.
 *
 * Зачем: числа в ТЗ и аудитах пишутся в разные моменты, прототип растёт, и
 * документ незаметно начинает врать. Один раз это уже привело к тому, что
 * работа велась по устаревшей картине файла.
 *
 * Историческое исключается: backups/ и site-snapshot/ описывают прошлое
 * состояние намеренно. Внутри строки можно поставить <!--sync-ok--> — тогда
 * число считается осознанно историческим.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const PROTO = 'tz-site/prototype/mimismart-v5.html';
const SKIP_DIRS = new Set(['node_modules', '.git', 'backups', 'site-snapshot']);

const html = readFileSync(PROTO, 'utf8');
/* Число рычагов берём по карточкам, а НЕ по разметке FAQPage: разметка —
   осознанное подмножество, из неё исключены ответы с непроверенным в прямой
   части. Считать по ней значит объявить устаревшими все документы разом. */
const levers = [...html.matchAll(/<section class="cluster"[^>]*>([\s\S]*?)<\/section>/g)]
  .reduce((n, m) => n + (m[1].match(/<div class="card reveal">/g) || []).length, 0);
const faq = JSON.parse(html.match(/id="ldFaq">(.*?)<\/script>/s)[1]).mainEntity.length;
const cards = (html.match(/<div class="card reveal">/g) || []).length;
const templates = (html.match(/<template class="more">/g) || []).length;

const redirects = readFileSync('site-foundation/redirects.md', 'utf8');
const cfgStart = redirects.indexOf('## Next.js-конфиг');
const cfgEnd = redirects.indexOf('# Часть B.');
const rules = (redirects.slice(cfgStart, cfgEnd).match(/source: '/g) || []).length;

/* Комментарии вырезаем: внутри них лежат примеры разметки для будущих разделов,
   и без этого проверка считает несуществующие URL. */
const sitemap = readFileSync('site-foundation/sitemap.xml', 'utf8').replace(/<!--[\s\S]*?-->/g, '');
const urls = (sitemap.match(/<loc>/g) || []).length;
/* Уникальные тексты пометок в прототипе: дубли из подвала считаются один раз. */
/* Часть пометок лежит не в разметке, а в конфиге маршрутов как поле prov —
   их подставляет скрипт. Считая только разметку, список занижался на четыре. */
/* Версия из имени файла прототипа — с ней сверяется плашка на экране. */
const protoVersion = Number((PROTO.match(/-v(\d+)\.html$/) || [])[1] || 0);
const provUnique = new Set([
  ...[...html.matchAll(/class="prov"[^>]*>([^<]{3,})</g)].map((m) => m[1]),
  ...[...html.matchAll(/prov:'([^']{3,})'/g)].map((m) => m[1]),
].map((t) => t.replace(/\s+/g, ' ').trim())
  /* Отсекаем куски шаблона вроде '+sub.prov+': настоящая пометка начинается со знака. */
  .filter((t) => t.startsWith('⚠️'))).size;

/* Что считаем истиной. Маршруты сюда не берём: их знает только браузер,
   их проверяет tools/accept.mjs. */
const TRUTH = {
  'рычаг(?:ов|а|)': levers,
  /* «ответов на вопросы» — тот же итог другими словами: в llms.txt стояло
     «75 ответов» при фактических 77. Формулировку берём узкую: слово «ответов»
     само по себе встречается в диапазонах («от 4 до 12 ответов») и в рассказе
     о прошлом состоянии, и там подменять число нельзя. */
  'ответ(?:ов|а|) на вопрос(?:ы|а|)': levers,
  /* И ещё одна формулировка того же итога — «N страниц ответов». Стояла в
     yandex-first.md с числом 75 при фактических 77. */
  'страниц(?:а|ы|) ответов': levers,
  'правил(?:а|о|) в конфиге': rules,
  'URL в sitemap': urls,
  /* Чек-лист пометок — то, по чему клиент заполняет факты. Он уже расходился
     с сайтом на четырнадцать пунктов и занижал объём работы. */
  'пометок к заполнению': provUnique,
  /* Число записей в разметке отличается от числа рычагов: ответы с непроверенным
     в прямой части в FAQPage не идут. Документы называли и его, но сверялось оно
     ни с чем — в одном месте стояло 64 при фактических 66. */
  'в разметке FAQPage': faq,
};

const problems = [];

/* Плашка прототипа называет версию, и она расходилась с именем файла: на экране
   стояло v4 при mimismart-v5.html. Документы тут ни при чём — проверяем сам файл. */
{
  const shown = (html.match(/Прототип v(\d+)/) || [])[1];
  if (shown && Number(shown) !== protoVersion) {
    problems.push({ file: PROTO, line: 0, claimed: Number(shown), actual: protoVersion,
      word: 'версия в плашке', text: `плашка говорит v${shown}, файл — v${protoVersion}` });
  }
}
function walk(dir) {
  for (const e of readdirSync(dir)) {
    if (SKIP_DIRS.has(e)) continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p);
    /* llms.txt тоже называет числа и тоже устаревает: там стояло «75 ответов»
       при фактических 77, и никакой инструмент на него не смотрел, потому что
       проверялись только .md. */
    else if (e.endsWith('.md') || e === 'llms.txt') check(p);
  }
}
function check(file) {
  const lines = readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, i) => {
    /* Метка может нести причину: «<!--sync-ok: числа фиксируют замер-->».
       Причина полезнее голой метки — по ней видно, почему число не трогают. */
    if (line.includes('<!--sync-ok')) return;
    for (const [word, actual] of Object.entries(TRUTH)) {
      /* Границу слова через \b брать нельзя: в JavaScript она определена по
         [A-Za-z0-9_], и после кириллицы не срабатывает вообще. Нужен юникодный
         просмотр вперёд с флагом u. */
      /* Обычный порядок «N слово», но для «в разметке FAQPage N» число идёт
         после — поддерживаем оба, иначе формулировка не сверяется вовсе. */
      const re = word.startsWith('в разметке')
        ? new RegExp(`${word}\\s+\\*{0,2}(\\d+)`, 'giu')
        : new RegExp(`\\*{0,2}(\\d+)\\*{0,2}\\s+${word}(?!\\p{L})`, 'giu');
      for (const m of line.matchAll(re)) {
        const claimed = Number(m[1]);
        if (claimed !== actual) {
          problems.push({ file: relative('.', file), line: i + 1, claimed, actual, word, text: line.trim().slice(0, 90) });
        }
      }
    }
  });
}
walk('.');

if (!problems.length) {
  console.log(`✅ Документы сходятся с прототипом: ${levers} рычагов (в разметке FAQPage ${faq}), ${rules} правил, ${urls} URL в sitemap.`);
  process.exit(0);
}
console.log(`❌ Расхождений документов с фактом: ${problems.length}\n`);
for (const p of problems) {
  console.log(`${p.file}:${p.line}  заявлено ${p.claimed}, фактически ${p.actual}`);
  console.log(`   ${p.text}`);
}
console.log('\nЛибо поправить число, либо пометить строку <!--sync-ok-->, если она про прошлое.');
process.exit(1);
