# Vigía — centro de mando

Frontend del CECOP para el caso de incendios forestales. Mapa Mapbox con focos,
zonas seguras y población en tránsito (simulada + consentimiento real).

## Arranque

1. Crea un token público en https://account.mapbox.com/access-tokens/
2. Opcional: copia `.env.example` a `.env` y pon `VITE_MAPBOX_TOKEN=pk....`
3. Si no hay `.env`, la app pide el token al abrir y lo guarda en el navegador.

```bash
cd apps/command-center
npm install
npm run dev
```

- Centro de mando: http://localhost:5173
- Página de consentimiento del ciudadano: http://localhost:5173/track
- Reutilizar un id del escenario: http://localhost:5173/track?id=c-01

**Si el mapa sale en negro y se queda en «Cargando cartografía…»**: Mapbox guarda los teselados
en el Cache Storage del navegador (`mapbox-tiles`) y esa caché se corrompe de vez en cuando; no
hay petición fallida que lo delate. Se arregla vaciándola desde la consola y recargando:
`await caches.delete('mapbox-tiles')`. Visto el 2026-09-20 sobre el código sin tocar.

## Qué hay ahora

- Escenario de incendio en Sierra de Gredos (valle del Tiétar, Ávila).
- Protocolo de aviso: 4 agentes HappyRobot llaman en oleada, asignan zona segura
  y piden consentimiento de ubicación.
- Puntos de calor del escenario + capa opcional NASA FIRMS (Europa 24 h, filtrada
  a España) vía proxy de Vite.
- `/api/locations` en el servidor de desarrollo para pintar un ciudadano real
  que consiente desde `/track`.

## Seguimiento de ubicación desde un móvil real

Para que alguien comparta su ubicación desde el móvil no basta con `npm run dev`:
**la Geolocation API del navegador solo funciona en un contexto seguro (HTTPS)**.
`localhost` es la excepción, pero una IP de la red local abierta desde el móvil no
lo es. Hace falta exponer el dev server por un túnel con HTTPS.

### 1. Levanta el servidor

```bash
cd apps/command-center && npm install && npm run dev
```

### 2. Abre un túnel (otra terminal)

```bash
cloudflared tunnel --url http://localhost:5173
```

Usa `localhost`, no `127.0.0.1`: Vite escucha solo en `[::1]`.

`vite.config.ts` ya declara `allowedHosts` para los dominios de túnel
(`trycloudflare.com`, `ngrok`, `loca.lt`). Sin eso Vite responde
**"Blocked request. This host is not allowed"** al abrir el enlace.

> **En la wifi de la UPM (sede de HackSpain) esto falla.** Sus DNS
> (`138.100.3.143`, `138.100.4.4`, `138.100.4.8`) no resuelven
> `api.trycloudflare.com`, `serveo.net`, `bore.pub` ni `devtunnels.ms`, y bloquean
> el puerto 53 hacia fuera, así que tampoco puedes cambiar de resolver.
> Comprobado el 2026-09-19. Salidas, de mejor a peor:
> 1. **Hotspot del móvil** — el portátil sale por datos y `cloudflared` funciona.
> 2. **localtunnel**, que sí resuelve: `npx localtunnel --port 5173`. Muestra una
>    página intersticial pidiendo tu IP pública; vale para probar, no para enseñar.
> 3. Fijar el endpoint bloqueado en `/etc/hosts`. `region1.v2.argotunnel.com` —el
>    edge real— sí resuelve, así que solo falta el de aprovisionamiento. Fija una
>    IP de Cloudflare que puede rotar.

### 3. Reparte el enlace

El túnel da una URL tipo `https://algo-random.trycloudflare.com`. El enlace que va
en el SMS es esa URL más la ruta del ciudadano, con su identificador:

```
https://algo-random.trycloudflare.com/track?id=persona-001
```

La raíz (`/`) es el CECOP, la vista del mando: ahí **no hay** ningún control para
compartir ubicación. El botón de consentimiento está en `/track`.

Un `id` que no existe en el escenario crea una persona nueva en el mapa con estado
`tracking`. Para encontrarla: panel **Personas** → buscar el id → clic, y el mapa
vuela hasta ella.

> ⚠️ `/track` trae preseleccionado el modo **demo**, que publica una posición
> simulada junto a Arenas de San Pedro con `source: 'simulation'`. Si consientes sin
> cambiar a "Usar mi GPS real", aparece un punto en el mapa que **no** es tu GPS.
> Que se pinte el punto no prueba que la ubicación real funcione: comprueba que el
> origen sea `gps` al seleccionar a la persona.

### Límites de este montaje

Es un entorno de demostración, no un servicio de seguimiento:

- **`/api/locations` solo existe en `npm run dev`.** Es un middleware dentro de
  `vite.config.ts`, así que desaparece en `vite build`. Cualquier despliegue a la
  nube tiene que portarlo antes a una función de servidor con almacenamiento real.
- **Sin autenticación.** El `id` es el que venga en la URL y el endpoint acepta
  cualquiera: quien tenga el enlace puede sobrescribir la posición de cualquier id.
- **En memoria.** Las posiciones se pierden al reiniciar el servidor.
- **La URL del túnel cambia en cada arranque**, así que hay que regenerar los
  enlaces. Para una URL fija hacen falta cuenta de Cloudflare y un named tunnel.
- **No es seguimiento en segundo plano.** `watchPosition` solo actualiza con la
  página abierta y en primer plano; si se bloquea el móvil, dejan de llegar
  posiciones. Es "ubicación mientras la página esté abierta".

## Selectores para grabar recorridos (`data-demo`)

Todo control interactivo lleva `data-demo="<nombre>"`, estable frente a cambios de
clase, de estado y de texto. Las clases **no** sirven como selector: muchas son de
estado (`className={panel === 'cop' ? 'active' : ''}`) y cambian al pulsar.

Los elementos de lista añaden `data-demo-id` con el identificador de dominio:

```
[data-demo="person"][data-demo-id="c-01"]
[data-demo="dispatch-person"][data-demo-id="ambulance"]
```

| Zona | Selectores |
|---|---|
| Token | `token-input` · `token-submit` · `token-help` |
| Ciudadano (`/track`) | `citizen-name` · `citizen-mode`+id (`demo`/`gps`) · `citizen-consent` · `citizen-stop` |
| Mapa | `map` (contenedor) · `framing-menu` (botón de diana sobre el zoom; el menú sale hacia la izquierda) · `framing-fire` · `framing-person` · `framing-route` · `framing-all` · `map-error-dismiss` |
| Barra de herramientas | `incident-trigger` · `tool-area` · `tool-fire` · `tool-centers` · `tool-alerts` · `tool-people` · `tool-layers` · `tool-happyrobot` |
| Panel | `panel` (contenedor) · `panel-close` · `scenario`+id |
| Tarjeta HappyRobot | `hr-card` (contenedor) · `hr-collapse` · `hr-close` · `hr-loop-step`+id (paradas del bucle) · `hr-call-node`+id (nodos de la anatomía de la llamada) · `hr-node`+id (solo los nodos pulsables) |
| Propagación | `fire-play` · `fire-wind-shift` · `fire-reset` · `fire-wind-toggle` · `fire-zone`+id |
| Rutas | `route-profile`+id (`driving`/`walking`) · `route-compare` · `route-option`+id |
| Centros | `center-filter`+id · `center`+id · `center-source` · `notice-sector` · `notice-message` · `notice-create` · `notice-advance`+id |
| Avisos | `alert-toast`+id · `alert`+id · `alert-action`+id · `unit`+id |
| Envío de medios | `dispatch-person` · `dispatch-alert` · `dispatch-area`, todos +id (`ambulance`/`police`/`fire`) |
| Personas | `people-search` · `people-filter`+id · `person`+id · `people-clear` · `person-back` · `person-log` |
| Capas | `layer-toggle`+id · `firms-details` · `firms-toggle` |
| Campaña (dock) | `campaign-settings` · `campaign-summary` · `campaign-pause` · `campaign-cancel` · `campaign-primary` |
| Campaña (panel) | `campaign-live` · `campaign-operator-key` · `campaign-force-recall` · `campaign-launch` · `campaign-clear` · `campaign-pause-panel` · `campaign-preset-area` · `campaign-retry-routes` · `call`+id · `call-skipped` · `call-skipped-person`+id |

### Puntos clicables sobre el mapa

`data-demo="map"` es solo el contenedor: dentro es un `<canvas>` y **no hay un nodo
por marcador**. Personas, fuego, rutas y centros son capas WebGL, y los clics se
resuelven por coordenadas (`queryRenderedFeatures`).

La excepción son los pocos puntos declarados en `src/demo-points.ts`, que reciben
además un marcador DOM real encima del canvas:

| Selector | Cuántos |
|---|---|
| `meeting-point`+id | los puntos de encuentro del escenario activo (3) |
| `center-marker`+id | los centros de respuesta (3) |
| `person-marker`+id | la persona seleccionada, más los ids de `DEMO_PEOPLE` |

Nombres distintos a propósito: el panel lateral ya usa `center` y `person`, y un
guion que buscase `[data-demo="person"]` encontraría dos elementos.

Pulsar el marcador hace exactamente lo mismo que pulsar el símbolo del canvas
(mismo popup, mismos manejadores). Dos cosas que conviene saber: el marcador es un
círculo transparente de 26 px, así que **no se puede arrastrar el mapa empezando
justo encima de uno** de esos seis sitios; y las ~300 personas no se marcan en
bloque a propósito — para llegar a cualquiera está `[data-demo="person"]` en el
panel, que hace volar el mapa hasta ella.

Comprobación rápida con la app abierta (consola del navegador):

```js
document.querySelectorAll('[data-demo="meeting-point"], [data-demo$="-marker"]').length
// 6 sin nadie seleccionado · 7 con una persona seleccionada
```
