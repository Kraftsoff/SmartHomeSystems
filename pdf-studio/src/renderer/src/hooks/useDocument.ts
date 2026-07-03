import { useCallback, useMemo, useReducer, useRef } from 'react'
import type { Annotation } from '../lib/annotations'
import {
  bakeAnnotations,
  rotatePage,
  deletePage,
  movePage,
  appendPdf,
  insertPdfAt,
  duplicatePage,
  extractPage,
  extractRange
} from '../lib/pdfEdit'
import { flattenRedactionPages } from '../lib/redact'
import { readFormFields, fillFormFields, type FormFieldInfo, type FormFieldValue } from '../lib/forms'

/** Bake annotations to vector, then rasterize any pages carrying redactions. */
async function bakeAndFlatten(snapshot: DocSnapshot): Promise<Uint8Array> {
  const baked = await bakeAnnotations(snapshot.bytes, snapshot.annotations)
  const redactedPages = snapshot.annotations
    .filter((a) => a.type === 'redact')
    .map((a) => a.pageIndex)
  if (redactedPages.length === 0) return baked
  return flattenRedactionPages(baked, redactedPages)
}

/** An immutable snapshot of the editable document state. */
export interface DocSnapshot {
  bytes: Uint8Array
  annotations: Annotation[]
}

interface DocumentModel {
  name: string
  path: string | null
  history: DocSnapshot[]
  /** Index into `history` of the current snapshot. */
  cursor: number
  /** `cursor` value that matches what is on disk (-1 = never saved). */
  savedCursor: number
}

type Action =
  | { type: 'open'; name: string; path: string | null; bytes: Uint8Array }
  | { type: 'push'; snapshot: DocSnapshot }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'saved'; path: string; name: string; snapshot: DocSnapshot }
  | { type: 'close' }

const EMPTY: DocumentModel = {
  name: '',
  path: null,
  history: [],
  cursor: -1,
  savedCursor: -1
}

function reducer(state: DocumentModel, action: Action): DocumentModel {
  switch (action.type) {
    case 'open':
      return {
        name: action.name,
        path: action.path,
        history: [{ bytes: action.bytes, annotations: [] }],
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
      // Saving bakes annotations: the saved snapshot becomes the new baseline.
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

export interface DocumentController {
  hasDocument: boolean
  name: string
  path: string | null
  bytes: Uint8Array | null
  annotations: Annotation[]
  isDirty: boolean
  canUndo: boolean
  canRedo: boolean

  open(name: string, path: string | null, bytes: Uint8Array): void
  close(): void
  undo(): void
  redo(): void

  addAnnotation(ann: Annotation): void
  deleteAnnotation(id: string): void
  clearAnnotationsOnPage(pageIndex: number): void

  /** Returns the bytes with all current annotations baked in. */
  exportBytes(): Promise<Uint8Array>
  markSaved(path: string, name: string, bytes: Uint8Array): void

  rotateCurrentPage(pageIndex: number, delta: number): Promise<void>
  deleteCurrentPage(pageIndex: number): Promise<void>
  reorderPage(from: number, to: number): Promise<void>
  appendDocument(otherBytes: Uint8Array): Promise<void>
  insertDocumentAfter(pageIndex: number, otherBytes: Uint8Array): Promise<void>
  duplicateCurrentPage(pageIndex: number): Promise<void>
  /** Bake annotations and return a one-page PDF for the given page. */
  extractPageBytes(pageIndex: number): Promise<Uint8Array>
  /** Bake annotations and return a PDF for the inclusive page range. */
  extractRangeBytes(from: number, to: number): Promise<Uint8Array>
  /** Read interactive form fields from the current document. */
  getFormFields(): Promise<FormFieldInfo[]>
  /** Apply edited form values as a new snapshot. */
  applyFormValues(values: Record<string, FormFieldValue>): Promise<void>
}

export function useDocument(): DocumentController {
  const [state, dispatch] = useReducer(reducer, EMPTY)
  // Guards against overlapping async structural edits: a second edit fired
  // before the first resolves would be computed from stale bytes and clobber
  // the first snapshot. We drop the overlapping edit instead.
  const structuralBusy = useRef(false)

  const current = state.cursor >= 0 ? state.history[state.cursor] : null
  const bytes = current?.bytes ?? null
  const annotations = current?.annotations ?? []

  const isDirty = state.cursor !== state.savedCursor

  const pushSnapshot = useCallback((snapshot: DocSnapshot) => {
    dispatch({ type: 'push', snapshot })
  }, [])

  /** Bake the current annotations, then apply a structural transform to bytes. */
  const applyStructural = useCallback(
    async (transform: (baked: Uint8Array) => Promise<Uint8Array>) => {
      if (!current || structuralBusy.current) return
      structuralBusy.current = true
      try {
        // Bake + flatten so redactions are truly removed before we clear the
        // annotation layer (a plain bake would leave content under the box).
        const baked = await bakeAndFlatten(current)
        const result = await transform(baked)
        pushSnapshot({ bytes: result, annotations: [] })
      } finally {
        structuralBusy.current = false
      }
    },
    [current, pushSnapshot]
  )

  return useMemo<DocumentController>(
    () => ({
      hasDocument: current !== null,
      name: state.name,
      path: state.path,
      bytes,
      annotations,
      isDirty,
      canUndo: state.cursor > 0,
      canRedo: state.cursor < state.history.length - 1,

      open: (name, path, openedBytes) =>
        dispatch({ type: 'open', name, path, bytes: openedBytes }),
      close: () => dispatch({ type: 'close' }),
      undo: () => dispatch({ type: 'undo' }),
      redo: () => dispatch({ type: 'redo' }),

      addAnnotation: (ann) => {
        if (!current) return
        pushSnapshot({
          bytes: current.bytes,
          annotations: [...current.annotations, ann]
        })
      },
      deleteAnnotation: (id) => {
        if (!current) return
        pushSnapshot({
          bytes: current.bytes,
          annotations: current.annotations.filter((a) => a.id !== id)
        })
      },
      clearAnnotationsOnPage: (pageIndex) => {
        if (!current) return
        pushSnapshot({
          bytes: current.bytes,
          annotations: current.annotations.filter((a) => a.pageIndex !== pageIndex)
        })
      },

      exportBytes: async () => {
        if (!current) throw new Error('Документ не открыт')
        return bakeAndFlatten(current)
      },
      markSaved: (path, name, savedBytes) =>
        dispatch({
          type: 'saved',
          path,
          name,
          snapshot: { bytes: savedBytes, annotations: [] }
        }),

      rotateCurrentPage: (pageIndex, delta) =>
        applyStructural((b) => rotatePage(b, pageIndex, delta)),
      deleteCurrentPage: (pageIndex) =>
        applyStructural((b) => deletePage(b, pageIndex)),
      reorderPage: (from, to) => applyStructural((b) => movePage(b, from, to)),
      appendDocument: (otherBytes) =>
        applyStructural((b) => appendPdf(b, otherBytes)),
      insertDocumentAfter: (pageIndex, otherBytes) =>
        applyStructural((b) => insertPdfAt(b, otherBytes, pageIndex)),
      duplicateCurrentPage: (pageIndex) =>
        applyStructural((b) => duplicatePage(b, pageIndex)),
      extractPageBytes: async (pageIndex) => {
        if (!current) throw new Error('Документ не открыт')
        const baked = await bakeAndFlatten(current)
        return extractPage(baked, pageIndex)
      },
      extractRangeBytes: async (from, to) => {
        if (!current) throw new Error('Документ не открыт')
        const baked = await bakeAndFlatten(current)
        return extractRange(baked, from, to)
      },
      getFormFields: async () => {
        if (!current) return []
        return readFormFields(current.bytes)
      },
      applyFormValues: (values) => applyStructural((b) => fillFormFields(b, values))
    }),
    [current, state, bytes, annotations, isDirty, pushSnapshot, applyStructural]
  )
}
