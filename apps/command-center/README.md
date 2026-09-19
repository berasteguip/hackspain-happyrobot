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
