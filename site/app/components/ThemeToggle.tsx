'use client';
import { useEffect, useState } from 'react';

const KEY = 'mm-theme';

/* Порядок решения: сохранённый выбор → системная настройка → ночь.
   Чтение и запись в try/catch: в приватном окне и при запрете хранилища
   сам доступ бросает исключение, и без обёртки падает вся инициализация. */
function saved(): 'day' | 'night' | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'day' || v === 'night' ? v : null;
  } catch { return null; }
}

export default function ThemeToggle() {
  const [night, setNight] = useState(true);

  useEffect(() => {
    /* Системная настройка больше не решает: у половины посетителей в системе
       светлая тема, и они видели бы сайт в оформлении, под которое он не
       нарисован. Собственный выбор человека при этом сильнее всего. */
    const initial = saved() ?? 'night';
    apply(initial === 'night', false);
  }, []);

  function apply(isNight: boolean, remember: boolean) {
    setNight(isNight);
    document.documentElement.setAttribute('data-mode', isNight ? 'night' : 'day');
    if (remember) { try { localStorage.setItem(KEY, isNight ? 'night' : 'day'); } catch { /* хранилище запрещено */ } }
  }

  return (
    <button type="button" role="switch" aria-checked={night}
      aria-label="Переключить сценарий День/Ночь"
      onClick={() => apply(!night, true)}
      className="chip theme-toggle">
      {night ? '☾ Ночь' : '☀ День'}
    </button>
  );
}
