'use client';
import { useState } from 'react';

/* Форма заявки. Обязательное здесь не оформление, а два свойства:
   без отметки согласия отправка невозможна (ст. 9 ФЗ-152), и у полей с
   личными данными объявлено назначение (WCAG 1.3.5) — иначе браузер не
   подставит сохранённое, а вспомогательные технологии не скажут, что просят. */
export default function LeadForm() {
  const [sent, setSent] = useState(false);

  return (
    <form
      id="leadForm"
      onSubmit={(e) => { e.preventDefault(); setSent(true); }}
      style={{ display: 'grid', gap: 14, maxWidth: 620 }}
    >
      <label>
        Как к вам обращаться
        <input name="name" required autoComplete="name" placeholder="Имя"
          style={{ width: '100%', padding: '10px 12px', marginTop: 6 }} />
      </label>
      <label>
        Телефон
        <input name="tel" type="tel" required autoComplete="tel" placeholder="+7"
          style={{ width: '100%', padding: '10px 12px', marginTop: 6 }} />
      </label>
      <label>
        Город или посёлок
        <input name="city" autoComplete="address-level2" placeholder="Город / посёлок"
          style={{ width: '100%', padding: '10px 12px', marginTop: 6 }} />
      </label>
      <label>
        Площадь объекта, м²
        <input name="area" inputMode="numeric" placeholder="например, 180"
          style={{ width: '100%', padding: '10px 12px', marginTop: 6 }} />
      </label>
      <label>
        Стадия объекта
        <select name="stage" style={{ width: '100%', padding: '10px 12px', marginTop: 6 }}>
          <option>Идёт проектирование</option>
          <option>Черновые работы</option>
          <option>Чистовая отделка</option>
          <option>Ремонт закончен</option>
        </select>
      </label>

      <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <input type="checkbox" id="lead-consent" name="consent" required style={{ marginTop: 4 }} />
        <span>
          Даю согласие на обработку персональных данных, чтобы MiMiSmart ответил на обращение
          и сделал расчёт по объекту. <a href="/privacy/">Политика обработки данных</a>
        </span>
      </label>

      <button type="submit" style={{ padding: '12px 18px', borderRadius: 10, cursor: 'pointer' }}>
        Отправить заявку
      </button>

      {sent && (
        <p role="status" className="prov">
          ⚠️ приёмник заявки не подключён: нужен выбор CRM и договор поручения на обработку
        </p>
      )}
    </form>
  );
}
