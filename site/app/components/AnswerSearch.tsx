'use client';
import { useMemo, useState } from 'react';

type Item = { slug: string; question: string; answer: string; expanded: string; cluster: string; kicker: string };

/* Русский лёгкий стеммер: срезаем окончание, пока основа не короче четырёх
   знаков. Без него запрос «протечка» не находил текст со словом «протечки». */
const ENDINGS = ['ами','ями','ого','его','ому','ему','ыми','ими','ая','яя','ое','ее','ые','ие',
  'ов','ев','ей','ой','ий','ый','ам','ям','ах','ях','ом','ем','ую','юю','а','я','о','е','ы','и','у','ю','й','ь'];
function stem(w: string) {
  for (const e of ENDINGS) if (w.length - e.length >= 4 && w.endsWith(e)) return w.slice(0, -e.length);
  return w;
}
const norm = (s: string) => s.toLowerCase().replace(/ё/g, 'е');

/* Совпадение только с начала слова. Простой поиск подстроки давал попадания
   внутри слов: «елка» открывала ответ про дешёвые решения, потому что сидит
   внутри «переделка». Набор по мере ввода при этом нужен — «протеч» должно
   находить «протечки», — поэтому режем не подстроку, а совпадения не на границе. */
function startsWord(hay: string, needle: string) {
  if (!needle) return false;
  let i = hay.indexOf(needle);
  while (i > -1) {
    if (i === 0 || !/[a-zа-я0-9]/.test(hay.charAt(i - 1))) return true;
    i = hay.indexOf(needle, i + 1);
  }
  return false;
}

export default function AnswerSearch({ items }: { items: Item[] }) {
  const [q, setQ] = useState('');
  const index = useMemo(() => items.map((it) => ({
    it,
    /* Развёрнутая часть тоже в индексе: там половина текста сайта, и без неё
       «рекуператор» или «АВР» не находятся вовсе — искать можно только то,
       что проиндексировано, а не то, что написано. */
    hay: norm(`${it.question} ${it.answer} ${it.expanded} ${it.cluster} ${it.kicker}`),
    stems: norm(`${it.question} ${it.answer} ${it.expanded}`).split(/[^a-zа-я0-9]+/).filter(Boolean).map(stem),
  })), [items]);

  const query = norm(q.trim());
  const qs = query ? query.split(/\s+/).map(stem) : [];
  const hits = query
    ? index.filter(({ hay, stems }) => startsWord(hay, query)
      || qs.every((s) => stems.some((t) => t.indexOf(s) === 0)))
    : index;

  return (
    <div style={{ margin: '18px 0 26px' }}>
      <label htmlFor="q" style={{ position: 'absolute', left: -9999 }}>Поиск по вопросам</label>
      <input id="q" type="search" value={q} onChange={(e) => setQ(e.target.value)}
        placeholder="Поиск по вопросам — например «протечка» или «KNX»"
        style={{ width: '100%', padding: '12px 14px', borderRadius: 12, border: '1px solid var(--line)' }} />
      <p aria-live="polite" style={{ color: 'var(--muted)', fontSize: 13.5, marginTop: 8 }}>
        {query ? `${hits.length} из ${items.length} по запросу «${q.trim()}»` : ''}
      </p>
      {query && hits.length === 0 && (
        <div className="card"><p>Ничего не нашлось. Попробуйте другое слово — или{' '}
          <button type="button" onClick={() => setQ('')}
            style={{ background: 'none', border: 0, padding: 0, color: 'var(--accent-ink)', cursor: 'pointer' }}>
            покажите все {items.length} ответов
          </button>.</p></div>
      )}
      {query && hits.length > 0 && (
        <div className="grid g3" data-search-results style={{ marginTop: 14 }}>
          {hits.map(({ it }) => (
            <article className="card" key={it.slug}><span className="kicker">{it.kicker}</span>
              <h3><a className="stretch" href={`/answers/${it.slug}/`}>{it.question}</a></h3>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
