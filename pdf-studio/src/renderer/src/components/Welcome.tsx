interface WelcomeProps {
  onOpen(): void
}

/** Empty-state screen shown before any document is opened. */
export function Welcome({ onOpen }: WelcomeProps): JSX.Element {
  return (
    <div className="welcome">
      <div className="welcome-card">
        <div className="welcome-logo">📄</div>
        <h1>PDF Studio</h1>
        <p className="welcome-sub">Удобный и комфортный PDF-редактор для Windows</p>
        <button className="welcome-open" onClick={onOpen}>
          Открыть PDF
        </button>
        <ul className="welcome-features">
          <li>Просмотр, навигация, миниатюры и поиск по тексту</li>
          <li>Аннотации: выделение, рисование, заметки, фигуры</li>
          <li>Операции со страницами: поворот, удаление, перестановка</li>
          <li>Отмена/повтор и сохранение в PDF</li>
        </ul>
        <p className="welcome-hint">Подсказка: перетащите PDF-файл в окно, чтобы открыть его.</p>
      </div>
    </div>
  )
}
