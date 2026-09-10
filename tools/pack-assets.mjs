#!/usr/bin/env node
/**
 * Пережимает графику бренда из снимка старого сайта в веб-форматы.
 *
 * Исходники — собственные материалы клиента в site-snapshot/original-html:
 * тяжёлые PNG и JPG по 100–440 КБ, для страницы непригодные. Отсюда выходят
 * WebP в двух ширинах и запись о размерах: без ширины и высоты в разметке
 * картинка двигает макет при загрузке, а нулевой сдвиг — измеренное свойство
 * сайта, которое приёмка проверяет.
 *
 * Требует sharp. В зависимостях его нет намеренно: конвейер запускается руками,
 * когда меняется реестр, а на сборку уезжают уже готовые файлы из site/public.
 *   cd site && npm install --no-save sharp && cd .. && node tools/pack-assets.mjs
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync, readdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(ROOT, 'site/package.json'));
let sharp;
try { sharp = require('sharp'); }
catch { console.error('нет sharp: cd site && npm install --no-save sharp'); process.exit(1); }

const SRC = join(ROOT, 'site-snapshot/original-html');
const OUT = join(ROOT, 'site/public/brand');
const реестр = JSON.parse(readFileSync(join(ROOT, 'site-foundation/assets.json'), 'utf8'));

/* Страницы из реестра сверяются с содержимым: адрес с опечаткой иначе просто
   не совпадёт ни с чем, кадр молча никуда не встанет, и понять это можно
   только глазами на всех 139 страницах. */
const контент = JSON.parse(readFileSync(join(ROOT, 'site/lib/content.json'), 'utf8'));
const существуют = new Set([
  ...Object.keys(контент.pages || {}).map((u) => u.replace(/^\/|\/$/g, '')),
  ...Object.keys(контент.sections || {}),
  ...Object.keys(контент.comparisons || {}),
]);
const мимо = реестр.assets.flatMap((a) => a.pages.filter((p) => !существуют.has(p)));
if (мимо.length) { console.error(`нет таких страниц: ${[...new Set(мимо)].join(', ')}`); process.exit(1); }

/* Каталог чистится целиком: иначе удалённая из реестра запись остаётся лежать
   в сборке и уезжает на хостинг картинкой, на которую никто не ссылается. */
if (existsSync(OUT)) rmSync(OUT, { recursive: true });
mkdirSync(OUT, { recursive: true });

const ШИРИНЫ = [760, 1520];
const ЧЁРНЫЙ = '#0b0d10';

/* Подложка плитки берётся из самой картинки: у части кадров ground чёрный,
   у части светлый, и одна общая подложка дала бы белый прямоугольник внутри
   тёмной карточки. Считаем средний цвет рамки в два пикселя по краю — то,
   к чему кадр примыкает.
   У кадров с прозрачностью краевые пиксели пустые и среднее по ним
   произвольно; такие кладём на фирменный почти-чёрный — тот же, на котором
   они стояли на старом сайте. */
async function фонКадра(путь, мета) {
  if (мета.hasAlpha) return ЧЁРНЫЙ;
  const край = 2;
  const полосы = await Promise.all([
    sharp(путь).extract({ left: 0, top: 0, width: мета.width, height: край }).stats(),
    sharp(путь).extract({ left: 0, top: мета.height - край, width: мета.width, height: край }).stats(),
    sharp(путь).extract({ left: 0, top: 0, width: край, height: мета.height }).stats(),
    sharp(путь).extract({ left: мета.width - край, top: 0, width: край, height: мета.height }).stats(),
  ]);
  const канал = (i) => Math.round(полосы.reduce((s, st) => s + st.channels[i].mean, 0) / полосы.length);
  return '#' + [0, 1, 2].map((i) => канал(i).toString(16).padStart(2, '0')).join('');
}

const готово = [];
let всегоКБ = 0;

for (const a of реестр.assets) {
  const путь = join(SRC, a.src);
  if (!existsSync(путь)) { console.error(`нет исходника: ${a.src}`); process.exit(1); }
  const мета = await sharp(путь).metadata();
  /* Ширины берём те, что помещаются в исходник: растянутый апскейл тяжелее и
     хуже оригинала. Если исходник мельче самой узкой ширины — отдаём его как
     есть, одним вариантом. */
  const подходят = ШИРИНЫ.filter((w) => w <= мета.width);
  const варианты = [];
  /* Ручная подложка в реестре бьёт расчётную: у кадра с тёмным содержимым и
     светлой каймой среднее по краю даёт серые поля по бокам. */
  const подложка = a.bg || await фонКадра(путь, мета);
  for (const w of (подходят.length ? подходят : [мета.width])) {
    const имя = `${a.id}-${w}.webp`;
    const инфо = await sharp(путь).resize({ width: w, withoutEnlargement: true })
      .flatten({ background: подложка })
      .webp({ quality: 82, effort: 6 }).toFile(join(OUT, имя));
    варианты.push({ w: инфо.width, h: инфо.height, file: `/brand/${имя}`, kb: Math.round(инфо.size / 1024) });
    всегоКБ += Math.round(инфо.size / 1024);
  }
  if (!варианты.length) { console.error(`нечего собрать для ${a.id}`); process.exit(1); }
  const основной = варианты[варианты.length - 1];
  готово.push({
    id: a.id, alt: a.alt, caption: a.caption, pages: a.pages,
    src: варианты[0].file, w: варианты[0].w, h: варианты[0].h,
    srcset: варианты.map((v) => `${v.file} ${v.w}w`).join(', '),
    max: основной.file, bg: подложка,
  });
  console.log(`${a.id.padEnd(20)} ${мета.width}×${мета.height} фон ${подложка} → ${варианты.map((v) => `${v.w}px ${v.kb}КБ`).join(', ')}`);
}

writeFileSync(join(ROOT, 'site/lib/assets.json'), JSON.stringify(готово, null, 2) + '\n', 'utf8');

/* Снимки зала лежали исходными JPEG прямо в public: пять файлов на 457 КБ, вся
   страница шоурума вдвое тяжелее любой другой. Исходники переехали из public в
   site-snapshot/showroom-src, отсюда выходят пережатые. Конвейер ничего не
   удаляет: запусти его дважды — результат тот же. */
const ЗАЛ_ИСТ = join(ROOT, 'site-snapshot/showroom-src');
const ЗАЛ = join(ROOT, 'site/public/showroom');
if (existsSync(ЗАЛ)) rmSync(ЗАЛ, { recursive: true });
mkdirSync(ЗАЛ, { recursive: true });
const зал = [];
for (const e of readdirSync(ЗАЛ_ИСТ).filter((e) => /\.jpe?g$/i.test(e)).sort()) {
  const имя = e.replace(/\.jpe?g$/i, '.webp');
  const инфо = await sharp(join(ЗАЛ_ИСТ, e)).resize({ width: 720, withoutEnlargement: true })
    .webp({ quality: 72, effort: 6 }).toFile(join(ЗАЛ, имя));
  зал.push({ file: имя, w: инфо.width, h: инфо.height, kb: Math.round(инфо.size / 1024) });
}
if (зал.length) {
  writeFileSync(join(ROOT, 'site/lib/showroom.json'), JSON.stringify(зал, null, 2) + '\n', 'utf8');
  console.log(`зал: ${зал.length} снимков, ${зал.reduce((n, f) => n + f.kb, 0)} КБ`);
}

/* Проверка на месте: реестр обязан покрывать все страницы, которые в нём назвал
   автор, и ни один файл не должен остаться в каталоге без записи. */
const файлов = readdirSync(OUT).length;
const ожидается = готово.reduce((n, a) => n + a.srcset.split(',').length, 0);
if (файлов !== ожидается) { console.error(`файлов ${файлов}, записей ${ожидается}`); process.exit(1); }

console.log(`\nкадров ${готово.length}, файлов ${файлов}, вес каталога ${всегоКБ} КБ`);
console.log(`страниц с кадром: ${new Set(готово.flatMap((a) => a.pages)).size}`);
