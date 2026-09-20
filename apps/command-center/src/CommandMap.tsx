import { useEffect, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import type { GeoJSONSource } from 'mapbox-gl'
import type { FeatureCollection, Polygon, Point, LineString } from 'geojson'
import { FIRE_CELL_SIZE_M } from './scenario'
import type { Incident } from './scenario'
import { destination, haversineMeters } from './geo'
import type { CallArea, Citizen, FireSpot, MapLayers, SafeZone } from './types'
import { EXPOSURE_COLOR, EXPOSURE_LABEL, forecastHeatPoints, windLeanOffset } from './fire-model'
import type { Exposure, FireForecast } from './fire-model'
import { CENTER_COLOR, SITE_EMOJI } from './response'
import type { ResponseCenter } from './response'
import type { RefugeRoute } from './routing'
import { UNIT_EMOJI, UNIT_LABEL, UNIT_STATUS_LABEL } from './units'
import type { DispatchUnit } from './units'
import { WindOverlay } from './WindOverlay'

const PERSON_COLOR = '#459eff'

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
  thermal: ['thermal-core', 'thermal-satellite'],
  citizens: ['people-glow', 'people-dot', 'people-area-highlight', 'people-selection', 'people-label', 'accuracy-fill', 'accuracy-line'],
  references: [],
  zones: ['zone-area', 'zone-edge', 'zone-point', 'zone-label'],
  hospitals: ['center-hospital', 'center-hospital-label'],
  healthCenters: ['center-health', 'center-health-label'],
  fireStations: ['center-fire', 'center-fire-label'],
  routes: ['refuge-route-casing', 'refuge-route-line'],
  callArea: ['call-area-fill', 'call-area-edge'],
  units: ['unit-point', 'unit-label'],
}

type Props = {
  liveMode?: boolean
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
  const [leanLng, leanLat] = windLeanOffset(forecast, 0.5)
  return {
    type: 'FeatureCollection',
    features: [
      ...cells.features.flatMap(feature => sampleHeat(feature, Number(feature.properties?.heat ?? 0.7), Math.max(2, Number(feature.properties?.cellCount) || 1)).map(point => ({
        ...point,
        geometry: { type: 'Point' as const, coordinates: [point.geometry.coordinates[0] + leanLng, point.geometry.coordinates[1] + leanLat] },
      }))),
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
      },
      geometry: { type: 'Point', coordinates: [citizen.lng, citizen.lat] },
    })),
  }
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
      properties: { id: unit.id, kind: unit.kind, name: UNIT_LABEL[unit.kind], status: UNIT_STATUS_LABEL[unit.status] },
      geometry: { type: 'Point', coordinates: [unit.lng, unit.lat] },
    })),
  }
}

function callAreaGeo(area: CallArea | null): FeatureCollection<Polygon> {
  return { type: 'FeatureCollection', features: area && area.radiusM > 0 ? [{ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [circle(area.lng, area.lat, area.radiusM)] } }] : [] }
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

export function CommandMap({ token, citizens, fires, zones, selectedId, layers, onSelect, projection, forecast, zoneExposure, horizon, marginM, route, focusTarget, onCenterSelect, showWind, windDirection, windKmh, callArea, areaIds, drawingArea, onAreaChange, onAreaComplete, units, onUnitSelect, fireCells, centers, incident, liveMode = false }: Props) {
  const rootRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const popupRef = useRef<mapboxgl.Popup | null>(null)
  const onSelectRef = useRef(onSelect)
  const onCenterSelectRef = useRef(onCenterSelect)
  const onUnitSelectRef = useRef(onUnitSelect)
  const interactionRef = useRef({ drawingArea, onAreaChange, onAreaComplete })
  const suppressClickRef = useRef(false)
  useEffect(() => { interactionRef.current = { drawingArea, onAreaChange, onAreaComplete } }, [drawingArea, onAreaChange, onAreaComplete])
  const dataRef = useRef({ citizens, fires, zones, selectedId, layers, projection, forecast, zoneExposure, horizon, marginM, route, callArea, areaIds, units })
  const [satellite, setSatellite] = useState(false)
  const [mapError, setMapError] = useState('')
  const [loaded, setLoaded] = useState(false)
  onSelectRef.current = onSelect
  onCenterSelectRef.current = onCenterSelect
  onUnitSelectRef.current = onUnitSelect
  dataRef.current = { citizens, fires, zones, selectedId, layers, projection, forecast, zoneExposure, horizon, marginM, route, callArea, areaIds, units }

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
    const popup = new mapboxgl.Popup({ closeButton: true, offset: 10, className: 'vigia-popup', maxWidth: '300px' })
    popupRef.current = popup
    map.addControl(new mapboxgl.NavigationControl({ showCompass: true }), 'bottom-right')
    map.addControl(new mapboxgl.ScaleControl({ maxWidth: 110, unit: 'metric' }), 'bottom-left')
    map.addControl(new mapboxgl.AttributionControl({ compact: true }), 'bottom-right')
    map.on('error', (event) => setMapError(event.error.message || 'No se ha podido cargar la cartografía.'))
    let flame = 0

    const onLoad = () => {
      const current = dataRef.current
      const firstLabel = map.getStyle().layers.find((layer) => layer.type === 'symbol')?.id
      map.addSource('satellite-base', { type: 'raster', url: 'mapbox://mapbox.satellite', tileSize: 256 })
      map.addLayer({ id: 'satellite-base', type: 'raster', source: 'satellite-base', layout: { visibility: 'none' }, paint: { 'raster-saturation': -0.12, 'raster-brightness-max': 0.95 } }, firstLabel)

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

      map.addSource('call-area', { type: 'geojson', data: callAreaGeo(current.callArea) })
      map.addLayer({ id: 'call-area-fill', type: 'fill', source: 'call-area', paint: { 'fill-color': '#77c8f4', 'fill-opacity': 0.09 } })
      map.addLayer({ id: 'call-area-edge', type: 'line', source: 'call-area', paint: { 'line-color': '#a7e1ff', 'line-width': 2, 'line-dasharray': [3, 2] } })
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
        'circle-color': ['case', ['get', 'answered'], '#4de3a6', ['==', ['get', 'status'], 'ringing'], '#f3bd61', PERSON_COLOR],
        'circle-opacity': 0.22,
        'circle-blur': 0.9,
      } })
      map.addLayer({ id: 'people-dot', type: 'circle', source: 'people', layout: { 'circle-sort-key': ['case', ['get', 'answered'], 2, ['==', ['get', 'status'], 'ringing'], 1, 0] }, paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 1.3, 11, 2, 14, 3.4, 17, 4.6],
        'circle-color': ['case', ['get', 'answered'], '#4de3a6', ['==', ['get', 'status'], 'ringing'], '#f3bd61', PERSON_COLOR],
        'circle-opacity': 1,
        'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 8, 0.5, 14, 1, 17, 1.3],
        'circle-stroke-color': '#0a1117',
        'circle-stroke-opacity': 0.85,
      } })
      map.addLayer({ id: 'people-area-highlight', type: 'circle', source: 'people', paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 2.3, 11, 3, 14, 4.4, 17, 5.6], 'circle-opacity': 0, 'circle-stroke-color': '#d3f0ff', 'circle-stroke-width': 1, 'circle-stroke-opacity': 0.5 } }, 'people-dot')
      map.addLayer({ id: 'people-selection', type: 'circle', source: 'people', paint: { 'circle-radius': 7, 'circle-opacity': 0, 'circle-stroke-color': '#e2edf3', 'circle-stroke-width': 1 } })
      map.addLayer({ id: 'people-label', type: 'symbol', source: 'people', layout: { 'text-field': ['get', 'name'], 'text-size': 11, 'text-offset': [0, -1.8], 'text-allow-overlap': true }, paint: { 'text-color': '#e2edf3', 'text-halo-color': '#101820', 'text-halo-width': 2 } })
      map.addSource('units', { type: 'geojson', data: unitsGeo(current.units) })
      for (const kind of ['ambulance', 'police', 'fire'] as const) {
        map.addImage(`unit-marker-${kind}`, emojiMarker(UNIT_EMOJI[kind]), { pixelRatio: 2 })
      }
      map.addLayer({ id: 'unit-point', type: 'symbol', source: 'units', layout: { 'icon-image': ['concat', 'unit-marker-', ['get', 'kind']], 'icon-size': 1, 'icon-allow-overlap': true, 'icon-ignore-placement': true } })
      map.addLayer({ id: 'unit-label', type: 'symbol', source: 'units', layout: { 'text-field': ['get', 'name'], 'text-size': 10, 'text-offset': [0, 2.1], 'text-anchor': 'top', 'text-allow-overlap': true }, paint: { 'text-color': '#e8f1f6', 'text-halo-color': '#101820', 'text-halo-width': 2 } })
      patchLayers(map, current.layers, current.selectedId, current.areaIds)

      map.on('click', (event) => {
        if (interactionRef.current.drawingArea || suppressClickRef.current) { suppressClickRef.current = false; return }
        const { x, y } = event.point
        const box: [mapboxgl.PointLike, mapboxgl.PointLike] = [[x - 8, y - 8], [x + 8, y + 8]]
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
          const content = document.createElement('div')
          const title = document.createElement('strong')
          title.textContent = `${zone.code} · ${zone.name}`
          const exposure = dataRef.current.zoneExposure[zone.id]
          const risk = document.createElement('p')
          risk.style.color = EXPOSURE_COLOR[exposure?.level ?? 'unknown']
          risk.textContent = `${EXPOSURE_LABEL[exposure?.level ?? 'unknown']} · +${dataRef.current.horizon} min${exposure && Number.isFinite(exposure.minute) ? ` · +${Math.ceil(exposure.minute)} min` : ''}`
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
          popup.setLngLat([zone.lng, zone.lat]).setDOMContent(content).addTo(map)
          return
        }
        const unitHit = map.queryRenderedFeatures(box, { layers: ['unit-point', 'unit-label'] })[0]
        if (unitHit?.properties?.id) {
          popup.remove()
          onUnitSelectRef.current(String(unitHit.properties.id))
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
        const features = map.queryRenderedFeatures([[x - 7, y - 7], [x + 7, y + 7]], { layers: ['unit-point', 'unit-label', 'people-dot', 'thermal-core', 'thermal-satellite', 'fire-flame', 'fire-ember', 'fire-smoke', 'zone-point', 'zone-label', 'center-hospital', 'center-health', 'center-fire', 'center-hospital-label', 'center-health-label', 'center-fire-label'] })
        map.getCanvas().style.cursor = interactionRef.current.drawingArea ? 'crosshair' : features.length ? 'pointer' : ''
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
  }, [loaded, forecast, horizon, fireCells, zones, zoneExposure])

  useEffect(() => {
    if (loaded && mapRef.current) source(mapRef.current, 'refuge-route')?.setData(routeGeo(route))
  }, [loaded, route])

  useEffect(() => {
    if (loaded && mapRef.current) source(mapRef.current, 'call-area')?.setData(callAreaGeo(callArea))
  }, [loaded, callArea])

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

  useEffect(() => {
    const map = mapRef.current
    if (loaded && map?.getLayer('satellite-base')) map.setLayoutProperty('satellite-base', 'visibility', satellite ? 'visible' : 'none')
  }, [satellite, loaded])

  const locate = () => {
    const selected = citizens.find((citizen) => citizen.id === selectedId)
    if (selected) mapRef.current?.flyTo({ center: [selected.lng, selected.lat], zoom: 14, duration: 850 })
  }

  const framePeople = () => {
    if (!citizens.length) return
    const bounds = new mapboxgl.LngLatBounds()
    citizens.forEach(person => bounds.extend([person.lng, person.lat]))
    mapRef.current?.fitBounds(bounds, { padding: 80, maxZoom: 15, duration: 800 })
  }

  return (
    <>
      <div ref={rootRef} className="map-root" aria-label={`Mapa de situación · ${incident.area}`} />
      <WindOverlay mapRef={mapRef} enabled={showWind} directionDeg={windDirection} windKmh={windKmh} />
      <div className="map-toolbar" role="group" aria-label="Vista cartográfica">
        <button type="button" className={!satellite ? 'active' : ''} aria-pressed={!satellite} onClick={() => setSatellite(false)}>Mapa</button>
        <button type="button" className={satellite ? 'active' : ''} aria-pressed={satellite} onClick={() => setSatellite(true)}>Satélite</button>
        <span className="toolbar-divider" />
        <details className="view-options" onKeyDown={event => { if (event.key === 'Escape') { event.currentTarget.open = false; event.currentTarget.querySelector('summary')?.focus() } }}>
          <summary>Encuadre</summary>
          <div onClick={event => { if ((event.target as HTMLElement).closest('button')) { const details = event.currentTarget.closest('details'); if (details) { details.open = false; details.querySelector('summary')?.focus() } } }}>
            <button type="button" disabled={liveMode && !citizens.length} onClick={liveMode ? framePeople : () => mapRef.current?.fitBounds(overviewBounds(fireCells, centers, zones, fires), { padding: { top: 125, bottom: 165, left: 35, right: 35 }, duration: 800, maxZoom: incident.zoom })}>{liveMode ? 'Centrar censo' : 'Centrar incendio'}</button>
            {selectedId && <button type="button" onClick={locate}>Centrar persona</button>}
            {route && <button type="button" onClick={() => { const bounds = new mapboxgl.LngLatBounds(); route.coordinates.forEach(point => bounds.extend(point)); mapRef.current?.fitBounds(bounds, { padding: rootRef.current && rootRef.current.clientWidth > 900 ? { top: 140, bottom: 170, left: 80, right: 420 } : 90, duration: 800 }) }}>Ver ruta</button>}
            <button type="button" disabled={liveMode && !citizens.length} onClick={liveMode ? framePeople : () => mapRef.current?.fitBounds(overviewBounds(fireCells, centers, zones, fires), { padding: overviewPadding(rootRef.current?.clientWidth ?? 1000), duration: 800 })}>Ver todo</button>
          </div>
        </details>
      </div>
      {!loaded && !mapError && <div className="map-message" role="status">Cargando cartografía…</div>}
      {mapError && <div className="map-message error" role="alert"><strong>Cartografía incompleta</strong><span>{mapError}</span><button type="button" onClick={() => setMapError('')}>Cerrar aviso</button></div>}
    </>
  )
}
