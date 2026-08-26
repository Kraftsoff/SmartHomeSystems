/**
 * Статическая генерация: каждый маршрут превращается в отдельный HTML-файл с
 * готовым содержимым. Это и есть D1 из ТЗ — замерено, что GPTBot, OAI-SearchBot,
 * PerplexityBot и ClaudeBot не исполняют JavaScript, а прототип без него
 * показывал 1544 знака вместо всего текста.
 *
 * Редиректы при статическом экспорте Next не обслуживает: их отдаёт хостинг.
 * Конфиг для него генерируется отдельно из site-foundation/redirects.md.
 */
const nextConfig = {
  output: 'export',
  trailingSlash: true,
  images: { unoptimized: true },
};
export default nextConfig;
