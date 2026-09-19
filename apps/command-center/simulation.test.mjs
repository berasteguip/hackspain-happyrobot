import assert from 'node:assert/strict'
import { test } from 'node:test'
import { registerHooks } from 'node:module'

registerHooks({ resolve(specifier, context, next) {
  return next(specifier.startsWith('./') && !specifier.endsWith('.ts') ? `${specifier}.ts` : specifier, context)
} })

const { advanceProtocol, groupSize, zoneUsage } = await import('./src/simulation.ts')
const { routeLength, positionAlongRoute, createFireChecker } = await import('./src/geo.ts')
const { createRoutePlanner } = await import('./src/routing.ts')
const { INITIAL_CITIZENS, SAFE_ZONES, SCENARIO_FIRE_CELLS } = await import('./src/scenario.ts')

const start = [-5.14, 40.22]
const end = [-5.139, 40.22]
const group = { adults: 2, children: 1, olderAdults: 0, mobility: 'walking', preparationSec: 30 }
const zone = { ...SAFE_ZONES[0], id: 'test-zone', lng: end[0], lat: end[1], capacity: 6 }
const coordinates = [start, [-5.14, 40.2203], [-5.139, 40.2203], end]
const option = { zoneId: zone.id, coordinates, distanceM: routeLength(coordinates), accessM: 0, profile: 'walking' }
const confirmed = (overrides = {}) => ({
  ...INITIAL_CITIZENS[0], id: 'test-group', lng: start[0], lat: start[1], speedKmh: 3.6,
  locationSource: 'simulation', group, status: 'routing', routeState: 'ready', routeOptions: [option],
  call: { answeredAt: 1, agent: 'Test', summary: 'Demo', consent: 'granted', needs: [] }, ...overrides,
})
const tick = (citizens, elapsed, zones = [zone]) => advanceProtocol(citizens, elapsed, [], zones)

test('llamada, confirmación y ruta son fases distintas; no hay movimiento previo', () => {
  const initial = { ...INITIAL_CITIZENS[0], callDelaySec: 6, outcome: 'tracking' }
  assert.equal(tick([initial], 5).citizens[0].status, 'pending')
  const ringing = tick([initial], 6)
  assert.equal(ringing.citizens[0].status, 'ringing')
  assert.equal(tick(ringing.citizens, 45).citizens[0].call, undefined)
  const answered = tick(ringing.citizens, 46)
  assert.equal(answered.citizens[0].status, 'tracking')
  assert.equal(answered.citizens[0].call.consent, 'granted')
  assert.deepEqual([answered.citizens[0].lng, answered.citizens[0].lat], [initial.lng, initial.lat])
  assert.equal(tick(answered.citizens, 47).citizens[0].status, 'routing')
})

test('preparación, recorrido por vértices, pausa lógica y llegada sin duplicados', () => {
  const assigned = tick([confirmed()], 50)
  assert.equal(assigned.citizens[0].status, 'preparing')
  assert.equal(assigned.citizens[0].journey.departureAt, 80)
  const waiting = tick(assigned.citizens, 79)
  assert.deepEqual([waiting.citizens[0].lng, waiting.citizens[0].lat], start)
  const moving = tick(waiting.citizens, 90)
  assert.equal(moving.citizens[0].status, 'evacuating')
  assert.equal(moving.citizens[0].journey.distanceTravelledM, 10)
  assert.equal(moving.citizens[0].lng, start[0])
  assert(moving.citizens[0].lat > start[1])
  const paused = tick(moving.citizens, 90)
  assert.equal(paused.citizens[0].journey.distanceTravelledM, 10)
  assert.equal(paused.events.length, 0)
  const arrived = tick(moving.citizens, 10000)
  assert.equal(arrived.citizens[0].status, 'safe')
  assert.deepEqual([arrived.citizens[0].lng, arrived.citizens[0].lat], end)
  assert.equal(tick(arrived.citizens, 10001).events.length, 0)
  assert.equal(zoneUsage(arrived.citizens, zone.id).arrivedPeople, 3)
})

test('los grupos completos reservan plazas sin carreras y usan la siguiente ruta disponible', () => {
  const second = { ...zone, id: 'second-zone', capacity: 3 }
  const routes = [option, { ...option, zoneId: second.id, distanceM: option.distanceM + 10 }]
  const population = [confirmed({ id: 'one', routeOptions: routes }), confirmed({ id: 'two', routeOptions: routes }), confirmed({ id: 'three', routeOptions: routes }), confirmed({ id: 'four', routeOptions: routes })]
  const result = tick(population, 1, [zone, second]).citizens
  assert.equal(zoneUsage(result, zone.id).reservedPeople, 6)
  assert.equal(zoneUsage(result, second.id).reservedPeople, 3)
  assert.equal(result[2].safeZoneId, second.id)
  assert.equal(result[3].status, 'assistance')
  assert.equal(result[3].journey, undefined)
  assert.equal(tick(result, 2, [zone, second]).events.length, 0)
})

test('una familia de cinco cuenta como cinco plazas, no como una llamada', () => {
  const family = confirmed({ group: { ...group, adults: 2, children: 2, olderAdults: 1 } })
  assert.equal(groupSize(family), 5)
  const result = tick([family], 0).citizens
  assert.equal(zoneUsage(result, zone.id).reservedPeople, 5)
  assert.equal(zoneUsage(result, zone.id).groups, 1)
})

test('recogida, negativa, falta de ruta y falta de consentimiento nunca mueven al grupo', () => {
  const pickup = confirmed({ status: 'tracking', group: { ...group, mobility: 'pickup' } })
  assert.equal(tick([pickup], 1).citizens[0].status, 'assistance')
  const unavailable = confirmed({ routeOptions: [], assistanceReason: 'No route' })
  assert.equal(tick([unavailable], 1).citizens[0].status, 'assistance')
  for (const candidate of [confirmed({ status: 'refused' }), confirmed({ status: 'no_answer' }), confirmed({ call: undefined })]) {
    const next = tick([candidate], 1000).citizens[0]
    assert.deepEqual([next.lng, next.lat], start)
    assert.equal(next.journey, undefined)
  }
})

test('un GPS real no se mueve ni ocupa aforo de la demo', () => {
  const assigned = tick([confirmed()], 0).citizens[0]
  for (const live of [{ ...assigned, live: true }, { ...assigned, locationSource: 'gps' }]) {
    assert.deepEqual(tick([live], 10000).citizens[0], live)
  }
  assert.equal(zoneUsage([{ ...assigned, live: true }], zone.id).reservedPeople, 0)
})

test('el ritmo depende del grupo y no de la frecuencia de los ticks', () => {
  const slow = tick([confirmed({ speedKmh: 1.8 })], 0).citizens[0]
  const fast = { ...slow, speedKmh: 3.6 }
  assert.equal(tick([fast], 50).citizens[0].journey.distanceTravelledM, 20)
  assert.equal(tick([slow], 50).citizens[0].journey.distanceTravelledM, 10)
  let stepped = [fast]
  for (let elapsed = 31; elapsed <= 50; elapsed++) stepped = tick(stepped, elapsed).citizens
  assert.equal(stepped[0].journey.distanceTravelledM, 20)
})

test('geometría de recorrido: vértices, tramos nulos y final exacto', () => {
  assert.deepEqual(positionAlongRoute([start, start, end], 0), start)
  assert.deepEqual(positionAlongRoute(coordinates, 100000), end)
  assert.throws(() => positionAlongRoute([], 1))
})

test('se detecta una intersección con fuego incluso con extremos fuera', () => {
  const blocked = createFireChecker({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[[-5.14, 40.22], [-5.139, 40.22], [-5.139, 40.221], [-5.14, 40.221], [-5.14, 40.22]]] } }] }, 0)
  assert(blocked([[-5.141, 40.2205], [-5.138, 40.2205]]))
  assert(blocked([[-5.1395, 40.2205]]))
  assert(!blocked([[-5.141, 40.219], [-5.138, 40.219]]))
  const actual = createFireChecker(SCENARIO_FIRE_CELLS)
  for (const meeting of SAFE_ZONES) assert(!actual([[meeting.lng, meeting.lat]]), meeting.name)
})

test('el planificador compara distancias de recorrido y reutiliza la caché', async () => {
  const far = { ...zone, id: 'far', lng: -5.137 }
  let requests = 0
  const request = async (url) => {
    requests++
    const [a, b] = decodeURIComponent(new URL(url).pathname.split('/').at(-1)).split(';').map(p => p.split(',').map(Number))
    const path = b[0] === zone.lng ? [a, [a[0], a[1] + 0.005], [b[0], b[1] + 0.005], b] : [a, b]
    return Response.json({ code: 'Ok', routes: [{ geometry: { coordinates: path } }] })
  }
  const planner = createRoutePlanner('test-token', () => false, request)
  const result = await planner(confirmed(), [zone, far], [], new AbortController().signal)
  assert.equal(result.options[0].zoneId, far.id)
  await planner(confirmed(), [zone, far], [], new AbortController().signal)
  assert.equal(requests, 2)
})

test('errores de acceso cortan nuevas consultas; un abort no inicia movimiento', async () => {
  let requests = 0
  const planner = createRoutePlanner('test-token', () => false, async () => { requests++; return new Response('', { status: 403 }) })
  const result = await planner(confirmed(), [zone], [], new AbortController().signal)
  assert.equal(result.options.length, 0)
  assert(result.serviceError)
  await planner(confirmed(), [zone], [], new AbortController().signal)
  assert.equal(requests, 1)
  const controller = new AbortController()
  controller.abort()
  await assert.rejects(planner(confirmed(), [zone], [], controller.signal))
})

test('no se inventa una recta cuando Directions no encuentra ruta o atraviesa fuego', async () => {
  const planner = createRoutePlanner('test-token', path => path.length > 1, async () => Response.json({ code: 'Ok', routes: [{ geometry: { coordinates: [start, end] } }] }))
  assert.equal((await planner(confirmed(), [zone], [], new AbortController().signal)).options.length, 0)
  const unavailable = createRoutePlanner('test-token', () => false, async () => Response.json({ code: 'NoRoute', routes: [] }))
  assert.equal((await unavailable(confirmed(), [zone], [], new AbortController().signal)).options.length, 0)
})
