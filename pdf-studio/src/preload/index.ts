import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import {
  IpcChannels,
  type OpenedFile,
  type SaveResult,
  type DocumentState,
  type MenuCommand,
  type RecentFile
} from '../shared/ipc'

/** Typed, minimal surface exposed to the renderer. */
const api = {
  openPdfDialog: (): Promise<OpenedFile | null> => ipcRenderer.invoke(IpcChannels.openPdfDialog),
  readPdf: (path: string): Promise<OpenedFile | null> =>
    ipcRenderer.invoke(IpcChannels.readPdf, path),
  savePdf: (path: string, data: Uint8Array): Promise<SaveResult> =>
    ipcRenderer.invoke(IpcChannels.savePdf, path, data),
  savePdfAs: (suggestedName: string, data: Uint8Array): Promise<SaveResult> =>
    ipcRenderer.invoke(IpcChannels.savePdfAs, suggestedName, data),
  savePngAs: (suggestedName: string, data: Uint8Array): Promise<SaveResult> =>
    ipcRenderer.invoke(IpcChannels.savePngAs, suggestedName, data),
  getRecentFiles: (): Promise<RecentFile[]> => ipcRenderer.invoke(IpcChannels.getRecentFiles),
  addRecentFile: (path: string): void => ipcRenderer.send(IpcChannels.addRecentFile, path),
  notifyDocumentState: (state: DocumentState): void =>
    ipcRenderer.send(IpcChannels.documentStateChanged, state),
  onMenuCommand: (handler: (command: MenuCommand) => void): (() => void) => {
    const listener = (_e: unknown, command: MenuCommand): void => handler(command)
    ipcRenderer.on(IpcChannels.menuCommand, listener)
    return () => ipcRenderer.removeListener(IpcChannels.menuCommand, listener)
  }
}

export type PdfApi = typeof api

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define on window when context isolation is disabled)
  window.electron = electronAPI
  // @ts-ignore
  window.api = api
}
