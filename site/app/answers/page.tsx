import type { Metadata } from 'next';
import { answers, byCluster, pageTitle, pageDescription, SITE } from '@/lib/content';
import AnswerSearch from '../components/AnswerSearch';
import Crumbs from '../components/Crumbs';
import ClusterFilter from '../components/ClusterFilter';

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
      <Crumbs items={[{ name: 'Главная', href: '/' }, { name: TITLE }]} />
      <p className="eyebrow">Ответы</p>
      <h1>{TITLE}</h1>
      <div className="lede"><p>{LEDE}</p></div>
      {/* Поиск — надстройка: без скриптов ниже остаётся полный список по
          кластерам, поэтому краулер и читатель без JS ничего не теряют. */}
      <AnswerSearch items={answers.map((a) => ({
        slug: a.slug, question: a.question, answer: a.answer, expanded: a.expandedText,
        cluster: a.cluster, kicker: a.kicker,
      }))} />
      {/* Отбор стоит после поиска: поиск отвечает на «мне нужно про
          протечку», отбор — на «покажи всё про сервис». Разные вопросы. */}
      <ClusterFilter clusters={[...map.entries()].map(([c, l]) => [c, l.length])} />

      {[...map.entries()].map(([cluster, list]) => (
        <section key={cluster} data-cluster={cluster}>
          <h2>{cluster} <span className="kicker">{list.length}</span></h2>
          <div className="grid g3">
            {list.map((a) => (
              <article className="card" key={a.slug}>
                <span className="kicker">{a.kicker}</span>
                <h3><a className="stretch" href={`/answers/${a.slug}/`}>{a.question}</a></h3>
                <p className="clamp" dangerouslySetInnerHTML={{ __html: a.answerHtml }} />
                <p className="more-hint">Читать ответ →</p>
              </article>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
