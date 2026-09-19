import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createServer } from 'vite'

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
after(() => server.close())
const { buildFireForecast, forecastGeo, exposureAt, routeBlocked } = await server.ssrLoadModule('/src/fire-model.ts')
const { fetchRefugeRoutes, rankRefugeRoutes } = await server.ssrLoadModule('/src/routing.ts')
const { RESPONSE_CENTERS, createNotice, transitionNotice } = await server.ssrLoadModule('/src/response.ts')
const { SAFE_ZONES, INITIAL_CITIZENS } = await server.ssrLoadModule('/src/scenario.ts')
const footprint = { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[[-5, 40], [-4.9999, 40], [-4.9999, 40.0001], [-5, 40.0001], [-5, 40]]] } }] }
const settings = { windTowardDeg: 90, windKmh: 30, spreadMPerMin: 5 }
const forecast = buildFireForecast(footprint, settings)
const at = (x, y) => [forecast.origin[0] + (x + 0.5) * forecast.cellSizeM / forecast.lngScale, forecast.origin[1] + (y + 0.5) * forecast.cellSizeM / 111320]

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
