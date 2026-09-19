# frontend/video: el vídeo del pitch (Remotion)

Motion design del flujo completo, alimentado con el dataset real de
`backend/data/scenarios/sierra-culebra.json`: casas, personas, refugios, fuego,
patrullas. Nada de lo que se dibuja es un mockup inventado; son los datos del
sistema proyectados a pantalla.

## Arranque

```bash
cd frontend/video
npm install
npm run dev        # Remotion Studio en el navegador: cada escena es una composición
npm run render     # out/video.mp4 (1920x1080, 30 fps)
```

Desde la raíz: `make video` (render) y `make video-studio` (studio).

## Dónde se toca cada cosa

| Quiero cambiar... | Fichero |
| --- | --- |
| Orden, duración o texto de las escenas y las líneas de voz | `src/script.ts` (el guion son datos) |
| Colores, tipografía, fps | `src/lib/theme.ts` |
| Qué datos entran (proyección, casa protagonista, escala m/px) | `scripts/build-data.mjs` (genera `src/data/scene.json`, no versionado) |
| Una escena concreta | `src/scenes/S1..S8*.tsx` |
| Mapa (fuego, cono, casas, rutas, refugios) | `src/components/CrisisMap.tsx` |
| Móvil, UI de HappyRobot, HUD, decision log | `src/components/PhoneMock.tsx`, `HappyRobotUI.tsx` |

## Las 8 escenas (1:55)

1. `cold-open` (9 s): mapa en línea fina, el fuego aparece, "Ve el fuego. No ve a la gente."
2. `the-call` (10 s): zoom a una casa, suena el móvil, tarjeta de HappyRobot con el agente escribiendo.
3. `scale` (12 s): la tarjeta se multiplica por 120, las casas se encienden, contadores.
4. `one-house` (18 s): conversación + Extract rellenándose; el punto se convierte en grupo de 3 a 2,5 km/h.
5. `route` (20 s): compartir ubicación; 4 puntos de encuentro por tiempo; el cercano cruza el frente, se descarta; ruta a Tábara con convoy.
6. `village` (18 s): todos en movimiento, refugios llenándose, gira el viento, 12 rutas en rojo se rehacen.
7. `no-answer` (18 s): tres casas sin respuesta, lista de patrulla con la casa a la que no ir, SMS redactado, aprobación humana, prioridad aérea.
8. `close` (10 s): contadores finales y cierre.

## Audio (pendiente)

Una pista por línea de voz de `src/script.ts`, en `public/audio/<line.id>.mp3`
(dos voces de ElevenLabs: `agent` con filtro de teléfono, `system` limpia; `neighbor`
una tercera). Mientras no existan, las líneas salen como subtítulos
(`src/components/Narration.tsx`). Al añadirlas, `Narration` pone un `<Audio>` por línea
en su offset.

## Pendiente para que sea "de verdad"

- Rutas: hoy son curvas (`curvedRoute`), sustituir por las polilíneas OSRM que devuelve
  `backend/api` en `assigned_route`.
- Fondo del mapa: hoy es abstracto; opción de meter una captura estática de MapLibre
  del mismo encuadre (bbox en `scene.json`) debajo de la capa SVG.
- Tiempos de la escena 7 (frente/ETA) son narrativos; leerlos de la API cuando exista
  `GET /houses/no-answer`.
