import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import {
  type Annotation,
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

interface DragRect {
  x0: number
  y0: number
  x1: number
  y1: number
}

const DEFAULT_LINE_WIDTH = 2 // PDF points
const DEFAULT_FONT_SIZE = 18 // PDF points

/**
 * Interactive overlay that both renders existing annotations and captures new
 * ones. All geometry is kept in normalized page coordinates (0..1) so it is
 * independent of zoom; point-based sizes (stroke width, font) are multiplied by
 * `scale` for display.
 */
export function AnnotationLayer(props: AnnotationLayerProps): JSX.Element {
  const { pageIndex, size, scale, tool, color, annotations, onCommit, onDelete } = props
  const svgRef = useRef<SVGSVGElement>(null)
  const [dragRect, setDragRect] = useState<DragRect | null>(null)
  const [inkPoints, setInkPoints] = useState<Array<{ x: number; y: number }>>([])
  const [textDraft, setTextDraft] = useState<{ x: number; y: number; value: string } | null>(
    null
  )
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const toNorm = (e: ReactPointerEvent): { x: number; y: number } => {
    const rect = svgRef.current!.getBoundingClientRect()
    return {
      x: Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height))
    }
  }

  const isDrawing = tool === 'highlight' || tool === 'rect' || tool === 'ink'

  const handlePointerDown = (e: ReactPointerEvent): void => {
    if (textDraft) return
    const p = toNorm(e)

    if (tool === 'text') {
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
      setDragRect({ x0: p.x, y0: p.y, x1: p.x, y1: p.y })
    }
  }

  const handlePointerMove = (e: ReactPointerEvent): void => {
    if (!isDrawing) return
    const p = toNorm(e)
    if (tool === 'ink') {
      if (inkPoints.length === 0) return
      setInkPoints((pts) => [...pts, p])
    } else if (dragRect) {
      setDragRect({ ...dragRect, x1: p.x, y1: p.y })
    }
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

    if (dragRect) {
      const x = Math.min(dragRect.x0, dragRect.x1)
      const y = Math.min(dragRect.y0, dragRect.y1)
      const w = Math.abs(dragRect.x1 - dragRect.x0)
      const h = Math.abs(dragRect.y1 - dragRect.y0)
      // Ignore accidental zero-area clicks.
      if (w > 0.005 && h > 0.005) {
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
        }
      }
      setDragRect(null)
    }
  }

  const commitText = (): void => {
    if (textDraft && textDraft.value.trim()) {
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

  const px = (normX: number): number => normX * size.width
  const py = (normY: number): number => normY * size.height

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

        {/* in-progress drag rectangle */}
        {dragRect &&
          (tool === 'highlight' || tool === 'rect') &&
          (() => {
            const x = Math.min(dragRect.x0, dragRect.x1)
            const y = Math.min(dragRect.y0, dragRect.y1)
            const w = Math.abs(dragRect.x1 - dragRect.x0)
            const h = Math.abs(dragRect.y1 - dragRect.y0)
            return (
              <rect
                x={px(x)}
                y={py(y)}
                width={px(w)}
                height={py(h)}
                fill={tool === 'highlight' ? color : 'none'}
                fillOpacity={tool === 'highlight' ? 0.35 : 0}
                stroke={color}
                strokeWidth={tool === 'rect' ? DEFAULT_LINE_WIDTH * scale : 0}
                strokeDasharray="4 3"
              />
            )
          })()}

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
            <g key={`hit-${ann.id}`} onPointerDown={() => setSelectedId(ann.id)}>
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
            if (e.key === 'Enter') commitText()
            if (e.key === 'Escape') setTextDraft(null)
          }}
          onBlur={commitText}
        />
      )}
    </div>
  )
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
  const common = { fill: 'transparent', stroke: 'transparent', strokeWidth: 10 }
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
    case 'ink': {
      const first = ann.points[0]
      return { x: px(first.x), y: py(first.y) }
    }
  }
}
