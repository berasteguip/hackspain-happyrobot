export type ResponseCenter = {
  id: string
  name: string
  kind: 'hospital' | 'health' | 'fire'
  lng: number
  lat: number
  address: string
  note: string
  verifiedAt: string
  locationSource: 'osm' | 'demo'
  realLocation?: { lng: number; lat: number }
  sources: { label: string; url: string }[]
}

export const CENTER_LABEL = { hospital: 'Hospital', health: 'Centro de salud', fire: 'Bomberos' }
export const CENTER_SYMBOL = { hospital: 'H', health: '+', fire: 'B' }
export const RESPONSE_CENTERS: ResponseCenter[] = [
  {
    id: 'health-arenas', name: 'Centro de Salud de Arenas de San Pedro', kind: 'health', locationSource: 'osm',
    lng: -5.0855068, lat: 40.2116975, address: 'Paseo del Pintor Martínez Vázquez, 21 · Arenas de San Pedro',
    note: 'Ubicación del Centro Sanitario San Pedro de Alcántara en OpenStreetMap. No equivale a un hospital. Capacidad y disponibilidad actual no verificadas.',
    verifiedAt: '2026-09-19',
    sources: [
      { label: 'SACYL · centro y dirección', url: 'https://www.saludcastillayleon.es/CAAvila/es/area-influencia/z-b-s-arenas-san-pedro' },
      { label: 'OpenStreetMap · ubicación aproximada', url: 'https://www.openstreetmap.org/way/992325099' },
    ],
  },
  {
    id: 'hospital-prado', name: 'Hospital Nuestra Señora del Prado · demo', kind: 'hospital', locationSource: 'demo',
    lng: -5.075, lat: 40.215, realLocation: { lng: -4.8073831, lat: 39.9646542 }, address: 'Carretera Madrid–Extremadura, km 114 · Talavera de la Reina',
    note: 'Posición ficticia trasladada al escenario de Gredos para la demo. El hospital real de SESCAM está en Talavera de la Reina. No indica una derivación sanitaria ni camas disponibles.',
    verifiedAt: '2026-09-19',
    sources: [
      { label: 'SESCAM · centro y dirección', url: 'https://sanidad.castillalamancha.es/ciudadanos/centros/hospital-nuestra-senora-del-prado' },
      { label: 'OpenStreetMap · ubicación aproximada', url: 'https://www.openstreetmap.org/way/668566543' },
    ],
  },
  {
    id: 'fire-talavera', name: 'Parque de Bomberos de Talavera · demo', kind: 'fire', locationSource: 'demo',
    lng: -5.148, lat: 40.208, realLocation: { lng: -4.8151033, lat: 39.9552966 }, address: 'Calle Alfareros · Talavera de la Reina',
    note: 'Posición ficticia trasladada al escenario de Gredos para la demo. El parque real está en Talavera. Dotación, disponibilidad y competencia territorial no verificadas; no se asignan medios automáticamente.',
    verifiedAt: '2026-09-19',
    sources: [{ label: 'OpenStreetMap · instalación y ubicación aproximada', url: 'https://www.openstreetmap.org/way/645765574' }],
  },
]

export type DemoNotice = {
  id: string
  centerId: string
  message: string
  scenario: string
  status: 'draft' | 'simulated' | 'acknowledged'
  createdAt: number
  updatedAt: number
}
export const NOTICE_LABEL = { draft: 'Borrador · pendiente de revisión', simulated: 'Envío simulado · no enviado', acknowledged: 'Acuse simulado · no confirmado' }

export function createNotice(center: ResponseCenter, message: string, scenario: string): DemoNotice {
  if (!message.trim()) throw new Error('El aviso necesita un mensaje')
  const now = Date.now()
  return { id: crypto.randomUUID(), centerId: center.id, message: message.trim(), scenario, status: 'draft', createdAt: now, updatedAt: now }
}

export function transitionNotice(notice: DemoNotice, status: DemoNotice['status']): DemoNotice {
  const allowed = notice.status === 'draft' && status === 'simulated' || notice.status === 'simulated' && status === 'acknowledged'
  return allowed ? { ...notice, status, updatedAt: Date.now() } : notice
}
