/**
 * Converts an HTML source (local file or URL) into PDF bytes by rendering it
 * in a hidden, sandboxed BrowserWindow and invoking Chromium's print-to-PDF.
 *
 * The window has no preload and no Node integration — it only ever renders
 * markup/JS from the source file/URL for printing, the same trust boundary a
 * regular browser tab would have.
 */
import { BrowserWindow } from 'electron'

/**
 * Overall deadline for the whole conversion (load + slide-deck detection +
 * optional print-pdf reload + settle + printToPDF). A single end-to-end bound
 * is used — rather than timing each await individually — so that a hang in
 * *any* step (a stalled navigation, a blocking script, a slow printToPDF)
 * still surfaces as an error instead of leaving the operation (and the modal
 * that disables its Close button while busy) stuck forever.
 */
const OPERATION_TIMEOUT_MS = 30_000
/** Extra settle time after 'did-finish-load' for slide decks to lay out (fonts, JS). */
const SETTLE_MS = 500

export interface HtmlConvertOptions {
  /** 'file' loads via loadFile (resolves relative assets in the same folder); 'url' via loadURL. */
  source: 'file' | 'url'
  value: string
}

async function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms)
  })
  try {
    return await Promise.race([promise, timeout])
  } finally {
    clearTimeout(timer!)
  }
}

/** Resolves once the main frame finishes loading, rejects if it fails to load. */
function waitForMainFrameLoad(win: BrowserWindow): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const onFinish = (): void => {
      win.webContents.removeListener('did-fail-load', onFail)
      resolve()
    }
    // did-fail-load fires for ANY frame (ads, embeds, analytics iframes), not
    // just the top-level navigation — ignore subframe failures so a broken
    // embedded widget doesn't abort an otherwise-successful main page load.
    const onFail = (
      _e: unknown,
      code: number,
      description: string,
      _url: string,
      isMainFrame: boolean
    ): void => {
      if (!isMainFrame) return
      win.webContents.removeListener('did-finish-load', onFinish)
      reject(new Error(`Не удалось загрузить содержимое (${code}): ${description}`))
    }
    win.webContents.once('did-finish-load', onFinish)
    win.webContents.on('did-fail-load', onFail)
  })
}

/**
 * Heuristic: does this page look like a reveal.js (or similar) slide deck?
 * reveal.js decks expose a global `Reveal` object and use a `.reveal` root.
 */
async function detectSlideDeck(win: BrowserWindow): Promise<boolean> {
  try {
    return await win.webContents.executeJavaScript(
      `Boolean(window.Reveal || document.querySelector('.reveal, .slides, [data-reveal]'))`,
      true
    )
  } catch {
    return false
  }
}

async function runConversion(win: BrowserWindow, opts: HtmlConvertOptions): Promise<Uint8Array> {
  const loaded = waitForMainFrameLoad(win)
  if (opts.source === 'file') {
    void win.loadFile(opts.value)
  } else {
    void win.loadURL(opts.value)
  }
  await loaded

  // reveal.js and similar frameworks expose a dedicated print layout that
  // lays every slide out as its own printable page.
  const isDeck = await detectSlideDeck(win)
  if (isDeck) {
    const current = win.webContents.getURL()
    const printUrl = appendQueryParam(current, 'print-pdf')
    if (printUrl !== current) {
      const reloaded = waitForMainFrameLoad(win)
      void win.loadURL(printUrl)
      await reloaded
    }
  }

  // Let webfonts/JS-driven layout (charts, slide frameworks) settle.
  await new Promise((r) => setTimeout(r, SETTLE_MS))

  const pdf = await win.webContents.printToPDF({
    landscape: isDeck,
    pageSize: 'A4',
    printBackground: true,
    preferCSSPageSize: true
  })
  return new Uint8Array(pdf)
}

export async function convertHtmlToPdf(opts: HtmlConvertOptions): Promise<Uint8Array> {
  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      offscreen: false
    }
  })
  // Untrusted content (ads, analytics, a stray link) could call window.open();
  // without an explicit handler Electron's default is to open a new *visible*
  // window, which would surface in the middle of a silent background
  // conversion. Deny it — nothing in this flow should ever need a popup.
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

  try {
    return await withTimeout(
      runConversion(win, opts),
      OPERATION_TIMEOUT_MS,
      'Превышено время ожидания преобразования страницы'
    )
  } finally {
    if (!win.isDestroyed()) win.destroy()
  }
}

function appendQueryParam(url: string, param: string): string {
  try {
    const u = new URL(url)
    if (u.searchParams.has(param)) return url
    u.searchParams.set(param, 'true')
    return u.toString()
  } catch {
    return url
  }
}
