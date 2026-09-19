import { useEffect, useRef } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import type { GeoJSONSource } from 'mapbox-gl'
import type { FeatureCollection, Polygon, Point } from 'geojson'
import { INCIDENT, RISK_AREA } from './scenario'
import type { Citizen, FireSpot, SafeZone } from './types'

const STATUS_COLOR: Record<string, string> = {
  pending: '#6f7b88',
  ringing: '#f5c84c',
  no_answer: '#ff7a4d',
  informed: '#c4b5fd',
  tracking: '#5cc8ff',
  evacuating: '#5cc8ff',
  safe: '#3ee0a5',
  refused: '#9aa3ad',
}

type Props = {
  token: string
  citizens: Citizen[]
  fires: FireSpot[]
  zones: SafeZone[]
  selectedId: string | null
  onSelect: (id: string | null) => void
}

function firesGeo(fires: FireSpot[]): FeatureCollection<Point> {
  return {
    type: 'FeatureCollection',
    features: fires.map((fire) => ({
      type: 'Feature',
      properties: {
        id: fire.id,
        frp: fire.frp,
        confidence: fire.confidence,
        source: fire.source,
        acquiredAt: fire.acquiredAt,
      },
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
        id: citizen.id,
        name: citizen.name,
        status: citizen.status,
        vulnerable: citizen.vulnerable,
        live: Boolean(citizen.live),
      },
      geometry: { type: 'Point', coordinates: [citizen.lng, citizen.lat] },
    })),
  }
}

function zonesGeo(zones: SafeZone[]): FeatureCollection<Point> {
  return {
    type: 'FeatureCollection',
    features: zones.map((zone) => ({
      type: 'Feature',
      properties: { id: zone.id, name: zone.name, radiusM: zone.radiusM },
      geometry: { type: 'Point', coordinates: [zone.lng, zone.lat] },
    })),
  }
}

function riskGeo(): FeatureCollection<Polygon> {
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { name: RISK_AREA.name },
        geometry: { type: 'Polygon', coordinates: [RISK_AREA.coordinates] },
      },
    ],
  }
}

function source(map: mapboxgl.Map, id: string) {
  return map.getSource(id) as GeoJSONSource | undefined
}

export function CommandMap({
  token,
  citizens,
  fires,
  zones,
  selectedId,
  onSelect,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const popupRef = useRef<mapboxgl.Popup | null>(null)
  const onSelectRef = useRef(onSelect)
  const dataRef = useRef({ citizens, fires, zones, selectedId })
  onSelectRef.current = onSelect
  dataRef.current = { citizens, fires, zones, selectedId }

  useEffect(() => {
    if (!rootRef.current) return
    mapboxgl.accessToken = token

    const map = new mapboxgl.Map({
      container: rootRef.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: INCIDENT.center,
      zoom: INCIDENT.zoom,
      pitch: 48,
      bearing: -18,
      attributionControl: false,
    })
    mapRef.current = map
    popupRef.current = new mapboxgl.Popup({
      closeButton: false,
      offset: 12,
      className: 'vigia-popup',
    })

    map.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), 'bottom-right')
    map.addControl(new mapboxgl.ScaleControl({ maxWidth: 120, unit: 'metric' }), 'bottom-left')
    map.addControl(new mapboxgl.AttributionControl({ compact: true }), 'bottom-right')

    const onLoad = () => {
      map.addSource('risk', { type: 'geojson', data: riskGeo() })
      map.addLayer({
        id: 'risk-fill',
        type: 'fill',
        source: 'risk',
        paint: { 'fill-color': '#ff5a1f', 'fill-opacity': 0.12 },
      })
      map.addLayer({
        id: 'risk-line',
        type: 'line',
        source: 'risk',
        paint: {
          'line-color': '#ff7a3d',
          'line-width': 1.6,
          'line-dasharray': [2, 1.4],
        },
      })

      map.addSource('zones', { type: 'geojson', data: zonesGeo(dataRef.current.zones) })
      map.addLayer({
        id: 'zones-halo',
        type: 'circle',
        source: 'zones',
        paint: {
          'circle-radius': 28,
          'circle-color': '#3ee0a5',
          'circle-opacity': 0.14,
          'circle-stroke-width': 1.4,
          'circle-stroke-color': '#3ee0a5',
        },
      })
      map.addLayer({
        id: 'zones-label',
        type: 'symbol',
        source: 'zones',
        layout: {
          'text-field': ['get', 'name'],
          'text-size': 11,
          'text-offset': [0, 1.8],
          'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Regular'],
        },
        paint: {
          'text-color': '#d7fff0',
          'text-halo-color': '#07110c',
          'text-halo-width': 1.2,
        },
      })

      map.addSource('fires', { type: 'geojson', data: firesGeo(dataRef.current.fires) })
      map.addLayer({
        id: 'fires-heat',
        type: 'heatmap',
        source: 'fires',
        paint: {
          'heatmap-weight': ['interpolate', ['linear'], ['get', 'frp'], 0, 0.2, 40, 0.7, 120, 1],
          'heatmap-intensity': 1.15,
          'heatmap-radius': 28,
          'heatmap-opacity': 0.7,
          'heatmap-color': [
            'interpolate',
            ['linear'],
            ['heatmap-density'],
            0, 'rgba(0,0,0,0)',
            0.2, 'rgba(255,140,40,0.25)',
            0.5, 'rgba(255,80,20,0.55)',
            0.85, 'rgba(255,30,10,0.85)',
          ],
        },
      })
      map.addLayer({
        id: 'fires-glow',
        type: 'circle',
        source: 'fires',
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['get', 'frp'], 5, 6, 40, 10, 120, 16],
          'circle-color': [
            'match',
            ['get', 'confidence'],
            'high', '#ff4d1a',
            'nominal', '#ff8a2b',
            '#ffc14d',
          ],
          'circle-opacity': 0.9,
          'circle-blur': 0.15,
          'circle-stroke-width': 1,
          'circle-stroke-color': '#fff3d8',
        },
      })

      map.addSource('citizens', { type: 'geojson', data: citizensGeo(dataRef.current.citizens) })
      map.addLayer({
        id: 'citizens-pulse',
        type: 'circle',
        source: 'citizens',
        filter: ['in', ['get', 'status'], ['literal', ['tracking', 'evacuating', 'ringing']]],
        paint: {
          'circle-radius': 11,
          'circle-color': [
            'match',
            ['get', 'status'],
            'ringing', '#f5c84c',
            '#5cc8ff',
          ],
          'circle-opacity': 0.22,
        },
      })
      map.addLayer({
        id: 'citizens-dot',
        type: 'circle',
        source: 'citizens',
        paint: {
          'circle-radius': [
            'case',
            ['==', ['get', 'id'], dataRef.current.selectedId ?? ''],
            7.5,
            ['get', 'vulnerable'],
            6.2,
            5,
          ],
          'circle-color': [
            'match',
            ['get', 'status'],
            ...Object.entries(STATUS_COLOR).flat(),
            '#ffffff',
          ],
          'circle-stroke-width': [
            'case',
            ['==', ['get', 'id'], dataRef.current.selectedId ?? ''],
            2.4,
            ['get', 'vulnerable'],
            1.6,
            1,
          ],
          'circle-stroke-color': [
            'case',
            ['==', ['get', 'id'], dataRef.current.selectedId ?? ''],
            '#ffffff',
            ['get', 'vulnerable'],
            '#ffd36a',
            '#0b0f14',
          ],
        },
      })

      map.on('click', 'citizens-dot', (event) => {
        const feature = event.features?.[0]
        const id = feature?.properties?.id as string | undefined
        if (id) onSelectRef.current(id)
      })
      map.on('click', 'fires-glow', (event) => {
        const feature = event.features?.[0]
        if (!feature || !popupRef.current) return
        const props = feature.properties ?? {}
        popupRef.current
          .setLngLat(event.lngLat)
          .setHTML(
            `<strong>Foco ${props.source === 'firms' ? 'NASA FIRMS' : 'operativo'}</strong>
             <div>FRP ${Number(props.frp).toFixed(1)} MW · ${props.confidence}</div>
             <div>${props.acquiredAt ?? ''}</div>`,
          )
          .addTo(map)
      })
      map.on('mouseenter', 'citizens-dot', () => {
        map.getCanvas().style.cursor = 'pointer'
      })
      map.on('mouseleave', 'citizens-dot', () => {
        map.getCanvas().style.cursor = ''
      })
    }

    map.on('load', onLoad)

    const resize = new ResizeObserver(() => map.resize())
    resize.observe(rootRef.current)

    return () => {
      resize.disconnect()
      map.remove()
      mapRef.current = null
    }
    // Map is created once per token; live data is patched in the next effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  useEffect(() => {
    const map = mapRef.current
    if (!map?.isStyleLoaded()) return
    source(map, 'fires')?.setData(firesGeo(fires))
    source(map, 'citizens')?.setData(citizensGeo(citizens))
    source(map, 'zones')?.setData(zonesGeo(zones))
    if (map.getLayer('citizens-dot')) {
      map.setPaintProperty('citizens-dot', 'circle-radius', [
        'case',
        ['==', ['get', 'id'], selectedId ?? ''],
        7.5,
        ['get', 'vulnerable'],
        6.2,
        5,
      ])
      map.setPaintProperty('citizens-dot', 'circle-stroke-width', [
        'case',
        ['==', ['get', 'id'], selectedId ?? ''],
        2.4,
        ['get', 'vulnerable'],
        1.6,
        1,
      ])
      map.setPaintProperty('citizens-dot', 'circle-stroke-color', [
        'case',
        ['==', ['get', 'id'], selectedId ?? ''],
        '#ffffff',
        ['get', 'vulnerable'],
        '#ffd36a',
        '#0b0f14',
      ])
    }
  }, [citizens, fires, zones, selectedId])

  return <div ref={rootRef} className="map-root" />
}
