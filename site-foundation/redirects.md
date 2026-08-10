# Карта 301-редиректов: старый сайт → новая структура

Источник «слева» — реальные маршруты, восстановленные обходом ссылок текущего сайта
(`../site-snapshot/SITEMAP.md`). Источник «справа» — целевая архитектура из
`../tz-site/02 — Информационная архитектура.md`.

**Зачем:** без редиректов при переезде теряется накопленный вес страниц и все внешние ссылки
упираются в 404. Ставить **301** (постоянный), не 302 — иначе вес не передаётся.

**Порядок применения:** более специфичные правила выше более общих (`/detector/moving` до
`/detector`), иначе общее правило перехватит частные.

⚠️ **Домены не подтверждены.** Легаси-доменов несколько (mmsmart.ru, mimismart.ru, mimismart.com,
mmsmart-russia.ru, mimismart-home.ru), какой из них основной и какие реально в индексе — открытый
вопрос (`../tz-site/99`). Правила ниже — путевые (path-level); на уровне доменов дополнительно
нужен сквозной 301 со всех легаси-доменов на основной, **после** проверки реального индекса.

---

## 1. Опечатки в slug — критично, ловим трафик
| Старый | Новый | Причина |
|---|---|---|
| `/lightning` | `/functions/lighting` | было «молния» вместо «освещение» |
| `/himidity` | `/functions/climate/humidity` | опечатка в humidity |
| `/detector/infared-sensor` | `/equipment/sensors/infrared` | опечатка в infrared |
| `/solutions-appartments` | `/solutions/flat` | опечатка в apartments + слияние с `/solutions-flat` |

## 2. Сегменты (готовые решения)
| Старый | Новый |
|---|---|
| `/solutions-flat` | `/solutions/flat` |
| `/solutions-home` | `/solutions/house` |
| `/solutions-office` | `/solutions/office` |
| `/solutions` | `/solutions` *(без изменений)* |

## 3. Функции — освещение и шторы
| Старый | Новый |
|---|---|
| `/dimming` | `/functions/lighting/dimming` |
| `/biodynamics` | `/functions/lighting/biodynamics` |
| `/curtains` | `/functions/curtains` |
| `/electric-curtains` | `/functions/curtains` *(две страницы про одно — склеиваем)* |

## 4. Функции — климат
| Старый | Новый |
|---|---|
| `/climate` | `/functions/climate` |
| `/air-conditioning` | `/functions/climate/cooling` |
| `/heating` | `/functions/climate/heating` |
| `/underfloor-heating` | `/functions/climate/floor` |
| `/ventilation` | `/functions/climate/ventilation` |

## 5. Функции — мультимедиа
| Старый | Новый |
|---|---|
| `/cinema-home` | `/functions/multimedia/cinema` |
| `/cinema` | `/functions/multimedia/cinema` *(дубль — склеиваем)* |
| `/projector` | `/functions/multimedia/cinema` |
| `/multiroom` | `/functions/multimedia/multiroom` |
| `/tv` | `/functions/multimedia/tv` |
| `/audio` | `/functions/multimedia/audio` |
| `/video-control` | ⚠️ **уточнить** — «управление видео» (мультимедиа) или «видеонаблюдение» (безопасность)? Не редиректить вслепую: смысл страницы определяет цель. |

## 6. Функции — безопасность
| Старый | Новый |
|---|---|
| `/security` | `/functions/security` |
| `/alarm-system` | `/functions/security/alarm` |
| `/fire` | `/functions/security/fire` |
| `/intercom-system` | `/functions/security/intercom` |
| `/control-access` | `/functions/security/access` |
| `/electric-lock` | `/functions/security/access` |
| `/gates` | `/functions/security/access` |
| `/protection-against-leaks` | `/functions/security/leaks` |

## 7. Функции — электрика
| Старый | Новый |
|---|---|
| `/sockets` | `/functions/electric/sockets` |
| `/power-supply` | `/functions/electric/power-supply` |

## 8. Оборудование
| Старый | Новый |
|---|---|
| `/controller` | `/equipment/controllers` |
| `/controller/1` | `/equipment/cuarm5m` ⚠️ слаг товара подтвердить |
| `/app` | `/equipment/app` |
| `/detector` | `/equipment/sensors` |
| `/detector/moving` | `/equipment/sensors/motion` |
| `/detector/opening` | `/equipment/sensors/opening` |
| `/detector/smoke` | `/equipment/sensors/smoke` |
| `/detector/leak` | `/equipment/sensors/leak` |
| `/detector/temperature` | `/equipment/sensors/temperature` |
| `/detector/wet` | `/equipment/sensors/humidity` |
| `/catalog` | `/equipment` *(на старом сайте выводил 1 товар и чужое описание)* |
| `/products` | `/equipment` |

## 9. Инфо-страницы
| Старый | Новый |
|---|---|
| `/news` | `/blog` |
| `/article/1` | ⚠️ **вручную** — ID→slug не выводится автоматически; составить таблицу по факту переноса статей |
| `/about` · `/contacts` · `/partners` · `/showroom` · `/privacy` · `/portfolio` | без изменений |

## 10. Служебное / e-commerce — решение отложено
`/favorites` · `/search` · `/vendors` · `/vendorsTop` · `/settings` · `/ai`

**Решено 2026-07-29: в V1 не переносим, отдаём 410 Gone** (см. `../tz-site/02`, раздел
«Решения по схеме URL»). Позиционирование — инженерный подрядчик с проектами от 2–3 млн ₽:
они не продаются через корзину, а на старом сайте слой и так был нерабочим. 301 в никуда только
копит мусорные перенаправления, поэтому именно 410, а не 301.
⚠️ `/ai` — назначение не выяснено; открыть и посмотреть до выкатки.

---

## Next.js-конфиг (заготовка)

```js
// next.config.js — permanent: true == 301
module.exports = {
  async redirects() {
    return [
      // опечатки
      { source: '/lightning', destination: '/functions/lighting', permanent: true },
      { source: '/himidity', destination: '/functions/climate/humidity', permanent: true },
      { source: '/detector/infared-sensor', destination: '/equipment/sensors/infrared', permanent: true },
      { source: '/solutions-appartments', destination: '/solutions/flat', permanent: true },
      // сегменты
      { source: '/solutions-flat', destination: '/solutions/flat', permanent: true },
      { source: '/solutions-home', destination: '/solutions/house', permanent: true },
      { source: '/solutions-office', destination: '/solutions/office', permanent: true },
      // освещение и шторы
      { source: '/dimming', destination: '/functions/lighting/dimming', permanent: true },
      { source: '/biodynamics', destination: '/functions/lighting/biodynamics', permanent: true },
      { source: '/curtains', destination: '/functions/curtains', permanent: true },
      { source: '/electric-curtains', destination: '/functions/curtains', permanent: true },
      // климат
      { source: '/climate', destination: '/functions/climate', permanent: true },
      { source: '/air-conditioning', destination: '/functions/climate/cooling', permanent: true },
      { source: '/heating', destination: '/functions/climate/heating', permanent: true },
      { source: '/underfloor-heating', destination: '/functions/climate/floor', permanent: true },
      { source: '/ventilation', destination: '/functions/climate/ventilation', permanent: true },
      // мультимедиа
      { source: '/cinema-home', destination: '/functions/multimedia/cinema', permanent: true },
      { source: '/cinema', destination: '/functions/multimedia/cinema', permanent: true },
      { source: '/projector', destination: '/functions/multimedia/cinema', permanent: true },
      { source: '/multiroom', destination: '/functions/multimedia/multiroom', permanent: true },
      { source: '/tv', destination: '/functions/multimedia/tv', permanent: true },
      { source: '/audio', destination: '/functions/multimedia/audio', permanent: true },
      // безопасность
      { source: '/security', destination: '/functions/security', permanent: true },
      { source: '/alarm-system', destination: '/functions/security/alarm', permanent: true },
      { source: '/fire', destination: '/functions/security/fire', permanent: true },
      { source: '/intercom-system', destination: '/functions/security/intercom', permanent: true },
      { source: '/control-access', destination: '/functions/security/access', permanent: true },
      { source: '/electric-lock', destination: '/functions/security/access', permanent: true },
      { source: '/gates', destination: '/functions/security/access', permanent: true },
      { source: '/protection-against-leaks', destination: '/functions/security/leaks', permanent: true },
      // электрика
      { source: '/sockets', destination: '/functions/electric/sockets', permanent: true },
      { source: '/power-supply', destination: '/functions/electric/power-supply', permanent: true },
      // оборудование (частные правила ВЫШЕ общих)
      { source: '/detector/moving', destination: '/equipment/sensors/motion', permanent: true },
      { source: '/detector/opening', destination: '/equipment/sensors/opening', permanent: true },
      { source: '/detector/smoke', destination: '/equipment/sensors/smoke', permanent: true },
      { source: '/detector/leak', destination: '/equipment/sensors/leak', permanent: true },
      { source: '/detector/temperature', destination: '/equipment/sensors/temperature', permanent: true },
      { source: '/detector/wet', destination: '/equipment/sensors/humidity', permanent: true },
      { source: '/detector', destination: '/equipment/sensors', permanent: true },
      { source: '/controller/1', destination: '/equipment/cuarm5m', permanent: true },
      { source: '/controller', destination: '/equipment/controllers', permanent: true },
      { source: '/app', destination: '/equipment/app', permanent: true },
      { source: '/catalog', destination: '/equipment', permanent: true },
      { source: '/products', destination: '/equipment', permanent: true },
      // инфо
      { source: '/news', destination: '/blog', permanent: true },
    ]
  },
}
```

## Известные расхождения (проверено сверкой с `sitemap.xml`)
Прогнал все цели редиректов против `sitemap.xml` — одно расхождение, оставлено осознанно:
- `/controller/1 → /equipment/cuarm5m` — целевой страницы нет в карте сайта, потому что слаги
  карточек товаров не подтверждены. Подтвердить слаг и добавить страницу в `sitemap.xml`
  одновременно с выкладкой редиректа, иначе он будет вести на страницу вне карты.

Остальные 44 правила указывают на страницы, присутствующие в `sitemap.xml`.

## Проверка после выката
1. Прогнать список слева через curl/скрипт: каждый URL должен отдавать **301** и `Location`
   на существующую страницу с кодом **200** (не цепочку редиректов и не 404).
2. Цепочки (`301 → 301 → 200`) схлопнуть в один переход — каждый лишний прыжок теряет вес.
3. Загрузить обновлённый `sitemap.xml` в Search Console и Яндекс.Вебмастер, проверить отчёт
   по ошибкам сканирования через 1–2 недели.
