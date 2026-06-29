import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join, basename } from 'path'
import { readFile, writeFile } from 'fs/promises'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { IpcChannels, type OpenedFile, type SaveResult, type DocumentState } from '../shared/ipc'
import { buildMenu } from './menu'

let mainWindow: BrowserWindow | null = null

/** Last document state reported by the renderer, used to drive native menus. */
let documentState: DocumentState = {
  hasDocument: false,
  isDirty: false,
  canUndo: false,
  canRedo: false
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 940,
    minHeight: 600,
    show: false,
    autoHideMenuBar: false,
    title: 'PDF Studio',
    backgroundColor: '#1f2430',
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
      contextIsolation: true
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  buildMenu(mainWindow, () => documentState)
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.pdfstudio.app')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  registerIpcHandlers()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

const PDF_FILTERS = [{ name: 'PDF Documents', extensions: ['pdf'] }]

function registerIpcHandlers(): void {
  // Show an open dialog and return the selected file's bytes (or null).
  ipcMain.handle(IpcChannels.openPdfDialog, async (): Promise<OpenedFile | null> => {
    if (!mainWindow) return null
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
      title: 'Открыть PDF',
      properties: ['openFile'],
      filters: PDF_FILTERS
    })
    if (canceled || filePaths.length === 0) return null
    return readPdfFile(filePaths[0])
  })

  // Read an already-known path (e.g. opened from the OS / CLI argument).
  ipcMain.handle(IpcChannels.readPdf, async (_e, path: string): Promise<OpenedFile | null> => {
    return readPdfFile(path)
  })

  // Save bytes to a known path. Returns the path so the renderer can clear dirty state.
  ipcMain.handle(
    IpcChannels.savePdf,
    async (_e, path: string, data: Uint8Array): Promise<SaveResult> => {
      await writeFile(path, data)
      return { canceled: false, path }
    }
  )

  // Prompt for a destination and write the bytes there.
  ipcMain.handle(
    IpcChannels.savePdfAs,
    async (_e, suggestedName: string, data: Uint8Array): Promise<SaveResult> => {
      if (!mainWindow) return { canceled: true, path: null }
      const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
        title: 'Сохранить PDF как…',
        defaultPath: suggestedName,
        filters: PDF_FILTERS
      })
      if (canceled || !filePath) return { canceled: true, path: null }
      await writeFile(filePath, data)
      return { canceled: false, path: filePath }
    }
  )

  // Renderer keeps us informed so menu items reflect document availability.
  ipcMain.on(IpcChannels.documentStateChanged, (_e, state: DocumentState) => {
    documentState = state
    if (mainWindow) buildMenu(mainWindow, () => documentState)
  })
}

async function readPdfFile(path: string): Promise<OpenedFile | null> {
  try {
    const buffer = await readFile(path)
    return { path, name: basename(path), data: new Uint8Array(buffer) }
  } catch {
    return null
  }
}
