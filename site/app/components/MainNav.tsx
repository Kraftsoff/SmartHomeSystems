'use client';
import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { LINKS, PHONE, PHONE_HREF } from '@/lib/nav';


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
    const focusables = () => [...(panel.current?.querySelectorAll<HTMLElement>('a[href]') ?? [])];
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpen(false); btn.current?.focus(); return; }
      if (e.key !== 'Tab') return;
      /* Обход замкнут на панели. Без этого четырнадцать пунктов меню
         заканчивались провалом на страницу за ним: панель закрывает экран,
         а фокус уходил в содержимое, которого не видно. */
      const items = focusables();
      if (!items.length) return;
      const first = items[0], last = items[items.length - 1];
      const here = document.activeElement;
      if (e.shiftKey && (here === first || here === btn.current)) {
        e.preventDefault(); last.focus();
      } else if (!e.shiftKey && here === last) {
        e.preventDefault(); first.focus();
      } else if (here && !panel.current?.contains(here) && here !== btn.current) {
        e.preventDefault(); first.focus();
      }
    };
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!panel.current?.contains(t) && !btn.current?.contains(t)) setOpen(false);
    };
    /* Открыли — фокус в панель: иначе с клавиатуры меню открывается,
       а пройти по нему нельзя, не протабив через всю шапку. */
    focusables()[0]?.focus();
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
        {/* Телефон первым, а не в конце: список из тринадцати разделов
            выталкивал его за нижний край экрана, а на телефоне позвонить
            быстрее, чем заполнить форму. Ссылка настоящая — набор одним
            касанием. */}
        <p className="nav-call">
          <a href={PHONE_HREF} onClick={() => setOpen(false)}>{PHONE}</a>
          <span>бесплатно по России</span>
        </p>
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
