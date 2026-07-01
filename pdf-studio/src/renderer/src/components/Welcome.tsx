import type { RecentFile } from '../../../shared/ipc'

interface WelcomeProps {
  onOpen(): void
  recentFiles: RecentFile[]
  onOpenRecent(path: string): void
}

/** Empty-state screen shown before any document is opened. */
export function Welcome({ onOpen, recentFiles, onOpenRecent }: WelcomeProps): JSX.Element {
  return (
    <div className="welcome">
      <div className="welcome-card">
        <div className="welcome-logo">📄</div>
        <h1>PDF Studio</h1>
        <p className="welcome-sub">Удобный и комфортный PDF-редактор для Windows</p>
        <button className="welcome-open" onClick={onOpen}>
          Открыть PDF
        </button>

        {recentFiles.length > 0 && (
          <div className="welcome-recent">
            <div className="welcome-recent-title">Недавние файлы</div>
            <ul className="welcome-recent-list">
              {recentFiles.map((f) => (
                <li key={f.path}>
                  <button
                    type="button"
                    className="welcome-recent-item"
                    title={f.path}
                    onClick={() => onOpenRecent(f.path)}
                  >
                    <span className="welcome-recent-icon">📄</span>
                    <span className="welcome-recent-name">{f.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <ul className="welcome-features">
          <li>Просмотр, навигация, миниатюры и поиск по тексту</li>
          <li>Аннотации: выделение, подчёркивание, зачёркивание, рисование, заметки, фигуры, стрелки</li>
          <li>Страницы: поворот, удаление, дублирование, перестановка, вставка PDF</li>
          <li>Экспорт страницы в PNG, извлечение страницы, отмена/повтор, сохранение</li>
        </ul>
        <p className="welcome-hint">Подсказка: перетащите PDF-файл в окно, чтобы открыть его.</p>
      </div>
    </div>
  )
}
