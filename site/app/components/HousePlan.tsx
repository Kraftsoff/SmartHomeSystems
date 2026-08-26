'use client';
import { useEffect, useRef, useState } from 'react';

const PLAN_NIGHT = '/plan/plan-night-2e13515c34.png';
const PLAN_DAY = '/plan/plan-day-f1aad96bf4.png';

const SCENES = [
  { id: 'evening', label: 'Вечер дома', note: 'Свет приглушается, шторы закрываются, климат уходит в вечерний режим.' },
  { id: 'away', label: 'Ушёл из дома', note: 'Свет выключен, отопление снижено, охрана взведена, вода перекрыта.' },
  { id: 'night', label: 'Ночь', note: 'Дежурная подсветка по пути в санузел, спальня в тишине, датчики в режиме сна.' },
  { id: 'leak', label: 'Протечка', note: 'Кран перекрыт до прихода воды к соседям, свет по пути к щиту включён.' },
  { id: 'heat', label: 'Жара за окном', note: 'Отопление отключено, вентиляция и увлажнение выведены на летний режим.' },
  { id: 'smoke', label: 'Сработал датчик дыма', note: 'Вентиляция остановлена, эвакуационный свет включён, оповещение ушло.' },
  { id: 'guests', label: 'Гости приехали', note: 'Подъездная дорожка и фасад освещены, прихожая встречает светом.' },
  { id: 'garage', label: 'Машина у ворот', note: 'Ворота открыты по метке, свет в гараже и на въезде включён.' },
];

/* След подошвы: носок и пятка, без рисунка протектора — на девяти пикселях
   линии превращаются в грязь, а не в рисунок. */
const FOOT = `<svg viewBox="0 0 24 42" aria-hidden="true">
  <rect x="4" y="2" width="16" height="26" rx="7"/><rect x="5.5" y="30" width="13" height="11" rx="5"/></svg>`;

export default function HousePlan() {
  const stageRef = useRef<HTMLDivElement>(null);
  const [scene, setScene] = useState('evening');
  const mask = useRef<{ data: Uint8ClampedArray; w: number; h: number } | null>(null);

  /* Маску читаем один раз в массив: трассировка делает десятки проб на каждое
     движение мыши, и getImageData на каждую пробу съел бы кадр. */
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      const w = 720, h = Math.round((w * img.naturalHeight) / img.naturalWidth);
      const cv = document.createElement('canvas');
      cv.width = w; cv.height = h;
      const cx = cv.getContext('2d', { willReadFrequently: true });
      if (!cx) return;
      cx.imageSmoothingEnabled = false;
      cx.drawImage(img, 0, 0, w, h);
      mask.current = { data: cx.getImageData(0, 0, w, h).data, w, h };
    };
    img.src = PLAN_NIGHT;
  }, []);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    let lastX: number | null = null, lastY = 0, lastT = 0, side = 1;

    const isFloor = (fx: number, fy: number) => {
      const m = mask.current;
      if (!m) return true;
      const mx = Math.min(m.w - 1, Math.max(0, Math.round(fx * m.w)));
      const my = Math.min(m.h - 1, Math.max(0, Math.round(fy * m.h)));
      return m.data[(my * m.w + mx) * 4 + 3] < 40;   // нет альфы = пол
    };

    /* Идём по отрезку и продвигаемся ровно настолько, насколько пускает план:
       упёрлись — встаём вплотную. Проверка одной конечной точки стену не
       держит: по обе стороны перегородки пол, и рывок мышью переносит
       жителя в соседнюю комнату. */
    const advance = (x0: number, y0: number, x1: number, y1: number, r: DOMRect) => {
      const d = Math.hypot(x1 - x0, y1 - y0);
      const n = Math.max(1, Math.ceil(d / 2));
      let px = x0, py = y0, moved = false;
      for (let i = 1; i <= n; i += 1) {
        const t = i / n, cx = x0 + (x1 - x0) * t, cy = y0 + (y1 - y0) * t;
        if (!isFloor(cx / r.width, cy / r.height)) break;
        px = cx; py = cy; moved = true;
      }
      return moved ? { x: px, y: py } : null;
    };

    const onMove = (e: PointerEvent) => {
      const r = stage.getBoundingClientRect();
      const x = e.clientX - r.left, y = e.clientY - r.top;
      const now = performance.now();
      /* Позиция жителя обязана быть проходимой: если курсор вошёл над стеной,
         он оказался бы внутри неё и не сдвинулся бы уже никогда. */
      if (lastX === null || !isFloor(lastX / r.width, lastY / r.height)) {
        if (isFloor(x / r.width, y / r.height)) { lastX = x; lastY = y; lastT = now; }
        return;
      }
      const dx = x - lastX, dy = y - lastY;
      if (Math.hypot(dx, dy) < 8 || now - lastT < 80) return;

      let adv = advance(lastX, lastY, x, y, r);
      /* Скольжение вдоль препятствия: прямой ход упёрся — пробуем составляющие
         по осям. Без этого житель встаёт у первой же стены навсегда: курсор
         уходит дальше, и каждый следующий отрезок упирается в ту же преграду,
         а внешне это читается как полное отсутствие следов. */
      if (!adv || Math.hypot(adv.x - x, adv.y - y) > 2) {
        const from = adv ?? { x: lastX, y: lastY };
        const byX = advance(from.x, from.y, x, from.y, r) ?? from;
        const byY = advance(byX.x, byX.y, byX.x, y, r) ?? byX;
        const gain = (c: { x: number; y: number }) => Math.hypot(c.x - lastX!, c.y - lastY);
        if (!adv || gain(byY) > gain(adv)) adv = byY;
      }
      if (!adv || (adv.x === lastX && adv.y === lastY)) return;
      const step = Math.hypot(adv.x - lastX, adv.y - lastY);
      lastX = adv.x; lastY = adv.y; lastT = now;
      if (step < 8) return;

      const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
      const perp = ((angle + 90) * Math.PI) / 180, off = 2 * side;
      const fx = adv.x + Math.cos(perp) * off, fy = adv.y + Math.sin(perp) * off;
      if (!isFloor(fx / r.width, fy / r.height)) return;

      const el = document.createElement('div');
      el.className = 'footprint';
      el.innerHTML = FOOT;
      el.style.left = `${fx}px`; el.style.top = `${fy}px`;
      /* svg нарисован носком вверх, поэтому к направлению шага прибавляем 90°:
         без этого след разворачивается мимо движения и «идёт боком». */
      const svg = el.querySelector('svg');
      if (svg) svg.style.transform = `rotate(${angle + 90}deg) scaleX(${side > 0 ? 1 : -1})`;
      stage.appendChild(el);
      requestAnimationFrame(() => el.classList.add('fade'));
      setTimeout(() => el.remove(), 1500);
      side *= -1;
    };

    const onLeave = () => { lastX = null; };
    stage.addEventListener('pointermove', onMove);
    stage.addEventListener('pointerleave', onLeave);
    return () => {
      stage.removeEventListener('pointermove', onMove);
      stage.removeEventListener('pointerleave', onLeave);
    };
  }, []);

  const active = SCENES.find((s) => s.id === scene);

  return (
    <div>
      <div role="group" aria-label="Сценарии умного дома: выберите, что показать на плане"
        style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '10px 0 14px' }}>
        {SCENES.map((s) => (
          <button key={s.id} type="button" className="scen-btn"
            aria-pressed={scene === s.id} onClick={() => setScene(s.id)}
            style={{ padding: '10px 15px', minHeight: 44, borderRadius: 999, cursor: 'pointer',
              border: `1px solid ${scene === s.id ? 'var(--accent-ink)' : 'var(--line)'}` }}>
            {s.label}
          </button>
        ))}
      </div>

      <div ref={stageRef} id="houseStage" className={`house-stage is-${scene}`}
        role="img" aria-label={`План дома, сценарий «${active?.label}». ${active?.note}`} />

      <p style={{ color: 'var(--muted)', fontSize: 14.5 }} aria-live="polite">{active?.note}</p>
    </div>
  );
}
