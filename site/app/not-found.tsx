import type { Metadata } from 'next';
import { answers, clusters } from '@/lib/content';
import { PHONE, PHONE_HREF } from '@/lib/nav';

export const metadata: Metadata = {
  title: 'Страница не найдена — MiMiSmart',
  robots: { index: false, follow: true },
};

/* Своя страница вместо стандартной. Next отдавал английское «404: This page
   could not be found» на русском сайте, без единого следующего шага. Сюда
   попадают по старым ссылкам с пяти доменов — всё, чего нет в карте из 194
   правил, — и упирались в тупик на чужом языке. */
export default function NotFound() {
  return (
    <div className="shell">
      <p className="eyebrow">Страница не найдена</p>
      <h1>Такого адреса на сайте нет</h1>
      <div className="lede">
        <p>Скорее всего, вы пришли по ссылке со старого сайта: адреса поменялись,
          и часть страниц теперь называется иначе. Содержимое никуда не делось —
          ниже места, куда чаще всего идут.</p>
      </div>

      <div className="actions">
        <a className="btn btn-primary" href="/answers/">Найти ответ по вопросу</a>
        <a className="btn btn-ghost" href="/">На главную</a>
      </div>

      <h2>Куда идут чаще всего</h2>
      <div className="grid g3">
        <article className="card">
          <span className="kicker">Ответы</span>
          <h3><a className="stretch" href="/answers/">{answers.length} инженерных ответов</a></h3>
          <p>По {clusters.length} темам: что входит, сколько стоит, что ломается и кто чинит.</p>
        </article>
        <article className="card">
          <span className="kicker">Цена</span>
          <h3><a className="stretch" href="/pricing/">Из чего складывается смета</a></h3>
          <p>Состав работ по стадии объекта и что в эту цифру не входит.</p>
        </article>
        <article className="card">
          <span className="kicker">Решения</span>
          <h3><a className="stretch" href="/solutions/">Кому и что мы проектируем</a></h3>
          <p>Квартира, дом, офис, коммерческое помещение, жилой комплекс.</p>
        </article>
      </div>

      <div className="next">
        <h2>Не нашли, что искали</h2>
        <p>Назовите объект и вопрос — ответим тем же, чем отвечает сайт: цифрой
          и составом работ.</p>
        <div className="actions">
          <a className="btn btn-primary" href={PHONE_HREF}>Позвонить {PHONE}</a>
          <a className="btn btn-ghost" href="/contacts/">Написать</a>
        </div>
      </div>
    </div>
  );
}
