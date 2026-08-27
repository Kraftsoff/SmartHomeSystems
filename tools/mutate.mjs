#!/usr/bin/env node
/**
 * Проверка проверок: подсаживает известный дефект и требует, чтобы приёмка
 * его назвала.
 *
 * Появился после того, как дважды подряд я записал «подтверждено на
 * способность падать», прочитав прогон НЕизменённого файла: строка для замены
 * в нём не встречалась, подмена молча не применялась. Поэтому здесь первым
 * делом проверяется, что файл действительно изменился, и только потом —
 * что гейт сработал.
 *
 * Запуск: node tools/mutate.mjs [подстрока имени]
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const only = process.argv[2];

/* rebuild: правка в исходниках сайта требует пересборки; правка в собранном
   выводе или в контенте — нет, и такие мутации идут в разы быстрее. */
const MUTATIONS = [
  { name: 'мёртвая внутренняя ссылка', file: 'site/out/index.html', rebuild: false,
    from: 'href="/pricing/"', to: 'href="/net-takoy-stranicy/"',
    expect: 'ссылка в никуда' },
  /* Убирать надо единственную входящую ссылку: на кейсы ведёт ещё и подвал
     с каждой страницы, и одна снятая ссылка их не осиротит. На /compare/diy/
     ведёт ровно одна — со страницы сравнений. */
  { name: 'страница без входящих ссылок', file: 'site/out/compare/index.html', rebuild: false,
    from: 'href="/compare/diy/"', to: 'href="/#было-тут"',
    expect: 'не ведёт ни одна ссылка' },
  { name: 'цепочка расходится с разметкой', file: 'site/out/about/index.html', rebuild: false,
    from: '"@type":"BreadcrumbList"', to: '"@type":"BreadcrumbListX"',
    expect: 'в разметке нет' },
  { name: 'страница без картинки для пересылки', file: 'site/out/pricing/index.html', rebuild: false,
    from: 'property="og:image"', to: 'property="og:imageX"',
    expect: 'без картинки для пересылки' },
  { name: 'кнопка в перенесённом содержимом', file: 'site/lib/content.json', rebuild: true,
    from: '"html": "<div><div>', to: '"html": "<div><div><button>Заявка</button>',
    expect: 'кнопок без обработчика' },
  { name: 'заголовок над пустотой', file: 'site/lib/content.json', rebuild: true,
    from: '"html": "<div><div>', to: '"html": "<div><h2>Пустой раздел</h2><div></div><div>',
    expect: 'пустых контейнеров' },
  { name: 'контраст ниже AA', file: 'site/app/globals.css', rebuild: true,
    from: '.card p.case-pain{font-size:14px;color:var(--ink)',
    to: '.card p.case-pain{font-size:14px;color:#9aa0a8',
    expect: 'контраст ниже AA' },
  { name: 'элемент управления без оформления', file: 'site/app/components/ScopeCalc.tsx', rebuild: true,
    from: '<button key={k} type="button" className="chip" aria-pressed={stage === k}',
    to: '<button key={k} type="button" aria-pressed={stage === k}',
    expect: 'оформлением по умолчанию' },
  { name: 'страница тяжелее бюджета', file: 'site/out/index.html', rebuild: false,
    /* Повторяющийся текст сжимается почти в ноль, а бюджет меряется со
       сжатием: «вес вес вес…» на 120 КБ уезжает тремястами байтами.
       Нужен текст без повторов. */
    from: '</main>', to: `<p>${Array.from({ length: 40000 },
      (_, i) => (i * 2654435761 % 4294967296).toString(36)).join(' ')}</p></main>`,
    expect: 'тяжелее бюджета' },
  { name: 'редирект в никуда', file: 'site/vercel.json', rebuild: false,
    from: '"destination": "/equipment/controllers/"', to: '"destination": "/net-takoy/"',
    expect: 'на несуществующую страницу' },
];

/* Сборка запускается в каталоге сайта; если запустить её из корня, Next
   создаёт там свой .next и оставляет мусор в репозитории. */
const run = (cmd, args, cwd = ROOT) => {
  try {
    return execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, NODE_PATH: process.env.NODE_PATH || '/opt/node22/lib/node_modules' } });
  } catch (e) { return `${e.stdout || ''}${e.stderr || ''}`; }
};

let proven = 0, blind = 0, broken = 0;
for (const m of MUTATIONS) {
  if (only && !m.name.includes(only)) continue;
  const path = join(ROOT, m.file);
  if (!existsSync(path)) { console.log(`⚠️  ${m.name}: нет файла ${m.file}`); broken += 1; continue; }
  const before = readFileSync(path, 'utf8');
  const after = before.replace(m.from, m.to);
  /* Первым делом — что подмена вообще применилась. Без этой строки проверяется
     неизменённый файл, и любой гейт выглядит доказанным. */
  if (after === before) {
    console.log(`⚠️  ${m.name}: подмена не применилась — строки нет в файле`);
    broken += 1;
    continue;
  }
  writeFileSync(path, after, 'utf8');
  if (m.rebuild) {
    /* Сборка запускается В каталоге сайта. С «--prefix» npx меняет каталог
       пакетов, а не рабочий, и сборка молча не происходит — три гейта из-за
       этого выглядели слепыми, хотя проверялись на несобранном сайте. */
    run('npx', ['next', 'build'], join(ROOT, 'site'));
    run('node', [join(ROOT, 'tools/prune-build.mjs')]);
  }
  const out = run('node', [join(ROOT, 'tools/accept-site.mjs')]);
  writeFileSync(path, before, 'utf8');
  if (m.rebuild) {
    run('npx', ['next', 'build'], join(ROOT, 'site'));
    run('node', [join(ROOT, 'tools/prune-build.mjs')]);
  }
  const caught = out.includes(m.expect);
  console.log(`${caught ? '✅' : '❌'} ${m.name}${caught ? '' : ` — приёмка промолчала, ждали «${m.expect}»`}`);
  if (caught) proven += 1; else blind += 1;
}
console.log(`\nдоказано ${proven}, слепых ${blind}, не проверено ${broken}`);
process.exit(blind + broken ? 1 : 0);
