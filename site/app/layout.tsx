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
  openGraph: { type: 'website', locale: 'ru_RU', siteName: BRAND },
};

/* Разметка организации отдаётся на каждой странице: она описывает компанию,
   а не документ. Телефон и почта не вписаны намеренно — на текущем сайте это
   заглушки, а непроверенное в структурированных данных цитируется как факт. */
const org = {
  '@context': 'https://schema.org', '@type': 'Organization', name: BRAND,
  description: 'Российский производитель и инженерный подрядчик: собственное производство контроллеров умного дома в Москве, проектирование и монтаж инженерных систем премиальных объектов.',
  foundingDate: '2004', areaServed: 'RU',
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
                {BRAND} — производство и монтаж инженерных систем.{' '}
                <span className="prov">⚠️ заполнить: полное наименование с ОПФ</span>{' '}
                <span className="prov">⚠️ заполнить: адрес и режим работы</span>{' '}
                <span className="prov">⚠️ заполнить: ОГРН и ИНН</span>
              </p>
              <p><a href="/privacy/">Политика обработки персональных данных</a></p>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
