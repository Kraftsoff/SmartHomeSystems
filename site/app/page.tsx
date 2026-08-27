import type { Metadata } from 'next';
import HousePlan from './components/HousePlan';
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
      <div className="hero">
        <div className="hero-say">
          <p className="eyebrow">Инженерный подрядчик · с 2004 года</p>
          <h1>{TITLE}</h1>
          <p className="hero-lede">{LEDE}</p>
          {/* Первый экран без действия — тупик: человек дочитал и ушёл. Двух
              дверей достаточно: назвать задачу или сначала посмотреть цену. */}
          <div className="actions">
            <a className="btn btn-primary" href="/contacts/">Рассчитать проект</a>
            <a className="btn btn-ghost" href="/pricing/">Из чего складывается смета</a>
          </div>
        </div>
        {/* План стоит здесь, а не ниже: это единственное на сайте, что
            показывает работу системы вместо рассказа о ней, и правая половина
            первого экрана иначе пустует. */}
        <div className="hero-show">
          <h2 className="show-h">Как это работает на плане</h2>
          <HousePlan />
        </div>
      </div>

      {/* Только проверяемое: год основания, собственное производство и число
          систем берутся из документов проекта. Число объектов не ставим —
          оно не подтверждено, а на первом экране это была бы выдумка. */}
      <dl className="proof">
        <div><dt>с 2004</dt><dd>проектируем и монтируем инженерию</dd></div>
        <div><dt>свои контроллеры</dt><dd>разработка и сборка в Москве</dd></div>
        <div><dt>бессрочная гарантия</dt><dd>на контроллеры собственного производства</dd></div>
        <div><dt>{answers.length} ответов</dt><dd>на вопросы, которые задают до договора</dd></div>
      </dl>

      <h2>С чего начинают</h2>
      <div className="grid g3">
        <article className="card"><span className="kicker">Ответы</span>
          <h3><a className="stretch" href="/answers/">{answers.length} инженерных ответов</a></h3>
          <p>Что входит, сколько стоит, что ломается и кто чинит — по кластерам.</p></article>
        <article className="card"><span className="kicker">Цена</span>
          <h3><a className="stretch" href="/pricing/">Из чего складывается смета</a></h3>
          <p>Состав работ по стадии объекта, без придуманных цифр.</p></article>
        <article className="card"><span className="kicker">Сервис</span>
          <h3><a className="stretch" href="/service/">Что ломается за пять лет</a></h3>
          <p>Регламент по узлам с известным ресурсом и разбор по журналу событий.</p></article>
      </div>

      <h2>Частые вопросы</h2>
      <div className="grid g2">
        {featured.map((a) => (
          <article className="card" key={a.slug}>
            <span className="kicker">{a.kicker}</span>
            <h3><a className="stretch" href={`/answers/${a.slug}/`}>{a.question}</a></h3>
          </article>
        ))}
      </div>
      <p style={{ marginTop: 18 }}><a href="/answers/">Все {answers.length} ответов по {clusters.length} направлениям →</a></p>
    </div>
  );
}
