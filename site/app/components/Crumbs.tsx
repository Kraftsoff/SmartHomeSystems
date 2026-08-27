import { SITE } from '@/lib/content';

export type Crumb = { name: string; href?: string };

/* Видимая цепочка и разметка для машины делаются из одного списка. Порознь
   они расходятся молча: на сайте крошки были на 136 страницах, а разметки
   BreadcrumbList — ни на одной, и иерархию сайта машине читать было нечем. */
export default function Crumbs({ items }: { items: Crumb[] }) {
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((c, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: c.name,
      ...(c.href ? { item: `${SITE}${c.href}` } : {}),
    })),
  };
  return (
    <>
      <script type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />
      <nav className="crumbs" aria-label="Вы находитесь здесь">
        {items.map((c, i) => (
          <span key={c.name}>
            {i > 0 ? ' / ' : ''}
            {c.href ? <a href={c.href}>{c.name}</a> : <span aria-current="page">{c.name}</span>}
          </span>
        ))}
      </nav>
    </>
  );
}
