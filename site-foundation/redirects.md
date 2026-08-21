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
| `/controller/1` | `/equipment/controllers` ⚠️ переставить на карточку, когда слаг подтвердят |
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
| `/news` | `/answers` | ⚠️ раздела `/blog` нет; см. решение A7 в `../tz-site/16` |
| `/article/1` | ⚠️ **вручную** — ID→slug не выводится автоматически; составить таблицу по факту переноса статей |
| `/about` · `/contacts` · `/partners` · `/showroom` · `/privacy` · `/portfolio` | без изменений |

## 10. Служебное / e-commerce — решение отложено
`/favorites` · `/search` · `/vendors` · `/vendorsTop` · `/settings` · `/ai`

**Решено 2026-07-29: в V1 не переносим, отдаём 410 Gone** (см. `../tz-site/02`, раздел
«Решения по схеме URL»). Позиционирование — инженерный подрядчик с проектами от 2–3 млн ₽:
они не продаются через корзину, а на старом сайте слой и так был нерабочим. 301 в никуда только
копит мусорные перенаправления, поэтому именно 410, а не 301.
⚠️ `/ai` — назначение не выяснено; открыть и посмотреть до выкатки.

**Связка с `robots.txt`, которую легко разорвать.** Эти пути **не должны** стоять в `Disallow`.
Запрет обхода и удаление из индекса — противоположные операции: бот, которому путь закрыт,
никогда его не запросит, значит не увидит 410, и адрес останется в выдаче записью без
содержимого. Чтобы страница исчезла, её нужно разрешить обходить и отдать по ней 410.
Закрывать в `robots.txt` — только после того, как адреса выпадут из индекса. Проверка
входит в `tools/accept.mjs`.

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
      { source: '/controller/1', destination: '/equipment/controllers', permanent: true },  // ⚠️ переставить на карточку товара, когда слаг подтвердят
      { source: '/controller', destination: '/equipment/controllers', permanent: true },
      { source: '/app', destination: '/equipment/app', permanent: true },
      { source: '/catalog', destination: '/equipment', permanent: true },
      { source: '/products', destination: '/equipment', permanent: true },
      // ══ ЧАСТЬ B: легаси-домены. Порядок важен — частные выше общих ══
      // Источник: перебор индекса 21.08.2026, ~250 подтверждённых URL.
      // Слеш в конце снят везде, кроме .html: иначе правило со слешем дублирует правило без.
      // Зеркало mimismart.ru имеет свою транслитерацию — см. B4, общей склейкой не покрывается.
      // ── Зеркало mimismart.ru: своя транслитерация, применять на своём хосте ──
      { source: '/smart-home/razrabotka-sistem/modulnye-resheniya/index.html', destination: '/equipment/controllers', permanent: true },
      { source: '/smart-home/razrabotka-sistem/provodnye-sistemy/index.html', destination: '/answers/provodnoy-umnyy-dom-ili-besprovodnoy-chto-vybrat', permanent: true },
      { source: '/oborudovanie/prilozheniya/dlya-windows/index.html', destination: '/equipment/app', permanent: true },
      { source: '/smart-home/multimedia/multirum/index.html', destination: '/functions/multimedia/multiroom', permanent: true },
      { source: '/smart-home/bezopasnost/vorota/index.html', destination: '/functions/security/access', permanent: true },
      { source: '/oborudovanie/avtomatizatsiya-kvartir/oborudovanie-dlya-kvartir', destination: '/equipment', permanent: true },
      { source: '/oborudovanie/avtomatizatsiya-kvartir/upravlenie-temperaturoy', destination: '/functions/climate', permanent: true },
      { source: '/smart-home/bezopasnost/okhranno-pozharnaya-signalizatsiya', destination: '/functions/security/fire', permanent: true },
      { source: '/oborudovanie/avtomatizatsiya-kvartir/upravlenie-svetom', destination: '/functions/lighting', permanent: true },
      { source: '/smart-home/osveshhenie/distanczionnoe-upravlenie.html', destination: '/functions/lighting', permanent: true },
      { source: '/smart-home/razrabotka-sistem/besprovodnye-resheniya', destination: '/answers/provodnoy-umnyy-dom-ili-besprovodnoy-chto-vybrat', permanent: true },
      { source: '/oborudovanie/upravlenie-domom/golosovoe-upravlenie', destination: '/compare/ecosystems', permanent: true },
      { source: '/smart-home/razrabotka-sistem/udalyennoe-upravlenie', destination: '/equipment/app', permanent: true },
      { source: '/smart-home/gotovye-resheniya/dopolnitelnye-optsii', destination: '/functions', permanent: true },
      { source: '/smart-home/osveshchenie/distantsionnoe-upravlenie', destination: '/functions/lighting', permanent: true },
      { source: '/smart-home/gotovye-resheniya/nedorogie-resheniya', destination: '/compare/diy', permanent: true },
      { source: '/avtomatizacziya/kompleksnyie-resheniya/kottedzh', destination: '/solutions/house', permanent: true },
      { source: '/avtomatizacziya/kompleksnyie-resheniya/kvartira', destination: '/solutions/flat', permanent: true },
      { source: '/smart-home/gotovye-resheniya/premialnyy-segment', destination: '/solutions/premium', permanent: true },
      { source: '/smart-home/razrabotka-sistem/modulnye-resheniya', destination: '/equipment/controllers', permanent: true },
      { source: '/smart-home/multimedia/upravlenie-audio-i-video', destination: '/functions/multimedia/audio', permanent: true },
      { source: '/smart-home/razrabotka-sistem/provodnye-sistemy', destination: '/answers/provodnoy-umnyy-dom-ili-besprovodnoy-chto-vybrat', permanent: true },
      { source: '/oborudovanie/upravlenie-domom/cherez-internet', destination: '/answers/chto-znachit-umnyy-dom-bez-oblaka-i', permanent: true },
      { source: '/avtomatizacziya/kompleksnyie-resheniya/dacha', destination: '/solutions/house', permanent: true },
      { source: '/oborudovanie/prilozheniya/dliya-iphone.html', destination: '/equipment/app', permanent: true },
      { source: '/smart-home/osveshchenie/upravlenie-golosom', destination: '/compare/ecosystems', permanent: true },
      { source: '/smart-home/razrabotka-sistem/gsm-resheniya', destination: '/compare/diy', permanent: true },
      { source: '/smart-home/elektrika/upravlenie-rozetkami', destination: '/functions/electric/sockets', permanent: true },
      { source: '/smart-home/mikroklimat/konditsionirovanie', destination: '/functions/climate/cooling', permanent: true },
      { source: '/smart-home/mikroklimat/ventilyacziya.html', destination: '/functions/climate/ventilation', permanent: true },
      { source: '/smart-home/multimedia/domashniy-kinoteatr', destination: '/functions/multimedia/cinema', permanent: true },
      { source: '/oborudovanie/upravlenie-domom/s-telefona', destination: '/answers/kak-rabotaet-prilozhenie-upravleniya-umnym-domom', permanent: true },
      { source: '/smart-home/bezopasnost/gsm-sistemyi.html', destination: '/functions/security/alarm', permanent: true },
      { source: '/smart-home/elektrika/upravlenie-shtorami', destination: '/functions/curtains', permanent: true },
      { source: '/smart-home/bezopasnost/videonablyudenie', destination: '/functions/security/cctv', permanent: true },
      { source: '/smart-home/osveshchenie/avtomatizatsiya', destination: '/functions/lighting', permanent: true },
      { source: '/oborudovanie/prilozheniya/dlya-android', destination: '/equipment/app', permanent: true },
      { source: '/oborudovanie/prilozheniya/dlya-windows', destination: '/equipment/app', permanent: true },
      { source: '/smart-home/bezopasnost/kontrol-dostupa', destination: '/functions/security/access', permanent: true },
      { source: '/smart-home/elektrika/energosberezhenie', destination: '/answers/okupaetsya-li-umnyy-dom-na-energosberezhenii', permanent: true },
      { source: '/smart-home/razrabotka-sistem/komplekty', destination: '/compare/diy', permanent: true },
      { source: '/oborudovanie/prilozheniya/dlya-iphone', destination: '/equipment/app', permanent: true },
      { source: '/smart-home/bezopasnost/protechka-vody', destination: '/functions/security/leaks', permanent: true },
      { source: '/smart-home/bezopasnost/signalizatsiya', destination: '/functions/security/alarm', permanent: true },
      { source: '/smart-home/mikroklimat/ventilyatsiya', destination: '/functions/climate/ventilation', permanent: true },
      { source: '/smart-home/elektrika/vodosnabzhenie', destination: '/functions/security/leaks', permanent: true },
      { source: '/smart-home/bezopasnost/gsm-sistemy', destination: '/functions/security/alarm', permanent: true },
      { source: '/smart-home/osveshchenie/index.html', destination: '/functions/lighting', permanent: true },
      { source: '/oborudovanie/datchiki/temperatury', destination: '/equipment/sensors/temperature', permanent: true },
      { source: '/smart-home/mikroklimat/teplyy-pol', destination: '/functions/climate/floor', permanent: true },
      { source: '/oborudovanie/datchiki/dvizheniya', destination: '/equipment/sensors/motion', permanent: true },
      { source: '/oborudovanie/datchiki/vlazhnosti', destination: '/equipment/sensors/humidity', permanent: true },
      { source: '/smart-home/mikroklimat/otoplenie', destination: '/functions/climate/heating', permanent: true },
      { source: '/oborudovanie/datchiki/protechki', destination: '/equipment/sensors/leak', permanent: true },
      { source: '/smart-home/bezopasnost/domofon', destination: '/functions/security/intercom', permanent: true },
      { source: '/smart-home/multimedia/multirum', destination: '/functions/multimedia/multiroom', permanent: true },
      { source: '/smart-home/bezopasnost/vorota', destination: '/functions/security/access', permanent: true },
      { source: '/smart-home/elektrika/zhalyuzi', destination: '/functions/curtains', permanent: true },
      { source: '/oborudovanie/datchiki/dyma', destination: '/equipment/sensors/smoke', permanent: true },
      { source: '/articles/avtomatizirovannaya-sistema-upravleniya-zdaniem', destination: '/solutions/office', permanent: true },
      { source: '/articles/umnoe-elektricheskoe-otoplenie-v-chastnom-dome', destination: '/functions/climate/heating', permanent: true },
      { source: '/proektyi/vysokie-tekhnologii-v-klassicheskom-ispolnenii', destination: '/portfolio', permanent: true },
      { source: '/proektyi/bolshaya-kvartira-s-panoramnym-vidom-na-gorod', destination: '/portfolio', permanent: true },
      { source: '/articles/proizvoditeli-oborudovaniya-dlya-umnogo-doma', destination: '/equipment', permanent: true },
      { source: '/proektyi/prostornaya-kvartira-dlya-semi-s-4-mya-detmi', destination: '/portfolio', permanent: true },
      { source: '/articles/sovety-po-vyboru-ustroystv-dlya-umnogo-doma', destination: '/answers/kak-vybrat-integratora-umnogo-doma', permanent: true },
      { source: '/articles/umnyij-dom-%E2%80%93-plyusyi-i-minusyi.html', destination: '/compare', permanent: true },
      { source: '/proektyi/umnyy-dom-v-nebolshoy-i-akkuratnoy-kvartire', destination: '/portfolio', permanent: true },
      { source: '/proektyi/vpechatlyayushchiy-osobnyak-v-sosnovom-lesu', destination: '/portfolio', permanent: true },
      { source: '/proektyi/uyutnaya-kvartira-zhk-riverdale-apartments', destination: '/portfolio', permanent: true },
      { source: '/proektyi/2-kh-urovnevaya-kvartira-zhk-festivalnyy', destination: '/portfolio', permanent: true },
      { source: '/proektyi/dom-2-etazha-dlya-pary-v-stile-modern', destination: '/portfolio', permanent: true },
      { source: '/articles/signalizatsiya-dlya-zagorodnogo-doma', destination: '/functions/security/alarm', permanent: true },
      { source: '/articles/podklyuchenie-umnogo-vyklyuchatelya', destination: '/answers/ostanutsya-li-obychnye-vyklyuchateli-na-stene', permanent: true },
      { source: '/articles/upravlenie-umnym-domom-s-kompyutera', destination: '/answers/kak-rabotaet-prilozhenie-upravleniya-umnym-domom', permanent: true },
      { source: '/articles/ustanovka-kontrolya-dostupa-na-dver', destination: '/functions/security/access', permanent: true },
      { source: '/proektyi/prestizhnyy-dom-v-elitnom-poselke', destination: '/portfolio', permanent: true },
      { source: '/articles/sistemy-bezopasnosti-umnogo-doma', destination: '/functions/security', permanent: true },
      { source: '/articles/solnechnyie-batarei-v-umnom-dome', destination: '/answers/chto-prodolzhit-rabotat-v-dome-pri-otklyuchenii', permanent: true },
      { source: '/articles/umnyij-dom-bezopasnost-i-oxrana', destination: '/functions/security', permanent: true },
      { source: '/proektyi/umnyy-dom-br-dlya-nayka-borzova', destination: '/portfolio', permanent: true },
      { source: '/articles/domashnij-kinoteatr-umnyij-dom', destination: '/functions/multimedia/cinema', permanent: true },
      { source: '/articles/detsentralizovannyy-umnyy-dom', destination: '/answers/chto-takoe-decentralizovannaya-arhitektura-umnogo-doma-i', permanent: true },
      { source: '/articles/sistema-umnyij-dom-dlya-dachi', destination: '/answers/stoit-li-stavit-umnyy-dom-na-dachu', permanent: true },
      { source: '/avtomatizacziya/kompleksnyie-resheniya', destination: '/solutions', permanent: true },
      { source: '/proektyi/bolshoy-dom-dlya-bolshoy-semi', destination: '/portfolio', permanent: true },
      { source: '/articles/kak-sdelat-sistemu-umnyy-dom', destination: '/answers/iz-kakih-etapov-sostoit-proekt-umnogo-doma', permanent: true },
      { source: '/articles/upravlenie-svetom-s-telefona', destination: '/functions/lighting', permanent: true },
      { source: '/articles/avtomatizatsiya-umnogo-doma', destination: '/functions/automation', permanent: true },
      { source: '/articles/dlya-chego-nuzhen-umnyy-dom', destination: '/functions', permanent: true },
      { source: '/avtomatizacziya/funktsii-umnogo-doma', destination: '/functions/automation', permanent: true },
      { source: '/oborudovanie/avtomatizatsiya-kvartir', destination: '/solutions/flat', permanent: true },
      { source: '/articles/umnyy-dom-kak-eto-rabotaet', destination: '/functions/automation', permanent: true },
      { source: '/articles/avtomatizatsiya-kottedzha', destination: '/solutions/house', permanent: true },
      { source: '/articles/provodka-dlya-umnogo-doma', destination: '/answers/provodnoy-umnyy-dom-ili-besprovodnoy-chto-vybrat', permanent: true },
      { source: '/articles/umnyij-dom-dlya-invalidov', destination: '/answers/smogut-li-gosti-deti-i-pozhilye-roditeli', permanent: true },
      { source: '/articles/umnyy-dom-plyusy-i-minusy', destination: '/compare', permanent: true },
      { source: '/articles/komandy-dlya-umnogo-doma', destination: '/answers/kak-nastraivayutsya-scenarii-avtomatizacii-umnogo-doma', permanent: true },
      { source: '/articles/reyting-sistem-umnyy-dom', destination: '/compare', permanent: true },
      { source: '/articles/umnaya-kolonka-dlya-doma', destination: '/compare/ecosystems', permanent: true },
      { source: '/articles/vozmozhnosti-umnogo-doma', destination: '/functions', permanent: true },
      { source: '/czenyi/proektirovanie-umnogo-doma', destination: '/answers/chto-vhodit-v-proektirovanie-umnogo-doma', permanent: true },
      { source: '/oborudovanie/komplektuyushie.html', destination: '/equipment', permanent: true },
      { source: '/articles/kontrol-dostupa-na-dver', destination: '/functions/security/access', permanent: true },
      { source: '/articles/aktualnost-umnogo-doma', destination: '/functions', permanent: true },
      { source: '/articles/umnyij-dom-dlya-ofisa', destination: '/solutions/office', permanent: true },
      { source: '/articles/umnyij-dom-wi-fi.html', destination: '/answers/provodnoy-umnyy-dom-ili-besprovodnoy-chto-vybrat', permanent: true },
      { source: '/oborudovanie/komplektuyushchie', destination: '/equipment', permanent: true },
      { source: '/proektyi/v-poselke-park-avenue', destination: '/portfolio', permanent: true },
      { source: '/articles/umnyy-dom-dlya-dachi', destination: '/answers/stoit-li-stavit-umnyy-dom-na-dachu', permanent: true },
      { source: '/oborudovanie/upravlenie-domom', destination: '/functions/automation', permanent: true },
      { source: '/articles/umnaya-dacha-moskva', destination: '/answers/stoit-li-stavit-umnyy-dom-na-dachu', permanent: true },
      { source: '/avtomatizacziya/vozmozhnosti', destination: '/functions', permanent: true },
      { source: '/smart-home/gotovye-resheniya', destination: '/solutions', permanent: true },
      { source: '/articles/server-umnogo-doma', destination: '/equipment/controllers', permanent: true },
      { source: '/articles/skhemy-umnogo-doma', destination: '/functions/automation', permanent: true },
      { source: '/upload/Proect_Umniy_Dom.pdf', destination: '/pricing', permanent: true },
      { source: '/czenyi/montazh-umnogo-doma', destination: '/answers/skolko-vremeni-zanimaet-montazh-umnogo-doma', permanent: true },
      { source: '/articles/umnyy-dom-i-deti', destination: '/answers/smogut-li-gosti-deti-i-pozhilye-roditeli', permanent: true },
      { source: '/oborudovanie/prilozheniya', destination: '/equipment/app', permanent: true },
      { source: '/articles/mebel-umnyy-dom', destination: '/functions', permanent: true },
      { source: '/oborudovanie/kontrollery', destination: '/equipment/controllers', permanent: true },
      { source: '/smart-home/osveshchenie', destination: '/functions/lighting', permanent: true },
      { source: '/smart-home/bezopasnost', destination: '/functions/security', permanent: true },
      { source: '/smart-home/mikroklimat', destination: '/functions/climate', permanent: true },
      { source: '/oborudovanie/datchiki', destination: '/equipment/sensors', permanent: true },
      { source: '/smart-home/multimedia', destination: '/functions/multimedia', permanent: true },
      { source: '/kontaktyi/nur-sultan', destination: '/contacts', permanent: true },
      { source: '/partneram/integrator', destination: '/partners', permanent: true },
      { source: '/smart-home/elektrika', destination: '/functions/electric', permanent: true },
      { source: '/kontaktyi/tashkent', destination: '/contacts', permanent: true },
      { source: '/partneram/designer', destination: '/partners', permanent: true },
      { source: '/partneram/dileram', destination: '/answers/kak-stat-partnerom-dilerom-mimismart', permanent: true },
      { source: '/kontaktyi/moskva', destination: '/contacts', permanent: true },
      { source: '/kontaktyi/kazan', destination: '/contacts', permanent: true },
      { source: '/kontaktyi/sochi', destination: '/contacts', permanent: true },
      { source: '/kontaktyi/baku', destination: '/contacts', permanent: true },
      { source: '/czenyi/servis', destination: '/pricing', permanent: true },
      { source: '/avtomatizacziya', destination: '/functions/automation', permanent: true },
      { source: '/oborudovanie', destination: '/equipment', permanent: true },
      { source: '/index.html', destination: '/', permanent: true },
      { source: '/o-kompanii', destination: '/about', permanent: true },
      { source: '/smart-home', destination: '/solutions', permanent: true },
      { source: '/kontaktyi', destination: '/contacts', permanent: true },
      { source: '/partneram', destination: '/partners', permanent: true },
      { source: '/articles', destination: '/answers', permanent: true },
      { source: '/proektyi', destination: '/portfolio', permanent: true },
      { source: '/private', destination: '/privacy', permanent: true },
      { source: '/czenyi', destination: '/pricing', permanent: true },
      // инфо
      { source: '/news', destination: '/answers', permanent: true },  // ⚠️ /blog не построен, см. A7
    ]
  },
}
```

# Часть B. Легаси-домены → новый сайт

**Здесь на кону накопленный вес.** Источник — перебор поискового индекса по пяти доменам
(21.08.2026): **около 250 подтверждённых URL, 194 правила в конфиге**. Каждый показан выдачей; путей, достроенных по
догадке, в карте нет — выдуманный URL в карте редиректов хуже отсутствующего.

## ⚠️ Исправление к прежней версии этого раздела
Раньше здесь стояло: «`mmsmart.ru` — основной домен, `mimismart.ru` держит зеркальные пути с той
же структурой, значит одна карта применяется к обоим». **Это неверно.** У доменов расходится
транслитерация и формат адресов:

| Тема | mmsmart.ru | mimismart.ru |
|---|---|---|
| Вентиляция | `/smart-home/mikroklimat/ventilyatsiya/` | `/smart-home/mikroklimat/ventilyacziya.html` |
| Освещение | `/smart-home/osveshchenie/` | `/smart-home/osveshhenie/…html` |
| Комплектующие | `/oborudovanie/komplektuyushchie/` | `/oborudovanie/komplektuyushie.html` |
| Корень | `/` | `/index.html` |

Механически копировать пути между доменами нельзя: получится карта, которая на зеркале не
срабатывает вообще. Зеркало ведётся отдельным списком (B4).

## B1. Основной домен `mmsmart.ru` — разделы

| Старый | Новый | Примечание |
|---|---|---|
| `/oborudovanie/` | `/equipment` |  |
| `/oborudovanie/kontrollery/` | `/equipment/controllers` |  |
| `/oborudovanie/datchiki/` | `/equipment/sensors` |  |
| `/oborudovanie/datchiki/protechki/` | `/equipment/sensors/leak` |  |
| `/oborudovanie/datchiki/dvizheniya/` | `/equipment/sensors/motion` |  |
| `/oborudovanie/datchiki/vlazhnosti/` | `/equipment/sensors/humidity` |  |
| `/oborudovanie/datchiki/temperatury/` | `/equipment/sensors/temperature` |  |
| `/oborudovanie/datchiki/dyma/` | `/equipment/sensors/smoke` |  |
| `/oborudovanie/komplektuyushchie/` | `/equipment` |  |
| `/oborudovanie/prilozheniya/dlya-android/` | `/equipment/app` |  |
| `/oborudovanie/prilozheniya/dlya-iphone/` | `/equipment/app` |  |
| `/oborudovanie/prilozheniya/dlya-windows/` | `/equipment/app` |  |
| `/oborudovanie/prilozheniya/` | `/equipment/app` |  |
| `/oborudovanie/upravlenie-domom/s-telefona/` | `/answers/kak-rabotaet-prilozhenie-upravleniya-umnym-domom` |  |
| `/oborudovanie/upravlenie-domom/cherez-internet/` | `/answers/chto-znachit-umnyy-dom-bez-oblaka-i` |  |
| `/oborudovanie/upravlenie-domom/golosovoe-upravlenie/` | `/compare/ecosystems` |  |
| `/oborudovanie/upravlenie-domom/` | `/functions/automation` |  |
| `/oborudovanie/avtomatizatsiya-kvartir/upravlenie-svetom/` | `/functions/lighting` |  |
| `/oborudovanie/avtomatizatsiya-kvartir/upravlenie-temperaturoy/` | `/functions/climate` |  |
| `/oborudovanie/avtomatizatsiya-kvartir/oborudovanie-dlya-kvartir/` | `/equipment` |  |
| `/oborudovanie/avtomatizatsiya-kvartir/` | `/solutions/flat` |  |
| `/smart-home/osveshchenie/avtomatizatsiya/` | `/functions/lighting` |  |
| `/smart-home/osveshchenie/distantsionnoe-upravlenie/` | `/functions/lighting` |  |
| `/smart-home/osveshchenie/upravlenie-golosom/` | `/compare/ecosystems` |  |
| `/smart-home/osveshchenie/` | `/functions/lighting` |  |
| `/smart-home/mikroklimat/otoplenie/` | `/functions/climate/heating` |  |
| `/smart-home/mikroklimat/teplyy-pol/` | `/functions/climate/floor` |  |
| `/smart-home/mikroklimat/ventilyatsiya/` | `/functions/climate/ventilation` |  |
| `/smart-home/mikroklimat/konditsionirovanie/` | `/functions/climate/cooling` |  |
| `/smart-home/mikroklimat/` | `/functions/climate` |  |
| `/smart-home/elektrika/upravlenie-rozetkami/` | `/functions/electric/sockets` |  |
| `/smart-home/elektrika/upravlenie-shtorami/` | `/functions/curtains` |  |
| `/smart-home/elektrika/zhalyuzi/` | `/functions/curtains` |  |
| `/smart-home/elektrika/energosberezhenie/` | `/answers/okupaetsya-li-umnyy-dom-na-energosberezhenii` |  |
| `/smart-home/elektrika/vodosnabzhenie/` | `/functions/security/leaks` |  |
| `/smart-home/elektrika/` | `/functions/electric` |  |
| `/smart-home/bezopasnost/signalizatsiya/` | `/functions/security/alarm` |  |
| `/smart-home/bezopasnost/okhranno-pozharnaya-signalizatsiya/` | `/functions/security/fire` |  |
| `/smart-home/bezopasnost/videonablyudenie/` | `/functions/security/cctv` |  |
| `/smart-home/bezopasnost/kontrol-dostupa/` | `/functions/security/access` |  |
| `/smart-home/bezopasnost/domofon/` | `/functions/security/intercom` |  |
| `/smart-home/bezopasnost/vorota/` | `/functions/security/access` |  |
| `/smart-home/bezopasnost/protechka-vody/` | `/functions/security/leaks` |  |
| `/smart-home/bezopasnost/gsm-sistemy/` | `/functions/security/alarm` |  |
| `/smart-home/bezopasnost/` | `/functions/security` |  |
| `/smart-home/multimedia/multirum/` | `/functions/multimedia/multiroom` |  |
| `/smart-home/multimedia/domashniy-kinoteatr/` | `/functions/multimedia/cinema` |  |
| `/smart-home/multimedia/upravlenie-audio-i-video/` | `/functions/multimedia/audio` |  |
| `/smart-home/multimedia/` | `/functions/multimedia` |  |
| `/smart-home/razrabotka-sistem/provodnye-sistemy/` | `/answers/provodnoy-umnyy-dom-ili-besprovodnoy-chto-vybrat` |  |
| `/smart-home/razrabotka-sistem/besprovodnye-resheniya/` | `/answers/provodnoy-umnyy-dom-ili-besprovodnoy-chto-vybrat` |  |
| `/smart-home/razrabotka-sistem/gsm-resheniya/` | `/compare/diy` |  |
| `/smart-home/razrabotka-sistem/komplekty/` | `/compare/diy` |  |
| `/smart-home/razrabotka-sistem/modulnye-resheniya/` | `/equipment/controllers` |  |
| `/smart-home/razrabotka-sistem/udalyennoe-upravlenie/` | `/equipment/app` |  |
| `/smart-home/gotovye-resheniya/premialnyy-segment/` | `/solutions/premium` |  |
| `/smart-home/gotovye-resheniya/nedorogie-resheniya/` | `/compare/diy` |  |
| `/smart-home/gotovye-resheniya/dopolnitelnye-optsii/` | `/functions` |  |
| `/smart-home/gotovye-resheniya/` | `/solutions` |  |
| `/smart-home/` | `/solutions` |  |
| `/avtomatizacziya/kompleksnyie-resheniya/kvartira/` | `/solutions/flat` |  |
| `/avtomatizacziya/kompleksnyie-resheniya/kottedzh/` | `/solutions/house` |  |
| `/avtomatizacziya/kompleksnyie-resheniya/dacha/` | `/solutions/house` | ⚠️ дача → дом: отдельной страницы дачи нет |
| `/avtomatizacziya/kompleksnyie-resheniya/` | `/solutions` |  |
| `/avtomatizacziya/funktsii-umnogo-doma/` | `/functions/automation` |  |
| `/avtomatizacziya/vozmozhnosti/` | `/functions` |  |
| `/avtomatizacziya/` | `/functions/automation` |  |
| `/czenyi/montazh-umnogo-doma/` | `/answers/skolko-vremeni-zanimaet-montazh-umnogo-doma` |  |
| `/czenyi/proektirovanie-umnogo-doma/` | `/answers/chto-vhodit-v-proektirovanie-umnogo-doma` |  |
| `/czenyi/servis/` | `/pricing` | ⚠️ временно: раздела /service в архитектуре нет |
| `/czenyi/` | `/pricing` |  |
| `/o-kompanii/` | `/about` |  |
| `/partneram/dileram/` | `/answers/kak-stat-partnerom-dilerom-mimismart` |  |
| `/partneram/designer/` | `/partners` | ⚠️ страницы для дизайнеров нет |
| `/partneram/integrator/` | `/partners` |  |
| `/partneram/` | `/partners` |  |
| `/kontaktyi/moskva/` | `/contacts` |  |
| `/kontaktyi/sochi/` | `/contacts` |  |
| `/kontaktyi/kazan/` | `/contacts` |  |
| `/kontaktyi/tashkent/` | `/contacts` |  |
| `/kontaktyi/nur-sultan/` | `/contacts` |  |
| `/kontaktyi/` | `/contacts` |  |
| `/private/` | `/privacy` |  |
| `/proektyi/` | `/portfolio` |  |
| `/articles/` | `/answers` |  |

## B2. Раздел `/articles/` — самый уязвимый
В индексе **36 статей**. Это единственный источник органики по технологическому кластеру:
`/articles/detsentralizovannyy-umnyy-dom/` стоит в органической выдаче третьим. Ведём адресно —
склейка в раздел обнуляет именно ту страницу, которая работает.

| Старый | Новый | Примечание |
|---|---|---|
| `/articles/detsentralizovannyy-umnyy-dom/` | `/answers/chto-takoe-decentralizovannaya-arhitektura-umnogo-doma-i` | ⚠️ стоит в органике третьим |
| `/articles/server-umnogo-doma/` | `/equipment/controllers` |  |
| `/articles/reyting-sistem-umnyy-dom/` | `/compare` |  |
| `/articles/vozmozhnosti-umnogo-doma/` | `/functions` |  |
| `/articles/umnyy-dom-kak-eto-rabotaet/` | `/functions/automation` |  |
| `/articles/skhemy-umnogo-doma/` | `/functions/automation` |  |
| `/articles/avtomatizatsiya-umnogo-doma/` | `/functions/automation` |  |
| `/articles/umnyij-dom-dlya-ofisa/` | `/solutions/office` |  |
| `/articles/avtomatizatsiya-kottedzha/` | `/solutions/house` |  |
| `/articles/sovety-po-vyboru-ustroystv-dlya-umnogo-doma/` | `/answers/kak-vybrat-integratora-umnogo-doma` |  |
| `/articles/proizvoditeli-oborudovaniya-dlya-umnogo-doma/` | `/equipment` |  |
| `/articles/provodka-dlya-umnogo-doma/` | `/answers/provodnoy-umnyy-dom-ili-besprovodnoy-chto-vybrat` |  |
| `/articles/podklyuchenie-umnogo-vyklyuchatelya/` | `/answers/ostanutsya-li-obychnye-vyklyuchateli-na-stene` |  |
| `/articles/upravlenie-svetom-s-telefona/` | `/functions/lighting` |  |
| `/articles/upravlenie-umnym-domom-s-kompyutera/` | `/answers/kak-rabotaet-prilozhenie-upravleniya-umnym-domom` |  |
| `/articles/domashnij-kinoteatr-umnyij-dom/` | `/functions/multimedia/cinema` |  |
| `/articles/umnaya-kolonka-dlya-doma/` | `/compare/ecosystems` |  |
| `/articles/kontrol-dostupa-na-dver/` | `/functions/security/access` |  |
| `/articles/ustanovka-kontrolya-dostupa-na-dver/` | `/functions/security/access` |  |
| `/articles/sistemy-bezopasnosti-umnogo-doma/` | `/functions/security` |  |
| `/articles/umnyij-dom-bezopasnost-i-oxrana/` | `/functions/security` |  |
| `/articles/signalizatsiya-dlya-zagorodnogo-doma/` | `/functions/security/alarm` |  |
| `/articles/avtomatizirovannaya-sistema-upravleniya-zdaniem/` | `/solutions/office` |  |
| `/articles/dlya-chego-nuzhen-umnyy-dom/` | `/functions` |  |
| `/articles/aktualnost-umnogo-doma/` | `/functions` |  |
| `/articles/kak-sdelat-sistemu-umnyy-dom/` | `/answers/iz-kakih-etapov-sostoit-proekt-umnogo-doma` |  |
| `/articles/umnyy-dom-i-deti/` | `/answers/smogut-li-gosti-deti-i-pozhilye-roditeli` |  |
| `/articles/komandy-dlya-umnogo-doma/` | `/answers/kak-nastraivayutsya-scenarii-avtomatizacii-umnogo-doma` |  |
| `/articles/solnechnyie-batarei-v-umnom-dome/` | `/answers/chto-prodolzhit-rabotat-v-dome-pri-otklyuchenii` |  |
| `/articles/umnyy-dom-plyusy-i-minusy/` | `/compare` |  |
| `/articles/sistema-umnyij-dom-dlya-dachi/` | `/answers/stoit-li-stavit-umnyy-dom-na-dachu` |  |
| `/articles/umnyy-dom-dlya-dachi/` | `/answers/stoit-li-stavit-umnyy-dom-na-dachu` |  |
| `/articles/umnaya-dacha-moskva/` | `/answers/stoit-li-stavit-umnyy-dom-na-dachu` |  |
| `/articles/umnoe-elektricheskoe-otoplenie-v-chastnom-dome/` | `/functions/climate/heating` |  |
| `/articles/umnyij-dom-dlya-invalidov/` | `/answers/smogut-li-gosti-deti-i-pozhilye-roditeli` |  |
| `/articles/mebel-umnyy-dom/` | `/functions` |  |

## B3. Проекты `/proektyi/` — 12 объектов
Все ведут на `/portfolio` до тех пор, пока у кейсов не появятся свои URL (`../tz-site/16`, D6).
Когда появятся — переставить адресно, объекты узнаваемы по слагам.

| Старый | Новый |
|---|---|
| `/proektyi/v-poselke-park-avenue/` | `/portfolio` |
| `/proektyi/umnyy-dom-v-nebolshoy-i-akkuratnoy-kvartire/` | `/portfolio` |
| `/proektyi/vpechatlyayushchiy-osobnyak-v-sosnovom-lesu/` | `/portfolio` |
| `/proektyi/dom-2-etazha-dlya-pary-v-stile-modern/` | `/portfolio` |
| `/proektyi/uyutnaya-kvartira-zhk-riverdale-apartments/` | `/portfolio` |
| `/proektyi/2-kh-urovnevaya-kvartira-zhk-festivalnyy/` | `/portfolio` |
| `/proektyi/prestizhnyy-dom-v-elitnom-poselke/` | `/portfolio` |
| `/proektyi/vysokie-tekhnologii-v-klassicheskom-ispolnenii/` | `/portfolio` |
| `/proektyi/bolshoy-dom-dlya-bolshoy-semi/` | `/portfolio` |
| `/proektyi/prostornaya-kvartira-dlya-semi-s-4-mya-detmi/` | `/portfolio` |
| `/proektyi/bolshaya-kvartira-s-panoramnym-vidom-na-gorod/` | `/portfolio` |
| `/proektyi/umnyy-dom-br-dlya-nayka-borzova/` | `/portfolio` |


## B4. Зеркало `mimismart.ru` — своя схема адресов

Перебор индекса дал **59 подтверждённых URL зеркала**. Главное здесь не список, а закономерность:
у зеркала нет одной схемы транслитерации — на нём сосуществуют **два поколения слагов**.

| Буква | Старые ветки (`avtomatizacziya/`, `czenyi/`, `proektyi/`, `kontaktyi/`, плоские `.html`) | Новые ветки (`smart-home/`, `oborudovanie/`, `partneram/`) | На основном домене |
|---|---|---|---|
| ц | `cz` — `avtomatizacziya`, `ventilyacziya` | `ts` — `konditsionirovanie` | `ts` |
| ы | `yi` — `proektyi`, `gsm-sistemyi` | `y` — `provodnye-sistemy` | `y` |
| й | `j` — `umnyij-dom` | `y` — `teplyy-pol` | `y` |
| щ | `shh` — `osveshhenie` | `shch` — `osveshchenie` | `shch` |

Отдельно: **у «щ» на зеркале три написания** — `shh`, `shch` и `sh` (`komplektuyushie.html`, где
одна `h` потеряна). Угадать нельзя: каждый адрес проверяется отдельно.

Формат адреса тоже не один. Живут одновременно каталог со слешем, каталог с `/index.html` и
плоский `.html`, причём вперемешку внутри одной секции: `/mikroklimat/ventilyacziya.html` рядом с
`/mikroklimat/otoplenie/`. По четырём страницам выдача показала **обе** формы сразу — значит
правила нужны на оба варианта. Плюс часть страниц индексируется по `http://`.

Практический вывод: **общей склейкой зеркало не покрывается**. Ниже — подтверждённые адреса.

| Старый | Новый | Примечание |
|---|---|---|
| `/index.html` | `/` |  |
| `/avtomatizacziya/vozmozhnosti/` | `/functions` |  |
| `/avtomatizacziya/funktsii-umnogo-doma/` | `/functions/automation` |  |
| `/avtomatizacziya/kompleksnyie-resheniya/` | `/solutions` |  |
| `/avtomatizacziya/kompleksnyie-resheniya/kottedzh/` | `/solutions/house` |  |
| `/avtomatizacziya/kompleksnyie-resheniya/dacha/` | `/solutions/house` | ⚠️ дачи нет отдельно |
| `/articles/umnyij-dom-wi-fi.html` | `/answers/provodnoy-umnyy-dom-ili-besprovodnoy-chto-vybrat` | ⚠️ плоский .html |
| `/articles/umnyij-dom-%E2%80%93-plyusyi-i-minusyi.html` | `/compare` | ⚠️ в слаге настоящее тире, закодировано |
| `/articles/umnyij-dom-dlya-ofisa/` | `/solutions/office` |  |
| `/articles/provodka-dlya-umnogo-doma/` | `/answers/provodnoy-umnyy-dom-ili-besprovodnoy-chto-vybrat` |  |
| `/articles/umnaya-kolonka-dlya-doma/` | `/compare/ecosystems` |  |
| `/articles/server-umnogo-doma/` | `/equipment/controllers` |  |
| `/proektyi/` | `/portfolio` |  |
| `/proektyi/umnyy-dom-br-dlya-nayka-borzova/` | `/portfolio` |  |
| `/proektyi/vysokie-tekhnologii-v-klassicheskom-ispolnenii/` | `/portfolio` |  |
| `/proektyi/bolshoy-dom-dlya-bolshoy-semi/` | `/portfolio` |  |
| `/proektyi/v-poselke-park-avenue/` | `/portfolio` |  |
| `/smart-home/gotovye-resheniya/` | `/solutions` |  |
| `/smart-home/gotovye-resheniya/nedorogie-resheniya/` | `/compare/diy` |  |
| `/smart-home/gotovye-resheniya/dopolnitelnye-optsii/` | `/functions` |  |
| `/smart-home/razrabotka-sistem/komplekty/` | `/compare/diy` |  |
| `/smart-home/razrabotka-sistem/modulnye-resheniya/` | `/equipment/controllers` |  |
| `/smart-home/razrabotka-sistem/modulnye-resheniya/index.html` | `/equipment/controllers` | ⚠️ вторая форма того же адреса |
| `/smart-home/razrabotka-sistem/provodnye-sistemy/` | `/answers/provodnoy-umnyy-dom-ili-besprovodnoy-chto-vybrat` |  |
| `/smart-home/razrabotka-sistem/provodnye-sistemy/index.html` | `/answers/provodnoy-umnyy-dom-ili-besprovodnoy-chto-vybrat` | ⚠️ вторая форма |
| `/smart-home/osveshchenie/index.html` | `/functions/lighting` | ⚠️ щ → shch |
| `/smart-home/osveshhenie/distanczionnoe-upravlenie.html` | `/functions/lighting` | ⚠️ щ → shh, ц → cz |
| `/smart-home/mikroklimat/otoplenie/` | `/functions/climate/heating` |  |
| `/smart-home/mikroklimat/konditsionirovanie/` | `/functions/climate/cooling` |  |
| `/smart-home/mikroklimat/teplyy-pol/` | `/functions/climate/floor` |  |
| `/smart-home/mikroklimat/ventilyacziya.html` | `/functions/climate/ventilation` | ⚠️ ц → cz, плоский .html |
| `/smart-home/elektrika/upravlenie-rozetkami/` | `/functions/electric/sockets` |  |
| `/smart-home/bezopasnost/vorota/` | `/functions/security/access` |  |
| `/smart-home/bezopasnost/vorota/index.html` | `/functions/security/access` | ⚠️ вторая форма |
| `/smart-home/bezopasnost/signalizatsiya/` | `/functions/security/alarm` |  |
| `/smart-home/bezopasnost/okhranno-pozharnaya-signalizatsiya/` | `/functions/security/fire` |  |
| `/smart-home/bezopasnost/gsm-sistemyi.html` | `/functions/security/alarm` | ⚠️ ы → yi |
| `/smart-home/bezopasnost/kontrol-dostupa/` | `/functions/security/access` |  |
| `/smart-home/multimedia/multirum/` | `/functions/multimedia/multiroom` |  |
| `/smart-home/multimedia/multirum/index.html` | `/functions/multimedia/multiroom` | ⚠️ вторая форма |
| `/smart-home/multimedia/upravlenie-audio-i-video/` | `/functions/multimedia/audio` |  |
| `/oborudovanie/prilozheniya/` | `/equipment/app` |  |
| `/oborudovanie/prilozheniya/dlya-windows/index.html` | `/equipment/app` |  |
| `/oborudovanie/prilozheniya/dliya-iphone.html` | `/equipment/app` | ⚠️ другое написание «для» |
| `/oborudovanie/komplektuyushie.html` | `/equipment` | ⚠️ щ → sh, одна h потеряна |
| `/oborudovanie/datchiki/dvizheniya/` | `/equipment/sensors/motion` |  |
| `/oborudovanie/datchiki/protechki/` | `/equipment/sensors/leak` |  |
| `/oborudovanie/datchiki/temperatury/` | `/equipment/sensors/temperature` |  |
| `/oborudovanie/upravlenie-domom/golosovoe-upravlenie/` | `/compare/ecosystems` |  |
| `/oborudovanie/upravlenie-domom/cherez-internet/` | `/answers/chto-znachit-umnyy-dom-bez-oblaka-i` |  |
| `/oborudovanie/avtomatizatsiya-kvartir/oborudovanie-dlya-kvartir/` | `/equipment` |  |
| `/czenyi/montazh-umnogo-doma/` | `/answers/skolko-vremeni-zanimaet-montazh-umnogo-doma` |  |
| `/czenyi/servis/` | `/pricing` | ⚠️ раздела /service нет |
| `/partneram/` | `/partners` |  |
| `/partneram/dileram/` | `/answers/kak-stat-partnerom-dilerom-mimismart` |  |
| `/partneram/integrator/` | `/partners` | ⚠️ страница для агентств недвижимости |
| `/kontaktyi/sochi/` | `/contacts` |  |
| `/kontaktyi/baku/` | `/contacts` |  |
| `/upload/Proect_Umniy_Dom.pdf` | `/pricing` | ⚠️ PDF-презентация в индексе |

**Чего на зеркале не нашлось** (в выдаче по этим темам только адреса основного домена):
видеонаблюдение, домофон, шторы и жалюзи, беспроводные системы, удалённое управление, датчики
дыма и газа, «о компании», отзывы. Либо страниц нет, либо они вне индекса — достраивать по
шаблону нельзя, особенно при трёх вариантах написания «щ».

## B5. Ещё три домена
`mimismart.com` — корень и `/catalog/`, плюс PDF-буклет `/files/Kit.pdf` в индексе.
`mmsmart-russia.ru` и `mimismart-home.ru` — одностраничники, в индексе только корень.
Все три склеиваются на основной домен корневым правилом; внутренних путей, кроме `/catalog/`
и PDF, поиск не показал.

## B6. Цели редиректов: все реализованы
Раньше здесь стоял список из двадцати двух целей, которых не было в прототипе. Они построены:
климат по системам, диммирование и биодинамика, розетки и резервное питание, безопасность по
контурам, мультимедиа, контроллеры, приложение и датчики по типам, плюс страница калькулятора.

Проверено обходом: **57 маршрутов из `sitemap.xml` — 57 реализованы**. Каждая цель в правилах
выше существует и отдаёт содержимое, а не заглушку.

## B7. Что карта всё ещё не покрывает
Сто девяносто URL — это то, что показал поиск, а не карта сайта. Известные пробелы:

- **Города.** В индексе пять страниц `/kontaktyi/{город}/` — Москва, Сочи, Казань, Ташкент,
  Нур-Султан. В тексте сайта упоминаются ещё офисы: СПб, Владимир, Лангепас, Красноярск, Тюмень,
  Саранск. Слаги неизвестны, достраивать нельзя. *(Побочно: это же расхождение — материал к
  проверке утверждения «20 представительств», `../tz-site/16`, B6.)*
- **Дубли в индексе:** `https://mmsmart.ru:443/…` — артефакт индексации; пары «слэш» и
  `index.html` на зеркале. Оба варианта нужно обрабатывать правилом.
- **Пагинация** списков статей и проектов: формат не выяснен.
- **Полный объём зеркала** и внутренние страницы трёх малых доменов.

Полный список даёт только выгрузка «Страницы в поиске» из Яндекс.Вебмастера и Search Console по
каждому домену плюс `sitemap.xml` каждого сайта. Дополнительно стоит снять историю из Wayback
Machine CDX (`web.archive.org/cdx/search/cdx?url=mmsmart.ru*`) — она покажет и то, что из индекса
уже выпало, но на что ещё ведут внешние ссылки.

## Цели проверены: страниц вне карты сайта нет
Все цели редиректов прогнаны против `sitemap.xml` автоматически — проверка входит в
`tools/accept.mjs` и падает, если появится цель без страницы. Сейчас **69 уникальных целей,
расхождений ноль**.

Два расхождения были и устранены:
- `/controller/1` вёл на `/equipment/cuarm5m` — страницы с таким слагом нет: слаги карточек
  товаров не подтверждены. Переставлен на `/equipment/controllers`. Когда слаг подтвердят,
  правило вернуть на карточку и одновременно добавить её в `sitemap.xml`.
- `/news` вёл на `/blog` — раздел объявлен в архитектуре, но не построен. Переставлен на
  `/answers`, куда уже ведут легаси-статьи. Нужен ли `/blog` вообще — решение A7 в `../tz-site/16`.

## Проверка после выката
1. Прогнать список слева через curl/скрипт: каждый URL должен отдавать **301** и `Location`
   на существующую страницу с кодом **200** (не цепочку редиректов и не 404).
2. Цепочки (`301 → 301 → 200`) схлопнуть в один переход — каждый лишний прыжок теряет вес.
3. Загрузить обновлённый `sitemap.xml` в Search Console и Яндекс.Вебмастер, проверить отчёт
   по ошибкам сканирования через 1–2 недели.
