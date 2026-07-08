import { useEffect, useState } from 'react'
import type { PdfDocumentProxy } from '../lib/pdf'

interface InfoModalProps {
  pdfDoc: PdfDocumentProxy | null
  numPages: number
  name: string
  onClose(): void
}

interface DocProps {
  title: string
  author: string
  creator: string
  producer: string
  firstPageSize: string
}

const SHORTCUTS: Array<{ keys: string; action: string }> = [
  { keys: 'Ctrl+O', action: 'Открыть' },
  { keys: 'Ctrl+S', action: 'Сохранить' },
  { keys: 'Ctrl+Shift+S', action: 'Сохранить как…' },
  { keys: 'Ctrl+Z / Ctrl+Shift+Z', action: 'Отменить / Повторить' },
  { keys: 'Ctrl+F', action: 'Поиск по тексту' },
  { keys: 'Ctrl + + / −', action: 'Масштаб' },
  { keys: 'Ctrl+0', action: 'Масштаб 100%' },
  { keys: 'PageUp / PageDown', action: 'Листание страниц' },
  { keys: 'Ctrl+R', action: 'Повернуть страницу' },
  { keys: 'Ctrl+Backspace', action: 'Удалить страницу' }
]

/** Modal with document properties and a keyboard-shortcut reference. */
export function InfoModal({ pdfDoc, numPages, name, onClose }: InfoModalProps): JSX.Element {
  const [tab, setTab] = useState<'props' | 'keys'>('props')
  const [props, setProps] = useState<DocProps | null>(null)

  useEffect(() => {
    if (!pdfDoc) return
    let cancelled = false
    Promise.all([pdfDoc.getMetadata(), pdfDoc.getPage(1)]).then(([meta, page]) => {
      if (cancelled) return
      const info = (meta.info ?? {}) as Record<string, unknown>
      const vp = page.getViewport({ scale: 1 })
      const str = (v: unknown): string => (typeof v === 'string' && v ? v : '—')
      setProps({
        title: str(info.Title),
        author: str(info.Author),
        creator: str(info.Creator),
        producer: str(info.Producer),
        firstPageSize: `${Math.round(vp.width)} × ${Math.round(vp.height)} pt`
      })
    })
    return () => {
      cancelled = true
    }
  }, [pdfDoc])

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">Сведения</div>
        <div className="modal-tabs">
          <button className={tab === 'props' ? 'active' : ''} onClick={() => setTab('props')}>
            Свойства
          </button>
          <button className={tab === 'keys' ? 'active' : ''} onClick={() => setTab('keys')}>
            Горячие клавиши
          </button>
        </div>

        {tab === 'props' && (
          <table className="props-table">
            <tbody>
              <tr>
                <td>Файл</td>
                <td>{name || 'Без названия'}</td>
              </tr>
              <tr>
                <td>Страниц</td>
                <td>{numPages}</td>
              </tr>
              <tr>
                <td>Заголовок</td>
                <td>{props?.title ?? '…'}</td>
              </tr>
              <tr>
                <td>Автор</td>
                <td>{props?.author ?? '…'}</td>
              </tr>
              <tr>
                <td>Создано в</td>
                <td>{props?.creator ?? '…'}</td>
              </tr>
              <tr>
                <td>Producer</td>
                <td>{props?.producer ?? '…'}</td>
              </tr>
              <tr>
                <td>Размер 1-й стр.</td>
                <td>{props?.firstPageSize ?? '…'}</td>
              </tr>
            </tbody>
          </table>
        )}

        {tab === 'keys' && (
          <table className="props-table">
            <tbody>
              {SHORTCUTS.map((s) => (
                <tr key={s.keys}>
                  <td>{s.keys}</td>
                  <td>{s.action}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div className="modal-actions">
          <span className="spacer" />
          <button className="btn-ghost" onClick={onClose}>
            Закрыть
          </button>
        </div>
      </div>
    </div>
  )
}
