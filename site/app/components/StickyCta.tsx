'use client';
import { useEffect, useState } from 'react';

/* Липкое действие на телефоне. Появляется, когда первый экран с кнопками
   уже уехал вверх: до этого оно повторяло бы то, что и так на виду.
   На широком экране не показывается — там кнопка в шапке страницы рядом. */
export default function StickyCta() {
  const [past, setPast] = useState(false);

  useEffect(() => {
    const onScroll = () => setPast(window.scrollY > 520);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div className="sticky-cta" data-shown={past ? 'yes' : 'no'}>
      <a className="btn btn-primary" href="/contacts/">Рассчитать проект</a>
    </div>
  );
}
