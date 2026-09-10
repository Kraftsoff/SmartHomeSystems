import { answers, type Answer } from './content';

/* Мера близости одна на весь сайт. Раньше её знали только страницы разделов,
   а страница ответа брала первые четыре записи своего кластера по порядку
   массива: в кластере из двенадцати это произвольная четвёрка, а не ближайшая.

   Слово обрезается до восьми знаков, а не до шести: на шести
   «электроприводной» и «электрокарнизы» становятся одним словом. Совпадение
   весит тем больше, чем реже слово встречается во всём наборе, — иначе
   побеждают «система» и «объект», которые есть везде и не значат ничего. */
const stop = new Set(['который', 'которая', 'которые', 'этого', 'этому', 'такое',
  'может', 'можно', 'нужно', 'после', 'через', 'между', 'вместе', 'только', 'если']);

export const words = (t: string) => new Set(
  t.toLowerCase().match(/[а-яёa-z]{5,}/g)?.map((w) => w.slice(0, 8)).filter((w) => !stop.has(w)) || [],
);

const corpus = answers.map((a) => words(`${a.question} ${a.answer}`));
const df = new Map<string, number>();
for (const set of corpus) for (const w of set) df.set(w, (df.get(w) || 0) + 1);

/** Ближайшие по тексту ответы; `exclude` — адрес самой страницы. */
export function nearestAnswers(text: string, count: number, exclude?: string): Answer[] {
  const mine = words(text);
  return answers
    .map((a, i) => {
      if (a.slug === exclude) return { a, score: -1 };
      let score = 0;
      for (const w of corpus[i]) {
        if (mine.has(w)) score += Math.log(answers.length / (df.get(w) || 1));
      }
      return { a, score: score / Math.sqrt(corpus[i].size || 1) };
    })
    .filter((x) => x.score > 0)
    .sort((x, y) => y.score - x.score)
    .slice(0, count)
    .map((x) => x.a);
}
