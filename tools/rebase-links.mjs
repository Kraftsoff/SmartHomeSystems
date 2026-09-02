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
/* Собранные скрипты и стили правятся отдельно и по-другому: там нельзя
   переставлять любой адрес подряд — под правило попали бы маршруты и куски
   регулярных выражений. Заменяем только те строки, которые дословно совпадают
   с реально лежащим в сборке файлом. */
const сборка = [];
(function walk(d) {
  for (const e of readdirSync(d)) {
    const p = join(d, e);
    if (statSync(p).isDirectory()) walk(p);
    else if (e.endsWith('.html') || e.endsWith('.txt') || e.endsWith('.xml')) files.push(p);
    else if (e.endsWith('.js') || e.endsWith('.css')) сборка.push(p);
  }
})(OUT);

/* Только корневые адреса и только те, что ещё не переставлены. Внешние
   (со схемой), якорные и уже префиксованные не трогаем. */
const re = new RegExp(`((?:href|src|action)=")/(?!/|${BASE.slice(1)}/)`, 'g');

/* srcset отдельно: там не один адрес, а список через запятую, и обычное
   правило по `src="` до второго кандидата не достаёт. Браузер выбирает кадр
   именно из srcset, поэтому непереставленный список ломает картинку целиком —
   даже когда src рядом переставлен правильно. Так и вышло: на витрине были
   битыми все пятнадцать кадров, а на боевом корне те же файлы работали. */
const reSrcset = /srcset="([^"]+)"/g;
const переставить = (адрес) =>
  адрес.startsWith('/') && !адрес.startsWith('//') && !адрес.startsWith(`${BASE}/`)
    ? `${BASE}${адрес}` : адрес;

let правок = 0, задето = 0;
for (const f of files) {
  const s = readFileSync(f, 'utf8');
  let n = s.replace(re, (_, a) => { правок += 1; return `${a}${BASE}/`; });
  n = n.replace(reSrcset, (всё, список) => {
    const новый = список.split(',').map((часть) => {
      const куски = часть.trim().split(/\s+/);
      const было = куски[0];
      куски[0] = переставить(куски[0]);
      if (куски[0] !== было) правок += 1;
      return куски.join(' ');
    }).join(', ');
    return `srcset="${новый}"`;
  });
  if (n !== s) { writeFileSync(f, n, 'utf8'); задето += 1; }
}
/* Пути к файлам из public, зашитые в скрипты и стили. Картинка плана лежала
   строкой в бандле и строкой в CSS: перестановка корня их не касалась, на
   витрине она отдавала 404, и план выходил пустым чёрным прямоугольником —
   ровно то, что увидел клиент. Правило по HTML этого поймать не могло. */
const публичные = [];
(function собрать(d, база) {
  for (const e of readdirSync(d)) {
    const p = join(d, e);
    if (statSync(p).isDirectory()) { if (e !== '_next') собрать(p, `${база}${e}/`); continue; }
    if (/\.(png|jpe?g|webp|avif|svg|gif|woff2?|mp4|webm|md|json)$/i.test(e)) публичные.push(`${база}${e}`);
  }
})(OUT, '/');

let вБандле = 0;
for (const f of сборка) {
  const s = readFileSync(f, 'utf8');
  let n = s;
  for (const адрес of публичные) {
    const экран = адрес.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    n = n.replace(new RegExp(`(["'(])${экран}(?=["')])`, 'g'), (_, q) => { вБандле += 1; return `${q}${BASE}${адрес}`; });
  }
  if (n !== s) writeFileSync(f, n, 'utf8');
}

console.log(`корень ссылок переставлен на ${BASE}: правок ${правок}, файлов ${задето}`);
console.log(`адресов файлов внутри скриптов и стилей переставлено: ${вБандле}`);

/* Проверка на месте. Каждый корневой адрес в собранных файлах обязан начинаться
   с нового корня; всё, что осталось корневым, на витрине ведёт в пустоту, и
   заметить это можно только открыв страницу глазами. Один такой адрес уже
   проехал — список в srcset. */
const остались = new Set();
for (const f of сборка) {
  const s = readFileSync(f, 'utf8');
  for (const адрес of публичные) {
    const экран = адрес.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`(["'(])${экран}(?=["')])`).test(s)) остались.add(`${адрес} (в сборке)`);
  }
}
for (const f of files.filter((f) => f.endsWith('.html'))) {
  const s = readFileSync(f, 'utf8');
  for (const m of s.matchAll(/(?:href|src|action)="(\/[^"]*)"/g)) {
    if (!m[1].startsWith('//') && !m[1].startsWith(`${BASE}/`) && m[1] !== '/') остались.add(m[1]);
  }
  for (const m of s.matchAll(/srcset="([^"]+)"/g)) {
    for (const часть of m[1].split(',')) {
      const адрес = часть.trim().split(/\s+/)[0];
      if (адрес.startsWith('/') && !адрес.startsWith('//') && !адрес.startsWith(`${BASE}/`)) остались.add(адрес);
    }
  }
}
if (остались.size) {
  console.error(`адреса остались корневыми и на витрине ведут в пустоту: ${[...остались].slice(0, 8).join(', ')}`);
  process.exit(1);
}
console.log(`корневых адресов мимо ${BASE} не осталось`);
