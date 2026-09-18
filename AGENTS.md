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
- **Estado actual:** fase de conocimiento. **Todavía no hay código ni arquitectura decidida.**
  No inventes estructura de aplicación ni empieces a programar salvo petición explícita.

## 2. Cómo está organizado el repo

```
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
