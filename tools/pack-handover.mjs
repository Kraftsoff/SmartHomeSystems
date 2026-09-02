#!/usr/bin/env node
/**
 * Собирает содержимое сайта в отдельное дерево — для переноса в свой репозиторий.
 *
 * Репозиторий Kraftsoff/SmartHomeSystems держит несколько проектов сразу, и сайт
 * в нём живёт веткой. Коллеге нужен репозиторий, где сайт — и есть проект:
 * склонировал, поставил, запустил.
 *
 * Что не едет: чужие проекты, резервные архивы, вендорные скиллы маркетинга —
 * к сборке сайта они отношения не имеют. Что едет: код, прототип, инструменты,
 * ТЗ, аудиты, исходники графики и CI.
 *
 * Запуск: node tools/pack-handover.mjs [куда]
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, existsSync, cpSync, writeFileSync, readFileSync, statSync, readdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(process.argv[2] || join(ROOT, '..', 'mimismart-site'));

/* Берём список у git, а не обходом каталога: так в пакет не попадёт ничего
   лишнего из рабочего дерева — ни сборка, ни node_modules, ни временные файлы. */
/* -z обязателен: без него git заключает в кавычки и экранирует всё, что вне
   ASCII, а половина документов проекта названа по-русски. */
const всеФайлы = execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8' })
  .split('\0').filter(Boolean);

const НЕ_ЕДЕТ = [
  /^backups\//,          // архивы прежних версий: репозиторий и есть архив
  /^\.agents\//,         // вендорные скиллы маркетинга, к сайту не относятся
  /^skills-lock\.json$/,
];
const файлы = всеФайлы.filter((f) => !НЕ_ЕДЕТ.some((re) => re.test(f)));
const убрано = всеФайлы.length - файлы.length;

if (existsSync(OUT)) rmSync(OUT, { recursive: true });
mkdirSync(OUT, { recursive: true });
for (const f of файлы) {
  const цель = join(OUT, f);
  mkdirSync(dirname(цель), { recursive: true });
  cpSync(join(ROOT, f), цель);
}

/* Своя история: коммиты этой ветки перемешаны с другими проектами репозитория,
   и тащить их в чистый репозиторий незачем. Прежняя история никуда не девается —
   она остаётся в PR #1 исходного репозитория, ссылка на него в описании коммита. */
const сообщение = `Сайт MiMiSmart: код, прототип, инструменты, ТЗ и аудиты

Перенос из Kraftsoff/SmartHomeSystems, где сайт жил веткой рядом с другими
проектами. История разработки осталась там же, в pull request #1.

С чего начать: README.md, затем docs/ПЕРЕДАЧА.md.
`;
execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: OUT });
execFileSync('git', ['add', '-A'], { cwd: OUT });
execFileSync('git', ['-c', 'user.name=MiMiSmart', '-c', 'user.email=noreply@example.invalid',
  'commit', '-q', '-m', сообщение], { cwd: OUT });

/* Пакет одним файлом: bundle разворачивается обычным git clone и несёт историю,
   архив — для тех, кому git не нужен. */
const bundle = join(OUT, '..', 'mimismart-site.bundle');
if (existsSync(bundle)) rmSync(bundle);
execFileSync('git', ['bundle', 'create', bundle, '--all'], { cwd: OUT, stdio: 'ignore' });

const zip = join(OUT, '..', 'mimismart-site.zip');
if (existsSync(zip)) rmSync(zip);
execFileSync('zip', ['-qr', zip, '.', '-x', '.git/*'], { cwd: OUT });

const кб = (p) => Math.round(statSync(p).size / 1024);
/* Считаем то, что увидит человек, а не служебное: без этого в число попадали
   360 файлов свежесозданного .git и цифра расходилась со списком выше. */
const счёт = (d) => readdirSync(d, { recursive: true })
  .filter((f) => !String(f).startsWith('.git/') && statSync(join(d, String(f))).isFile()).length;

console.log(`дерево:  ${OUT}`);
console.log(`файлов:  ${файлы.length} (не поехало ${убрано}: архивы и вендорные скиллы)`);
console.log(`bundle:  ${bundle} — ${кб(bundle)} КБ, разворачивается git clone`);
console.log(`архив:   ${zip} — ${кб(zip)} КБ`);
console.log(`внутри дерева файлов: ${счёт(OUT)}`);
