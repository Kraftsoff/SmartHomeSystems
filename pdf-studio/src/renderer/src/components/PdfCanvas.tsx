import { useEffect, useRef, useState } from 'react'
import { renderPageToCanvas, type PdfDocumentProxy } from '../lib/pdf'

export interface PageSize {
  width: number
  height: number
}

interface PdfCanvasProps {
  doc: PdfDocumentProxy
  pageIndex: number
  scale: number
  /** Reports the rendered CSS size so overlays can match it exactly. */
  onSized?: (size: PageSize) => void
}

/**
 * Renders one PDF page to a canvas at the given scale. Re-renders when the page
 * or zoom changes; guards against out-of-order async renders.
 */
export function PdfCanvas({ doc, pageIndex, scale, onSized }: PdfCanvasProps): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const canvas = canvasRef.current
    if (!canvas) return

    doc
      .getPage(pageIndex + 1)
      .then(async (page) => {
        if (cancelled) return
        const size = await renderPageToCanvas(page, canvas, scale)
        if (cancelled) return
        setError(null)
        onSized?.(size)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Ошибка рендеринга страницы')
      })

    return () => {
      cancelled = true
    }
    // onSized intentionally excluded — it is a stable callback from the parent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, pageIndex, scale])

  if (error) {
    return <div className="page-error">Не удалось отобразить страницу: {error}</div>
  }

  return <canvas ref={canvasRef} className="pdf-canvas" />
}
