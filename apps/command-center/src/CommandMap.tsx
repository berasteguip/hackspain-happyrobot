import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import type { GeoJSONSource } from 'mapbox-gl'
import type { FeatureCollection, Polygon, Point, LineString } from 'geojson'
import { FIRE_CELL_SIZE_M } from './scenario'
import type { Incident } from './scenario'
import { destination, haversineMeters } from './geo'
import type { CallArea, Citizen, FireSpot, MapLayers, PaintedFire, SafeZone } from './types'
import { TRIAGE_COLOR, TRIAGE_ORDER } from './crisisApi'
import { EXPOSURE_COLOR, EXPOSURE_LABEL, forecastHeatPoints } from './fire-model'
import type { Exposure, FireForecast } from './fire-model'
import { CENTER_COLOR, SITE_EMOJI } from './response'
import type { ResponseCenter } from './response'
import type { RefugeRoute } from './routing'
import type { RecommendedAreas } from './risk'
import { UNIT_STATUS_LABEL } from './units'
import type { DispatchUnit } from './units'
import { DEMO_PEOPLE } from './demo-points'
import { WindOverlay } from './WindOverlay'

const PERSON_COLOR = '#459eff'
/** Rojo de «nadie descolgó». Distinto del rojo del triaje crítico a ojo, pero de la misma familia. */
const NO_ANSWER_COLOR = '#ff3b3b'

/**
 * El helicóptero visto desde arriba: fuselaje oscuro, cola y un disco de rotor luminoso, que es
 * lo que se reconoce en un mapa nocturno. Mira hacia arriba; la capa lo gira con el rumbo.
 */
function helicopterMarker() {
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 128
  const context = canvas.getContext('2d')!
  // disco del rotor
  const disc = context.createRadialGradient(64, 60, 10, 64, 60, 50)
  disc.addColorStop(0, '#d9f1ff10')
  disc.addColorStop(0.75, '#c9e7ff28')
  disc.addColorStop(0.9, '#c9e7ff88')
  disc.addColorStop(1, '#c9e7ff00')
  context.fillStyle = disc
  context.beginPath()
  context.arc(64, 60, 50, 0, Math.PI * 2)
  context.fill()
  context.strokeStyle = '#e6f4ff'
  context.lineWidth = 1.5
  context.beginPath()
  context.arc(64, 60, 46, 0, Math.PI * 2)
  context.stroke()
  // palas
  context.strokeStyle = '#f4faffcc'
  context.lineWidth = 3
  for (const angle of [0.3, 0.3 + Math.PI / 2]) {
    context.beginPath()
    context.moveTo(64 + Math.cos(angle) * 46, 60 + Math.sin(angle) * 46)
    context.lineTo(64 - Math.cos(angle) * 46, 60 - Math.sin(angle) * 46)
    context.stroke()
  }
  // cola
  context.fillStyle = '#17232b'
  context.beginPath()
  context.roundRect(60, 74, 8, 44, 4)
  context.fill()
  context.fillStyle = '#c9e7ff'
  context.fillRect(52, 110, 24, 4)
  // fuselaje
  context.save()
  context.shadowColor = '#00000090'
  context.shadowBlur = 8
  const body = context.createLinearGradient(48, 0, 80, 0)
  body.addColorStop(0, '#22323c')
  body.addColorStop(0.5, '#3a4f5c')
  body.addColorStop(1, '#1b2830')
  context.fillStyle = body
  context.beginPath()
  context.ellipse(64, 58, 15, 26, 0, 0, Math.PI * 2)
  context.fill()
  context.restore()
  // cabina
  context.fillStyle = '#8fd3ff'
  context.beginPath()
  context.ellipse(64, 44, 9, 9, 0, 0, Math.PI * 2)
  context.fill()
  // luz anticolisión
  context.fillStyle = '#ff4d4f'
  context.beginPath()
  context.arc(64, 72, 3, 0, Math.PI * 2)
  context.fill()
  return context.getImageData(0, 0, 128, 128)
}

function emojiMarker(emoji: string, statusColor?: string) {
  const canvas = document.createElement('canvas')
  canvas.width = 80
  canvas.height = 80
  const context = canvas.getContext('2d')!
  context.font = '52px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif'
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillText(emoji, 40, 42)
  if (statusColor) {
    context.beginPath()
    context.arc(64, 64, 7, 0, Math.PI * 2)
    context.fillStyle = statusColor
    context.fill()
    context.strokeStyle = '#17252e'
    context.lineWidth = 3
    context.stroke()
  }
  return context.getImageData(0, 0, 80, 80)
}

const POLICE_VIEWS = 24

function policeCarMarker(heading: number) {
  type Vertex = [number, number, number]
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 128
  const context = canvas.getContext('2d')!
  const angle = heading * Math.PI / 180
  const cos = Math.cos(angle), sin = Math.sin(angle)
  const faces: { vertices: Vertex[]; color: string; depth: number }[] = []
  const project = ([x, y, z]: Vertex): [number, number] => [64 + (x * cos - y * sin) * 20, 67 + ((x * sin + y * cos) * 0.78 - z * 0.63) * 20]
  const face = (vertices: Vertex[], color: string) => faces.push({ vertices, color, depth: vertices.reduce((sum, [x, y, z]) => sum + (x * sin + y * cos) * 0.63 + z * 0.78, 0) / vertices.length })
  const box = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, top: string, side: string) => {
    face([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], top)
    face([[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], side)
    face([[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], side)
    face([[x0, y0, z0], [x0, y1, z0], [x0, y1, z1], [x0, y0, z1]], side)
    face([[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]], side)
  }
  const wheel = (x: number, y: number, radius: number, color: string) => face(Array.from({ length: 20 }, (_, i): Vertex => [x, y + Math.cos(i * Math.PI / 10) * radius, 0.4 + Math.sin(i * Math.PI / 10) * radius]), color)
  context.fillStyle = '#00000045'
  context.beginPath()
  const shadow = [[-1.4, -2.6, 0], [1.4, -2.6, 0], [1.4, 2.6, 0], [-1.4, 2.6, 0]] as Vertex[]
  shadow.forEach((point, i) => { const [x, y] = project(point); if (i === 0) context.moveTo(x + 3, y + 3); else context.lineTo(x + 3, y + 3) })
  context.closePath()
  context.fill()
  box(-1.05, -2.25, 0.28, 1.05, 2.25, 0.65, '#254659', '#172a37')
  box(-1.1, -2.3, 0.58, 1.1, 2.25, 1.02, '#3f9cef', '#247bbe')
  for (const x of [-1.12, 1.12]) for (const y of [-1.47, 1.47]) {
    wheel(x, y, 0.4, '#141d26')
    wheel(x * 1.015, y, 0.23, '#a8b6c2')
    wheel(x * 1.02, y, 0.1, '#546676')
  }
  face([[-1.02, -1.2, 1.02], [1.02, -1.2, 1.02], [0.82, -0.66, 1.78], [-0.82, -0.66, 1.78]], '#317fb4')
  face([[-1.02, 1.9, 1.02], [1.02, 1.9, 1.02], [0.82, 1.35, 1.78], [-0.82, 1.35, 1.78]], '#266d9b')
  for (const sign of [-1, 1]) {
    face([[sign * 1.02, -1.2, 1.02], [sign * 1.02, 1.9, 1.02], [sign * 0.82, 1.35, 1.78], [sign * 0.82, -0.66, 1.78]], sign < 0 ? '#398fe0' : '#277bbb')
    face([[sign * 1.025, -1.01, 1.12], [sign * 1.025, 0.03, 1.12], [sign * 0.85, 0.03, 1.67], [sign * 0.85, -0.59, 1.67]], '#172d3e')
    face([[sign * 1.025, 0.17, 1.12], [sign * 1.025, 1.69, 1.12], [sign * 0.85, 1.28, 1.67], [sign * 0.85, 0.17, 1.67]], '#213b50')
    box(sign < 0 ? -1.27 : 1.05, -1.05, 1.02, sign < 0 ? -1.05 : 1.27, -0.69, 1.17, '#56adf5', '#226ba0')
  }
  face([[-0.91, -1.15, 1.12], [0.91, -1.15, 1.12], [0.74, -0.68, 1.71], [-0.74, -0.68, 1.71]], '#173548')
  face([[-0.91, 1.86, 1.12], [0.91, 1.86, 1.12], [0.74, 1.37, 1.71], [-0.74, 1.37, 1.71]], '#192f40')
  face([[-0.84, -0.68, 1.8], [0.84, -0.68, 1.8], [0.84, 1.38, 1.8], [-0.84, 1.38, 1.8]], '#57adf7')
  box(-0.72, -0.22, 1.81, 0.72, 0.13, 1.92, '#152938', '#102431')
  box(-0.66, -0.18, 1.92, -0.04, 0.09, 2.04, '#74bfff', '#1c5be3')
  box(0.04, -0.18, 1.92, 0.66, 0.09, 2.04, '#ff9292', '#d93645')
  box(-0.7, -2.32, 0.5, 0.7, -2.3, 0.73, '#243c4b', '#172f42')
  for (const x of [-0.96, 0.63]) {
    box(x, -2.32, 0.81, x + 0.33, -2.3, 0.97, '#f4f7df', '#e5eff5')
    box(x, 2.25, 0.77, x + 0.33, 2.28, 1, '#ed5a53', '#d13539')
  }
  box(-0.27, 2.26, 0.65, 0.27, 2.29, 0.77, '#dce7ed', '#dce7ed')
  for (const item of faces.sort((a, b) => a.depth - b.depth)) {
    context.beginPath()
    item.vertices.forEach((point, i) => { const [x, y] = project(point); if (i === 0) context.moveTo(x, y); else context.lineTo(x, y) })
    context.closePath()
    context.fillStyle = item.color
    context.fill()
  }
  return context.getImageData(0, 0, 128, 128)
}

function policeCarImage(cameraBearing: number): mapboxgl.ExpressionSpecification {
  return ['concat', 'police-car-', ['to-string', ['%', ['round', ['/', ['+', ['-', ['get', 'heading'], cameraBearing], 360], 360 / POLICE_VIEWS]], POLICE_VIEWS]]]
}

function ambulanceMarker() {
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 128
  const context = canvas.getContext('2d')!

  context.save()
  context.shadowColor = '#00000080'
  context.shadowBlur = 9
  context.fillStyle = '#101820'
  context.beginPath()
  context.roundRect(31, 12, 66, 105, 17)
  context.fill()
  context.restore()

  context.fillStyle = '#17232b'
  for (const y of [34, 88]) {
    context.beginPath()
    context.roundRect(25, y, 12, 24, 5)
    context.fill()
    context.beginPath()
    context.roundRect(91, y, 12, 24, 5)
    context.fill()
  }

  const body = context.createLinearGradient(34, 0, 94, 0)
  body.addColorStop(0, '#d6e0e4')
  body.addColorStop(0.2, '#ffffff')
  body.addColorStop(0.76, '#f4f7f8')
  body.addColorStop(1, '#aebdc3')
  context.fillStyle = body
  context.beginPath()
  context.roundRect(34, 9, 60, 110, 17)
  context.fill()

  context.fillStyle = '#c92f3d'
  context.fillRect(34, 48, 60, 7)
  context.fillRect(39, 55, 4, 50)
  context.fillRect(85, 55, 4, 50)

  context.fillStyle = '#1b3340'
  context.beginPath()
  context.moveTo(42, 34)
  context.quadraticCurveTo(43, 18, 50, 14)
  context.quadraticCurveTo(64, 9, 78, 14)
  context.quadraticCurveTo(85, 18, 86, 34)
  context.closePath()
  context.fill()
  context.strokeStyle = '#6f8c99'
  context.lineWidth = 2
  context.beginPath()
  context.moveTo(64, 12)
  context.lineTo(64, 34)
  context.stroke()

  context.fillStyle = '#162731'
  context.fillRect(42, 98, 44, 13)
  context.strokeStyle = '#72858d'
  context.lineWidth = 2
  context.beginPath()
  context.moveTo(64, 98)
  context.lineTo(64, 111)
  context.stroke()

  context.fillStyle = '#c92f3d'
  context.fillRect(59, 64, 10, 30)
  context.fillRect(49, 74, 30, 10)

  context.fillStyle = '#15252e'
  context.beginPath()
  context.roundRect(45, 39, 38, 9, 3)
  context.fill()
  context.fillStyle = '#4aa8ff'
  context.fillRect(48, 41, 14, 5)
  context.fillStyle = '#ff525d'
  context.fillRect(66, 41, 14, 5)

  context.fillStyle = '#f4dca0'
  for (const x of [43, 76]) {
    context.beginPath()
    context.roundRect(x, 14, 9, 5, 2)
    context.fill()
  }
  context.fillStyle = '#c92f3d'
  for (const x of [43, 76]) {
    context.beginPath()
    context.roundRect(x, 109, 9, 5, 2)
    context.fill()
  }

  return context.getImageData(0, 0, 128, 128)
}

function fireUnitPinMarker() {
  const canvas = document.createElement('canvas')
  canvas.width = 96
  canvas.height = 136
  const context = canvas.getContext('2d')!
  context.fillStyle = '#00000040'
  context.beginPath()
  context.ellipse(48, 131, 14, 4, 0, 0, Math.PI * 2)
  context.fill()
  context.fillStyle = '#c96535'
  context.beginPath()
  context.moveTo(48, 132)
  context.bezierCurveTo(39, 98, 7, 75, 7, 44)
  context.arc(48, 44, 41, Math.PI, Math.PI * 2)
  context.bezierCurveTo(89, 75, 57, 98, 48, 132)
  context.closePath()
  context.fill()
  context.fillStyle = '#ffffff'
  context.beginPath()
  context.arc(48, 44, 32, 0, Math.PI * 2)
  context.fill()
  context.fillStyle = '#101820'
  context.fillRect(21, 25, 33, 33)
  context.fill(new Path2D('M54 36H66L76 47V58H54Z'))
  context.fillStyle = '#ffffff'
  context.fillRect(24, 28, 27, 25)
  context.fill(new Path2D('M58 39H64L70 46H58Z'))
  context.fillStyle = '#d83840'
  context.fillRect(27, 32, 21, 4)
  context.fillRect(27, 43, 21, 4)
  for (const x of [29, 37, 45]) context.fillRect(x, 30, 2, 19)
  context.fillRect(56, 31, 10, 4)
  for (const x of [32, 65]) {
    context.fillStyle = '#101820'
    context.beginPath()
    context.arc(x, 59, 7, 0, Math.PI * 2)
    context.fill()
    context.fillStyle = '#ffffff'
    context.beginPath()
    context.arc(x, 59, 3, 0, Math.PI * 2)
    context.fill()
  }
  return context.getImageData(0, 0, 96, 136)
}

/** Un control de Mapbox vacío: reserva su hueco en la esquina y React pinta dentro por portal. */
class PortalControl implements mapboxgl.IControl {
  container = document.createElement('div')
  constructor(className: string) {
    this.container.className = `mapboxgl-ctrl mapboxgl-ctrl-group ${className}`
  }
  onAdd() {
    return this.container
  }
  onRemove() {
    this.container.remove()
  }
}

function overviewBounds(cells: FeatureCollection<Polygon>, centers: ResponseCenter[], zones: SafeZone[], fires: FireSpot[]) {
  const bounds = new mapboxgl.LngLatBounds()
  for (const feature of cells.features) {
    for (const ring of feature.geometry.coordinates) {
      for (const [lng, lat] of ring) bounds.extend([lng, lat])
    }
  }
  for (const center of centers) bounds.extend([center.lng, center.lat])
  for (const zone of zones) bounds.extend([zone.lng, zone.lat])
  for (const fire of fires) bounds.extend([fire.lng, fire.lat])
  if (!cells.features.length && !centers.length && !zones.length && !fires.length) {
    return new mapboxgl.LngLatBounds([-3.74, 40.42], [-3.70, 40.47])
  }
  return new mapboxgl.LngLatBounds([bounds.getWest() - 0.008, bounds.getSouth() - 0.008], [bounds.getEast() + 0.008, bounds.getNorth() + 0.008])
}

function centersGeo(centers: ResponseCenter[]): FeatureCollection<Point> {
  return {
    type: 'FeatureCollection',
    features: centers.map(center => ({
      type: 'Feature',
      properties: { id: center.id, kind: center.kind, name: center.kind === 'hospital' ? 'Hospital' : center.kind === 'fire' ? 'Bomberos' : center.name, locationSource: center.locationSource },
      geometry: { type: 'Point', coordinates: [center.lng, center.lat] },
    })),
  }
}

function overviewPadding(width: number) {
  return width < 680 ? { top: 290, bottom: 175, left: 35, right: 45 } : { top: 130, bottom: 175, left: 340, right: 100 }
}

const LAYER_IDS: Record<keyof MapLayers, string[]> = {
  perimeter: ['fire-flame', 'fire-ember'],
  spread: ['fire-smoke'],
  plannedFire: ['planned-fire-fill', 'planned-fire-edge', 'planned-fire-label'],
  thermal: ['thermal-core', 'thermal-satellite'],
  citizens: ['people-glow', 'people-dot', 'people-escalated', 'people-rerouted', 'people-area-highlight', 'people-selection', 'people-label', 'accuracy-fill', 'accuracy-line'],
  references: [],
  zones: ['zone-area', 'zone-edge', 'zone-point', 'zone-label'],
  hospitals: ['center-hospital', 'center-hospital-label'],
  healthCenters: ['center-health', 'center-health-label'],
  fireStations: ['center-fire', 'center-fire-label'],
  routes: ['refuge-route-casing', 'refuge-route-line'],
  callArea: ['call-area-fill', 'call-area-edge', 'recommended-fill', 'recommended-edge', 'recommended-label'],
  units: ['unit-point', 'ambulance-vehicle', 'police-car', 'helicopter-unit', 'unit-label'],
}

type Props = {
  token: string
  citizens: Citizen[]
  fires: FireSpot[]
  zones: SafeZone[]
  selectedId: string | null
  layers: MapLayers
  onSelect: (id: string | null) => void
  projection: FeatureCollection<Polygon>
  forecast: FireForecast
  zoneExposure: Record<string, Exposure>
  horizon: number
  marginM: number
  route: RefugeRoute | null
  focusTarget: { lng: number; lat: number; zoom?: number; bounds?: [[number, number], [number, number]] } | null
  onCenterSelect: (id: string) => void
  showWind: boolean
  windDirection: number
  windKmh: number
  callArea: CallArea | null
  areaIds: string[]
  drawingArea: boolean
  onAreaChange: (area: CallArea | null) => void
  onAreaComplete: (area: CallArea) => void
  /** Frentes previstos pintados a mano, y el trazo que se está pintando ahora mismo. */
  plannedFires: PaintedFire[]
  fireStroke: [number, number][] | null
  drawingFire: boolean
  onFireStroke: (ring: [number, number][] | null) => void
  onFireComplete: (ring: [number, number][]) => void
  recommended: RecommendedAreas | null
  units: DispatchUnit[]
  onUnitSelect: (id: string) => void
  fireCells: FeatureCollection<Polygon>
  centers: ResponseCenter[]
  incident: Incident
}

function sampleHeat(feature: FeatureCollection<Polygon>['features'][number], heat: number, count = 1): FeatureCollection<Point>['features'] {
  const ring = feature.geometry.coordinates[0]
  const west = ring[0][0]
  const east = ring[1][0]
  const lat = (ring[0][1] + ring[2][1]) / 2
  const steps = Math.max(1, count)
  return Array.from({ length: steps }, (_, index) => ({
    type: 'Feature',
    properties: { heat },
    geometry: { type: 'Point', coordinates: [west + (east - west) * (index + 0.5) / steps, lat] },
  }))
}

function fireHeatPoints(cells: FeatureCollection<Polygon>, forecast: FireForecast, horizon: number): FeatureCollection<Point> {
  return {
    type: 'FeatureCollection',
    features: [
      ...cells.features.flatMap(feature => sampleHeat(feature, Number(feature.properties?.heat ?? 0.7), Math.max(2, Number(feature.properties?.cellCount) || 1))),
      ...forecastHeatPoints(forecast, horizon).features,
    ],
  }
}

const FIRE_RAMP = [
  'interpolate', ['linear'], ['heatmap-density'],
  0, 'rgba(0,0,0,0)',
  0.12, 'rgba(48,6,4,0)',
  0.22, 'rgba(92,10,6,0.28)',
  0.36, 'rgba(168,18,8,0.5)',
  0.5, 'rgba(226,46,8,0.68)',
  0.64, 'rgba(255,108,16,0.8)',
  0.78, 'rgba(255,176,42,0.88)',
  0.9, 'rgba(255,226,120,0.94)',
  1, 'rgba(255,248,210,0.98)',
] as const

const SMOKE_RAMP = [
  'interpolate', ['linear'], ['heatmap-density'],
  0, 'rgba(0,0,0,0)',
  0.15, 'rgba(36,8,4,0)',
  0.3, 'rgba(70,14,8,0.18)',
  0.5, 'rgba(120,22,10,0.32)',
  0.72, 'rgba(168,36,12,0.4)',
  1, 'rgba(196,54,16,0.22)',
] as const

function firesGeo(fires: FireSpot[]): FeatureCollection<Point> {
  return {
    type: 'FeatureCollection',
    features: fires.map((fire) => ({
      type: 'Feature', properties: { ...fire },
      geometry: { type: 'Point', coordinates: [fire.lng, fire.lat] },
    })),
  }
}

function citizensGeo(citizens: Citizen[]): FeatureCollection<Point> {
  return {
    type: 'FeatureCollection',
    features: citizens.map((citizen) => ({
      type: 'Feature',
      properties: {
        id: citizen.id, name: citizen.name, status: citizen.status, answered: Boolean(citizen.call),
        reference: !citizen.locationSource || citizen.locationSource === 'reference' || citizen.locationSource === 'unknown',
        color: citizenColor(citizen), rank: citizenRank(citizen), escalated: Boolean(citizen.escalation),
        rerouted: Boolean(citizen.reroute && citizen.status !== 'safe'),
      },
      geometry: { type: 'Point', coordinates: [citizen.lng, citizen.lat] },
    })),
  }
}

/**
 * El color del punto, decidido en un solo sitio.
 *
 * El triaje manda sobre todo lo demás: que alguien haya descolgado dice mucho menos que lo que
 * dijo al descolgar. Si nadie ha hablado con esa persona, se cae al código de siempre —verde si
 * contestó, ámbar si está sonando, azul si no se ha intentado— que sigue siendo lo que se ve
 * cuando router corre sin backend.
 */
function citizenColor(citizen: Citizen): string {
  // Nadie descolgó: es la casa que hay que ir a mirar, y va en rojo por encima del triaje
  // «sin clasificar» que deja la llamada perdida.
  if (citizen.status === 'no_answer') return NO_ANSWER_COLOR
  if (citizen.triage) return TRIAGE_COLOR[citizen.triage.level]
  if (citizen.call) return '#4de3a6'
  if (citizen.status === 'ringing') return '#f3bd61'
  return PERSON_COLOR
}

/** Quién se pinta encima cuando dos puntos se solapan: primero el que hay que sacar antes. */
function citizenRank(citizen: Citizen): number {
  if (citizen.status === 'no_answer') return TRIAGE_ORDER.length + 3
  if (citizen.triage) return TRIAGE_ORDER.length - TRIAGE_ORDER.indexOf(citizen.triage.level) + 2
  if (citizen.call) return 2
  return citizen.status === 'ringing' ? 1 : 0
}

function zonesGeo(zones: SafeZone[], exposure: Record<string, Exposure>): FeatureCollection<Point> {
  return { type: 'FeatureCollection', features: zones.map(zone => ({
    type: 'Feature', properties: { id: zone.id, code: zone.code, name: zone.name.split(' · ')[0], level: exposure[zone.id]?.level ?? 'unknown', color: EXPOSURE_COLOR[exposure[zone.id]?.level ?? 'unknown'] },
    geometry: { type: 'Point', coordinates: [zone.lng, zone.lat] },
  })) }
}

function zoneAreas(zones: SafeZone[], exposure: Record<string, Exposure>): FeatureCollection<Polygon> {
  return { type: 'FeatureCollection', features: zones.map(zone => ({
    type: 'Feature', properties: { color: EXPOSURE_COLOR[exposure[zone.id]?.level ?? 'unknown'] },
    geometry: { type: 'Polygon', coordinates: [circle(zone.lng, zone.lat, zone.radiusM)] },
  })) }
}

function routeGeo(route: RefugeRoute | null): FeatureCollection<LineString> {
  return { type: 'FeatureCollection', features: route ? [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: route.coordinates } }] : [] }
}

function unitsGeo(units: DispatchUnit[]): FeatureCollection<Point> {
  return {
    type: 'FeatureCollection',
    features: units.map(unit => ({
      type: 'Feature',
      properties: { id: unit.id, kind: unit.kind, name: unit.callSign, heading: unit.heading, status: UNIT_STATUS_LABEL[unit.status], mission: unit.mission, demo: true },
      geometry: { type: 'Point', coordinates: [unit.lng, unit.lat] },
    })),
  }
}

function callAreaGeo(area: CallArea | null): FeatureCollection<Polygon> {
  return { type: 'FeatureCollection', features: area && area.radiusM > 0 ? [{ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [circle(area.lng, area.lat, area.radiusM)] } }] : [] }
}

function recommendedGeo(areas: RecommendedAreas | null): FeatureCollection<Polygon> {
  if (!areas) return { type: 'FeatureCollection', features: [] }
  return { type: 'FeatureCollection', features: [
    { type: 'Feature', properties: { kind: 'affected', label: `Posible afectación · +${areas.affectedMinutes} min` }, geometry: { type: 'Polygon', coordinates: [circle(areas.affected.lng, areas.affected.lat, areas.affected.radiusM)] } },
    { type: 'Feature', properties: { kind: 'risk', label: 'Zona de riesgo recomendada' }, geometry: { type: 'Polygon', coordinates: [circle(areas.risk.lng, areas.risk.lat, areas.risk.radiusM)] } },
  ] }
}

function circle(lng: number, lat: number, radius: number) {
  return Array.from({ length: 65 }, (_, i) => destination(lng, lat, (i % 64) * 360 / 64, radius))
}

function accuracyGeo(citizen?: Citizen): FeatureCollection<Polygon> {
  return {
    type: 'FeatureCollection',
    features: citizen?.locationSource === 'gps' && citizen.accuracyM !== undefined && citizen.accuracyM > 0
      ? [{ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [circle(citizen.lng, citizen.lat, citizen.accuracyM)] } }]
      : [],
  }
}

function source(map: mapboxgl.Map, id: string) {
  return map.getSource(id) as GeoJSONSource | undefined
}

function zonePopupContent(zone: SafeZone, exposure: Exposure | undefined, horizon: number) {
  const content = document.createElement('div')
  const title = document.createElement('strong')
  title.textContent = `${zone.code} · ${zone.name}`
  const risk = document.createElement('p')
  risk.style.color = EXPOSURE_COLOR[exposure?.level ?? 'unknown']
  risk.textContent = `${EXPOSURE_LABEL[exposure?.level ?? 'unknown']} · +${horizon} min${exposure && Number.isFinite(exposure.minute) ? ` · +${Math.ceil(exposure.minute)} min` : ''}`
  const description = document.createElement('p')
  description.textContent = zone.description
  const services = document.createElement('p')
  services.textContent = `${zone.services.join(' · ')} · ${zone.capacity} personas`
  const note = document.createElement('small')
  note.textContent = 'No es un refugio oficial. Seguridad, disponibilidad y accesibilidad no verificadas.'
  const link = document.createElement('a')
  link.href = zone.sourceUrl
  link.target = '_blank'
  link.rel = 'noreferrer'
  link.textContent = 'Fuente municipal'
  content.append(title, risk, description, services, note, document.createElement('br'), link)
  return content
}

/** Los frentes pintados y el trazo en curso, como polígonos. El trazo se cierra al vuelo para que se vea el relleno mientras se pinta. */
function plannedFireGeo(fires: PaintedFire[], stroke: [number, number][] | null): FeatureCollection<Polygon> {
  const rings = [...fires.map(fire => ({ id: fire.id, ring: fire.ring, live: false })), ...(stroke && stroke.length >= 3 ? [{ id: 'stroke', ring: stroke, live: true }] : [])]
  return {
    type: 'FeatureCollection',
    features: rings.map(({ id, ring, live }) => {
      const closed = ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1] ? ring : [...ring, ring[0]]
      return { type: 'Feature', properties: { id, live, label: live ? 'Frente previsto' : 'Frente previsto · +15 min' }, geometry: { type: 'Polygon', coordinates: [closed] } }
    }),
  }
}

function patchLayers(map: mapboxgl.Map, layers: MapLayers, selectedId: string | null, areaIds: string[]) {
  for (const [key, ids] of Object.entries(LAYER_IDS)) {
    for (const id of ids) {
      if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', layers[key as keyof MapLayers] ? 'visible' : 'none')
    }
  }
  const visible: mapboxgl.FilterSpecification = layers.references ? ['has', 'id'] : ['==', ['get', 'reference'], false]
  map.setFilter('people-glow', visible)
  map.setFilter('people-dot', visible)
  map.setFilter('people-area-highlight', ['all', visible, ['in', ['get', 'id'], ['literal', areaIds]]])
  for (const id of ['people-selection', 'people-label']) {
    map.setFilter(id, ['all', visible, ['==', ['get', 'id'], selectedId ?? '']])
  }
}

function pickTourPerson(citizens: Citizen[]): Citizen | null {
  if (!citizens.length) return null
  const center = citizens.reduce((acc, citizen) => ({ lng: acc.lng + citizen.lng / citizens.length, lat: acc.lat + citizen.lat / citizens.length }), { lng: 0, lat: 0 })
  return citizens.reduce((best, citizen) => haversineMeters(citizen.lng, citizen.lat, center.lng, center.lat) < haversineMeters(best.lng, best.lat, center.lng, center.lat) ? citizen : best)
}

function fireAnchor(fires: FireSpot[]): { lng: number; lat: number } | null {
  if (!fires.length) return null
  return {
    lng: fires.reduce((sum, fire) => sum + fire.lng, 0) / fires.length,
    lat: fires.reduce((sum, fire) => sum + fire.lat, 0) / fires.length,
  }
}

export function CommandMap({ token, citizens, fires, zones, selectedId, layers, onSelect, projection, forecast, zoneExposure, horizon, marginM, route, focusTarget, onCenterSelect, showWind, windDirection, windKmh, callArea, areaIds, drawingArea, onAreaChange, onAreaComplete, plannedFires, fireStroke, drawingFire, onFireStroke, onFireComplete, recommended, units, onUnitSelect, fireCells, centers, incident }: Props) {
  const rootRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const popupRef = useRef<mapboxgl.Popup | null>(null)
  const onSelectRef = useRef(onSelect)
  const onCenterSelectRef = useRef(onCenterSelect)
  const onUnitSelectRef = useRef(onUnitSelect)
  const interactionRef = useRef({ drawingArea, onAreaChange, onAreaComplete, drawingFire, onFireStroke, onFireComplete })
  const suppressClickRef = useRef(false)
  const demoMarkersRef = useRef(new Map<string, mapboxgl.Marker>())
  useEffect(() => { interactionRef.current = { drawingArea, onAreaChange, onAreaComplete, drawingFire, onFireStroke, onFireComplete } }, [drawingArea, onAreaChange, onAreaComplete, drawingFire, onFireStroke, onFireComplete])
  useEffect(() => {
    const markers = demoMarkersRef.current
    return () => { markers.forEach(marker => marker.remove()); markers.clear() }
  }, [])
  const dataRef = useRef({ citizens, fires, zones, selectedId, layers, projection, forecast, zoneExposure, horizon, marginM, route, callArea, areaIds, units, recommended, plannedFires, fireStroke })
  // El menú de encuadre vive dentro de un control de Mapbox (encima del zoom); React lo pinta ahí por portal.
  const [framingHost, setFramingHost] = useState<HTMLElement | null>(null)
  const [mapError, setMapError] = useState('')
  const [loaded, setLoaded] = useState(false)
  onSelectRef.current = onSelect
  onCenterSelectRef.current = onCenterSelect
  onUnitSelectRef.current = onUnitSelect
  dataRef.current = { citizens, fires, zones, selectedId, layers, projection, forecast, zoneExposure, horizon, marginM, route, callArea, areaIds, units, recommended, plannedFires, fireStroke }

  useEffect(() => {
    if (!rootRef.current) return
    const map = new mapboxgl.Map({
      container: rootRef.current,
      accessToken: token,
      style: 'mapbox://styles/mapbox/dark-v11',
      bounds: overviewBounds(fireCells, centers, zones, fires), fitBoundsOptions: { padding: overviewPadding(rootRef.current.clientWidth), maxZoom: incident.zoom, duration: 0 }, pitch: 0, bearing: 0,
      attributionControl: false,
    })
    mapRef.current = map
    const popup = new mapboxgl.Popup({ closeButton: true, offset: 10, className: 'router-popup', maxWidth: '300px' })
    popupRef.current = popup
    // En las posiciones «bottom» Mapbox inserta cada control nuevo por encima del anterior:
    // el encuadre se añade después del zoom para quedar justo encima de él.
    map.addControl(new mapboxgl.NavigationControl({ showCompass: true }), 'bottom-right')
    const framing = new PortalControl('framing-control')
    map.addControl(framing, 'bottom-right')
    setFramingHost(framing.container)
    map.addControl(new mapboxgl.ScaleControl({ maxWidth: 110, unit: 'metric' }), 'bottom-left')
    map.addControl(new mapboxgl.AttributionControl({ compact: true }), 'bottom-left')
    map.on('error', (event) => setMapError(event.error.message || 'No se ha podido cargar la cartografía.'))
    let flame = 0
    const rotatePolice = () => { if (map.getLayer('police-car')) map.setLayoutProperty('police-car', 'icon-image', policeCarImage(map.getBearing())) }
    map.on('rotate', rotatePolice)

    const onLoad = () => {
      const current = dataRef.current
      // Las capas propias se insertan bajo la primera capa de rótulos del estilo: los nombres de calle quedan encima.
      const firstLabel = map.getStyle().layers.find((layer) => layer.type === 'symbol')?.id
      map.addSource('fire-heat', { type: 'geojson', data: fireHeatPoints(fireCells, current.forecast, current.horizon) })
      map.addLayer({
        id: 'fire-smoke', type: 'heatmap', source: 'fire-heat',
        paint: {
          'heatmap-weight': ['interpolate', ['linear'], ['get', 'heat'], 0, 0.12, 1, 0.55],
          'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 11, 0.42, 15, 0.72],
          'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 11, 28, 13, 52, 15, 78, 16, 96],
          'heatmap-opacity': 0.72,
          'heatmap-color': [...SMOKE_RAMP],
        },
      }, firstLabel)
      map.addLayer({
        id: 'fire-ember', type: 'heatmap', source: 'fire-heat',
        paint: {
          'heatmap-weight': ['interpolate', ['linear'], ['get', 'heat'], 0, 0.2, 1, 0.82],
          'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 11, 0.55, 15, 0.95],
          'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 11, 18, 13, 34, 15, 52, 16, 64],
          'heatmap-opacity': 0.9,
          'heatmap-color': [...FIRE_RAMP],
        },
      }, firstLabel)
      map.addLayer({
        id: 'fire-flame', type: 'heatmap', source: 'fire-heat',
        paint: {
          'heatmap-weight': ['interpolate', ['linear'], ['get', 'heat'], 0, 0.08, 1, 0.7],
          'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 11, 0.48, 15, 0.88],
          'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 11, 10, 13, 18, 15, 26, 16, 32],
          'heatmap-opacity': 0.95,
          'heatmap-color': [...FIRE_RAMP],
        },
      }, firstLabel)

      map.addSource('recommended-areas', { type: 'geojson', data: recommendedGeo(current.recommended) })
      map.addLayer({ id: 'recommended-fill', type: 'fill', source: 'recommended-areas', paint: { 'fill-color': ['case', ['==', ['get', 'kind'], 'risk'], '#ff6b5e', '#f3bd61'], 'fill-opacity': ['case', ['==', ['get', 'kind'], 'risk'], 0.07, 0.04] } })
      map.addLayer({ id: 'recommended-edge', type: 'line', source: 'recommended-areas', paint: { 'line-color': ['case', ['==', ['get', 'kind'], 'risk'], '#ff8a7e', '#f3bd61'], 'line-width': ['case', ['==', ['get', 'kind'], 'risk'], 1.8, 1.2], 'line-dasharray': [2, 2], 'line-opacity': 0.85 } })
      map.addLayer({ id: 'recommended-label', type: 'symbol', source: 'recommended-areas', layout: { 'symbol-placement': 'line', 'text-field': ['get', 'label'], 'text-size': 10, 'text-letter-spacing': 0.08, 'symbol-spacing': 600 }, paint: { 'text-color': ['case', ['==', ['get', 'kind'], 'risk'], '#ffb3ab', '#f3d9a4'], 'text-halo-color': '#101820', 'text-halo-width': 1.6 } })
      map.addSource('call-area', { type: 'geojson', data: callAreaGeo(current.callArea) })
      map.addLayer({ id: 'call-area-fill', type: 'fill', source: 'call-area', paint: { 'fill-color': '#77c8f4', 'fill-opacity': 0.09 } })
      map.addLayer({ id: 'call-area-edge', type: 'line', source: 'call-area', paint: { 'line-color': '#a7e1ff', 'line-width': 2, 'line-dasharray': [3, 2] } })
      // Frente previsto: lo que el mando da por hecho antes de que arda. Naranja y discontinuo, para
      // que nadie lo confunda con la huella real que pinta el mapa de calor.
      map.addSource('planned-fire', { type: 'geojson', data: plannedFireGeo(current.plannedFires, current.fireStroke) })
      map.addLayer({ id: 'planned-fire-fill', type: 'fill', source: 'planned-fire', paint: { 'fill-color': '#ff8a3d', 'fill-opacity': ['case', ['==', ['get', 'live'], true], 0.22, 0.16] } }, firstLabel)
      map.addLayer({ id: 'planned-fire-edge', type: 'line', source: 'planned-fire', paint: { 'line-color': '#ffb070', 'line-width': 2, 'line-dasharray': [2, 1.5], 'line-opacity': 0.95 } })
      map.addLayer({ id: 'planned-fire-label', type: 'symbol', source: 'planned-fire', filter: ['==', ['get', 'live'], false], layout: { 'symbol-placement': 'line', 'text-field': ['get', 'label'], 'text-size': 10, 'text-letter-spacing': 0.08, 'symbol-spacing': 400 }, paint: { 'text-color': '#ffd0a8', 'text-halo-color': '#101820', 'text-halo-width': 1.6 } })
      map.addSource('zones-area', { type: 'geojson', data: zoneAreas(current.zones, current.zoneExposure) })
      map.addLayer({ id: 'zone-area', type: 'fill', source: 'zones-area', paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.2 } })
      map.addLayer({ id: 'zone-edge', type: 'line', source: 'zones-area', paint: { 'line-color': ['get', 'color'], 'line-width': 1.3, 'line-opacity': 0.8 } })
      map.addSource('zones', { type: 'geojson', data: zonesGeo(current.zones, current.zoneExposure) })
      for (const [level, color] of Object.entries(EXPOSURE_COLOR)) {
        map.addImage(`meeting-point-${level}`, emojiMarker(SITE_EMOJI.meeting, color), { pixelRatio: 2 })
      }
      map.addLayer({ id: 'zone-point', type: 'symbol', source: 'zones', layout: { 'icon-image': ['concat', 'meeting-point-', ['get', 'level']], 'icon-size': 0.9, 'icon-allow-overlap': true } })
      map.addLayer({ id: 'zone-label', type: 'symbol', source: 'zones', layout: {
        'text-field': ['concat', ['get', 'code'], ' · ', ['get', 'name']],
        'text-size': 10, 'text-offset': [0, 2.1], 'text-anchor': 'top',
      }, paint: { 'text-color': '#d3eadb', 'text-halo-color': '#121b18', 'text-halo-width': 2 } })

      map.addSource('refuge-route', { type: 'geojson', data: routeGeo(current.route) })
      map.addLayer({ id: 'refuge-route-casing', type: 'line', source: 'refuge-route', paint: { 'line-color': '#12252e', 'line-width': 7 } }, 'zone-point')
      map.addLayer({ id: 'refuge-route-line', type: 'line', source: 'refuge-route', paint: { 'line-color': '#8bddff', 'line-width': 3, 'line-dasharray': [3, 1] } }, 'zone-point')
      map.addSource('response-centers', {
        type: 'geojson', attribution: 'Centros: © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
        data: centersGeo(centers),
      })
      for (const kind of ['hospital', 'health', 'fire'] as const) {
        map.addImage(`center-marker-${kind}`, emojiMarker(SITE_EMOJI[kind]), { pixelRatio: 2 })
        map.addLayer({ id: `center-${kind}`, type: 'symbol', source: 'response-centers', filter: ['==', ['get', 'kind'], kind], layout: { 'icon-image': `center-marker-${kind}`, 'icon-size': 0.9, 'icon-allow-overlap': true } })
        map.addLayer({ id: `center-${kind}-label`, type: 'symbol', source: 'response-centers', filter: ['==', ['get', 'kind'], kind], layout: { 'text-field': ['get', 'name'], 'text-size': 10, 'text-offset': [0, 1.8], 'text-anchor': 'top', 'text-max-width': 16 }, paint: { 'text-color': CENTER_COLOR[kind], 'text-halo-color': '#14232d', 'text-halo-width': 2 } })
      }
      map.addSource('thermal', { type: 'geojson', data: firesGeo(current.fires) })
      map.addLayer({ id: 'thermal-core', type: 'circle', source: 'thermal', filter: ['==', ['get', 'source'], 'scenario'], paint: {
        'circle-radius': ['interpolate', ['linear'], ['get', 'frp'], 15, 2.2, 50, 3.4, 100, 5],
        'circle-color': ['interpolate', ['linear'], ['get', 'frp'], 15, '#8a1c0c', 40, '#e23a10', 70, '#ff8a18', 110, '#fff0b0'],
        'circle-opacity': 0.95, 'circle-stroke-color': '#3a0c08', 'circle-stroke-width': 0.8,
      } })
      map.addLayer({ id: 'thermal-satellite', type: 'circle', source: 'thermal', filter: ['==', ['get', 'source'], 'firms'], paint: {
        'circle-radius': 3.5, 'circle-color': '#e7aa68', 'circle-opacity': 0.15,
        'circle-stroke-color': '#e7aa68', 'circle-stroke-width': 1.2,
      } })

      map.addSource('accuracy', { type: 'geojson', data: accuracyGeo(current.citizens.find((citizen) => citizen.id === current.selectedId)) })
      map.addLayer({ id: 'accuracy-fill', type: 'fill', source: 'accuracy', paint: { 'fill-color': '#92c6d8', 'fill-opacity': 0.08 } })
      map.addLayer({ id: 'accuracy-line', type: 'line', source: 'accuracy', paint: { 'line-color': '#92c6d8', 'line-width': 1, 'line-dasharray': [2, 3] } })
      map.addSource('people', { type: 'geojson', data: citizensGeo(current.citizens) })
      map.addLayer({ id: 'people-glow', type: 'circle', source: 'people', paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 2.6, 11, 3.6, 14, 6, 17, 8.5],
        'circle-color': ['get', 'color'],
        'circle-opacity': 0.22,
        'circle-blur': 0.9,
      } })
      map.addLayer({ id: 'people-dot', type: 'circle', source: 'people', layout: { 'circle-sort-key': ['get', 'rank'] }, paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 1.3, 11, 2, 14, 3.4, 17, 4.6],
        'circle-color': ['get', 'color'],
        'circle-opacity': 1,
        'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 8, 0.5, 14, 1, 17, 1.3],
        'circle-stroke-color': '#0a1117',
        'circle-stroke-opacity': 0.85,
      } })
      // Casas escaladas a fuerzas de seguridad: un anillo rojo alrededor del punto hasta que alguien llegue.
      map.addLayer({ id: 'people-escalated', type: 'circle', source: 'people', filter: ['==', ['get', 'escalated'], true], paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 5, 11, 7, 14, 10, 17, 13], 'circle-opacity': 0, 'circle-stroke-color': '#ff3b3b', 'circle-stroke-width': 1.5, 'circle-stroke-opacity': 0.85 } })
      // Personas con destino cambiado por un frente previsto: anillo naranja hasta que llegan.
      map.addLayer({ id: 'people-rerouted', type: 'circle', source: 'people', filter: ['==', ['get', 'rerouted'], true], paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 5, 11, 7, 14, 10, 17, 13], 'circle-opacity': 0, 'circle-stroke-color': '#ffb070', 'circle-stroke-width': 1.5, 'circle-stroke-opacity': 0.9 } })
      map.addLayer({ id: 'people-area-highlight', type: 'circle', source: 'people', paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 2.3, 11, 3, 14, 4.4, 17, 5.6], 'circle-opacity': 0, 'circle-stroke-color': '#d3f0ff', 'circle-stroke-width': 1, 'circle-stroke-opacity': 0.5 } }, 'people-dot')
      map.addLayer({ id: 'people-selection', type: 'circle', source: 'people', paint: { 'circle-radius': 7, 'circle-opacity': 0, 'circle-stroke-color': '#e2edf3', 'circle-stroke-width': 1 } })
      map.addLayer({ id: 'people-label', type: 'symbol', source: 'people', layout: { 'text-field': ['get', 'name'], 'text-size': 11, 'text-offset': [0, -1.8], 'text-allow-overlap': true }, paint: { 'text-color': '#e2edf3', 'text-halo-color': '#101820', 'text-halo-width': 2 } })
      map.addSource('units', { type: 'geojson', data: unitsGeo(current.units) })
      map.addImage('unit-marker-fire', fireUnitPinMarker(), { pixelRatio: 2 })
      map.addImage('ambulance-marker', ambulanceMarker(), { pixelRatio: 2 })
      map.addImage('helicopter-marker', helicopterMarker(), { pixelRatio: 2 })
      for (let i = 0; i < POLICE_VIEWS; i++) map.addImage(`police-car-${i}`, policeCarMarker(i * 360 / POLICE_VIEWS), { pixelRatio: 2 })
      map.addLayer({ id: 'police-car', type: 'symbol', source: 'units', filter: ['==', ['get', 'kind'], 'police'], layout: { 'icon-image': policeCarImage(map.getBearing()), 'icon-size': ['interpolate', ['linear'], ['zoom'], 10, 0.45, 14, 0.62, 17, 0.72], 'icon-anchor': 'center', 'icon-pitch-alignment': 'viewport', 'icon-rotation-alignment': 'viewport', 'icon-allow-overlap': true, 'icon-ignore-placement': true } })
      map.addLayer({ id: 'ambulance-vehicle', type: 'symbol', source: 'units', filter: ['==', ['get', 'kind'], 'ambulance'], layout: { 'icon-image': 'ambulance-marker', 'icon-size': ['interpolate', ['linear'], ['zoom'], 10, 0.42, 14, 0.57, 17, 0.66], 'icon-rotate': ['get', 'heading'], 'icon-anchor': 'center', 'icon-pitch-alignment': 'map', 'icon-rotation-alignment': 'map', 'icon-allow-overlap': true, 'icon-ignore-placement': true } })
      map.addLayer({ id: 'helicopter-unit', type: 'symbol', source: 'units', filter: ['==', ['get', 'kind'], 'helicopter'], layout: { 'icon-image': 'helicopter-marker', 'icon-size': ['interpolate', ['linear'], ['zoom'], 10, 0.5, 14, 0.7, 17, 0.85], 'icon-rotate': ['get', 'heading'], 'icon-anchor': 'center', 'icon-pitch-alignment': 'map', 'icon-rotation-alignment': 'map', 'icon-allow-overlap': true, 'icon-ignore-placement': true } })
      map.addLayer({ id: 'unit-point', type: 'symbol', source: 'units', filter: ['==', ['get', 'kind'], 'fire'], layout: { 'icon-image': 'unit-marker-fire', 'icon-size': ['interpolate', ['linear'], ['zoom'], 10, 0.66, 14, 0.88, 17, 1], 'icon-anchor': 'bottom', 'icon-pitch-alignment': 'viewport', 'icon-rotation-alignment': 'viewport', 'icon-allow-overlap': true, 'icon-ignore-placement': true } })
      map.addLayer({ id: 'unit-label', type: 'symbol', source: 'units', layout: { 'text-field': ['get', 'name'], 'text-size': 10, 'text-offset': ['case', ['==', ['get', 'kind'], 'fire'], ['literal', [0, -6.2]], ['literal', [0, 2.8]]], 'text-anchor': ['case', ['==', ['get', 'kind'], 'fire'], 'bottom', 'top'] }, paint: { 'text-color': '#e8f1f6', 'text-halo-color': '#101820', 'text-halo-width': 2 } })
      patchLayers(map, current.layers, current.selectedId, current.areaIds)

      map.on('click', (event) => {
        if (interactionRef.current.drawingArea || interactionRef.current.drawingFire || suppressClickRef.current) { suppressClickRef.current = false; return }
        const { x, y } = event.point
        const box: [mapboxgl.PointLike, mapboxgl.PointLike] = [[x - 8, y - 8], [x + 8, y + 8]]
        const unitHit = map.queryRenderedFeatures(box, { layers: ['police-car', 'ambulance-vehicle', 'helicopter-unit', 'unit-point', 'unit-label'] })[0]
        if (unitHit?.properties?.id) {
          popup.remove()
          onUnitSelectRef.current(String(unitHit.properties.id))
          return
        }
        const center = map.queryRenderedFeatures(box, { layers: ['center-hospital', 'center-hospital-label', 'center-health', 'center-health-label', 'center-fire', 'center-fire-label'] })[0]
        if (center?.properties?.id) {
          popup.remove()
          onCenterSelectRef.current(String(center.properties.id))
          return
        }
        const meeting = map.queryRenderedFeatures(event.point, { layers: ['zone-point', 'zone-label'] })[0]
        const zone = dataRef.current.zones.find((item) => item.id === meeting?.properties?.id)
        if (zone) {
          onSelectRef.current(null)
          popup.setLngLat([zone.lng, zone.lat]).setDOMContent(zonePopupContent(zone, dataRef.current.zoneExposure[zone.id], dataRef.current.horizon)).addTo(map)
          return
        }
        const people = map.queryRenderedFeatures(box, { layers: ['people-dot'] })
        if (people.length) {
          const nearest = people.reduce((best, feature) => {
            const point = map.project((feature.geometry as Point).coordinates as [number, number])
            const previous = map.project((best.geometry as Point).coordinates as [number, number])
            return Math.hypot(point.x - x, point.y - y) < Math.hypot(previous.x - x, previous.y - y) ? feature : best
          })
          popup.remove()
          onSelectRef.current(String(nearest.properties?.id))
          return
        }
        const thermal = map.queryRenderedFeatures(box, { layers: ['thermal-core', 'thermal-satellite'] })[0]
        if (thermal) {
          const props = thermal.properties ?? {}
          const content = document.createElement('div')
          const title = document.createElement('strong')
          title.textContent = props.source === 'firms' ? 'Detección térmica · NASA FIRMS' : 'Foco térmico'
          const detail = document.createElement('p')
          detail.textContent = `${Number(props.frp).toFixed(1)} MW · ${props.acquiredAt}${props.source === 'firms' ? ' UTC' : ''}`
          const note = document.createElement('small')
          note.textContent = 'Una detección no determina el perímetro ni confirma fuego activo en este instante.'
          content.append(title, detail, note)
          popup.setLngLat(event.lngLat).setDOMContent(content).addTo(map)
          return
        }
        const cell = map.queryRenderedFeatures(event.point, { layers: ['fire-flame', 'fire-ember', 'fire-smoke'] })[0]
        if (cell) {
          const content = document.createElement('div')
          const title = document.createElement('strong')
          title.textContent = 'Huella térmica'
          const detail = document.createElement('p')
          const heat = Number(cell.properties?.heat)
          detail.textContent = Number.isFinite(heat) ? `Celdas de ${FIRE_CELL_SIZE_M} m · intensidad ${Math.round(heat * 100)}` : `Celdas de ${FIRE_CELL_SIZE_M} m`
          const note = document.createElement('small')
          note.textContent = 'No es un perímetro confirmado.'
          content.append(title, detail, note)
          popup.setLngLat(event.lngLat).setDOMContent(content).addTo(map)
          return
        }
        onSelectRef.current(null)
      })
      map.on('mousemove', (event) => {
        const { x, y } = event.point
        const features = map.queryRenderedFeatures([[x - 7, y - 7], [x + 7, y + 7]], { layers: ['police-car', 'ambulance-vehicle', 'helicopter-unit', 'unit-point', 'unit-label', 'people-dot', 'thermal-core', 'thermal-satellite', 'fire-flame', 'fire-ember', 'fire-smoke', 'zone-point', 'zone-label', 'center-hospital', 'center-health', 'center-fire', 'center-hospital-label', 'center-health-label', 'center-fire-label'] })
        map.getCanvas().style.cursor = interactionRef.current.drawingArea || interactionRef.current.drawingFire ? 'crosshair' : features.length ? 'pointer' : ''
      })
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')
      const pulse = () => {
        if (!map.getLayer('fire-ember')) return
        const beat = reduced.matches ? 1 : 0.93 + Math.sin(performance.now() / 380) * 0.08 + Math.sin(performance.now() / 170) * 0.04
        map.setPaintProperty('fire-ember', 'heatmap-intensity', ['interpolate', ['linear'], ['zoom'], 11, 0.55 * beat, 15, 0.95 * beat])
        map.setPaintProperty('fire-flame', 'heatmap-intensity', ['interpolate', ['linear'], ['zoom'], 11, 0.48 * beat, 15, 0.88 * beat])
        flame = requestAnimationFrame(pulse)
      }
      flame = requestAnimationFrame(pulse)
      setLoaded(true)
    }
    map.on('load', onLoad)
    const resize = new ResizeObserver(() => map.resize())
    resize.observe(rootRef.current)
    return () => {
      cancelAnimationFrame(flame)
      map.off('rotate', rotatePolice)
      resize.disconnect()
      popup.remove()
      map.remove()
      mapRef.current = null
    }
    // Map is created once per token; live data is patched in the next effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  useEffect(() => {
    const map = mapRef.current
    if (!map?.getSource('people')) return
    source(map, 'thermal')?.setData(firesGeo(fires))
    source(map, 'people')?.setData(citizensGeo(citizens))
    source(map, 'units')?.setData(unitsGeo(units))
    source(map, 'accuracy')?.setData(accuracyGeo(citizens.find((citizen) => citizen.id === selectedId)))
    patchLayers(map, layers, selectedId, areaIds)
  }, [citizens, fires, selectedId, layers, loaded, areaIds, units])

  useEffect(() => {
    const map = mapRef.current
    if (!loaded || !map) return
    source(map, 'fire-heat')?.setData(fireHeatPoints(fireCells, forecast, horizon))
    source(map, 'zones')?.setData(zonesGeo(zones, zoneExposure))
    source(map, 'zones-area')?.setData(zoneAreas(zones, zoneExposure))
    source(map, 'response-centers')?.setData(centersGeo(centers))
  }, [loaded, forecast, horizon, fireCells, zones, zoneExposure, centers])

  useEffect(() => {
    if (loaded && mapRef.current) source(mapRef.current, 'refuge-route')?.setData(routeGeo(route))
  }, [loaded, route])

  useEffect(() => {
    if (loaded && mapRef.current) source(mapRef.current, 'call-area')?.setData(callAreaGeo(callArea))
  }, [loaded, callArea])

  useEffect(() => {
    if (loaded && mapRef.current) source(mapRef.current, 'planned-fire')?.setData(plannedFireGeo(plannedFires, fireStroke))
  }, [loaded, plannedFires, fireStroke])

  // Pintar un frente previsto: trazo libre con el puntero, se cierra al soltar. Mismo cerrojo del
  // mapa que el círculo de llamadas: mientras se pinta, el mapa no se mueve.
  useEffect(() => {
    const map = mapRef.current
    if (!loaded || !map || !drawingFire) return
    popupRef.current?.remove()
    const canvas = map.getCanvas()
    const handlers = [map.dragPan, map.dragRotate, map.boxZoom, map.doubleClickZoom, map.scrollZoom, map.touchZoomRotate]
    const enabled = handlers.map(handler => handler.isEnabled())
    handlers.forEach(handler => handler.disable())
    const previousTouchAction = canvas.style.touchAction
    canvas.style.touchAction = 'none'
    canvas.style.cursor = 'crosshair'
    let stroke: [number, number][] = []
    let last: [number, number] | null = null
    let pointerId: number | null = null
    const position = (event: PointerEvent): [number, number] => {
      const bounds = canvas.getBoundingClientRect()
      const point: [number, number] = [event.clientX - bounds.left, event.clientY - bounds.top]
      last = point
      const { lng, lat } = map.unproject(point)
      return [lng, lat]
    }
    const down = (event: PointerEvent) => {
      if (!event.isPrimary || event.button !== 0) return
      event.preventDefault()
      pointerId = event.pointerId
      suppressClickRef.current = true
      canvas.setPointerCapture(event.pointerId)
      stroke = [position(event)]
      interactionRef.current.onFireStroke(null)
    }
    const move = (event: PointerEvent) => {
      if (event.pointerId !== pointerId) return
      event.preventDefault()
      const bounds = canvas.getBoundingClientRect()
      // Un punto cada pocos píxeles: suficiente para que el trazo sea suave sin que el anillo tenga miles de vértices.
      if (last && Math.hypot(event.clientX - bounds.left - last[0], event.clientY - bounds.top - last[1]) < 5) return
      stroke = [...stroke, position(event)]
      interactionRef.current.onFireStroke(stroke)
    }
    const up = (event: PointerEvent) => {
      if (event.pointerId !== pointerId) return
      event.preventDefault()
      pointerId = null
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId)
      const ring = stroke
      stroke = []
      last = null
      if (ring.length >= 3) interactionRef.current.onFireComplete(ring)
      else interactionRef.current.onFireStroke(null)
    }
    const cancel = () => { stroke = []; last = null; pointerId = null; interactionRef.current.onFireStroke(null) }
    canvas.addEventListener('pointerdown', down, true)
    canvas.addEventListener('pointermove', move, true)
    canvas.addEventListener('pointerup', up, true)
    canvas.addEventListener('pointercancel', cancel, true)
    return () => {
      canvas.removeEventListener('pointerdown', down, true)
      canvas.removeEventListener('pointermove', move, true)
      canvas.removeEventListener('pointerup', up, true)
      canvas.removeEventListener('pointercancel', cancel, true)
      if (pointerId !== null && canvas.hasPointerCapture(pointerId)) canvas.releasePointerCapture(pointerId)
      handlers.forEach((handler, i) => { if (enabled[i]) handler.enable() })
      canvas.style.touchAction = previousTouchAction
      canvas.style.cursor = ''
    }
  }, [loaded, drawingFire])

  useEffect(() => {
    if (loaded && mapRef.current) source(mapRef.current, 'recommended-areas')?.setData(recommendedGeo(recommended))
  }, [loaded, recommended])

  useEffect(() => {
    const map = mapRef.current
    if (!loaded || !map || !drawingArea) return
    popupRef.current?.remove()
    const canvas = map.getCanvas()
    const handlers = [map.dragPan, map.dragRotate, map.boxZoom, map.doubleClickZoom, map.scrollZoom, map.touchZoomRotate]
    const enabled = handlers.map(handler => handler.isEnabled())
    handlers.forEach(handler => handler.disable())
    const previousTouchAction = canvas.style.touchAction
    canvas.style.touchAction = 'none'
    canvas.style.cursor = 'crosshair'
    let start: { lng: number; lat: number } | null = null
    let pointerId: number | null = null
    const position = (event: PointerEvent) => {
      const bounds = canvas.getBoundingClientRect()
      return map.unproject([event.clientX - bounds.left, event.clientY - bounds.top])
    }
    const areaAt = (event: PointerEvent): CallArea | null => {
      if (!start) return null
      const point = position(event)
      return { ...start, radiusM: Math.min(20000, haversineMeters(start.lng, start.lat, point.lng, point.lat)) }
    }
    const down = (event: PointerEvent) => {
      if (!event.isPrimary || event.button !== 0) return
      event.preventDefault()
      const point = position(event)
      start = { lng: point.lng, lat: point.lat }
      pointerId = event.pointerId
      suppressClickRef.current = true
      canvas.setPointerCapture(event.pointerId)
      interactionRef.current.onAreaChange({ ...start, radiusM: 0 })
    }
    const move = (event: PointerEvent) => {
      if (event.pointerId !== pointerId) return
      event.preventDefault()
      interactionRef.current.onAreaChange(areaAt(event))
    }
    const up = (event: PointerEvent) => {
      if (event.pointerId !== pointerId) return
      event.preventDefault()
      const area = areaAt(event)
      start = null
      pointerId = null
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId)
      if (area && area.radiusM >= 50) interactionRef.current.onAreaComplete(area)
      else interactionRef.current.onAreaChange(null)
    }
    const cancel = () => { start = null; pointerId = null; interactionRef.current.onAreaChange(null) }
    canvas.addEventListener('pointerdown', down, true)
    canvas.addEventListener('pointermove', move, true)
    canvas.addEventListener('pointerup', up, true)
    canvas.addEventListener('pointercancel', cancel, true)
    return () => {
      canvas.removeEventListener('pointerdown', down, true)
      canvas.removeEventListener('pointermove', move, true)
      canvas.removeEventListener('pointerup', up, true)
      canvas.removeEventListener('pointercancel', cancel, true)
      if (pointerId !== null && canvas.hasPointerCapture(pointerId)) canvas.releasePointerCapture(pointerId)
      handlers.forEach((handler, i) => { if (enabled[i]) handler.enable() })
      canvas.style.touchAction = previousTouchAction
      canvas.style.cursor = ''
    }
  }, [loaded, drawingArea])

  // Marcadores DOM sobre el canvas para los pocos puntos que un guion de demo
  // pulsa: sitios fijos del escenario, la persona seleccionada y las de
  // DEMO_PEOPLE. El canvas sigue pintándolos; esto solo añade zona de clic con
  // selector estable. Ver src/demo-points.ts.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !loaded) return
    const showZone = (zone: SafeZone) => {
      onSelectRef.current(null)
      popupRef.current?.setLngLat([zone.lng, zone.lat])
        .setDOMContent(zonePopupContent(zone, dataRef.current.zoneExposure[zone.id], dataRef.current.horizon))
        .addTo(map)
    }
    const fire = fireAnchor(fires)
    const person = pickTourPerson(citizens)
    const wanted = [
      ...zones.map(zone => ({ demo: 'meeting-point', id: zone.id, lng: zone.lng, lat: zone.lat, onClick: () => showZone(zone) })),
      ...centers.map(center => ({ demo: 'center-marker', id: center.id, lng: center.lng, lat: center.lat, onClick: () => { popupRef.current?.remove(); onCenterSelectRef.current(center.id) } })),
      ...citizens
        .filter(citizen => citizen.id === selectedId || DEMO_PEOPLE.includes(citizen.id))
        .map(citizen => ({ demo: 'person-marker', id: citizen.id, lng: citizen.lng, lat: citizen.lat, onClick: () => { popupRef.current?.remove(); onSelectRef.current(citizen.id) } })),
      ...(fire ? [{ demo: 'tour-fire', id: 'fire', lng: fire.lng, lat: fire.lat, onClick: () => {} }] : []),
      ...(person ? [{ demo: 'tour-people', id: person.id, lng: person.lng, lat: person.lat, onClick: () => { popupRef.current?.remove(); onSelectRef.current(person.id) } }] : []),
    ]
    const markers = demoMarkersRef.current
    const keys = new Set(wanted.map(item => `${item.demo}:${item.id}`))
    for (const [key, marker] of markers) {
      if (!keys.has(key)) { marker.remove(); markers.delete(key) }
    }
    for (const item of wanted) {
      const key = `${item.demo}:${item.id}`
      let marker = markers.get(key)
      if (!marker) {
        const element = document.createElement('div')
        element.className = item.demo.startsWith('tour-') ? 'demo-marker tour-anchor' : 'demo-marker'
        element.dataset.demo = item.demo
        element.dataset.demoId = item.id
        element.setAttribute('aria-hidden', 'true')
        marker = new mapboxgl.Marker({ element }).setLngLat([item.lng, item.lat]).addTo(map)
        markers.set(key, marker)
      } else {
        marker.setLngLat([item.lng, item.lat])
      }
      marker.getElement().onclick = item.onClick
    }
  }, [loaded, zones, centers, citizens, selectedId, fires])

  useEffect(() => { popupRef.current?.remove() }, [zoneExposure, horizon, marginM, layers])

  useEffect(() => {
    if (!loaded || !focusTarget) return
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (focusTarget.bounds) {
      const bounds = new mapboxgl.LngLatBounds(focusTarget.bounds[0], focusTarget.bounds[1])
      mapRef.current?.fitBounds(bounds, { padding: rootRef.current && rootRef.current.clientWidth > 900 ? { top: 140, bottom: 180, left: 80, right: 380 } : 70, duration: reduced ? 0 : 900, maxZoom: 12 })
      return
    }
    mapRef.current?.flyTo({ center: [focusTarget.lng, focusTarget.lat], zoom: focusTarget.zoom ?? 14, padding: { top: 0, bottom: 0, left: 0, right: 0 }, duration: reduced ? 0 : 850 })
  }, [loaded, focusTarget])

  const locate = () => {
    const selected = citizens.find((citizen) => citizen.id === selectedId)
    if (selected) mapRef.current?.flyTo({ center: [selected.lng, selected.lat], zoom: 14, duration: 850 })
  }

  return (
    <>
      <div ref={rootRef} data-demo="map" className="map-root" aria-label={`Mapa de situación · ${incident.area}`} />
      <WindOverlay mapRef={mapRef} enabled={showWind} directionDeg={windDirection} windKmh={windKmh} />
      {framingHost && createPortal(
        <details className="view-options" onKeyDown={event => { if (event.key === 'Escape') { event.currentTarget.open = false; event.currentTarget.querySelector('summary')?.focus() } }}>
          <summary data-demo="framing-menu" aria-label="Encuadre" title="Encuadre">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d="M12 3v3m0 12v3M3 12h3m12 0h3M19 12a7 7 0 1 1-14 0 7 7 0 0 1 14 0Zm-4 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" /></svg>
          </summary>
          <div onClick={event => { if ((event.target as HTMLElement).closest('button')) { const details = event.currentTarget.closest('details'); if (details) { details.open = false; details.querySelector('summary')?.focus() } } }}>
            <button type="button" data-demo="framing-fire" onClick={() => mapRef.current?.fitBounds(overviewBounds(fireCells, centers, zones, fires), { padding: { top: 125, bottom: 165, left: 35, right: 35 }, duration: 800, maxZoom: incident.zoom })}>Centrar incendio</button>
            {selectedId && <button type="button" data-demo="framing-person" onClick={locate}>Centrar persona</button>}
            {route && <button type="button" data-demo="framing-route" onClick={() => { const bounds = new mapboxgl.LngLatBounds(); route.coordinates.forEach(point => bounds.extend(point)); mapRef.current?.fitBounds(bounds, { padding: rootRef.current && rootRef.current.clientWidth > 900 ? { top: 140, bottom: 170, left: 80, right: 420 } : 90, duration: 800 }) }}>Ver ruta</button>}
            <button type="button" data-demo="framing-all" onClick={() => mapRef.current?.fitBounds(overviewBounds(fireCells, centers, zones, fires), { padding: overviewPadding(rootRef.current?.clientWidth ?? 1000), duration: 800 })}>Ver todo</button>
          </div>
        </details>,
        framingHost,
      )}
      {!loaded && !mapError && <div className="map-message" role="status">Cargando cartografía…</div>}
      {mapError && <div className="map-message error" role="alert"><strong>Cartografía incompleta</strong><span>{mapError}</span><button type="button" data-demo="map-error-dismiss" onClick={() => setMapError('')}>Cerrar aviso</button></div>}
    </>
  )
}
