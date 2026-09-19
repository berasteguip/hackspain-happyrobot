import type { Citizen, FireSpot, RiskArea, SafeZone } from './types'

export const INCIDENT = {
  code: 'AV-GRD-2026-0919',
  name: 'Incendio forestal — Sierra de Gredos',
  area: 'Valle del Tiétar · Ávila',
  cecop: 'CECOP Ávila · INFOCAL',
  declaredAt: '2026-09-19T01:12:00+02:00',
  center: [-5.12, 40.21] as [number, number],
  zoom: 11.35,
}

export const SAFE_ZONES: SafeZone[] = [
  {
    id: 'z-arenas',
    name: 'Pabellón municipal · Arenas de San Pedro',
    lng: -5.0874,
    lat: 40.2042,
    radiusM: 160,
    capacity: 420,
  },
  {
    id: 'z-candeleda',
    name: 'Recinto ferial · Candeleda',
    lng: -5.2416,
    lat: 40.1568,
    radiusM: 180,
    capacity: 350,
  },
  {
    id: 'z-mombeltran',
    name: 'Campo de fútbol · Mombeltrán',
    lng: -5.0208,
    lat: 40.2574,
    radiusM: 140,
    capacity: 220,
  },
]

export const RISK_AREA: RiskArea = {
  id: 'risk-gredos',
  name: 'Perímetro de riesgo',
  coordinates: [
    [-5.195, 40.255],
    [-5.145, 40.272],
    [-5.09, 40.268],
    [-5.05, 40.248],
    [-5.055, 40.218],
    [-5.1, 40.2],
    [-5.16, 40.208],
    [-5.195, 40.255],
  ],
}

export const SCENARIO_FIRES: FireSpot[] = [
  { id: 'f1', lng: -5.138, lat: 40.242, frp: 86.4, confidence: 'high', source: 'scenario', acquiredAt: '01:08' },
  { id: 'f2', lng: -5.129, lat: 40.249, frp: 124.1, confidence: 'high', source: 'scenario', acquiredAt: '01:08' },
  { id: 'f3', lng: -5.118, lat: 40.238, frp: 67.2, confidence: 'high', source: 'scenario', acquiredAt: '01:11' },
  { id: 'f4', lng: -5.147, lat: 40.236, frp: 41.8, confidence: 'nominal', source: 'scenario', acquiredAt: '01:11' },
  { id: 'f5', lng: -5.108, lat: 40.251, frp: 93.5, confidence: 'high', source: 'scenario', acquiredAt: '01:14' },
  { id: 'f6', lng: -5.161, lat: 40.244, frp: 28.6, confidence: 'nominal', source: 'scenario', acquiredAt: '01:14' },
  { id: 'f7', lng: -5.122, lat: 40.228, frp: 54.0, confidence: 'high', source: 'scenario', acquiredAt: '01:17' },
  { id: 'f8', lng: -5.099, lat: 40.241, frp: 19.3, confidence: 'low', source: 'scenario', acquiredAt: '01:17' },
  { id: 'f9', lng: -5.154, lat: 40.257, frp: 72.9, confidence: 'high', source: 'scenario', acquiredAt: '01:21' },
  { id: 'f10', lng: -5.134, lat: 40.261, frp: 38.1, confidence: 'nominal', source: 'scenario', acquiredAt: '01:21' },
  { id: 'f11', lng: -5.113, lat: 40.259, frp: 15.7, confidence: 'low', source: 'scenario', acquiredAt: '01:24' },
  { id: 'f12', lng: -5.141, lat: 40.232, frp: 48.4, confidence: 'nominal', source: 'scenario', acquiredAt: '01:24' },
]

function c(
  partial: Omit<Citizen, 'status'>,
): Citizen {
  return { ...partial, status: 'pending' }
}

export const INITIAL_CITIZENS: Citizen[] = [
  c({ id: 'c-01', name: 'Carmen López', phone: '+34 625 441 018', lng: -5.1412, lat: 40.2218, vulnerable: true, safeZoneId: 'z-arenas', speedKmh: 18, callDelaySec: 1, outcome: 'tracking' }),
  c({ id: 'c-02', name: 'Antonio Ruiz', phone: '+34 616 902 441', lng: -5.1524, lat: 40.2294, vulnerable: true, safeZoneId: 'z-arenas', speedKmh: 12, callDelaySec: 2, outcome: 'tracking' }),
  c({ id: 'c-03', name: 'María Fernández', phone: '+34 687 330 192', lng: -5.1098, lat: 40.2166, vulnerable: false, safeZoneId: 'z-arenas', speedKmh: 32, callDelaySec: 3, outcome: 'tracking' }),
  c({ id: 'c-04', name: 'José Manuel Prieto', phone: '+34 609 774 255', lng: -5.1688, lat: 40.2182, vulnerable: true, safeZoneId: 'z-candeleda', speedKmh: 22, callDelaySec: 4, outcome: 'informed' }),
  c({ id: 'c-05', name: 'Elena Navarro', phone: '+34 622 118 903', lng: -5.0914, lat: 40.2335, vulnerable: false, safeZoneId: 'z-arenas', speedKmh: 28, callDelaySec: 5, outcome: 'tracking' }),
  c({ id: 'c-06', name: 'Pedro Sánchez Vega', phone: '+34 654 009 271', lng: -5.1762, lat: 40.2011, vulnerable: false, safeZoneId: 'z-candeleda', speedKmh: 35, callDelaySec: 6, outcome: 'tracking' }),
  c({ id: 'c-07', name: 'Isabel Martín', phone: '+34 639 551 846', lng: -5.0844, lat: 40.2488, vulnerable: true, safeZoneId: 'z-mombeltran', speedKmh: 16, callDelaySec: 7, outcome: 'no_answer' }),
  c({ id: 'c-08', name: 'Luis Ortega', phone: '+34 671 223 590', lng: -5.0588, lat: 40.2392, vulnerable: false, safeZoneId: 'z-mombeltran', speedKmh: 30, callDelaySec: 8, outcome: 'tracking' }),
  c({ id: 'c-09', name: 'Rosa Jiménez', phone: '+34 612 884 017', lng: -5.2011, lat: 40.1724, vulnerable: false, safeZoneId: 'z-candeleda', speedKmh: 26, callDelaySec: 9, outcome: 'tracking' }),
  c({ id: 'c-10', name: 'Miguel Ángel Soto', phone: '+34 645 770 332', lng: -5.1244, lat: 40.2095, vulnerable: false, safeZoneId: 'z-arenas', speedKmh: 24, callDelaySec: 10, outcome: 'refused' }),
  c({ id: 'c-11', name: 'Pilar Gómez', phone: '+34 628 441 765', lng: -5.0432, lat: 40.2518, vulnerable: true, safeZoneId: 'z-mombeltran', speedKmh: 14, callDelaySec: 11, outcome: 'tracking' }),
  c({ id: 'c-12', name: 'Francisco Herrera', phone: '+34 666 192 408', lng: -5.1555, lat: 40.214, vulnerable: false, safeZoneId: 'z-arenas', speedKmh: 33, callDelaySec: 12, outcome: 'tracking' }),
  c({ id: 'c-13', name: 'Ana Belén Cruz', phone: '+34 619 330 554', lng: -5.2186, lat: 40.1648, vulnerable: false, safeZoneId: 'z-candeleda', speedKmh: 29, callDelaySec: 13, outcome: 'tracking' }),
  c({ id: 'c-14', name: 'Javier Molina', phone: '+34 650 908 121', lng: -5.0722, lat: 40.2214, vulnerable: false, safeZoneId: 'z-arenas', speedKmh: 27, callDelaySec: 14, outcome: 'informed' }),
  c({ id: 'c-15', name: 'Teresa Blanco', phone: '+34 623 667 890', lng: -5.1884, lat: 40.2266, vulnerable: true, safeZoneId: 'z-candeleda', speedKmh: 15, callDelaySec: 15, outcome: 'tracking' }),
  c({ id: 'c-16', name: 'Raúl Delgado', phone: '+34 678 214 009', lng: -5.0338, lat: 40.244, vulnerable: false, safeZoneId: 'z-mombeltran', speedKmh: 36, callDelaySec: 16, outcome: 'tracking' }),
  c({ id: 'c-17', name: 'Lucía Vargas', phone: '+34 611 452 773', lng: -5.1168, lat: 40.1984, vulnerable: false, safeZoneId: 'z-arenas', speedKmh: 31, callDelaySec: 17, outcome: 'tracking' }),
  c({ id: 'c-18', name: 'Manuel Castro', phone: '+34 641 880 256', lng: -5.0948, lat: 40.2572, vulnerable: false, safeZoneId: 'z-mombeltran', speedKmh: 25, callDelaySec: 18, outcome: 'no_answer' }),
  c({ id: 'c-19', name: 'Sofía Ramírez', phone: '+34 627 019 448', lng: -5.2295, lat: 40.1788, vulnerable: false, safeZoneId: 'z-candeleda', speedKmh: 28, callDelaySec: 19, outcome: 'tracking' }),
  c({ id: 'c-20', name: 'Diego Núñez', phone: '+34 655 331 902', lng: -5.0616, lat: 40.2288, vulnerable: false, safeZoneId: 'z-arenas', speedKmh: 34, callDelaySec: 20, outcome: 'tracking' }),
  c({ id: 'c-21', name: 'Nuria Peña', phone: '+34 618 774 610', lng: -5.1712, lat: 40.1904, vulnerable: true, safeZoneId: 'z-candeleda', speedKmh: 17, callDelaySec: 21, outcome: 'tracking' }),
  c({ id: 'c-22', name: 'Álvaro Iglesias', phone: '+34 690 225 187', lng: -5.1026, lat: 40.2254, vulnerable: false, safeZoneId: 'z-arenas', speedKmh: 30, callDelaySec: 22, outcome: 'informed' }),
]

export const AGENTS = [
  'HappyRobot-1',
  'HappyRobot-2',
  'HappyRobot-3',
  'HappyRobot-4',
]
