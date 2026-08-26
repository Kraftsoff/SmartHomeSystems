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

export const BRAND = 'MiMiSmart';
export const SITE = 'https://example.invalid'; // ⚠️ заполнить: боевой домен

/** Заголовок страницы: вопрос как есть плюс бренд, без хвостов-описаний. */
export function pageTitle(t: string) {
  const full = `${t} — ${BRAND}`;
  return full.length <= 60 ? full : `${t.slice(0, 57 - BRAND.length)}… — ${BRAND}`;
}

/** Описание строится из прямого ответа: это то, что извлекает поиск. */
export function pageDescription(t: string) {
  const s = t.replace(/\s+/g, ' ').trim();
  if (s.length <= 160) return s;
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
