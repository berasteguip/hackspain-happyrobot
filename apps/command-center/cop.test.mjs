import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createServer } from 'vite'

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
after(() => server.close())
const { buildFireForecast, forecastGeo, exposureAt, routeBlocked } = await server.ssrLoadModule('/src/fire-model.ts')
const { fetchRefugeRoutes, rankRefugeRoutes, planCitizenRoute, fetchDrivingRoute } = await server.ssrLoadModule('/src/routing.ts')
const { detectAlerts, initialWatch, mergeAlerts, ALERT_ACTION_LABEL } = await server.ssrLoadModule('/src/alerts.ts')
const { createDispatch, moveUnits, planUnitRoute, unitOrigin, originsFrom } = await server.ssrLoadModule('/src/units.ts')
const { moveEvacuees, advanceProtocol, prepareAreaCampaign, selectAreaIds } = await server.ssrLoadModule('/src/simulation.ts')
const { RESPONSE_CENTERS, createNotice, transitionNotice } = await server.ssrLoadModule('/src/response.ts')
const { SAFE_ZONES, INITIAL_CITIZENS, SCENARIO_FIRE_CELLS, INCIDENT, GREDOS_SCENARIO } = await server.ssrLoadModule('/src/scenario.ts')
const { MADRID_SCENARIO, ETSIT } = await server.ssrLoadModule('/src/scenario-madrid.ts')
const { SCENARIOS, DEFAULT_SCENARIO_ID, scenarioById } = await server.ssrLoadModule('/src/scenarios.ts')
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
  assert.ok(windVisualStyle(24, 150, 6000, 4000).trailPx <= 46)
  assert.ok(windVisualStyle(8, 20, 1440, 1000).trailPx >= 15)
  assert.equal(windVisualStyle(11, 20, 1440, 1000).trailPx, 23)
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

test('no se camina por el recorrido de otro núcleo aunque lleve al mismo refugio', () => {
  const origin = at(7, 8)
  const foreign = road('foreign', zones[0], [origin, at(8, 8)], 60, 'Otro núcleo')
  const citizen = { ...INITIAL_CITIZENS[0], status: 'evacuating', lng: origin[0], lat: origin[1], locality: 'El Arenal', safeZoneId: zones[0].id, routeId: foreign.id, routeProgressM: 0, routePhase: 'access', call: { answeredAt: Date.now(), agent: 'demo', summary: 'demo', consent: 'granted', needs: [] } }
  const [held] = moveEvacuees([citizen], new Map([[foreign.id, foreign]]), zones, 5)
  assert.equal(held.status, 'assistance')
  assert.equal(held.lng, citizen.lng)
  assert.equal(held.lat, citizen.lat)
})

test('se rechaza un recorrido que cruza el fuego aunque el destino quede fuera', () => {
  const far = { ...zones[0], id: 'far', lng: at(20, 20)[0], lat: at(20, 20)[1] }
  const detour = { ...candidate, zoneId: far.id, coordinates: [at(15, 15), at(0, 0), at(20, 20)] }
  assert.equal(rankRefugeRoutes([detour], [far], forecast, 0, 0).routes.length, 0)
})

test('El Arenal no recibe automáticamente un destino junto al fuego', async () => {
  const realForecast = buildFireForecast(SCENARIO_FIRE_CELLS, { windTowardDeg: 225, windKmh: 20, spreadMPerMin: 5 })
  const person = { ...INITIAL_CITIZENS.find(c => c.locality === 'El Arenal'), status: 'tracking', call: { answeredAt: Date.now(), agent: 'demo', summary: 'demo', consent: 'granted', needs: [] } }
  const nearby = SAFE_ZONES.find(z => z.id === 'z-dehesa')
  const plan = await planCitizenRoute('test', person, [nearby], realForecast, 150, undefined, async () => ({
    ok: true,
    json: async () => ({ routes: [{ geometry: { coordinates: [[person.lng, person.lat], [nearby.lng, nearby.lat]] }, duration: 300, distance: 1700 }] }),
  }))
  assert.equal(plan.citizen.status, 'assistance')
  assert.equal(plan.citizen.safeZoneId, '')
  assert.equal(plan.route, undefined)
  assert.equal(plan.citizen.lng, person.lng)
  assert.equal(plan.citizen.lat, person.lat)
  assert.equal(INITIAL_CITIZENS.every(c => c.safeZoneId === ''), true)
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

test('entre recorridos admisibles se escoge el refugio más cercano, no el más rápido', async () => {
  const origin = at(15, 15)
  const near = { ...zones[0], id: 'near', lng: at(16, 15)[0], lat: at(16, 15)[1] }
  const far = { ...zones[0], id: 'far', lng: at(20, 20)[0], lat: at(20, 20)[1] }
  const citizen = { ...INITIAL_CITIZENS[0], lng: origin[0], lat: origin[1], locality: 'El Arenal', status: 'tracking', call: { answeredAt: Date.now(), agent: 'demo', summary: 'demo', consent: 'granted', needs: [] } }
  const plan = await planCitizenRoute('test', citizen, [near, far], forecast, 0, undefined, async url => {
    const zone = url.includes(`${far.lng},${far.lat}`) ? far : near
    const quicker = zone.id === 'far'
    return { ok: true, json: async () => ({ routes: [{ geometry: { coordinates: [origin, [zone.lng, zone.lat]] }, duration: quicker ? 120 : 600, distance: quicker ? 4000 : 900 }] }) }
  })
  assert.equal(plan.citizen.safeZoneId, 'near')
  assert.equal(plan.route.zoneId, 'near')
  assert.equal(plan.citizen.status, 'tracking')
})

test('hospital y bomberos se acercan como demo sin perder las coordenadas reales', () => {
  for (const center of RESPONSE_CENTERS.filter(c => c.kind !== 'health')) {
    assert.equal(center.locationSource, 'demo')
    assert.ok(haversineMeters(-5.112, 40.232, center.lng, center.lat) < 5000)
    assert.ok(haversineMeters(center.lng, center.lat, center.realLocation.lng, center.realLocation.lat) > 20000)
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

function alertInput(overrides = {}) {
  return {
    citizens: INITIAL_CITIZENS,
    forecast,
    marginM: 0,
    horizon: 0,
    windTowardDeg: 225,
    campaignIds: new Set(),
    now: 1,
    ...overrides,
  }
}

test('la proyección a +1 h avisa núcleos nuevos; el estado inicial no se anuncia', () => {
  const realForecast = buildFireForecast(SCENARIO_FIRE_CELLS, { windTowardDeg: 225, windKmh: 20, spreadMPerMin: 5 })
  const start = alertInput({ forecast: realForecast, horizon: 0 })
  const watch = initialWatch(start)
  assert.equal(detectAlerts(start, watch).alerts.length, 0)
  const later = detectAlerts({ ...start, horizon: 60, now: 2 }, watch)
  assert.ok(later.alerts.some(alert => alert.kind === 'fire-spread'))
  assert.equal(detectAlerts({ ...start, horizon: 60, now: 3 }, later.watch).alerts.filter(alert => alert.kind === 'fire-spread').length, 0)
})

test('un giro de viento avisa y no relanza el mismo aviso', () => {
  const start = alertInput({ forecast, horizon: 60, windTowardDeg: 225 })
  const watch = initialWatch(start)
  const shifted = detectAlerts({ ...start, windTowardDeg: 45, now: 2 }, watch)
  assert.ok(shifted.alerts.some(alert => alert.kind === 'wind-shift'))
  assert.equal(detectAlerts({ ...start, windTowardDeg: 45, now: 3 }, shifted.watch).alerts.filter(alert => alert.kind === 'wind-shift').length, 0)
})

test('sin respuesta y personas detenidas se avisan una sola vez, y no fuera de campaña', () => {
  const origin = at(7, 8)
  const silent = { ...INITIAL_CITIZENS[0], id: 'c-silent', status: 'no_answer', lng: origin[0], lat: origin[1], locality: 'Guisando' }
  const stalled = { ...INITIAL_CITIZENS[1], id: 'c-stalled', status: 'assistance', routePhase: 'road', lng: origin[0], lat: origin[1], locality: 'Guisando' }
  const cut = { ...INITIAL_CITIZENS[2], id: 'c-cut', status: 'assistance', lng: origin[0], lat: origin[1], locality: 'Guisando' }
  const outsider = { ...silent, id: 'c-out' }
  const start = alertInput({ citizens: [silent, stalled, cut, outsider], campaignIds: new Set(['c-silent', 'c-stalled', 'c-cut']) })
  const first = detectAlerts(start, initialWatch(start))
  assert.equal(first.alerts.filter(alert => alert.kind === 'no-answer').length, 1)
  assert.equal(first.alerts.filter(alert => alert.kind === 'stalled').length, 1)
  assert.equal(first.alerts.filter(alert => alert.kind === 'route-cut').length, 1)
  assert.ok(!first.alerts.some(alert => alert.citizenIds.includes('c-out')))
  assert.equal(detectAlerts(start, first.watch).alerts.length, 0)
  assert.deepEqual(['dispatch-ambulance', 'dispatch-police', 'dispatch-fire'].every(action => ALERT_ACTION_LABEL[action]), true)
})

test('ambulancia y bomberos salen del marcador de demo; la patrulla del sur de Arenas', () => {
  const hospital = RESPONSE_CENTERS.find(center => center.kind === 'hospital')
  const park = RESPONSE_CENTERS.find(center => center.kind === 'fire')
  const ambulance = createDispatch('ambulance', { lng: -5.09, lat: 40.22, label: 'Carmen' }, 1, 0)
  const police = createDispatch('police', { lng: -5.09, lat: 40.22, label: 'Carmen' }, 1, 1)
  const engine = unitOrigin('fire')
  const policeRange = haversineMeters(INCIDENT.center[0], INCIDENT.center[1], police.origin.lng, police.origin.lat)
  assert.equal(ambulance.origin.lng, hospital.lng)
  assert.equal(ambulance.origin.lat, hospital.lat)
  assert.equal(engine.lng, park.lng)
  assert.equal(engine.lat, park.lat)
  assert.ok(haversineMeters(INCIDENT.center[0], INCIDENT.center[1], ambulance.origin.lng, ambulance.origin.lat) < 8000)
  assert.ok(policeRange > 2500 && policeRange < 6000)
  assert.ok(haversineMeters(hospital.lng, hospital.lat, park.lng, park.lat) < 800)
  assert.ok(haversineMeters(INCIDENT.center[0], INCIDENT.center[1], engine.lng, engine.lat) < 8000)
  assert.notEqual(ambulance.origin.lng, hospital.realLocation.lng)
  assert.equal(ambulance.status, 'requested')
  assert.match(ambulance.summary, /pide/)
  assert.throws(() => createDispatch('ambulance', { lng: 200, lat: 40, label: 'x' }, 1, 2))
})

test('el medio avanza por carretera y llega al destino', () => {
  const origin = at(7, 8)
  const dest = at(8, 8)
  const route = road('unit-road', { id: 'dest' }, [origin, dest], 60, 'dispatch')
  const unit = { ...createDispatch('ambulance', { lng: dest[0], lat: dest[1], label: 'zona' }, 1, 0), status: 'en_route', route, lng: origin[0], lat: origin[1], etaSec: route.durationSec }
  const [moved] = moveUnits([unit], 1)
  assert.notEqual(moved.lng, unit.lng)
  assert.equal(moved.status, 'en_route')
  const [arrived] = moveUnits([unit], 10_000)
  assert.equal(arrived.status, 'on_scene')
  assert.equal(arrived.lng, dest[0])
  assert.equal(arrived.lat, dest[1])
  assert.strictEqual(moveUnits([unit], 0)[0], unit)
})

test('Directions hacia un medio informa el HTTP sin exponer el token', async () => {
  const unit = createDispatch('police', { lng: at(8, 8)[0], lat: at(8, 8)[1], label: 'zona' }, 1, 0)
  const planned = await planUnitRoute('secret-unit-token', unit, undefined, async () => ({ ok: false, status: 401 }))
  assert.equal(planned.status, 'en_route')
  assert.equal(planned.route.coords.length, 2)
  assert.ok(!JSON.stringify(planned).includes('secret-unit-token'))
  const [moved] = moveUnits([planned], 1)
  assert.notEqual(moved.lng, planned.lng)
  const failed = await fetchDrivingRoute('secret-unit-token', at(8, 8), at(20, 20), 'u-1', undefined, async () => ({ ok: false, status: 403 }))
  assert.equal(failed.route, undefined)
  assert.match(failed.error, /403/)
  assert.ok(!failed.error.includes('secret-unit-token'))
})

test('el envío usa el destino pedido, no un refugio', async () => {
  const dest = at(20, 20)
  const unit = createDispatch('ambulance', { lng: dest[0], lat: dest[1], label: 'persona' }, 1, 0)
  const origin = [unit.origin.lng, unit.origin.lat]
  let url = ''
  const planned = await planUnitRoute('test', unit, undefined, async requested => {
    url = requested
    return { ok: true, json: async () => ({ routes: [{ geometry: { coordinates: [origin, dest] }, duration: 180, distance: 900 }] }) }
  })
  assert.ok(url.includes(`${unit.origin.lng},${unit.origin.lat};${dest[0]},${dest[1]}`))
  assert.equal(planned.status, 'en_route')
  assert.equal(planned.route.coords.at(-1)[0], dest[0])
})

test('mergeAlerts antepone lo nuevo y recorta el historial', () => {
  const older = Array.from({ length: 60 }, (_, i) => ({ id: `old-${i}`, kind: 'no-answer', severity: 'warning', title: 'x', detail: 'x', ts: i, citizenIds: [] }))
  const merged = mergeAlerts(older, [{ id: 'new', kind: 'wind-shift', severity: 'critical', title: 'giro', detail: 'x', ts: 99, citizenIds: [] }])
  assert.equal(merged[0].id, 'new')
  assert.equal(merged.length, 60)
})

test('el catálogo abre en Madrid junto a ETSIT y conserva Gredos', () => {
  assert.equal(DEFAULT_SCENARIO_ID, 'madrid-etsit')
  assert.equal(scenarioById('madrid-etsit').id, MADRID_SCENARIO.id)
  assert.equal(SCENARIOS.map(item => item.id).join(','), 'madrid-etsit,gredos')
  assert.equal(GREDOS_SCENARIO.citizens.length, INITIAL_CITIZENS.length)
  assert.equal(MADRID_SCENARIO.citizens.length, 110)
  assert.ok(MADRID_SCENARIO.citizens.every(citizen => haversineMeters(ETSIT.lng, ETSIT.lat, citizen.lng, citizen.lat) < 120))
  assert.equal(MADRID_SCENARIO.safeZones.length, 3)
  assert.deepEqual(new Set(MADRID_SCENARIO.centers.map(center => center.kind)), new Set(['hospital', 'health', 'fire']))
  const heats = new Set(MADRID_SCENARIO.fireCells.features.map(feature => feature.properties.heat))
  assert.ok(MADRID_SCENARIO.fireCells.features.length > 0)
  assert.ok(heats.size > 1)
  assert.ok([...heats].every(heat => heat > 0 && heat <= 1))
  const fireRange = haversineMeters(ETSIT.lng, ETSIT.lat, MADRID_SCENARIO.incident.center[0], MADRID_SCENARIO.incident.center[1])
  assert.ok(fireRange > 700 && fireRange < 1200)
  const span = MADRID_SCENARIO.fireCells.features.flatMap(feature => feature.geometry.coordinates[0])
  const midLat = span[0][1]
  const widthM = haversineMeters(Math.min(...span.map(point => point[0])), midLat, Math.max(...span.map(point => point[0])), midLat)
  assert.ok(widthM < 450)
  const madridForecast = buildFireForecast(MADRID_SCENARIO.fireCells, { windTowardDeg: 225, windKmh: 20, spreadMPerMin: 8 })
  assert.equal(exposureAt(madridForecast, ETSIT.lng, ETSIT.lat, 0, 150).level, 'clear')
  assert.notEqual(exposureAt(madridForecast, ETSIT.lng, ETSIT.lat, 120, 150).level, 'clear')
  const hospital = MADRID_SCENARIO.centers.find(center => center.kind === 'hospital')
  const fire = MADRID_SCENARIO.centers.find(center => center.kind === 'fire')
  const health = MADRID_SCENARIO.centers.find(center => center.kind === 'health')
  assert.equal(hospital.locationSource, 'osm')
  assert.equal(fire.locationSource, 'osm')
  assert.equal(health.locationSource, 'osm')
  assert.equal(hospital.id, 'hospital-clinico')
  assert.equal(fire.id, 'fire-chamberi')
  assert.ok(haversineMeters(hospital.lng, hospital.lat, -3.7199109, 40.4406324) < 30)
  assert.ok(haversineMeters(fire.lng, fire.lat, -3.70081884, 40.44022118) < 30)
  assert.ok(haversineMeters(health.lng, health.lat, -3.7172212, 40.427828) < 30)
  assert.ok(haversineMeters(MADRID_SCENARIO.police.lng, MADRID_SCENARIO.police.lat, -3.7164075, 40.4269639) < 30)
  const ambulance = createDispatch('ambulance', { lng: ETSIT.lng, lat: ETSIT.lat, label: 'ETSIT' }, 1, 0, originsFrom(MADRID_SCENARIO.centers, MADRID_SCENARIO.police))
  assert.equal(ambulance.origin.id, hospital.id)
  assert.ok(haversineMeters(ETSIT.lng, ETSIT.lat, ambulance.origin.lng, ambulance.origin.lat) < 2000)
})
