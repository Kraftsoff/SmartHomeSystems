import { useState } from 'react'
import {
  DEFAULT_COLORS,
  STAMP_PRESETS,
  resolveStampText,
  type StampPreset,
  type Tool
} from '../lib/annotations'
import type { PendingImage } from './AnnotationLayer'

interface ToolOptionsBarProps {
  tool: Tool
  stampPreset: StampPreset
  onStampPreset(preset: StampPreset): void
  pendingImage: PendingImage | null
  onCreateSignature(): void
  customStamps: StampPreset[]
  onAddCustomStamp(label: string, color: string): StampPreset
  onRemoveCustomStamp(id: string): void
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
  onCreateSignature,
  customStamps,
  onAddCustomStamp,
  onRemoveCustomStamp
}: ToolOptionsBarProps): JSX.Element | null {
  const [creating, setCreating] = useState(false)
  const [label, setLabel] = useState('')
  const [color, setColor] = useState(DEFAULT_COLORS[0])

  if (tool === 'stamp') {
    const submit = (): void => {
      const trimmed = label.trim()
      if (!trimmed) return
      const preset = onAddCustomStamp(trimmed.toUpperCase(), color)
      onStampPreset(preset)
      setLabel('')
      setCreating(false)
    }

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
        {customStamps.map((p) => (
          <span key={p.id} className="stamp-chip-wrap">
            <button
              className={`stamp-chip ${stampPreset.id === p.id ? 'active' : ''}`}
              style={{ color: p.color, borderColor: p.color }}
              onClick={() => onStampPreset(p)}
            >
              {resolveStampText(p.text)}
            </button>
            <button
              className="stamp-chip-remove"
              title="Удалить штамп"
              onClick={() => onRemoveCustomStamp(p.id)}
            >
              ✕
            </button>
          </span>
        ))}

        {!creating && (
          <button className="tbtn icon" title="Создать свой штамп" onClick={() => setCreating(true)}>
            +
          </button>
        )}
        {creating && (
          <span className="stamp-create">
            <input
              className="form-input"
              style={{ width: 120 }}
              placeholder="Текст штампа"
              value={label}
              autoFocus
              onChange={(e) => setLabel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submit()
                if (e.key === 'Escape') setCreating(false)
              }}
            />
            {DEFAULT_COLORS.map((c) => (
              <button
                key={c}
                className={`swatch ${color === c ? 'active' : ''}`}
                style={{ background: c }}
                onClick={() => setColor(c)}
              />
            ))}
            <button className="btn-primary sm" disabled={!label.trim()} onClick={submit}>
              Добавить
            </button>
            <button className="btn-ghost sm" onClick={() => setCreating(false)}>
              Отмена
            </button>
          </span>
        )}

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
