# Карта 301-редиректов

**В документе две разные карты, и их нельзя смешивать.**

| | Часть A | Часть B |
|---|---|---|
| Слева | маршруты **превью нового сайта** (`mimi-ibrh.vercel.app`) | маршруты **легаси-доменов** (`mmsmart.ru` и зеркала) |
| Источник | `../site-snapshot/SITEMAP.md` — обход ссылок превью | замер выдачи `../audit/08-serp-baseline.md` |
| Что на кону | ничего: превью не индексируется, это внутренняя перекладка URL | **накопленный вес и внешние ссылки** |
| Полнота | полная, ~60 маршрутов превью | **фрагмент: ~30 URL из индекса, реальный сайт больше** |

⚠️ **Исправление к прежней версии этого файла.** Раньше часть A была озаглавлена «старый сайт →
новая структура». Это неверно: снапшот снят с превью нового сайта, а не с легаси-домена.
Схемы путей не пересекаются вообще — превью использует `/about`, `/partners`, `/solutions`,
а проиндексированный `mmsmart.ru` живёт на транслитерации: `/o-kompanii/`, `/partneram/`,
`/avtomatizacziya/`. То есть **вес старого сайта часть A не переносила ни на одну страницу.**
Задачу переноса решает часть B, и она появилась только после замера выдачи.

**Порядок применения:** более специфичные правила выше более общих (`/detector/moving` до
`/detector`), иначе общее правило перехватит частные. Ставить **301**, не 302 — иначе вес
не передаётся. Редирект на главную вместо конкретной страницы не ставить ни в одном случае:
Google трактует это как soft-404 и вес не передаёт.

---

# Часть A. Превью → финальная архитектура

Вес не на кону: превью в индексе нет. Это перекладка внутренних URL, чтобы ссылки, которые
уже разошлись по переписке и документам, не упирались в 404.

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
      // ══ ЧАСТЬ B: легаси-домены. Порядок важен — частные выше общих ══
      // /articles/ ведём адресно: склейка в раздел обнуляет ранжирующиеся страницы
      { source: '/articles/detsentralizovannyy-umnyy-dom', destination: '/answers/chto-takoe-decentralizovannaya-arhitektura-umnogo-doma-i', permanent: true },
      { source: '/articles/server-umnogo-doma', destination: '/equipment/controllers', permanent: true },
      { source: '/articles/reyting-sistem-umnyy-dom', destination: '/compare', permanent: true },
      { source: '/articles/vozmozhnosti-umnogo-doma', destination: '/functions', permanent: true },
      { source: '/articles/umnyy-dom-kak-eto-rabotaet', destination: '/functions/automation', permanent: true },
      { source: '/articles/skhemy-umnogo-doma', destination: '/functions/automation', permanent: true },
      { source: '/articles/avtomatizatsiya-umnogo-doma', destination: '/functions/automation', permanent: true },
      { source: '/articles/umnyij-dom-dlya-ofisa', destination: '/solutions/office', permanent: true },
      // сегменты и цены
      { source: '/smart-home/gotovye-resheniya/premialnyy-segment', destination: '/solutions/premium', permanent: true },
      { source: '/smart-home/razrabotka-sistem/provodnye-sistemy', destination: '/answers/provodnoy-umnyy-dom-ili-besprovodnoy-chto-vybrat', permanent: true },
      { source: '/smart-home/razrabotka-sistem/modulnye-resheniya', destination: '/equipment/controllers', permanent: true },
      { source: '/smart-home/razrabotka-sistem/udalyennoe-upravlenie', destination: '/equipment/app', permanent: true },
      { source: '/smart-home/bezopasnost/domofon', destination: '/functions/security/intercom', permanent: true },
      { source: '/smart-home/multimedia', destination: '/functions/multimedia', permanent: true },
      { source: '/smart-home', destination: '/solutions', permanent: true },
      { source: '/avtomatizacziya/kompleksnyie-resheniya/kvartira', destination: '/solutions/flat', permanent: true },
      { source: '/avtomatizacziya/kompleksnyie-resheniya/kottedzh', destination: '/solutions/house', permanent: true },
      { source: '/avtomatizacziya/kompleksnyie-resheniya/dacha', destination: '/solutions/house', permanent: true },  // ⚠️ /solutions/country-house в архитектуре нет
      { source: '/avtomatizacziya', destination: '/functions/automation', permanent: true },
      { source: '/oborudovanie/kontrollery', destination: '/equipment/controllers', permanent: true },
      { source: '/oborudovanie', destination: '/equipment', permanent: true },
      { source: '/czenyi/servis', destination: '/pricing', permanent: true },  // ⚠️ временно: /service в архитектуре нет
      { source: '/czenyi', destination: '/pricing', permanent: true },
      { source: '/o-kompanii', destination: '/about', permanent: true },
      { source: '/partneram/dileram', destination: '/partners', permanent: true },
      { source: '/partneram/designer', destination: '/partners', permanent: true },  // ⚠️ страницы для дизайнеров нет
      { source: '/partneram', destination: '/partners', permanent: true },
      // инфо
      { source: '/news', destination: '/blog', permanent: true },
    ]
  },
}
```

# Часть B. Легаси-домены → новый сайт

**Здесь на кону накопленный вес.** Источник — замер выдачи 21.08.2026 (`../audit/08-serp-baseline.md`):
это URL, присутствие которых в индексе подтверждено. Обходом меню они не находятся: часть
доступна только из поиска.

`mmsmart.ru` работает как основной домен, `mimismart.ru` держит зеркальные пути с той же
структурой — значит одна и та же карта применяется к обоим доменам.

## B1. Раздел `/articles/` — самый уязвимый
Единственный источник органики по технологическому кластеру. `/articles/detsentralizovannyy-umnyy-dom/`
стоит в органической выдаче третьим. **Каждый URL ведём адресно, склейка в раздел недопустима** —
она обнуляет именно ту страницу, которая работает.

| Старый | Новый |
|---|---|
| `/articles/detsentralizovannyy-umnyy-dom/` | `/answers/chto-takoe-decentralizovannaya-arhitektura-umnogo-doma-i` |
| `/articles/server-umnogo-doma/` | `/equipment/controllers` |
| `/articles/reyting-sistem-umnyy-dom/` | `/compare` |
| `/articles/vozmozhnosti-umnogo-doma/` | `/functions` |
| `/articles/umnyy-dom-kak-eto-rabotaet/` | `/functions/automation` |
| `/articles/skhemy-umnogo-doma/` | `/functions/automation` |
| `/articles/avtomatizatsiya-umnogo-doma/` | `/functions/automation` |
| `/articles/umnyij-dom-dlya-ofisa/` | `/solutions/office` |

## B2. Разделы, которые ранжируются по целевым запросам
| Старый | Запрос из замера | Новый |
|---|---|---|
| `/smart-home/gotovye-resheniya/premialnyy-segment/` | умный дом премиум класса что входит | `/solutions/premium` |
| `/avtomatizacziya/kompleksnyie-resheniya/dacha/` | умный дом на даче зимой присмотр | `/solutions/house` ⚠️ |
| `/avtomatizacziya/kompleksnyie-resheniya/kvartira/` | умный дом в квартире | `/solutions/flat` |
| `/avtomatizacziya/kompleksnyie-resheniya/kottedzh/` | умный дом в коттедже | `/solutions/house` |
| `/czenyi/` | гарантия на умный дом сколько лет | `/pricing` |
| `/czenyi/servis/` | сервисное обслуживание умного дома | `/pricing` ⚠️ |

## B3. Остальные подтверждённые в индексе
| Старый | Новый |
|---|---|
| `/smart-home/razrabotka-sistem/provodnye-sistemy/` | `/answers/provodnoy-umnyy-dom-ili-besprovodnoy-chto-vybrat` |
| `/smart-home/razrabotka-sistem/modulnye-resheniya/` | `/equipment/controllers` |
| `/smart-home/razrabotka-sistem/udalyennoe-upravlenie/` | `/equipment/app` |
| `/smart-home/bezopasnost/domofon/` | `/functions/security/intercom` |
| `/smart-home/multimedia/` | `/functions/multimedia` |
| `/smart-home/` | `/solutions` |
| `/oborudovanie/kontrollery/` | `/equipment/controllers` |
| `/oborudovanie/` | `/equipment` |
| `/avtomatizacziya/` | `/functions/automation` |
| `/o-kompanii/` | `/about` |
| `/partneram/dileram/` | `/partners` |
| `/partneram/designer/` | `/partners` ⚠️ |
| `/partneram/` | `/partners` |

## B4. Домены: что решить до выкатки

**Порядок операций критичен.** Сначала на каждом легаси-домене отрабатывают путевые правила
части B, и только потом домен склеивается с основным. Если поставить сквозной 301 с домена на
главную нового сайта первым, он съест путь — все страницы уедут на `/`, а Google засчитает это
как soft-404 и вес не передаст. В Next.js это разводится через `has: [{ type: 'host', value: … }]`
либо настраивается на обратном прокси до приложения.

- **Раздел «Партнёрам» разорван между доменами.** `/partneram/` и `/partneram/designer/` отдаются
  с `mmsmart.ru`, а `/partneram/dileram/` — с `mimismart.ru`. Один логический раздел живёт на двух
  сайтах. При склейке развести в одну ветку.
- **Дубли заголовков.** Главные `mmsmart.ru` и `mimismart.com` индексируются с идентичным title.
  Для поиска это два разных сайта с одинаковым заголовком.
- **www.** `mimismart.com` показан с `www`, остальные без. Канонизацию www/non-www проверить
  до настройки редиректов.
- **`mmsmart-russia.ru` и `mimismart-home.ru`** подтверждены в индексе как минимум по корню;
  внутренние URL поиском не вскрылись. Снимать из Вебмастера или логов.
- **`mimismart.com`** в замере не подтверждён ни разу. Отсутствие в выдаче не доказывает, что
  домена нет в индексе.
- **Приложение в App Store** (`apps.apple.com/ru/app/mimismart/id6444528782`) — проверить, откуда
  на него ведут ссылки со старых страниц.

## B5. Чего в этой карте нет — и почему это блокирующий пункт
Тридцать URL — это верхушка, которую показал поиск, а не карта сайта. Реальный `mmsmart.ru`
больше: у него есть меню, каталог оборудования и статьи, которые в замер не попали.

**Без выгрузки «Страницы в поиске» из Яндекс.Вебмастера по всем пяти доменам переезд делать
нельзя.** Это единственный способ увидеть полный список проиндексированных URL. Всё, что в него
не попало, уйдёт в 404 молча — без ошибки в логах и без сигнала в аналитике.

## B6. Целей, которых нет в архитектуре
- **`/service`** в `sitemap.xml` отсутствует, хотя `/czenyi/servis/` ранжируется, а запрос
  «сервисное обслуживание умного дома» свободен — весь топ занят прайсами интеграторов, которые
  отвечают одинаково успокаивающе. **Рекомендация: завести раздел** и переставить редирект на него.
- **`/solutions/country-house`** нет; дача уходит на `/solutions/house`. Загородный дом и дача —
  разные сценарии и разный чек (`../audit/07-buyer-voice.md`: спрос есть, чек не наш). Решение за клиентом.
- **Страницы для дизайнеров** нет, хотя `/partneram/designer/` проиндексирована. Для премиум-сегмента
  дизайнер — реальный канал рекомендаций. Либо заводим, либо осознанно теряем.

## Известные расхождения (проверено сверкой с `sitemap.xml`)
Прогнал все цели редиректов против `sitemap.xml` — одно расхождение, оставлено осознанно:
- `/controller/1 → /equipment/cuarm5m` — целевой страницы нет в карте сайта, потому что слаги
  карточек товаров не подтверждены. Подтвердить слаг и добавить страницу в `sitemap.xml`
  одновременно с выкладкой редиректа, иначе он будет вести на страницу вне карты.

Остальные 49 правил указывают на страницы, присутствующие в `sitemap.xml`.

## Проверка после выката
1. Прогнать список слева через curl/скрипт: каждый URL должен отдавать **301** и `Location`
   на существующую страницу с кодом **200** (не цепочку редиректов и не 404).
2. Цепочки (`301 → 301 → 200`) схлопнуть в один переход — каждый лишний прыжок теряет вес.
3. Загрузить обновлённый `sitemap.xml` в Search Console и Яндекс.Вебмастер, проверить отчёт
   по ошибкам сканирования через 1–2 недели.
