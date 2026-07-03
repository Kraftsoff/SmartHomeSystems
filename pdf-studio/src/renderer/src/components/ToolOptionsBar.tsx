import { STAMP_PRESETS, resolveStampText, type StampPreset, type Tool } from '../lib/annotations'
import type { PendingImage } from './AnnotationLayer'

interface ToolOptionsBarProps {
  tool: Tool
  stampPreset: StampPreset
  onStampPreset(preset: StampPreset): void
  pendingImage: PendingImage | null
  onCreateSignature(): void
}

/**
 * Secondary bar under the toolbar that shows options for the active tool:
 * stamp presets, the signature source, or a redaction hint.
 */
export function ToolOptionsBar({
  tool,
  stampPreset,
  onStampPreset,
  pendingImage,
  onCreateSignature
}: ToolOptionsBarProps): JSX.Element | null {
  if (tool === 'stamp') {
    return (
      <div className="tool-options">
        <span className="tool-options-label">Штамп:</span>
        {STAMP_PRESETS.map((p) => (
          <button
            key={p.id}
            className={`stamp-chip ${stampPreset.id === p.id ? 'active' : ''}`}
            style={{ color: p.color, borderColor: p.color }}
            onClick={() => onStampPreset(p)}
          >
            {resolveStampText(p.text)}
          </button>
        ))}
        <span className="tool-options-hint">Кликните по странице, чтобы поставить штамп</span>
      </div>
    )
  }

  if (tool === 'signature') {
    return (
      <div className="tool-options">
        <button className="btn-primary sm" onClick={onCreateSignature}>
          {pendingImage ? 'Изменить подпись' : 'Создать подпись'}
        </button>
        {pendingImage ? (
          <>
            <img className="signature-preview" src={pendingImage.dataUrl} alt="подпись" />
            <span className="tool-options-hint">Кликните по странице, чтобы вставить подпись</span>
          </>
        ) : (
          <span className="tool-options-hint">Нарисуйте или загрузите изображение подписи</span>
        )}
      </div>
    )
  }

  if (tool === 'redact') {
    return (
      <div className="tool-options">
        <span className="tool-options-warn">⚠ Редакция</span>
        <span className="tool-options-hint">
          Выделите область — при сохранении содержимое под ней будет удалено безвозвратно
          (страница растрируется).
        </span>
      </div>
    )
  }

  if (tool === 'whiteout') {
    return (
      <div className="tool-options">
        <span className="tool-options-label">Забелка:</span>
        <span className="tool-options-hint">
          Выделите область, чтобы закрыть содержимое белым. Добавьте сверху текст для замены.
        </span>
      </div>
    )
  }

  return null
}
