# AGENTS.md — contexto para agentes de IA

Fuente de verdad para cualquier agente (Devin, Cursor, Claude Code, Codex) que trabaje en
este repositorio. Si otro archivo (`CLAUDE.md`, `.cursor/rules/*`) contradice a este, gana
este.

## 1. Qué es este proyecto

- **Equipo:** `router123`
- **Evento:** HackSpain 2026 (Madrid, UPM–ETSIT, 18–20 sept 2026, 36 h, 250 builders).
- **Track:** HappyRobot (primer track sponsor del evento).
- **Tesis de partida (aún abierta):** llevar los *AI workers* de HappyRobot —hoy desplegados
  en logística, energía, telco, seguros— al **sector público y la gestión de crisis**
  (112, protección civil, post-catástrofe tipo DANA).
- **Estado actual (19 sep, mediodía):** alcance de producto cerrado en
  `docs/06-producto/02-escenario-incendio.md` (guiado individual de evacuación en incendios
  forestales; 300 vecinos simulados con personalidad que hablan con HappyRobot por texto,
  decisión 002). Hay dos frontends (`web/dashboard`, `apps/command-center`) y dos datasets
  (Zamora, Ávila): unificarlos es la decisión 003, pendiente del equipo. La base de
  conocimiento sigue siendo obligatoria.


## 2. Cómo está organizado el repo

```
api/                 Estado de crisis (FastAPI): única fuente de verdad, decide prioridad, rutas, refugios
engine/              Motor de escenario: el incendio avanza y cambia la situación en runtime
sim/                 Simulador de evacuación: elige el plan que pierde a menos gente
data/                Dataset sintético (~120 casas / 300 personas, semilla fija) y validador
web/dashboard        Puesto de mando (MapLibre + OSM)      } dos frontends; ver docs/07-decisiones/003
apps/command-center  CECOP (Vite + React + Mapbox)         }
web/gps              Página del enlace que comparte la ubicación del vecino
prompts/             Guiones del agente de HappyRobot y guion de la demo
docs/                Base de conocimiento. OCHO carpetas, no crear más:
  00-meta/           Convenciones de escritura
  01-evento/         HackSpain y el enunciado oficial del reto (02-reto-happyrobot.md)
  02-happyrobot/     Empresa, plataforma, qué expone de verdad, API/SDK, preguntas para el stand
  03-dominio-crisis/ Emergencias en España, ES-Alert, datos de incendios, geografía, modelo de fuego, competencia
  04-regulacion/     AI Act, ENS, RGPD, LCSP, marco legal de llamar y geolocalizar
  05-investigacion/  Notas fechadas: barridos, contactos, entrevistas (YYYY-MM-DD-tema.md)
  06-producto/       Qué construimos: escenario, contrato de datos (vinculante), brief del agente
  07-decisiones/     Decisiones cerradas y propuestas abiertas (ADR ligero)
  _inbox/            Material crudo sin procesar (el mirror de docs.happyrobot.ai no se versiona)
```

Índice y ruta de lectura: [`docs/README.md`](docs/README.md).

## 2.bis Documentación oficial de HappyRobot (importante)

Hay un **mirror local completo** (389 páginas + OpenAPI) de `docs.happyrobot.ai`, que en
público requiere access code:

```
docs/_inbox/2026-09-18-happyrobot-docs-oficiales/
```

Antes de buscar en internet o de suponer cómo funciona la plataforma, **búscalo ahí**.
Empieza por `llms.txt` (índice completo). Guía de uso y páginas clave en
[`docs/02-happyrobot/00-documentacion-oficial.md`](docs/02-happyrobot/00-documentacion-oficial.md).

## 3. Reglas de trabajo sobre el conocimiento

1. **Todo hecho relevante va a `docs/`, no al chat.** Si descubres algo, escríbelo.
2. **Cita siempre la fuente.** Cada documento lleva cabecera con `actualizado` y una
   sección `## Fuentes` con URLs. Sin fuente, márcalo como `[SIN VERIFICAR]`.
3. **Separa hecho de hipótesis.** Usa `> HIPÓTESIS:` para lo que es nuestra opinión o
   suposición. Un juez, un mentor de HappyRobot o un compañero deben poder distinguirlo.
4. **No borres conocimiento, márcalo obsoleto.** Si algo cambia, tacha y anota la fecha.
5. **Material crudo → `docs/_inbox/`** con nombre descriptivo
   (`YYYY-MM-DD-origen-tema.ext`), y luego destílalo a un doc de la carpeta que toque.
6. **Fechas explícitas.** Este espacio se mueve rápido (HappyRobot levantó Serie B en
   sep-2025 y Serie C en ago-2026); cualquier cifra sin fecha envejece mal.

## 4. Convenciones

- **Idioma:** español para prosa, inglés para términos técnicos y de producto
  (workflow, carrier, dispatch, FDE...). No traducir nombres propios ni de producto.
- **Nombres de fichero:** `NN-slug-en-kebab-case.md`, numerados para orden de lectura.
- **Markdown:** encabezados con `##`, listas cortas, tablas solo cuando comparan.
- **Sin ficheros de documentación "de relleno".** Un doc nuevo solo si aporta algo que
  no cabe en uno existente.

## 5. Antes de empezar cualquier tarea

1. Lee `docs/README.md` (índice) y el doc del área que toques.
2. Comprueba `docs/07-decisiones/` para no reabrir algo ya cerrado.
3. Si la tarea depende de los materiales oficiales del track, mira primero
   `docs/_inbox/` y `docs/01-evento/`.

## 6. Cosas que aún NO sabemos (huecos a rellenar)

- [x] Enunciado oficial y criterios de evaluación: `docs/01-evento/02-reto-happyrobot.md`.
- [x] Restricción de vertical: no hay, la crisis la elegimos nosotros (mismo doc).
- [ ] Saldo de créditos, paralelismo del Loop, webhook síncrono, tool call en voz:
      `docs/02-happyrobot/05-preguntas-stand.md`. Preguntar en el stand.
- [ ] Formato y duración de la demo final, y quién juzga.
- [ ] Validación con quien ha coordinado emergencias reales:
      `docs/05-investigacion/2026-09-19-contacto-ines-galindo-csic.md`.

## 7. Viento visual del mapa — 2026-09-19

Preferencia de Mateo: partículas lentas con estelas degradadas, no flechas. El componente
`apps/command-center/src/WindOverlay.tsx` usa coordenadas geográficas reproyectadas con la
cámara y helpers en `src/wind.ts`; velocidad, longitud y densidad varían con el zoom. Mantener
el límite de partículas, movimiento reducido, pausa al ocultar la página y canvas sin capturar
clics. Es viento de demo, no meteorología real. Este cambio conserva la API FastAPI y el
circuito de llamadas de main; no incorpora la centralita Node de otros worktrees.

Verificación: `npm test && npm run lint && npm run build` en `apps/command-center` (31 tests,
0 errores de lint; aviso de bundle grande por Mapbox). Prueba de navegador con servicios
externos controlados: animación, movimiento reducido, giro/zoom/inclinación, resize móvil y
encendido/apagado correctos; sin llamadas. Fuente: petición de Mateo y pruebas locales del
2026-09-19, sobre main `2c7788a`.

## 8. Interfaz mínima sobre main — 2026-09-19

Petición de Mateo: interfaz sencilla y profesional, sin quitar operaciones. Base de esta
iteración: main `303237b`. Mantener carbón y gris azulado, iconos SVG consistentes, selector
compacto de escenario y barra de campaña de unos 72 px. Escenarios, propagación/viento,
centros, avisos/medios, personas, capas/leyenda y campaña viven en un único panel bajo demanda.
Encuadre agrupa centrar incendio/persona, ver ruta y ver todo. No volver a cajas permanentes
superpuestas ni al formulario de clave abierto por defecto. Mantener foco visible, Escape,
contraste de llamadas reales, el tablero de resultados y los bloqueados por la API.

No cambiar `api/`, `crisisApi.ts`, escenarios, dispatch ni Railway para este rediseño.
El envío de un medio desde una ficha cierra esa selección para mostrar Avisos y medios.
Verificación: 41 tests, lint y build; comprobación de navegador en 1440, 1024, 390 y 320 px,
con proveedores controlados, incluyendo envío simulado a `/calls/dispatch`, tablero, exclusiones,
capas, rutas, medios, avisos, viento, cambio de escenario y foco de teclado. No se ejecutaron
llamadas reales. El script temporal de comprobación es `/tmp/vigia-minimal-ui.mjs` en este equipo.

Preferencia posterior de Mateo (2026-09-19): los sitios sí usan los emojis solicitados:
🏥 hospitales y centros de salud, ⛺ puntos de encuentro, 🚒 parques de bomberos. Compartir
`SITE_EMOJI` de `src/response.ts` entre mapa, listas, capas y leyenda. Mantener un pequeño
indicador de exposición junto al punto de encuentro, sus nombres y las interacciones.
La navegación y el resto de controles conservan los iconos SVG.
