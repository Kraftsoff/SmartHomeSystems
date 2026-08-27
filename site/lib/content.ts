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
export type Section = {
  url: string; crumb: string; eyebrow: string; title: string; label: string;
  answerHtml: string; answer: string;
  items: { html: string; text: string }[];
  risks: { html: string; text: string }[];
};

export const answers = data.answers as Answer[];
export const clusters = data.clusters as string[];
export const sections = data.sections as Record<string, Section>;
export const comparisons = data.comparisons as Record<string, Section>;

export type Case = {
  title: string; stage: string; pain: string;
  task: string; systems: string; result: string; tags: string[];
};
export const cases = data.cases as Case[];

export type Page = {
  url: string; id: string; title: string; eyebrow: string; lede: string;
  html: string; textLength: number;
};
export const pages = data.pages as Record<string, Page>;

export const BRAND = 'MiMiSmart';
export const SITE = 'https://example.invalid'; // ⚠️ заполнить: боевой домен

/** Заголовок страницы: вопрос как есть плюс бренд, без хвостов-описаний.
 *  Считаем длину суффикса, а не вычитаем на глаз: прежняя формула давала 61
 *  знак при пороге 60 — на всех длинных вопросах сразу. */
const SUFFIX = ` — ${BRAND}`;
export function pageTitle(t: string) {
  const full = t + SUFFIX;
  if (full.length <= 60) return full;
  const room = 60 - SUFFIX.length - 1;           // −1 под многоточие
  const cut = t.slice(0, room);
  const at = cut.lastIndexOf(' ');
  return `${(at > room * 0.6 ? cut.slice(0, at) : cut).trimEnd()}…${SUFFIX}`;
}

/** Описание строится из прямого ответа: это то, что извлекает поиск. */
export function pageDescription(t: string) {
  const s = t.replace(/\s+/g, ' ').trim();
  if (s.length <= 160) return s;
  /* Короче 60 знаков описание не несёт смысла для выдачи: зовущий его код
     обязан передать текст подлиннее, а не подпирать пустотой. */
  const cut = s.slice(0, 157);
  return `${cut.slice(0, cut.lastIndexOf(' '))}…`;
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
