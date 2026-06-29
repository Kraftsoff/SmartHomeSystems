import { useState } from 'react'
import type { PdfDocumentProxy } from '../lib/pdf'
import { Thumbnail } from './Thumbnail'

interface SidebarProps {
  doc: PdfDocumentProxy
  numPages: number
  currentPage: number
  onSelectPage(index: number): void
  onReorder(from: number, to: number): void
}

/** Page thumbnail rail with drag-and-drop reordering. */
export function Sidebar({
  doc,
  numPages,
  currentPage,
  onSelectPage,
  onReorder
}: SidebarProps): JSX.Element {
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [overIndex, setOverIndex] = useState<number | null>(null)

  return (
    <aside className="sidebar">
      <div className="sidebar-header">Страницы ({numPages})</div>
      <div className="thumbnail-list">
        {Array.from({ length: numPages }, (_, i) => (
          <div
            key={i}
            className={`thumbnail-slot ${overIndex === i ? 'drag-over' : ''}`}
            draggable
            onDragStart={() => setDragIndex(i)}
            onDragOver={(e) => {
              e.preventDefault()
              setOverIndex(i)
            }}
            onDragEnd={() => {
              setDragIndex(null)
              setOverIndex(null)
            }}
            onDrop={(e) => {
              e.preventDefault()
              if (dragIndex !== null && dragIndex !== i) onReorder(dragIndex, i)
              setDragIndex(null)
              setOverIndex(null)
            }}
          >
            <Thumbnail
              doc={doc}
              pageIndex={i}
              active={i === currentPage}
              onSelect={() => onSelectPage(i)}
            />
          </div>
        ))}
      </div>
    </aside>
  )
}
