import type { Tool } from '../lib/annotations'
import { DEFAULT_COLORS } from '../lib/annotations'
import type { Theme } from '../hooks/useTheme'
import type { ZoomMode } from '../hooks/useZoom'

interface ToolbarProps {
  hasDocument: boolean
  isDirty: boolean
  canUndo: boolean
  canRedo: boolean
  tool: Tool
  color: string
  scale: number
  zoomMode: ZoomMode
  currentPage: number
  numPages: number
  theme: Theme

  onOpen(): void
  onOpenHtml(): void
  onSave(): void
  onSaveAs(): void
  onUndo(): void
  onRedo(): void
  onToolChange(tool: Tool): void
  onColorChange(color: string): void
  onZoomIn(): void
  onZoomOut(): void
  onZoomActual(): void
  onFitWidth(): void
  onFitPage(): void
  onPrevPage(): void
  onNextPage(): void
  onGoToPage(index: number): void
  onRotate(): void
  onDeletePage(): void
  onDuplicatePage(): void
  onInsertPdf(): void
  onExtractPage(): void
  onExportPng(): void
  onToggleFind(): void
  onToggleTheme(): void
  onPrint(): void
  onExport(): void
  onToggleForms(): void
  onShowInfo(): void
}

const TOOLS: Array<{ id: Tool; label: string; icon: string }> = [
  { id: 'select', label: 'Выбор / удаление', icon: '🖱' },
  { id: 'highlight', label: 'Выделение', icon: '🖍' },
  { id: 'underline', label: 'Подчёркивание', icon: 'U' },
  { id: 'strikethrough', label: 'Зачёркивание', icon: 'S' },
  { id: 'ink', label: 'Карандаш', icon: '✏️' },
  { id: 'text', label: 'Текст', icon: 'T' },
  { id: 'rect', label: 'Прямоугольник', icon: '▭' },
  { id: 'line', label: 'Линия', icon: '／' },
  { id: 'arrow', label: 'Стрелка', icon: '↗' },
  { id: 'signature', label: 'Подпись', icon: '✒' },
  { id: 'stamp', label: 'Штамп', icon: '🔖' },
  { id: 'whiteout', label: 'Забелка', icon: '⬜' },
  { id: 'redact', label: 'Редакция', icon: '⬛' }
]

export function Toolbar(props: ToolbarProps): JSX.Element {
  const {
    hasDocument,
    isDirty,
    canUndo,
    canRedo,
    tool,
    color,
    scale,
    zoomMode,
    currentPage,
    numPages,
    theme
  } = props

  return (
    <div className="toolbar">
      <div className="toolbar-group">
        <button className="tbtn" onClick={props.onOpen} title="Открыть (Ctrl+O)">
          📂 Открыть
        </button>
        <button className="tbtn" onClick={props.onOpenHtml} title="Открыть HTML / презентацию">
          🌐 HTML
        </button>
        <button
          className="tbtn"
          onClick={props.onSave}
          disabled={!hasDocument || !isDirty}
          title="Сохранить (Ctrl+S)"
        >
          💾 Сохранить{isDirty ? ' •' : ''}
        </button>
        <button
          className="tbtn"
          onClick={props.onSaveAs}
          disabled={!hasDocument}
          title="Сохранить как (Ctrl+Shift+S)"
        >
          Как…
        </button>
      </div>

      <div className="toolbar-group">
        <button className="tbtn icon" onClick={props.onUndo} disabled={!canUndo} title="Отменить">
          ↶
        </button>
        <button className="tbtn icon" onClick={props.onRedo} disabled={!canRedo} title="Повторить">
          ↷
        </button>
      </div>

      <div className="toolbar-group tools">
        {TOOLS.map((t) => (
          <button
            key={t.id}
            className={`tbtn icon ${tool === t.id ? 'active' : ''}`}
            onClick={() => props.onToolChange(t.id)}
            disabled={!hasDocument}
            title={t.label}
          >
            {t.icon}
          </button>
        ))}
      </div>

      <div className="toolbar-group colors">
        {DEFAULT_COLORS.map((c) => (
          <button
            key={c}
            className={`swatch ${color === c ? 'active' : ''}`}
            style={{ background: c }}
            onClick={() => props.onColorChange(c)}
            disabled={!hasDocument}
            title={c}
          />
        ))}
      </div>

      <div className="toolbar-group">
        <button className="tbtn icon" onClick={props.onZoomOut} disabled={!hasDocument} title="Уменьшить">
          −
        </button>
        <button
          className={`tbtn ${zoomMode === 'actual' ? 'active' : ''}`}
          onClick={props.onZoomActual}
          disabled={!hasDocument}
          title="100%"
        >
          {Math.round(scale * 100)}%
        </button>
        <button className="tbtn icon" onClick={props.onZoomIn} disabled={!hasDocument} title="Увеличить">
          +
        </button>
        <button
          className={`tbtn ${zoomMode === 'fit-width' ? 'active' : ''}`}
          onClick={props.onFitWidth}
          disabled={!hasDocument}
          title="По ширине"
        >
          ↔
        </button>
        <button
          className={`tbtn ${zoomMode === 'fit-page' ? 'active' : ''}`}
          onClick={props.onFitPage}
          disabled={!hasDocument}
          title="По странице"
        >
          ⤢
        </button>
      </div>

      <div className="toolbar-group pager">
        <button
          className="tbtn icon"
          onClick={props.onPrevPage}
          disabled={!hasDocument || currentPage <= 0}
          title="Предыдущая страница"
        >
          ‹
        </button>
        <input
          className="page-input"
          type="number"
          min={1}
          max={Math.max(1, numPages)}
          value={hasDocument ? currentPage + 1 : 0}
          onChange={(e) => {
            const v = Number(e.target.value)
            if (!Number.isNaN(v)) props.onGoToPage(v - 1)
          }}
          disabled={!hasDocument}
        />
        <span className="page-total">/ {numPages}</span>
        <button
          className="tbtn icon"
          onClick={props.onNextPage}
          disabled={!hasDocument || currentPage >= numPages - 1}
          title="Следующая страница"
        >
          ›
        </button>
      </div>

      <div className="toolbar-group">
        <button className="tbtn icon" onClick={props.onRotate} disabled={!hasDocument} title="Повернуть страницу (Ctrl+R)">
          ⟳
        </button>
        <button
          className="tbtn icon"
          onClick={props.onDuplicatePage}
          disabled={!hasDocument}
          title="Дублировать страницу"
        >
          ⧉
        </button>
        <button
          className="tbtn icon"
          onClick={props.onDeletePage}
          disabled={!hasDocument || numPages <= 1}
          title="Удалить страницу"
        >
          🗑
        </button>
        <button
          className="tbtn icon"
          onClick={props.onInsertPdf}
          disabled={!hasDocument}
          title="Вставить другой PDF после текущей страницы"
        >
          📎
        </button>
        <button
          className="tbtn icon"
          onClick={props.onExtractPage}
          disabled={!hasDocument}
          title="Извлечь страницу в новый файл"
        >
          ⤓
        </button>
        <button
          className="tbtn icon"
          onClick={props.onExportPng}
          disabled={!hasDocument}
          title="Экспорт страницы в PNG"
        >
          🖼
        </button>
      </div>

      <div className="toolbar-group">
        <button className="tbtn icon" onClick={props.onToggleForms} disabled={!hasDocument} title="Поля формы">
          📝
        </button>
        <button className="tbtn icon" onClick={props.onPrint} disabled={!hasDocument} title="Печать">
          🖨
        </button>
        <button className="tbtn icon" onClick={props.onExport} disabled={!hasDocument} title="Экспорт (диапазон/PNG)">
          📤
        </button>
      </div>

      <div className="toolbar-group">
        <button className="tbtn icon" onClick={props.onToggleFind} disabled={!hasDocument} title="Найти (Ctrl+F)">
          🔍
        </button>
        <button className="tbtn icon" onClick={props.onShowInfo} disabled={!hasDocument} title="Сведения и горячие клавиши">
          ℹ
        </button>
        <button
          className="tbtn icon"
          onClick={props.onToggleTheme}
          title={theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}
        >
          {theme === 'dark' ? '☀' : '🌙'}
        </button>
      </div>
    </div>
  )
}
