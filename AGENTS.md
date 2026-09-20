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
