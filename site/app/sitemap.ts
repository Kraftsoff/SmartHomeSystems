import type { MetadataRoute } from 'next';
import { answers, sections, comparisons, pages, SITE } from '@/lib/content';

/* Карта сайта строится из тех же данных, что и страницы. Ручной sitemap.xml
   расходился с маршрутами молча — это уже случалось, и приёмка это ловила. */
export const dynamic = 'force-static';

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
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
  return urls.map((u) => ({ ...u, lastModified: now, changeFrequency: 'monthly' as const }));
}
