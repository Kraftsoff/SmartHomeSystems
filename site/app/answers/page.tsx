import type { Metadata } from 'next';
import { answers, byCluster, pageTitle, pageDescription, SITE } from '@/lib/content';
import AnswerSearch from '../components/AnswerSearch';

const TITLE = 'База инженерных ответов';
const LEDE = `Семьдесят семь вопросов, которые задают до подписания договора: что входит, сколько стоит, что ломается и кто чинит. Каждый ответ начинается с прямого ответа.`;

export const metadata: Metadata = {
  title: pageTitle(TITLE),
  description: pageDescription(LEDE),
  alternates: { canonical: `${SITE}/answers/` },
};

export default function AnswersIndex() {
  const map = byCluster();
  /* FAQPage собирается из тех же карточек, что видит человек: один источник
     правды. Ответы с непроверенным в прямой части в разметку не идут целиком —
     вырезать пометку нельзя, иначе неподтверждённое уходит машине как факт. */
  const clean = answers.filter((a) => !/⚠️/.test(a.answer));
  const faq = {
    '@context': 'https://schema.org', '@type': 'FAQPage',
    mainEntity: clean.map((a) => ({
      '@type': 'Question', name: a.question,
      acceptedAnswer: { '@type': 'Answer', text: a.answer },
    })),
  };

  return (
    <div className="shell">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faq) }} />
      <p className="crumbs"><a href="/">Главная</a> / Ответы</p>
      <p className="eyebrow">Ответы</p>
      <h1>{TITLE}</h1>
      <div className="lede"><p>{LEDE}</p></div>
      {/* Поиск — надстройка: без скриптов ниже остаётся полный список по
          кластерам, поэтому краулер и читатель без JS ничего не теряют. */}
      <AnswerSearch items={answers.map((a) => ({
        slug: a.slug, question: a.question, answer: a.answer, expanded: a.expandedText,
        cluster: a.cluster, kicker: a.kicker,
      }))} />
      {[...map.entries()].map(([cluster, list]) => (
        <section key={cluster}>
          <h2>{cluster} <span className="kicker">{list.length}</span></h2>
          <div className="grid g3">
            {list.map((a) => (
              <a className="card" key={a.slug} href={`/answers/${a.slug}/`}>
                <span className="kicker">{a.kicker}</span>
                <h3>{a.question}</h3>
                <p dangerouslySetInnerHTML={{ __html: a.answerHtml }} />
              </a>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
