#!/usr/bin/env node
/**
 * Прогоняет проверку языка по всем файлам проекта и возвращает ненулевой код,
 * если хоть один не прошёл.
 *
 * Зачем отдельный скрипт: `node tools/lint-text.mjs файл | tail -1` возвращает код
 * от `tail`, то есть ноль всегда. За сессию это дважды привело к коммиту с
 * нарушением — один раз в правилах редиректов, один раз в аудите голоса покупателя.
 * Здесь код возврата принадлежит проверке, а не последней команде конвейера.
 */
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

/* Собранный сайт — не исходник: правки вносятся в шаблоны и выгрузку, а
   артефакты пересобираются. Проверяя их, линтер дублирует каждое замечание
   и ругается на цитаты вопросов, которые в исходнике стоят законно. */
const SKIP = new Set(['node_modules', '.git', 'backups', 'site-snapshot', 'tools', '.next', 'out']);
const files = [];
(function walk(dir) {
  for (const e of readdirSync(dir)) {
    if (SKIP.has(e)) continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p);
    else if (e.endsWith('.md') || e.endsWith('.html')) files.push(p);
  }
})('.');

let bad = 0;
for (const f of files) {
  try {
    execFileSync('node', ['tools/lint-text.mjs', f], { stdio: 'pipe' });
  } catch (e) {
    bad++;
    console.log(`\n❌ ${f}`);
    console.log(String(e.stdout || '').split('\n').filter((l) => l.startsWith('✗')).join('\n'));
  }
}
console.log(`\nпроверено файлов: ${files.length}, с нарушениями: ${bad}`);
process.exit(bad ? 1 : 0);
