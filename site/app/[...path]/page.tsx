import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { sections, comparisons, pages, answers, cases, pageTitle, pageDescription, SITE, BRAND } from '@/lib/content';
import LeadForm from '../components/LeadForm';
import CaseGrid from '../components/CaseGrid';
import Crumbs from '../components/Crumbs';
import ScopeCalc from '../components/ScopeCalc';

/* Разделы и сравнения приходят из выгрузки одним словарём «путь → содержимое»,
   поэтому им хватает одного шаблона: добавление раздела в прототипе появляется
   здесь само, без правки кода. */
const all: Record<string, ReturnType<typeof pick>> = {};
function pick(v: (typeof sections)[string], kind: 'section' | 'compare') { return { ...v, kind }; }
for (const [k, v] of Object.entries(sections)) all[k] = pick(v, 'section');
for (const [k, v] of Object.entries(comparisons)) all[k] = pick(v, 'compare');

/* Страницы-хабы отдаются готовой вёрсткой из прототипа: у них своя структура,
   и втискивать их в шаблон раздела значило бы переписывать текст. */
const hubs = pages;

/* Описание хаба: лид, а если он короткий — первый связный кусок текста
   страницы. Пустое или куцее описание в выдаче хуже отсутствующего. */
function hubDescription(h: (typeof pages)[string]) {
  if (h.lede && h.lede.length >= 60) return h.lede;
  const plain = h.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const body = plain.replace(h.title, '').replace(h.eyebrow, '').trim();
  return body.length >= 60 ? body : `${h.title}. ${body}`.trim();
}

export function generateStaticParams() {
  const fromConfigs = Object.keys(all).map((p) => ({ path: p.split('/') }));
  const fromHubs = Object.keys(hubs).map((u) => ({ path: u.replace(/^\//, '').split('/') }));
  return [...fromConfigs, ...fromHubs];
}

export async function generateMetadata({ params }: { params: Promise<{ path: string[] }> }): Promise<Metadata> {
  const { path } = await params;
  const key = path.join('/');
  const hub = hubs[`/${key}`];
  const url = `${SITE}/${key}/`;
  if (hub) {
    return {
      title: pageTitle(hub.title),
      description: pageDescription(hubDescription(hub)),
      alternates: { canonical: url },
      openGraph: { title: hub.title, description: pageDescription(hubDescription(hub)), url },
    };
  }
  const rec = all[key];
  if (!rec) return {};
  return {
    title: pageTitle(rec.title),
    description: pageDescription(rec.answer),
    alternates: { canonical: url },
    openGraph: { title: rec.title, description: pageDescription(rec.answer), url },
  };
}

/* Дети раздела. В прототипе вложенные страницы рисовал хэш-роутер, и в
   перенесённом HTML их списков не оказалось: сорок две страницы из ста
   тридцати семи не имели ни одной входящей ссылки. До них не доходил ни
   человек из меню, ни краулер по сайту — треть материала существовала
   только для того, кто знает адрес. */
function childrenOf(key: string) {
  const all = { ...sections, ...comparisons };
  const prefix = key ? `${key}/` : '';
  const direct = Object.keys(all)
    .filter((k) => k.startsWith(prefix) && !k.slice(prefix.length).includes('/'))
    .sort();
  return direct.map((k) => ({ key: k, rec: all[k] }));
}

/* Заголовок списка называет то, что в нём лежит: «разборы» на сравнениях и
   «направления» на функциях — не одно и то же, и общая подпись читается как
   служебная. */
const HUB_HEADING: Record<string, string> = {
  compare: 'Разборы',
  functions: 'Направления инженерии',
  equipment: 'Оборудование по группам',
  solutions: 'Типы объектов',
  partners: 'Кому и что мы предлагаем',
  pricing: 'Ещё о цене',
  portfolio: 'Разделы',
};

function ChildList({ items, heading }: { items: ReturnType<typeof childrenOf>; heading: string }) {
  if (!items.length) return null;
  /* Перечень объявляется перечнем: без ItemList машина видит набор ссылок
     и не знает, что это полный список раздела и сколько в нём страниц. */
  const ld = {
    '@context': 'https://schema.org', '@type': 'ItemList', name: heading,
    numberOfItems: items.length,
    itemListElement: items.map(({ key: k, rec }, i) => ({
      '@type': 'ListItem', position: i + 1, name: rec.title, url: `${SITE}/${k}/`,
    })),
  };
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />
      <h2>{heading}</h2>
      <div className="grid g3">
        {items.map(({ key: k, rec }) => (
          <article className="card" key={k}>
            <span className="kicker">{rec.eyebrow}</span>
            <h3><a className="stretch" href={`/${k}/`}>{rec.title}</a></h3>
            {rec.answer ? <p className="clamp">{rec.answer}</p> : null}
          </article>
        ))}
      </div>
    </>
  );
}

export default async function SectionPage({ params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const key = path.join('/');
  const hub = hubs[`/${key}`];
  if (hub) {
    return (
      <div className="shell">
        <Crumbs items={[{ name: 'Главная', href: '/' }, { name: hub.title }]} />
        <div dangerouslySetInnerHTML={{ __html: hub.html }} />
        {/* Форма живёт только на контактах: одна точка приёма заявок, а не
            кнопка на каждой странице, ведущая в разные места. */}
        {/* Кейсы вставлял скрипт прототипа, и в выгрузку попадал пустой
            контейнер: раздел открывался одним заголовком. Теперь объекты
            приходят из того же файла контента, что и весь остальной текст. */}
        {/* Шоурум — единственный адрес, который на сайте подтверждён: телефон
            и почта помечены как заглушки и в разметку не идут. Место с адресом
            и часами — это вход в локальный поиск, и отдавать его машине
            строкой текста вместо разметки значит не отдавать вовсе. */}
        {key === 'showroom' && (
          <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
            '@context': 'https://schema.org', '@type': 'LocalBusiness',
            '@id': `${SITE}/showroom/#showroom`, name: `Шоурум ${BRAND}`,
            description: 'Действующая система умного дома: сцены света, шторы, климат и щит автоматизации можно включить руками до заказа проекта.',
            url: `${SITE}/showroom/`,
            address: {
              '@type': 'PostalAddress', addressCountry: 'RU', addressLocality: 'Москва',
              streetAddress: 'Новоданиловская набережная, 6к1',
            },
            openingHoursSpecification: [{
              '@type': 'OpeningHoursSpecification',
              dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
              opens: '09:00', closes: '18:00',
            }],
            parentOrganization: { '@type': 'Organization', name: BRAND },
          }) }} />
        )}
        {key === 'portfolio' && <CaseGrid items={cases} />}
        {/* Заголовок и объяснение к калькулятору приезжают из контента:
            там сказано, почему он не считает деньги. */}
        {key === 'pricing' && <ScopeCalc />}
        {/* Список вложенных разделов идёт последним: перед калькулятором он
            дублировал карточкой то, что стоит следом. */}
        {key !== 'contacts' && (
          <ChildList items={childrenOf(key)} heading={HUB_HEADING[key] || 'Разделы направления'} />
        )}
        {key === 'contacts' && (
          <>
            <h2>Заявка на предварительный расчёт</h2>
            <LeadForm />
          </>
        )}
      </div>
    );
  }
  const rec = all[key];
  if (!rec) notFound();

  const parts = key.split('/');
  const trail = parts.slice(0, -1).map((_, i) => {
    const k = parts.slice(0, i + 1).join('/');
    const rc = all[k] || pages[`/${k}`];
    return { name: rc ? rc.title : k, href: `/${k}/` };
  });
  const related = answers.filter((a) => a.expandedText.length > 0).slice(0, 3);

  return (
    <div className="shell">
      {/* Промежуточные ступени берём из самого адреса: раздел третьего
          уровня без них выглядит для машины ребёнком главной. */}
      <Crumbs items={[{ name: 'Главная', href: '/' }, ...trail, { name: rec.title }]} />
      <p className="eyebrow">{rec.eyebrow}</p>
      <h1>{rec.title}</h1>
      <div className="lede" dangerouslySetInnerHTML={{ __html: rec.answerHtml }} />

      <ChildList items={childrenOf(key)} heading="Внутри направления" />

      {rec.items.length > 0 && (
        <>
          <h2>{rec.label || 'Состав направления'}</h2>
          <div className="grid g2">
            {rec.items.map((it, i) => (
              <div className="card" key={i}><p dangerouslySetInnerHTML={{ __html: it.html }} /></div>
            ))}
          </div>
        </>
      )}

      {rec.risks.length > 0 && (
        <>
          <h2>Что ломается без согласования</h2>
          <div className="grid g2">
            {rec.risks.map((r, i) => (
              <div className="card" key={i}><p dangerouslySetInnerHTML={{ __html: r.html }} /></div>
            ))}
          </div>
        </>
      )}

      <h2>Ответы по теме</h2>
      <div className="grid g3">
        {related.map((a) => (
          <article className="card" key={a.slug}><span className="kicker">{a.kicker}</span><h3><a className="stretch" href={`/answers/${a.slug}/`}>{a.question}</a></h3>
          </article>
        ))}
      </div>
    </div>
  );
}
