import { useEffect, useRef, useState } from 'react'
import { loadPdfDocument, type PdfDocumentProxy } from '../lib/pdf'

interface PdfDocState {
  doc: PdfDocumentProxy | null
  numPages: number
  loading: boolean
  error: string | null
}

/**
 * Keep a live pdf.js document in sync with the current bytes. Reloads whenever
 * `bytes` changes (open, undo/redo, structural edits). The previous document is
 * destroyed only *after* the new one has loaded, so consumers (e.g. the
 * thumbnail sidebar) never render against a destroyed proxy during the reload.
 */
export function usePdfDoc(bytes: Uint8Array | null): PdfDocState {
  const [state, setState] = useState<PdfDocState>({
    doc: null,
    numPages: 0,
    loading: false,
    error: null
  })
  const activeDoc = useRef<PdfDocumentProxy | null>(null)

  useEffect(() => {
    if (!bytes) {
      activeDoc.current?.destroy()
      activeDoc.current = null
      setState({ doc: null, numPages: 0, loading: false, error: null })
      return
    }

    let cancelled = false
    setState((s) => ({ ...s, loading: true, error: null }))

    loadPdfDocument(bytes)
      .then((doc) => {
        if (cancelled) {
          // A newer load superseded this one; discard our result.
          doc.destroy()
          return
        }
        const prev = activeDoc.current
        activeDoc.current = doc
        setState({ doc, numPages: doc.numPages, loading: false, error: null })
        if (prev && prev !== doc) prev.destroy()
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setState((s) => ({
          ...s,
          loading: false,
          error: err instanceof Error ? err.message : 'Не удалось открыть документ'
        }))
      })

    // Do not destroy the current document here — keep it displayed until the
    // replacement resolves. Just mark this run as superseded.
    return () => {
      cancelled = true
    }
  }, [bytes])

  // Destroy the last active document when the hook unmounts.
  useEffect(() => {
    return () => {
      activeDoc.current?.destroy()
      activeDoc.current = null
    }
  }, [])

  return state
}
