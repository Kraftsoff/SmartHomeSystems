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
function systemPrefersDay() {
  try { return window.matchMedia?.('(prefers-color-scheme: light)').matches ?? false; }
  catch { return false; }
}

export default function ThemeToggle() {
  const [night, setNight] = useState(true);

  useEffect(() => {
    const initial = saved() ?? (systemPrefersDay() ? 'day' : 'night');
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
      style={{ marginLeft: 'auto', padding: '6px 12px', borderRadius: 999, cursor: 'pointer' }}>
      {night ? '☾ Ночь' : '☀ День'}
    </button>
  );
}
