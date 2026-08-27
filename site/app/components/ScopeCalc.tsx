'use client';
import { useState } from 'react';

/* Калькулятор состава работ. Сознательно НЕ считает деньги: без техзадания
   любая цифра была бы выдуманной. Считает то, что определяется однозначно —
   состав систем, что закладывать на текущей стадии и чем эта стадия рискует.

   Отдельно — порог квалификации. Если объект меньше того, с чем компания
   работает, он говорит об этом сразу, а не после часа переписки. Ни у одного
   игрока рынка такого на сайте нет: там площадь спрашивают, чтобы перезвонить. */

const OBJECTS: Array<[string, string]> = [
  ['flat', 'Квартира'], ['house', 'Дом / коттедж'], ['office', 'Офис / коммерция'],
];
const STAGES: Array<[string, string]> = [
  ['design', 'Идёт проектирование'], ['rough', 'Черновые работы, стены открыты'],
  ['finish', 'Чистовая отделка'], ['done', 'Ремонт закончен, живём'],
];
const DESIGNS: Array<[string, string]> = [
  ['yes', 'Есть, утверждён'], ['progress', 'В работе'], ['no', 'Нет'],
];
const SYS: Array<[string, string]> = [
  ['light', 'Свет и сценарии'], ['climate', 'Климат и отопление'],
  ['vent', 'Вентиляция и увлажнение'], ['curtains', 'Шторы и карнизы'],
  ['leak', 'Защита от протечек'], ['security', 'Охрана и видеонаблюдение'],
  ['av', 'Мультирум и кинозал'], ['net', 'Wi-Fi и слаботочка'],
  ['power', 'Резервное питание, ДГУ'], ['gates', 'Ворота, участок, полив'],
];

const STAGE: Record<string, { n: string; lay: string[]; risk: string }> = {
  design: {
    n: 'проектирование',
    lay: ['трассы под датчики, приводы и панели — в раздел электрики',
      'место и габарит щита автоматизации до расстановки мебели',
      'точки Wi-Fi и слаботочку по комнатам'],
    risk: 'Лучшая стадия: всё уходит в конструктив, переделок нет. Дороже станет с каждым следующим этапом.',
  },
  rough: {
    n: 'черновые работы',
    lay: ['кабель до каждой точки, пока штробы открыты',
      'резерв линий в щите под будущее расширение',
      'закладные под электрокарнизы и питание приводов'],
    risk: 'Ещё можно всё. Решение по составу систем нужно принять до закрытия стен — после штукатурки добавление линии означает повторную отделку.',
  },
  finish: {
    n: 'чистовая отделка',
    lay: ['то, что ещё не зашито: подрозетники, ниши карнизов',
      'радиорешения там, где кабель уже не проложить'],
    risk: 'Часть решений пойдёт поверх — с демонтажом и доплатой. Приводы штор без заложенного питания и DALI без шины к светильникам вернуть без вскрытия не получится.',
  },
  done: {
    n: 'ремонт закончен',
    lay: ['реле в подрозетники за существующие выключатели',
      'радиодатчики и сценарии на уже проложенной проводке'],
    risk: 'Результат будет слабее, чем при закладке до отделки — это честная оценка, а не оговорка. Новые силовые группы и DALI к светильникам без шины не появятся без вскрытия стен.',
  },
};

const SYSNOTE: Record<string, string> = {
  vent: 'Увлажнение после чистовой — временная трасса и риск сырых пятен на откосах.',
  curtains: 'Приводу нужно питание в карнизе: если его не заложили, кабель пойдёт по стене.',
  av: 'Кинозалу нужна отдельная вентиляция и вынесенная стойка оборудования.',
  power: 'ДГУ требует согласования с щитом: приоритетные группы и автозапуск.',
  leak: 'Краны на вводе ставятся в узел, к которому нужен доступ для обслуживания.',
  gates: 'Кабель до ворот и полива кладут до благоустройства участка.',
};

export default function ScopeCalc() {
  const [obj, setObj] = useState('flat');
  const [area, setArea] = useState('');
  const [stage, setStage] = useState('design');
  const [design, setDesign] = useState('yes');
  const [picked, setPicked] = useState<string[]>([]);

  const toggle = (k: string) =>
    setPicked((p) => (p.includes(k) ? p.filter((x) => x !== k) : [...p, k]));

  const st = STAGE[stage];
  const n = picked.length;
  const word = n === 1 ? 'система' : n < 5 ? 'системы' : 'систем';
  const m = parseInt(area, 10) || 0;
  const min = obj === 'house' ? 300 : obj === 'flat' ? 80 : 0;
  const notes = picked.filter((p) => SYSNOTE[p]);

  return (
    <div id="calc" className="calc">
      <div className="calc-in">
        <fieldset className="calc-fs">
          <legend>Объект</legend>
          <label>Тип объекта
            <select className="field" value={obj} onChange={(e) => setObj(e.target.value)}>
              {OBJECTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </label>
          <label>Площадь, м²
            <input className="field" type="number" inputMode="numeric" min={0} step={10}
              placeholder="например, 180" value={area} onChange={(e) => setArea(e.target.value)} />
          </label>
        </fieldset>

        <fieldset className="calc-fs">
          <legend>Стадия</legend>
          {/* Стадия — кнопками, а не списком: выбранное состояние объявлено
              разметкой и видно без раскрытия. */}
          <div className="filter">
            {STAGES.map(([k, l]) => (
              <button key={k} type="button" className="chip" aria-pressed={stage === k}
                onClick={() => setStage(k)}>{l}</button>
            ))}
          </div>
          <label>Дизайн-проект
            <select className="field" value={design} onChange={(e) => setDesign(e.target.value)}>
              {DESIGNS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </label>
        </fieldset>
      </div>

      <fieldset className="calc-fs">
        <legend>Что нужно</legend>
        <div className="picks">
          {SYS.map(([k, l]) => (
            <label key={k} className="check">
              <input type="checkbox" checked={picked.includes(k)} onChange={() => toggle(k)} />
              <span>{l}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="card calc-out" role="status" aria-live="polite">
        {n === 0 ? (
          <p>Отметьте, какие системы нужны — покажу состав работ и что важно на вашей стадии.</p>
        ) : (
          <>
            <h3>{n} {word} на стадии «{st.n}»{m ? `, ${m} м²` : ''}</h3>

            {m > 0 && min > 0 && m < min && (
              <div className="calc-risk">
                Ваша площадь ниже порога, с которым мы работаем
                ({obj === 'house' ? 'дома от 300 м²' : 'квартиры от 80 м²'}{' '}
                <span className="prov">⚠️ порог уточняется</span>).
                Инженерный проект окупается числом независимых зон, а не площадью — на меньшем
                объекте состав систем обычно не набирается. Скажем об этом сразу, чтобы
                не тратить ваше время.
              </div>
            )}

            <h4>Что закладывать сейчас</h4>
            <ul>{st.lay.map((x) => <li key={x}>{x}</li>)}</ul>

            {notes.length > 0 && (
              <>
                <h4>По выбранным системам</h4>
                <ul>{notes.map((p) => <li key={p}>{SYSNOTE[p]}</li>)}</ul>
              </>
            )}

            <div className="calc-risk"><b>Риск вашей стадии.</b> {st.risk}</div>

            {design === 'no' && (stage === 'design' || stage === 'rough') && (
              <div className="calc-risk">
                Дизайн-проекта нет. Инженерное задание можно начать и без него, но расстановку
                клавиш, датчиков и светильников придётся согласовывать дважды — сначала
                с планировкой, потом с дизайном.
              </div>
            )}

            <h4>Что дальше</h4>
            <ul>
              <li>Цена считается после техзадания: она зависит от стадии, числа независимых
                зон и класса оборудования — <a href="/pricing/">из чего складывается смета →</a></li>
              <li>Ориентир по нижней границе для премиальных объектов — от 2–3 млн ₽{' '}
                <span className="prov">⚠️ порог уточняется</span></li>
            </ul>
            <div className="actions">
              <a className="btn btn-primary" href="/contacts/">Отправить эти данные инженеру</a>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
