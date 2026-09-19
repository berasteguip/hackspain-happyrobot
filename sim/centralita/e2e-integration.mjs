import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = process.env.E2E_BASE_URL || 'http://127.0.0.1:5174';
const live = process.env.E2E_LIVE_HR === '1';
const recover = process.env.E2E_RECOVER_HR === '1';
assert.ok(!live || !recover, 'No mezclar creación y recuperación de chats');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
let people = [];
let polls = 0;
let readyCount = 0;
let starts = 0;
let directionRequests = 0;
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await context.addInitScript(() => localStorage.setItem('vigia.mapboxToken', 'pk.test'));
await context.route('**/*', async route => {
  const url = new URL(route.request().url());
  if (url.pathname === '/api/locations') return route.fulfill({ json: [] });
  if (url.pathname === '/bridge/wave/start') {
    if (recover) throw new Error('La recuperación no debe abrir conversaciones');
    starts++;
    people = route.request().postDataJSON().people;
    if (live) return route.continue();
    return route.fulfill({ json: { ok: true, queued: people.length } });
  }
  if (url.pathname === '/bridge/wave/status') {
    polls++;
    if (live || recover) return route.continue();
    return route.fulfill({ json: { calls: people.map((person, index) => ({
      person_id: person.agent.person_id, state: 'done', resultState: index < readyCount ? 'ready' : 'pending',
      transcript: [{ ts: new Date().toISOString(), speaker: 'A', text: person.agent.say_this }, { ts: new Date().toISOString(), speaker: 'V', text: 'Sí, salimos y compartimos la ubicación.' }],
      outcome: index < readyCount ? { answered: true, agent_notes: 'Resultado controlado de prueba, no un run real.', extracted: { people_at_home: 2, consent_position: true, will_evacuate: true, mobility: 'car', vulnerable_people: [], neighbors_mentioned: [] } } : null,
    })) } });
  }
  if (url.hostname === 'api.mapbox.com' && url.pathname.includes('/directions/')) {
    directionRequests++;
    const [origin, end] = decodeURIComponent(url.pathname.split('/').at(-1)).split(';').map(point => point.split(',').map(Number));
    const east = Math.max(origin[0], end[0]) + 0.002;
    const coordinates = [origin, [east, origin[1]], [east, end[1]], end];
    return route.fulfill({ json: { code: 'Ok', routes: [{ geometry: { coordinates }, duration: 180, distance: 1500 }] } });
  }
  if (url.hostname === 'api.mapbox.com' && url.pathname.includes('/styles/')) return route.fulfill({ json: { version: 8, glyphs: `${base}/mock-fonts/{fontstack}/{range}.pbf`, sources: {}, layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#17252e' } }] } });
  if (url.hostname === 'api.mapbox.com' && url.pathname.includes('/v4/')) return route.fulfill({ json: { tilejson: '2.2.0', tiles: [], minzoom: 0, maxzoom: 22 } });
  if (url.pathname.startsWith('/mock-fonts/')) return route.fulfill({ contentType: 'application/x-protobuf', body: Buffer.alloc(0) });
  if (url.origin !== new URL(base).origin) return route.abort();
  return route.continue();
});

const population = () => page.evaluate(() => {
  const el = document.getElementById('root');
  const root = el?.[Object.keys(el).find(key => key.startsWith('__reactContainer$'))]?.stateNode?.current;
  const pending = root ? [root] : [];
  while (pending.length) {
    const fiber = pending.pop();
    if (fiber.type?.name === 'CommandCenter') {
      let hook = fiber.memoizedState;
      while (hook) {
        const value = hook.memoizedState;
        if (Array.isArray(value) && value.length === 300 && value[0]?.id?.startsWith('c-')) return JSON.parse(JSON.stringify(value));
        hook = hook.next;
      }
    }
    if (fiber.child) pending.push(fiber.child);
    if (fiber.sibling) pending.push(fiber.sibling);
  }
  return [];
});

const mapData = name => page.evaluate(name => window.__testMap.getStyle().sources[name]?.data, name);
const drawArea = async (start, end) => {
  await page.getByRole('button', { name: 'Añadir zona de llamadas', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.mapboxgl-canvas')?.style.cursor === 'crosshair');
  await page.mouse.move(...start);
  await page.mouse.down();
  await page.mouse.move(...end, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(150);
};

try {
  await page.goto(base);
  await page.locator('.campaign-dock').waitFor();
  assert.ok(await page.getByRole('button', { name: 'Personas 0', exact: true }).isVisible());
  assert.ok(await page.getByRole('button', { name: 'Enviar llamadas', exact: true }).isEnabled());
  assert.equal(await page.locator('.forecast-summary').count(), 0);
  assert.equal(await page.locator('.floating-panel').count(), 0);
  assert.equal(await page.locator('select:visible').count(), 0);
  assert.ok((await page.locator('.campaign-dock').boundingBox()).height <= 80);
  await page.waitForTimeout(800);
  if (process.env.E2E_SCREENSHOT_PREFIX) await page.screenshot({ path: `${process.env.E2E_SCREENSHOT_PREFIX}-desktop.png` });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok((await page.locator('.campaign-dock').boundingBox()).height <= 80);
  const mobileNav = await page.locator('.floating-actions').boundingBox();
  assert.ok(mobileNav.x >= 0 && mobileNav.x + mobileNav.width <= 390);
  const zoomControls = await page.locator('.mapboxgl-ctrl-bottom-right .mapboxgl-ctrl-group').first().boundingBox();
  assert.ok(zoomControls.y + zoomControls.height < (await page.locator('.campaign-dock').boundingBox()).y);
  if (process.env.E2E_SCREENSHOT_PREFIX) await page.screenshot({ path: `${process.env.E2E_SCREENSHOT_PREFIX}-mobile.png` });
  await page.getByRole('button', { name: 'Opciones de campaña', exact: true }).click();
  assert.equal(await page.locator('.floating-panel').count(), 1);
  const mobilePanel = await page.locator('.floating-panel').boundingBox();
  const mobileDock = await page.locator('.campaign-dock').boundingBox();
  assert.ok(mobilePanel.y + mobilePanel.height < mobileDock.y);
  assert.equal(await page.locator('select:visible').count(), 0);
  await page.getByRole('group', { name: 'Canal de campaña', exact: true }).getByRole('button', { name: 'Demo local', exact: true }).click();
  await page.getByRole('button', { name: 'Dibujar zona', exact: true }).click();
  assert.ok(await page.getByRole('button', { name: 'Cancelar', exact: true }).isVisible());
  assert.equal(await page.locator('.floating-panel').count(), 0);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Opciones de campaña', exact: true }).click();
  await page.getByRole('group', { name: 'Canal de campaña', exact: true }).getByRole('button', { name: 'HappyRobot', exact: true }).click();
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.floating-panel').count(), 0);
  assert.equal(await page.getByRole('button', { name: 'Opciones de campaña', exact: true }).evaluate(element => element === document.activeElement), true);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('button', { name: 'Simulación del incendio', exact: true }).click();
  await page.getByRole('button', { name: 'Simular incendio dentro de 1 hora', exact: true }).click();
  assert.ok(await page.getByRole('button', { name: 'Volver al incendio inicial', exact: true }).isVisible());
  await page.getByRole('button', { name: 'Volver al incendio inicial', exact: true }).click();
  await page.getByRole('switch', { name: 'Mostrar viento en el mapa', exact: true }).click();
  assert.equal(await page.getByRole('switch', { name: 'Mostrar viento en el mapa', exact: true }).getAttribute('aria-checked'), 'true');
  const camera = await page.evaluate(() => {
    const el = document.getElementById('root');
    const root = el[Object.keys(el).find(key => key.startsWith('__reactContainer$'))].stateNode.current;
    const pending = [root];
    while (pending.length) {
      const fiber = pending.pop();
      if (fiber.type?.name === 'CommandMap') {
        let hook = fiber.memoizedState;
        while (hook) {
          const map = hook.memoizedState?.current;
          if (typeof map?.jumpTo === 'function') {
            map.stop();
            window.__testMap = map;
            return { zoom: map.getZoom(), bearing: map.getBearing(), pitch: map.getPitch(), center: map.getCenter().toArray() };
          }
          hook = hook.next;
        }
      }
      if (fiber.child) pending.push(fiber.child);
      if (fiber.sibling) pending.push(fiber.sibling);
    }
  });
  assert.ok(camera);
  const wind = page.locator('.wind-overlay');
  await page.waitForTimeout(100);
  const frameA = await wind.evaluate(canvas => canvas.toDataURL());
  await page.waitForTimeout(300);
  assert.notEqual(await wind.evaluate(canvas => canvas.toDataURL()), frameA);
  assert.equal(await wind.evaluate(canvas => getComputedStyle(canvas).pointerEvents), 'none');
  assert.ok(await wind.evaluate(canvas => canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data.some((value, index) => index % 4 === 3 && value > 0)));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForTimeout(100);
  const stillFrame = await wind.evaluate(canvas => canvas.toDataURL());
  await page.waitForTimeout(200);
  assert.equal(await wind.evaluate(canvas => canvas.toDataURL()), stillFrame);
  await page.evaluate(camera => window.__testMap.jumpTo({ ...camera, zoom: camera.zoom + 2, bearing: 75, pitch: 30 }), camera);
  await page.waitForTimeout(100);
  assert.notEqual(await wind.evaluate(canvas => canvas.toDataURL()), stillFrame);
  if (process.env.E2E_SCREENSHOT_PREFIX) await page.screenshot({ path: `${process.env.E2E_SCREENSHOT_PREFIX}-wind-zoom.png` });
  await page.evaluate(camera => window.__testMap.jumpTo(camera), camera);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.getByRole('switch', { name: 'Mostrar viento en el mapa', exact: true }).click();
  assert.equal(await wind.isVisible(), false);
  await page.getByRole('switch', { name: 'Mostrar viento en el mapa', exact: true }).click();
  await page.waitForTimeout(300);
  if (process.env.E2E_SCREENSHOT_PREFIX) await page.screenshot({ path: `${process.env.E2E_SCREENSHOT_PREFIX}-scenario.png` });
  await page.getByRole('button', { name: 'Centros y coordinación', exact: true }).click();
  assert.equal(await page.locator('.floating-panel').count(), 1);
  assert.ok(await page.getByRole('heading', { name: 'Bandeja de coordinación · 0' }).isVisible());
  await page.getByRole('button', { name: 'Cerrar panel', exact: true }).click();
  const initial = await population();
  assert.equal(initial.length, 300);
  assert.equal((await mapData('people')).features.length, 0);
  assert.equal((await mapData('recommended-contact')).features.length, 1);
  assert.equal(starts, 0);
  await page.getByRole('button', { name: 'Personas 0', exact: true }).click();
  assert.ok(await page.getByText('Todavía no hay personas localizadas', { exact: true }).isVisible());
  assert.equal(await page.locator('.people li').count(), 0);
  await page.getByRole('button', { name: 'Cerrar panel', exact: true }).click();
  await page.evaluate(() => window.__testMap.jumpTo({ center: [-5.0911, 40.2089], zoom: 14, pitch: 0, bearing: 0 }));
  await drawArea([720, 500], [820, 550]);
  await drawArea([720, 500], [800, 570]);
  assert.equal((await mapData('call-area')).features.length, 2);
  assert.equal((await mapData('people')).features.length, 0);
  await page.getByRole('button', { name: 'Añadir zona de llamadas', exact: true }).click();
  await page.keyboard.press('Escape');
  assert.equal((await mapData('call-area')).features.length, 2);
  await page.getByRole('button', { name: 'Opciones de campaña', exact: true }).click();
  assert.equal(await page.locator('.selected-areas li').count(), 2);
  assert.ok(await page.getByRole('checkbox', { name: 'Incluir zona recomendada', exact: true }).isChecked());
  await page.getByRole('checkbox', { name: 'Incluir zona recomendada', exact: true }).uncheck();
  await page.getByRole('button', { name: 'Quitar zonas manuales', exact: true }).click();
  assert.ok(await page.getByRole('button', { name: 'Enviar llamadas', exact: true }).isDisabled());
  await page.getByRole('button', { name: 'Cerrar panel', exact: true }).click();
  await page.evaluate(() => window.__testMap.jumpTo({ center: [0, 0], zoom: 12 }));
  await drawArea([720, 500], [810, 550]);
  await page.getByRole('button', { name: 'Enviar llamadas', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.campaign-dock')?.textContent.includes('No hay contactos nuevos'));
  assert.equal(starts, 0);
  await page.getByRole('button', { name: 'Opciones de campaña', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Incluir zona recomendada', exact: true }).check();
  await page.getByRole('button', { name: 'Quitar zonas manuales', exact: true }).click();
  await page.getByRole('button', { name: 'Cerrar panel', exact: true }).click();
  await page.evaluate(camera => window.__testMap.jumpTo(camera), camera);
  if (recover) {
    await page.getByRole('button', { name: 'Opciones de campaña', exact: true }).click();
    await page.getByRole('button', { name: 'Recuperar última ola del puente', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('.campaign-dock')?.textContent.includes('Conversaciones recuperadas'));
    people = (await population()).filter(citizen => citizen.hrCall).map(citizen => ({ agent: { person_id: citizen.hrCall.personId, assigned_shelter: citizen.hrCall.zoneId }, persona: { name: citizen.name } }));
  } else {
    await page.getByRole('button', { name: 'Enviar llamadas', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('.campaign-dock')?.textContent.includes('Ola enviada'));
  }
  assert.equal(people.length, 4);
  assert.equal(starts, recover ? 0 : 1);
  assert.equal(new Set(people.map(p => p.agent.person_id)).size, 4);
  if (live || recover) {
    console.log(JSON.stringify({ phase: 'live-started', contacts: people.map(person => ({ id: person.agent.person_id, name: person.persona.name, destination: person.agent.assigned_shelter })) }));
    const deadline = Date.now() + 420000;
    let current;
    let previous = '';
    while (Date.now() < deadline) {
      current = (await population()).filter(citizen => citizen.hrCall);
      const summary = JSON.stringify(current.map(citizen => ({ id: citizen.id, state: citizen.hrCall.state, messages: citizen.hrCall.transcript.length, result: citizen.hrCall.resultState, applied: Boolean(citizen.hrCall.outcomeApplied), status: citizen.status })));
      if (summary !== previous) { console.log(summary); previous = summary; }
      if (current.length === 4 && current.every(citizen => citizen.hrCall.outcomeApplied || citizen.hrCall.resultState === 'failed')) break;
      await page.waitForTimeout(2000);
    }
    await page.waitForTimeout(9000);
    current = (await population()).filter(citizen => citizen.hrCall);
    console.log(JSON.stringify({ phase: 'live-final', contacts: current.map(citizen => ({ id: citizen.id, status: citizen.status, messages: citizen.hrCall.transcript.length, applied: citizen.hrCall.outcomeApplied, consent: citizen.call?.consent, willEvacuate: citizen.hrCall.willEvacuate, mobility: citizen.mobility, reason: citizen.routeHoldReason, error: citizen.hrCall.outcomeError, runUrl: citizen.hrCall.runUrl })) }));
    assert.equal(starts, recover ? 0 : 1);
    assert.equal(current.filter(citizen => citizen.hrCall.outcomeApplied).length, 4);
    assert.ok(current.every(citizen => citizen.hrCall.runUrl && citizen.hrCall.transcript.length > 1));
    assert.deepEqual(errors, []);
  } else {
  await page.waitForTimeout(6500);
  assert.ok(polls >= 2);
  const pending = await population();
  assert.equal(pending.filter(p => p.hrCall).length, 4);
  assert.ok(pending.every((p, i) => p.lng === initial[i].lng && p.lat === initial[i].lat && !p.call));
  assert.equal((await mapData('people')).features.length, 0);
  const selected = pending.find(p => p.hrCall);
  await page.getByRole('button', { name: 'Ver actividad de campaña', exact: true }).click();
  await page.locator('.campaign-people li button').filter({ hasText: selected.name }).click();
  assert.ok(await page.getByRole('heading', { name: 'Conversación HappyRobot', exact: true }).isVisible());
  assert.ok(await page.getByText('Esperando extracción', { exact: false }).isVisible());
  assert.ok(await page.getByText('Sí, salimos y compartimos la ubicación.', { exact: false }).isVisible());
  assert.equal(await page.getByRole('heading', { name: 'Localización', exact: true }).count(), 0);
  await page.getByRole('button', { name: 'Resumen', exact: true }).click();
  assert.ok(await page.getByRole('heading', { name: 'Localización', exact: true }).isVisible());
  assert.equal(await page.getByRole('heading', { name: 'Conversación HappyRobot', exact: true }).count(), 0);
  assert.ok(await page.getByRole('button', { name: 'Rutas', exact: true }).isDisabled());
  assert.ok(await page.getByText('Ubicación pendiente de recibir', { exact: true }).isVisible());
  await page.getByRole('button', { name: 'Conversación', exact: true }).click();
  if (process.env.E2E_SCREENSHOT_PREFIX) await page.screenshot({ path: `${process.env.E2E_SCREENSHOT_PREFIX}-conversation.png` });
  await page.getByRole('button', { name: 'Pausar campaña', exact: true }).click();
  readyCount = 1;
  await page.waitForTimeout(2500);
  assert.equal((await mapData('people')).features.length, 1);
  assert.ok(await page.getByRole('button', { name: 'Personas 1', exact: true }).isVisible());
  assert.ok(await page.getByRole('button', { name: 'Rutas', exact: true }).isEnabled());
  readyCount = 4;
  await page.waitForTimeout(2500);
  assert.equal((await mapData('people')).features.length, 4);
  const confirmed = await population();
  assert.equal(confirmed.filter(p => p.hrCall?.outcomeApplied).length, 4);
  assert.ok(confirmed.every((p, i) => p.lng === initial[i].lng && p.lat === initial[i].lat));
  await page.getByRole('button', { name: 'Reanudar campaña', exact: true }).click();
  await page.waitForTimeout(8500);
  const moved = await population();
  assert.equal(moved.filter(p => p.call).length, 4);
  assert.ok(moved.some((p, i) => p.hrCall && (p.lng !== initial[i].lng || p.lat !== initial[i].lat)), JSON.stringify(moved.filter(p => p.hrCall).map(p => ({ id: p.id, status: p.status, reason: p.routeHoldReason, zone: p.hrCall.zoneId }))));
  assert.ok(moved.every((p, i) => p.hrCall || p.lng === initial[i].lng && p.lat === initial[i].lat && p.status === initial[i].status));
  await page.getByRole('button', { name: 'Pausar campaña', exact: true }).click();
  await page.getByRole('button', { name: 'Cerrar panel', exact: true }).click();
  const stopped = await population();
  const routed = stopped.find(person => person.hrCall && person.routeId && person.status === 'evacuating');
  assert.ok(routed);
  const point = await page.evaluate(person => {
    window.__testMap.jumpTo({ center: [person.lng, person.lat], zoom: 16, bearing: 0, pitch: 0 });
    const p = window.__testMap.project([person.lng, person.lat]);
    return { x: p.x, y: p.y };
  }, routed);
  await page.waitForTimeout(350);
  const requestsBeforeSelection = directionRequests;
  await page.mouse.click(point.x, point.y);
  await page.getByRole('heading', { name: routed.name, exact: true }).waitFor();
  await page.waitForTimeout(150);
  const displayedRoute = (await mapData('refuge-route')).features;
  assert.equal(displayedRoute.length, 1);
  assert.equal(directionRequests, requestsBeforeSelection);
  assert.equal(displayedRoute[0].properties.id, routed.routeId);
  assert.equal(displayedRoute[0].properties.zoneId, routed.hrCall.zoneId);
  assert.ok(displayedRoute[0].geometry.coordinates.length >= 2);
  if (process.env.E2E_SCREENSHOT_PREFIX) await page.screenshot({ path: `${process.env.E2E_SCREENSHOT_PREFIX}-assigned-route.png` });
  assert.equal(starts, 1);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ ok: true, starts, contacts: people.length, polls, applied: moved.filter(p => p.hrCall?.outcomeApplied).length, moving: moved.filter(p => p.status === 'evacuating').length, progressiveMarkers: '0 → 1 → 4', selectedRoute: displayedRoute[0].properties.id, advancedFeatures: ['recommended area', 'manual areas', 'empty selection', 'fire projection', 'wind', 'response centers'], externalRequests: 'mocked / blocked' }));
  }
} finally {
  await browser.close();
}
