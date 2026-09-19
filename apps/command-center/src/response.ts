export type ResponseCenter = {
  id: string
  name: string
  kind: 'hospital' | 'health' | 'fire'
  lng: number
  lat: number
  address: string
  note: string
  verifiedAt: string
  sources: { label: string; url: string }[]
}

export const CENTER_LABEL = { hospital: 'Hospital', health: 'Centro de salud', fire: 'Bomberos' }
export const CENTER_SYMBOL = { hospital: 'H', health: '+', fire: 'B' }
export const RESPONSE_CENTERS: ResponseCenter[] = [
  {
    id: 'health-arenas', name: 'Centro de Salud de Arenas de San Pedro', kind: 'health',
    lng: -5.0855068, lat: 40.2116975, address: 'Paseo del Pintor Martínez Vázquez, 21 · Arenas de San Pedro',
    note: 'Ubicación del Centro Sanitario San Pedro de Alcántara en OpenStreetMap. No equivale a un hospital. Capacidad y disponibilidad actual no verificadas.',
    verifiedAt: '2026-09-19',
    sources: [
      { label: 'SACYL · centro y dirección', url: 'https://www.saludcastillayleon.es/CAAvila/es/area-influencia/z-b-s-arenas-san-pedro' },
      { label: 'OpenStreetMap · ubicación aproximada', url: 'https://www.openstreetmap.org/way/992325099' },
    ],
  },
  {
    id: 'hospital-prado', name: 'Hospital Nuestra Señora del Prado', kind: 'hospital',
    lng: -4.8073831, lat: 39.9646542, address: 'Carretera Madrid–Extremadura, km 114 · Talavera de la Reina',
    note: 'Centro de SESCAM, en Castilla-La Mancha. Su presencia en el mapa no establece una derivación sanitaria ni confirma camas disponibles.',
    verifiedAt: '2026-09-19',
    sources: [
      { label: 'SESCAM · centro y dirección', url: 'https://sanidad.castillalamancha.es/ciudadanos/centros/hospital-nuestra-senora-del-prado' },
      { label: 'OpenStreetMap · ubicación aproximada', url: 'https://www.openstreetmap.org/way/668566543' },
    ],
  },
  {
    id: 'fire-talavera', name: 'Parque de Bomberos de Talavera de la Reina', kind: 'fire',
    lng: -4.8151033, lat: 39.9552966, address: 'Calle Alfareros · Talavera de la Reina',
    note: 'Instalación cartografiada en OpenStreetMap. Dotación, disponibilidad y competencia territorial no verificadas; no se asignan medios automáticamente. Ramacastañas queda pendiente de verificación.',
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
