import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'
import type { Map as MapboxMap } from 'mapbox-gl'
import { destination } from './geo'
import { advanceWindPosition, windParticleOpacity, windVisualStyle } from './wind'

type Position = [number, number]
type Particle = { position: Position; age: number; lifetime: number; speed: number; length: number; opacity: number; width: number }

export function WindOverlay({ mapRef, enabled, directionDeg, windKmh }: {
  mapRef: RefObject<MapboxMap | null>; enabled: boolean; directionDeg: number; windKmh: number
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = canvasRef.current
    const map = mapRef.current
    if (!enabled || !canvas || !map) return
    const context = canvas.getContext('2d')
    if (!context) return
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')
    let frame = 0
    let width = 0
    let height = 0
    let ratio = 1
    let lastTime: number | null = null
    const particles: Particle[] = []
    const padding = 50
    const spawn = (initial = false): Particle => {
      const point = map.unproject([Math.random() * (width + padding * 2) - padding, Math.random() * (height + padding * 2) - padding])
      const lifetime = 9 + Math.random() * 7
      return {
        position: [point.lng, point.lat], age: initial ? Math.random() * lifetime : 0, lifetime,
        speed: 0.75 + Math.random() * 0.5, length: 0.65 + Math.random() * 0.6,
        opacity: 0.55 + Math.random() * 0.35, width: 1.2 + Math.random() * 0.8,
      }
    }
    const draw = (time: number, advance = false) => {
      const delta = advance && lastTime !== null ? Math.min(0.05, Math.max(0, (time - lastTime) / 1000)) : 0
      if (advance) lastTime = time
      context.setTransform(ratio, 0, 0, ratio, 0, 0)
      context.clearRect(0, 0, width, height)
      if (!width || !height) return
      const zoom = map.getZoom()
      const style = windVisualStyle(zoom, windKmh, width, height)
      const metersPerPixel = 40075016.686 * Math.cos(map.getCenter().lat * Math.PI / 180) / (512 * 2 ** zoom)
      const initial = particles.length === 0
      while (particles.length < style.count) particles.push(spawn(initial || reduced.matches))
      if (particles.length > style.count) particles.length = style.count
      context.lineCap = 'round'
      for (let i = 0; i < particles.length; i++) {
        let particle = particles[i]
        if (!reduced.matches && advance) {
          particle.age += delta
          particle.position = advanceWindPosition(particle.position, directionDeg, style.speedPx * metersPerPixel * particle.speed, delta)
        }
        let head = map.project(particle.position)
        if (particle.age >= particle.lifetime || head.x < -padding || head.y < -padding || head.x > width + padding || head.y > height + padding) {
          particle = spawn(reduced.matches)
          particles[i] = particle
          head = map.project(particle.position)
        }
        const alpha = particle.opacity * windParticleOpacity(particle.age, particle.lifetime)
        if (alpha < 0.008) continue
        const tail = map.project(destination(...particle.position, directionDeg + 180, style.trailPx * metersPerPixel * particle.length))
        const gradient = context.createLinearGradient(tail.x, tail.y, head.x, head.y)
        gradient.addColorStop(0, 'rgba(225, 238, 246, 0)')
        gradient.addColorStop(0.35, `rgba(225, 238, 246, ${alpha * 0.65})`)
        gradient.addColorStop(1, `rgba(248, 252, 255, ${alpha})`)
        context.strokeStyle = gradient
        context.lineWidth = particle.width
        context.beginPath()
        context.moveTo(tail.x, tail.y)
        context.lineTo(head.x, head.y)
        context.stroke()
      }
    }
    const animate = (time: number) => {
      draw(time, true)
      frame = requestAnimationFrame(animate)
    }
    const restart = () => {
      cancelAnimationFrame(frame)
      lastTime = null
      if (document.hidden) return
      draw(performance.now())
      if (!reduced.matches && windKmh > 0) frame = requestAnimationFrame(animate)
    }
    const resize = new ResizeObserver(() => {
      width = canvas.clientWidth
      height = canvas.clientHeight
      ratio = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.round(width * ratio)
      canvas.height = Math.round(height * ratio)
      draw(performance.now())
    })
    const move = () => { if (reduced.matches && !document.hidden) draw(performance.now()) }
    resize.observe(canvas)
    map.on('move', move)
    reduced.addEventListener('change', restart)
    document.addEventListener('visibilitychange', restart)
    restart()
    return () => {
      cancelAnimationFrame(frame)
      resize.disconnect()
      reduced.removeEventListener('change', restart)
      document.removeEventListener('visibilitychange', restart)
      map.off('move', move)
    }
  }, [enabled, directionDeg, windKmh, mapRef])
  return <canvas ref={canvasRef} className="wind-overlay" aria-hidden="true" style={{ display: enabled ? 'block' : 'none' }} />
}
