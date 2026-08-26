#!/usr/bin/env node
/**
 * Приёмка собранного сайта. Работает с готовыми файлами из site/out — тем, что
 * реально уедет на хостинг, а не с исходником.
 *
 * Главное отличие от приёмки прототипа: там всё жило в одном документе и
 * проверялось через hash-маршруты. Здесь у каждого адреса свой файл, и именно
 * это надо подтвердить — что содержимое лежит в HTML до исполнения скриптов.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const OUT = resolve(process.argv[2] || 'site/out');
const problems = [];
const fail = (m) => problems.push(m);

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
    if (t.length > 60) fail(`${url}: title ${t.length} знаков вместо 60 и меньше`);
    titles.set(t, [...(titles.get(t) || []), url]);
  }

  const d = (s.match(/name="description" content="([^"]*)"/) || [])[1];
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
}

for (const [k, v] of titles) if (v.length > 1) fail(`один title на ${v.length} адресов: ${v.slice(0, 3).join(', ')}`);
for (const [k, v] of descs) if (v.length > 1) fail(`одно description на ${v.length} адресов: ${v.slice(0, 3).join(', ')}`);
for (const [k, v] of canons) if (v.length > 1) fail(`один canonical на ${v.length} адресов: ${v.slice(0, 3).join(', ')}`);

console.log(`страниц: ${files.length}`);
console.log(`уникальных: title ${titles.size} · description ${descs.size} · canonical ${canons.size}`);
console.log(`минимум текста в HTML: ${minText} знаков (${minTextPage})`);

if (problems.length) {
  console.log(`\n❌ НАРУШЕНИЙ: ${problems.length}`);
  problems.slice(0, 15).forEach((p) => console.log(`  · ${p}`));
  process.exit(1);
}
console.log('\n✅ Нарушений нет.');
