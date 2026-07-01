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
  // Normalize to a positive multiple of 90 so stored rotation never drifts negative.
  page.setRotation(degrees((((current + delta) % 360) + 360) % 360))
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
  const doc = await load(bytes)
  const count = doc.getPageCount()
  if (from < 0 || from >= count || to < 0 || to >= count) return bytes

  // Move in place by detaching and re-inserting the same page object. Unlike
  // rebuilding via copyPages, this preserves the document's AcroForm (fillable
  // fields), outlines/bookmarks and any page-level interactive annotations.
  const page = doc.getPage(from)
  doc.removePage(from)
  doc.insertPage(to, page)
  return save(doc)
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

  const pageCount = doc.getPageCount()

  for (const ann of annotations) {
    // Skip annotations whose page no longer exists rather than throwing and
    // aborting the whole save (getPage throws on an out-of-range index).
    if (ann.pageIndex < 0 || ann.pageIndex >= pageCount) continue
    const page = doc.getPage(ann.pageIndex)
    const { width: pw, height: ph } = page.getSize()
    const { r, g, b } = hexToRgb01(ann.color)
    const color = rgb(r, g, b)

    // Renderer coordinates are normalized against the *visual* (rotation-aware)
    // page, with a top-left origin. Map them into the page's unrotated user
    // space (bottom-left origin) so drawing stays aligned on rotated pages.
    const rot = (((page.getRotation().angle % 360) + 360) % 360) as 0 | 90 | 180 | 270
    const visualHeight = rot === 90 || rot === 270 ? pw : ph
    const mapNorm = (nx: number, ny: number): { x: number; y: number } => {
      let ux: number
      let uy: number
      switch (rot) {
        case 90:
          ux = ny
          uy = 1 - nx
          break
        case 180:
          ux = 1 - nx
          uy = 1 - ny
          break
        case 270:
          ux = 1 - ny
          uy = nx
          break
        default:
          ux = nx
          uy = ny
      }
      return { x: ux * pw, y: ph - uy * ph }
    }
    const mapRect = (
      x: number,
      y: number,
      w: number,
      h: number
    ): { x: number; y: number; width: number; height: number } => {
      const p1 = mapNorm(x, y)
      const p2 = mapNorm(x + w, y + h)
      return {
        x: Math.min(p1.x, p2.x),
        y: Math.min(p1.y, p2.y),
        width: Math.abs(p2.x - p1.x),
        height: Math.abs(p2.y - p1.y)
      }
    }

    switch (ann.type) {
      case 'highlight': {
        page.drawRectangle({ ...mapRect(ann.x, ann.y, ann.w, ann.h), color, opacity: 0.35 })
        break
      }
      case 'rect': {
        page.drawRectangle({
          ...mapRect(ann.x, ann.y, ann.w, ann.h),
          borderColor: color,
          borderWidth: ann.lineWidth,
          opacity: 0
        })
        break
      }
      case 'ink': {
        for (let i = 1; i < ann.points.length; i++) {
          page.drawLine({
            start: mapNorm(ann.points[i - 1].x, ann.points[i - 1].y),
            end: mapNorm(ann.points[i].x, ann.points[i].y),
            thickness: ann.lineWidth,
            color
          })
        }
        break
      }
      case 'text': {
        const size = ann.fontSize
        // Drop from the click point (text top) to the baseline by ~ the ascent,
        // expressed in the visual page's coordinate space, then map.
        const baselineNy = ann.y + (size * 0.8) / visualHeight
        const anchor = mapNorm(ann.x, baselineNy)
        page.drawText(ann.text, {
          x: anchor.x,
          y: anchor.y,
          size,
          font,
          color,
          // Counter the page's display rotation so text stays upright.
          rotate: degrees(rot)
        })
        break
      }
      case 'line': {
        const start = mapNorm(ann.x1, ann.y1)
        const end = mapNorm(ann.x2, ann.y2)
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
