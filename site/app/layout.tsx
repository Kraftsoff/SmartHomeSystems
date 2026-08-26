import './globals.css';
import type { Metadata } from 'next';
import { BRAND, SITE } from '@/lib/content';
import ThemeToggle from './components/ThemeToggle';
import CookieBar from './components/CookieBar';

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
            <nav className="main" aria-label="Основная навигация">
              <a href="/solutions/">Решения</a>
              <a href="/functions/">Направления</a>
              <a href="/pricing/">Цены</a>
              <a href="/compare/">Сравнения</a>
              <a href="/answers/">Ответы</a>
              <a href="/equipment/">Оборудование</a>
              <a href="/service/">Сервис</a>
              <a href="/portfolio/">Кейсы</a>
              <a href="/about/">О компании</a>
              <a href="/contacts/">Контакты</a>
            </nav>
            <ThemeToggle />
          </div>
        </header>
        <main id="main">{children}</main>
        <CookieBar />
        <footer className="site">
          <div className="shell">
            <p>
              {BRAND} — производство и монтаж инженерных систем.{' '}
              <span className="prov">⚠️ заполнить: полное наименование с ОПФ</span>{' '}
              <span className="prov">⚠️ заполнить: адрес и режим работы</span>{' '}
              <span className="prov">⚠️ заполнить: ОГРН и ИНН</span>
            </p>
            <p><a href="/privacy/">Политика обработки персональных данных</a></p>
          </div>
        </footer>
      </body>
    </html>
  );
}
