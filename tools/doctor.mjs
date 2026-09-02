#!/usr/bin/env node
/**
 * Проверка окружения перед работой.
 *
 * Проект держится на трёх внешних вещах: Node 22, playwright с Chromium для
 * приёмки и sharp для пережатия графики. Без них команды падают ошибками,
 * по которым не видно, чего не хватает: «Cannot find package 'playwright'»
 * ничего не говорит человеку, который проект открыл впервые.
 *
 * Запуск: npm run doctor
 */
import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const беды = [];
const ok = [];

/* Node. Меньше 22 — сборка Next не поднимется, и сообщение будет про
   синтаксис, а не про версию. */
{
  const major = Number(process.versions.node.split('.')[0]);
  if (major < 22) беды.push([`Node ${process.versions.node}`, 'нужен Node 22 или новее: https://nodejs.org']);
  else ok.push(`Node ${process.versions.node}`);
}

/* Зависимости корня и сайта — разные: в корне инструменты, в site сам Next. */
for (const [что, путь, чем] of [
  ['зависимости инструментов', 'node_modules', 'npm install'],
  ['зависимости сайта', 'site/node_modules', 'npm --prefix site install'],
]) {
  if (!existsSync(resolve(путь))) беды.push([что, `не установлены: ${чем}`]);
  else ok.push(что);
}

/* playwright и его Chromium — предмет отдельный: пакет может стоять, а
   браузер к нему не скачан, и приёмка падает на запуске. */
try {
  const { chromium } = require('playwright');
  const bin = chromium.executablePath();
  if (!existsSync(bin)) {
    /* Отдельно называем ожидаемый путь: если рядом лежит Chromium другой
       сборки (общий на машине, из PLAYWRIGHT_BROWSERS_PATH), сообщение
       «не скачан» сбивает с толку — браузер есть, версия не та. */
    беды.push(['Chromium для playwright',
      `не найден по пути ${bin}\n    поставить: npx playwright install --with-deps chromium`]);
  }
  else ok.push('playwright и Chromium');
} catch {
  беды.push(['playwright', 'не установлен: npm install']);
}

/* sharp нужен только конвейеру графики, поэтому его отсутствие — не отказ,
   а предупреждение: сайт собирается и без него. */
let графика = true;
try { require('sharp'); ok.push('sharp (пережатие графики)'); }
catch { графика = false; }

/* Содержимое сайта — производное от прототипа. Если выгрузки нет, сборка
   соберётся пустой, и понять почему будет неоткуда. */
{
  const f = resolve('site/lib/content.json');
  if (!existsSync(f)) беды.push(['содержимое сайта', 'нет site/lib/content.json: npm run content']);
  else {
    const c = JSON.parse(readFileSync(f, 'utf8'));
    const n = Object.keys(c.answers || {}).length || (c.answers || []).length;
    ok.push(`содержимое: ответов ${n}, разделов ${Object.keys(c.sections || {}).length}`);
  }
}

/* Git — не для запуска, а чтобы человек сразу видел, где он находится. */
let ветка = '';
try { ветка = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf8' }).trim(); } catch { /* не репозиторий */ }

console.log('\nОкружение\n' + '─'.repeat(52));
for (const s of ok) console.log(`  ✓ ${s}`);
if (!графика) console.log('  · sharp не установлен — нужен только для npm run assets');
if (ветка) console.log(`  · ветка: ${ветка}`);

if (беды.length) {
  console.log('\nЧего не хватает\n' + '─'.repeat(52));
  for (const [что, как] of беды) console.log(`  ✗ ${что}\n    ${как}`);
  console.log('\nПроще всего разом:  npm run setup\n');
  process.exit(1);
}
console.log('\nВсё на месте. Дальше: npm run dev — сайт на localhost:3000\n');
