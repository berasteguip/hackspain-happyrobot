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
  decisión 002). El frontend es `apps/command-center` (decisión 003); quedan dos datasets
  (Zamora, Ávila): unificarlos es la decisión 003, pendiente del equipo. La base de
  conocimiento sigue siendo obligatoria.


## 2. Cómo está organizado el repo

```
api/                 Estado de crisis (FastAPI): única fuente de verdad, decide prioridad, rutas, refugios
engine/              Motor de escenario: el incendio avanza y cambia la situación en runtime
sim/                 Simulador de evacuación: elige el plan que pierde a menos gente
data/                Dataset sintético (~120 casas / 300 personas, semilla fija) y validador
apps/command-center  CECOP, el puesto de mando (Vite + React + Mapbox) — frontend único, decisión 003
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

Ajuste de Pablo (2026-09-20): el encuadre pasa a un botón de diana en la columna de controles de
Mapbox, justo encima del zoom, con el menú saliendo del icono hacia la izquierda. La barra inferior
izquierda desaparece y con ella el mapa satélite: solo queda el estilo oscuro. La atribución de
Mapbox se muda a la esquina inferior izquierda, junto a la escala.

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

## 9. Medios en patrullaje — 2026-09-19

Petición de Mateo: dos patrullas y dos ambulancias recorren calles por escenario; pins con
punta apoyada en la posición y dibujos de vehículos, sin emojis para los medios móviles.
Los sitios conservan los emojis del apartado anterior. Posiciones y movimiento son simulados,
no GPS de servicios reales. No implementar todavía decisiones ni integración de agentes.

`units.ts` expone `createPatrolFleet`, `redirectUnit(unit, target, now, requestedBy)` y
`applyUnitPlan`. El ID y distintivo de cada unidad son estables; `mission` separa patrulla de
asignación y `revision` impide aplicar rutas antiguas tras una redirección. La ruta nueva sale
de la posición actual, nunca vuelve a la base. Los botones manuales existentes reutilizan
primero una unidad sin asignación; no hay órdenes automáticas de HappyRobot.

Los circuitos se calculan con tres tramos dirigidos de Mapbox y se reutilizan en memoria al
dar vueltas (hasta 12 consultas iniciales por escenario, consumen cuota). Máximo dos unidades
planificando simultáneamente. Pausa y pestaña oculta detienen el avance; al cambiar de escenario
se abortan consultas y se sustituyen las unidades. Sin ruta válida, estado `hold` y reintento
manual: no reintroducir el fallback recto. `fetchDrivingRoute(..., roadOnly=true)` conserva la
geometría de carretera sin conectores a edificios; llegada al acceso, no a una posición inventada.
La continuidad del circuito admite hasta 2 m de diferencia de ajuste entre extremos.

Verificación: 48 tests, lint y build; navegador con proveedores controlados para movimiento,
pausa, clic en pin, redirección, resultado tardío al cambiar de escenario, fallo sin movimiento,
reintento y móvil. Script temporal: `/tmp/vigia-patrol-ui.mjs`. Se consultó Mapbox Directions
con el token público aportado: los ocho circuitos Madrid/Gredos devolvieron geometrías válidas;
esto no valida seguridad operativa frente al incendio. Sin llamadas ni cambios en workflows.

Cambio visual posterior de Mateo: la policía pasa de pin a coche azul con volumen.
`heading` se calcula sobre la carretera con una ventana de 8 m a ambos lados para suavizar
curvas. El mapa selecciona entre 24 vistas del coche y compensa el giro de cámara; la posición
permanece sobre la ruta. Ajuste 2026-09-20: la ambulancia también se representa como vehículo
compacto visto desde arriba y gira con su `heading`; bomberos móviles conserva su pin. No usar
un emoji ni volver a implementar decisiones de agente como parte de este ajuste. 49 tests, lint y build.
Navegador verificado con `/tmp/vigia-police-car-ui.mjs`: 24 vistas, cambios de rumbo,
compensación de cámara y clic sobre el coche; proveedores externos controlados.

Experimento del enlace (Mateo, mismo día): `/track` pide teléfono con prefijo y GPS, llama a
`POST /people/register` (público, idempotente por teléfono, mete el número en la lista blanca
si `REGISTER_AUTO_ALLOW`, default true) y salta a `/?p=<id>`: el mapa arranca centrado en esa
persona y, si `localStorage.router.me` coincide, la pestaña emite `POST /positions` cada 5 s.
Con la API conectada, "Llamar de verdad" arranca marcado y el círculo hace dos cosas a la vez:
`/calls/dispatch` (reales para los registrados, bloqueados los +3460099xxxx del dataset) y la
simulación local de los vecinos demo del círculo. Quien comparte GPS es `live` y nunca se anima.
El dispatcher pone a los registrados primero para que el tope por ráfaga no los excluya.
Local: `api/.venv` (uv, Python 3.12), `uvicorn main:app --port 8000`, `api/.env` con
`SCENARIO=ucm-madrid`; Vite en 5176 proxea `/api/roster`, `/api/locations`, `/calls`,
`/positions`, `/people`, `/instructions`, `/health`, `/state`, `/gps`, `/events` a la API.
Los callbacks de HappyRobot (`/calls/started|outcome|observation`) no llegan a localhost sin
túnel (`cloudflared` instalado). Prueba de navegador: `/tmp/router-enlace-ui.mjs`.
"Mundo" anclado: el registro desde `/track` manda `anchor: true` y la API desplaza el escenario
entero (casas, vecinos sintéticos, salidas, sectores, patrullas, perímetro e historial del fuego)
para que `ANCHOR_REF` (ETSIT en ucm-madrid) caiga sobre la persona; las personas con GPS no se
mueven. `GET /api/anchor` (público) lo expone y el mapa aplica `anchorScenario()` al escenario
visual (`anchorRef` por escenario) y recrea la flota. Lugares reubicados quedan etiquetados como
ficticios en `note`/`description`. Verificado con el registrado a 5 km (Retiro): 25 demos a
<1,5 km, fuego a ~800 m, unidades en la zona. El proxy de Vite manda todo `/api` a la API.
Zonas recomendadas (`src/risk.ts`): del fuego y la previsión salen dos círculos, «zona de
riesgo» (envuelve el fuego, desplazada a favor del viento, mínimo 1 km) y «posible afectación
+60 min» (previsión de propagación). Se pintan siempre (capa `callArea`) y el dock permite
llamar a cualquiera de las dos sin dibujar; el panel de campaña las ofrece como selección.
Son recomendación del modelo de demo, no perímetro oficial. Backend: `AUTO_NOTIFY=false`
silencia las llamadas/SMS automáticos del planner (solo llama el operador); `REGISTER_ONLY_CALLS`
limita las llamadas a los registrados aunque la allowlist esté vacía; `/track` se sirve como
SPA desde FastAPI. En Railway hay que poner esas dos variables si se quiere el mismo ensayo.
Incidencia real del 19-20 sep: HappyRobot devolvía «no live development version» porque nadie
tenía la versión activa; se publicó la v7 en development desde el MCP.

## 10. Tarjeta «qué hace HappyRobot detrás» — plantilla obligatoria — 2026-09-20

Todo lo que enseñe en el CECOP qué está haciendo HappyRobot por detrás pasa por **una sola
tarjeta** (`apps/command-center/src/HappyRobotCard.tsx`): mismo cabecero con la marca, mismo pill
de estado, mismo lienzo claro. Lo único que cambia de un caso a otro es el diagrama del cuerpo y
qué lo dispara. **No se crean tarjetas nuevas ni estilos de diagrama propios.**

Antes de construir una tarjeta o un diagrama de HappyRobot, leer
[`docs/06-producto/07-tarjeta-que-hace-happyrobot.md`](docs/06-producto/07-tarjeta-que-hace-happyrobot.md):
§«Lenguaje visual» son las siete reglas de estilo (icono y una palabra, iconos de `HR_ICONS`,
aristas con flujo, cadenas para lo que se dispara detrás, un solo elemento destacado, estado del
CECOP y no inventado, `prefers-reduced-motion`) y §«Plantilla» los pasos de código.

## 11. Plan operativo — 2026-09-20

Petición posterior del equipo: el antiguo panel «Avisos y medios» pasa a «Plan operativo».
Debe responder en una sola vista a prioridad actual, señales decisivas, orden de comunicación,
cobertura de recursos, siguiente acción y vigencia. Presenta como máximo tres señales y agrupa
el resto en el detalle plegado. Las operaciones anteriores de avisos y medios siguen ahí.

El plan nace como borrador y pasa a ejecución cuando el operador inicia una campaña. Un giro
de viento, una nueva propagación relevante o un corte de ruta lo deja en revisión; el operador
adopta una revisión nueva de forma explícita. Los casos sin respuesta suben en la prioridad,
pero no invalidan por sí solos el plan completo. Este panel organiza datos y controles locales
ya existentes: no debe presentarse como un motor de decisión operativo ni ejecutar órdenes sin
acción humana.

## 12. Leyenda del mapa — 2026-09-20

**Obsoleto:** petición posterior del usuario elimina el botón y desplegable de Leyenda
sobre el mapa. No reintroducirlos. Se conserva debajo la decisión anterior como historial.

La vista principal mantiene un control compacto **Leyenda** junto a **Guía**. Al desplegarse
explica personas pendientes, colores de triaje, incendio, zona de riesgo, posible afectación a
60 minutos y vehículos. Debe seguir plegado por defecto para que el mapa conserve espacio; no
volver a esconder estas claves únicamente dentro de Capas.

Al iniciar la guía, cerrar la Leyenda y la tarjeta HappyRobot. El primer popover va a la derecha
del fuego para que no aparezca pegado a Memoria compartida.
