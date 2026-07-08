import { useMemo, useState } from 'react'
import type { Annotation } from '../lib/annotations'

interface CommentsPanelProps {
  annotations: Annotation[]
  onJumpToPage(pageIndex: number): void
  onDelete(id: string): void
  onClose(): void
}

const TYPE_LABELS: Record<Annotation['type'], string> = {
  highlight: 'Выделение',
  rect: 'Прямоугольник',
  ink: 'Рисунок',
  text: 'Текст',
  // Underline/strikethrough are committed as 'line' annotations (see
  // AnnotationLayer.commitLine), so there is no separate underline/
  // strikethrough Annotation type to label here.
  line: 'Линия / подчёркивание / зачёркивание / стрелка',
  image: 'Подпись / изображение',
  stamp: 'Штамп',
  whiteout: 'Забелка',
  redact: 'Редакция'
}

const TYPE_ICONS: Partial<Record<Annotation['type'], string>> = {
  highlight: '🖍',
  rect: '▭',
  ink: '✏️',
  text: 'T',
  line: '／',
  image: '✒',
  stamp: '🔖',
  whiteout: '⬜',
  redact: '⬛'
}

/** A short human-readable snippet describing what this markup contains. */
function snippet(ann: Annotation): string {
  switch (ann.type) {
    case 'text':
      return ann.text
    case 'stamp':
      return ann.text
    default:
      return TYPE_LABELS[ann.type] ?? ann.type
  }
}

/**
 * Aggregate view of every annotation across the document — a comments/
 * markup management panel in the spirit of Acrobat's Comments List /
 * Foxit's markup summary. Click a row to jump to its page; the checkmark
 * deletes it directly, without needing to find it on the page first.
 */
export function CommentsPanel({
  annotations,
  onJumpToPage,
  onDelete,
  onClose
}: CommentsPanelProps): JSX.Element {
  const [filter, setFilter] = useState<Annotation['type'] | 'all'>('all')

  const types = useMemo(() => {
    const seen = new Set<Annotation['type']>()
    annotations.forEach((a) => seen.add(a.type))
    return Array.from(seen)
  }, [annotations])

  const sorted = useMemo(
    () =>
      [...annotations]
        .filter((a) => filter === 'all' || a.type === filter)
        .sort((a, b) => a.pageIndex - b.pageIndex),
    [annotations, filter]
  )

  return (
    <aside className="form-panel comments-panel">
      <div className="form-panel-header">
        <span>Комментарии и разметка ({annotations.length})</span>
        <button className="tbtn icon" onClick={onClose} title="Закрыть">
          ✕
        </button>
      </div>

      {types.length > 1 && (
        <div className="comments-panel-filter">
          <select
            className="form-input"
            value={filter}
            onChange={(e) => setFilter(e.target.value as Annotation['type'] | 'all')}
          >
            <option value="all">Все типы ({annotations.length})</option>
            {types.map((t) => (
              <option key={t} value={t}>
                {TYPE_LABELS[t] ?? t} ({annotations.filter((a) => a.type === t).length})
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="form-panel-body comments-panel-list">
        {sorted.length === 0 && (
          <div className="form-empty">
            {annotations.length === 0 ? 'В документе нет разметки.' : 'Нет разметки этого типа.'}
          </div>
        )}
        {sorted.map((ann) => (
          <button
            key={ann.id}
            className="comment-row"
            onClick={() => onJumpToPage(ann.pageIndex)}
            title="Перейти к странице"
          >
            <span className="comment-row-swatch" style={{ background: ann.color }} />
            <span className="comment-row-icon">{TYPE_ICONS[ann.type] ?? '•'}</span>
            <span className="comment-row-body">
              <span className="comment-row-type">{TYPE_LABELS[ann.type] ?? ann.type}</span>
              <span className="comment-row-snippet">{snippet(ann)}</span>
            </span>
            <span className="comment-row-page">стр. {ann.pageIndex + 1}</span>
            <span
              className="comment-row-delete"
              role="button"
              tabIndex={0}
              title="Удалить"
              onClick={(e) => {
                e.stopPropagation()
                onDelete(ann.id)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.stopPropagation()
                  onDelete(ann.id)
                }
              }}
            >
              ✕
            </span>
          </button>
        ))}
      </div>
    </aside>
  )
}
