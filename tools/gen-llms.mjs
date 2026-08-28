#!/usr/bin/env node
/**
 * Собирает site/public/llms.txt — файл для обходчиков языковых моделей.
 *
 * Он существовал только в site-foundation и в сборку не попадал: сайт,
 * спроектированный под ИИ-поиск, не отдавал единственный файл, написанный
 * прямо для ИИ. Текст остаётся авторским, а числа и адреса подставляются из
 * содержимого — иначе «78 ответов» переживёт семьдесят девятый и соврёт.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'site-foundation/llms.txt');
const OUT = join(ROOT, 'site/public/llms.txt');
const data = JSON.parse(readFileSync(join(ROOT, 'site/lib/content.json'), 'utf8'));

const ответов = data.answers.length;
const направлений = new Set(data.answers.map((a) => a.cluster)).size;
const телефон = (readFileSync(join(ROOT, 'site/lib/nav.ts'), 'utf8')
  .match(/PHONE\s*=\s*'([^']+)'/) || [])[1];

/* Адрес сайта — из того же места, что и у сборки: переменная окружения, иначе
   заглушка. */
const SITE = process.env.SITE_URL
  || (readFileSync(join(ROOT, 'site/lib/content.ts'), 'utf8')
    .match(/'(https:\/\/[^']+)'; \/\/ ⚠️/) || [])[1]
  || 'https://example.invalid';

function build() {
  let t = readFileSync(SRC, 'utf8');
  /* Ссылки абсолютные: файл забирают отдельно от сайта, и относительный
     «/answers» модели, читающей его вне контекста, разрешить не из чего. */
  t = t.replace(/\]\((\/[^)]*)\)/g, (_, путь) => `](${SITE}${путь})`);
  t = t.replace(/\[\d+ ответов на вопросы покупателя\]/, `[${ответов} ответов на вопросы покупателя]`);
  t = t.replace(/По \d+ направлениям/g, `По ${направлений} направлениям`);
  /* Телефон в файле для машин — из того же места, что и на страницах. */
  if (телефон && !t.includes(телефон)) {
    t = t.replace(/(- Шоурум: [^\n]+)/, `$1\n- Телефон: ${телефон}`);
  }
  return t;
}

/* Структурированные цены упомянуты в llms.txt и лежали только в основаниях:
   ссылка из файла для машин вела в никуда. Кладём рядом. */
const PRICING_SRC = join(ROOT, 'site-foundation/pricing.md');
const PRICING_OUT = join(ROOT, 'site/public/pricing.md');
writeFileSync(PRICING_OUT, readFileSync(PRICING_SRC, 'utf8'), 'utf8');

const первый = build();
writeFileSync(OUT, первый, 'utf8');
/* Собери дважды — получи то же самое: генератор, зависящий от собственного
   прошлого вывода, уже ломал конвейер один раз. */
if (build() !== первый) {
  console.error('сборка llms.txt не идемпотентна');
  process.exit(1);
}
if (!existsSync(OUT)) process.exit(1);
console.log(`site/public/llms.txt: ${первый.split('\n').length} строк, ответов ${ответов}, направлений ${направлений}; pricing.md рядом`);
