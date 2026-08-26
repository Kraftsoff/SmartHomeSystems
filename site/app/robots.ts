import type { MetadataRoute } from 'next';
import { SITE } from '@/lib/content';

/* Правило, которое легко потерять: путь, отдающий 410, нельзя закрывать от
   обхода — бот его не запросит, 410 не увидит, и адрес останется в индексе.
   YandexBot не закрываем: Алиса берёт кандидатов из обычной выдачи Яндекса. */
export const dynamic = 'force-static';

export default function robots(): MetadataRoute.Robots {
  const common = { allow: '/', disallow: ['/admin', '/api/'] };
  return {
    rules: [
      { userAgent: '*', ...common },
      { userAgent: 'YandexBot', ...common },
      { userAgent: 'Googlebot', ...common },
      { userAgent: 'GPTBot', ...common },
      { userAgent: 'OAI-SearchBot', ...common },
      { userAgent: 'ClaudeBot', ...common },
      { userAgent: 'PerplexityBot', ...common },
    ],
    sitemap: `${SITE}/sitemap.xml`,
  };
}
