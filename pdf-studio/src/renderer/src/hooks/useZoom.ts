import { useCallback, useEffect, useMemo, useState, type RefObject } from 'react'

export type ZoomMode = 'custom' | 'actual' | 'fit-width' | 'fit-page'

const MIN_SCALE = 0.25
const MAX_SCALE = 4
const STEP = 0.2
/** Matches the .page-scroll padding (28px on each side) so fit leaves a margin. */
const PADDING = 56

const clamp = (s: number): number => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s))

interface PageBase {
  width: number
  height: number
}

export interface ZoomController {
  scale: number
  zoomMode: ZoomMode
  zoomIn(): void
  zoomOut(): void
  setActual(): void
  fitWidth(): void
  fitPage(): void
}

/**
 * Centralizes zoom state. In a fit mode the scale is derived from the container
 * size and the current page's base dimensions, and recomputed on resize or when
 * the page changes.
 */
export function useZoom(
  basePageSize: PageBase | null,
  containerRef: RefObject<HTMLElement>
): ZoomController {
  const [scale, setScale] = useState(1)
  const [zoomMode, setZoomMode] = useState<ZoomMode>('actual')

  const computeFit = useCallback(
    (mode: ZoomMode): number | null => {
      const el = containerRef.current
      if (!basePageSize || !el) return null
      const cw = el.clientWidth - PADDING
      const ch = el.clientHeight - PADDING
      if (cw <= 0 || ch <= 0) return null
      if (mode === 'fit-width') return cw / basePageSize.width
      if (mode === 'fit-page') return Math.min(cw / basePageSize.width, ch / basePageSize.height)
      return null
    },
    [basePageSize, containerRef]
  )

  // Recompute when entering a fit mode or when the page/base size changes.
  useEffect(() => {
    if (zoomMode === 'fit-width' || zoomMode === 'fit-page') {
      const s = computeFit(zoomMode)
      if (s) setScale(clamp(s))
    }
  }, [zoomMode, computeFit])

  // Keep fit modes correct as the window/container resizes.
  useEffect(() => {
    const el = containerRef.current
    if (!el || (zoomMode !== 'fit-width' && zoomMode !== 'fit-page')) return
    const ro = new ResizeObserver(() => {
      const s = computeFit(zoomMode)
      if (s) setScale(clamp(s))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [zoomMode, computeFit, containerRef])

  const zoomIn = useCallback(() => {
    setZoomMode('custom')
    setScale((s) => clamp(+(s + STEP).toFixed(2)))
  }, [])
  const zoomOut = useCallback(() => {
    setZoomMode('custom')
    setScale((s) => clamp(+(s - STEP).toFixed(2)))
  }, [])
  const setActual = useCallback(() => {
    setZoomMode('actual')
    setScale(1)
  }, [])
  const fitWidth = useCallback(() => setZoomMode('fit-width'), [])
  const fitPage = useCallback(() => setZoomMode('fit-page'), [])

  return useMemo(
    () => ({ scale, zoomMode, zoomIn, zoomOut, setActual, fitWidth, fitPage }),
    [scale, zoomMode, zoomIn, zoomOut, setActual, fitWidth, fitPage]
  )
}
