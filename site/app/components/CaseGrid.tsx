'use client';
import { useState } from 'react';
import type { Case } from '@/lib/content';

/* Отбор по тегу — надстройка. Все объекты лежат в разметке сразу: страница
   без скриптов показывает полный список, а не пустой контейнер. Именно на
   этом собранный сайт и погорел — кейсы вставлял скрипт, и раздел
   «Реализованные объекты» открывался с одним заголовком. */
export default function CaseGrid({ items }: { items: Case[] }) {
  const [tag, setTag] = useState<string | null>(null);
  const tags = [...new Set(items.flatMap((c) => c.tags))];
  const shown = tag ? items.filter((c) => c.tags.includes(tag)) : items;

  return (
    <>
      <h2>Реализованные объекты</h2>
      <div className="filter" role="group" aria-label="Отбор объектов по системе">
        <button type="button" className="chip" aria-pressed={tag === null}
          onClick={() => setTag(null)}>Все ({items.length})</button>
        {tags.map((t) => (
          <button key={t} type="button" className="chip" aria-pressed={tag === t}
            onClick={() => setTag(t)}>{t}</button>
        ))}
      </div>
      <div className="grid g3" data-cases>
        {shown.map((c) => (
          <article className="card case" key={c.title}>
            <h3>{c.title}</h3>
            {/* Оговорка едет вместе с карточкой: её пересылают и снимают
                на скриншот отдельно от страницы, и тогда подробная история
                читается как сданный объект. */}
            <p><span className="prov">⚠️ шаблон, а не сданный объект: ждём данные из вашей базы</span></p>
            {/* Паспорт объекта: тип, площадь, город, год. Так подают кейсы
                лидеры сегмента — по этим строкам объект сравнивают со своим,
                а не любуются им. Пустых строк не показываем. */}
            <dl className="passport">
              {c.type && (<><dt>Объект</dt><dd>{c.type}</dd></>)}
              {c.area > 0 && (<><dt>Площадь</dt><dd>{c.area} м²</dd></>)}
              {c.city && (<><dt>Где</dt><dd>{c.city}</dd></>)}
              {c.year && (<><dt>Сдан</dt><dd>{c.year}</dd></>)}
            </dl>
            <p className="case-stage">{c.stage}</p>
            {c.pain && <p className="case-pain">{c.pain}</p>}
            <dl className="case-dl">
              {c.task && (<><dt>Задача</dt><dd>{c.task}</dd></>)}
              <dt>Что сделали</dt><dd>{c.systems}</dd>
              <dt>Что изменилось</dt><dd>{c.result}</dd>
              {/* Измеримый результат и честная строка о том, что не вышло.
                  Прицельный поиск по рынку не нашёл ни того, ни другого ни у
                  одного игрока: показывают масштаб объекта, но не итог. */}
              {c.metric && (<><dt>В цифрах</dt><dd>{c.metric}</dd></>)}
              {c.hard && (<><dt>Что не получилось</dt><dd>{c.hard}</dd></>)}
            </dl>
            <p className="tags">{c.tags.map((t) => <span className="tag" key={t}>{t}</span>)}</p>
          </article>
        ))}
      </div>
    </>
  );
}
