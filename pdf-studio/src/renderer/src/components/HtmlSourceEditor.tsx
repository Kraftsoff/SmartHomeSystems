import { useEffect, useImperativeHandle, useRef, forwardRef } from 'react'
import { EditorView, basicSetup } from 'codemirror'
import { EditorState } from '@codemirror/state'
import { html } from '@codemirror/lang-html'

export interface HtmlSourceEditorHandle {
  getText(): string
  setText(text: string): void
}

interface HtmlSourceEditorProps {
  initialText: string
  onChange(text: string): void
  /** Fires on blur — a natural point to flush a pending commit. */
  onBlur(): void
}

/**
 * Thin CodeMirror 6 wrapper. This is the actual save-to-disk source of
 * truth for the live HTML editor: the user edits literal markup text here,
 * and CodeMirror's own history extension owns fine-grained per-keystroke
 * undo while the editor has focus (see HtmlEditorView for how app-level
 * undo/redo is layered on top at commit boundaries).
 */
export const HtmlSourceEditor = forwardRef<HtmlSourceEditorHandle, HtmlSourceEditorProps>(
  function HtmlSourceEditor({ initialText, onChange, onBlur }, ref) {
    const hostRef = useRef<HTMLDivElement>(null)
    const viewRef = useRef<EditorView | null>(null)
    // Avoids feeding a setText()-driven update back through onChange.
    const applyingExternal = useRef(false)

    useEffect(() => {
      if (!hostRef.current) return

      const state = EditorState.create({
        doc: initialText,
        extensions: [
          basicSetup,
          html(),
          EditorView.lineWrapping,
          EditorView.updateListener.of((update) => {
            if (update.docChanged && !applyingExternal.current) {
              onChange(update.state.doc.toString())
            }
          }),
          EditorView.domEventHandlers({
            blur: () => {
              onBlur()
              return false
            }
          })
        ]
      })

      const view = new EditorView({ state, parent: hostRef.current })
      viewRef.current = view

      return () => {
        view.destroy()
        viewRef.current = null
      }
      // Only re-created when the editor is mounted for a fresh document;
      // updates to text thereafter go through the imperative setText handle.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    useImperativeHandle(
      ref,
      () => ({
        getText: () => viewRef.current?.state.doc.toString() ?? initialText,
        setText: (text) => {
          const view = viewRef.current
          if (!view) return
          const current = view.state.doc.toString()
          if (current === text) return
          applyingExternal.current = true
          view.dispatch({
            changes: { from: 0, to: current.length, insert: text }
          })
          applyingExternal.current = false
        }
      }),
      [initialText]
    )

    return <div className="html-source-editor" ref={hostRef} />
  }
)
