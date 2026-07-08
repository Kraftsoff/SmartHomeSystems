/**
 * Annotation model. Coordinates are stored in a normalized, resolution- and
 * zoom-independent form: the origin is the top-left of the page and both axes
 * are expressed as a fraction (0..1) of the page's *unscaled* size. This lets
 * us render at any zoom and bake into the PDF at the page's true dimensions.
 */

export type Tool =
  | 'select'
  | 'highlight'
  | 'underline'
  | 'strikethrough'
  | 'ink'
  | 'text'
  | 'rect'
  | 'line'
  | 'arrow'
  | 'signature'
  | 'stamp'
  | 'redact'
  | 'whiteout'

export type AnnotationColor = string // hex, e.g. '#ffd400'

interface BaseAnnotation {
  id: string
  pageIndex: number
  color: AnnotationColor
}

/** Translucent rectangle used to highlight a region. */
export interface HighlightAnnotation extends BaseAnnotation {
  type: 'highlight'
  x: number
  y: number
  w: number
  h: number
}

/** Opaque outlined rectangle. */
export interface RectAnnotation extends BaseAnnotation {
  type: 'rect'
  x: number
  y: number
  w: number
  h: number
  lineWidth: number
}

/** Freehand stroke captured as a polyline of normalized points. */
export interface InkAnnotation extends BaseAnnotation {
  type: 'ink'
  points: Array<{ x: number; y: number }>
  lineWidth: number
}

/** A text note rendered as plain text at a point. */
export interface TextAnnotation extends BaseAnnotation {
  type: 'text'
  x: number
  y: number
  text: string
  fontSize: number
}

/**
 * A straight line between two points. Used directly for the line/arrow tools
 * and also to represent underline/strikethrough markups (a horizontal line at
 * the bottom or middle of a dragged region). `arrow` adds an arrowhead at the
 * end point.
 */
export interface LineAnnotation extends BaseAnnotation {
  type: 'line'
  x1: number
  y1: number
  x2: number
  y2: number
  lineWidth: number
  arrow: boolean
}

/**
 * A raster image placed on the page — used for image/drawn signatures and
 * logos. `bytes` holds the encoded image for baking; `dataUrl` is for on-screen
 * preview.
 */
export interface ImageAnnotation extends BaseAnnotation {
  type: 'image'
  x: number
  y: number
  w: number
  h: number
  dataUrl: string
  bytes: Uint8Array
  format: 'png' | 'jpg'
}

/** A preset stamp: a coloured, outlined label such as APPROVED / CONFIDENTIAL. */
export interface StampAnnotation extends BaseAnnotation {
  type: 'stamp'
  x: number
  y: number
  w: number
  h: number
  text: string
}

/** An opaque white rectangle used to cover ("white out") existing content. */
export interface WhiteoutAnnotation extends BaseAnnotation {
  type: 'whiteout'
  x: number
  y: number
  w: number
  h: number
}

/**
 * A redaction region. Shown as a solid black box; on save the affected page is
 * rasterized so the underlying content is permanently removed, not just hidden.
 */
export interface RedactAnnotation extends BaseAnnotation {
  type: 'redact'
  x: number
  y: number
  w: number
  h: number
}

export type Annotation =
  | HighlightAnnotation
  | RectAnnotation
  | InkAnnotation
  | TextAnnotation
  | LineAnnotation
  | ImageAnnotation
  | StampAnnotation
  | WhiteoutAnnotation
  | RedactAnnotation

let idCounter = 0
/** Monotonic id generator (avoids Math.random / Date.now for determinism). */
export function nextAnnotationId(): string {
  idCounter += 1
  return `a${idCounter}`
}

export interface StampPreset {
  id: string
  label: string
  color: AnnotationColor
  /** Text shown on the stamp; `__DATE__` is replaced with today's date. */
  text: string
}

export const STAMP_PRESETS: StampPreset[] = [
  { id: 'approved', label: 'APPROVED', color: '#2e7d32', text: 'APPROVED' },
  { id: 'rejected', label: 'REJECTED', color: '#c62828', text: 'REJECTED' },
  { id: 'confidential', label: 'CONFIDENTIAL', color: '#c62828', text: 'CONFIDENTIAL' },
  { id: 'draft', label: 'DRAFT', color: '#616161', text: 'DRAFT' },
  { id: 'reviewed', label: 'REVIEWED', color: '#1565c0', text: 'REVIEWED' },
  { id: 'date', label: 'Дата', color: '#1565c0', text: '__DATE__' }
]

/** Resolve a stamp preset's text, substituting today's date where requested. */
export function resolveStampText(text: string): string {
  if (!text.includes('__DATE__')) return text
  const now = new Date()
  const stamp = now.toLocaleDateString('ru-RU', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  })
  return text.replace('__DATE__', stamp)
}

export const DEFAULT_COLORS: AnnotationColor[] = [
  '#ffd400', // yellow
  '#ff5252', // red
  '#4caf50', // green
  '#2196f3', // blue
  '#9c27b0', // purple
  '#212121' // near-black
]

/** Convert a hex color to the 0..1 RGB triple pdf-lib expects. */
export function hexToRgb01(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace('#', '')
  const value =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean
  const r = parseInt(value.slice(0, 2), 16) / 255
  const g = parseInt(value.slice(2, 4), 16) / 255
  const b = parseInt(value.slice(4, 6), 16) / 255
  return { r, g, b }
}
