import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import {
  type Annotation,
  type LineAnnotation,
  type Tool,
  nextAnnotationId
} from '../lib/annotations'
import type { PageSize } from './PdfCanvas'

interface AnnotationLayerProps {
  pageIndex: number
  size: PageSize
  /** Current zoom; used to size strokes/text expressed in PDF points. */
  scale: number
  tool: Tool
  color: string
  annotations: Annotation[]
  onCommit(ann: Annotation): void
  onDelete(id: string): void
}

interface DragBox {
  x0: number
  y0: number
  x1: number
  y1: number
}

const DEFAULT_LINE_WIDTH = 2 // PDF points
const DEFAULT_FONT_SIZE = 18 // PDF points

/** Tools that draw by dragging a rectangle over a region. */
const RECT_TOOLS: Tool[] = ['highlight', 'rect', 'underline', 'strikethrough']
/** Tools that draw a straight segment from a start to an end point. */
const LINE_TOOLS: Tool[] = ['line', 'arrow']

/**
 * Interactive overlay that both renders existing annotations and captures new
 * ones. All geometry is kept in normalized page coordinates (0..1) so it is
 * independent of zoom; point-based sizes (stroke width, font) are multiplied by
 * `scale` for display.
 */
export function AnnotationLayer(props: AnnotationLayerProps): JSX.Element {
  const { pageIndex, size, scale, tool, color, annotations, onCommit, onDelete } = props
  const svgRef = useRef<SVGSVGElement>(null)
  const [drag, setDrag] = useState<DragBox | null>(null)
  const [inkPoints, setInkPoints] = useState<Array<{ x: number; y: number }>>([])
  const [textDraft, setTextDraft] = useState<{ x: number; y: number; value: string } | null>(
    null
  )
  const [selectedId, setSelectedId] = useState<string | null>(null)
  // Ensures a text draft is finalized exactly once: pressing Enter unmounts the
  // input, whose blur would otherwise commit it a second time.
  const textDone = useRef(false)

  const toNorm = (e: ReactPointerEvent): { x: number; y: number } => {
    const rect = svgRef.current!.getBoundingClientRect()
    return {
      x: Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height))
    }
  }

  const isRect = RECT_TOOLS.includes(tool)
  const isLine = LINE_TOOLS.includes(tool)
  const isDrawing = isRect || isLine || tool === 'ink'

  const handlePointerDown = (e: ReactPointerEvent): void => {
    if (textDraft) return
    const p = toNorm(e)

    if (tool === 'text') {
      textDone.current = false
      setTextDraft({ x: p.x, y: p.y, value: '' })
      return
    }
    if (tool === 'select') {
      setSelectedId(null)
      return
    }
    svgRef.current?.setPointerCapture(e.pointerId)
    if (tool === 'ink') {
      setInkPoints([p])
    } else {
      setDrag({ x0: p.x, y0: p.y, x1: p.x, y1: p.y })
    }
  }

  const handlePointerMove = (e: ReactPointerEvent): void => {
    if (!isDrawing) return
    const p = toNorm(e)
    if (tool === 'ink') {
      if (inkPoints.length === 0) return
      setInkPoints((pts) => [...pts, p])
    } else if (drag) {
      setDrag({ ...drag, x1: p.x, y1: p.y })
    }
  }

  const commitLine = (line: Omit<LineAnnotation, 'id' | 'type' | 'pageIndex' | 'color'>): void => {
    onCommit({ id: nextAnnotationId(), type: 'line', pageIndex, color, ...line })
  }

  const handlePointerUp = (e: ReactPointerEvent): void => {
    if (!isDrawing) return
    svgRef.current?.releasePointerCapture(e.pointerId)

    if (tool === 'ink') {
      if (inkPoints.length > 1) {
        onCommit({
          id: nextAnnotationId(),
          type: 'ink',
          pageIndex,
          color,
          points: inkPoints,
          lineWidth: DEFAULT_LINE_WIDTH
        })
      }
      setInkPoints([])
      return
    }

    if (!drag) return
    const x = Math.min(drag.x0, drag.x1)
    const y = Math.min(drag.y0, drag.y1)
    const w = Math.abs(drag.x1 - drag.x0)
    const h = Math.abs(drag.y1 - drag.y0)

    if (isLine) {
      // Ignore accidental zero-length clicks.
      const len = Math.hypot(drag.x1 - drag.x0, drag.y1 - drag.y0)
      if (len > 0.01) {
        commitLine({
          x1: drag.x0,
          y1: drag.y0,
          x2: drag.x1,
          y2: drag.y1,
          lineWidth: DEFAULT_LINE_WIDTH,
          arrow: tool === 'arrow'
        })
      }
    } else if (w > 0.005 && h > 0.005) {
      if (tool === 'highlight') {
        onCommit({ id: nextAnnotationId(), type: 'highlight', pageIndex, color, x, y, w, h })
      } else if (tool === 'rect') {
        onCommit({
          id: nextAnnotationId(),
          type: 'rect',
          pageIndex,
          color,
          x,
          y,
          w,
          h,
          lineWidth: DEFAULT_LINE_WIDTH
        })
      } else if (tool === 'underline' || tool === 'strikethrough') {
        const ly = tool === 'underline' ? y + h : y + h / 2
        commitLine({
          x1: x,
          y1: ly,
          x2: x + w,
          y2: ly,
          lineWidth: DEFAULT_LINE_WIDTH,
          arrow: false
        })
      }
    }
    setDrag(null)
  }

  const finishText = (commit: boolean): void => {
    if (textDone.current) return
    textDone.current = true
    if (commit && textDraft && textDraft.value.trim()) {
      onCommit({
        id: nextAnnotationId(),
        type: 'text',
        pageIndex,
        color,
        x: textDraft.x,
        y: textDraft.y,
        text: textDraft.value,
        fontSize: DEFAULT_FONT_SIZE
      })
    }
    setTextDraft(null)
  }

  const px = (n: number): number => n * size.width
  const py = (n: number): number => n * size.height

  return (
    <div className="annotation-layer" style={{ width: size.width, height: size.height }}>
      <svg
        ref={svgRef}
        width={size.width}
        height={size.height}
        className={`annotation-svg tool-${tool}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        {annotations.map((ann) => renderAnnotation(ann, size, scale, selectedId === ann.id))}

        {/* in-progress previews */}
        {drag && isRect && tool !== 'underline' && tool !== 'strikethrough' && (
          <rect
            x={px(Math.min(drag.x0, drag.x1))}
            y={py(Math.min(drag.y0, drag.y1))}
            width={px(Math.abs(drag.x1 - drag.x0))}
            height={py(Math.abs(drag.y1 - drag.y0))}
            fill={tool === 'highlight' ? color : 'none'}
            fillOpacity={tool === 'highlight' ? 0.35 : 0}
            stroke={color}
            strokeWidth={tool === 'rect' ? DEFAULT_LINE_WIDTH * scale : 0}
            strokeDasharray="4 3"
          />
        )}
        {drag && (tool === 'underline' || tool === 'strikethrough') && (
          <line
            x1={px(Math.min(drag.x0, drag.x1))}
            x2={px(Math.max(drag.x0, drag.x1))}
            y1={py(
              tool === 'underline'
                ? Math.max(drag.y0, drag.y1)
                : (drag.y0 + drag.y1) / 2
            )}
            y2={py(
              tool === 'underline'
                ? Math.max(drag.y0, drag.y1)
                : (drag.y0 + drag.y1) / 2
            )}
            stroke={color}
            strokeWidth={DEFAULT_LINE_WIDTH * scale}
          />
        )}
        {drag && isLine && (
          <line
            x1={px(drag.x0)}
            y1={py(drag.y0)}
            x2={px(drag.x1)}
            y2={py(drag.y1)}
            stroke={color}
            strokeWidth={DEFAULT_LINE_WIDTH * scale}
            strokeLinecap="round"
          />
        )}

        {/* in-progress freehand stroke */}
        {tool === 'ink' && inkPoints.length > 1 && (
          <polyline
            points={inkPoints.map((p) => `${px(p.x)},${py(p.y)}`).join(' ')}
            fill="none"
            stroke={color}
            strokeWidth={DEFAULT_LINE_WIDTH * scale}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}

        {/* clickable hit targets for selection */}
        {tool === 'select' &&
          annotations.map((ann) => (
            <g
              key={`hit-${ann.id}`}
              onPointerDown={(e) => {
                // Stop the svg's own pointerdown (which clears selection) from
                // firing after this and immediately deselecting.
                e.stopPropagation()
                setSelectedId(ann.id)
              }}
            >
              {selectionHitTarget(ann, size)}
            </g>
          ))}
      </svg>

      {/* delete badge for the selected annotation */}
      {tool === 'select' &&
        selectedId &&
        (() => {
          const ann = annotations.find((a) => a.id === selectedId)
          if (!ann) return null
          const anchor = annotationAnchor(ann, size)
          return (
            <button
              type="button"
              className="annotation-delete"
              style={{ left: anchor.x, top: anchor.y }}
              title="Удалить аннотацию"
              onClick={() => {
                onDelete(selectedId)
                setSelectedId(null)
              }}
            >
              ✕
            </button>
          )
        })()}

      {/* inline text editor */}
      {textDraft && (
        <input
          className="annotation-text-input"
          autoFocus
          style={{
            left: textDraft.x * size.width,
            top: textDraft.y * size.height,
            color,
            fontSize: DEFAULT_FONT_SIZE * scale
          }}
          value={textDraft.value}
          placeholder="Введите текст…"
          onChange={(e) => setTextDraft({ ...textDraft, value: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === 'Enter') finishText(true)
            if (e.key === 'Escape') finishText(false)
          }}
          onBlur={() => finishText(true)}
        />
      )}
    </div>
  )
}

/**
 * Arrowhead endpoints for a line drawn in CSS-pixel space. `lineWidth` is in PDF
 * points, so the head length is scaled by the current zoom to match the stroke
 * (which is also rendered at `lineWidth * scale`).
 */
function arrowHead(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  lineWidth: number,
  scale: number
): Array<{ x: number; y: number }> {
  const angle = Math.atan2(y2 - y1, x2 - x1)
  const headLen = (10 + lineWidth * 2) * scale
  const spread = Math.PI / 7
  return [1, -1].map((sign) => {
    const a = angle + Math.PI - sign * spread
    return { x: x2 + headLen * Math.cos(a), y: y2 + headLen * Math.sin(a) }
  })
}

function renderAnnotation(
  ann: Annotation,
  size: PageSize,
  scale: number,
  selected: boolean
): JSX.Element {
  const px = (n: number): number => n * size.width
  const py = (n: number): number => n * size.height
  const selStroke = selected ? '#2196f3' : undefined

  switch (ann.type) {
    case 'highlight':
      return (
        <rect
          key={ann.id}
          x={px(ann.x)}
          y={py(ann.y)}
          width={px(ann.w)}
          height={py(ann.h)}
          fill={ann.color}
          fillOpacity={0.35}
          stroke={selStroke}
          strokeWidth={selected ? 1.5 : 0}
        />
      )
    case 'rect':
      return (
        <rect
          key={ann.id}
          x={px(ann.x)}
          y={py(ann.y)}
          width={px(ann.w)}
          height={py(ann.h)}
          fill="none"
          stroke={selected ? '#2196f3' : ann.color}
          strokeWidth={ann.lineWidth * scale}
        />
      )
    case 'ink':
      return (
        <polyline
          key={ann.id}
          points={ann.points.map((p) => `${px(p.x)},${py(p.y)}`).join(' ')}
          fill="none"
          stroke={selected ? '#2196f3' : ann.color}
          strokeWidth={ann.lineWidth * scale}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )
    case 'line': {
      const x1 = px(ann.x1)
      const y1 = py(ann.y1)
      const x2 = px(ann.x2)
      const y2 = py(ann.y2)
      const stroke = selected ? '#2196f3' : ann.color
      const sw = ann.lineWidth * scale
      return (
        <g key={ann.id}>
          <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={stroke} strokeWidth={sw} strokeLinecap="round" />
          {ann.arrow &&
            arrowHead(x1, y1, x2, y2, ann.lineWidth, scale).map((h, i) => (
              <line
                key={i}
                x1={x2}
                y1={y2}
                x2={h.x}
                y2={h.y}
                stroke={stroke}
                strokeWidth={sw}
                strokeLinecap="round"
              />
            ))}
        </g>
      )
    }
    case 'text':
      return (
        <text
          key={ann.id}
          x={px(ann.x)}
          y={py(ann.y) + ann.fontSize * scale}
          fill={ann.color}
          fontSize={ann.fontSize * scale}
          fontFamily="Helvetica, Arial, sans-serif"
          style={selected ? { outline: '1px solid #2196f3' } : undefined}
        >
          {ann.text}
        </text>
      )
  }
}

/** A larger, transparent shape used purely for easier click selection. */
function selectionHitTarget(ann: Annotation, size: PageSize): JSX.Element {
  const px = (n: number): number => n * size.width
  const py = (n: number): number => n * size.height
  const common = { fill: 'transparent', stroke: 'transparent', strokeWidth: 12 }
  switch (ann.type) {
    case 'highlight':
    case 'rect':
      return (
        <rect x={px(ann.x)} y={py(ann.y)} width={px(ann.w)} height={py(ann.h)} {...common} />
      )
    case 'ink':
      return (
        <polyline points={ann.points.map((p) => `${px(p.x)},${py(p.y)}`).join(' ')} {...common} />
      )
    case 'line':
      return (
        <line x1={px(ann.x1)} y1={py(ann.y1)} x2={px(ann.x2)} y2={py(ann.y2)} {...common} />
      )
    case 'text':
      return (
        <rect
          x={px(ann.x)}
          y={py(ann.y)}
          width={Math.max(40, ann.text.length * ann.fontSize * 0.5)}
          height={ann.fontSize * 1.4}
          {...common}
        />
      )
  }
}

/** Top-left anchor (in CSS px) used to position the delete badge. */
function annotationAnchor(ann: Annotation, size: PageSize): { x: number; y: number } {
  const px = (n: number): number => n * size.width
  const py = (n: number): number => n * size.height
  switch (ann.type) {
    case 'highlight':
    case 'rect':
    case 'text':
      return { x: px(ann.x), y: py(ann.y) }
    case 'line':
      return { x: px(ann.x1), y: py(ann.y1) }
    case 'ink': {
      const first = ann.points[0]
      return { x: px(first.x), y: py(first.y) }
    }
  }
}
