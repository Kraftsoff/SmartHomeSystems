'use client';
import { useState } from 'react';
import type { Scenario } from '@/lib/content';

/* Двадцать восемь сценариев вместо таблицы на двадцать девять строк. Разница
   не в оформлении: таблицу читают по диагонали и закрывают, а здесь человек
   спрашивает «покажи, где участвуют шторы» и получает свои семь.

   Данные приходят из той же таблицы при выгрузке — вписать их сюда значило бы
   развести два источника, и первая же правка текста их рассинхронизировала бы.
   Приходят сверху пропсом, а не импортом: импорт содержимого в клиентский
   компонент утаскивает в сборку весь файл контента, и скрипты разом выросли
   на 57 КБ со сжатием, перевалив бюджет.
   Все двадцать восемь лежат в разметке всегда: отбор прячет показ, а не
   содержимое, потому что содержимое читает машина. */
const СЕМЬИ = ['Свет', 'Климат', 'Шторы', 'Безопасность', 'Мультимедиа', 'Доступ', 'Электрика', 'Приложение'];

export default function ScenarioBoard({ scenarios }: { scenarios: Scenario[] }) {
  const [фильтр, setФильтр] = useState<string | null>(null);
  const виден = (семьи: string[]) => !фильтр || семьи.includes(фильтр);
  const сколько = фильтр ? scenarios.filter((s) => s.семьи.includes(фильтр)).length : scenarios.length;

  return (
    <div className="scen">
      <div className="scen-filter" role="group" aria-label="Отбор сценариев по системе">
        <button type="button" className={`chip${фильтр === null ? ' on' : ''}`}
          aria-pressed={фильтр === null} onClick={() => setФильтр(null)}>
          Все {scenarios.length}
        </button>
        {СЕМЬИ.map((f) => {
          const n = scenarios.filter((s) => s.семьи.includes(f)).length;
          return (
            <button key={f} type="button" className={`chip${фильтр === f ? ' on' : ''}`}
              aria-pressed={фильтр === f} onClick={() => setФильтр(фильтр === f ? null : f)}>
              {f} <span className="scen-n">{n}</span>
            </button>
          );
        })}
      </div>

      <p className="scen-count" aria-live="polite">
        {фильтр ? `${сколько} из ${scenarios.length}: где участвует «${фильтр.toLowerCase()}»` : `Все ${scenarios.length} сценариев`}
      </p>

      <div className="grid g2 scen-grid">
        {scenarios.map((s) => (
          <article className="card scen-card" key={s.номер} hidden={!виден(s.семьи)}>
            <span className="kicker">Сценарий {s.номер}</span>
            <h3>{s.имя}</h3>
            <p dangerouslySetInnerHTML={{ __html: s.чтоHtml }} />
            <p className="scen-need">
              {s.семьи.map((f) => <span className="scen-tag" key={f}>{f}</span>)}
            </p>
            <p className="scen-raw">Нужно на объекте: {s.нужно}</p>
          </article>
        ))}
      </div>
    </div>
  );
}
