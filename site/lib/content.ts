/**
 * Единственный источник содержания. Файл выгружается из прототипа командой
 * `node tools/export-content.mjs` — руками сюда ничего не переносится, иначе
 * текст на сайте и в прототипе разъедутся молча.
 */
import data from './content.json';

export type Answer = {
  slug: string; url: string; cluster: string; kicker: string;
  question: string; answer: string; answerHtml: string;
  expandedHtml: string; expandedText: string; unverified: string[];
};
export type Comparison = Section & {
  rows: string[][]; myths: string[][]; whenA: string; whenB: string;
};
export type Section = {
  prov?: string;
  url: string; crumb: string; eyebrow: string; title: string; label: string;
  answerHtml: string; answer: string;
  items: { html: string; text: string }[];
  risks: { html: string; text: string }[];
};

export const answers = data.answers as Answer[];
export const clusters = data.clusters as string[];
export const sections = data.sections as Record<string, Section>;
export const comparisons = data.comparisons as unknown as Record<string, Comparison>;

export type Case = {
  title: string; stage: string; pain: string;
  task: string; systems: string; result: string; tags: string[];
  /* Паспорт объекта и два поля, которых нет ни у одного игрока рынка:
     измеримый результат и то, что не получилось. Пустые не показываются. */
  type: string; area: number; city: string; year: string;
  metric: string; hard: string;
};
export const cases = data.cases as Case[];

export type Scenario = {
  номер: string; имя: string; что: string; чтоHtml: string; нужно: string; семьи: string[];
};
export const scenarios = data.scenarios as Scenario[];

export type Page = {
  url: string; id: string; title: string; eyebrow: string; lede: string;
  html: string; textLength: number;
};
export const pages = data.pages as Record<string, Page>;

export const BRAND = 'MiMiSmart';
/* Боевой адрес пока не назначен, поэтому здесь заглушка — и она намеренно
   невалидна: подставь сюда что-то правдоподобное, и canonical на 137 страницах
   начнёт указывать на чужой домен молча.
   Для превью адрес задаётся переменной окружения при сборке:
   SITE_URL=https://имя.netlify.app npx next build */
export const SITE = process.env.SITE_URL || 'https://example.invalid'; // ⚠️ заполнить: боевой домен

/** Заголовок страницы: вопрос как есть плюс бренд, без хвостов-описаний.
 *  Считаем длину суффикса, а не вычитаем на глаз: прежняя формула давала 61
 *  знак при пороге 60 — на всех длинных вопросах сразу. */
const SUFFIX = ` — ${BRAND}`;
export function pageTitle(t: string) {
  /* Заголовок — это сам вопрос целиком. Приставка бренда добавляется, только
     если после неё остаётся запас: она стоила двенадцать знаков на каждой
     странице, и семьдесят два заголовка обрывались многоточием посреди
     вопроса. Имя компании при этом никуда не делось — оно в разметке
     организации и в og:site_name на каждой странице.

     Обрезка длинных вопросов убрана после того, как я прочитал результат.
     Механический рез по границе смысла дал «Какие протоколы использует умный
     дом (KNX?» — обрыв внутри скобки — и «У меня уже стоит система от другого
     подрядчика?», где утверждение о своём объекте превратилось в чужой
     вопрос. Длина — условность выдачи, которая всё равно режет по ширине в
     пикселях; смысл — не условность. Длинный, но верный заголовок лучше
     короткого, говорящего не то. */
  const full = t + SUFFIX;
  return full.length <= 60 ? full : t;
}

/** Описание строится из прямого ответа: это то, что извлекает поиск. */
export function pageDescription(t: string) {
  /* Предложение с пометкой о непроверенном в описание не идёт целиком.
     Вырезать один значок нельзя — тогда неподтверждённое уедет в выдачу
     как утверждённое; это то же решение, по которому такие ответы не
     попадают в разметку FAQPage. Одна страница уже отдавала поисковику
     «…собираются на собственной линии в Москве ⚠️ состав производства
     подтвердить» — ровно то, что стандарт проекта запрещает. */
  const clean = t
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .filter((sentence) => !sentence.includes('⚠️'))
    .join(' ')
    .trim();
  const s = (clean.length >= 60 ? clean : t.replace(/\s+/g, ' ').replace(/⚠️[^.!?]*/g, '').replace(/\s+/g, ' ')).trim();
  if (s.length <= 160) return s;

  /* Обрыв ищем по границе смысла, а не по числу знаков. Раньше резали ровно
     на 157-м и приклеивали многоточие: из 139 описаний 132 заканчивались
     посреди придаточного, вида «…без единого проекта,…». В выдаче это и есть
     тот текст, который человек прочтёт целиком.
     Сначала пробуем закончить предложением, потом — границей придаточного
     (тире, точка с запятой, двоеточие, запятая), и только если ни одна не
     попала в разумный отрезок, режем по слову. */
  const первое = s.split(/(?<=[.!?])\s+/)[0];
  if (первое.length >= 60 && первое.length <= 160) return первое;

  const зона = s.slice(0, 158);
  const граница = Math.max(
    зона.lastIndexOf(' — '), зона.lastIndexOf('; '),
    зона.lastIndexOf(': '), зона.lastIndexOf(', '),
  );
  if (граница >= 60) return `${зона.slice(0, граница).replace(/[\s,;:—-]+$/, '')}…`;

  const cut = s.slice(0, 157);
  return `${cut.slice(0, cut.lastIndexOf(' ')).replace(/[\s,;:—-]+$/, '')}…`;
}

export function byCluster() {
  const map = new Map<string, Answer[]>();
  for (const c of clusters) map.set(c, []);
  for (const a of answers) {
    if (!map.has(a.cluster)) map.set(a.cluster, []);
    map.get(a.cluster)!.push(a);
  }
  return map;
}

/** Страница контактов рендерится не сырым HTML прототипа, а с живой формой. */
export const contactsPage = pages['/contacts'];

/* Карточка для пересылки. Next не наследует openGraph родителя, когда
   страница задаёт свои title и description: картинка оставалась только на
   главной, а на остальных ста тридцати пяти ссылка приходила голой строкой.
   Собираем мету в одном месте, чтобы это не расходилось снова. */
export function ogFor(title: string, description: string, url: string, type: 'website' | 'article' = 'website') {
  return {
    openGraph: {
      type, locale: 'ru_RU', siteName: BRAND, title, description, url,
      images: [{ url: `${SITE}/og.png`, width: 1200, height: 630,
        alt: `${BRAND} — умный дом без облака, инженерный подрядчик с 2004 года` }],
    },
    twitter: { card: 'summary_large_image' as const, title, description, images: [`${SITE}/og.png`] },
  };
}
