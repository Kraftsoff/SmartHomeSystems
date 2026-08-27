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

      {/* Маршрут по ситуации, а не по разделам сайта. Человек приходит со
          своим положением — «стены открыты», «ремонт уже сделан», «я дизайнер», —
          и должен попасть в свой ответ с первого экрана, не разбирая наше
          деление на решения, направления и сравнения. Формулировки — его,
          адреса — наши. */}
      <h2>С чем вы пришли</h2>
      <div className="grid g3 routes">
        {[
          ['Квартира в ремонте, стены ещё открыты', 'Состав систем для квартиры и когда заходить, чтобы не штробить дважды', '/solutions/flat/'],
          ['Дом строится или пока проектируется', 'Котельная, скважина, ДГУ, периметр — то, чего в квартире нет', '/solutions/house/'],
          ['Ремонт уже сделан, отделка чистовая', 'Что ставится без штробления и чем такой объект отличается по цене', '/answers/remont-uzhe-sdelan-mozhno-postavit-umnyy-dom/'],
          ['Я дизайнер или архитектор', 'Что нужно от нас на стадии проекта и как не переделывать потолки', '/partners/designers/'],
          ['Офис или помещение с посетителями', 'Режимы вместо личных сценариев, СКУД и согласование с УК', '/solutions/office/'],
          ['Застройщик или жилой комплекс', 'Магистраль, стояки, этажные шкафы и диспетчеризация со стадии П', '/solutions/developers/'],
        ].map(([title, note, href]) => (
          <article className="card" key={href}>
            <h3><a className="stretch" href={href}>{title}</a></h3>
            <p>{note}</p>
          </article>
        ))}
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
