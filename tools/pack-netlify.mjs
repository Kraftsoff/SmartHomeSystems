#!/usr/bin/env node
/**
 * Обновляет ветку netlify — готовые файлы сайта для бесплатного адреса.
 *
 * Netlify забирает сайт прямо из репозитория, поэтому перетаскивать архив
 * не нужно: в ветке лежит уже собранный сайт, собирать при выкладке нечего.
 * Пути корневые, в отличие от витрины на GitHub Pages, — Netlify отдаёт с
 * корня своего адреса.
 *
 * Витрина закрывается от индексации намеренно: боевого домена ещё нет,
 * реквизиты юрлица не заполнены, три карточки в кейсах — шаблоны.
 *
 * Запуск: node tools/pack-netlify.mjs [имя-сайта]
 */
import { execFileSync } from 'node:child_process';
import { readdirSync, statSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = process.argv[2] || 'mimismart';
const SITE = `https://${NAME}.netlify.app`;
const OUT = join(ROOT, 'site/out');
const env = { ...process.env, SITE_URL: SITE };

execFileSync('node', [join(ROOT, 'tools/gen-llms.mjs')], { cwd: ROOT, env, stdio: 'inherit' });
execFileSync('npx', ['next', 'build'], { cwd: join(ROOT, 'site'), env, stdio: 'inherit' });
execFileSync('node', [join(ROOT, 'tools/prune-build.mjs')], { cwd: ROOT, stdio: 'inherit' });
execFileSync('node', [join(ROOT, 'tools/gen-sitemap.mjs')], { cwd: ROOT, stdio: 'inherit' });

writeFileSync(join(OUT, 'robots.txt'), `# Витрина на бесплатном адресе. Закрыта от индексации намеренно.
User-agent: *
Disallow: /
`, 'utf8');
writeFileSync(join(OUT, 'netlify.toml'), `[build]\n  publish = "."\n  command = ""\n`, 'utf8');

let закрыто = 0;
(function walk(d) {
  for (const e of readdirSync(d)) {
    const p = join(d, e);
    if (statSync(p).isDirectory()) walk(p);
    else if (e.endsWith('.html')) {
      const s = readFileSync(p, 'utf8');
      if (s.includes('name="robots"')) continue;
      const n = s.replace(/(<head[^>]*>)/, '$1<meta name="robots" content="noindex,nofollow"/>');
      if (n !== s) { writeFileSync(p, n, 'utf8'); закрыто += 1; }
    }
  }
})(OUT);

console.log(`готово для ${SITE}: страниц закрыто от индексации ${закрыто}`);
console.log('дальше: содержимое site/out в ветку netlify, Netlify заберёт её сам');
