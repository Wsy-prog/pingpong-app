import { useState, useEffect, useCallback } from 'react'

interface FullscreenState {
  isFullscreen: boolean
  isLandscape: boolean
  apiSupported: boolean
}

export function useFullscreen() {
  const [state, setState] = useState<FullscreenState>({
    isFullscreen: false,
    isLandscape: false,
    apiSupported: true,
  })

  // Detect actual orientation
  const checkOrientation = useCallback(() => {
    if (window.matchMedia('(orientation: landscape)').matches) {
      setState(prev => (prev.isLandscape ? prev : { ...prev, isLandscape: true }))
    } else {
      setState(prev => (!prev.isLandscape ? prev : { ...prev, isLandscape: false }))
    }
  }, [])

  // Listen for fullscreen changes (covers Esc key, browser back, etc.)
  useEffect(() => {
    const onFullscreenChange = () => {
      const fs = !!document.fullscreenElement
      setState(prev => ({
        ...prev,
        isFullscreen: fs,
        // If exiting fullscreen, also unlock orientation
      }))
      if (!fs) {
        // Try to unlock orientation when exiting fullscreen
        try {
          if ('orientation' in screen && (screen.orientation as any)?.unlock) {
            (screen.orientation as any).unlock()
          }
        } catch { /* ignore */ }
      }
    }

    document.addEventListener('fullscreenchange', onFullscreenChange)
    // Also listen for webkit fullscreen (iOS)
    document.addEventListener('webkitfullscreenchange', onFullscreenChange)

    return () => {
      document.removeEventListener('fullscreenchange', onFullscreenChange)
      document.removeEventListener('webkitfullscreenchange', onFullscreenChange)
    }
  }, [])

  // Listen for orientation changes
  useEffect(() => {
    const mql = window.matchMedia('(orientation: landscape)')
    checkOrientation()
    const handler = () => checkOrientation()
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [checkOrientation])

  const enterFullscreen = useCallback(async () => {
    try {
      // Request fullscreen first
      const el = document.documentElement
      if (el.requestFullscreen) {
        await el.requestFullscreen()
      } else if ((el as any).webkitRequestFullscreen) {
        await (el as any).webkitRequestFullscreen()
      }

      setState(prev => ({ ...prev, isFullscreen: true }))

      // Then lock orientation (best-effort, may fail on some browsers)
      try {
        if ('orientation' in screen && (screen.orientation as any)?.lock) {
          await (screen.orientation as any).lock('landscape')
        }
      } catch {
        // Orientation lock failed, but fullscreen still succeeded
      }
    } catch {
      // Fullscreen failed — API not supported or user denied
      setState(prev => ({ ...prev, apiSupported: false }))
    }
  }, [])

  const exitFullscreen = useCallback(async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen()
      } else if ((document as any).webkitFullscreenElement) {
        await (document as any).webkitExitFullscreen()
      }
      // Unlock orientation
      try {
        if ('orientation' in screen && (screen.orientation as any)?.unlock) {
          (screen.orientation as any).unlock()
        }
      } catch { /* ignore */ }
    } catch { /* ignore */ }
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Don't exit fullscreen on unmount — let the next page handle it
      try {
        if ('orientation' in screen && (screen.orientation as any)?.unlock) {
          (screen.orientation as any).unlock()
        }
      } catch { /* ignore */ }
    }
  }, [])

  return {
    ...state,
    enterFullscreen,
    exitFullscreen,
  }
}
