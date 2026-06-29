import { useEffect, useRef, useState } from 'react'
import { findPagesWithText, type PdfDocumentProxy } from '../lib/pdf'

interface FindBarProps {
  doc: PdfDocumentProxy
  onClose(): void
  onGoToPage(index: number): void
}

/** Lightweight find bar: lists pages containing the query and steps through them. */
export function FindBar({ doc, onClose, onGoToPage }: FindBarProps): JSX.Element {
  const [query, setQuery] = useState('')
  const [matches, setMatches] = useState<number[]>([])
  const [active, setActive] = useState(0)
  const [searching, setSearching] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const runSearch = async (): Promise<void> => {
    if (!query.trim()) {
      setMatches([])
      return
    }
    setSearching(true)
    const found = await findPagesWithText(doc, query)
    setMatches(found)
    setSearching(false)
    if (found.length > 0) {
      setActive(0)
      onGoToPage(found[0])
    }
  }

  const step = (dir: 1 | -1): void => {
    if (matches.length === 0) return
    const next = (active + dir + matches.length) % matches.length
    setActive(next)
    onGoToPage(matches[next])
  }

  return (
    <div className="find-bar">
      <input
        ref={inputRef}
        className="find-input"
        placeholder="Найти на страницах…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            if (matches.length > 0) step(e.shiftKey ? -1 : 1)
            else runSearch()
          }
          if (e.key === 'Escape') onClose()
        }}
      />
      <button className="find-btn" onClick={runSearch} disabled={searching}>
        {searching ? '…' : 'Найти'}
      </button>
      <span className="find-count">
        {matches.length > 0 ? `${active + 1} из ${matches.length}` : query ? 'нет совпадений' : ''}
      </span>
      <button className="find-btn icon" onClick={() => step(-1)} disabled={matches.length === 0}>
        ‹
      </button>
      <button className="find-btn icon" onClick={() => step(1)} disabled={matches.length === 0}>
        ›
      </button>
      <button className="find-btn icon" onClick={onClose} title="Закрыть">
        ✕
      </button>
    </div>
  )
}
