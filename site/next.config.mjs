/**
 * Статическая генерация: каждый маршрут превращается в отдельный HTML-файл с
 * готовым содержимым. Это и есть D1 из ТЗ — замерено, что GPTBot, OAI-SearchBot,
 * PerplexityBot и ClaudeBot не исполняют JavaScript, а прототип без него
 * показывал 1544 знака вместо всего текста.
 *
 * Редиректы при статическом экспорте Next не обслуживает: их отдаёт хостинг.
 * Конфиг для него генерируется отдельно из site-foundation/redirects.md.
 */
/* BASE_PATH нужен только для витрины на GitHub Pages: она отдаётся из
   подпапки /SmartHomeSystems, и без него все ссылки вида /answers/ уходят
   в корень домена, где ничего нет. Для боевого домена переменная не
   задаётся, и путь остаётся корневым. */
const basePath = process.env.BASE_PATH || '';

const nextConfig = {
  output: 'export',
  trailingSlash: true,
  images: { unoptimized: true },
  ...(basePath ? { basePath, assetPrefix: basePath } : {}),
};
export default nextConfig;
