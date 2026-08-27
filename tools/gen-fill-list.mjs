#!/usr/bin/env node
/**
 * Список того, что ждёт данных клиента — собирается из выгрузки и исходников.
 *
 * Раньше файл велся руками и устаревал молча: он знал 76 пометок, когда на
 * сайте их было 79. Пометка, которой нет в списке, не попадёт ни в один
 * разговор с клиентом, то есть останется на сайте навсегда.

 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const data = JSON.parse(readFileSync(join(ROOT, 'site-foundation/content-export.json'), 'utf8'));


/* Пометки лежат внутри разметки в разных местах дерева: в ответах, в разделах,
   в страницах. Обходим всё одинаково и берём текст пометки вместе с тем, где
   она стоит — без места пункт непонятен. */
const found = new Map();
function walk(node, where) {
  if (typeof node === 'string') {
    for (const m of node.matchAll(/<span class="prov">⚠️\s*([^<]+)<\/span>/g)) {
      const text = m[1].replace(/\s+/g, ' ').trim();
      if (!found.has(text)) found.set(text, new Set());
      found.get(text).add(where);
    }
    return;
  }
  if (Array.isArray(node)) { for (const x of node) walk(x, where); return; }
  if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      walk(v, node.url || node.question || node.title || where);
    }
  }
}
walk(data.pages, 'страницы');
walk(data.sections, 'разделы');
walk(data.comparisons, 'сравнения');
walk(data.answers, 'ответы');

/* Оговорка раздела лежит отдельным полем, а не разметкой внутри текста:
   обход по <span class="prov"> её не видит. Шесть пометок — про пожарные
   датчики, лицензию МЧС, пороги CO₂, время АВР, линейки светильников и
   складской запас — не попали бы ни в один разговор с клиентом. */
for (const [where, dict] of [['разделы', data.sections], ['сравнения', data.comparisons]]) {
  for (const [key, rec] of Object.entries(dict)) {
    if (!rec.prov) continue;
    const text = rec.prov.replace(/^⚠️\s*/, '').replace(/\s+/g, ' ').trim();
    if (!text) continue;
    if (!found.has(text)) found.set(text, new Set());
    found.get(text).add(`${where}: /${key}/`);
  }
}

/* Часть пометок написана прямо в компонентах сайта, а не в контенте: подвал,
   форма, калькулятор. Список, собранный только из выгрузки, их не видел —
   и они не попали бы ни в один разговор с клиентом. */
import { readdirSync, statSync } from 'node:fs';
const APP = join(ROOT, 'site/app');
(function scan(dir) {
  for (const e of readdirSync(dir)) {
    const f = join(dir, e);
    if (statSync(f).isDirectory()) { scan(f); continue; }
    if (!/\.tsx?$/.test(e)) continue;
    const src = readFileSync(f, 'utf8');
    /* Пункт, который ждёт клиента, но не должен печататься на странице,
       пишется в комментарии исходника: спрятанная в разметке пометка звучит
       в программах чтения с экрана на каждой странице, а адресована она
       владельцу сайта, а не читателю. */
    for (const m of src.matchAll(/⚠️ ЖДЁТ КЛИЕНТА:\s*([^*\n]+)/g)) {
      const text = m[1].replace(/\s+/g, ' ').trim();
      if (!text) continue;
      if (!found.has(text)) found.set(text, new Set());
      found.get(text).add(`исходник ${e}`);
    }
    for (const m of src.matchAll(/className="prov">\s*⚠️\s*([^<{]+)/g)) {
      const text = m[1].replace(/\s+/g, ' ').replace(/\{'\s*'\}/g, ' ').trim();
      if (!text) continue;
      const where = `компонент ${e}`;
      if (!found.has(text)) found.set(text, new Set());
      found.get(text).add(where);
    }
  }
})(APP);

const rows = [...found.entries()].sort((a, b) => a[0].localeCompare(b[0], 'ru'));
const lines = rows.map(([text, where]) => {
  const places = [...where].slice(0, 2).join(', ');
  return `| ${text} | ${places}${where.size > 2 ? ` и ещё ${where.size - 2}` : ''} |`;
});

const out = `<!-- Файл собирается tools/gen-fill-list.mjs. Руками не править: пересборка затрёт. -->
# Что заполнить — список из ${rows.length} пунктов

Собран из \`site-foundation/content-export.json\`, то есть из того же источника, что и сайт.
Пункт из этого списка на сайте выглядит как пометка ⚠️ и означает: данные не подтверждены и
публиковаться не могут.

| Что подтвердить или заполнить | Где стоит |
|---|---|
${lines.join('\n')}
`;
writeFileSync(join(ROOT, 'site-foundation/fill-list.md'), out, 'utf8');
console.log(`site-foundation/fill-list.md: пунктов ${rows.length}`);
