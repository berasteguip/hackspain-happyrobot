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

## Simulación de grupos

Las llamadas son simuladas: no se contacta con HappyRobot ni se envían SMS reales.
Play inicia un reloj de demostración ×20. Tras la llamada se confirma el grupo,
se consulta un recorrido, se reservan plazas y se espera la preparación antes de
mover el representante. Cada punto puede representar varias personas.

Los puntos de encuentro son La Dehesa y El Risquillo (Guisando), y Jesús Navarro
(Arenas). Son candidatos ficticios para la demo, no refugios oficiales activados.
Se pueden seleccionar en el mapa o desde Capas; sus aforos y servicios son supuestos.

El mismo token del mapa se usa para Mapbox Directions al iniciar la simulación:
**consume cuota**. Se consultan recorridos a pie o en vehículo, con caché y un
límite de cuatro peticiones por segundo. Se rechazan rutas que atraviesen la huella
simulada y accesos de más de 40 m desde la posición aproximada. Si Directions no
está disponible, no hay ruta admisible o el grupo necesita recogida, permanece
pendiente de asistencia. No existe una ruta recta de sustitución.

Pausa congela el reloj y cancela las consultas pendientes. Los GPS reales nunca
son desplazados por el simulador ni contabilizados como llegadas de demostración.

## Verificación

Con Node.js 24, desde este directorio:

```bash
npm test
npm run build
npm run lint
```

Los tests de rutas simulan las respuestas del proveedor; no necesitan tokens.
Consulta el detalle y las fuentes en `../../docs/06-producto/01-vigia.md`.
