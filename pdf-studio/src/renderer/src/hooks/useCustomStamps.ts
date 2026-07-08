import { useCallback, useEffect, useState } from 'react'
import type { StampPreset } from '../lib/annotations'

const STORAGE_KEY = 'pdf-studio:custom-stamps'
/** Bounds a corrupted/tampered-with localStorage entry from bloating the
 * toolbar with an unbounded number of stamp chips. */
const MAX_STAMPS = 100
const MAX_FIELD_LENGTH = 200

function load(): StampPreset[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter(
        (p): p is StampPreset =>
          !!p &&
          typeof p.id === 'string' &&
          typeof p.label === 'string' &&
          typeof p.color === 'string' &&
          typeof p.text === 'string' &&
          p.id.length <= MAX_FIELD_LENGTH &&
          p.label.length <= MAX_FIELD_LENGTH &&
          p.text.length <= MAX_FIELD_LENGTH
      )
      .slice(0, MAX_STAMPS)
  } catch {
    return []
  }
}

export interface CustomStampsController {
  stamps: StampPreset[]
  addStamp(label: string, color: string): StampPreset
  removeStamp(id: string): void
}

/**
 * Persists user-created stamp presets across documents and app restarts
 * (Foxit's "Stamps Palette" is the closest competitor precedent) — a small
 * addition on top of the existing STAMP_PRESETS/stampPreset plumbing rather
 * than a new annotation type.
 */
export function useCustomStamps(): CustomStampsController {
  const [stamps, setStamps] = useState<StampPreset[]>(load)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stamps))
    } catch {
      // Storage unavailable/full — custom stamps simply won't persist this session.
    }
  }, [stamps])

  const addStamp = useCallback((label: string, color: string): StampPreset => {
    const preset: StampPreset = {
      id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      label,
      color,
      text: label
    }
    setStamps((prev) => [...prev, preset])
    return preset
  }, [])

  const removeStamp = useCallback((id: string) => {
    setStamps((prev) => prev.filter((s) => s.id !== id))
  }, [])

  return { stamps, addStamp, removeStamp }
}
