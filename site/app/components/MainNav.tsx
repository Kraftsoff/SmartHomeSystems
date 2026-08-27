'use client';
import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { LINKS } from '@/lib/nav';


export default function MainNav() {
  const [open, setOpen] = useState(false);
  /* Текущий раздел объявляется разметкой, а не только начертанием: правило
     для aria-current в стилях было, а ставить его было некому, и человек с
     экранным диктором не знал, где находится. Раздел считается по началу
     пути — страница ответа принадлежит «Ответам». */
  const here = usePathname() || '/';
  const current = (href: string) => (href === '/' ? here === '/' : here.startsWith(href));
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
          <a key={href} href={href} className={primary ? '' : 'sec'}
            aria-current={current(href) ? 'page' : undefined}>{label}</a>
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
            <li key={href}>
              <a href={href} aria-current={current(href) ? 'page' : undefined}
                onClick={() => setOpen(false)}>{label}</a>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
