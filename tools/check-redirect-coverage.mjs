#!/usr/bin/env node
/**
 * Сверяет карту редиректов с реальным списком проиндексированных URL.
 *
 * Зачем: карта собрана перебором поисковой выдачи, а выдача показывает верхушку
 * индекса, не весь индекс. Полный список даёт выгрузка «Страницы в поиске» из
 * Яндекс.Вебмастера (или Search Console). Этот скрипт превращает сверку из ручной
 * работы в одну команду и печатает ровно то, чего не хватает.
 *
 *   node tools/check-redirect-coverage.mjs <выгрузка.csv|.tsv|.txt> [ещё файлы…]
 *
 * Формат входа не важен: скрипт вытаскивает всё, что похоже на URL наших доменов,
 * из любого текстового файла — CSV, TSV, список строк, скопированная таблица.
 * Для .xlsx сначала «Сохранить как CSV»: разбор бинарного формата сюда не тянем.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const MAP = 'site-foundation/redirects.md';
const DOMAINS = ['mmsmart.ru', 'mimismart.ru', 'mimismart.com', 'mmsmart-russia.ru', 'mimismart-home.ru'];

const files = process.argv.slice(2);
if (!files.length) {
  console.error('Укажите файл выгрузки: node tools/check-redirect-coverage.mjs pages.csv');
  console.error('Вебмастер → Индексирование → Страницы в поиске → Скачать. Один файл на домен.');
  process.exit(2);
}

/* ---- 1. Что уже покрыто картой ---- */
const map = readFileSync(resolve(MAP), 'utf8');
const sources = new Set(
  [...map.matchAll(/source: '([^']+)'/g)].map((m) => norm(m[1])),
);

/* ---- 2. Что реально в индексе ---- */
const found = new Map(); // путь → набор доменов, где он встретился
let rawCount = 0;
for (const f of files) {
  const text = readFileSync(resolve(f), 'utf8');
  const re = new RegExp(`https?://(?:www\\.)?(${DOMAINS.join('|').replace(/\./g, '\\.')})(?::\\d+)?(/[^\\s"'<>,;]*)?`, 'gi');
  for (const m of text.matchAll(re)) {
    rawCount++;
    const domain = m[1].toLowerCase();
    const path = norm(m[2] || '/');
    if (!found.has(path)) found.set(path, new Set());
    found.get(path).add(domain);
  }
}

/* Нормализуем так же, как это должен делать сервер: без хвостового слэша,
   без index.html, без порта, в нижнем регистре. Иначе одна и та же страница
   посчитается непокрытой из-за косметики. */
function norm(p) {
  let x = decodeURIComponent(p).split('#')[0].split('?')[0].toLowerCase();
  x = x.replace(/\/index\.html?$/, '/');
  x = x.replace(/\/+$/, '');
  return x || '/';
}

/* ---- 3. Расхождения ---- */
const uncovered = [...found.keys()].filter((p) => !sources.has(p)).sort();
const unusedRules = [...sources].filter((s) => !found.has(s)).sort();

const total = found.size;
const covered = total - uncovered.length;
const pct = total ? Math.round((covered / total) * 100) : 0;

console.log(`Файлов на входе: ${files.length}. Ссылок найдено: ${rawCount}, уникальных путей: ${total}.`);
console.log(`Правил в карте: ${sources.size}.`);
console.log(`\nПокрыто картой: ${covered} из ${total} (${pct}%)\n`);

if (uncovered.length) {
  console.log(`❌ НЕ ПОКРЫТО — уйдёт в 404 при переезде: ${uncovered.length}`);
  for (const p of uncovered) console.log(`   ${p}   [${[...found.get(p)].join(', ')}]`);
  console.log('\nКаждую строку нужно либо добавить в карту с адресной целью, либо');
  console.log('осознанно отдать 410, если страница больше не нужна. Молчаливый 404 — худший из трёх.');
} else {
  console.log('✅ Все проиндексированные URL покрыты картой.');
}

if (unusedRules.length) {
  console.log(`\n⚠️ Правила, которых нет в выгрузке: ${unusedRules.length}`);
  console.log('   Это не ошибка: страница могла выпасть из индекса, но внешние ссылки на неё');
  console.log('   остались, и правило продолжает работать. Удалять только по логам сервера.');
  for (const p of unusedRules.slice(0, 40)) console.log(`   ${p}`);
  if (unusedRules.length > 40) console.log(`   … ещё ${unusedRules.length - 40}`);
}

process.exit(uncovered.length ? 1 : 0);
