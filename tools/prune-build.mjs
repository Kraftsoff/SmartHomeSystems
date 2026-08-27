#!/usr/bin/env node
/**
 * Убирает из собранного сайта то, что никогда не будет запрошено.
 *
 * Next кладёт рядом с каждой страницей полезную нагрузку для клиентской
 * навигации — по три файла на маршрут. Она нужна переходам через next/link;
 * на этом сайте все ссылки обычные, и переход всегда полная загрузка.
 * Замерено: два перехода — пятнадцать запросов, ни одного к этим файлам,
 * две полные загрузки документа.
 *
 * Это 7,1 МБ из 12,2 МБ сборки. Если когда-нибудь появится next/link,
 * шаг нужно убрать — иначе переходы начнут падать в полную перезагрузку молча.
 */
import { readdirSync, statSync, rmSync, readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/* Пути считаем от самого файла, а не от текущего каталога: скрипт запускают и
   из корня, и из site, и во втором случае он искал site/site/out. */
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(process.argv[2] || join(ROOT, 'site/out'));
const APP = join(ROOT, 'site/app');

/* Защита: если в исходниках появился next/link, удалять нельзя. */
function usesLink(dir) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) { if (usesLink(p)) return true; }
    else if (/\.(tsx|ts|jsx|js)$/.test(e) && readFileSync(p, 'utf8').includes('next/link')) return true;
  }
  return false;
}
if (usesLink(APP)) {
  console.log('в исходниках есть next/link — полезная нагрузка нужна, ничего не удаляю');
  process.exit(0);
}

let freed = 0, count = 0;
(function walk(dir) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p);
    else if (e.endsWith('.txt') && e !== 'robots.txt') {
      freed += statSync(p).size; count += 1; rmSync(p);
    }
  }
})(OUT);

console.log(`убрано файлов клиентской навигации: ${count}, освобождено ${(freed / 1024 / 1024).toFixed(1)} МБ`);
