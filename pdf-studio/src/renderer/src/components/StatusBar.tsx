interface StatusBarProps {
  name: string
  path: string | null
  isDirty: boolean
  currentPage: number
  numPages: number
  annotationCount: number
}

/** Bottom status bar with file and document info. */
export function StatusBar({
  name,
  path,
  isDirty,
  currentPage,
  numPages,
  annotationCount
}: StatusBarProps): JSX.Element {
  return (
    <div className="status-bar">
      <span className="status-name" title={path ?? 'Не сохранён'}>
        {name || 'Без названия'}
        {isDirty ? ' • не сохранено' : ''}
      </span>
      <span className="status-spacer" />
      {annotationCount > 0 && (
        <span className="status-item">Аннотаций: {annotationCount}</span>
      )}
      <span className="status-item">
        Страница {currentPage + 1} из {numPages}
      </span>
    </div>
  )
}
