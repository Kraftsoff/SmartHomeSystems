import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import type { PendingImage } from './AnnotationLayer'

interface SignatureModalProps {
  onDone(image: PendingImage): void
  onCancel(): void
}

const PAD_WIDTH = 520
const PAD_HEIGHT = 200

async function canvasToPending(canvas: HTMLCanvasElement): Promise<PendingImage> {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  if (!blob) throw new Error('Не удалось создать изображение подписи')
  return {
    dataUrl: canvas.toDataURL('image/png'),
    bytes: new Uint8Array(await blob.arrayBuffer()),
    format: 'png',
    aspect: canvas.height / canvas.width
  }
}

/** Modal for producing a signature image: draw on a pad or upload a file. */
export function SignatureModal({ onDone, onCancel }: SignatureModalProps): JSX.Element {
  const [mode, setMode] = useState<'draw' | 'upload'>('draw')
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const last = useRef<{ x: number; y: number } | null>(null)
  const [hasStrokes, setHasStrokes] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  const ctx = (): CanvasRenderingContext2D | null => canvasRef.current?.getContext('2d') ?? null

  const pointerPos = (e: ReactPointerEvent): { x: number; y: number } => {
    const rect = canvasRef.current!.getBoundingClientRect()
    return {
      x: ((e.clientX - rect.left) / rect.width) * PAD_WIDTH,
      y: ((e.clientY - rect.top) / rect.height) * PAD_HEIGHT
    }
  }

  const startDraw = (e: ReactPointerEvent): void => {
    drawing.current = true
    last.current = pointerPos(e)
    canvasRef.current?.setPointerCapture(e.pointerId)
  }
  const moveDraw = (e: ReactPointerEvent): void => {
    if (!drawing.current) return
    const c = ctx()
    if (!c || !last.current) return
    const p = pointerPos(e)
    c.strokeStyle = '#111'
    c.lineWidth = 2.5
    c.lineCap = 'round'
    c.lineJoin = 'round'
    c.beginPath()
    c.moveTo(last.current.x, last.current.y)
    c.lineTo(p.x, p.y)
    c.stroke()
    last.current = p
    setHasStrokes(true)
  }
  const endDraw = (): void => {
    drawing.current = false
    last.current = null
  }

  const clearPad = (): void => {
    const c = ctx()
    if (c) c.clearRect(0, 0, PAD_WIDTH, PAD_HEIGHT)
    setHasStrokes(false)
  }

  const confirmDrawn = async (): Promise<void> => {
    if (!canvasRef.current || !hasStrokes) return
    onDone(await canvasToPending(canvasRef.current))
  }

  const handleUpload = (file: File): void => {
    setUploadError(null)
    const isPng = file.type === 'image/png'
    const isJpg = file.type === 'image/jpeg'
    if (!isPng && !isJpg) {
      setUploadError('Поддерживаются PNG и JPEG')
      return
    }
    const reader = new FileReader()
    reader.onload = async () => {
      const dataUrl = reader.result as string
      const bytes = new Uint8Array(await file.arrayBuffer())
      const img = new Image()
      img.onload = () => {
        onDone({
          dataUrl,
          bytes,
          format: isPng ? 'png' : 'jpg',
          aspect: img.naturalHeight / img.naturalWidth
        })
      }
      img.onerror = () => setUploadError('Не удалось прочитать изображение')
      img.src = dataUrl
    }
    reader.onerror = () => setUploadError('Не удалось прочитать файл')
    reader.readAsDataURL(file)
  }

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">Подпись</div>
        <div className="modal-tabs">
          <button className={mode === 'draw' ? 'active' : ''} onClick={() => setMode('draw')}>
            Нарисовать
          </button>
          <button className={mode === 'upload' ? 'active' : ''} onClick={() => setMode('upload')}>
            Загрузить
          </button>
        </div>

        {mode === 'draw' ? (
          <div className="signature-draw">
            <canvas
              ref={canvasRef}
              width={PAD_WIDTH}
              height={PAD_HEIGHT}
              className="signature-pad"
              onPointerDown={startDraw}
              onPointerMove={moveDraw}
              onPointerUp={endDraw}
            />
            <div className="modal-actions">
              <button className="btn-ghost" onClick={clearPad} disabled={!hasStrokes}>
                Очистить
              </button>
              <span className="spacer" />
              <button className="btn-ghost" onClick={onCancel}>
                Отмена
              </button>
              <button className="btn-primary" onClick={() => void confirmDrawn()} disabled={!hasStrokes}>
                Готово
              </button>
            </div>
          </div>
        ) : (
          <div className="signature-upload">
            <label className="upload-drop">
              <input
                type="file"
                accept="image/png,image/jpeg"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) handleUpload(f)
                }}
              />
              Выберите изображение (PNG или JPEG)
            </label>
            {uploadError && <div className="upload-error">{uploadError}</div>}
            <div className="modal-actions">
              <span className="spacer" />
              <button className="btn-ghost" onClick={onCancel}>
                Отмена
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
