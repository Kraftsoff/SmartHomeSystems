#!/usr/bin/env node
/**
 * Переставляет корень внутренних ссылок в собранных файлах.
 *
 * GitHub Pages отдаёт витрину из подпапки. Переменная basePath у Next
 * переписывает только её собственные пути к скриптам и стилям; ссылки,
 * написанные обычным тегом <a href="/answers/">, остаются корневыми и на
 * Pages ведут в пустоту. Этот шаг правит собранные файлы: витрине — свой
 * корень, боевому домену — прежний, без единой правки в исходниках.
 *
 * Запуск: node tools/rebase-links.mjs /SmartHomeSystems
 */
import { readdirSync, statSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const BASE = process.argv[2];
if (!BASE || !BASE.startsWith('/')) {
  console.error('нужен корень, например: node tools/rebase-links.mjs /SmartHomeSystems');
  process.exit(2);
}
const OUT = resolve('site/out');

const files = [];
(function walk(d) {
  for (const e of readdirSync(d)) {
    const p = join(d, e);
    if (statSync(p).isDirectory()) walk(p);
    else if (e.endsWith('.html') || e.endsWith('.txt') || e.endsWith('.xml')) files.push(p);
  }
})(OUT);

/* Только корневые адреса и только те, что ещё не переставлены. Внешние
   (со схемой), якорные и уже префиксованные не трогаем. */
const re = new RegExp(`((?:href|src|action)=")/(?!/|${BASE.slice(1)}/)`, 'g');
let правок = 0, задето = 0;
for (const f of files) {
  const s = readFileSync(f, 'utf8');
  const n = s.replace(re, (_, a) => { правок += 1; return `${a}${BASE}/`; });
  if (n !== s) { writeFileSync(f, n, 'utf8'); задето += 1; }
}
console.log(`корень ссылок переставлен на ${BASE}: правок ${правок}, файлов ${задето}`);
