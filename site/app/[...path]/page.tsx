import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { sections, comparisons, pages, answers, cases, pageTitle, pageDescription, SITE } from '@/lib/content';
import LeadForm from '../components/LeadForm';
import CaseGrid from '../components/CaseGrid';
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

function ChildList({ items, heading }: { items: ReturnType<typeof childrenOf>; heading: string }) {
  if (!items.length) return null;
  return (
    <>
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
        <p className="crumbs"><a href="/">Главная</a> / {hub.title}</p>
        <div dangerouslySetInnerHTML={{ __html: hub.html }} />
        {/* Форма живёт только на контактах: одна точка приёма заявок, а не
            кнопка на каждой странице, ведущая в разные места. */}
        {/* Кейсы вставлял скрипт прототипа, и в выгрузку попадал пустой
            контейнер: раздел открывался одним заголовком. Теперь объекты
            приходят из того же файла контента, что и весь остальной текст. */}
        {key === 'portfolio' && <CaseGrid items={cases} />}
        <ChildList items={childrenOf(key)} heading="Разделы направления" />
        {key === 'pricing' && (
          <>
            <h2>Состав работ по вашей стадии</h2>
            <ScopeCalc />
          </>
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

  const crumbTail = rec.crumb.replace(/^\/\s*/, '');
  const related = answers.filter((a) => a.expandedText.length > 0).slice(0, 3);

  return (
    <div className="shell">
      <p className="crumbs"><a href="/">Главная</a> / {crumbTail}</p>
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
