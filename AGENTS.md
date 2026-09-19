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
- **Estado actual (2026-09-19):** hay un frontend del CECOP en `apps/command-center` y una
  tesis de producto (Vigía) en `docs/06-producto/01-vigia.md`. La base de conocimiento
  sigue siendo obligatoria. El estado detallado del código está en la sección 7.


## 2. Cómo está organizado el repo

```
apps/command-center  Frontend del CECOP (Vite + React + Mapbox)
docs/
  00-meta/           Convenciones de escritura y de la base de conocimiento
  01-evento/         HackSpain: formato, track, reglas, criterios, timeline
  02-happyrobot/     La empresa y la plataforma (qué hace, cómo, con quién)
  03-dominio-crisis/ Gestión de emergencias en España y encaje de HappyRobot
  04-regulacion/     AI Act, ENS, RGPD, LCSP — lo que condiciona vender a lo público
  05-investigacion/  Notas de research fechadas, con fuentes
  06-producto/       Problema, usuario, propuesta de valor, guion de demo
  07-decisiones/     Decisiones tomadas (formato ADR ligero)
  _inbox/            Material crudo sin procesar (PDFs, dumps del track, capturas)
```

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

- [ ] Enunciado oficial y criterios de evaluación del track de HappyRobot.
- [ ] Qué acceso concreto nos dan a la plataforma (API key, entorno, límites, créditos).
- [ ] Si hay restricción de vertical o es tema libre.
- [ ] Formato y duración de la demo final, y quién juzga.
- [ ] Cómo se unifican las dos líneas de trabajo del código (ver 7.1).

## 7. Estado del código y del producto (actualizado 2026-09-19)

Léelo entero antes de tocar `apps/command-center`. Resume decisiones ya tomadas con el
equipo; no las reabras sin hablarlo. La arquitectura objetivo (cinco capas, dos bucles,
contratos) y el hueco entre ella y el código está en
[`docs/06-producto/02-pipeline-evacuacion.md`](docs/06-producto/02-pipeline-evacuacion.md).

### 7.1 Ramas

| Rama | Qué contiene |
| --- | --- |
| `main` | Mapa minimalista validado (`f8077bb`) + un commit posterior (`a0c18c0`, "more updates") con otra versión de rutas/movimiento **no revisada por el equipo**. Ese commit reintroduce recta directa si falla la API y escala/recoloca el fuego; contradice las reglas de 7.4. |
| `devin/vigia-grupos-puntos-encuentro` | **Última versión validada** de Vigía: grupos, puntos de encuentro, rutas Mapbox Directions, simulación con pausa, 12 tests. Parte de `f8077bb`, no incluye `a0c18c0`. |
| `devin/vigia-mapa-minimalista` | Histórica, ya integrada en `main`. |
| `context/reto-happyrobot` | Línea paralela con `api/` (Python, FastAPI), `engine/`, `sim/`, `data/`, `web/dashboard` (MapLibre) y docs de contrato de datos, enunciado oficial y brief del agente. Su `README.md` describe una arquitectura más amplia (300 vecinos simulados con personalidad, convoyes, patrullas). Tiene dos frontends; unificar es decisión pendiente. |

Al integrar ramas: **no hacer force-push**, no sobrescribir el diseño del mapa validado y
comprobar `npm test && npm run build && npm run lint` en `apps/command-center`.

### 7.2 Qué hace Vigía hoy (`apps/command-center`)

Idea central: **un punto del mapa es un grupo con un representante**, la persona que cogió
el teléfono. El agente de HappyRobot llama a la población de la zona (objetivo de demo: 300
contactos), confirma ubicación y composición del grupo (adultos, menores, mayores,
movilidad) y comunica un punto de encuentro. El mando ve cómo el mapa pasa de "300
residentes potencialmente afectados" a "sabemos qué tenemos de cada grupo, quién necesita
asistencia y quién sigue sin contestar".

Flujo al pulsar Play (reloj de demo ×20):

```
pendiente → llamando → contestada (o sin respuesta / informado / rechaza)
  → confirma grupo y ubicación → consulta de ruta → punto asignado (plazas reservadas
  para todo el grupo) → preparación → en camino por la ruta → llegada
  Si pide recogida, no hay ruta admisible o no hay plazas → "pendiente de asistencia"
  (no se mueve).
```

Escenario: incendio simulado en el valle del Tiétar (Ávila), frente a ~220 m del NO de
Guisando. 300 contactos sintéticos: 156 Arenas de San Pedro, 48 Guisando, 36 El Hornillo,
48 El Arenal, 12 fuera de los núcleos. Puntos de encuentro de demo (ubicaciones publicadas
por los ayuntamientos; aforos y servicios **ficticios**, no refugios oficiales):
PE-01 La Dehesa (100 plazas) y PE-02 El Risquillo (90) en Guisando, PE-03 polideportivo
Jesús Navarro (650) en Arenas. Fuentes en `docs/06-producto/01-vigia.md`.

Ficheros clave: `src/scenario.ts` (datos y geometría del fuego), `src/simulation.ts`
(máquina de estados), `src/routing.ts` (Mapbox Directions, caché, 4 req/s, comprobación
contra el fuego), `src/geo.ts`, `src/CommandCenter.tsx` (estado y fichas),
`src/CommandMap.tsx` (capas Mapbox), `simulation.test.mjs`.

### 7.3 Decisiones de diseño visual (cerradas con el equipo, no las deshagas)

- **Mapa a pantalla completa.** Sin columnas laterales permanentes. Solo botones
  compactos "Personas" y "Capas" y una ficha que se abre al seleccionar algo.
- **Personas = puntos pequeños y nítidos** (2–4 px según zoom), marfil para referencia
  residencial y azul cielo para ubicación compartida, borde oscuro fino. **Nada de morado
  ni halos grandes.**
- **Fuego = manchas rojas opacas e irregulares** al estilo de las detecciones de NASA
  FIRMS: masa principal alargada y ramificada, huecos, fragmentos periféricos, celdas de
  5 m. Se afinó en varias iteraciones con imágenes de referencia; **no volver a polígonos
  con contorno, tramas ni celdas grandes**. Propagación y puntos térmicos apagados por
  defecto; FIRMS real es capa opcional y separada.
- Minimalismo: no añadir información que no sea necesaria para la operación.

### 7.4 Reglas de honestidad de la simulación (no negociables)

1. **Contestar una llamada no implica moverse.** Solo se mueve un grupo que ha consentido,
   confirmado que puede desplazarse, tiene ruta admisible y plazas, y ha pasado su
   tiempo de preparación.
2. **Sin rutas en línea recta.** Si Directions falla, rechaza el token o la ruta cruza la
   huella del fuego, el grupo queda "pendiente de asistencia". No hay fallback recto.
3. **Un GPS real nunca se anima ni ocupa plazas de demo.** Lo que llega de `/track` solo
   se actualiza con lo que envíe el dispositivo, con su origen y precisión.
4. **Pausa congela el reloj y cancela consultas**; reanudar no reinicia posiciones ni
   duplica llamadas.
5. Etiquetar como simulación/demo todo lo que lo sea (llamadas, rutas, llegadas,
   aforos). "No contesta" no es "atrapado"; un familiar localizado por terceros no es
   confirmación directa.
6. **No llamar ni enviar SMS reales** desde el código sin acuerdo explícito del equipo. La
   integración con HappyRobot sigue siendo simulada en `apps/command-center`.
7. No presentar el escenario como perímetro real, previsión validada ni protocolo
   oficial del 112.

### 7.5 Entorno y verificación

- Node.js 24 LTS, `npm ci` en `apps/command-center`. Dev server: `npm run dev`
  (http://127.0.0.1:5173, `/track` para el consentimiento ciudadano).
- Token público de Mapbox por `VITE_MAPBOX_TOKEN` o en la UI (se guarda en
  `localStorage` como `vigia.mapboxToken`). **Directions consume cuota** del mismo token,
  solo tras Play.
- Antes de subir: `npm test` (12 tests, sin red), `npm run build`, `npm run lint`
  (0 warnings). Único aviso aceptado: bundle > 500 kB por Mapbox.
- `/api/locations` es un middleware de Vite en memoria; no es backend de producción.
- MCPs disponibles en el entorno de Devin: `exa` (búsqueda) y `happyrobot`
  (organización HackSpain – Team 11). **No ejecutar workflows ni llamadas reales** desde
  el MCP de HappyRobot sin acuerdo del equipo.
