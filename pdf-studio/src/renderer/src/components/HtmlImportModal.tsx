import { useState } from 'react'

interface HtmlImportModalProps {
  onOpenFile(): Promise<void>
  onOpenUrl(url: string): Promise<void>
  onOpenForEdit(): Promise<void>
  onClose(): void
}

/** Modal offering the two ways to import HTML: a local file or a URL. */
export function HtmlImportModal({
  onOpenFile,
  onOpenUrl,
  onOpenForEdit,
  onClose
}: HtmlImportModalProps): JSX.Element {
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = async (fn: () => Promise<void>): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      await fn()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось преобразовать страницу')
    } finally {
      setBusy(false)
    }
  }

  const submitUrl = (): void => {
    const trimmed = url.trim()
    if (!trimmed) return
    const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
    void run(() => onOpenUrl(withProtocol))
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">Открыть HTML / презентацию</div>
        <p className="tool-options-hint" style={{ marginBottom: 14 }}>
          Страница будет преобразована в PDF (постранично — для reveal.js и
          похожих презентаций автоматически по одному слайду на страницу), после
          чего её можно размечать, рисовать и редактировать как обычный PDF.
        </p>

        <div className="export-section">
          <div className="export-title">Локальный файл (.html)</div>
          <button
            className="btn-primary sm"
            disabled={busy}
            onClick={() => void run(onOpenFile)}
          >
            Выбрать файл…
          </button>
        </div>

        <div className="export-section">
          <div className="export-title">Адрес страницы (URL)</div>
          <div className="export-range">
            <input
              className="form-input"
              style={{ flex: '1 1 auto', minWidth: 260 }}
              placeholder="example.com/slides.html"
              value={url}
              disabled={busy}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submitUrl()
              }}
            />
            <button className="btn-primary sm" disabled={busy || !url.trim()} onClick={submitUrl}>
              Открыть
            </button>
          </div>
        </div>

        <div className="export-section" style={{ borderBottom: 'none' }}>
          <div className="export-title">Редактировать HTML напрямую (live, без PDF)</div>
          <p className="tool-options-hint" style={{ marginBottom: 8 }}>
            Открывает исходный код страницы в редакторе с живым предпросмотром и
            сохраняет правки обратно в тот же .html — без преобразования в PDF.
          </p>
          <button className="btn-ghost sm" disabled={busy} onClick={() => void run(onOpenForEdit)}>
            Редактировать HTML…
          </button>
        </div>

        {busy && <div className="upload-error" style={{ color: 'var(--text-dim)' }}>Преобразование…</div>}
        {error && <div className="upload-error">{error}</div>}

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
