import { PHONE, PHONE_HREF } from '@/lib/nav';

/* Блок следующего шага. Знает, где стоит, и не предлагает уйти туда, где
   человек уже находится: на странице цен вторая кнопка вела на страницу цен,
   на контактах первая — на контакты. Нажатие перезагружало то же место.
   Действие, ведущее в себя, — это тупик под видом кнопки. */
export default function NextSteps({ here }: { here: string }) {
  const calc = here !== '/contacts/';
  const scope = here !== '/pricing/';
  return (
    <div className="next">
      <h2>Что дальше</h2>
      <p>Назовите площадь, стадию объекта и нужные системы — инженер даст вилку
        по объекту без выезда. Оценка ни к чему не обязывает.</p>
      <div className="actions">
        {calc
          ? <a className="btn btn-primary" href="/contacts/">Рассчитать проект</a>
          : <a className="btn btn-primary" href={PHONE_HREF}>Позвонить {PHONE}</a>}
        {scope && <a className="btn btn-ghost" href="/pricing/">Из чего складывается смета</a>}
      </div>
    </div>
  );
}
