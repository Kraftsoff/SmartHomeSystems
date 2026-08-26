#!/usr/bin/env node
/**
 * Собирает конфиг редиректов для хостинга из site-foundation/redirects.md.
 *
 * Зачем отдельный инструмент: при статической генерации Next редиректы не
 * обслуживает — их отдаёт хостинг. Карта живёт в одном месте (redirects.md),
 * а форматов у хостингов разные, поэтому конфиг генерируется, а не пишется
 * второй раз руками: переписанная копия разъедется с картой молча.
 *
 *   node tools/gen-host-redirects.mjs        # пишет site/vercel.json и site/out/_redirects
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

const MAP = 'site-foundation/redirects.md';
const src = readFileSync(resolve(MAP), 'utf8');

const rules = [...src.matchAll(/source:\s*'([^']+)'\s*,\s*destination:\s*'([^']+)'/g)]
  .map((m) => ({ source: m[1], destination: m[2] }));

const seen = new Set();
const unique = rules.filter((r) => (seen.has(r.source) ? false : seen.add(r.source)));

/* Порядок: длинные пути первыми. При префиксном сопоставлении общее правило,
   стоящее выше частного, перехватывает его — это уже ловилось на карте. */
unique.sort((a, b) => b.source.split('/').length - a.source.split('/').length
  || b.source.length - a.source.length);

const vercel = {
  $schema: 'https://openapi.vercel.sh/vercel.json',
  redirects: unique.map((r) => ({ source: r.source, destination: r.destination, permanent: true })),
};
write('site/vercel.json', `${JSON.stringify(vercel, null, 2)}\n`);

/* Формат Netlify/Cloudflare Pages: «откуда куда код». */
const plain = unique.map((r) => `${r.source}  ${r.destination}  301`).join('\n');
write('site/public/_redirects', `${plain}\n`);

function write(p, body) {
  const full = resolve(p);
  if (!existsSync(dirname(full))) mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, body);
  console.log(`${p}: ${unique.length} правил`);
}
