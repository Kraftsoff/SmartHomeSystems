/**
 * Thin wrapper around pdf.js used for rendering. The worker is wired up via
 * Vite's `?url` import so it is bundled correctly in both dev and production.
 */
import * as pdfjsLib from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl

export type PdfDocumentProxy = pdfjsLib.PDFDocumentProxy
export type PdfPageProxy = pdfjsLib.PDFPageProxy

/**
 * Load a PDF document from raw bytes. pdf.js transfers/detaches the buffer it is
 * given, so we always hand it a copy to keep the caller's `Uint8Array` intact.
 */
export async function loadPdfDocument(data: Uint8Array): Promise<PdfDocumentProxy> {
  const copy = data.slice()
  const task = pdfjsLib.getDocument({ data: copy })
  return task.promise
}

export interface RenderedPage {
  /** Page width in CSS pixels at the requested scale. */
  width: number
  /** Page height in CSS pixels at the requested scale. */
  height: number
}

/**
 * Render a single page onto a canvas at the given scale, accounting for device
 * pixel ratio so the output stays crisp on high-DPI displays.
 */
export async function renderPageToCanvas(
  page: PdfPageProxy,
  canvas: HTMLCanvasElement,
  scale: number
): Promise<RenderedPage> {
  const dpr = window.devicePixelRatio || 1
  const viewport = page.getViewport({ scale })
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Не удалось получить 2D-контекст canvas')

  canvas.width = Math.floor(viewport.width * dpr)
  canvas.height = Math.floor(viewport.height * dpr)
  canvas.style.width = `${Math.floor(viewport.width)}px`
  canvas.style.height = `${Math.floor(viewport.height)}px`

  const renderViewport = dpr === 1 ? viewport : page.getViewport({ scale: scale * dpr })
  await page.render({ canvasContext: context, viewport: renderViewport }).promise

  return { width: viewport.width, height: viewport.height }
}

/** Base (unscaled) size of a page in PDF points. */
export async function getPageBaseSize(
  doc: PdfDocumentProxy,
  pageIndex: number
): Promise<{ width: number; height: number }> {
  const page = await doc.getPage(pageIndex + 1)
  const vp = page.getViewport({ scale: 1 })
  return { width: vp.width, height: vp.height }
}

/** Render a page to PNG bytes at the given scale (for image export). */
export async function renderPageToPng(
  page: PdfPageProxy,
  scale: number
): Promise<Uint8Array> {
  const viewport = page.getViewport({ scale })
  const canvas = document.createElement('canvas')
  canvas.width = Math.floor(viewport.width)
  canvas.height = Math.floor(viewport.height)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Не удалось получить 2D-контекст canvas')
  await page.render({ canvasContext: ctx, viewport }).promise

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  if (!blob) throw new Error('Не удалось создать PNG')
  return new Uint8Array(await blob.arrayBuffer())
}

export interface TextMatch {
  pageIndex: number
}

/**
 * Search every page for `query` (case-insensitive) and return the set of page
 * indices that contain it. Used by the simple find bar.
 */
export async function findPagesWithText(
  doc: PdfDocumentProxy,
  query: string
): Promise<number[]> {
  const needle = query.trim().toLowerCase()
  if (!needle) return []
  const matches: number[] = []
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const content = await page.getTextContent()
    const text = content.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ')
      .toLowerCase()
    if (text.includes(needle)) matches.push(i - 1)
  }
  return matches
}
