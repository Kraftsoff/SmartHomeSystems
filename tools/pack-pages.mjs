#!/usr/bin/env node
/**
 * Собирает витрину для GitHub Pages в site/out.
 *
 * Pages отдаёт из подпапки /<репозиторий>, поэтому сборка идёт с другим корнем
 * путей, а ссылки в готовых файлах переставляются отдельным шагом: basePath у
 * Next переписывает только его собственные пути, а обычные <a href="/answers/">
 * остаются корневыми и на Pages ведут в пустоту.
 *
 * Витрина закрывается от индексации намеренно: боевого домена ещё нет,
 * реквизиты юрлица не заполнены, три карточки в кейсах — шаблоны. Копия сайта
 * на чужом адресе конкурировала бы с будущим оригиналом.
 *
 * Запуск: node tools/pack-pages.mjs [владелец/репозиторий]
 */
import { execFileSync } from 'node:child_process';
import { readdirSync, statSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REPO = process.argv[2] || 'Kraftsoff/SmartHomeSystems';
const [OWNER, NAME] = REPO.split('/');
const BASE = `/${NAME}`;
const SITE = `https://${OWNER.toLowerCase()}.github.io${BASE}`;
const OUT = join(ROOT, 'site/out');

const env = { ...process.env, BASE_PATH: BASE, SITE_URL: SITE };
execFileSync('node', [join(ROOT, 'tools/gen-llms.mjs')], { cwd: ROOT, env, stdio: 'inherit' });
execFileSync('npx', ['next', 'build'], { cwd: join(ROOT, 'site'), env, stdio: 'inherit' });
execFileSync('node', [join(ROOT, 'tools/prune-build.mjs')], { cwd: ROOT, stdio: 'inherit' });
execFileSync('node', [join(ROOT, 'tools/rebase-links.mjs'), BASE], { cwd: ROOT, stdio: 'inherit' });

writeFileSync(join(OUT, 'robots.txt'), `# Витрина на GitHub Pages. Закрыта от индексации намеренно: боевого домена
# ещё нет, реквизиты юрлица не заполнены, три карточки в кейсах — шаблоны.
User-agent: *
Disallow: /
`, 'utf8');
/* Без этого файла Pages пропускает содержимое через Jekyll и выбрасывает
   каталоги, начинающиеся с подчёркивания, — то есть все скрипты и стили. */
writeFileSync(join(OUT, '.nojekyll'), '', 'utf8');

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

console.log(`витрина готова: ${SITE}, страниц закрыто от индексации ${закрыто}`);
console.log('дальше: скопировать site/out в ветку gh-pages и включить Pages в настройках репозитория');
