# CLAUDE.md · HackSpain 2026 · Track HappyRobot · Equipo router123

Contexto compartido para cualquier agente que trabaje en este repo (Claude Code, Kiro, kiro-cli, Devin, Cursor).

Dos fuentes, no dupliques su contenido aquí:

- **Reglas de trabajo y convenciones del repo:** [`AGENTS.md`](./AGENTS.md), y después el índice [`docs/README.md`](./docs/README.md).
- **El reto (enunciado, rúbrica, obligatorios):** el steering de abajo. Enunciado íntegro en `docs/01-evento/02-reto-happyrobot.md`.

@.kiro/steering/00-reto-happyrobot.md

## Estado del proyecto (leer siempre)

- **Idea elegida:** guiado individual de evacuación en incendios forestales, B2G (Protección Civil / CECOPI). La llamada masiva es el onboarding (sacar a la gente de casa y obtener su posición); el producto es el mapa de personas + fuego y lo que sale de él: rutas individuales que se recalculan, convoyes con coche guía, casas sin contestar a la patrulla, prioridad de medios aéreos por personas dentro de cada sector. Motor: 300 vecinos simulados con personalidad propia que conversan con el agente de HappyRobot.
- **Docs de producto:** `docs/06-producto/02-escenario-incendio.md` (alcance, demo, backlog), `docs/06-producto/03-contrato-de-datos.md` (vinculante para el código), `docs/06-producto/04-brief-equipo-agente.md` (qué construye el equipo del agente), `docs/06-producto/01-vigia.md` (tesis Vigía y marco regulatorio).
- **Qué expone HappyRobot de verdad:** `docs/02-happyrobot/03-workspace-y-limites-verificados.md` (verificado, marcas [OK] / [?]) y el mirror de docs oficiales en `docs/_inbox/` (ver `docs/02-happyrobot/00-documentacion-oficial.md`).
- **MCP oficial de HappyRobot** en `.mcp.json` (Claude Code) y `.kiro/settings/mcp.json` (Kiro). Requiere autorizar OAuth una vez por máquina con la cuenta del equipo.
- **Código:** `api/` (estado de crisis, fuente de verdad), `engine/` (motor de escenario), `sim/` (simulador de evacuación), `data/` (dataset sintético), `web/gps/` (la página del enlace de ubicación) y `apps/command-center/` (el CECOP en Vite + React + Mapbox, **el único frontend**, decisión 003). Queda pendiente unificar los dos datasets.

## Convenciones

- Decisiones (escenario, arquitectura, qué expone HappyRobot, guion de demo) se registran en `docs/`, con fuente y fecha.
- Explicaciones en español, código y nombres técnicos en inglés.
- Ejecución real por encima de simulación: si algo puede llamar, escribir o crear un ticket via HappyRobot, esa es la vía.
- Datos sintéticos declarados como tales; `ALLOW_REAL_CALLS=false` por defecto.
