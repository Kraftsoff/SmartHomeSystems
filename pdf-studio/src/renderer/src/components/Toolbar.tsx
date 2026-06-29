import type { Tool } from '../lib/annotations'
import { DEFAULT_COLORS } from '../lib/annotations'

interface ToolbarProps {
  hasDocument: boolean
  isDirty: boolean
  canUndo: boolean
  canRedo: boolean
  tool: Tool
  color: string
  scale: number
  currentPage: number
  numPages: number

  onOpen(): void
  onSave(): void
  onSaveAs(): void
  onUndo(): void
  onRedo(): void
  onToolChange(tool: Tool): void
  onColorChange(color: string): void
  onZoomIn(): void
  onZoomOut(): void
  onZoomReset(): void
  onPrevPage(): void
  onNextPage(): void
  onGoToPage(index: number): void
  onRotate(): void
  onDeletePage(): void
  onToggleFind(): void
}

const TOOLS: Array<{ id: Tool; label: string; icon: string }> = [
  { id: 'select', label: 'Выбор', icon: '⟲' },
  { id: 'highlight', label: 'Выделение', icon: '🖍' },
  { id: 'ink', label: 'Карандаш', icon: '✏️' },
  { id: 'text', label: 'Текст', icon: 'T' },
  { id: 'rect', label: 'Прямоугольник', icon: '▭' }
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
    currentPage,
    numPages
  } = props

  return (
    <div className="toolbar">
      <div className="toolbar-group">
        <button className="tbtn" onClick={props.onOpen} title="Открыть (Ctrl+O)">
          📂 Открыть
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
          Сохранить как…
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
          className="tbtn"
          onClick={props.onZoomReset}
          disabled={!hasDocument}
          title="Сбросить масштаб"
        >
          {Math.round(scale * 100)}%
        </button>
        <button className="tbtn icon" onClick={props.onZoomIn} disabled={!hasDocument} title="Увеличить">
          +
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
        <button className="tbtn icon" onClick={props.onRotate} disabled={!hasDocument} title="Повернуть страницу">
          ⟳
        </button>
        <button
          className="tbtn icon"
          onClick={props.onDeletePage}
          disabled={!hasDocument || numPages <= 1}
          title="Удалить страницу"
        >
          🗑
        </button>
        <button className="tbtn icon" onClick={props.onToggleFind} disabled={!hasDocument} title="Найти (Ctrl+F)">
          🔍
        </button>
      </div>
    </div>
  )
}
