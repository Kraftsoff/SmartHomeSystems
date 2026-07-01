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

export type Annotation =
  | HighlightAnnotation
  | RectAnnotation
  | InkAnnotation
  | TextAnnotation
  | LineAnnotation

let idCounter = 0
/** Monotonic id generator (avoids Math.random / Date.now for determinism). */
export function nextAnnotationId(): string {
  idCounter += 1
  return `a${idCounter}`
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
