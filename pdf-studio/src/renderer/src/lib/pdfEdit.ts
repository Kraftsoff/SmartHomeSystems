/**
 * Structural PDF editing and annotation "baking", all powered by pdf-lib.
 * Every function takes the current document bytes and returns *new* bytes,
 * which keeps the undo/redo history a simple stack of immutable snapshots.
 */
import { PDFDocument, degrees, rgb, StandardFonts } from 'pdf-lib'
import {
  type Annotation,
  hexToRgb01
} from './annotations'

async function load(bytes: Uint8Array): Promise<PDFDocument> {
  return PDFDocument.load(bytes, { ignoreEncryption: true })
}

async function save(doc: PDFDocument): Promise<Uint8Array> {
  return doc.save({ useObjectStreams: false })
}

/** Rotate a single page by `delta` degrees (multiples of 90). */
export async function rotatePage(
  bytes: Uint8Array,
  pageIndex: number,
  delta: number
): Promise<Uint8Array> {
  const doc = await load(bytes)
  const page = doc.getPage(pageIndex)
  const current = page.getRotation().angle
  page.setRotation(degrees((current + delta) % 360))
  return save(doc)
}

/** Remove a page. Refuses to delete the last remaining page. */
export async function deletePage(
  bytes: Uint8Array,
  pageIndex: number
): Promise<Uint8Array> {
  const doc = await load(bytes)
  if (doc.getPageCount() <= 1) return bytes
  doc.removePage(pageIndex)
  return save(doc)
}

/** Move a page from `from` to `to` (both 0-based indices). */
export async function movePage(
  bytes: Uint8Array,
  from: number,
  to: number
): Promise<Uint8Array> {
  if (from === to) return bytes
  const src = await load(bytes)
  const count = src.getPageCount()
  if (from < 0 || from >= count || to < 0 || to >= count) return bytes

  // Rebuild a fresh document with pages in the new order. Copying preserves
  // each page's content and rotation.
  const order = Array.from({ length: count }, (_, i) => i)
  const [moved] = order.splice(from, 1)
  order.splice(to, 0, moved)

  const out = await PDFDocument.create()
  const copied = await out.copyPages(src, order)
  copied.forEach((p) => out.addPage(p))
  return save(out)
}

/** Append all pages of `otherBytes` to the end of the document. */
export async function appendPdf(
  bytes: Uint8Array,
  otherBytes: Uint8Array
): Promise<Uint8Array> {
  const doc = await load(bytes)
  const other = await load(otherBytes)
  const copied = await doc.copyPages(other, other.getPageIndices())
  copied.forEach((p) => doc.addPage(p))
  return save(doc)
}

/** Insert all pages of `otherBytes` immediately after `afterIndex`. */
export async function insertPdfAt(
  bytes: Uint8Array,
  otherBytes: Uint8Array,
  afterIndex: number
): Promise<Uint8Array> {
  const doc = await load(bytes)
  const other = await load(otherBytes)
  const copied = await doc.copyPages(other, other.getPageIndices())
  copied.forEach((p, i) => doc.insertPage(afterIndex + 1 + i, p))
  return save(doc)
}

/** Duplicate the page at `pageIndex`, placing the copy right after it. */
export async function duplicatePage(
  bytes: Uint8Array,
  pageIndex: number
): Promise<Uint8Array> {
  const doc = await load(bytes)
  const [copy] = await doc.copyPages(doc, [pageIndex])
  doc.insertPage(pageIndex + 1, copy)
  return save(doc)
}

/** Extract a single page into a new one-page PDF and return its bytes. */
export async function extractPage(
  bytes: Uint8Array,
  pageIndex: number
): Promise<Uint8Array> {
  const src = await load(bytes)
  const out = await PDFDocument.create()
  const [copied] = await out.copyPages(src, [pageIndex])
  out.addPage(copied)
  return save(out)
}

/**
 * Bake renderer annotations into the PDF content. Annotation coordinates are
 * normalized with a top-left origin; PDF uses a bottom-left origin, so the y
 * axis is flipped here against each page's true (unrotated) size.
 */
export async function bakeAnnotations(
  bytes: Uint8Array,
  annotations: Annotation[]
): Promise<Uint8Array> {
  if (annotations.length === 0) return bytes
  const doc = await load(bytes)
  const font = await doc.embedFont(StandardFonts.Helvetica)

  for (const ann of annotations) {
    const page = doc.getPage(ann.pageIndex)
    if (!page) continue
    const { width: pw, height: ph } = page.getSize()
    const { r, g, b } = hexToRgb01(ann.color)
    const color = rgb(r, g, b)

    switch (ann.type) {
      case 'highlight': {
        page.drawRectangle({
          x: ann.x * pw,
          y: ph - (ann.y + ann.h) * ph,
          width: ann.w * pw,
          height: ann.h * ph,
          color,
          opacity: 0.35
        })
        break
      }
      case 'rect': {
        page.drawRectangle({
          x: ann.x * pw,
          y: ph - (ann.y + ann.h) * ph,
          width: ann.w * pw,
          height: ann.h * ph,
          borderColor: color,
          borderWidth: ann.lineWidth,
          opacity: 0
        })
        break
      }
      case 'ink': {
        for (let i = 1; i < ann.points.length; i++) {
          const a = ann.points[i - 1]
          const c = ann.points[i]
          page.drawLine({
            start: { x: a.x * pw, y: ph - a.y * ph },
            end: { x: c.x * pw, y: ph - c.y * ph },
            thickness: ann.lineWidth,
            color
          })
        }
        break
      }
      case 'text': {
        const size = ann.fontSize
        page.drawText(ann.text, {
          x: ann.x * pw,
          // Shift down by the cap height so the click point is the text's top.
          y: ph - ann.y * ph - size,
          size,
          font,
          color
        })
        break
      }
      case 'line': {
        const start = { x: ann.x1 * pw, y: ph - ann.y1 * ph }
        const end = { x: ann.x2 * pw, y: ph - ann.y2 * ph }
        page.drawLine({ start, end, thickness: ann.lineWidth, color })
        if (ann.arrow) {
          // Draw a simple two-stroke arrowhead at the end point.
          const angle = Math.atan2(end.y - start.y, end.x - start.x)
          const headLen = 10 + ann.lineWidth * 2
          const spread = Math.PI / 7
          for (const sign of [1, -1]) {
            const a = angle + Math.PI - sign * spread
            page.drawLine({
              start: end,
              end: { x: end.x + headLen * Math.cos(a), y: end.y + headLen * Math.sin(a) },
              thickness: ann.lineWidth,
              color
            })
          }
        }
        break
      }
    }
  }

  return save(doc)
}

/** Page count without fully rendering — used for quick metadata. */
export async function getPageCount(bytes: Uint8Array): Promise<number> {
  const doc = await load(bytes)
  return doc.getPageCount()
}
