import type { Metadata } from 'next';
import { answers, clusters, pageTitle, pageDescription, SITE } from '@/lib/content';

const TITLE = 'Умный дом без облака — инженерия под ключ';
const LEDE = 'Логика управления живёт в доме, а не на сервере производителя: свет и климат работают без интернета. Тринадцать инженерных систем в одном проекте, собственное производство контроллеров с 2004 года.';

export const metadata: Metadata = {
  title: pageTitle('Умный дом без облака'),
  description: pageDescription(LEDE),
  alternates: { canonical: `${SITE}/` },
};

export default function Home() {
  const featured = answers.slice(0, 6);
  return (
    <div className="shell">
      <p className="eyebrow">Инженерный подрядчик · с 2004 года</p>
      <h1>{TITLE}</h1>
      <div className="lede"><p>{LEDE}</p></div>

      <h2>С чего начинают</h2>
      <div className="grid g3">
        <a className="card" href="/answers/"><span className="kicker">Ответы</span>
          <h3>{answers.length} инженерных ответов</h3>
          <p>Что входит, сколько стоит, что ломается и кто чинит — по кластерам.</p></a>
        <a className="card" href="/pricing/"><span className="kicker">Цена</span>
          <h3>Из чего складывается смета</h3>
          <p>Состав работ по стадии объекта, без придуманных цифр.</p></a>
        <a className="card" href="/service/"><span className="kicker">Сервис</span>
          <h3>Что ломается за пять лет</h3>
          <p>Регламент по узлам с известным ресурсом и разбор по журналу событий.</p></a>
      </div>

      <h2>Частые вопросы</h2>
      <div className="grid g2">
        {featured.map((a) => (
          <a className="card" key={a.slug} href={`/answers/${a.slug}/`}>
            <span className="kicker">{a.kicker}</span>
            <h3>{a.question}</h3>
          </a>
        ))}
      </div>
      <p style={{ marginTop: 18 }}><a href="/answers/">Все {answers.length} ответов по {clusters.length} направлениям →</a></p>
    </div>
  );
}
