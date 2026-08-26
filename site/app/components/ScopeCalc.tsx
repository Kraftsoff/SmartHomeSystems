'use client';
import { useState } from 'react';

/* Калькулятор состава работ, а не сметы. Цену он не называет намеренно:
   методика не подтверждена, а придуманное число читается как обязательство.
   Опубликованный порог показывается отдельно и с пометкой — это позиция
   компании, а не расчёт по введённым данным. */
const SYSTEMS = [
  ['light', 'Свет и сценарии'], ['climate', 'Отопление и охлаждение'],
  ['vent', 'Вентиляция и увлажнение'], ['leaks', 'Защита от протечек'],
  ['curtains', 'Шторы и карнизы'], ['security', 'Охрана и видеонаблюдение'],
  ['access', 'Домофон и доступ'], ['multiroom', 'Мультирум и кино'],
  ['power', 'Резервное питание'], ['outdoor', 'Фасад, ландшафт, полив'],
] as const;

const STAGES = [
  ['design', 'Идёт проектирование'], ['rough', 'Черновые работы'],
  ['finish', 'Чистовая отделка'], ['done', 'Ремонт закончен'],
] as const;

const LAY: Record<string, string[]> = {
  design: ['трассы под датчики, приводы и панели — в раздел электрики до согласования',
    'место в щите с запасом под модули автоматики',
    'питание у окон под приводы штор, пока не закрыты стены'],
  rough: ['кабель до каждой группы света и до каждого окна — сейчас или никогда без вскрытия',
    'ниша под щит с вентиляцией и доступом для обслуживания',
    'гильзы между этажами под линии, которых пока нет в бюджете'],
  finish: ['проводным остаётся то, что уже проложено; остальное — беспроводное',
    'панели ставятся в готовые подрозетники, новые точки требуют штробы по чистовой',
    'приводы штор — только там, где питание у окна заложено заранее'],
  done: ['беспроводные датчики и приводы с элементами питания',
    'замена выключателей на умные там, где в подрозетнике есть нейтраль',
    'проводные линии — только со вскрытием отделки, это отдельный ремонт'],
};

const RISK: Record<string, string> = {
  design: 'Инженерию согласовывают после дизайн-проекта — тогда карнизы и акустика идут поверх готовых потолков.',
  rough: 'Кабель кладут «по типовой схеме» без расчёта групп — новый сценарий света потом требует новой линии.',
  finish: 'Ожидание проводного результата от беспроводной системы: батарейки, задержки и радио в многоквартирном доме.',
  done: 'Обещание «доделаем потом без потерь» — после отделки часть решений уже недоступна ни за какие деньги.',
};

export default function ScopeCalc() {
  const [stage, setStage] = useState<string>('design');
  const [picked, setPicked] = useState<string[]>([]);

  const toggle = (k: string) =>
    setPicked((p) => (p.includes(k) ? p.filter((x) => x !== k) : [...p, k]));

  return (
    <div id="calc" style={{ margin: '20px 0' }}>
      <div className="card">
        <h3>Что сейчас на объекте</h3>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', margin: '10px 0 18px' }}>
          {STAGES.map(([k, label]) => (
            <button key={k} type="button" onClick={() => setStage(k)}
              aria-pressed={stage === k}
              style={{ padding: '9px 14px', borderRadius: 10, cursor: 'pointer',
                border: `1px solid ${stage === k ? 'var(--accent-ink)' : 'var(--line)'}` }}>
              {label}
            </button>
          ))}
        </div>

        <h3>Какие системы нужны</h3>
        <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit,minmax(230px,1fr))', marginTop: 10 }}>
          {SYSTEMS.map(([k, label]) => (
            <label key={k} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14.5 }}>
              <input type="checkbox" checked={picked.includes(k)} onChange={() => toggle(k)} />
              {label}
            </label>
          ))}
        </div>
      </div>

      <div className="card calc-out" aria-live="polite" style={{ marginTop: 14 }}>
        {picked.length === 0 ? (
          <p>Отметьте, какие системы нужны — покажу состав работ и что важно на вашей стадии.</p>
        ) : (
          <>
            <p style={{ color: 'var(--ink)' }}>
              <strong>{picked.length}</strong> {picked.length === 1 ? 'система' : 'систем'} на стадии
              «{STAGES.find(([k]) => k === stage)?.[1].toLowerCase()}»
            </p>
            <h4 style={{ margin: '14px 0 6px' }}>Что закладывать сейчас</h4>
            <ul>{LAY[stage].map((x, i) => <li key={i}>{x}</li>)}</ul>
            <h4 style={{ margin: '14px 0 6px' }}>Чем это срывается</h4>
            <p>{RISK[stage]}</p>
          </>
        )}
        <p style={{ marginTop: 16 }}>
          Ориентир по нижней границе для премиальных объектов — от 2–3 млн ₽{' '}
          <span className="prov">⚠️ порог уточняется</span>
        </p>
      </div>
    </div>
  );
}
