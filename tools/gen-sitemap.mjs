#!/usr/bin/env node
/**
 * Карта сайта собирается из собранных страниц.
 *
 * Раньше файл вёлся руками: 138 адресов, и каждый новый ответ надо было не
 * забыть вписать. Один забыли — страница есть, а в карте её нет, и проверка
 * поймала это ровно в тот день, когда ответ добавили. Файл, который ведут
 * руками рядом с генератором, устаревает молча.
 */
import { readdirSync, statSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { resolve, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'site/out');
if (!existsSync(OUT)) {
  console.error('нет site/out — сначала соберите сайт');
  process.exit(1);
}

const urls = [];
(function walk(dir) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) { if (e !== '_next') walk(p); continue; }
    if (e !== 'index.html') continue;
    const u = `/${relative(OUT, p).replace(/index\.html$/, '')}`;
    /* Страницы ошибок в карту не идут: они не должны индексироваться. */
    if (/^\/(404|_not-found)\//.test(u)) continue;
    urls.push(u);
  }
})(OUT);
urls.sort((a, b) => a.localeCompare(b));

/* Приоритет и частота — по глубине адреса, а не проставленные вручную: у
   сотни страниц ответов они одинаковы по смыслу, и разнобой тут только шум. */
const rowOf = (u) => {
  const depth = u.split('/').filter(Boolean).length;
  if (u === '/') return ['weekly', '1.0'];
  if (u.startsWith('/answers/')) return ['monthly', '0.8'];
  return [depth <= 1 ? 'monthly' : 'monthly', depth <= 1 ? '0.9' : '0.7'];
};

/* Сборка — функция, потому что её нужно вызвать дважды: генератор, у которого
   второй запуск даёт другой файл, ломает всякую сверку, которая на него
   опирается. Ровно это и случилось: строка о происхождении добавлялась заново
   при каждом запуске, локально их накопилось три, конвейер сделал четвёртую
   и остановился на расхождении. */
const MARK = '  ФАЙЛ СОБИРАЕТСЯ tools/gen-sitemap.mjs ИЗ site/out. Руками не править.\n';
const SITEMAP = join(ROOT, 'site-foundation/sitemap.xml');

function build() {
  const head = readFileSync(SITEMAP, 'utf8')
    .match(/^<\?xml[\s\S]*?-->/)[0]
    .split('\n').filter((l) => !l.includes('ФАЙЛ СОБИРАЕТСЯ')).join('\n')
    .replace(/\n\s*3\. \d+ страниц-рычагов/, '\n  3. Страницы-рычаги')
    .replace(/^(<!--\n)/m, `$1${MARK}`);
  const body = urls.map((u) => {
    const [freq, pri] = rowOf(u);
    return `  <url>\n    <loc>BASE_URL${u === '/' ? '/' : u.replace(/\/$/, '')}</loc>\n`
      + `    <changefreq>${freq}</changefreq>\n    <priority>${pri}</priority>\n  </url>`;
  }).join('\n');
  return `${head}\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

const first = build();
writeFileSync(SITEMAP, first, 'utf8');
const second = build();
if (second !== first) {
  console.error('сборка карты не идемпотентна: второй запуск дал другой файл');
  process.exit(1);
}
console.log(`site-foundation/sitemap.xml: адресов ${urls.length}`);
