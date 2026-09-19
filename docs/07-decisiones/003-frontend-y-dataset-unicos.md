# 003 — Un solo frontend y un solo dataset (hoy hay dos de cada)

> **Fecha:** 2026-09-19 · **Estado:** propuesta (pendiente de decidir en equipo)

## Contexto

Al juntar `main` (Vigía, de Mateo) con `context/reto-happyrobot` (Luis) el 19 sep a las
02:00 quedaron en el repo dos construcciones de la misma idea que no se conocían:

| | Vigía (`main`) | Escenario incendio (rama) |
| --- | --- | --- |
| Frontend | `frontend/command-center` (Vite + React + Mapbox, pide token) | `frontend/dashboard` (MapLibre + OSM, sin token) |
| Dataset | Arenas de San Pedro, Guisando, El Hornillo, El Arenal (Ávila) | Sierra de la Culebra: Ferreras, Villardeciervos, Losacio (Zamora), `backend/data/` |
| Backend | simulación en el propio frontend + POST local | `backend/api/` (estado de crisis), `backend/engine/` (escenario), `backend/sim/` (simulador) |
| Doc | `06-producto/01-vigia.md` | `06-producto/02-escenario-incendio.md` + `03-contrato-de-datos.md` |

Solo chocan 3 ficheros en git; el choque es de concepto y de duplicidad. Con 24 horas por
delante, mantener dos frontends y dos datasets es tirar la mitad del equipo.

## Propuesta

- **Frontend:** `frontend/command-center` como cara (ya cumple la decisión 001) consumiendo
  `backend/api/` como cerebro (`GET /state`, `/diff`, `/houses/no-answer`, `POST /human/approve`).
  `frontend/dashboard` se queda como referencia de qué pintar y se marca obsoleto cuando el
  command-center cubra lo mismo. `frontend/gps` (página del vecino) sigue.
- **Dataset:** Zamora. Motivo: `backend/data/generate.py` ya genera 300 personas sobre edificios
  reales con semilla, hay geografía verificada
  ([`../03-dominio-crisis/05-geografia-sierra-culebra.md`](../03-dominio-crisis/05-geografia-sierra-culebra.md))
  y datos de víctimas de 2022 para el pitch
  ([`../03-dominio-crisis/04-incendios-datos-victimas.md`](../03-dominio-crisis/04-incendios-datos-victimas.md)).
  Ávila vale igual si el equipo prefiere; lo que no vale es tener los dos.

## Alternativas

- Seguir cada uno en su rama y elegir el domingo: descartado, no hay tiempo para tirar uno.
- Mapbox vs MapLibre reabierto: no. La 001 ya lo cerró; lo que hay que unificar es la lógica.

## Consecuencias si se acepta

- El contrato de datos ([`../06-producto/03-contrato-de-datos.md`](../06-producto/03-contrato-de-datos.md))
  pasa a ser vinculante también para `frontend/command-center`.
- `scenario.ts`, `simulation.ts` y `routing.ts` del command-center se reemplazan o se
  alimentan de `backend/api/` en vez de calcular por su cuenta.
- El `README.md` raíz deja de anunciar dos arranques.
