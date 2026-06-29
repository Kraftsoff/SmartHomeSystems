import { useEffect, useRef } from 'react'
import type { PdfDocumentProxy } from '../lib/pdf'

interface ThumbnailProps {
  doc: PdfDocumentProxy
  pageIndex: number
  active: boolean
  onSelect(): void
}

const THUMB_WIDTH = 150 // px

/** A small rendered preview of a single page for the sidebar. */
export function Thumbnail({ doc, pageIndex, active, onSelect }: ThumbnailProps): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    let cancelled = false
    doc.getPage(pageIndex + 1).then(async (page) => {
      if (cancelled) return
      const canvas = canvasRef.current
      if (!canvas) return
      const base = page.getViewport({ scale: 1 })
      const scale = THUMB_WIDTH / base.width
      const viewport = page.getViewport({ scale })
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      canvas.width = Math.floor(viewport.width)
      canvas.height = Math.floor(viewport.height)
      await page.render({ canvasContext: ctx, viewport }).promise
    })
    return () => {
      cancelled = true
    }
  }, [doc, pageIndex])

  return (
    <button
      type="button"
      className={`thumbnail ${active ? 'active' : ''}`}
      onClick={onSelect}
      title={`Страница ${pageIndex + 1}`}
    >
      <canvas ref={canvasRef} className="thumbnail-canvas" />
      <span className="thumbnail-label">{pageIndex + 1}</span>
    </button>
  )
}
