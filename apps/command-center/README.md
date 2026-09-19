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
