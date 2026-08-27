import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { sections, comparisons, pages, answers, cases, pageTitle, pageDescription, ogFor, SITE, BRAND } from '@/lib/content';
import { LINKS } from '@/lib/nav';
import LeadForm from '../components/LeadForm';
import NextSteps from '../components/NextSteps';
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
      ...ogFor(pageTitle(hub.title), pageDescription(hubDescription(hub)), url),
    };
  }
  const rec = all[key];
  if (!rec) return {};
  return {
    title: pageTitle(rec.title),
    description: pageDescription(rec.answer),
    alternates: { canonical: url },
    ...ogFor(pageTitle(rec.title), pageDescription(rec.answer), url),
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
            {/* Разметка, а не голый текст: в прямом ответе стоят пометки о
                непроверенном, и в текстовом поле они теряют оформление —
                значок остаётся, выделение пропадает, и такую строку легко
                опубликовать не заметив. */}
            {rec.answerHtml
              ? <p className="clamp" dangerouslySetInnerHTML={{ __html: rec.answerHtml }} />
              : null}
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
        {/* Имя раздела берём из меню: заголовок хаба — предложение
            («Разработчик, производитель и инженерный подрядчик»), и в цепочке
            он занимает строку целиком. */}
        <Crumbs items={[{ name: 'Главная', href: '/' },
          { name: LINKS.find(([href]) => href === `/${key}/`)?.[1] || hub.title }]} />
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
        {/* Снимки зала живут в слое представления, а не в прототипе: тот
            открывается с диска, и абсолютные пути к файлам там не
            разрешаются — приёмка прототипа ловит это ошибкой консоли. */}
        {key === 'showroom' && (
          <>
            <h2>Как выглядит зал</h2>
            <p>Панели управления на стене, образцы выключателей, щит автоматизации
              и переговорный стол, за которым разбирают планировку. Снимки наши,
              не каталожные: то, что на них видно, включается руками при вас.</p>
            <div className="grid g3 shots">
              {[
                ['showroom-msk-3.jpg', 'Зал шоурума: панель управления на телевизоре, стеллажи с образцами выключателей, переговорная зона', 815, 460],
                ['showroom-msk-5.jpg', 'Переговорный стол шоурума, за которым разбирают планировку объекта', 1050, 1400],
                ['showroom-msk-2.jpg', 'Образцы выключателей и панелей на стенде шоурума', 555, 467],
              ].map(([file, alt, w, h]) => (
                <figure key={file as string}>
                  <img src={`/showroom/${file}`} alt={alt as string} loading="lazy"
                    width={w as number} height={h as number} />
                </figure>
              ))}
            </div>
          </>
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
        {/* Страница заканчивается действием: раздел — это конец пути из
            поиска, и до сих пор он упирался в подвал. */}
        {key !== 'contacts' && key !== 'privacy' && (
          <NextSteps here={`/${key}/`} />

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

  /* Короткие имена для цепочки берём из поля crumb — они там уже есть:
     «/ Датчики / Протечки». Я подставил вместо них полные заголовки, и
     цепочка на листе третьего уровня заняла три строки, потому что заголовок
     раздела — это предложение, а не имя. Хвост crumb совмещаем с концом
     адреса, недостающее начало — с именем хаба из меню. */
  const parts = key.split('/');
  const tail = rec.crumb.split('/').map((x) => x.trim()).filter(Boolean);
  const head = parts.slice(0, parts.length - tail.length).map((seg, i) => {
    const path = `/${parts.slice(0, i + 1).join('/')}/`;
    const link = LINKS.find(([href]) => href === path);
    return { name: link ? link[1] : seg, href: path };
  });
  const trail = [
    ...head,
    ...tail.slice(0, -1).map((name, i) => ({
      name, href: `/${parts.slice(0, head.length + i + 1).join('/')}/`,
    })),
  ];
  const current = tail[tail.length - 1] || rec.title;

  /* Ответы по теме подбираются по совпадению значимых слов с самим разделом.
     Раньше сюда шли первые три из семидесяти семи — одни и те же на всех
     сорока четырёх разделах, и на странице про датчик протечки предлагалось
     читать про выбор интегратора. */
  const stop = new Set(['который', 'которая', 'которые', 'этого', 'этому', 'такое',
    'может', 'можно', 'нужно', 'после', 'через', 'между', 'вместе', 'только', 'если']);
  /* Слово обрезается до восьми знаков, а не до шести: на шести
     «электроприводной» и «электрокарнизы» становятся одним словом, и странице
     про датчик протечки предлагались карнизы. Совпадение весит тем больше,
     чем реже слово встречается во всём наборе, — иначе побеждают «система»
     и «объект», которые есть везде и не значат ничего. */
  const words = (t: string) => new Set(
    t.toLowerCase().match(/[а-яёa-z]{5,}/g)?.map((w) => w.slice(0, 8)).filter((w) => !stop.has(w)) || [],
  );
  const corpus = answers.map((a) => words(`${a.question} ${a.answer}`));
  const df = new Map<string, number>();
  for (const set of corpus) for (const w of set) df.set(w, (df.get(w) || 0) + 1);
  const mine = words(`${rec.title} ${rec.answer} ${rec.eyebrow}`);
  const related = answers
    .map((a, i) => {
      let score = 0;
      for (const w of corpus[i]) {
        if (mine.has(w)) score += Math.log(answers.length / (df.get(w) || 1));
      }
      return { a, score: score / Math.sqrt(corpus[i].size || 1) };
    })
    .sort((x, y) => y.score - x.score)
    .slice(0, 3)
    .map((x) => x.a);

  return (
    <div className="shell">
      {/* Промежуточные ступени берём из самого адреса: раздел третьего
          уровня без них выглядит для машины ребёнком главной. */}
      <Crumbs items={[{ name: 'Главная', href: '/' }, ...trail, { name: current }]} />
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

      {/* Риски отличаются от состава оформлением, а не только заголовком над
          ними: два одинаковых ряда белых карточек читаются как один список,
          и при просмотре глазами не видно, где то, что получаешь, а где то,
          что ломается. */}
      {rec.risks.length > 0 && (
        <>
          <h2>Что ломается без согласования</h2>
          <div className="grid g2">
            {rec.risks.map((r, i) => (
              <div className="card risk" key={i}><p dangerouslySetInnerHTML={{ __html: r.html }} /></div>
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

      {/* Раздел — конец пути из поиска: человек прочитал про свою систему и
          до сих пор упирался в подвал. */}
      <NextSteps here={`/${key}/`} />
    </div>
  );
}
