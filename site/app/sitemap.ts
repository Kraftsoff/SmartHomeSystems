import type { MetadataRoute } from 'next';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { answers, sections, comparisons, pages, SITE } from '@/lib/content';

/* Карта сайта строится из тех же данных, что и страницы. Ручной sitemap.xml
   расходился с маршрутами молча — это уже случалось, и приёмка это ловила. */
export const dynamic = 'force-static';

/* Дата изменения обязана быть настоящей. Раньше все 139 адресов получали
   момент сборки: карта говорила, что весь сайт меняется целиком при каждой
   выкладке, и приучала обходчика не верить признаку — а он ровно затем и
   существует, чтобы подсказать, что перечитать.
   Держим рядом запись «адрес → отпечаток содержимого и дата». Отпечаток тот
   же — дата остаётся прежней; изменился — ставим сегодняшнюю. */
const ЗАПИСЬ = resolve(process.cwd(), '../site-foundation/lastmod.json');

function датаИзменения(): Map<string, string> {
  let прежние: Record<string, { хеш: string; дата: string }> = {};
  try { прежние = JSON.parse(readFileSync(ЗАПИСЬ, 'utf8')); } catch { /* первой сборки ещё не было */ }

  const сегодня = new Date().toISOString().slice(0, 10);
  const свежие: Record<string, { хеш: string; дата: string }> = {};
  const итог = new Map<string, string>();

  const отпечаток = (t: string) => createHash('sha1').update(t).digest('hex').slice(0, 16);
  const запиши = (url: string, содержимое: string) => {
    const хеш = отпечаток(содержимое);
    const было = прежние[url];
    const дата = было && было.хеш === хеш ? было.дата : сегодня;
    свежие[url] = { хеш, дата };
    итог.set(url, дата);
  };

  запиши('/', `${answers.length} ${Object.keys(sections).length}`);
  запиши('/answers/', answers.map((a) => a.question).join('|'));
  for (const [k, v] of Object.entries(pages)) запиши(`${k}/`, JSON.stringify(v));
  for (const a of answers) запиши(`${a.url}/`, `${a.question}${a.answer}${a.expandedText}`);
  for (const [k, v] of Object.entries(sections)) запиши(`/${k}/`, JSON.stringify(v));
  for (const [k, v] of Object.entries(comparisons)) запиши(`/${k}/`, JSON.stringify(v));

  try { writeFileSync(ЗАПИСЬ, `${JSON.stringify(свежие, null, 2)}\n`, 'utf8'); } catch { /* только чтение */ }
  return итог;
}

export default function sitemap(): MetadataRoute.Sitemap {
  const даты = датаИзменения();
  const urls = [
    { url: `${SITE}/`, priority: 1 },
    { url: `${SITE}/answers/`, priority: 0.9 },
    /* Страницы-хабы перечисляются отдельно: они не лежат ни в разделах, ни в
       сравнениях, и одиннадцать адресов — цены, кейсы, контакты, о компании —
       в карту не попадали, хотя это самые важные страницы после главной. */
    ...Object.keys(pages).map((k) => ({ url: `${SITE}${k}/`, priority: 0.9 })),
    ...answers.map((a) => ({ url: `${SITE}${a.url}/`, priority: 0.8 })),
    ...Object.keys(sections).map((k) => ({ url: `${SITE}/${k}/`, priority: 0.7 })),
    ...Object.keys(comparisons).map((k) => ({ url: `${SITE}/${k}/`, priority: 0.7 })),
  ];
  return urls.map((u) => ({
    ...u,
    lastModified: даты.get(u.url.replace(SITE, '')) || new Date().toISOString().slice(0, 10),
    changeFrequency: 'monthly' as const,
  }));
}
