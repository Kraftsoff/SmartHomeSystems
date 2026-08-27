#!/usr/bin/env node
/**
 * Пакет для Netlify Drop: собранный сайт архивом, который перетаскивают в окно.
 *
 * Отдельно от боевой сборки по двум причинам. Первая: превью обязано быть
 * закрыто от индексации — копия сайта на чужом адресе конкурирует с будущим
 * оригиналом, а реквизиты ещё не заполнены. Вторая: адрес в canonical и в
 * карточке для пересылки должен совпадать с тем, что выдаст Netlify, иначе
 * сто тридцать семь страниц ссылаются на заглушку.
 *
 * Запуск: node tools/pack-preview.mjs [имя-сайта]
 *   имя по умолчанию mimismart-preview → https://mimismart-preview.netlify.app
 */
import { execFileSync } from 'node:child_process';
import { readdirSync, statSync, writeFileSync, createWriteStream, readFileSync } from 'node:fs';
import { resolve, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateRawSync, crc32 } from 'node:zlib';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = process.argv[2] || 'mimismart-preview';
const SITE = `https://${NAME}.netlify.app`;
const OUT = join(ROOT, 'site/out');
const ZIP = join(ROOT, `${NAME}.zip`);

console.log(`сборка под ${SITE}`);
execFileSync('npx', ['next', 'build'], {
  cwd: join(ROOT, 'site'), stdio: 'inherit', env: { ...process.env, SITE_URL: SITE },
});
execFileSync('node', [join(ROOT, 'tools/prune-build.mjs')], { stdio: 'inherit' });

writeFileSync(join(OUT, '_headers'), `# Превью закрыто от индексации: боевого домена ещё нет, реквизиты не
# заполнены, а копия сайта на чужом адресе конкурирует с будущим оригиналом.
/*
  X-Robots-Tag: noindex, nofollow
`, 'utf8');

/* Архив собираем сами: zip в окружении может не быть, а формат простой.
   Без сторонних пакетов — один дефлейт на файл и таблица в конце. */
const files = [];
(function walk(dir) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p);
    else files.push(p);
  }
})(OUT);

const chunks = [];
const central = [];
let offset = 0;
const dos = (d) => [((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() / 2)) & 0xffff,
  (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xffff];
/* Время берём одно на весь архив и постоянное: иначе два прогона над одним
   и тем же сайтом дают разные файлы, и не видно, изменилось ли что-то. */
const [t, dte] = dos(new Date(2020, 0, 1, 0, 0, 0));

for (const f of files) {
  /* Кладём всё внутрь одной папки: без неё архив разворачивается россыпью
     из ста семидесяти семи файлов, а на Netlify перетаскивают папку. */
  const name = `${NAME}/${relative(OUT, f).split('\\').join('/')}`;
  const raw = readFileSync(f);
  const body = deflateRawSync(raw, { level: 9 });
  const crc = crc32(raw);
  const nb = Buffer.from(name, 'utf8');
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6);
  local.writeUInt16LE(8, 8); local.writeUInt16LE(t, 10); local.writeUInt16LE(dte, 12);
  local.writeUInt32LE(crc, 14); local.writeUInt32LE(body.length, 18);
  local.writeUInt32LE(raw.length, 22); local.writeUInt16LE(nb.length, 26);
  chunks.push(local, nb, body);

  const cen = Buffer.alloc(46);
  cen.writeUInt32LE(0x02014b50, 0); cen.writeUInt16LE(20, 4); cen.writeUInt16LE(20, 6);
  cen.writeUInt16LE(0x0800, 8); cen.writeUInt16LE(8, 10); cen.writeUInt16LE(t, 12);
  cen.writeUInt16LE(dte, 14); cen.writeUInt32LE(crc, 16); cen.writeUInt32LE(body.length, 20);
  cen.writeUInt32LE(raw.length, 24); cen.writeUInt16LE(nb.length, 28);
  cen.writeUInt32LE(offset, 42);
  central.push(cen, nb);
  offset += local.length + nb.length + body.length;
}
const cdir = Buffer.concat(central);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8);
end.writeUInt16LE(files.length, 10); end.writeUInt32LE(cdir.length, 12);
end.writeUInt32LE(offset, 16);
writeFileSync(ZIP, Buffer.concat([...chunks, cdir, end]));
console.log(`${relative(ROOT, ZIP)}: файлов ${files.length}, ${(statSync(ZIP).size / 1024 / 1024).toFixed(1)} МБ`);
console.log('перетащите архив на app.netlify.com/drop');
