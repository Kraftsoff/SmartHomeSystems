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
      /* Дальше — те, кого не было, а решают они не меньше.
         Google-Extended управляет тем, попадёт ли сайт в ответы Gemini:
         Googlebot к этому отношения не имеет, это отдельное согласие.
         YandexAdditional — то же самое для Нейро, и для рынка, где мы
         работаем, он важнее прочих.
         Bingbot кормит Copilot, Applebot-Extended — ответы Apple,
         Amazonbot — Alexa, CCBot — общий обход, из которого учится
         половина моделей. Каждый пущен намеренно: сайт написан, чтобы его
         цитировали; закрыть любого из них — решение владельца, не моё. */
      { userAgent: 'Google-Extended', ...common },
      { userAgent: 'YandexAdditional', ...common },
      { userAgent: 'Bingbot', ...common },
      { userAgent: 'Applebot', ...common },
      { userAgent: 'Applebot-Extended', ...common },
      { userAgent: 'Amazonbot', ...common },
      { userAgent: 'CCBot', ...common },
      { userAgent: 'anthropic-ai', ...common },
      { userAgent: 'Meta-ExternalAgent', ...common },
      { userAgent: 'DuckAssistBot', ...common },
      { userAgent: 'cohere-ai', ...common },
    ],
    sitemap: `${SITE}/sitemap.xml`,
  };
}
