import './globals.css';
import type { Metadata } from 'next';
import { BRAND, SITE } from '@/lib/content';
import ThemeToggle from './components/ThemeToggle';
import MainNav from './components/MainNav';
import { LINKS, PHONE, PHONE_HREF, PHONE_E164 } from '@/lib/nav';
import CookieBar from './components/CookieBar';
import StickyCta from './components/StickyCta';

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: { default: `${BRAND} — инженерия умного дома`, template: '%s' },
  /* Картинка для пересылки одна на весь сайт: сто тридцать семь картинок
     весили бы больше, чем весь остальной сайт, а ссылка без картинки в
     переписке выглядит недоделанной — а её пересылают дизайнеру и архитектору.
     Рисуется tools/make-og.mjs теми же токенами, что и сайт. */
  openGraph: {
    type: 'website', locale: 'ru_RU', siteName: BRAND,
    images: [{ url: '/og.png', width: 1200, height: 630,
      alt: `${BRAND} — умный дом без облака, инженерный подрядчик с 2004 года` }],
  },
  twitter: { card: 'summary_large_image', images: ['/og.png'] },
};

/* Разметка организации отдаётся на каждой странице: она описывает компанию,
   а не документ. Телефон и почта пришли из материалов клиента и потому здесь
   есть; всё, что остаётся заглушкой, в структурированные данные не идёт —
   там непроверенное цитируется как факт. */
const org = {
  '@context': 'https://schema.org', '@type': 'Organization', name: BRAND,
  description: 'Российский производитель и инженерный подрядчик: собственное производство контроллеров умного дома в Москве, проектирование и монтаж инженерных систем премиальных объектов.',
  foundingDate: '2004', areaServed: 'RU', url: SITE,
  /* Логотип и профили компании — то, по чему машина связывает сайт с
     сущностью в своей базе. Ставить сюда заглушку нельзя: разметка цитируется
     как факт. Пункт уходит в список к заполнению отсюда, из исходника, и на
     страницу не печатается — спрятанная пометка звучала бы в программах
     чтения с экрана на всех 138 адресах.
     ⚠️ ЖДЁТ КЛИЕНТА: файл логотипа и адреса профилей компании (Яндекс Карты, соцсети) для разметки организации */
  /* Номер берётся из общего модуля: он же в подвале и в меню на телефоне.
     Пока их было двое, разойтись они могли молча. */
  telephone: PHONE_E164,
  email: 'msk@mmsmart.ru',
  address: {
    '@type': 'PostalAddress', addressCountry: 'RU', addressLocality: 'Москва',
    streetAddress: 'Новоданиловская набережная, 6к1',
  },
  knowsAbout: ['умный дом', 'автоматизация зданий', 'проектирование слаботочных систем',
    'освещение и сценарии', 'климат и вентиляция', 'защита от протечек',
    'резервное электропитание', 'мультирум', 'контроль доступа и домофония', 'KNX', 'Modbus', 'DALI'],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className="nojs">
      <body>
        {/* Класс снимается до первой отрисовки, поэтому переключения на глазах
            не происходит и макет не дёргается. Без скриптов класс остаётся, и
            элементы управления, которым нечему отвечать, не показываются:
            мёртвая кнопка хуже отсутствующей, а на телефоне кнопка меню была
            единственным входом в навигацию. */}
        <script dangerouslySetInnerHTML={{ __html: "document.documentElement.classList.remove('nojs')" }} />
        <script type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(org) }} />
        <a className="skip" href="#main">К содержанию</a>
        <header className="site">
          <div className="shell">
            <a className="brand" href="/">● {BRAND}</a>
            <MainNav />
            <ThemeToggle />
          </div>
        </header>
        <main id="main">{children}</main>
        <StickyCta />
        <CookieBar />
        <footer className="site">
          <div className="shell">
            {/* Полная карта разделов: в шапке видны не все, а страница без
                ссылки на неё существует только для того, кто знает адрес. */}
            <nav className="foot-map" aria-label="Разделы сайта">
              {LINKS.map(([href, label]) => (
                <a key={href} href={href}>{label}</a>
              ))}
            </nav>
            <div className="foot-legal">
              {/* Раскрытие сведений об исполнителе по п. 1 и п. 1.2 ст. 9 ЗоЗПП.
                  В прототипе блок был, а в подвал сайта я перенёс из него три
                  строки из пяти: пропали режим работы, лицензия МЧС и оговорка
                  про оферту. Наименование, адрес и режим обязаны быть на сайте,
                  отсутствие — ч. 1 ст. 14.8 КоАП. */}
              <h2 className="foot-h">Сведения об исполнителе</h2>
              <ul className="legal-list">
                <li>Наименование: <span className="prov">⚠️ заполнить: полное наименование с ОПФ</span></li>
                <li>Адрес (место нахождения): <span className="prov">⚠️ заполнить: юридический адрес</span></li>
                <li>ОГРН / ИНН: <span className="prov">⚠️ заполнить: ОГРН и ИНН</span>{' '}
                  <span className="legal-note">для ИП обязателен ОГРНИП и наименование регистрирующего органа</span></li>
                <li>Режим работы: будни 09:00–18:00 · шоурум: Москва, Новоданиловская наб., 6к1</li>
                <li>Лицензия МЧС: <span className="prov">⚠️ уточнить, есть ли в составе работ пожарная сигнализация или СОУЭ</span>{' '}
                  <span className="legal-note">если есть, п. 2 ст. 9 ЗоЗПП требует опубликовать номер, срок и орган</span></li>
              </ul>
              <p className="legal-note">
                Информация на сайте носит справочный характер и не является публичной офертой
                (п. 1 ст. 437 ГК РФ): состав работ и стоимость определяются техническим заданием.
              </p>
              <p>
                {BRAND} — производство и монтаж инженерных систем.{' '}
                <a href="tel:+78005052053">8 800 505 20 53</a>{' '}
                · <a href="mailto:msk@mmsmart.ru">msk@mmsmart.ru</a>
              </p>
              <p><a href="/privacy/">Политика обработки персональных данных</a></p>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
