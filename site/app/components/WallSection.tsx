'use client';
import { useState } from 'react';

/* Разрез стены с трассами. Это то, что заказчик увидит один раз в жизни —
   когда стены открыты, — и по чему судят о подрядчике мастера, а не он сам.
   Фотографии такого у нас нет и выдумывать её нельзя, а схема ничего не
   выдаёт за снимок: она объясняет устройство, а не изображает объект.

   Подписи — настоящий текст рядом со схемой, а не внутри картинки: их читает
   и поиск, и экранный диктор, и они переводятся, а надпись в SVG — нет. */
type Узел = {
  id: string; имя: string; текст: string; цвет: string;
};

const УЗЛЫ: Узел[] = [
  { id: 'power', имя: 'Силовая линия', цвет: 'var(--conduit-grey)',
    текст: 'Серая гофра: розеточные группы, освещение, привод крана. Идёт отдельно от слаботочки — наводки от силового кабеля портят сигнал датчиков и звук мультирума.' },
  { id: 'data', имя: 'Слаботочная линия', цвет: 'var(--conduit-red)',
    текст: 'Красная гофра: шина управления, датчики, сеть, домофон. Разделение по цвету — не эстетика: через пять лет по нему находят нужную линию, не вскрывая стену целиком.' },
  { id: 'panel', имя: 'Щит автоматизации', цвет: 'var(--ink)',
    текст: 'Каждая линия подписана, оставлен резерв слотов. Место под щит закладывается до отделки: ниша, вентиляция, фронтальный доступ для обслуживания.' },
  { id: 'box', имя: 'Подрозетник под панель', цвет: 'var(--ink)',
    текст: 'Глубокий подрозетник и питание в точке выключателя. Если его не заложить, панель управления вешается поверх готовой стены — или не вешается вовсе.' },
  { id: 'sensor', имя: 'Точка датчика', цвет: 'var(--ink)',
    текст: 'Присутствие, протечка, температура. Кабель приходит в точку до штукатурки; беспроводной датчик в стяжке недоступен для замены батареи.' },
];

export default function WallSection() {
  const [активен, setАктивен] = useState<string>('data');
  const узел = УЗЛЫ.find((у) => у.id === активен) || УЗЛЫ[0];
  const вкл = (id: string) => activeProps(id, активен, setАктивен);

  return (
    <div className="wall">
      <div className="wall-figure">
        <svg viewBox="0 0 640 360" role="img"
          aria-label="Разрез стены: силовые линии в серой гофре и слаботочные в красной идут раздельно от щита к точкам">
          {/* Тело стены и перекрытия — фон, не интерактив */}
          <rect x="0" y="0" width="640" height="360" fill="var(--wall-bg)" />
          <rect x="0" y="300" width="640" height="60" fill="var(--wall-slab)" />
          <rect x="0" y="0" width="640" height="34" fill="var(--wall-slab)" />
          <g stroke="var(--wall-line)" strokeWidth="1" opacity="0.5">
            {[60, 120, 180, 240].map((y) => <line key={y} x1="0" y1={y} x2="640" y2={y} />)}
          </g>

          {/* Щит */}
          <g {...вкл('panel')}>
            <rect x="26" y="70" width="74" height="150" rx="6"
              fill="var(--panel)" stroke="var(--ink)" strokeWidth="2" />
            {[86, 104, 122, 140, 158, 176, 194].map((y) => (
              <line key={y} x1="36" y1={y} x2="90" y2={y} stroke="var(--muted)" strokeWidth="4" strokeLinecap="round" />
            ))}
          </g>

          {/* Силовая: серая гофра */}
          <g {...вкл('power')}>
            <path d="M100 110 H300 V60 H470" fill="none" stroke="var(--conduit-grey)"
              strokeWidth="14" strokeLinejoin="round" strokeLinecap="round" />
            <path d="M100 110 H300 V60 H470" fill="none" stroke="var(--wall-bg)"
              strokeWidth="14" strokeLinejoin="round" strokeLinecap="round"
              strokeDasharray="3 7" opacity="0.55" />
          </g>

          {/* Слаботочная: красная гофра */}
          <g {...вкл('data')}>
            <path d="M100 170 H240 V250 H560" fill="none" stroke="var(--conduit-red)"
              strokeWidth="14" strokeLinejoin="round" strokeLinecap="round" />
            <path d="M100 170 H240 V250 H560" fill="none" stroke="var(--wall-bg)"
              strokeWidth="14" strokeLinejoin="round" strokeLinecap="round"
              strokeDasharray="3 7" opacity="0.55" />
          </g>

          {/* Подрозетник под панель */}
          <g {...вкл('box')}>
            <rect x="452" y="40" width="42" height="42" rx="4"
              fill="var(--panel)" stroke="var(--ink)" strokeWidth="2" />
            <circle cx="473" cy="61" r="9" fill="none" stroke="var(--muted)" strokeWidth="2" />
          </g>

          {/* Точка датчика */}
          <g {...вкл('sensor')}>
            <circle cx="560" cy="250" r="17" fill="var(--panel)" stroke="var(--ink)" strokeWidth="2" />
            <circle cx="560" cy="250" r="6" fill="var(--conduit-red)" />
          </g>
        </svg>
      </div>

      <div className="wall-side">
        <ol className="wall-list">
          {УЗЛЫ.map((у) => (
            <li key={у.id}>
              <button type="button" className={`wall-btn${активен === у.id ? ' on' : ''}`}
                aria-pressed={активен === у.id} onClick={() => setАктивен(у.id)}>
                <i style={{ background: у.цвет }} aria-hidden="true" />
                {у.имя}
              </button>
            </li>
          ))}
        </ol>
        {/* Все пять текстов в разметке: скрыт только показ. */}
        <div className="wall-body">
          {УЗЛЫ.map((у) => (
            <p key={у.id} className="wall-text" hidden={активен !== у.id}>{у.текст}</p>
          ))}
        </div>
      </div>
    </div>
  );
}

/* Общие свойства интерактивной группы: нажатие и клавиатура ведут себя
   одинаково, потому что группа в SVG — не кнопка, и без role её не объявят. */
function activeProps(id: string, активен: string, set: (v: string) => void) {
  return {
    className: `wall-node${активен === id ? ' on' : ''}`,
    role: 'button' as const,
    tabIndex: 0,
    'aria-pressed': активен === id,
    onClick: () => set(id),
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); set(id); }
    },
  };
}
