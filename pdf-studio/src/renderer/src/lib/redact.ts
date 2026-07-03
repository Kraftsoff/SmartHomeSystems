/**
 * True redaction. Covering content with a black box (see the `redact` case in
 * `bakeAnnotations`) hides it visually but leaves the underlying text in the
 * file. To remove it permanently we rasterize each affected page — with the
 * black boxes already baked in — and replace the vector page with that image,
 * so nothing recoverable remains under the redaction.
 */
import { PDFDocument } from 'pdf-lib'
import { loadPdfDocument } from './pdf'

/** Render resolution for redacted pages (2 = ~144 DPI at typical page sizes). */
const RASTER_SCALE = 2

async function canvasToPng(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  if (!blob) throw new Error('Не удалось растрировать страницу')
  return new Uint8Array(await blob.arrayBuffer())
}

/**
 * Rasterize the given pages of `bytes` and replace each with a flat image,
 * permanently destroying any content beneath the (already baked) redaction
 * boxes. Pages not listed are left untouched as vector content.
 */
export async function flattenRedactionPages(
  bytes: Uint8Array,
  pageIndices: number[]
): Promise<Uint8Array> {
  const unique = Array.from(new Set(pageIndices)).filter((i) => i >= 0)
  if (unique.length === 0) return bytes

  const pdfjsDoc = await loadPdfDocument(bytes)
  const libDoc = await PDFDocument.load(bytes, { ignoreEncryption: true })

  try {
    for (const pageIndex of unique) {
      if (pageIndex >= libDoc.getPageCount()) continue
      const page = await pdfjsDoc.getPage(pageIndex + 1)
      const viewport = page.getViewport({ scale: RASTER_SCALE })

      const canvas = document.createElement('canvas')
      canvas.width = Math.floor(viewport.width)
      canvas.height = Math.floor(viewport.height)
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('Не удалось получить 2D-контекст canvas')
      await page.render({ canvasContext: ctx, viewport }).promise

      const png = await canvasToPng(canvas)
      const img = await libDoc.embedPng(png)

      // Visual page size in PDF points (viewport already accounts for rotation).
      const visualW = viewport.width / RASTER_SCALE
      const visualH = viewport.height / RASTER_SCALE

      // Insert the flat image page in place of the original (rotation 0 — the
      // rasterized image already reflects the page's display orientation).
      const newPage = libDoc.insertPage(pageIndex, [visualW, visualH])
      newPage.drawImage(img, { x: 0, y: 0, width: visualW, height: visualH })
      libDoc.removePage(pageIndex + 1)
    }
  } finally {
    pdfjsDoc.destroy()
  }

  return libDoc.save({ useObjectStreams: false })
}
