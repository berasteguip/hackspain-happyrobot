import type { ResponseCenter } from './response'
import { buildCitizens, buildFireCells } from './scenario'
import type { FireScenario, Settlement } from './scenario'
import type { Citizen, FireSpot, SafeZone } from './types'

/** ETSIT-UPM, Avenida Complutense 30. Fuente: etsit.upm.es, 2026-09-19. */
export const ETSIT = { lng: -3.725842, lat: 40.452776 }

const FIRE_CENTER = { lng: -3.7238, lat: 40.4602 }
const FIRE_SCALE = 0.03

/** Entorno del metro Francos Rodríguez, al este de la Dehesa. Fuente: OSM, 2026-09-20. */
const GUIDED = { lng: -3.7120, lat: 40.4535 }
const GUIDED_LOCALITY = 'Colonia de Francos Rodríguez'

const SETTLEMENTS: Settlement[] = [
  { name: 'ETSIT', lng: ETSIT.lng, lat: ETSIT.lat, count: 90, radiusM: 80 },
  // El grupo del recorrido guiado: veinte casas, a favor del viento, apartadas del campus para
  // que el círculo se dibuje sin dudar. Su salida natural es PE-02 (sureste); PE-01 queda al sur.
  { name: 'Colonia de Francos Rodríguez', lng: GUIDED.lng, lat: GUIDED.lat, count: 20, radiusM: 110 },
]

const SAFE_ZONES: SafeZone[] = [
  {
    id: 'z-vallehermoso', code: 'PE-01', name: 'Vallehermoso · Chamberí',
    lng: -3.71, lat: 40.4415, radiusM: 40, capacity: 400,
    services: ['Recepción', 'Ayuda básica'],
    description: 'Entorno del estadio y polideportivo Vallehermoso.',
    sourceUrl: 'https://www.madrid.es/',
  },
  {
    id: 'z-canal', code: 'PE-02', name: 'Parque Santander · Canal',
    lng: -3.7045, lat: 40.447, radiusM: 35, capacity: 300,
    services: ['Recepción', 'Transporte'],
    description: 'Zona abierta al este del campus, fuera de la Dehesa.',
    sourceUrl: 'https://www.madrid.es/',
  },
  {
    id: 'z-moncloa', code: 'PE-03', name: 'Intercambiador de Moncloa',
    lng: -3.7192, lat: 40.435, radiusM: 30, capacity: 800,
    services: ['Cobijo', 'Transporte'],
    description: 'Intercambiador y entorno de la plaza de la Moncloa.',
    sourceUrl: 'https://www.crtm.es/',
  },
]

const FIRES: FireSpot[] = [
  { id: 'm1', lng: -3.7242, lat: 40.4606, frp: 38.4, confidence: 'high', source: 'scenario', acquiredAt: '21:04' },
  { id: 'm2', lng: -3.7234, lat: 40.4601, frp: 52.1, confidence: 'high', source: 'scenario', acquiredAt: '21:04' },
  { id: 'm3', lng: -3.7239, lat: 40.4597, frp: 24.6, confidence: 'nominal', source: 'scenario', acquiredAt: '21:07' },
]

const OUTSIDE: [number, number, string][] = []

/**
 * El censo de Madrid, ajustado a ciudad: aquí se evacúa a pie (4-5,5 km/h), no en coche. En el
 * grupo guiado contestan todas las casas menos una, Angustias Herrera, 84 años, que vive sola y no
 * descuelga: es la que el visitante tiene que encontrar en rojo. Va la última de su grupo para que
 * el rojo aparezca cuando ya se han visto contestar las demás.
 */
function madridCitizens(): Citizen[] {
  const base = buildCitizens(SETTLEMENTS, OUTSIDE)
  const guided = base.filter(citizen => citizen.locality === GUIDED_LOCALITY)
  const silentId = guided[guided.length - 1]?.id
  return base.map((citizen, index): Citizen => {
    const walker: Citizen = { ...citizen, speedKmh: 4 + (index % 4) * 0.5 }
    if (citizen.locality !== GUIDED_LOCALITY) return walker
    if (citizen.id === silentId) return { ...walker, name: 'Angustias Herrera', vulnerable: true, outcome: 'no_answer' }
    return { ...walker, outcome: 'tracking', vulnerable: false }
  })
}

const MADRID_CITIZENS = madridCitizens()

const CENTERS: ResponseCenter[] = [
  {
    id: 'health-arguelles', name: 'Centro de Salud Argüelles', kind: 'health', locationSource: 'osm',
    lng: -3.7172212, lat: 40.427828, address: 'Calle de Quintana, 11 · Madrid',
    note: 'Centro de atención primaria de SERMAS. Capacidad y disponibilidad no verificadas.',
    verifiedAt: '2026-09-19',
    sources: [
      { label: 'Ayuntamiento de Madrid · CS Argüelles', url: 'https://www.madrid.es/portales/munimadrid/es/Inicio/Servicios-sociales-y-salud/Direcciones-y-telefonos/Centro-de-Salud-Arguelles/?vgnextoid=20b54841aa567510VgnVCM2000001f4a900aRCRD' },
      { label: 'OpenStreetMap · nodo 903735671', url: 'https://www.openstreetmap.org/node/903735671' },
    ],
  },
  {
    id: 'hospital-clinico', name: 'Hospital Clínico San Carlos', kind: 'hospital', locationSource: 'osm',
    lng: -3.7199109, lat: 40.4406324, address: 'Calle del Profesor Martín Lagos, s/n · Madrid',
    note: 'Hospital de SERMAS en Ciudad Universitaria. Camas y disponibilidad no verificadas.',
    verifiedAt: '2026-09-19',
    sources: [
      { label: 'SERMAS · Hospital Clínico San Carlos', url: 'https://www.comunidad.madrid/hospital/clinicosancarlos/' },
      { label: 'OpenStreetMap · way 394889274', url: 'https://www.openstreetmap.org/way/394889274' },
    ],
  },
  {
    id: 'fire-chamberi', name: 'Parque de Bomberos 01 · Chamberí', kind: 'fire', locationSource: 'osm',
    lng: -3.70081884, lat: 40.44022118, address: 'Calle de Santa Engracia, 118 · Madrid',
    note: 'Parque municipal más cercano al campus en el catálogo abierto del Ayuntamiento. Operatividad del turno no verificada.',
    verifiedAt: '2026-09-19',
    sources: [
      { label: 'Ayuntamiento de Madrid · parques de bomberos', url: 'https://datos.madrid.es/dataset/211642-0-bomberos-parques' },
      { label: 'OpenStreetMap · way 388670230', url: 'https://www.openstreetmap.org/way/388670230' },
    ],
  },
]

export const MADRID_SCENARIO: FireScenario = {
  id: 'madrid-etsit',
  incident: {
    code: 'M-CU-2026-0919',
    name: 'Dehesa de la Villa · ETSIT',
    area: 'Ciudad Universitaria · Madrid',
    cecop: 'CECOP Madrid',
    declaredAt: '2026-09-19T21:02:00+02:00',
    center: [FIRE_CENTER.lng, FIRE_CENTER.lat],
    zoom: 14,
  },
  settlements: SETTLEMENTS,
  safeZones: SAFE_ZONES,
  fires: FIRES,
  fireCells: buildFireCells(FIRE_CENTER, FIRE_SCALE),
  citizens: MADRID_CITIZENS,
  centers: CENTERS,
  police: { id: 'comisaria-moncloa', name: 'Comisaría Moncloa-Aravaca', lng: -3.7164075, lat: 40.4269639 },
  anchorRef: ETSIT,
  // Salidas a un kilómetro y a pie: a 12x el grupo llega antes de que nadie pueda pintarle nada delante.
  clockScale: 6,
  onFoot: true,
  guided: { locality: GUIDED_LOCALITY, silentId: MADRID_CITIZENS.filter(citizen => citizen.locality === GUIDED_LOCALITY).at(-1)?.id ?? '', radiusM: 230 },
}
