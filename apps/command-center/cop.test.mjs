import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, test } from 'node:test'
import { createServer } from 'vite'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
after(() => server.close())
const { buildFireForecast, forecastGeo, forecastHeatPoints, cellVisualHeat, exposureAt, routeBlocked } = await server.ssrLoadModule('/src/fire-model.ts')
const { fetchRefugeRoutes, rankRefugeRoutes, planCitizenRoute, fetchDrivingRoute, positionAt } = await server.ssrLoadModule('/src/routing.ts')
const { detectAlerts, initialWatch, mergeAlerts, ALERT_ACTION_LABEL } = await server.ssrLoadModule('/src/alerts.ts')
const { createDispatch, moveUnits, planUnitRoute, unitOrigin, originsFrom, unitStops, unitTrail, sliceRoute } = await server.ssrLoadModule('/src/units.ts')
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

test('el mapa abre despejado y conserva accesos a escenario, campaña y todas las herramientas', async () => {
  const { CommandCenter } = await server.ssrLoadModule('/src/CommandCenter.tsx')
  const html = renderToStaticMarkup(createElement(CommandCenter, { token: 'test' }))
  for (const label of ['Cambiar escenario', 'Opciones de campaña', 'Dibujar zona de llamadas', 'Propagación', 'Centros y coordinación', 'Plan operativo', 'Personas', 'Capas']) assert.ok(html.includes(label), label)
  assert.ok(html.includes('class="brand-logo"'), 'la cabecera lleva el logotipo')
  assert.ok(html.includes('aria-label="router"'), 'y se anuncia como router')
  assert.ok(html.includes('intro-partner'), 'y la entradilla acredita a HappyRobot')
  assert.ok(html.includes('Simulación local'))
  assert.ok(html.includes('campaign-dock'))
  assert.ok(html.includes('data-demo="tour-start"'))
  assert.ok(html.includes('Ver recorrido'))
  assert.ok(!html.includes('Memoria compartida'), 'la memoria compartida está oculta del mapa hasta que vuelva a la demo (CommandCenter.tsx)')
  assert.ok(html.includes('data-demo="tool-happyrobot"'))
  assert.ok(!html.includes('class="forecast-summary"'))
  assert.ok(!html.includes('class="minimal-legend"'))
  assert.ok(!html.includes('class="incident-list"'))
  assert.ok(!html.includes('type="password"'))
  assert.ok(!html.includes('class="floating-panel"'))
})

test('el recorrido es una demo de manos: el visitante rodea, llama, escala y pinta el fuego, y el recorrido espera a cada acción', async () => {
  const { DEMO_TOUR_STEPS, TOUR_INTRO, shouldShowTourIntro, TOUR_STORAGE_KEY } = await server.ssrLoadModule('/src/demoTour.ts')
  assert.deepEqual(DEMO_TOUR_STEPS.map((step) => step.id), ['situacion', 'grupo', 'dibuja', 'llama', 'motor', 'roja', 'escala', 'run', 'camino', 'pinta', 'rerruta', 'contraste', 'fin'])
  // Cada anclaje existe en la interfaz: un selector que no está en el código es un paso que Driver no puede señalar.
  const source = [
    readFileSync(new URL('./src/CommandCenter.tsx', import.meta.url), 'utf8'),
    readFileSync(new URL('./src/CommandMap.tsx', import.meta.url), 'utf8'),
    readFileSync(new URL('./src/CopPanels.tsx', import.meta.url), 'utf8'),
    readFileSync(new URL('./src/HappyRobotCard.tsx', import.meta.url), 'utf8'),
  ].join('\n')
  for (const step of DEMO_TOUR_STEPS) {
    const demo = step.element.match(/data-demo="([^"]+)"/)?.[1]
    assert.ok(demo, `${step.id}: anclaje data-demo`)
    assert.ok(source.includes(`data-demo="${demo}"`) || source.includes(`'${demo}'`) || source.includes(`scope="${demo}"`), `${step.id}: ${demo} existe en la interfaz`)
    assert.ok(step.title.length <= 60 && step.description.split(' ').length <= 60, `${step.id}: se lee de un vistazo`)
    // Un paso de manos dice qué hacer, en imperativo; uno que solo explica, no da órdenes.
    assert.equal(Boolean(step.task), Boolean(step.view.handsOn), `${step.id}: instrucción solo en los pasos de manos`)
  }
  // Los dos casos, en el orden de la historia: rodear y llamar antes de escalar, y pintar el frente al final.
  const hands = DEMO_TOUR_STEPS.filter((step) => step.view.handsOn).map((step) => step.id)
  assert.deepEqual(hands, ['dibuja', 'llama', 'roja', 'escala', 'pinta'])
  // La marca azul acompaña a cada gesto sobre el mapa; los pasos de HappyRobot abren la tarjeta.
  const view = Object.fromEntries(DEMO_TOUR_STEPS.map((step) => [step.id, step.view]))
  assert.deepEqual(view.dibuja, { focus: 'group', hint: 'draw', handsOn: true })
  assert.deepEqual(view.roja, { focus: 'group', hint: 'person', handsOn: true })
  assert.deepEqual(view.escala, { person: true, handsOn: true })
  assert.deepEqual(view.pinta, { focus: 'route', hint: 'paint', handsOn: true })
  for (const id of ['motor', 'run', 'rerruta']) assert.deepEqual(view[id], { happyRobot: true })
  assert.ok(DEMO_TOUR_STEPS.find((step) => step.id === 'escala').task.includes('Enviar fuerzas de seguridad'))
  assert.ok(DEMO_TOUR_STEPS.find((step) => step.id === 'dibuja').task.includes('Zona'))
  assert.ok(DEMO_TOUR_STEPS.find((step) => step.id === 'pinta').task.includes('Frente'))
  assert.equal(TOUR_INTRO.checklist.length, 2)
  assert.equal(TOUR_STORAGE_KEY, 'vigia-tour-seen')
  assert.equal(shouldShowTourIntro(), false)
  const { TourIntro } = await server.ssrLoadModule('/src/TourIntro.tsx')
  const intro = renderToStaticMarkup(createElement(TourIntro, { onStart() {}, onDismiss() {} }))
  assert.ok(intro.includes('Guía tú la evacuación'))
  assert.ok(intro.includes('Empezar'))
  assert.ok(intro.includes('Explorar por mi cuenta'))
  assert.ok(intro.includes('tour-intro-checklist'))
})

test('el escenario de Madrid trae el grupo guiado: veinte casas apartadas, una que no descuelga, a pie y con reloj lento', async () => {
  const { MADRID_SCENARIO } = await server.ssrLoadModule('/src/scenario-madrid.ts')
  const { guided } = MADRID_SCENARIO
  assert.ok(guided)
  const group = MADRID_SCENARIO.citizens.filter((citizen) => citizen.locality === guided.locality)
  assert.equal(group.length, 20)
  const silent = group.filter((citizen) => citizen.outcome === 'no_answer')
  assert.equal(silent.length, 1)
  assert.equal(silent[0].id, guided.silentId)
  assert.equal(silent[0].id, group.at(-1).id, 'la que no descuelga suena la última')
  assert.ok(group.filter((citizen) => citizen.outcome === 'tracking').length === 19, 'las demás contestan y comparten ubicación')
  // Nadie del campus se cuela en el círculo sugerido, y todo el grupo cabe dentro.
  const { haversineMeters } = await server.ssrLoadModule('/src/geo.ts')
  const center = { lng: group.reduce((sum, c) => sum + c.lng, 0) / group.length, lat: group.reduce((sum, c) => sum + c.lat, 0) / group.length }
  const inside = MADRID_SCENARIO.citizens.filter((citizen) => haversineMeters(center.lng, center.lat, citizen.lng, citizen.lat) <= guided.radiusM)
  assert.equal(inside.length, 20)
  assert.ok(MADRID_SCENARIO.citizens.every((citizen) => citizen.speedKmh <= 6), 'en ciudad se evacúa a pie')
  assert.equal(MADRID_SCENARIO.clockScale, 6)
})

test('los sitios comparten los emojis pedidos y conservan sus nombres accesibles', async () => {
  const { SITE_EMOJI } = await server.ssrLoadModule('/src/response.ts')
  assert.deepEqual(SITE_EMOJI, { hospital: '🏥', health: '🏥', fire: '🚒', meeting: '⛺' })
  const { ResponsePanel } = await server.ssrLoadModule('/src/CopPanels.tsx')
  const html = renderToStaticMarkup(createElement(ResponsePanel, { selectedId: null, onSelect() {}, scenario: 'test', notices: [], onNotices() {}, centers: RESPONSE_CENTERS, settlements: GREDOS_SCENARIO.settlements }))
  assert.equal((html.match(/class="site-emoji"/g) ?? []).length, RESPONSE_CENTERS.length)
  for (const center of RESPONSE_CENTERS) {
    assert.ok(html.includes(SITE_EMOJI[center.kind]))
    assert.ok(html.includes(center.name))
  }
})

test('el plan operativo resume prioridad, comunicación, recursos y vigencia', async () => {
  const { AlertsPanel } = await server.ssrLoadModule('/src/CopPanels.tsx')
  const html = renderToStaticMarkup(createElement(AlertsPanel, {
    alerts: [], units: [], selectedUnitId: null, unitsPaused: false,
    plan: { status: 'draft', revision: 1, reviewedAt: 0, recommendedCount: 24, affectedCount: 31, campaignCount: 0, answered: 0, silent: 0, moving: 0, waiting: 0, live: false },
    onToggleUnits() {}, onRetryUnit() {}, onAction() {}, onDispatch() {}, onFocus() {}, onFocusUnit() {}, onAdoptPlan() {}, onStartRecommended() {}, onOpenCampaign() {},
  }))
  for (const label of ['Prioridad actual', 'Contactar con 24 personas', 'Señales decisivas', 'Orden de comunicación', 'Cobertura de recursos', 'Vigencia del plan']) assert.ok(html.includes(label), label)
})

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

test('el frente visual florece antes de la celda y no salta a calor pleno', () => {
  const later = [...forecast.cells.values()].find(cell => cell.minute > 8 && cell.minute < 40)
  assert.ok(later)
  assert.equal(cellVisualHeat(0, 0), 1)
  assert.ok(cellVisualHeat(later.minute, later.minute - 8) < cellVisualHeat(later.minute, later.minute))
  assert.ok(cellVisualHeat(later.minute, later.minute) < cellVisualHeat(later.minute, later.minute + 20))
  const start = forecastHeatPoints(forecast, 0).features.length
  const mid = forecastHeatPoints(forecast, later.minute).features.length
  const late = forecastHeatPoints(forecast, 80).features.length
  assert.equal(start, 0)
  assert.ok(mid > 0)
  assert.ok(late > mid)
  assert.ok(forecastHeatPoints(forecast, later.minute).features.every(point => point.properties.heat > 0 && point.properties.heat <= 1))
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

test('una persona con llamada real de HappyRobot no la anima la simulación local', () => {
  const origin = at(7, 8)
  const route = road('real-road', zones[0], [origin, at(8, 8)], 60)
  const base = { lng: origin[0], lat: origin[1], locality: 'El Arenal', status: 'pending', outcome: 'tracking', routeId: route.id, routeProgressM: 0, routePhase: 'access', safeZoneId: zones[0].id }
  const real = { ...INITIAL_CITIZENS[0], ...base, real: true }
  const demo = { ...INITIAL_CITIZENS[1], ...base }
  const batch = prepareAreaCampaign([real, demo], [real.id, demo.id], 0, new Set())
  assert.deepEqual(batch.addedIds, [demo.id], 'el teléfono real no entra en la simulación')
  let current = batch.citizens
  for (const time of [1, 4, 11]) current = advanceProtocol(current, time, [], new Set([real.id, demo.id])).citizens
  assert.equal(current[0].status, 'pending', 'la simulación no descuelga por la persona real')
  assert.equal(current[0].call, undefined)
  assert.equal(current[1].status, 'evacuating', 'el vecino sintético sí sigue su guion')
  const ringing = { ...current[0], status: 'ringing', callState: 'ringing' }
  const [still] = advanceProtocol([ringing], 100, [], new Set([real.id])).citizens
  assert.equal(still.status, 'ringing', 'sonando de verdad: solo el tablero de llamadas lo cierra')
  const walker = { ...current[0], status: 'evacuating', call: { answeredAt: 0, agent: 'x', summary: '', consent: 'granted', needs: [] } }
  const [parked] = moveEvacuees([walker], new Map([[route.id, route]]), zones, 10)
  assert.equal(parked.lng, origin[0])
  assert.equal(parked.lat, origin[1])
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
  assert.equal(planned.status, 'hold')
  assert.equal(planned.route, undefined)
  assert.match(planned.hold, /401/)
  assert.ok(!JSON.stringify(planned).includes('secret-unit-token'))
  const [moved] = moveUnits([planned], 1)
  assert.strictEqual(moved, planned)
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

test('la orientación sigue la carretera y anticipa suavemente el giro', async () => {
  const { routeHeading } = await server.ssrLoadModule('/src/units.ts')
  const path = road('turn', { id: 'turn' }, [[-3, 40], [-3, 40.001], [-2.999, 40.001]], 60, 'dispatch')
  assert.ok(routeHeading(path, 20) < 1)
  assert.ok(Math.abs(routeHeading(path, path.cumulative[1] + 20) - 90) < 1)
  assert.ok(routeHeading(path, path.cumulative[1]) > 25 && routeHeading(path, path.cumulative[1]) < 65)
  const unit = { ...createDispatch('police', { lng: -2.999, lat: 40.001, label: 'destino' }, 0, 0), status: 'en_route', route: path, heading: 0 }
  const [moving] = moveUnits([unit], 4)
  assert.ok(moving.heading > 80 && moving.heading < 100)
  assert.equal(moveUnits([moving], 0)[0].heading, moving.heading)
})

test('cada escenario tiene dos patrullas y dos ambulancias simuladas con IDs propios', async () => {
  const { createPatrolFleet } = await server.ssrLoadModule('/src/units.ts')
  const madrid = createPatrolFleet(MADRID_SCENARIO)
  const gredos = createPatrolFleet(GREDOS_SCENARIO)
  for (const fleet of [madrid, gredos]) {
    assert.equal(fleet.length, 4)
    assert.equal(fleet.filter(unit => unit.kind === 'police').length, 2)
    assert.equal(fleet.filter(unit => unit.kind === 'ambulance').length, 2)
    assert.equal(new Set(fleet.map(unit => unit.id)).size, 4)
    assert.ok(fleet.every(unit => unit.mission === 'patrol' && unit.status === 'requested' && !unit.route && unit.patrol.stops.length === 3))
  }
  assert.ok(madrid.every(unit => !gredos.some(other => other.id === unit.id)))
})

const mockUnitRoad = async url => {
  const [origin, destination] = decodeURIComponent(new URL(url).pathname.split('/').at(-1)).split(';').map(point => point.split(',').map(Number))
  return { ok: true, json: async () => ({ routes: [{ geometry: { coordinates: [origin, [destination[0], origin[1]], destination] }, duration: 180 }] }) }
}

test('el patrullaje encadena calles en circuito y reutiliza la ruta al dar vueltas', async () => {
  const { createPatrolFleet } = await server.ssrLoadModule('/src/units.ts')
  let requests = 0
  const patrol = await planUnitRoute('test', createPatrolFleet(MADRID_SCENARIO)[0], undefined, async url => { requests++; return mockUnitRoad(url) })
  assert.equal(patrol.status, 'patrolling')
  assert.equal(requests, 3)
  assert.deepEqual(patrol.route.coords[0], patrol.route.coords.at(-1))
  assert.ok(patrol.route.coords.length > 3)
  const [moved] = moveUnits([patrol], 1)
  assert.ok(haversineMeters(patrol.lng, patrol.lat, moved.lng, moved.lat) > 0)
  const [lap] = moveUnits([patrol], patrol.route.durationSec / 4)
  assert.equal(lap.status, 'patrolling')
  assert.ok(haversineMeters(patrol.lng, patrol.lat, lap.lng, lap.lat) < 0.01)
  assert.equal(requests, 3)
  const fleet = [patrol]
  assert.strictEqual(moveUnits(fleet, NaN), fleet)
})

test('redirigir conserva unidad y posición y descarta un resultado antiguo de planificación', async () => {
  const { createPatrolFleet, redirectUnit, applyUnitPlan, pickAvailableUnit } = await server.ssrLoadModule('/src/units.ts')
  const initial = createPatrolFleet(MADRID_SCENARIO)[0]
  const patrol = await planUnitRoute('test', initial, undefined, mockUnitRoad)
  const [moving] = moveUnits([patrol], 20)
  const target = { lng: -3.725, lat: 40.451, label: 'Destino de prueba' }
  const redirected = redirectUnit(moving, target, 1000)
  assert.equal(redirected.id, moving.id)
  assert.equal(redirected.callSign, moving.callSign)
  assert.equal(redirected.revision, moving.revision + 1)
  assert.equal(redirected.mission, 'dispatch')
  assert.equal(redirected.status, 'requested')
  assert.equal(redirected.lng, moving.lng)
  assert.equal(redirected.lat, moving.lat)
  assert.equal(redirected.route, undefined)
  assert.strictEqual(moveUnits([redirected], 10)[0], redirected)
  assert.strictEqual(applyUnitPlan([redirected], patrol)[0], redirected)
  assert.equal(pickAvailableUnit([redirected], 'police', target), undefined)
  assert.equal(pickAvailableUnit([moving], 'police', target)?.id, moving.id)
  let origin
  const planned = await planUnitRoute('test', redirected, undefined, async url => { origin = decodeURIComponent(new URL(url).pathname.split('/').at(-1)).split(';')[0]; return mockUnitRoad(url) })
  assert.equal(origin, `${moving.lng},${moving.lat}`)
  assert.equal(applyUnitPlan([redirected], planned)[0].status, 'en_route')
  const retargeted = redirectUnit(redirected, { ...target, lng: -3.724 }, 1001)
  assert.strictEqual(applyUnitPlan([retargeted], planned)[0], retargeted)
  assert.equal(moveUnits([planned], 10000)[0].status, 'on_scene')
  assert.throws(() => redirectUnit(moving, { ...target, lat: 91 }, 1001))
})

test('un circuito incompleto se queda parado y no inventa el tramo que falta', async () => {
  const { createPatrolFleet } = await server.ssrLoadModule('/src/units.ts')
  const initial = createPatrolFleet(MADRID_SCENARIO)[0]
  let requests = 0
  const failed = await planUnitRoute('test', initial, undefined, url => ++requests === 1 ? mockUnitRoad(url) : Promise.resolve({ ok: false, status: 503 }))
  assert.equal(failed.status, 'hold')
  assert.equal(failed.route, undefined)
  assert.equal(failed.lng, initial.lng)
  assert.equal(failed.lat, initial.lat)
  assert.strictEqual(moveUnits([failed], 100)[0], failed)
  assert.equal(requests, 2)
  const controller = new AbortController()
  controller.abort()
  await assert.rejects(planUnitRoute('test', initial, controller.signal, mockUnitRoad), { name: 'AbortError' })
})

test('los medios terminan en el acceso de carretera, sin conectores rectos a edificios', async () => {
  const target = { lng: -3.71, lat: 40.44, label: 'Edificio' }
  const unit = createDispatch('ambulance', target, 1, 0, originsFrom(MADRID_SCENARIO.centers, MADRID_SCENARIO.police))
  const start = [unit.lng + 0.00005, unit.lat]
  const end = [target.lng - 0.00005, target.lat]
  const planned = await planUnitRoute('test', unit, undefined, async () => ({ ok: true, json: async () => ({ routes: [{ geometry: { coordinates: [start, end] }, duration: 180 }] }) }))
  assert.deepEqual(planned.route.coords, [start, end])
  const [arrived] = moveUnits([planned], 10000)
  assert.equal(arrived.lng, end[0])
  assert.equal(arrived.lat, end[1])
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
  // El campus (90) junto a la ETSIT; el grupo guiado (20) aparte, a poco más de un kilómetro.
  const campus = MADRID_SCENARIO.citizens.filter(citizen => citizen.locality === 'ETSIT')
  assert.equal(campus.length, 90)
  assert.ok(campus.every(citizen => haversineMeters(ETSIT.lng, ETSIT.lat, citizen.lng, citizen.lat) < 120))
  assert.ok(MADRID_SCENARIO.citizens.filter(citizen => citizen.locality !== 'ETSIT').every(citizen => haversineMeters(ETSIT.lng, ETSIT.lat, citizen.lng, citizen.lat) > 900))
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

test('la zona recomendada envuelve el fuego a favor del viento y la afectada la amplía a una hora', async () => {
  const { recommendAreas } = await server.ssrLoadModule('/src/risk.ts')
  const { anchorScenario } = await server.ssrLoadModule('/src/scenario.ts')
  const live = buildFireForecast(MADRID_SCENARIO.fireCells, { windTowardDeg: 180, windKmh: 20, spreadMPerMin: 8 })
  const areas = recommendAreas(MADRID_SCENARIO.fireCells, live, 180)
  const corners = MADRID_SCENARIO.fireCells.features.flatMap(f => f.geometry.coordinates[0])
  assert.ok(corners.every(([lng, lat]) => haversineMeters(areas.risk.lng, areas.risk.lat, lng, lat) <= areas.risk.radiusM), 'todo el fuego cabe en la zona de riesgo')
  const centroidLat = corners.reduce((s, [, lat]) => s + lat, 0) / corners.length
  assert.ok(areas.risk.lat < centroidLat, 'con viento hacia el sur, el círculo se desplaza al sur')
  assert.ok(areas.affected.radiusM > areas.risk.radiusM && areas.affectedMinutes === 60)
  assert.ok(areas.affected.radiusM <= 20000 && areas.risk.radiusM <= 20000)
  assert.equal(recommendAreas({ type: 'FeatureCollection', features: [] }, live, 180), null)
  const moved = anchorScenario(MADRID_SCENARIO, { lng: -3.6844, lat: 40.4153 })
  const movedAreas = recommendAreas(moved.fireCells, buildFireForecast(moved.fireCells, { windTowardDeg: 180, windKmh: 20, spreadMPerMin: 8 }), 180)
  assert.ok(haversineMeters(movedAreas.risk.lng, movedAreas.risk.lat, -3.6844, 40.4153) < 2000, 'anclado, la recomendación sigue al mundo')
})

test('la tarjeta de HappyRobot corre el despacho de un medio paso a paso y después lo sigue por el vehículo', async () => {
  const { HappyRobotCard } = await server.ssrLoadModule('/src/HappyRobotCard.tsx')
  const { HR_UNIT_RUN_STEPS } = await server.ssrLoadModule('/src/hrModel.ts')
  const render = (unit, unitRun) => renderToStaticMarkup(createElement(HappyRobotCard, { view: 'unit', connected: false, live: false, unit, unitRun, collapsed: false, onToggleCollapse() {}, onClose() {} }))
  const stepState = (html, id) => html.match(new RegExp(`<li class="hr-node" data-state="([a-z]+)"[^>]*><div class="hr-node-row" data-demo="hr-node" data-demo-id="${id}"`))?.[1]
  const target = { lng: -3.7, lat: 40.4, label: 'Rosa Gil' }
  const run = { id: 'run-1', kind: 'ambulance', target, agent: 'Operador · demo', label: 'Petición del mando', step: 3, startedAt: 0 }
  const running = render(undefined, run)
  assert.ok(running.includes(`Ejecutando run · 4/${HR_UNIT_RUN_STEPS.length}`) && running.includes('Despacho · Ambulancia'), 'sin vehículo todavía, la tarjeta ya corre el run')
  assert.equal(stepState(running, HR_UNIT_RUN_STEPS[0].id), 'done')
  assert.equal(stepState(running, HR_UNIT_RUN_STEPS[3].id), 'active')
  assert.equal(stepState(running, HR_UNIT_RUN_STEPS[4].id), 'idle')
  assert.equal(stepState(running, 'watch'), 'idle', 'el seguimiento espera a que salga el vehículo')
  for (const label of ['Workflow Function Request', 'Query Twin with SQL · v_person_support', 'Query Twin with SQL · v_available_transport', 'Python Sandbox · elegir medio', 'Paths · ¿hay medio viable?', 'Approval Process', 'Loop · colección, paralelo', 'Outbound Voice Agent · conductor', 'Extract · desenlace y ETA', 'Paths · según el desenlace', 'Outbound Text Agent · SMS', 'POST «Medio → Vigía»', 'Loop End', 'ETA frente al fuego', 'Parte al llegar']) assert.ok(running.includes(label), label)
  for (const word of ['Confirmar', 'Rechazar', 'Bloqueo', 'Mando']) assert.ok(running.includes(`<strong>${word}</strong>`), word)
  assert.ok(running.includes('hr-flow-nested'), 'el cuerpo del loop va anidado')
  const base = { id: 'u-1', callSign: 'A-01', kind: 'ambulance', mission: 'dispatch', revision: 1, agent: 'Operador · demo', summary: 'Operador · demo pide ambulancia en Hospital del Prado para Rosa Gil.', origin: 'Hospital del Prado', target: 'Rosa Gil', distanceKm: 2.8, escalated: false, stops: [{ label: 'Rosa Gil', km: 2.8, etaMin: 7 }] }
  const onWay = render({ ...base, status: 'en_route', etaMin: 7 })
  assert.ok(onWay.includes('A-01 · Ambulancia') && onWay.includes('En camino · 7 min'), 'con vehículo, la pill es su estado real')
  for (const step of HR_UNIT_RUN_STEPS) assert.equal(stepState(onWay, step.id), 'done', `${step.id} hecho`)
  assert.equal(stepState(onWay, 'watch'), 'active')
  assert.equal(stepState(onWay, 'report'), 'idle')
  assert.ok(onWay.includes('Elegido A-01 desde Hospital del Prado · 2,8 km por carretera.') && onWay.includes('2,8 km · llega en 7 min') && onWay.includes('<b>7 min</b>'), 'sandbox y vigilancia cuentan el despacho real')
  assert.ok(onWay.includes('>Destino<') && onWay.includes('2,8 km · 7 min'), 'un despacho enseña su destino como única parada')
  const arrived = render({ ...base, status: 'on_scene' })
  assert.equal(stepState(arrived, 'watch'), 'done')
  assert.equal(stepState(arrived, 'report'), 'active')
  assert.ok(arrived.includes('Medio en el acceso'), 'al llegar hay bloque de resultado')
  const held = render({ ...base, status: 'hold', hold: 'Sin carretera disponible.' })
  assert.equal(stepState(held, 'vigia'), 'error')
  assert.equal(stepState(held, 'watch'), 'idle')
  assert.ok(held.includes('Sin carretera disponible.'), 'el motivo del hold se lee')
  const patrol = render({ ...base, mission: 'patrol', target: undefined, status: 'patrolling', stops: [{ label: 'Plaza', km: 0.4, etaMin: 1 }, { label: 'Hospital', km: 1.9, etaMin: 3 }] })
  for (const id of [HR_UNIT_RUN_STEPS[0].id, 'vigia', 'watch']) assert.equal(stepState(patrol, id), 'idle', `${id} en reposo en patrulla`)
  const stopsBlock = patrol.slice(patrol.indexOf('hr-unit-stops'))
  assert.ok(patrol.includes('Patrullando') && stopsBlock.includes('Próximas paradas') && stopsBlock.indexOf('Plaza') < stopsBlock.indexOf('Hospital') && stopsBlock.includes('0,4 km · 1 min'), 'las paradas salen en orden con distancia y tiempo')
  const escalated = render({ ...base, status: 'en_route', etaMin: 3, agent: 'HappyRobot · Escalada', escalated: true })
  assert.equal(stepState(escalated, 'approval'), 'done')
  assert.ok(escalated.includes('run de escalada') && escalated.includes('Guardia Civil y 1-1-2'), 'un medio de la escalada cuenta de dónde viene')
})

test('las paradas y la estela de un medio siguen su ruta: el despacho hasta el destino, la patrulla dando la vuelta', () => {
  // Un cuadrado de ~1 km de lado, cerrado, con las esquinas como paradas.
  const corner = (x, y) => [-5 + x * 0.0118, 40 + y * 0.009]
  const coords = [corner(0, 0), corner(1, 0), corner(1, 1), corner(0, 1), corner(0, 0)]
  const cumulative = [0]
  for (let i = 1; i < coords.length; i++) cumulative.push(cumulative[i - 1] + haversineMeters(...coords[i - 1], ...coords[i]))
  const lengthM = cumulative[cumulative.length - 1]
  const route = { id: 'r', group: 'test', zoneId: 'u', coords, cumulative, lengthM, durationSec: lengthM / 10 }
  const stops = [corner(0, 0), corner(1, 0), corner(1, 1)].map(([lng, lat], i) => ({ lng, lat, label: `Parada ${i}` }))
  const patrol = { id: 'p', callSign: 'P-01', kind: 'police', agent: 'test', origin: { id: 'o', name: 'o', lng: 0, lat: 0 }, target: stops[1], mission: 'patrol', revision: 1, patrol: { stops }, route, status: 'patrolling', lng: 0, lat: 0, progressM: lengthM * 0.3, heading: 0, requestedAt: 0, summary: '' }
  const next = unitStops(patrol)
  assert.deepEqual(next.map(stop => stop.label), ['Parada 2', 'Parada 0', 'Parada 1'], 'a un 30 % de la vuelta ya pasó la primera esquina: toca la segunda, luego la salida y por último la primera')
  assert.ok(next.every((stop, i) => i === 0 || stop.distanceM >= next[i - 1].distanceM), 'ordenadas por distancia por delante')
  assert.ok(Math.abs(next[1].distanceM - lengthM * 0.7) < lengthM * 0.05, 'la salida está a lo que falta de vuelta')
  const trail = unitTrail(patrol)
  assert.equal(trail.done.length, 0, 'en un circuito no se pinta lo recorrido')
  assert.ok(trail.ahead.length >= 2 && trail.rest.length >= 2, 'tramo a la siguiente parada y resto del circuito')
  assert.ok(Math.abs(trail.ahead[0][0] - positionAt(route, lengthM * 0.3)[0]) < 1e-9, 'la estela nace en la posición del medio')
  const wrap = sliceRoute(route, lengthM * 0.9, lengthM * 0.1, true)
  assert.ok(wrap.length >= 3 && Math.abs(wrap[wrap.length - 1][0] - positionAt(route, lengthM * 0.1)[0]) < 1e-9, 'el tramo que cruza el cierre da la vuelta')
  const dispatch = { ...patrol, id: 'd', mission: 'dispatch', patrol: undefined, status: 'en_route', target: { ...stops[2] }, progressM: lengthM * 0.5, etaSec: 120 }
  const only = unitStops(dispatch)
  assert.equal(only.length, 1)
  assert.ok(Math.abs(only[0].distanceM - lengthM * 0.5) < 1 && only[0].etaSec === 120, 'un despacho tiene una parada: el destino, a lo que queda')
  const dTrail = unitTrail(dispatch)
  assert.ok(dTrail.done.length >= 2 && dTrail.ahead.length >= 2 && dTrail.rest.length === 0, 'lo recorrido y lo que queda; sin resto')
  assert.deepEqual(unitStops({ ...patrol, route: undefined }).map(stop => stop.label), ['Parada 0', 'Parada 1', 'Parada 2'], 'sin ruta, solo el orden del circuito')
  const atStart = unitStops({ ...patrol, progressM: 0 })
  assert.deepEqual(atStart.map(stop => stop.label), ['Parada 1', 'Parada 2', 'Parada 0'], 'en la salida, la parada en la que está cuenta como pasada y va al final')
  assert.ok(Math.abs(atStart[2].distanceM - lengthM) < 1, 'a una vuelta entera')
  const startTrail = unitTrail({ ...patrol, progressM: 0 })
  assert.ok(startTrail.ahead.length >= 2 && startTrail.ahead.length < coords.length, 'la estela va solo hasta la primera esquina, no toda la vuelta')
})
