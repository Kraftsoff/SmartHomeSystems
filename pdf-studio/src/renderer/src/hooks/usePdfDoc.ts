import { useEffect, useState } from 'react'
import { loadPdfDocument, type PdfDocumentProxy } from '../lib/pdf'

interface PdfDocState {
  doc: PdfDocumentProxy | null
  numPages: number
  loading: boolean
  error: string | null
}

/**
 * Keep a live pdf.js document in sync with the current bytes. Reloads whenever
 * `bytes` changes (open, undo/redo, structural edits) and tears down the old
 * document to free worker resources.
 */
export function usePdfDoc(bytes: Uint8Array | null): PdfDocState {
  const [state, setState] = useState<PdfDocState>({
    doc: null,
    numPages: 0,
    loading: false,
    error: null
  })

  useEffect(() => {
    if (!bytes) {
      setState({ doc: null, numPages: 0, loading: false, error: null })
      return
    }

    let cancelled = false
    let loaded: PdfDocumentProxy | null = null
    setState((s) => ({ ...s, loading: true, error: null }))

    loadPdfDocument(bytes)
      .then((doc) => {
        if (cancelled) {
          doc.destroy()
          return
        }
        loaded = doc
        setState({ doc, numPages: doc.numPages, loading: false, error: null })
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setState({
          doc: null,
          numPages: 0,
          loading: false,
          error: err instanceof Error ? err.message : 'Не удалось открыть документ'
        })
      })

    return () => {
      cancelled = true
      loaded?.destroy()
    }
  }, [bytes])

  return state
}
