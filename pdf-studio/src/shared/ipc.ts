/**
 * Shared IPC contract between the Electron main process and the renderer.
 * Keeping channel names and payload shapes in one place avoids drift between
 * the `preload` bridge and the React app.
 */

export const IpcChannels = {
  openPdfDialog: 'pdf:open-dialog',
  readPdf: 'pdf:read',
  savePdf: 'pdf:save',
  savePdfAs: 'pdf:save-as',
  // Renderer -> main notifications used to keep native menus in sync.
  documentStateChanged: 'pdf:document-state-changed',
  // Main -> renderer commands dispatched from the application menu.
  menuCommand: 'menu:command'
} as const

export interface OpenedFile {
  /** Absolute path on disk, or `null` for an in-memory / unsaved document. */
  path: string | null
  /** Suggested display name (file name without directory). */
  name: string
  /** Raw PDF bytes. */
  data: Uint8Array
}

export interface SaveResult {
  canceled: boolean
  path: string | null
}

/** Commands the native menu can ask the renderer to perform. */
export type MenuCommand =
  | 'open'
  | 'save'
  | 'save-as'
  | 'close-document'
  | 'zoom-in'
  | 'zoom-out'
  | 'zoom-reset'
  | 'next-page'
  | 'prev-page'
  | 'rotate-page'
  | 'delete-page'
  | 'undo'
  | 'redo'
  | 'find'

/** State the renderer reports so the main process can enable/disable menus. */
export interface DocumentState {
  hasDocument: boolean
  isDirty: boolean
  canUndo: boolean
  canRedo: boolean
}
