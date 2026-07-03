import { useCallback, useEffect, useRef, useState } from 'react'
import { useDocument } from './hooks/useDocument'
import { usePdfDoc } from './hooks/usePdfDoc'
import { useZoom } from './hooks/useZoom'
import { useTheme } from './hooks/useTheme'
import { Toolbar } from './components/Toolbar'
import { Sidebar } from './components/Sidebar'
import { PdfCanvas, type PageSize } from './components/PdfCanvas'
import { AnnotationLayer } from './components/AnnotationLayer'
import { Welcome } from './components/Welcome'
import { StatusBar } from './components/StatusBar'
import { FindBar } from './components/FindBar'
import { ToolOptionsBar } from './components/ToolOptionsBar'
import { SignatureModal } from './components/SignatureModal'
import { FormPanel } from './components/FormPanel'
import { ExportModal } from './components/ExportModal'
import { InfoModal } from './components/InfoModal'
import type { PendingImage } from './components/AnnotationLayer'
import { getPageBaseSize, renderPageToPng, loadPdfDocument } from './lib/pdf'
import { STAMP_PRESETS, type Tool, type StampPreset } from './lib/annotations'
import type { MenuCommand, RecentFile } from '../../shared/ipc'

const ROTATE_STEP = 90
const PNG_EXPORT_SCALE = 2

export default function App(): JSX.Element {
  const doc = useDocument()
  const { doc: pdfDoc, numPages, loading, error } = usePdfDoc(doc.bytes)
  const { theme, toggleTheme } = useTheme()

  const [currentPage, setCurrentPage] = useState(0)
  const [tool, setTool] = useState<Tool>('select')
  const [color, setColor] = useState('#ffd400')
  const [pageSize, setPageSize] = useState<PageSize | null>(null)
  const [basePageSize, setBasePageSize] = useState<{ width: number; height: number } | null>(null)
  const [showFind, setShowFind] = useState(false)
  const [recentFiles, setRecentFiles] = useState<RecentFile[]>([])
  const [stampPreset, setStampPreset] = useState<StampPreset>(STAMP_PRESETS[0])
  const [pendingImage, setPendingImage] = useState<PendingImage | null>(null)
  const [showSignatureModal, setShowSignatureModal] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [showExport, setShowExport] = useState(false)
  const [showInfo, setShowInfo] = useState(false)

  const scrollRef = useRef<HTMLDivElement>(null)
  const zoom = useZoom(basePageSize, scrollRef)
  const scale = zoom.scale

  // Keep the current page within bounds as pages are added/removed.
  useEffect(() => {
    if (numPages === 0) {
      setCurrentPage(0)
    } else if (currentPage > numPages - 1) {
      setCurrentPage(numPages - 1)
    }
  }, [numPages, currentPage])

  // Track the current page's unscaled size (drives fit-to-width / fit-to-page).
  useEffect(() => {
    if (!pdfDoc || numPages === 0) {
      setBasePageSize(null)
      return
    }
    let cancelled = false
    getPageBaseSize(pdfDoc, Math.min(currentPage, numPages - 1)).then((size) => {
      if (!cancelled) setBasePageSize(size)
    })
    return () => {
      cancelled = true
    }
  }, [pdfDoc, currentPage, numPages])

  // Refresh the recent-files list whenever we are on the welcome screen.
  useEffect(() => {
    if (!doc.hasDocument) {
      window.api.getRecentFiles().then(setRecentFiles)
    }
  }, [doc.hasDocument])

  // Report state to the main process so native menu items enable correctly.
  useEffect(() => {
    window.api.notifyDocumentState({
      hasDocument: doc.hasDocument,
      isDirty: doc.isDirty,
      canUndo: doc.canUndo,
      canRedo: doc.canRedo
    })
  }, [doc.hasDocument, doc.isDirty, doc.canUndo, doc.canRedo])

  const handleToolChange = useCallback(
    (next: Tool) => {
      setTool(next)
      // Prompt for a signature the first time the tool is chosen.
      if (next === 'signature' && !pendingImage) setShowSignatureModal(true)
    },
    [pendingImage]
  )

  const onSized = useCallback((size: PageSize) => {
    setPageSize((prev) =>
      prev && prev.width === size.width && prev.height === size.height ? prev : size
    )
  }, [])

  // ---- File operations -----------------------------------------------------

  const { setActual: zoomActual } = zoom
  const resetViewState = useCallback(() => {
    setCurrentPage(0)
    setTool('select')
    zoomActual()
  }, [zoomActual])

  const openFile = useCallback(async () => {
    const file = await window.api.openPdfDialog()
    if (!file) return
    doc.open(file.name, file.path, file.data)
    resetViewState()
  }, [doc, resetViewState])

  const openRecent = useCallback(
    async (path: string) => {
      const file = await window.api.readPdf(path)
      if (!file) {
        // File is gone — refresh the list so the stale entry disappears.
        window.api.getRecentFiles().then(setRecentFiles)
        return
      }
      doc.open(file.name, file.path, file.data)
      resetViewState()
    },
    [doc, resetViewState]
  )

  const openFromDrop = useCallback(
    async (file: File) => {
      const buffer = await file.arrayBuffer()
      const path = (file as File & { path?: string }).path ?? null
      doc.open(file.name, path, new Uint8Array(buffer))
      if (path) window.api.addRecentFile(path)
      resetViewState()
    },
    [doc, resetViewState]
  )

  const baseName = useCallback(
    () => (doc.name || 'document').replace(/\.pdf$/i, ''),
    [doc.name]
  )

  const save = useCallback(
    async (forceDialog: boolean) => {
      if (!doc.hasDocument) return
      const bytes = await doc.exportBytes()
      if (!forceDialog && doc.path) {
        const res = await window.api.savePdf(doc.path, bytes)
        if (!res.canceled && res.path) doc.markSaved(res.path, doc.name, bytes)
      } else {
        const res = await window.api.savePdfAs(doc.name || 'document.pdf', bytes)
        if (!res.canceled && res.path) {
          const name = res.path.split(/[\\/]/).pop() || doc.name
          doc.markSaved(res.path, name, bytes)
          window.api.addRecentFile(res.path)
        }
      }
    },
    [doc]
  )

  // ---- Page operations -----------------------------------------------------

  const rotate = useCallback(() => {
    if (doc.hasDocument) void doc.rotateCurrentPage(currentPage, ROTATE_STEP)
  }, [doc, currentPage])
  const deletePage = useCallback(() => {
    if (doc.hasDocument && numPages > 1) void doc.deleteCurrentPage(currentPage)
  }, [doc, currentPage, numPages])
  const duplicatePage = useCallback(() => {
    if (doc.hasDocument) void doc.duplicateCurrentPage(currentPage)
  }, [doc, currentPage])
  const reorder = useCallback(
    (from: number, to: number) => {
      void doc.reorderPage(from, to)
      setCurrentPage(to)
    },
    [doc]
  )
  const insertPdf = useCallback(async () => {
    if (!doc.hasDocument) return
    const file = await window.api.openPdfDialog()
    if (file) void doc.insertDocumentAfter(currentPage, file.data)
  }, [doc, currentPage])
  const extractPage = useCallback(async () => {
    if (!doc.hasDocument) return
    const bytes = await doc.extractPageBytes(currentPage)
    await window.api.savePdfAs(`${baseName()}-стр${currentPage + 1}.pdf`, bytes)
  }, [doc, currentPage, baseName])
  // Render pages to PNG from *baked* bytes so exported images include
  // annotations/signatures/redactions, matching the PDF export path.
  const renderBakedPngs = useCallback(
    async (indices: number[]): Promise<Array<{ index: number; png: Uint8Array }>> => {
      const baked = await doc.exportBytes()
      const bakedDoc = await loadPdfDocument(baked)
      try {
        const out: Array<{ index: number; png: Uint8Array }> = []
        for (const i of indices) {
          const page = await bakedDoc.getPage(i + 1)
          out.push({ index: i, png: await renderPageToPng(page, PNG_EXPORT_SCALE) })
        }
        return out
      } finally {
        bakedDoc.destroy()
      }
    },
    [doc]
  )

  const exportPng = useCallback(async () => {
    if (!doc.hasDocument) return
    const [{ png }] = await renderBakedPngs([currentPage])
    await window.api.savePngAs(`${baseName()}-стр${currentPage + 1}.png`, png)
  }, [doc, currentPage, baseName, renderBakedPngs])

  const print = useCallback(async () => {
    if (!doc.hasDocument) return
    const bytes = await doc.exportBytes()
    await window.api.printPdf(bytes)
  }, [doc])

  const exportRange = useCallback(
    async (fromIndex: number, toIndex: number) => {
      const lo = Math.min(fromIndex, toIndex)
      const hi = Math.max(fromIndex, toIndex)
      const bytes = await doc.extractRangeBytes(lo, hi)
      await window.api.savePdfAs(`${baseName()}-стр${lo + 1}-${hi + 1}.pdf`, bytes)
    },
    [doc, baseName]
  )

  const exportAllPng = useCallback(async () => {
    if (!doc.hasDocument) return
    const indices = Array.from({ length: numPages }, (_, i) => i)
    const rendered = await renderBakedPngs(indices)
    const files = rendered.map((r) => ({
      name: `${baseName()}-стр${r.index + 1}.png`,
      data: r.png
    }))
    await window.api.exportPngsToFolder(files)
  }, [doc, numPages, baseName, renderBakedPngs])

  // ---- View operations -----------------------------------------------------

  const nextPage = useCallback(
    () => setCurrentPage((p) => Math.min(numPages - 1, p + 1)),
    [numPages]
  )
  const prevPage = useCallback(() => setCurrentPage((p) => Math.max(0, p - 1)), [])
  const goToPage = useCallback(
    (index: number) => {
      if (numPages === 0) return
      setCurrentPage(Math.min(numPages - 1, Math.max(0, index)))
    },
    [numPages]
  )

  // ---- Native menu commands ------------------------------------------------

  useEffect(() => {
    const dispatch: Record<MenuCommand, () => void> = {
      open: () => void openFile(),
      save: () => void save(false),
      'save-as': () => void save(true),
      'close-document': () => doc.close(),
      'zoom-in': zoom.zoomIn,
      'zoom-out': zoom.zoomOut,
      'zoom-reset': zoom.setActual,
      'next-page': nextPage,
      'prev-page': prevPage,
      'rotate-page': rotate,
      'delete-page': deletePage,
      undo: doc.undo,
      redo: doc.redo,
      find: () => setShowFind(true)
    }
    return window.api.onMenuCommand((command) => dispatch[command]?.())
  }, [openFile, save, doc, zoom, nextPage, prevPage, rotate, deletePage])

  // ---- Drag & drop ---------------------------------------------------------

  const dragDepth = useRef(0)
  const [dragging, setDragging] = useState(false)

  useEffect(() => {
    const onDragOver = (e: DragEvent): void => e.preventDefault()
    const onDragEnter = (e: DragEvent): void => {
      e.preventDefault()
      dragDepth.current += 1
      setDragging(true)
    }
    const onDragLeave = (): void => {
      dragDepth.current -= 1
      if (dragDepth.current <= 0) setDragging(false)
    }
    const onDrop = (e: DragEvent): void => {
      e.preventDefault()
      dragDepth.current = 0
      setDragging(false)
      const file = e.dataTransfer?.files?.[0]
      if (file && file.name.toLowerCase().endsWith('.pdf')) void openFromDrop(file)
    }
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('dragenter', onDragEnter)
    window.addEventListener('dragleave', onDragLeave)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('dragenter', onDragEnter)
      window.removeEventListener('dragleave', onDragLeave)
      window.removeEventListener('drop', onDrop)
    }
  }, [openFromDrop])

  // ---- Render --------------------------------------------------------------

  const pageAnnotations = doc.annotations.filter((a) => a.pageIndex === currentPage)

  return (
    <div className={`app ${dragging ? 'dragging' : ''}`}>
      <Toolbar
        hasDocument={doc.hasDocument}
        isDirty={doc.isDirty}
        canUndo={doc.canUndo}
        canRedo={doc.canRedo}
        tool={tool}
        color={color}
        scale={scale}
        zoomMode={zoom.zoomMode}
        currentPage={currentPage}
        numPages={numPages}
        theme={theme}
        onOpen={() => void openFile()}
        onSave={() => void save(false)}
        onSaveAs={() => void save(true)}
        onUndo={doc.undo}
        onRedo={doc.redo}
        onToolChange={handleToolChange}
        onColorChange={setColor}
        onZoomIn={zoom.zoomIn}
        onZoomOut={zoom.zoomOut}
        onZoomActual={zoom.setActual}
        onFitWidth={zoom.fitWidth}
        onFitPage={zoom.fitPage}
        onPrevPage={prevPage}
        onNextPage={nextPage}
        onGoToPage={goToPage}
        onRotate={rotate}
        onDeletePage={deletePage}
        onDuplicatePage={duplicatePage}
        onInsertPdf={() => void insertPdf()}
        onExtractPage={() => void extractPage()}
        onExportPng={() => void exportPng()}
        onToggleFind={() => setShowFind((v) => !v)}
        onToggleTheme={toggleTheme}
        onPrint={() => void print()}
        onExport={() => setShowExport(true)}
        onToggleForms={() => setShowForm((v) => !v)}
        onShowInfo={() => setShowInfo(true)}
      />

      {showFind && pdfDoc && (
        <FindBar doc={pdfDoc} onClose={() => setShowFind(false)} onGoToPage={goToPage} />
      )}

      {doc.hasDocument && (
        <ToolOptionsBar
          tool={tool}
          stampPreset={stampPreset}
          onStampPreset={setStampPreset}
          pendingImage={pendingImage}
          onCreateSignature={() => setShowSignatureModal(true)}
        />
      )}

      <div className="workspace">
        {doc.hasDocument && pdfDoc && (
          <Sidebar
            doc={pdfDoc}
            numPages={numPages}
            currentPage={currentPage}
            onSelectPage={goToPage}
            onReorder={reorder}
          />
        )}

        <main className="viewer">
          {!doc.hasDocument && (
            <Welcome
              onOpen={() => void openFile()}
              recentFiles={recentFiles}
              onOpenRecent={(p) => void openRecent(p)}
            />
          )}

          {doc.hasDocument && loading && <div className="viewer-message">Загрузка документа…</div>}
          {doc.hasDocument && error && (
            <div className="viewer-message error">Ошибка: {error}</div>
          )}

          {doc.hasDocument && pdfDoc && !loading && (
            <div className="page-scroll" ref={scrollRef}>
              <div className="page-stage">
                <PdfCanvas doc={pdfDoc} pageIndex={currentPage} scale={scale} onSized={onSized} />
                {pageSize && (
                  <AnnotationLayer
                    pageIndex={currentPage}
                    size={pageSize}
                    scale={scale}
                    tool={tool}
                    color={color}
                    annotations={pageAnnotations}
                    pendingImage={pendingImage}
                    stampPreset={stampPreset}
                    onCommit={doc.addAnnotation}
                    onDelete={doc.deleteAnnotation}
                  />
                )}
              </div>
            </div>
          )}
        </main>

        {doc.hasDocument && showForm && (
          <FormPanel
            getFields={doc.getFormFields}
            onApply={async (values) => {
              const applied = await doc.applyFormValues(values)
              if (applied) setShowForm(false)
            }}
            onClose={() => setShowForm(false)}
          />
        )}
      </div>

      {doc.hasDocument && (
        <StatusBar
          name={doc.name}
          path={doc.path}
          isDirty={doc.isDirty}
          currentPage={currentPage}
          numPages={numPages}
          annotationCount={doc.annotations.length}
        />
      )}

      {dragging && <div className="drop-overlay">Отпустите, чтобы открыть PDF</div>}

      {showSignatureModal && (
        <SignatureModal
          onDone={(img) => {
            setPendingImage(img)
            setShowSignatureModal(false)
            setTool('signature')
          }}
          onCancel={() => setShowSignatureModal(false)}
        />
      )}

      {showExport && doc.hasDocument && (
        <ExportModal
          numPages={numPages}
          onExportRange={exportRange}
          onExportAllPng={exportAllPng}
          onClose={() => setShowExport(false)}
        />
      )}

      {showInfo && doc.hasDocument && (
        <InfoModal
          pdfDoc={pdfDoc}
          numPages={numPages}
          name={doc.name}
          onClose={() => setShowInfo(false)}
        />
      )}
    </div>
  )
}
