import { useEffect, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import type { GeoJSONSource } from 'mapbox-gl'
import type { FeatureCollection, Polygon, Point } from 'geojson'
import { FIRE_CELL_SIZE_M, SCENARIO_FIRE_CELLS, INCIDENT, SPREAD_AREA } from './scenario'
import { destination } from './geo'
import type { Citizen, FireSpot, MapLayers, RiskArea, SafeZone } from './types'

const STATUS_COLOR: Record<string, string> = {
  pending: '#8c99a5', ringing: '#dac184', no_answer: '#d79770',
  informed: '#b1bcd0', tracking: '#8bc9df', evacuating: '#8bc9df',
  safe: '#82baa0', refused: '#8c99a5',
}

const LAYER_IDS: Record<keyof MapLayers, string[]> = {
  perimeter: ['fire-cells-fill'],
  spread: ['spread-fill', 'spread-hatch', 'spread-edge'],
  thermal: ['thermal-core', 'thermal-satellite'],
  citizens: ['people-dot', 'people-selection', 'people-label', 'accuracy-fill', 'accuracy-line'],
  references: [],
  zones: ['zone-area', 'zone-edge', 'zone-point', 'zone-label'],
}

type Props = {
  token: string
  citizens: Citizen[]
  fires: FireSpot[]
  zones: SafeZone[]
  selectedId: string | null
  layers: MapLayers
  onSelect: (id: string | null) => void
}

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
        id: citizen.id, name: citizen.name, status: citizen.status,
        reference: !citizen.locationSource || citizen.locationSource === 'reference' || citizen.locationSource === 'unknown',
      },
      geometry: { type: 'Point', coordinates: [citizen.lng, citizen.lat] },
    })),
  }
}

function polygonGeo(area: RiskArea): FeatureCollection<Polygon> {
  return {
    type: 'FeatureCollection',
    features: [{ type: 'Feature', properties: { name: area.name }, geometry: { type: 'Polygon', coordinates: [area.coordinates] } }],
  }
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

function patchLayers(map: mapboxgl.Map, layers: MapLayers, selectedId: string | null) {
  for (const [key, ids] of Object.entries(LAYER_IDS)) {
    for (const id of ids) {
      if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', layers[key as keyof MapLayers] ? 'visible' : 'none')
    }
  }
  const visible: mapboxgl.FilterSpecification = layers.references ? ['has', 'id'] : ['==', ['get', 'reference'], false]
  map.setFilter('people-dot', visible)
  for (const id of ['people-selection', 'people-label']) {
    map.setFilter(id, ['all', visible, ['==', ['get', 'id'], selectedId ?? '']])
  }
}

export function CommandMap({ token, citizens, fires, zones, selectedId, layers, onSelect }: Props) {
  const rootRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const onSelectRef = useRef(onSelect)
  const dataRef = useRef({ citizens, fires, zones, selectedId, layers })
  const [satellite, setSatellite] = useState(false)
  const [mapError, setMapError] = useState('')
  const [loaded, setLoaded] = useState(false)
  onSelectRef.current = onSelect
  dataRef.current = { citizens, fires, zones, selectedId, layers }

  useEffect(() => {
    if (!rootRef.current) return
    const map = new mapboxgl.Map({
      container: rootRef.current,
      accessToken: token,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: INCIDENT.center, zoom: rootRef.current.clientWidth < 680 ? 11.35 : INCIDENT.zoom, pitch: 0, bearing: 0,
      attributionControl: false,
    })
    mapRef.current = map
    const popup = new mapboxgl.Popup({ closeButton: true, offset: 10, className: 'vigia-popup', maxWidth: '270px' })
    map.addControl(new mapboxgl.NavigationControl({ showCompass: true }), 'bottom-right')
    map.addControl(new mapboxgl.ScaleControl({ maxWidth: 110, unit: 'metric' }), 'bottom-left')
    map.addControl(new mapboxgl.AttributionControl({ compact: true }), 'bottom-right')
    map.on('error', (event) => setMapError(event.error.message || 'No se ha podido cargar la cartografía.'))

    const onLoad = () => {
      const current = dataRef.current
      const firstLabel = map.getStyle().layers.find((layer) => layer.type === 'symbol')?.id
      map.addSource('satellite-base', { type: 'raster', url: 'mapbox://mapbox.satellite', tileSize: 256 })
      map.addLayer({ id: 'satellite-base', type: 'raster', source: 'satellite-base', layout: { visibility: 'none' }, paint: { 'raster-saturation': -0.12, 'raster-brightness-max': 0.95 } }, firstLabel)

      const hatch = new Uint8Array(8 * 8 * 4)
      for (let y = 0; y < 8; y += 1) {
        for (let x = 0; x < 8; x += 1) {
          const offset = (y * 8 + x) * 4
          hatch.set([210, 166, 99, (x + y) % 8 < 2 ? 85 : 0], offset)
        }
      }
      map.addImage('spread-pattern', { width: 8, height: 8, data: hatch })
      map.addSource('spread', { type: 'geojson', data: polygonGeo(SPREAD_AREA) })
      map.addLayer({ id: 'spread-fill', type: 'fill', source: 'spread', paint: { 'fill-color': '#bb8a47', 'fill-opacity': 0.07 } })
      map.addLayer({ id: 'spread-hatch', type: 'fill', source: 'spread', paint: { 'fill-pattern': 'spread-pattern', 'fill-opacity': 0.6 } })
      map.addLayer({ id: 'spread-edge', type: 'line', source: 'spread', paint: { 'line-color': '#c2a16c', 'line-width': 1, 'line-opacity': 0.65, 'line-dasharray': [4, 4] } })

      map.addSource('fire-cells', { type: 'geojson', data: SCENARIO_FIRE_CELLS, buffer: 0, tolerance: 0 })
      map.addLayer({
        id: 'fire-cells-fill', type: 'fill', source: 'fire-cells',
        paint: { 'fill-color': '#ff0000', 'fill-opacity': 1, 'fill-antialias': false },
      }, firstLabel)

      map.addSource('zones-area', {
        type: 'geojson', data: {
          type: 'FeatureCollection', features: current.zones.map((zone) => ({
            type: 'Feature', properties: { name: zone.name },
            geometry: { type: 'Polygon', coordinates: [circle(zone.lng, zone.lat, zone.radiusM)] },
          })),
        },
      })
      map.addLayer({ id: 'zone-area', type: 'fill', source: 'zones-area', paint: { 'fill-color': '#80bba2', 'fill-opacity': 0.12 } })
      map.addLayer({ id: 'zone-edge', type: 'line', source: 'zones-area', paint: { 'line-color': '#80bba2', 'line-width': 1, 'line-opacity': 0.6 } })
      map.addSource('zones', {
        type: 'geojson', data: {
          type: 'FeatureCollection', features: current.zones.map((zone) => ({
            type: 'Feature', properties: { name: zone.name.split(' · ')[1] ?? zone.name },
            geometry: { type: 'Point', coordinates: [zone.lng, zone.lat] },
          })),
        },
      })
      map.addLayer({ id: 'zone-point', type: 'symbol', source: 'zones', layout: { 'text-field': '+', 'text-size': 19, 'text-allow-overlap': true }, paint: { 'text-color': '#a5d0bb', 'text-halo-color': '#15231c', 'text-halo-width': 2 } })
      map.addLayer({ id: 'zone-label', type: 'symbol', source: 'zones', layout: { 'text-field': ['get', 'name'], 'text-size': 10, 'text-offset': [0, 1.6] }, paint: { 'text-color': '#add1be', 'text-halo-color': '#121b18', 'text-halo-width': 1.5 } })

      map.addSource('thermal', { type: 'geojson', data: firesGeo(current.fires) })
      map.addLayer({ id: 'thermal-core', type: 'circle', source: 'thermal', filter: ['==', ['get', 'source'], 'scenario'], paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 9, 1.5, 13, 2.5, 16, 4],
        'circle-color': '#f7b481', 'circle-opacity': 0.95, 'circle-stroke-color': '#8b3a28', 'circle-stroke-width': 1,
      } })
      map.addLayer({ id: 'thermal-satellite', type: 'circle', source: 'thermal', filter: ['==', ['get', 'source'], 'firms'], paint: {
        'circle-radius': 3.5, 'circle-color': '#e7aa68', 'circle-opacity': 0.15,
        'circle-stroke-color': '#e7aa68', 'circle-stroke-width': 1.2,
      } })

      map.addSource('accuracy', { type: 'geojson', data: accuracyGeo(current.citizens.find((citizen) => citizen.id === current.selectedId)) })
      map.addLayer({ id: 'accuracy-fill', type: 'fill', source: 'accuracy', paint: { 'fill-color': '#92c6d8', 'fill-opacity': 0.08 } })
      map.addLayer({ id: 'accuracy-line', type: 'line', source: 'accuracy', paint: { 'line-color': '#92c6d8', 'line-width': 1, 'line-dasharray': [2, 3] } })
      map.addSource('people', { type: 'geojson', data: citizensGeo(current.citizens) })
      map.addLayer({ id: 'people-dot', type: 'circle', source: 'people', paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 0.8, 11, 1.2, 14, 2.3, 17, 3.2],
        'circle-color': ['match', ['get', 'status'], ...Object.entries(STATUS_COLOR).flat(), '#8c99a5'],
        'circle-opacity': ['case', ['get', 'reference'], 0.12, 0.95],
        'circle-stroke-width': 0.85,
        'circle-stroke-color': ['match', ['get', 'status'], ...Object.entries(STATUS_COLOR).flat(), '#8c99a5'],
        'circle-stroke-opacity': 0.8,
      } })
      map.addLayer({ id: 'people-selection', type: 'circle', source: 'people', paint: { 'circle-radius': 7, 'circle-opacity': 0, 'circle-stroke-color': '#e2edf3', 'circle-stroke-width': 1 } })
      map.addLayer({ id: 'people-label', type: 'symbol', source: 'people', layout: { 'text-field': ['get', 'name'], 'text-size': 11, 'text-offset': [0, -1.8], 'text-allow-overlap': true }, paint: { 'text-color': '#e2edf3', 'text-halo-color': '#101820', 'text-halo-width': 2 } })
      patchLayers(map, current.layers, current.selectedId)

      map.on('click', (event) => {
        const { x, y } = event.point
        const box: [mapboxgl.PointLike, mapboxgl.PointLike] = [[x - 8, y - 8], [x + 8, y + 8]]
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
          title.textContent = props.source === 'firms' ? 'Detección térmica · NASA FIRMS' : 'Foco térmico · simulación'
          const detail = document.createElement('p')
          detail.textContent = `${Number(props.frp).toFixed(1)} MW · ${props.acquiredAt}${props.source === 'firms' ? ' UTC' : ''}`
          const note = document.createElement('small')
          note.textContent = 'Una detección no determina el perímetro ni confirma fuego activo en este instante.'
          content.append(title, detail, note)
          popup.setLngLat(event.lngLat).setDOMContent(content).addTo(map)
          return
        }
        const cell = map.queryRenderedFeatures(event.point, { layers: ['fire-cells-fill'] })[0]
        if (cell) {
          const content = document.createElement('div')
          const title = document.createElement('strong')
          title.textContent = 'Huella térmica · escenario simulado'
          const detail = document.createElement('p')
          detail.textContent = `Celdas ilustrativas de ${FIRE_CELL_SIZE_M} m · no son observaciones NASA`
          const note = document.createElement('small')
          note.textContent = 'El color representa el escenario de demostración, no un perímetro quemado confirmado ni una probabilidad de propagación.'
          content.append(title, detail, note)
          popup.setLngLat(event.lngLat).setDOMContent(content).addTo(map)
          return
        }
        onSelectRef.current(null)
      })
      map.on('mousemove', (event) => {
        const { x, y } = event.point
        const features = map.queryRenderedFeatures([[x - 7, y - 7], [x + 7, y + 7]], { layers: ['people-dot', 'thermal-core', 'thermal-satellite', 'fire-cells-fill'] })
        map.getCanvas().style.cursor = features.length ? 'pointer' : ''
      })
      setLoaded(true)
    }
    map.on('load', onLoad)
    const resize = new ResizeObserver(() => map.resize())
    resize.observe(rootRef.current)
    return () => {
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
    source(map, 'accuracy')?.setData(accuracyGeo(citizens.find((citizen) => citizen.id === selectedId)))
    patchLayers(map, layers, selectedId)
  }, [citizens, fires, selectedId, layers])

  useEffect(() => {
    const map = mapRef.current
    if (loaded && map?.getLayer('satellite-base')) map.setLayoutProperty('satellite-base', 'visibility', satellite ? 'visible' : 'none')
  }, [satellite, loaded])

  const locate = () => {
    const selected = citizens.find((citizen) => citizen.id === selectedId)
    if (selected) mapRef.current?.flyTo({ center: [selected.lng, selected.lat], zoom: 14, duration: 850 })
  }

  return (
    <>
      <div ref={rootRef} className="map-root" aria-label="Mapa de situación de Gredos" />
      <div className="map-toolbar" role="group" aria-label="Vista cartográfica">
        <button type="button" className={!satellite ? 'active' : ''} aria-pressed={!satellite} onClick={() => setSatellite(false)}>Mapa</button>
        <button type="button" className={satellite ? 'active' : ''} aria-pressed={satellite} onClick={() => setSatellite(true)}>Satélite</button>
        <span className="toolbar-divider" />
        <button type="button" onClick={() => mapRef.current?.fitBounds([[-5.18, 40.19], [-5.055, 40.298]], { padding: { top: 125, bottom: 165, left: 35, right: 35 }, duration: 800 })}>Encuadrar</button>
        {selectedId && <button type="button" onClick={locate}>Centrar persona</button>}
      </div>
      {!loaded && !mapError && <div className="map-message" role="status">Cargando cartografía…</div>}
      {mapError && <div className="map-message error" role="alert"><strong>Cartografía incompleta</strong><span>{mapError}</span><button type="button" onClick={() => setMapError('')}>Cerrar aviso</button></div>}
    </>
  )
}
