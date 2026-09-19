import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'
import type { Map as MapboxMap } from 'mapbox-gl'

export function WindOverlay({ mapRef, enabled, directionDeg, windKmh }: {
  mapRef: RefObject<MapboxMap | null>; enabled: boolean; directionDeg: number; windKmh: number
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = canvasRef.current
    if (!enabled || !canvas) return
    const context = canvas.getContext('2d')
    if (!context) return
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')
    let frame = 0
    let width = 0
    let height = 0
    const draw = (time: number) => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2)
      context.setTransform(ratio, 0, 0, ratio, 0, 0)
      context.clearRect(0, 0, width, height)
      const angle = (directionDeg - (mapRef.current?.getBearing() ?? 0)) * Math.PI / 180
      const dx = Math.sin(angle)
      const dy = -Math.cos(angle)
      const shift = reduced.matches ? 0 : time / 1000 * (18 + windKmh * 0.8)
      const count = Math.max(24, Math.min(120, Math.round(width * height / 11000)))
      context.lineWidth = 1.2
      context.strokeStyle = '#c2dcec'
      for (let i = 0; i < count; i += 1) {
        const x = (((i * 0.6180339887 % 1) * width + dx * shift) % (width + 80) + width + 80) % (width + 80) - 40
        const y = (((i * 0.4142135623 % 1) * height + dy * shift) % (height + 80) + height + 80) % (height + 80) - 40
        context.globalAlpha = reduced.matches ? 0.5 : 0.2 + 0.3 * (Math.sin(i + time / 1200) + 1) / 2
        context.beginPath()
        context.moveTo(x - dx * 24, y - dy * 24)
        context.lineTo(x, y)
        context.lineTo(x - dx * 6 - dy * 3, y - dy * 6 + dx * 3)
        context.moveTo(x, y)
        context.lineTo(x - dx * 6 + dy * 3, y - dy * 6 - dx * 3)
        context.stroke()
      }
    }
    const animate = (time: number) => { draw(time); frame = requestAnimationFrame(animate) }
    const restart = () => {
      cancelAnimationFrame(frame)
      draw(performance.now())
      if (!reduced.matches) frame = requestAnimationFrame(animate)
    }
    const resize = new ResizeObserver(() => {
      width = canvas.clientWidth
      height = canvas.clientHeight
      const ratio = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.round(width * ratio)
      canvas.height = Math.round(height * ratio)
      draw(performance.now())
    })
    resize.observe(canvas)
    const map = mapRef.current
    const rotate = () => { if (reduced.matches) draw(performance.now()) }
    map?.on('rotate', rotate)
    reduced.addEventListener('change', restart)
    restart()
    return () => {
      cancelAnimationFrame(frame)
      resize.disconnect()
      reduced.removeEventListener('change', restart)
      map?.off('rotate', rotate)
    }
  }, [enabled, directionDeg, windKmh, mapRef])
  return <canvas ref={canvasRef} className="wind-overlay" aria-hidden="true" style={{ display: enabled ? 'block' : 'none' }} />
}
