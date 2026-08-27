'use client';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { PHONE_HREF } from '@/lib/nav';

/* Липкое действие на телефоне. Появляется, когда первый экран с кнопками
   уже уехал вверх: до этого оно повторяло бы то, что и так на виду.
   На широком экране не показывается — там кнопка в шапке страницы рядом. */
export default function StickyCta() {
  const [past, setPast] = useState(false);
  const here = usePathname();

  useEffect(() => {
    const onScroll = () => setPast(window.scrollY > 520);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  /* На странице заявки кнопка вела на страницу заявки: нажатие перезагружало
     то же место, и это на единственной странице, где человек ближе всего к
     обращению, да ещё поверх самой формы. Там действие другое — звонок:
     форма уже на экране, а позвонить с телефона быстрее, чем её заполнить. */
  const onLeadPage = here === '/contacts/';

  return (
    <div className="sticky-cta" data-shown={past ? 'yes' : 'no'}>
      {onLeadPage ? (
        <a className="btn btn-primary" href={PHONE_HREF}>Позвонить</a>
      ) : (
        <a className="btn btn-primary" href="/contacts/">Рассчитать проект</a>
      )}
    </div>
  );
}
