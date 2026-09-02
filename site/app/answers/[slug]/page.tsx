import type { Metadata } from 'next';
import NextSteps from '@/app/components/NextSteps';
import { notFound } from 'next/navigation';
import Crumbs from '../../components/Crumbs';
import { nearestAnswers } from '@/lib/related';
import { ogFor, answers, pageTitle, pageDescription, SITE, BRAND } from '@/lib/content';

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
    ...ogFor(pageTitle(a.question), pageDescription(a.answer), url, 'article'),
  };
}

export default async function AnswerPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const a = find(slug);
  if (!a) notFound();

  /* Ближайшие по тексту, а не первые четыре своего кластера: в кластере из
     двенадцати порядок массива к теме отношения не имеет. */
  const related = nearestAnswers(`${a.question} ${a.answer}`, 4, a.slug);
  const url = `${SITE}/answers/${a.slug}/`;

  /* Article, не QAPage: QAPage — для страниц, куда ответы присылают пользователи.
     Здесь один авторский ответ. Автора не указываем, пока имя не подтверждено:
     заглушка в структурированных данных попадёт в индекс как имя автора. */
  const ld = {
    '@context': 'https://schema.org', '@type': 'Article',
    headline: a.question, description: pageDescription(a.answer),
    articleBody: `${a.answer} ${a.expandedText}`.trim(),
    /* Ссылка на организацию, а не вторая её копия: сущность одна на сайт. */
    inLanguage: 'ru-RU', publisher: { '@id': `${SITE}/#organization` },
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
  };

  return (
    <div className="shell">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />
      <Crumbs items={[{ name: 'Главная', href: '/' },
        { name: 'Ответы', href: '/answers/' }, { name: a.cluster }]} />
      <p className="eyebrow">{a.kicker}</p>
      <h1>{a.question}</h1>
      <div className="lede" dangerouslySetInnerHTML={{ __html: a.answerHtml }} />
      {a.expandedHtml ? <div dangerouslySetInnerHTML={{ __html: a.expandedHtml }} /> : null}

      <NextSteps here={`/answers/${a.slug}/`} />

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
