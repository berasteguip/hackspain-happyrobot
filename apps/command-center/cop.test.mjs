import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createServer } from 'vite'

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
after(() => server.close())
const { buildFireForecast, forecastGeo, exposureAt, routeBlocked } = await server.ssrLoadModule('/src/fire-model.ts')
const { fetchRefugeRoutes, rankRefugeRoutes, assignEvacuationRoutes, planCitizenRoute } = await server.ssrLoadModule('/src/routing.ts')
const { moveEvacuees, advanceProtocol, prepareAreaCampaign, selectAreaIds } = await server.ssrLoadModule('/src/simulation.ts')
const { RESPONSE_CENTERS, createNotice, transitionNotice } = await server.ssrLoadModule('/src/response.ts')
const { SAFE_ZONES, INITIAL_CITIZENS, EVACUATION_CORRIDORS, SCENARIO_FIRE_CELLS } = await server.ssrLoadModule('/src/scenario.ts')
const { haversineMeters } = await server.ssrLoadModule('/src/geo.ts')
const footprint = { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[[-5, 40], [-4.9999, 40], [-4.9999, 40.0001], [-5, 40.0001], [-5, 40]]] } }] }
const settings = { windTowardDeg: 90, windKmh: 30, spreadMPerMin: 5 }
const forecast = buildFireForecast(footprint, settings)
const at = (x, y) => [forecast.origin[0] + (x + 0.5) * forecast.cellSizeM / forecast.lngScale, forecast.origin[1] + (y + 0.5) * forecast.cellSizeM / 111320]

test('el viento visual escala suavemente con el zoom y limita velocidad, longitud y densidad', async () => {
  const { windVisualStyle } = await server.ssrLoadModule('/src/wind.ts')
  const far = windVisualStyle(8, 20, 1440, 1000)
  const near = windVisualStyle(15, 20, 1440, 1000)
  assert.ok(near.speedPx > far.speedPx)
  assert.ok(near.trailPx > far.trailPx)
  assert.ok(near.count < far.count)
  assert.ok(windVisualStyle(24, 150, 6000, 4000).speedPx <= 28)
  assert.ok(windVisualStyle(24, 150, 6000, 4000).trailPx <= 56)
  assert.ok(windVisualStyle(8, 20, 1440, 1000).trailPx >= 18)
  assert.ok(windVisualStyle(11, 20, 1440, 1000).trailPx >= 28)
  assert.ok(windVisualStyle(4, 20, 6000, 4000).count <= 650)
  assert.equal(windVisualStyle(12, 0, 1440, 1000).count, 0)
  assert.equal(windVisualStyle(12, 20, 0, 0).count, 0)
  const nextZoom = windVisualStyle(12.01, 20, 1440, 1000)
  assert.ok(Math.abs(nextZoom.speedPx - windVisualStyle(12, 20, 1440, 1000).speedPx) < 0.1)
})

test('las partículas avanzan por tiempo y coordenadas, no por frames', async () => {
  const { advanceWindPosition, windParticleOpacity } = await server.ssrLoadModule('/src/wind.ts')
  const origin = [-5.14, 40.22]
  const step = hz => {
    let point = origin
    for (let i = 0; i < hz * 2; i++) point = advanceWindPosition(point, 225, 15, 1 / hz)
    return point
  }
  assert.ok(haversineMeters(...step(30), ...step(60)) < 0.05)
  assert.ok(Math.abs(haversineMeters(...origin, ...step(60)) - 30) < 0.1)
  assert.deepEqual(advanceWindPosition(origin, 225, 15, 0), origin)
  assert.equal(windParticleOpacity(0, 10), 0)
  assert.equal(windParticleOpacity(10, 10), 0)
  assert.ok(windParticleOpacity(5, 10) > windParticleOpacity(0.2, 10))
})

test('el fuego inicial permanece y el crecimiento aumenta con el horizonte', () => {
  assert.equal(exposureAt(forecast, ...at(0, 0), 0, 0).level, 'danger')
  assert.equal(forecastGeo(forecast, 0).features.length, 0)
  for (const horizon of [15, 30, 60, 120]) {
    for (const cell of forecast.cells.values()) {
      if (cell.minute <= horizon) assert.notEqual(exposureAt(forecast, ...at(cell.x, cell.y), horizon, 0).level, 'clear')
    }
  }
  assert.ok(forecastGeo(forecast, 60).features.length > 0)
})

test('viento hacia el este favorece el este; sin viento la expansión es simétrica', () => {
  assert.ok(exposureAt(forecast, ...at(3, 0), 120, 0).minute < exposureAt(forecast, ...at(-3, 0), 120, 0).minute)
  const calm = buildFireForecast(footprint, { ...settings, windKmh: 0 })
  assert.equal(exposureAt(calm, ...at(3, 0), 120, 0).minute, exposureAt(calm, ...at(-3, 0), 120, 0).minute)
})

test('avance cero, huella vacía y parámetros inválidos', () => {
  const stopped = buildFireForecast(footprint, { ...settings, spreadMPerMin: 0 })
  assert.equal(forecastGeo(stopped, 120).features.length, 0)
  const empty = buildFireForecast({ type: 'FeatureCollection', features: [] }, settings)
  assert.equal(exposureAt(empty, -5, 40, 120, 150).level, 'unknown')
  assert.throws(() => buildFireForecast(footprint, { ...settings, windKmh: NaN }))
})

test('exposición futura ámbar y margen de proximidad rojo', () => {
  assert.equal(exposureAt(forecast, ...at(3, 0), 0, 0).level, 'clear')
  assert.equal(exposureAt(forecast, ...at(3, 0), 60, 0).level, 'warning')
  assert.equal(exposureAt(forecast, ...at(1, 0), 0, 100).level, 'danger')
  assert.equal(exposureAt(forecast, 0, 0, 120, 0).level, 'clear')
})

test('se revisa el segmento completo, no solo sus extremos', () => {
  assert.equal(routeBlocked(forecast, [at(-5, 0), at(5, 0)], 0, 0), true)
  assert.equal(routeBlocked(forecast, [at(-5, -5), at(5, -5)], 0, 0), false)
  assert.equal(routeBlocked(forecast, [at(3, -1), at(3, 1)], 60, 0), true)
})

const zones = [{ ...SAFE_ZONES[0], lng: at(8, 8)[0], lat: at(8, 8)[1] }]
const candidate = { id: 'short', zoneId: zones[0].id, coordinates: [at(7, 8), at(8, 8)], durationSec: 400, distanceM: 100, accessM: 0 }

test('se elige por duración, no por longitud, y se excluyen recorridos afectados', () => {
  const faster = { ...candidate, id: 'fast', durationSec: 200, distanceM: 400 }
  const blocked = { ...candidate, id: 'blocked', durationSec: 10, coordinates: [at(-1, 0), at(8, 8)] }
  const result = rankRefugeRoutes([candidate, faster, blocked], zones, forecast, 0, 0)
  assert.equal(result.routes[0].id, 'fast')
  assert.equal(result.rejected, 1)
})

test('un refugio expuesto y rutas que exceden el horizonte no se recomiendan', () => {
  const dangerous = [{ ...zones[0], lng: at(0, 0)[0], lat: at(0, 0)[1] }]
  assert.equal(rankRefugeRoutes([candidate], dangerous, forecast, 0, 0).routes.length, 0)
  assert.equal(rankRefugeRoutes([{ ...candidate, durationSec: 121 * 60 }], zones, forecast, 0, 0).routes.length, 0)
})

test('fallos del proveedor no inventan rutas y se informa de cobertura parcial', async () => {
  const failed = await fetchRefugeRoutes('test', at(8, 8), zones, 'walking', undefined, async () => ({ ok: false }))
  assert.equal(failed.routes.length, 0)
  assert.equal(failed.failed, 1)
  const fetched = await fetchRefugeRoutes('test', at(8, 8), zones, 'walking', undefined, async () => ({ ok: true, json: async () => ({ routes: [{ geometry: { coordinates: [at(8, 8), at(8, 8)] }, duration: 30, distance: 10 }] }) }))
  assert.equal(fetched.routes[0].durationSec, 30)
})

test('respuestas malformadas o accesos lejanos no se convierten en rutas', async () => {
  for (const coordinates of [[[0, 0], [0, 1]], [[NaN, 40], at(8, 8)]]) {
    const result = await fetchRefugeRoutes('test', at(8, 8), zones, 'driving', undefined, async () => ({ ok: true, json: async () => ({ routes: [{ geometry: { coordinates }, duration: 30, distance: 10 }] }) }))
    assert.equal(result.routes.length, 0)
  }
})

test('una cancelación no se presenta como resultado válido', async () => {
  const controller = new AbortController()
  controller.abort()
  await assert.rejects(fetchRefugeRoutes('test', at(8, 8), zones, 'driving', controller.signal, async (_url, options) => {
    options.signal.throwIfAborted()
    return { ok: true, json: async () => ({ routes: [] }) }
  }), { name: 'AbortError' })
})

test('se conserva el fallo parcial de un destino y los resultados de los demás', async () => {
  const destinations = [...zones, { ...zones[0], id: 'second' }]
  let count = 0
  const result = await fetchRefugeRoutes('test', at(8, 8), destinations, 'walking', undefined, async (url, options) => {
    assert.ok(url.includes('/walking/'))
    assert.ok(options.signal instanceof AbortSignal)
    count += 1
    return count === 1 ? { ok: false } : { ok: true, json: async () => ({ routes: [{ geometry: { coordinates: [at(8, 8), at(8, 8)] }, duration: 45, distance: 10 }] }) }
  })
  assert.equal(result.failed, 1)
  assert.equal(result.routes.length, 1)
  assert.equal(result.routes[0].zoneId, 'second')
})

test('los centros tienen coordenadas, tipo, fecha y fuentes; no destinos de envío', () => {
  assert.deepEqual(new Set(RESPONSE_CENTERS.map(c => c.kind)), new Set(['hospital', 'health', 'fire']))
  for (const center of RESPONSE_CENTERS) {
    assert.ok(Number.isFinite(center.lng) && Number.isFinite(center.lat))
    assert.ok(center.sources.every(s => new URL(s.url).protocol === 'https:'))
    assert.ok(center.verifiedAt)
    assert.equal(center.phone, undefined)
    assert.equal(center.email, undefined)
  }
  assert.equal(INITIAL_CITIZENS.length, 300)
})

test('permite acercarse a un refugio si destino y recorrido quedan fuera de la exposición', () => {
  const approaching = { ...candidate, coordinates: [at(15, 15), at(8, 8)] }
  assert.equal(rankRefugeRoutes([approaching], zones, forecast, 0, 0).routes.length, 1)
})

test('sin ruta validada no hay movimiento directo ni salida automática', () => {
  const citizen = { ...INITIAL_CITIZENS[0], status: 'evacuating', safeZoneId: zones[0].id, lng: at(7, 8)[0], lat: at(7, 8)[1] }
  const [stopped] = moveEvacuees([citizen], new Map(), zones, 5)
  assert.equal(stopped.lng, citizen.lng)
  assert.equal(stopped.lat, citizen.lat)
  assert.equal(stopped.status, 'assistance')
  const [waiting] = advanceProtocol([{ ...citizen, status: 'tracking' }], 1000, []).citizens
  assert.equal(waiting.status, 'assistance')
})

function road(id, zone, coordinates, durationSec, group = 'El Arenal') {
  const cumulative = [0]
  for (let i = 1; i < coordinates.length; i++) cumulative.push(cumulative[i - 1] + haversineMeters(...coordinates[i - 1], ...coordinates[i]))
  return { id, zoneId: zone.id, group, coords: coordinates, durationSec, cumulative, lengthM: cumulative.at(-1) }
}

test('la simulación descarta refugios expuestos y corredores de otro grupo', () => {
  const origin = at(15, 15)
  const far = { ...zones[0], id: 'far', lng: at(20, 20)[0], lat: at(20, 20)[1] }
  const routes = new Map([
    ['toward', road('toward', zones[0], [origin, at(0, 0), at(8, 8)], 30)],
    ['away', road('away', far, [origin, at(20, 20)], 120)],
    ['foreign', road('foreign', far, [origin, at(20, 20)], 10, 'Otro núcleo')],
  ])
  const person = { ...INITIAL_CITIZENS[0], lng: origin[0], lat: origin[1], locality: 'El Arenal', status: 'tracking', call: { answeredAt: Date.now(), agent: 'demo', summary: 'demo', consent: 'granted', needs: [] } }
  const [planned] = assignEvacuationRoutes([person], routes, [...zones, far], forecast, 0)
  assert.equal(planned.routeId, 'away')
  assert.equal(planned.safeZoneId, 'far')
  const [departed] = advanceProtocol([planned], 1000, []).citizens
  const [accessed] = moveEvacuees([departed], routes, [...zones, far], 1)
  const [moved] = moveEvacuees([accessed], routes, [...zones, far], 1)
  assert.ok(moved.lng > person.lng && moved.lat > person.lat)
  const [held] = assignEvacuationRoutes([person], new Map([['toward', routes.get('toward')]]), zones, forecast, 0)
  assert.equal(held.status, 'assistance')
  assert.equal(held.safeZoneId, '')
  assert.equal(held.routeId, undefined)
  const live = { ...person, live: true, locationSource: 'gps' }
  assert.strictEqual(assignEvacuationRoutes([live], routes, [...zones, far], forecast, 0)[0], live)
})

test('se rechaza un recorrido que cruza el fuego aunque el destino quede fuera', () => {
  const far = { ...zones[0], id: 'far', lng: at(20, 20)[0], lat: at(20, 20)[1] }
  const detour = { ...candidate, zoneId: far.id, coordinates: [at(15, 15), at(0, 0), at(20, 20)] }
  assert.equal(rankRefugeRoutes([detour], [far], forecast, 0, 0).routes.length, 0)
})

test('El Arenal no recibe automáticamente un destino junto al fuego', () => {
  const realForecast = buildFireForecast(SCENARIO_FIRE_CELLS, { windTowardDeg: 225, windKmh: 20, spreadMPerMin: 5 })
  const person = { ...INITIAL_CITIZENS.find(c => c.locality === 'El Arenal'), status: 'tracking' }
  const nearby = SAFE_ZONES.find(z => z.id === 'z-dehesa')
  const route = road('toward-guisando', nearby, [[person.lng, person.lat], [nearby.lng, nearby.lat]], 300)
  const [planned] = assignEvacuationRoutes([person], new Map([[route.id, route]]), SAFE_ZONES, realForecast, 150)
  assert.equal(planned.status, 'assistance')
  assert.equal(planned.lng, person.lng)
  assert.equal(planned.lat, person.lat)
  assert.equal(INITIAL_CITIZENS.every(c => c.safeZoneId === ''), true)
  assert.equal(EVACUATION_CORRIDORS.length, 72)
})

test('el círculo incluye su borde y excluye posiciones externas o radios inválidos', () => {
  const origin = at(8, 8)
  const points = [0, 1, 5].map((offset, i) => ({ ...INITIAL_CITIZENS[i], lng: at(8 + offset, 8)[0], lat: origin[1] }))
  const radiusM = haversineMeters(...origin, points[1].lng, points[1].lat)
  assert.deepEqual(selectAreaIds(points, { lng: origin[0], lat: origin[1], radiusM }), points.slice(0, 2).map(c => c.id))
  assert.deepEqual(selectAreaIds(points, { lng: origin[0], lat: origin[1], radiusM: NaN }), [])
  assert.deepEqual(selectAreaIds(points, null), [])
})

test('la campaña llama solo a su selección congelada y solo mueve respuestas con consentimiento', () => {
  const origin = at(7, 8)
  const route = road('selected-road', zones[0], [origin, at(8, 8)], 60)
  const input = [0, 1, 2, 3].map(i => ({ ...INITIAL_CITIZENS[i], lng: origin[0], lat: origin[1], locality: 'El Arenal', status: 'pending', outcome: i === 1 ? 'no_answer' : 'tracking', routeId: route.id, routeProgressM: 0, routePhase: 'access', safeZoneId: zones[0].id, live: i === 3 }))
  const batch = prepareAreaCampaign(input, [input[0].id, input[1].id, input[3].id], 0, new Set())
  assert.deepEqual(batch.addedIds, [input[0].id, input[1].id])
  let current = batch.citizens
  for (const time of [1, 4, 11]) current = advanceProtocol(current, time, [], new Set(batch.ids)).citizens
  assert.equal(current[0].status, 'evacuating')
  assert.equal(current[1].status, 'no_answer')
  assert.strictEqual(current[2], input[2])
  assert.strictEqual(current[3], input[3])
  const routes = new Map([[route.id, route]])
  current = moveEvacuees(current, routes, zones, 1)
  current = moveEvacuees(current, routes, zones, 1)
  assert.notEqual(current[0].lng, origin[0])
  for (const i of [1, 2, 3]) assert.equal(current[i].lng, origin[0])
  assert.ok(current[0].call)
  assert.equal(current[1].call, undefined)
})

test('la campaña no duplica destinatarios ni altera a quienes no se seleccionaron', () => {
  const first = prepareAreaCampaign(INITIAL_CITIZENS, [INITIAL_CITIZENS[0].id], 0, new Set())
  const second = prepareAreaCampaign(first.citizens, [INITIAL_CITIZENS[0].id, INITIAL_CITIZENS[1].id], 0, new Set(first.ids))
  assert.equal(second.ids.length, 2)
  assert.deepEqual(second.addedIds, [INITIAL_CITIZENS[1].id])
  assert.ok(second.citizens[1].callDelaySec > second.citizens[0].callDelaySec)
  assert.equal(INITIAL_CITIZENS.every(c => c.status === 'pending' && !c.call), true)
  const noSelection = advanceProtocol(INITIAL_CITIZENS, 10000, [], new Set())
  assert.equal(noSelection.events.length, 0)
  assert.deepEqual(noSelection.citizens, INITIAL_CITIZENS)
})

test('no se mueve un estado evacuating sin llamada respondida', () => {
  const origin = at(7, 8)
  const route = road('unconfirmed', zones[0], [origin, at(8, 8)], 60)
  const citizen = { ...INITIAL_CITIZENS[0], status: 'evacuating', lng: origin[0], lat: origin[1], locality: 'El Arenal', routeId: route.id, safeZoneId: zones[0].id, routePhase: 'road', routeProgressM: 0 }
  const [after] = moveEvacuees([citizen], new Map([[route.id, route]]), zones, 10)
  assert.equal(after.lng, citizen.lng)
  assert.equal(after.lat, citizen.lat)
})

test('la asignación automática escoge el refugio más cercano por recorrido admisible', () => {
  const origin = at(15, 15)
  const near = { ...zones[0], id: 'near', lng: at(16, 15)[0], lat: at(16, 15)[1] }
  const far = { ...zones[0], id: 'far', lng: at(20, 20)[0], lat: at(20, 20)[1] }
  const routes = new Map([
    ['near-road', road('near-road', near, [origin, at(16, 15)], 300)],
    ['fast-road', road('fast-road', far, [origin, at(20, 20)], 60)],
  ])
  const citizen = { ...INITIAL_CITIZENS[0], lng: origin[0], lat: origin[1], locality: 'El Arenal' }
  const [planned] = assignEvacuationRoutes([citizen], routes, [near, far], forecast, 0)
  assert.equal(planned.safeZoneId, 'near')
  assert.equal(planned.status, 'pending')
})

test('hospital y bomberos se acercan como demo sin perder las coordenadas reales', () => {
  for (const center of RESPONSE_CENTERS.filter(c => c.kind !== 'health')) {
    assert.equal(center.locationSource, 'demo')
    assert.ok(haversineMeters(-5.112, 40.232, center.lng, center.lat) < 5000)
    assert.ok(haversineMeters(center.lng, center.lat, center.realLocation.lng, center.realLocation.lat) > 20000)
    assert.ok(center.name.includes('demo'))
  }
  assert.equal(RESPONSE_CENTERS.find(c => c.kind === 'health').locationSource, 'osm')
})

test('permite salir de la proyección futura antes de que llegue el fuego', () => {
  const zone = { ...zones[0], id: 'future-exit', lng: at(3, 8)[0], lat: at(3, 8)[1] }
  const route = { ...candidate, zoneId: zone.id, coordinates: [at(3, 0), at(3, 8)], durationSec: 300, distanceM: 800 }
  assert.equal(exposureAt(forecast, ...route.coordinates[0], 60, 0).level, 'warning')
  assert.equal(exposureAt(forecast, ...route.coordinates[0], 0, 0).level, 'clear')
  assert.equal(rankRefugeRoutes([route], [zone], forecast, 60, 0).routes.length, 1)
})

test('bloquea el trayecto si el fuego llega antes que la persona', () => {
  const zone = { ...zones[0], id: 'slow-exit', lng: at(1, 8)[0], lat: at(1, 8)[1] }
  const route = { ...candidate, zoneId: zone.id, coordinates: [at(1, 0), at(1, 8)], durationSec: 120 * 60, distanceM: 800 }
  assert.equal(rankRefugeRoutes([route], [zone], forecast, 60, 0).routes.length, 0)
})

test('la ruta individual nace en la persona, sin depender de corredores compartidos', async () => {
  const origin = at(8, 8)
  const zone = { ...zones[0], lng: at(20, 20)[0], lat: at(20, 20)[1] }
  const citizen = { ...INITIAL_CITIZENS[0], lng: origin[0], lat: origin[1], status: 'tracking', call: { answeredAt: Date.now(), agent: 'demo', summary: 'demo', consent: 'granted', needs: [] } }
  let requests = 0
  const plan = await planCitizenRoute('test', citizen, [zone], forecast, 150, undefined, async url => {
    requests++
    assert.ok(url.includes(`${origin.join(',')};${zone.lng},${zone.lat}`))
    return { ok: true, json: async () => ({ routes: [{ geometry: { coordinates: [origin, [zone.lng, zone.lat]] }, duration: 300, distance: 1700 }] }) }
  })
  assert.equal(requests, 1)
  assert.equal(plan.citizen.status, 'tracking')
  assert.ok(plan.route)
  assert.equal(plan.citizen.routeId, plan.route.id)
  const [departed] = advanceProtocol([plan.citizen], 1000, []).citizens
  const routes = new Map([[plan.route.id, plan.route]])
  const [onRoad] = moveEvacuees([departed], routes, [zone], 1)
  const [moved] = moveEvacuees([onRoad], routes, [zone], 1)
  assert.notEqual(moved.lng, citizen.lng)
})

test('el fallo de Directions informa del HTTP sin exponer el token', async () => {
  const citizen = { ...INITIAL_CITIZENS[0], lng: at(8, 8)[0], lat: at(8, 8)[1], status: 'tracking', call: { answeredAt: Date.now(), agent: 'demo', summary: 'demo', consent: 'granted', needs: [] } }
  const plan = await planCitizenRoute('secret-test-token', citizen, zones, forecast, 0, undefined, async () => ({ ok: false, status: 403 }))
  assert.equal(plan.route, undefined)
  assert.equal(plan.citizen.status, 'assistance')
  assert.match(plan.citizen.routeHoldReason, /403/)
  assert.ok(!plan.citizen.routeHoldReason.includes('secret-test-token'))
})

test('no se consulta Directions para sesiones reales o personas sin consentimiento', async () => {
  const request = async () => { throw new Error('No debería consultar') }
  for (const citizen of [{ ...INITIAL_CITIZENS[0], live: true }, INITIAL_CITIZENS[0]]) {
    const plan = await planCitizenRoute('test', citizen, zones, forecast, 150, undefined, request)
    assert.strictEqual(plan.citizen, citizen)
    assert.equal(plan.route, undefined)
  }
})

test('los avisos exigen revisión y solo avanzan por estados de demo', () => {
  const notice = createNotice(RESPONSE_CENTERS[0], 'Preaviso de prueba', 'Escenario +30 min')
  assert.equal(notice.status, 'draft')
  assert.equal(transitionNotice(notice, 'acknowledged').status, 'draft')
  const sent = transitionNotice(notice, 'simulated')
  assert.equal(sent.status, 'simulated')
  assert.equal(transitionNotice(sent, 'acknowledged').status, 'acknowledged')
  assert.equal(transitionNotice(sent, 'draft').status, 'simulated')
  assert.throws(() => createNotice(RESPONSE_CENTERS[0], '   ', 'Escenario'))
})
