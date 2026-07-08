// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { sanitizeForPreview } from './htmlSanitize'

describe('sanitizeForPreview', () => {
  it('strips <script> tags entirely', () => {
    const out = sanitizeForPreview('<html><body><script>alert(1)</script>Hi</body></html>')
    expect(out).not.toContain('<script')
    expect(out).toContain('Hi')
  })

  it('strips inline event-handler attributes', () => {
    const out = sanitizeForPreview('<button onclick="alert(1)">Click</button>')
    expect(out).not.toContain('onclick')
  })

  it('strips javascript: URLs', () => {
    const out = sanitizeForPreview('<a href="javascript:alert(1)">link</a>')
    expect(out).not.toContain('javascript:')
  })

  it('strips data:text/html URLs', () => {
    const out = sanitizeForPreview('<a href="data:text/html,<script>alert(1)</script>">link</a>')
    expect(out.toLowerCase()).not.toContain('data:text/html')
  })

  it('strips meta refresh redirects', () => {
    const out = sanitizeForPreview('<meta http-equiv="refresh" content="0;url=https://evil.example">')
    expect(out.toLowerCase()).not.toContain('refresh')
  })

  it('removes nested iframes, objects, and embeds', () => {
    const out = sanitizeForPreview(
      '<iframe src="https://evil.example"></iframe><object data="x.swf"></object><embed src="x.swf">'
    )
    expect(out).not.toContain('<iframe')
    expect(out).not.toContain('<object')
    expect(out).not.toContain('<embed')
  })

  it('strips <base> tags so relative paths cannot be redirected off-disk', () => {
    const out = sanitizeForPreview('<base href="https://evil.example/">')
    expect(out).not.toContain('<base')
  })

  it('strips remote http(s) resource references to stay offline-first', () => {
    const out = sanitizeForPreview(
      '<link rel="stylesheet" href="https://evil.example/x.css"><img src="http://evil.example/x.png">'
    )
    expect(out).not.toContain('evil.example')
  })

  it('neutralizes svg-embedded scripts', () => {
    const out = sanitizeForPreview('<svg><script>alert(1)</script></svg>')
    expect(out).not.toContain('<script')
  })

  it('injects a restrictive Content-Security-Policy meta tag', () => {
    const out = sanitizeForPreview('<p>hello</p>')
    expect(out).toContain('Content-Security-Policy')
    expect(out).toContain("script-src 'none'")
  })

  it('leaves benign markup and text content intact', () => {
    const out = sanitizeForPreview('<h1>Title</h1><p>Some <b>bold</b> text.</p>')
    expect(out).toContain('<h1>Title</h1>')
    expect(out).toContain('<b>bold</b>')
  })
})
