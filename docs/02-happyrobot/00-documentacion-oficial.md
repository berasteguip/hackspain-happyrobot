# Documentación oficial de HappyRobot: dónde está y cómo usarla

> **Actualizado:** 2026-09-18 · **Estado:** estable
> **En una frase:** tenemos un **mirror local completo** de `docs.happyrobot.ai` (que en
> público está tras un access code) en un worktree de git dentro de este mismo repo.

## Dónde está

```
docs/_inbox/2026-09-18-happyrobot-docs-oficiales/
```

~6 MB, 389 páginas. Incluye `llms.txt` (índice completo) y `openapi.json` (spec de la
API pública v2: 179 paths, 224 operaciones, servidor `https://platform.happyrobot.ai/api/v2`,
auth `bearerAuth`).

Existe además una copia en el worktree `.claude/worktrees/scrape-happyrobot-docs-949847/`
(rama `claude/scrape-happyrobot-docs-949847`, commit `79e5164`). **Usa la de `_inbox`**;
la del worktree es el origen de la captura.

## Cómo usarlo

Es markdown plano: `grep` y `read` directos, sin red y sin access code. Para un agente,
la ruta más rápida es leer `llms.txt` primero (índice de todas las páginas) y luego ir al
fichero concreto.

⚠️ Los enlaces internos de esos ficheros son rutas absolutas de Mintlify (`/tools/mcp`),
no rutas de disco. Se resuelven añadiendo `.md` y la raíz del mirror.

## Páginas que más nos van a servir

| Página | Por qué |
| --- | --- |
| `platform-overview.md` | Arquitectura y conceptos: workflow, node, agent, run, contact |
| `quickstart.md` | Agente de voz saliente + trigger por API en 15 min. **Empezar por aquí** |
| `workflows/node-types.md`, `core-nodes/overview.md` | Qué nodos existen realmente |
| `core-nodes/ai-classify.md`, `ai-extract.md` | Clasificación y extracción estructurada |
| `core-nodes/custom-code.md` | Python dentro del workflow |
| `voice-agents/inbound-calls.md`, `outbound-calls.md` | Configuración real de llamadas |
| `voice-agents/forward-call.md`, `transfer-node-popup.md` | **Escalado a humano** — crítico para nuestro caso |
| `workflows/signals.md` | Eventos en tiempo real a un agente **en mitad de una llamada** |
| `twin/overview.md` | PostgreSQL gestionado dentro de la plataforma |
| `apps/overview.md` | Apps web desplegables dentro de HappyRobot |
| `developer-tools/mcp.md` | MCP por HTTP + OAuth 2.1, sin API key ni Node local |
| `developer-tools/sdk/*` | SDK TypeScript y tutoriales de voz/chat |
| `compliance/eu-ai-act-and-gdpr.md` | **Cómo cumple la plataforma con AI Act art. 50 y RGPD** |
| `evaluate/*` | Northstars, audits, tests adversariales, custom tests |
| `assets/telephony.md`, `assets/voices.md` | Números de teléfono y catálogo de voces |
| `openapi.json` | Spec completa de la API v2 |

## Fuentes

- Mirror local: `docs/_inbox/2026-09-18-happyrobot-docs-oficiales/`
  (ver su propio [`README.md`](../_inbox/2026-09-18-happyrobot-docs-oficiales/README.md))
- Origen: https://docs.happyrobot.ai (requiere access code)
- Índice: https://docs.happyrobot.ai/llms.txt
- OpenAPI: https://platform.happyrobot.ai/api/v2/docs/json
