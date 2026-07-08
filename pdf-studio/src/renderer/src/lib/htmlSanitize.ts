/**
 * Prepares untrusted HTML for read-only rendering in the live-editor preview
 * iframe. This is a defense-in-depth layer: the preview iframe itself never
 * carries `allow-scripts`, so even HTML this function fails to catch cannot
 * execute — but stripping known-dangerous constructs here keeps the preview
 * from doing anything surprising (redirects, external fetches, popups).
 *
 * Never used on the save path: the literal source text typed in the editor
 * is always what gets written to disk, untouched.
 */
export function sanitizeForPreview(html: string): string {
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')

  doc.querySelectorAll('script, iframe, object, embed, base').forEach((el) => el.remove())
  doc.querySelectorAll('meta[http-equiv]').forEach((el) => {
    if (el.getAttribute('http-equiv')?.toLowerCase() === 'refresh') el.remove()
  })

  doc.querySelectorAll('*').forEach((el) => {
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase()
      if (name.startsWith('on')) {
        el.removeAttribute(attr.name)
        continue
      }
      if (name === 'href' || name === 'src' || name === 'action' || name === 'formaction') {
        const value = attr.value.trim().toLowerCase()
        if (value.startsWith('javascript:') || value.startsWith('data:text/html')) {
          el.removeAttribute(attr.name)
        }
      }
    }
  })

  // Offline-first: never let the preview phone home for remote resources.
  // The injected CSP below is the primary enforcement (it blocks the actual
  // fetch regardless of which DOM attribute triggers it); this pass is
  // defense-in-depth so the guarantee holds even if default-src is ever
  // loosened for a future feature (e.g. an img-src allowance).
  const REMOTE_URL = /^(https?:)?\/\//i
  doc.querySelectorAll('link[href], img[src], source[src], video[src], video[poster], audio[src], track[src]').forEach(
    (el) => {
      for (const attr of ['href', 'src', 'poster']) {
        const value = el.getAttribute(attr)
        if (value && REMOTE_URL.test(value)) el.removeAttribute(attr)
      }
    }
  )
  doc.querySelectorAll('img[srcset], source[srcset]').forEach((el) => {
    const value = el.getAttribute('srcset') ?? ''
    if (REMOTE_URL.test(value)) el.removeAttribute('srcset')
  })
  doc.querySelectorAll('image, use').forEach((el) => {
    for (const attr of ['href', 'xlink:href']) {
      const value = el.getAttribute(attr)
      if (value && REMOTE_URL.test(value)) el.removeAttribute(attr)
    }
  })

  const csp = doc.createElement('meta')
  csp.setAttribute('http-equiv', 'Content-Security-Policy')
  csp.setAttribute(
    'content',
    "default-src 'self' data:; script-src 'none'; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'"
  )
  doc.head?.prepend(csp)

  return `<!DOCTYPE html>${doc.documentElement.outerHTML}`
}
