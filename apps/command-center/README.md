# Vigía — centro de mando

Frontend del CECOP para el caso de incendios forestales. Mapa Mapbox con focos,
zonas seguras y población en tránsito (simulada + consentimiento real).

## Flujo actual: zonas → llamadas → ubicaciones — 2026-09-19

1. Al abrir, el mapa muestra el fuego y un **contorno recomendado de contacto**, sin residentes
   precargados. Es una zona predeterminada de demo, no una predicción ni el perímetro de riesgo.
2. Se puede usar esa recomendación directamente o pulsar **Zona** para dibujar círculos adicionales.
   Son acumulativos. Escape cancela solo el dibujo actual. En ajustes se pueden quitar zonas
   manuales o desmarcar la recomendación.
3. **Enviar llamadas** simula la consulta censal de los pueblos incluidos y selecciona hasta cuatro
   contactos sintéticos para HappyRobot. Una selección sin contactos no dispara otra zona como fallback.
   No se implementa ni se va a implementar búsqueda real en censos, archivos o teléfonos.
4. Las personas aparecen en el mapa y en Personas al recibirse su ubicación de demo tras
   consentimiento. Antes no se muestran coordenadas en las fichas ni referencias residenciales.
   Compartir ubicación no implica que puedan moverse: también aparecen quienes necesitan asistencia.
5. Al pinchar un punto, se dibuja automáticamente **la ruta ya asignada al destino comunicado**,
   sin consultar de nuevo Directions. Sin ruta admisible no se inventa una línea. La comparación
   manual de Rutas es una vista previa explícita y no cambia la asignación.

La inclusión de pueblos se aproxima por su centro de referencia dentro del contorno/círculos,
no por un límite municipal o un censo real. Los contactos y sus posiciones proceden del escenario.
La posición de demo no es un GPS ni una geocodificación de lo declarado. Los pings voluntarios
reales conservan su origen y nunca reciben movimiento simulado.

Esta revisión sustituye el botón de inicio directo a cuatro contactos y la población visible
al abrir descritos en los apartados históricos siguientes. Se mantienen chats, cuota, pausa,
recuperación, transcripciones y modos HappyRobot/local.

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

## Mapa avanzado conectado a HappyRobot — 2026-09-19

La integración parte de `main` en `f2a3214` y conserva selección por círculo, viento,
propagación temporal, centros y comparación de rutas. Recupera la centralita de `ade0f90`.

En otra terminal:

```bash
cd sim/centralita
npm ci
npm run bridge
```

El puente lee el `.env` de la raíz: `HR_API_KEY`, `HR_WF_VIGIA_CHAT` y
`HR_WF_VECINO_SIMULADO`; `BRIDGE_API_KEY` protege los callbacks. No poner la API key
HappyRobot en variables `VITE_*`. Se puede reutilizar otro archivo sin copiarlo mediante
`BRIDGE_ENV_FILE=/ruta/al/.env`. Variables del proceso prevalecen sobre las del archivo.

- El frontend usa `/bridge` mediante proxy de Vite hacia `127.0.0.1:8787`.
  Se puede cambiar el destino con `BRIDGE_TARGET` al arrancar Vite.
- `Iniciar simulación · 4 chats HappyRobot` selecciona hasta cuatro contactos pendientes
  de Guisando. También se puede dibujar un círculo y lanzar hasta cuatro de su selección.
- Primero se consultan rutas y plazas de demo; el destino validado viaja en `say_this`.
  Sin ruta se comunica asistencia pendiente, no se inventa un destino.
- Cada contacto abre dos chats reales en HappyRobot (agente y vecino sintético).
  **Una ola de cuatro consume ocho runs y créditos. No envía llamadas ni SMS.**
- «Recuperar última ola del puente» restaura conversaciones existentes sin abrir chats nuevos;
  el movimiento queda en pausa. Sirve también para releer resultados tardíos tras un fallo.
- La ficha muestra transcripción, estado de extracción, resultado y enlace al run.
  Un chat `done` sigue pendiente hasta que llega el outcome; no hay fallback de respuesta ficticia.
- Solo se anima a quien confirma salida, consentimiento y movilidad autónoma, sin necesidades
  de apoyo pendientes, con ruta y plazas para todo el grupo. Se revalida el destino comunicado,
  nunca se cambia en silencio. La posición sigue siendo sintética, no GPS.
- Pausa congela el movimiento y aborta rutas, pero los chats continúan y sus resultados se reciben.
- La opción `Demo local · selección completa` conserva la campaña local del mapa avanzado;
  no llama a HappyRobot ni sustituye los fallos de una conversación real.
- Sin túnel, el puente recupera Extract mediante la API de HappyRobot. El run puede figurar
  fallido por su webhook aun cuando agente y Extract hayan terminado correctamente.
- Los servicios son de desarrollo y guardan estado en memoria. El proxy no existe en el build
  estático; para desplegarlo hace falta configurar servidor y reverse proxy.

Verificación sin proveedores: `npm test && npm run build && npm run lint` aquí;
`npm test` en `sim/centralita`. La prueba `npm run test:e2e` allí usa Chrome instalado,
frontend en `127.0.0.1:5174` (o `E2E_BASE_URL`) y bloquea/simula las peticiones externas.
**Solo con autorización explícita**, `E2E_LIVE_HR=1 npm run test:e2e` inicia cuatro chats
reales desde el mapa; Mapbox sigue controlado y no verifica credenciales de Directions.

Para ejecutar ambas versiones simultáneamente, usar `BRIDGE_PORT=8788` en el puente,
`BRIDGE_TARGET=http://127.0.0.1:8788 npm run dev -- --host 127.0.0.1 --port 5174 --strictPort`
en este frontend, y `PUBLIC_BASE_URL=http://127.0.0.1:5174` para los enlaces de demo.

## Controles de la interfaz mínima — 2026-09-19

- Barra inferior: **Iniciar / Pausar / Reanudar**. Por defecto, HappyRobot y cuatro contactos
  de Guisando; se conserva la indicación de consumo de créditos.
- Icono de ajustes junto a Iniciar: **Campaña**, con canal HappyRobot/local, selección de zona,
  actividad, recuperación de la última ola y reintentos. También se abre pulsando el resumen.
- **Escenario**: mostrar viento y comparar Ahora / Dentro de 1 h. Sin área amarilla dibujada.
- **Personas**: buscar y abrir una ficha. Pestañas Resumen / Conversación / Rutas.
- **Centros**: recursos del escenario y avisos de demo. **Capas**: visibilidad, leyenda y FIRMS.
- Un panel abierto a la vez; Escape lo cierra y devuelve el foco al control de origen.

Esta disposición sustituye las tarjetas permanentes de campaña y viento descritas antes.
No cambia los endpoints ni inicia conversaciones al abrir paneles. La prueba de navegador
comprueba escritorio y móvil; `E2E_SCREENSHOT_PREFIX` permite guardar capturas de test.

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
