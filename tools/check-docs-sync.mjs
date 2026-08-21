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

/* Что считаем истиной. Маршруты сюда не берём: их знает только браузер,
   их проверяет tools/accept.mjs. */
const TRUTH = {
  'рычаг(?:ов|а|)': faq,
  'правил(?:а|о|) в конфиге': rules,
  'URL в sitemap': urls,
};

const problems = [];
function walk(dir) {
  for (const e of readdirSync(dir)) {
    if (SKIP_DIRS.has(e)) continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p);
    else if (e.endsWith('.md')) check(p);
  }
}
function check(file) {
  const lines = readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, i) => {
    if (line.includes('<!--sync-ok-->')) return;
    for (const [word, actual] of Object.entries(TRUTH)) {
      /* Границу слова через \b брать нельзя: в JavaScript она определена по
         [A-Za-z0-9_], и после кириллицы не срабатывает вообще. Нужен юникодный
         просмотр вперёд с флагом u. */
      const re = new RegExp(`\\*{0,2}(\\d+)\\*{0,2}\\s+${word}(?!\\p{L})`, 'giu');
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
  console.log(`✅ Документы сходятся с прототипом: ${faq} рычагов, ${rules} правил, ${urls} URL в sitemap.`);
  process.exit(0);
}
console.log(`❌ Расхождений документов с фактом: ${problems.length}\n`);
for (const p of problems) {
  console.log(`${p.file}:${p.line}  заявлено ${p.claimed}, фактически ${p.actual}`);
  console.log(`   ${p.text}`);
}
console.log('\nЛибо поправить число, либо пометить строку <!--sync-ok-->, если она про прошлое.');
process.exit(1);
