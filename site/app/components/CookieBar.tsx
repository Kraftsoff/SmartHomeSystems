'use client';
import { useEffect, useState } from 'react';

const KEY = 'mm-analytics-consent';

/* Аналитика не стартует до явного согласия (ст. 9 ФЗ-152). Переходы по сайту
   согласием не считаются — позиция Роскомнадзора прямо об этом говорит,
   поэтому баннер не исчезает «сам по себе» и не считает молчание ответом.
   Отказ сохраняется: решение, которое переспрашивают, решением не является. */
function loadAnalytics() {
  (window as unknown as { __analyticsLoaded?: boolean }).__analyticsLoaded = true;
  /* здесь подключаются счётчики; в сборке только отметка, чтобы было видно,
     что запуск привязан к согласию, а не к загрузке страницы */
}

export default function CookieBar() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    let v: string | null = null;
    try { v = localStorage.getItem(KEY); } catch { /* хранилище запрещено */ }
    if (v === 'yes') loadAnalytics();
    else if (v !== 'no') setShow(true);
  }, []);

  function decide(v: 'yes' | 'no') {
    try { localStorage.setItem(KEY, v); } catch { /* хранилище запрещено */ }
    setShow(false);
    if (v === 'yes') loadAnalytics();
  }

  if (!show) return null;
  return (
    <div role="region" aria-label="Согласие на аналитические cookie"
      style={{ position: 'fixed', left: 12, right: 12, bottom: 12, zIndex: 30,
        background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 14, padding: 16 }}>
      <p style={{ margin: '0 0 10px', fontSize: 14 }}>
        Технические cookie нужны, чтобы сайт помнил выбранную тему — они работают всегда.
        Аналитические запускаем только с вашего согласия.{' '}
        <a href="/privacy/">Политика обработки данных</a>
      </p>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button type="button" onClick={() => decide('yes')}
          style={{ padding: '9px 16px', borderRadius: 10, cursor: 'pointer' }}>Разрешить аналитику</button>
        <button type="button" onClick={() => decide('no')}
          style={{ padding: '9px 16px', borderRadius: 10, cursor: 'pointer' }}>Только необходимые</button>
      </div>
    </div>
  );
}
