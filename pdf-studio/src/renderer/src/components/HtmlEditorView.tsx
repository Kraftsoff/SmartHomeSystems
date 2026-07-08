import { useCallback, useEffect, useRef, useState } from 'react'
import type { HtmlDocumentController } from '../hooks/useHtmlDocument'
import { HtmlSourceEditor, type HtmlSourceEditorHandle } from './HtmlSourceEditor'
import { AnnotationLayer } from './AnnotationLayer'
import { sanitizeForPreview } from '../lib/htmlSanitize'
import { DEFAULT_COLORS, type Tool } from '../lib/annotations'
import type { PageSize } from './PdfCanvas'

const DEBOUNCE_MS = 300
/** Fixed reference width (Letter @ 96dpi) so annotation coordinates and
 * pagination-free layout stay stable regardless of window size. */
const REFERENCE_WIDTH = 816

const TOOLS: Array<{ id: Tool; label: string; icon: string }> = [
  { id: 'select', label: 'Выбор / удаление', icon: '🖱' },
  { id: 'highlight', label: 'Выделение', icon: '🖍' },
  { id: 'underline', label: 'Подчёркивание', icon: 'U' },
  { id: 'strikethrough', label: 'Зачёркивание', icon: 'S' },
  { id: 'ink', label: 'Карандаш', icon: '✏️' },
  { id: 'text', label: 'Текст', icon: 'T' },
  { id: 'rect', label: 'Прямоугольник', icon: '▭' },
  { id: 'line', label: 'Линия', icon: '／' },
  { id: 'arrow', label: 'Стрелка', icon: '↗' },
  { id: 'whiteout', label: 'Забелка', icon: '⬜' }
]

interface HtmlEditorViewProps {
  doc: HtmlDocumentController
  onSave(forceDialog: boolean, text: string): void
  onClose(): void
}

/**
 * Live HTML editor: a CodeMirror source pane (the literal save-to-disk
 * source of truth) plus a sandboxed, script-free preview iframe with the
 * existing AnnotationLayer mounted over it. No PDF conversion round-trip —
 * saving writes the edited text straight back to .html.
 *
 * v1 scope: a single continuous "page" sized to the rendered content
 * (no multi-page pagination of arbitrary CSS layouts yet), and no
 * signature/stamp/redact tools — those rely on PDF-only baking/rasterizing
 * pipelines that don't apply to a live text document.
 */
export function HtmlEditorView({ doc, onSave, onClose }: HtmlEditorViewProps): JSX.Element {
  const editorRef = useRef<HtmlSourceEditorHandle>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingTextRef = useRef<string | null>(null)
  const iframeRef = useRef<HTMLIFrameElement>(null)

  const [previewHtml, setPreviewHtml] = useState('')
  const [pageSize, setPageSize] = useState<PageSize | null>(null)
  const [tool, setTool] = useState<Tool>('select')
  const [color, setColor] = useState('#ffd400')

  // Returns the just-committed (or already-current) text directly, rather
  // than relying on doc.text after dispatch: React state updates aren't
  // synchronous, so a caller reading doc.text right after calling this would
  // risk seeing the pre-flush value (see Save below).
  const flushPendingEdit = useCallback((): string => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
      debounceRef.current = null
    }
    if (pendingTextRef.current !== null) {
      const text = pendingTextRef.current
      doc.commitText(text)
      pendingTextRef.current = null
      return text
    }
    return doc.text ?? ''
  }, [doc])

  const handleChange = useCallback((text: string) => {
    pendingTextRef.current = text
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setPreviewHtml(sanitizeForPreview(text))
      if (pendingTextRef.current !== null) {
        doc.commitText(pendingTextRef.current)
        pendingTextRef.current = null
      }
    }, DEBOUNCE_MS)
    // doc is stable across the component's lifetime for a given open document.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Initial load + external changes (undo/redo, document open) resync both
  // the CodeMirror buffer and the preview from the authoritative snapshot.
  useEffect(() => {
    if (doc.text === null) return
    editorRef.current?.setText(doc.text)
    setPreviewHtml(sanitizeForPreview(doc.text))
  }, [doc.text])

  const onIframeLoad = useCallback(() => {
    const iframe = iframeRef.current
    const iframeDoc = iframe?.contentDocument
    if (!iframe || !iframeDoc) return
    const height = Math.max(iframeDoc.documentElement.scrollHeight, 100)
    iframe.style.height = `${height}px`
    setPageSize({ width: REFERENCE_WIDTH, height })
  }, [])

  const save = useCallback(
    (forceDialog: boolean) => {
      const text = flushPendingEdit()
      onSave(forceDialog, text)
    },
    [flushPendingEdit, onSave]
  )

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      const mod = e.ctrlKey || e.metaKey
      if (!mod) return
      const target = e.target as HTMLElement | null
      // CodeMirror owns Ctrl/Cmd+Z while its own editor has focus.
      if (target?.closest('.html-source-editor')) return
      const key = e.key.toLowerCase()
      if (key === 'z' && !e.shiftKey) {
        e.preventDefault()
        flushPendingEdit()
        doc.undo()
      } else if ((key === 'z' && e.shiftKey) || key === 'y') {
        e.preventDefault()
        flushPendingEdit()
        doc.redo()
      } else if (key === 's') {
        e.preventDefault()
        save(e.shiftKey)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [doc, save, flushPendingEdit])

  return (
    <div className="html-editor">
      <div className="toolbar">
        <div className="toolbar-group">
          <button
            className="tbtn"
            onClick={() => {
              flushPendingEdit()
              onClose()
            }}
            title="Закрыть документ"
          >
            ← Закрыть
          </button>
          <button
            className="tbtn"
            onClick={() => save(false)}
            disabled={!doc.isDirty}
            title="Сохранить (Ctrl+S)"
          >
            💾 Сохранить{doc.isDirty ? ' •' : ''}
          </button>
          <button className="tbtn" onClick={() => save(true)} title="Сохранить как (Ctrl+Shift+S)">
            Как…
          </button>
        </div>
        <div className="toolbar-group">
          <button
            className="tbtn icon"
            onClick={() => {
              flushPendingEdit()
              doc.undo()
            }}
            disabled={!doc.canUndo}
            title="Отменить"
          >
            ↶
          </button>
          <button
            className="tbtn icon"
            onClick={() => {
              flushPendingEdit()
              doc.redo()
            }}
            disabled={!doc.canRedo}
            title="Повторить"
          >
            ↷
          </button>
        </div>
        <div className="toolbar-group tools">
          {TOOLS.map((t) => (
            <button
              key={t.id}
              className={`tbtn icon ${tool === t.id ? 'active' : ''}`}
              onClick={() => setTool(t.id)}
              title={t.label}
            >
              {t.icon}
            </button>
          ))}
        </div>
        <div className="toolbar-group colors">
          {DEFAULT_COLORS.map((c) => (
            <button
              key={c}
              className={`swatch ${color === c ? 'active' : ''}`}
              style={{ background: c }}
              onClick={() => setColor(c)}
              title={c}
            />
          ))}
        </div>
      </div>

      <div className="html-editor-body">
        <div className="html-editor-source">
          <HtmlSourceEditor
            ref={editorRef}
            initialText={doc.text ?? ''}
            onChange={handleChange}
            onBlur={flushPendingEdit}
          />
        </div>
        <div className="html-editor-preview-scroll">
          <div className="html-editor-preview-stage" style={{ width: REFERENCE_WIDTH }}>
            <iframe
              ref={iframeRef}
              className="html-editor-preview"
              style={{ width: REFERENCE_WIDTH }}
              sandbox="allow-same-origin"
              srcDoc={previewHtml}
              onLoad={onIframeLoad}
              title="Предпросмотр HTML"
            />
            {pageSize && (
              <AnnotationLayer
                pageIndex={0}
                size={pageSize}
                scale={1}
                tool={tool}
                color={color}
                annotations={doc.annotations}
                pendingImage={null}
                stampPreset={null}
                onCommit={doc.addAnnotation}
                onDelete={doc.deleteAnnotation}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
