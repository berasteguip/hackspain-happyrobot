import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'
import type { Map as MapboxMap } from 'mapbox-gl'

type Particle = { x: number; y: number; age: number; life: number; speed: number; wander: number }

function hash(seed: number) {
  const value = Math.sin(seed * 127.1) * 43758.5453
  return value - Math.floor(value)
}

function spawn(width: number, height: number, index: number, windKmh: number): Particle {
  return {
    x: hash(index + 1.1) * width,
    y: hash(index + 2.3) * height,
    age: hash(index + 3.7) * 90,
    life: 36 + hash(index + 4.9) * (48 + windKmh),
    speed: 0.55 + hash(index + 6.1) * 0.85,
    wander: (hash(index + 7.3) - 0.5) * 0.28,
  }
}

function fieldCount(width: number, height: number) {
  return Math.max(420, Math.min(1600, Math.round(width * height / 2600)))
}

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
    let particles: Particle[] = []

    const heading = () => (directionDeg - (mapRef.current?.getBearing() ?? 0)) * Math.PI / 180

    const seed = () => {
      const count = fieldCount(width, height)
      particles = Array.from({ length: count }, (_, index) => spawn(width, height, index + 1, windKmh))
    }

    const step = (fade: boolean) => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2)
      context.setTransform(ratio, 0, 0, ratio, 0, 0)
      if (fade) {
        context.globalCompositeOperation = 'destination-out'
        context.fillStyle = `rgba(0, 0, 0, ${0.045 + (1 - Math.min(windKmh, 60) / 60) * 0.03})`
        context.fillRect(0, 0, width, height)
      } else {
        context.clearRect(0, 0, width, height)
      }
      const angle = heading()
      const force = 0.28 + windKmh * 0.04
      const strength = Math.min(1, 0.28 + windKmh / 70)
      context.globalCompositeOperation = 'lighter'
      context.lineCap = 'round'
      context.lineWidth = 1.05 + strength * 0.4
      for (let i = 0; i < particles.length; i += 1) {
        const particle = particles[i]
        const dir = angle + particle.wander
        const dx = Math.sin(dir)
        const dy = -Math.cos(dir)
        const travel = reduced.matches ? 7 + strength * 9 : force * particle.speed
        const x0 = particle.x
        const y0 = particle.y
        const x1 = x0 + dx * travel
        const y1 = y0 + dy * travel
        if (!reduced.matches) {
          particle.x = x1
          particle.y = y1
          particle.age += 1
        }
        const margin = 40
        if (particle.x < -margin || particle.x > width + margin || particle.y < -margin || particle.y > height + margin || particle.age > particle.life) {
          particles[i] = spawn(width, height, i + particle.age + 11, windKmh)
          continue
        }
        const life = 1 - particle.age / particle.life
        context.strokeStyle = `rgba(226, 240, 250, ${(0.16 + 0.38 * strength) * life})`
        context.beginPath()
        context.moveTo(x0, y0)
        context.lineTo(x1, y1)
        context.stroke()
      }
    }

    const animate = () => {
      step(true)
      frame = requestAnimationFrame(animate)
    }

    const restart = () => {
      cancelAnimationFrame(frame)
      seed()
      context.setTransform(1, 0, 0, 1, 0, 0)
      context.clearRect(0, 0, canvas.width, canvas.height)
      const warmup = reduced.matches ? 1 : 55
      for (let i = 0; i < warmup; i += 1) step(!reduced.matches && i > 0)
      if (!reduced.matches) frame = requestAnimationFrame(animate)
    }

    const resize = new ResizeObserver(() => {
      width = canvas.clientWidth
      height = canvas.clientHeight
      const ratio = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.round(width * ratio)
      canvas.height = Math.round(height * ratio)
      restart()
    })
    resize.observe(canvas)
    const map = mapRef.current
    const rotate = () => { if (reduced.matches) step(false) }
    map?.on('rotate', rotate)
    reduced.addEventListener('change', restart)
    return () => {
      cancelAnimationFrame(frame)
      resize.disconnect()
      reduced.removeEventListener('change', restart)
      map?.off('rotate', rotate)
    }
  }, [enabled, directionDeg, windKmh, mapRef])
  return <canvas ref={canvasRef} className="wind-overlay" aria-hidden="true" style={{ display: enabled ? 'block' : 'none' }} />
}
