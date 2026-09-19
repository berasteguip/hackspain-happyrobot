# Pipeline de evacuación — arquitectura objetivo y estado real

> **Actualizado:** 2026-09-19 · **Estado:** vivo · **Fuente de la arquitectura:** documento "Pipeline de
> evacuación" del equipo (sesión del 19 sep), transcrito en §1. El contraste con el código (§2) lo hice
> revisando `main`, `devin/vigia-grupos-puntos-encuentro`, `context/reto-happyrobot` y la organización
> de HappyRobot vía MCP el 19 sep.

## 1. Arquitectura objetivo (la "biblia")

Cinco capas y dos bucles de realimentación. Sin los bucles el sistema responde una vez y se queda quieto
mientras el incendio avanza.

```
01 Operador      polígono de riesgo · refugios + aforo · frente del fuego
02 Orquestación  intersecta censo · ordena prioridad · lanza N agentes      → cola priorizada
03 Agentes ×N    llamada de voz · enlace de ubicación · JSON por persona    → coords + confianza
04 Capa geo      rutas alternativas · filtro vs polígono · refugio con hueco → ruta + ETA
05 Estado · mapa world state · confianza por punto · repinta en vivo
                 sin ruta segura → rescate físico prioritario (escala a bomberos, no se emite ruta)

Bucle ámbar: el frente avanza → revalida rutas activas → rellama solo a los afectados.
Bucle azul:  vecino reportado en una llamada → nueva llamada, prioridad alta.
```

### Contratos entre capas

```
02 → 03  { person_id, phone, priority, assigned_shelter, known_context }
03 → 05  { declared_location, will_evacuate, casualty, mobility, vulnerable_people,
           neighbor_mention[], location_coords, location_confidence }
05 → 04  in  { origin_coords, shelter_id, risk_polygon }
         out { polyline, eta_min, no_safe_route }
```

### Principios

- **La capa geo no es una llamada a Directions.** Directions da la más rápida, no la más segura; `avoid` no
  acepta polígonos. `alternatives=true` → decodificar → intersectar con el polígono → descartar → min(ETA).
  Si las tres cruzan, **no se emite ruta** y la persona pasa a rescate físico. Enseñar ese caso vale más
  que diez rutas correctas.
- **El refugio más cercano es la respuesta incorrecta.** Greedy por prioridad con aforo que se decrementa.
- **Cuatro ejes del track sin cubrir** por lo construido hasta la sesión: cola priorizada, filtro de ruta
  contra polígono, aforo por refugio, revalidación de rutas activas.
- **Posicionamiento:** no es un simulador de crisis; es una plataforma que coordina la evacuación. La
  simulación existe para demostrar que aguanta un pueblo entero. El guion del vídeo lo respeta.

## 2. Estado real por capa (19 sep, noche)

| Capa | Hecho | Falta |
|---|---|---|
| 01 Operador | Ambos mapas pintan polígono, refugios, frente. `engine/` mueve el frente con `POST /events/fire`. | **Dibujar/mover el polígono desde el mapa** y que dispare `/events/fire`. Un solo escenario: hoy `api/engine/sim` usan Sierra de la Culebra (Zamora) y el mapa Mapbox usa Gredos/Tiétar. |
| 02 Orquestación | `api/priority.py` (fórmula con desglose), `GET /queue`, `notify.py` con fan-out a `HR_WORKFLOW_WEBHOOK` e interruptor `ALLOW_REAL_CALLS`. | El webhook de destino no existe en HappyRobot. Probar la oleada completa. |
| 03 Agentes | Workflow `Triaje incendios — MVP` (v2 borrador): prompt sólido, extractor de señales. Workflow `test` (live): agente de evacuación antiguo, ordena evacuar (contradice Triaje). | Trigger webhook con el contrato 02→03; tools `get_instructions` y `send_gps_link`; extracción del contrato 03→05 (`mobility`, `vulnerable_people`, `neighbor_mention[]`, `will_evacuate`, coords); `Webhook POST /calls/outcome`. **Sin número de teléfono ni SIP trunk**: no hay llamadas reales posibles. Deprecar `test`. |
| 04 Capa geo | `api/routing.py`: Valhalla `exclude_polygons`, `path_intersects_polygon`, cadena de proveedores. `assign_exits` greedy con aforo proyectado por núcleo. Mapa Mapbox: filtro contra la huella y aforo por grupo en cliente (`src/routing.ts`, `src/simulation.ts`, 12 tests). | La cadena de `api/` termina en `StraightProvider` "que nunca falla" y marca `crosses_avoid` en lugar de `no_safe_route`: **incumple el principio**. Valhalla necesita servidor local con tiles; no está montado. Alternativa: Directions `alternatives=true` + filtro en `api/`. |
| 05 Estado/mapa | `api/state.py` + `decision_log` + `state_version` + long-poll. `web/dashboard` (Leaflet) lo consume. | El mapa Mapbox no consume `api/` (estado propio en el navegador). Elegir frontend o conectar ambos. |
| Bucle ámbar | `/events/fire` recalcula solo rutas que cruzan; `notify` puede rellamar. | Nunca probado end-to-end; sin operador que mueva el polígono. |
| Bucle azul | `_absorb_neighbors` en `/calls/outcome` crea casa+persona y la encola. | Sin agente que lo alimente. |
| Infra | `Makefile`, `.env.example`, tests por componente. | Túnel público (`cloudflared`) para que HappyRobot alcance `api/` y `/track` con HTTPS. Python 3.12 + `uv` en cada Mac. |

## 3. Decisiones pendientes que bloquean el montaje

1. **Escenario y frontend oficiales**: Gredos + Mapbox, Culebra + Leaflet, o Gredos con ambos mapas
   contra la misma `api/`.
2. **Proveedor de rutas**: Mapbox Directions + filtro en `api/` (cuota del token, sin infraestructura) o
   Valhalla local (sin cuota, una dependencia más el día de la demo).
3. **Quién toca HappyRobot**: nuevo workflow `llamada-onboarding` en borrador, o fork de `Triaje` v2.
   En cualquier caso: nada publicado ni llamadas reales sin acuerdo, y falta pedir número/SIP a los mentores.

## 4. Orden de montaje propuesto (una vez decidido §3)

1. Unificar escenario y conectar el mapa elegido a `GET /state` (long-poll por `state_version`).
2. `no_safe_route` real en `api/routing.py` + proveedor de rutas elegido.
3. Dibujo/arrastre del polígono en el mapa → `POST /events/fire` → ver el bucle ámbar en vivo.
4. Workflow HappyRobot con trigger webhook, tools, extracción y `POST /calls/outcome`; túnel público.
5. Oleada con `engine/` + `sim/` (300 vecinos simulados, unas pocas llamadas reales) y ensayo del guion.

## Fuentes

- Documento interno "Pipeline de evacuación" (sesión del equipo, 19 sep 2026).
- `docs/contrato-de-datos.md`, `prompts/06-workflows-happyrobot.md`, `api/`, `engine/`, `sim/` en la rama
  `context/reto-happyrobot`.
- Organización HappyRobot `hackspainteam11`, consultada por MCP el 19 sep 2026 (solo lectura).
