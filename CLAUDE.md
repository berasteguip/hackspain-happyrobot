# HackSpain 2026 · Track HappyRobot · Equipo router123

Contexto compartido para cualquier agente que trabaje en este repo (Claude Code, Kiro, kiro-cli).
La fuente única del contexto del reto es el fichero de steering de abajo; no dupliques su contenido aquí, edítalo allí.

@.kiro/steering/00-reto-happyrobot.md

Enunciado íntegro del reto: `docs/reto-happyrobot.md`. Léelo antes de proponer escenario, arquitectura o features.

## Estado del proyecto (leer siempre)

- **Idea principal elegida:** `docs/escenario-incendio.md`. Guiado individual de evacuación en incendios forestales, B2G (Protección Civil / CECOPI). La llamada masiva es el onboarding (sacar a la gente de casa y obtener su posición); el producto es el mapa de personas + fuego y lo que sale de él: rutas individuales que se recalculan, convoyes con coche guía, casas sin contestar a la patrulla, y prioridad de medios aéreos por personas dentro de cada sector. Toda propuesta se mide contra ese doc y la rúbrica.
- **Qué expone HappyRobot de verdad:** `docs/plataforma-happyrobot.md` (verificado dentro del workspace del equipo, con marcas [OK] / [?]).
- **MCP oficial de HappyRobot** configurado en `.mcp.json` (Claude Code) y `.kiro/settings/mcp.json` (Kiro). Requiere autorizar OAuth una vez por máquina con la cuenta del equipo.

## Convenciones del repo

- Decisiones de proyecto (escenario elegido, arquitectura, qué expone HappyRobot, guion de demo) se registran en `docs/`.
- Explicaciones en español, código y nombres técnicos en inglés.
- Ejecución real por encima de simulación: si algo puede llamar, escribir o crear un ticket via HappyRobot, esa es la vía.
