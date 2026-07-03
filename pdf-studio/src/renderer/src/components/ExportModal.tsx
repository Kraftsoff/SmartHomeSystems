import { useState } from 'react'

interface ExportModalProps {
  numPages: number
  onExportRange(fromIndex: number, toIndex: number): Promise<void>
  onExportAllPng(): Promise<void>
  onClose(): void
}

/** Dialog for exporting a page range to PDF or all pages to PNG images. */
export function ExportModal({
  numPages,
  onExportRange,
  onExportAllPng,
  onClose
}: ExportModalProps): JSX.Element {
  const [from, setFrom] = useState(1)
  const [to, setTo] = useState(numPages)
  const [busy, setBusy] = useState(false)

  const clamp = (v: number): number => Math.min(numPages, Math.max(1, v))

  const run = async (fn: () => Promise<void>): Promise<void> => {
    setBusy(true)
    try {
      await fn()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">Экспорт</div>

        <div className="export-section">
          <div className="export-title">Диапазон страниц в новый PDF</div>
          <div className="export-range">
            <label>
              с
              <input
                type="number"
                min={1}
                max={numPages}
                value={from}
                onChange={(e) => setFrom(clamp(Number(e.target.value)))}
              />
            </label>
            <label>
              по
              <input
                type="number"
                min={1}
                max={numPages}
                value={to}
                onChange={(e) => setTo(clamp(Number(e.target.value)))}
              />
            </label>
            <button
              className="btn-primary sm"
              disabled={busy}
              onClick={() => void run(() => onExportRange(from - 1, to - 1))}
            >
              Экспорт в PDF
            </button>
          </div>
        </div>

        <div className="export-section">
          <div className="export-title">Все страницы в изображения</div>
          <button
            className="btn-primary sm"
            disabled={busy}
            onClick={() => void run(onExportAllPng)}
          >
            Экспорт всех страниц в PNG
          </button>
        </div>

        <div className="modal-actions">
          <span className="spacer" />
          <button className="btn-ghost" onClick={onClose} disabled={busy}>
            Закрыть
          </button>
        </div>
      </div>
    </div>
  )
}
