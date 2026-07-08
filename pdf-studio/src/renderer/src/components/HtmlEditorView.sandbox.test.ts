import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { describe, expect, it } from 'vitest'

const here = dirname(fileURLToPath(import.meta.url))

describe('HtmlEditorView preview iframe sandbox', () => {
  it('never combines allow-scripts with allow-same-origin', () => {
    // This is a security invariant, not an implementation detail: the preview
    // iframe must never be able to both execute script AND retain the
    // embedding document's origin — that combination is the classic
    // Electron/Chromium sandbox-escape pattern. Guarding it as a source-level
    // test means a future edit can't silently combine them without a test
    // failure flagging it, even though this feature has no component-render
    // test harness set up yet.
    const source = readFileSync(join(here, 'HtmlEditorView.tsx'), 'utf-8')
    const match = source.match(/sandbox=["']([^"']*)["']/)
    expect(match, 'expected a sandbox="..." attribute on the preview iframe').not.toBeNull()
    const tokens = (match?.[1] ?? '').split(/\s+/)
    expect(tokens).not.toContain('allow-scripts')
  })
})
