import assets from '@/lib/assets.json';

/* Кадры отдаются с сервера, а не рисуются в браузере. Это не деталь: до этого
   вся графика сайта жила в клиентских компонентах, и в готовом HTML её не было
   ни на одной странице из 139 — ни для читателя до гидратации, ни для машины,
   которая скрипты не исполняет.
                                                                              
   Разметка собирается строкой, а не элементами React, по одной причине: на
   хабах кадр вставляется внутрь готового HTML страницы. Половинки строки,
   разложенные по двум контейнерам, браузер достраивает по-своему, разметка
   расходится с серверной, и React роняет гидратацию (ошибка 418). Одна строка
   на оба случая — и расходиться нечему. */

export type Кадр = {
  id: string; alt: string; caption: string; pages: string[];
  src: string; srcset: string; w: number; h: number; bg: string;
};

const ВСЕ = assets as Кадр[];

export function кадрыДля(путь: string): Кадр[] {
  return ВСЕ.filter((a) => a.pages.includes(путь));
}

/* Выбор кадра по имени — для мест, где набор задаётся вручную, а не адресом
   страницы. Возвращает undefined, если кадра в реестре нет: вызывающая
   сторона отфильтрует, и в разметке не окажется ссылки в пустоту. */
export function кадрПоИмени(id: string): Кадр | undefined {
  return ВСЕ.find((a) => a.id === id);
}

const экран = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function разметкаКадров(items: Кадр[], первый = false): string {
  if (!items.length) return '';
  const кадры = items.map((a, i) => {
    const ведущий = первый && i === 0;
    /* Ширина и высота обязательны: без них картинка двигает макет при
       загрузке, а нулевой сдвиг — измеренное свойство сайта. */
    const img = [
      `<img src="${a.src}" srcset="${экран(a.srcset)}"`,
      `width="${a.w}" height="${a.h}" alt="${экран(a.alt)}"`,
      `sizes="(min-width: 900px) 640px, 100vw"`,
      ведущий ? `loading="eager" fetchpriority="high"` : `loading="lazy"`,
      `decoding="async">`,
    ].join(' ');
    return `<figure class="shotcard" style="background:${a.bg}">${img}`
      + `<figcaption>${экран(a.caption)}</figcaption></figure>`;
  }).join('');
  return `<div class="shotcards shotcards-${Math.min(items.length, 4)}">${кадры}</div>`;
}

export default function Кадры({ items, первый = false }: { items: Кадр[]; первый?: boolean }) {
  if (!items.length) return null;
  return <div dangerouslySetInnerHTML={{ __html: разметкаКадров(items, первый) }} />;
}
