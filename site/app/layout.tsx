import './globals.css';
import type { Metadata } from 'next';
import { BRAND, SITE } from '@/lib/content';
import ThemeToggle from './components/ThemeToggle';
import MainNav from './components/MainNav';
import { LINKS } from '@/lib/nav';
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
  foundingDate: '2004', areaServed: 'RU',
  telephone: '+7 800 505 20 53',
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
    <html lang="ru">
      <body>
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
              <p>
                {BRAND} — производство и монтаж инженерных систем.
                Москва, Новоданиловская набережная, 6к1.{' '}
                <a href="tel:+78005052053">8 800 505 20 53</a>,{' '}
                <a href="mailto:msk@mmsmart.ru">msk@mmsmart.ru</a>{' '}
                <span className="prov">⚠️ заполнить: полное наименование с ОПФ</span>{' '}
                <span className="prov">⚠️ заполнить: ОГРН и ИНН</span>{' '}
                <span className="prov">⚠️ заполнить: режим работы</span>
              </p>
              <p><a href="/privacy/">Политика обработки персональных данных</a></p>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
