'use client';
import { useEffect, useState } from 'react';

/* Отбор по направлению. Работает поверх готовой разметки: скрипт прячет
   секции, а не рисует их, поэтому без JS страница остаётся полным списком
   всех семидесяти семи ответов — именно так её и читает краулер. */
export default function ClusterFilter({ clusters }: { clusters: Array<[string, number]> }) {
  const [pick, setPick] = useState<string | null>(null);

  useEffect(() => {
    for (const el of document.querySelectorAll<HTMLElement>('[data-cluster]')) {
      el.hidden = pick !== null && el.dataset.cluster !== pick;
    }
  }, [pick]);

  const total = clusters.reduce((n, [, c]) => n + c, 0);

  return (
    <div className="filter" role="group" aria-label="Отбор ответов по направлению">
      <button type="button" className="chip" aria-pressed={pick === null}
        onClick={() => setPick(null)}>Все ({total})</button>
      {clusters.map(([name, count]) => (
        <button key={name} type="button" className="chip" aria-pressed={pick === name}
          onClick={() => setPick(name)}>{name} ({count})</button>
      ))}
    </div>
  );
}
