'use client';
import { useState } from 'react';

/* Форма заявки. Обязательное здесь не оформление, а два свойства:
   без отметки согласия отправка невозможна (ст. 9 ФЗ-152), и у полей с
   личными данными объявлено назначение (WCAG 1.3.5) — иначе браузер не
   подставит сохранённое, а вспомогательные технологии не скажут, что просят. */
export default function LeadForm() {
  const [sent, setSent] = useState(false);

  return (
    <div className="lead">
      <form
        id="leadForm"
        onSubmit={(e) => { e.preventDefault(); setSent(true); }}
        className="lead-form"
      >
        {/* Короткие поля стоят парами: лентой в один столбец форма из шести
            строк читается как анкета, и до кнопки нужно прокручивать. */}
        <div className="pair">
          <label>Как к вам обращаться
            <input className="field" name="name" required autoComplete="name" placeholder="Имя" />
          </label>
          <label>Телефон
            <input className="field" name="tel" type="tel" required autoComplete="tel" placeholder="+7" />
          </label>
        </div>
        <div className="pair">
          <label>Город или посёлок
            <input className="field" name="city" autoComplete="address-level2" placeholder="Город / посёлок" />
          </label>
          <label>Площадь объекта, м²
            <input className="field" name="area" inputMode="numeric" placeholder="например, 180" />
          </label>
        </div>
        <label>Стадия объекта
          <select className="field" name="stage">
            <option>Идёт проектирование</option>
            <option>Черновые работы</option>
            <option>Чистовая отделка</option>
            <option>Ремонт закончен</option>
          </select>
        </label>

        <label className="check">
          <input type="checkbox" id="lead-consent" name="consent" required />
          <span>
            Даю согласие на обработку персональных данных, чтобы MiMiSmart ответил на обращение
            и сделал расчёт по объекту. <a href="/privacy/">Политика обработки данных</a>
          </span>
        </label>

        <div className="actions">
          <button type="submit" className="btn btn-primary">Отправить заявку</button>
        </div>

        {sent && (
          <p role="status" className="prov">
            ⚠️ приёмник заявки не подключён: нужен выбор CRM и договор поручения на обработку
          </p>
        )}
      </form>

      {/* Что будет после отправки. Незнание этого — причина, по которой форму
          закрывают: человек не понимает, звонок ему сейчас упадёт или письмо,
          и во что это его обяжет. Ни у одного игрока на рынке этого нет. */}
      <aside className="lead-after">
        <h3>Что дальше</h3>
        <ol>
          <li>Инженер смотрит площадь, стадию и состав систем и даёт вилку по объекту.</li>
          <li>Разговор — по телефону или в переписке, как вам удобнее. Выезд не нужен.</li>
          <li>Оценка ни к чему не обязывает: договора на этом шаге нет.</li>
        </ol>
        <p className="prov">⚠️ подтвердить: срок ответа на заявку в рабочие часы</p>
      </aside>
    </div>
  );
}
