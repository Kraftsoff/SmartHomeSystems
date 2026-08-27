'use client';
import { useEffect, useRef, useState } from 'react';
import { LINKS } from '@/lib/nav';


export default function MainNav() {
  const [open, setOpen] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    /* Меню закрывается клавишей и щелчком мимо: открытая панель на весь экран
       без выхода — ловушка, особенно на телефоне, где Escape нажать нечем. */
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpen(false); btn.current?.focus(); }
    };
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!panel.current?.contains(t) && !btn.current?.contains(t)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown);
    };
  }, [open]);

  return (
    <>
      <nav className="main" aria-label="Основная навигация">
        {LINKS.map(([href, label, primary]) => (
          <a key={href} href={href} className={primary ? '' : 'sec'}>{label}</a>
        ))}
      </nav>
      <button
        ref={btn}
        type="button"
        className="burger"
        aria-expanded={open}
        aria-controls="nav-all"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="burger-bars" aria-hidden="true"><i /><i /><i /></span>
        {open ? 'Закрыть' : 'Меню'}
      </button>
      <div ref={panel} id="nav-all" className="nav-panel" hidden={!open}>
        <ul>
          {LINKS.map(([href, label]) => (
            <li key={href}><a href={href} onClick={() => setOpen(false)}>{label}</a></li>
          ))}
        </ul>
      </div>
    </>
  );
}
