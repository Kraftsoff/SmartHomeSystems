import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Crumbs from '../../components/Crumbs';
import { answers, pageTitle, pageDescription, SITE, BRAND } from '@/lib/content';

export function generateStaticParams() {
  return answers.map((a) => ({ slug: a.slug }));
}

function find(slug: string) {
  return answers.find((a) => a.slug === slug);
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const a = find(slug);
  if (!a) return {};
  const url = `${SITE}/answers/${a.slug}/`;
  return {
    title: pageTitle(a.question),
    description: pageDescription(a.answer),
    alternates: { canonical: url },
    openGraph: { title: a.question, description: pageDescription(a.answer), url, type: 'article' },
  };
}

export default async function AnswerPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const a = find(slug);
  if (!a) notFound();

  const related = answers.filter((x) => x.cluster === a.cluster && x.slug !== a.slug).slice(0, 4);
  const url = `${SITE}/answers/${a.slug}/`;

  /* Article, не QAPage: QAPage — для страниц, куда ответы присылают пользователи.
     Здесь один авторский ответ. Автора не указываем, пока имя не подтверждено:
     заглушка в структурированных данных попадёт в индекс как имя автора. */
  const ld = {
    '@context': 'https://schema.org', '@type': 'Article',
    headline: a.question, description: pageDescription(a.answer),
    articleBody: `${a.answer} ${a.expandedText}`.trim(),
    inLanguage: 'ru-RU', publisher: { '@type': 'Organization', name: BRAND },
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
  };

  return (
    <div className="shell">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />
      <Crumbs items={[{ name: 'Главная', href: '/' }, { name: 'Ответы', href: '/answers/' },
        { name: a.cluster }, { name: a.question }]} />
      <p className="eyebrow">{a.kicker}</p>
      <h1>{a.question}</h1>
      <div className="lede" dangerouslySetInnerHTML={{ __html: a.answerHtml }} />
      {a.expandedHtml ? <div dangerouslySetInnerHTML={{ __html: a.expandedHtml }} /> : null}

      {/* Ответ — точка входа: из поиска человек попадает сюда, а не на главную.
          Без следующего шага семьдесят семь страниц заканчиваются ничем.
          Действия ровно два, и оба ведут туда, где на вопрос отвечают
          цифрой по объекту, а не ещё одним текстом. */}
      <div className="next">
        <h2>Что дальше</h2>
        <p>Расчёт по вашему объекту считается по площади, стадии и составу систем —
          вопрос закрывается сметой, а не следующей статьёй.</p>
        <div className="actions">
          <a className="btn btn-primary" href="/contacts/">Рассчитать проект</a>
          <a className="btn btn-ghost" href="/pricing/">Из чего складывается смета</a>
        </div>
      </div>

      {related.length > 0 && (
        <>
          <h2>Ещё по теме «{a.cluster}»</h2>
          <div className="grid g2">
            {related.map((r) => (
              <article className="card" key={r.slug}><span className="kicker">{r.kicker}</span>
                <h3><a className="stretch" href={`/answers/${r.slug}/`}>{r.question}</a></h3>
              </article>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
