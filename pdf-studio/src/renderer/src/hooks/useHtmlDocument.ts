import { useMemo, useReducer } from 'react'
import type { Annotation } from '../lib/annotations'

/** An immutable snapshot of the editable HTML document state. */
export interface HtmlSnapshot {
  /** The literal HTML source text — always what gets written to disk. */
  text: string
  annotations: Annotation[]
}

interface HtmlDocumentModel {
  name: string
  path: string | null
  history: HtmlSnapshot[]
  /** Index into `history` of the current snapshot. */
  cursor: number
  /** `cursor` value that matches what is on disk (-1 = never saved). */
  savedCursor: number
}

type Action =
  | { type: 'open'; name: string; path: string | null; text: string }
  | { type: 'push'; snapshot: HtmlSnapshot }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'saved'; path: string; name: string; snapshot: HtmlSnapshot }
  | { type: 'close' }

const EMPTY: HtmlDocumentModel = {
  name: '',
  path: null,
  history: [],
  cursor: -1,
  savedCursor: -1
}

function reducer(state: HtmlDocumentModel, action: Action): HtmlDocumentModel {
  switch (action.type) {
    case 'open':
      return {
        name: action.name,
        path: action.path,
        history: [{ text: action.text, annotations: [] }],
        cursor: 0,
        savedCursor: action.path ? 0 : -1
      }
    case 'push': {
      // Drop any redo branch, then append the new snapshot.
      const kept = state.history.slice(0, state.cursor + 1)
      return {
        ...state,
        history: [...kept, action.snapshot],
        cursor: kept.length
      }
    }
    case 'undo':
      return state.cursor > 0 ? { ...state, cursor: state.cursor - 1 } : state
    case 'redo':
      return state.cursor < state.history.length - 1
        ? { ...state, cursor: state.cursor + 1 }
        : state
    case 'saved': {
      const kept = state.history.slice(0, state.cursor + 1)
      const next = [...kept, action.snapshot]
      return {
        ...state,
        path: action.path,
        name: action.name,
        history: next,
        cursor: next.length - 1,
        savedCursor: next.length - 1
      }
    }
    case 'close':
      return EMPTY
    default:
      return state
  }
}

export interface HtmlDocumentController {
  hasDocument: boolean
  name: string
  path: string | null
  text: string | null
  annotations: Annotation[]
  isDirty: boolean
  canUndo: boolean
  canRedo: boolean

  open(name: string, path: string | null, text: string): void
  close(): void
  undo(): void
  redo(): void

  /** Commit a new text snapshot (called on debounce settle, blur, or flush). */
  commitText(text: string): void
  addAnnotation(ann: Annotation): void
  deleteAnnotation(id: string): void

  markSaved(path: string, name: string, text: string): void
}

/**
 * Mirrors useDocument's immutable-snapshot undo/redo pattern for HTML
 * documents. Kept separate from useDocument (rather than folding HTML into
 * DocSnapshot) so the PDF-specific structural pipeline (bakeAndFlatten,
 * applyStructural, page operations) never has to reason about a document
 * kind it doesn't apply to.
 */
export function useHtmlDocument(): HtmlDocumentController {
  const [state, dispatch] = useReducer(reducer, EMPTY)
  const current = state.cursor >= 0 ? state.history[state.cursor] : null
  const isDirty = state.cursor !== state.savedCursor

  return useMemo<HtmlDocumentController>(
    () => ({
      hasDocument: current !== null,
      name: state.name,
      path: state.path,
      text: current?.text ?? null,
      annotations: current?.annotations ?? [],
      isDirty,
      canUndo: state.cursor > 0,
      canRedo: state.cursor < state.history.length - 1,

      open: (name, path, text) => dispatch({ type: 'open', name, path, text }),
      close: () => dispatch({ type: 'close' }),
      undo: () => dispatch({ type: 'undo' }),
      redo: () => dispatch({ type: 'redo' }),

      commitText: (text) => {
        if (!current || text === current.text) return
        dispatch({ type: 'push', snapshot: { text, annotations: current.annotations } })
      },
      addAnnotation: (ann) => {
        if (!current) return
        dispatch({
          type: 'push',
          snapshot: { text: current.text, annotations: [...current.annotations, ann] }
        })
      },
      deleteAnnotation: (id) => {
        if (!current) return
        dispatch({
          type: 'push',
          snapshot: {
            text: current.text,
            annotations: current.annotations.filter((a) => a.id !== id)
          }
        })
      },

      markSaved: (path, name, text) =>
        dispatch({
          type: 'saved',
          path,
          name,
          snapshot: { text, annotations: current?.annotations ?? [] }
        })
    }),
    [current, state, isDirty]
  )
}
