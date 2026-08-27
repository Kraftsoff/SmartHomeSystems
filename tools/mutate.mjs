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
 *   FAST=1 — пропустить мутации, требующие пересборки.
 *
 * Каждая мутация гоняет приёмку целиком, поэтому полный набор идёт минутами:
 * по одному имени — секунды, всё сразу — около четверти часа. Вывод идёт по
 * мере готовности, чтобы прогон можно было читать, а не ждать.
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
  { name: 'кейсы исчезли без скриптов', file: 'site/out/portfolio/index.html', rebuild: false,
    all: true, from: 'class="card case"', to: 'class="card caseX"',
    expect: 'нет ни одного объекта' },
  { name: 'кейс без пометки о шаблоне', file: 'site/out/portfolio/index.html', rebuild: false,
    all: true, from: 'class="prov"', to: 'class="provX"',
    expect: 'пометка' },
  { name: 'ответ без целевого действия', file: 'site/out/answers/chto-delat-esli-topyat-sosedi/index.html',
    rebuild: false, from: 'class="next"', to: 'class="nextX"',
    expect: 'без целевого действия' },
  { name: 'адрес шоурума разошёлся со страницей', file: 'site/out/showroom/index.html', rebuild: false,
    from: '"streetAddress":"Новоданиловская набережная, 6к1"',
    to: '"streetAddress":"Ленинградское шоссе, 12"',
    expect: 'адрес в разметке расходится' },
  { name: 'заглушка телефона в разметке места', file: 'site/out/showroom/index.html', rebuild: false,
    from: '"@type":"LocalBusiness"', to: '"telephone":"+7 000 000-00-00","@type":"LocalBusiness"',
    expect: 'телефон или почта' },
  { name: 'таблица недостижима клавиатурой', file: 'site/out/about/index.html', rebuild: false,
    all: true, from: 'class="tbl-wrap" tabindex="0"', to: 'class="tbl-wrap" data-x="0"',
    expect: 'клавиатурой недостижимы' },
  { name: 'текущий раздел не объявлен', file: 'site/out/pricing/index.html', rebuild: false,
    all: true, from: 'aria-current="page"', to: 'data-current="page"',
    expect: 'не объявлен текущий раздел' },
  { name: 'заголовок повторяется на странице', file: 'site/out/pricing/index.html', rebuild: false,
    from: '<h2 class="cluster-h">Что двигает цену</h2>',
    to: '<h2 class="cluster-h">Что двигает цену</h2><h2 class="cluster-h">Что двигает цену</h2>',
    expect: 'заголовок повторяется' },
  { name: 'страница выпала из карты сайта', file: 'site/out/sitemap.xml', rebuild: false,
    all: true, from: '<loc>', to: '<locX>',
    expect: 'нет в карте сайта' },
  { name: 'пометка не попала в список к заполнению',
    file: 'site/out/index.html', rebuild: false,
    from: 'class="prov">⚠️', to: 'class="prov">⚠️ заполнить: расчётный счёт и банк — ',
    expect: 'нет в списке к заполнению' },
  { name: 'превосходство без критерия', file: 'site/out/index.html', rebuild: false,
    from: '<h1', to: '<p>Лучшая система на рынке.</p><h1',
    expect: 'превосходство без критерия' },
  /* Через собранный HTML эту мутацию не подсадить: вставка попадает внутрь
     #main, а React при гидратации приводит DOM к своему дереву и лишний узел
     удаляет — до замера он не доживает. Всё, что проверяется с включёнными
     скриптами, нужно ломать в исходниках. */
  { name: 'страница уехала за край экрана', file: 'site/app/globals.css', rebuild: true,
    from: '.shell{max-width:1140px', to: '.shell{min-width:1400px;max-width:1140px',
    expect: 'шире экрана' },
  /* Ставка вознаграждения, вынесенная заказчику. Правило дал клиент: узнав
     процент, заказчик считает, что переплачивает через дизайнера, и идёт
     мимо партнёра — публикация ломает тот самый канал. */
  { name: 'размер вознаграждения виден заказчику', file: 'site/out/partners/index.html',
    rebuild: false, from: '<h2 class="cluster-h">Как устроено вознаграждение</h2>',
    to: '<h2 class="cluster-h">Как устроено вознаграждение</h2><p>Вознаграждение до 20% от итоговой стоимости.</p>',
    expect: 'размер вознаграждения виден заказчику' },
  { name: 'цель нажатия ниже 24 px', file: 'site/app/globals.css', rebuild: true,
    from: '.check a, .lead-form a { display:inline-block; padding:4px 0; min-height:24px }',
    to: '.check a, .lead-form a { display:inline }',
    expect: 'цели нажатия ниже 24 px' },
  { name: 'план на телефоне стоит мёртвым', file: 'site/app/components/HousePlan.tsx', rebuild: true,
    from: "matchMedia('(hover: none)')", to: "matchMedia('(hover: hover)')",
    expect: 'план стоит мёртвым' },
  { name: 'житель ходит при запрете анимации', file: 'site/app/components/HousePlan.tsx', rebuild: true,
    from: 'if (touch && !calm) {', to: 'if (touch) {',
    expect: 'всё равно ходит' },
  { name: 'подпись строки уезжает', file: 'site/app/globals.css', rebuild: true,
    from: '  position:sticky;left:0;background:var(--panel);z-index:1}', to: '  background:var(--panel)}',
    expect: 'подпись строки уезжает' },
  { name: 'якорь уходит под шапку', file: 'site/app/globals.css', rebuild: true,
    from: ':where(h1, h2, h3, #main, [id]) { scroll-margin-top: 74px }', to: '',
    expect: 'прячет цель под шапкой' },
  { name: 'меню не помещается на экран', file: 'site/app/globals.css', rebuild: true,
    from: '.nav-panel li{margin:0}', to: '.nav-panel li{margin:8px 0}',
    expect: 'меню не помещается' },
  { name: 'пометка о непроверенном в описании', file: 'site/lib/content.ts', rebuild: true,
    from: "    .filter((sentence) => !sentence.includes('⚠️'))\n", to: '',
    expect: 'ушла в описание страницы' },
  { name: 'маска расходится с планом', file: 'site/app/components/HousePlan.tsx', rebuild: true,
    from: 'data-mask={PLAN_DAY}', to: 'data-mask="/plan/sensor-67dd010377.png"',
    expect: 'не совпадает с нарисованным планом' },

  { name: 'липкая кнопка ведёт на ту же страницу', file: 'site/app/components/StickyCta.tsx', rebuild: true,
    from: "const onLeadPage = here === '/contacts/';", to: "const onLeadPage = false && here === '/contacts/';",
    expect: 'ведёт на ту же страницу' },

  { name: 'действие ведёт на ту же страницу', file: 'site/app/components/NextSteps.tsx', rebuild: true,
    from: "const scope = here !== '/pricing/';", to: 'const scope = true;',
    expect: 'ведёт на ту же страницу' },

  { name: 'обход клавиатурой уходит из меню', file: 'site/app/components/MainNav.tsx', rebuild: true,
    from: "      if (e.key !== 'Tab') return;", to: "      if (e.key !== 'Tab') return;\n      return;",
    expect: 'уходит из открытого меню' },

  { name: 'липкая полоса на кнопке отправки', file: 'site/app/components/StickyCta.tsx', rebuild: true,
    from: "data-shown={past && !onForm ? 'yes' : 'no'}", to: "data-shown={past ? 'yes' : 'no'}",
    expect: 'лежит на кнопке отправки заявки' },

  { name: 'страница 404 по умолчанию', file: 'site/app/not-found.tsx', rebuild: true,
    from: 'title: \'Страница не найдена — MiMiSmart\',', to: "title: 'MiMiSmart',",
    expect: 'не про ошибку' },

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

/* Восстановление при убийстве. Прогон длиннее лимита оболочки убивают
   сигналом, и без этого файл остаётся изменённым: так в собранном выводе
   на сутки задержался подсаженный дефект, а следующая мутация об него
   споткнулась. */
let restore = null;
const undo = () => { if (restore) { writeFileSync(restore.path, restore.text, 'utf8'); restore = null; } };
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(sig, () => { undo(); process.exit(130); });
}
process.on('exit', undo);

let proven = 0, blind = 0, broken = 0;
for (const m of MUTATIONS) {
  if (only && !m.name.includes(only)) continue;
  /* FAST=1 пропускает мутации, требующие пересборки: полный набор не
     укладывается в один заход, а быстрые дают ответ за минуты. */
  if (process.env.FAST && m.rebuild) continue;
  const path = join(ROOT, m.file);
  if (!existsSync(path)) { console.log(`⚠️  ${m.name}: нет файла ${m.file}`); broken += 1; continue; }
  const before = readFileSync(path, 'utf8');
  /* all: заменить все вхождения. Строковый replace меняет только первое, и
     мутация «карточки исчезли» убирала одну из трёх — гейт справедливо
     молчал, потому что две оставались на месте. */
  const after = m.all ? before.split(m.from).join(m.to) : before.replace(m.from, m.to);
  /* Первым делом — что подмена вообще применилась. Без этой строки проверяется
     неизменённый файл, и любой гейт выглядит доказанным. */
  if (after === before) {
    console.log(`⚠️  ${m.name}: подмена не применилась — строки нет в файле`);
    broken += 1;
    continue;
  }
  restore = { path, text: before };
  writeFileSync(path, after, 'utf8');
  if (m.rebuild) {
    /* Сборка запускается В каталоге сайта. С «--prefix» npx меняет каталог
       пакетов, а не рабочий, и сборка молча не происходит — три гейта из-за
       этого выглядели слепыми, хотя проверялись на несобранном сайте. */
    const build = run('npx', ['next', 'build'], join(ROOT, 'site'));
    /* Упавшая сборка оставляет прежний site/out на месте, и приёмка проверяет
       НЕПОДСАЖЕННЫЙ сайт. Так гейт про автопрогулку трижды выглядел слепым:
       мутация ломала типы, сборка падала, а вывод её был заглушен. Молчать об
       этом нельзя — иначе «доказано» означает «проверено не то». */
    if (/Failed to compile|Failed to type check|error TS\d/.test(build)) {
      undo();
      const line = (build.match(/.*error TS\d+.*/) || build.match(/.*Failed.*/) || [''])[0].trim();
      console.log(`⚠️  ${m.name}: сборка с подсадкой упала, проверять нечего — ${line.slice(0, 120)}`);
      broken += 1;
      run('npx', ['next', 'build'], join(ROOT, 'site'));
      run('node', [join(ROOT, 'tools/prune-build.mjs')]);
      continue;
    }
    run('node', [join(ROOT, 'tools/prune-build.mjs')]);
  }
  const out = run('node', [join(ROOT, 'tools/accept-site.mjs')]);
  undo();
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
