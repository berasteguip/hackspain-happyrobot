# Documentación oficial de HappyRobot: dónde está y cómo usarla

> **Actualizado:** 2026-09-18 · **Estado:** estable
> **En una frase:** tenemos un **mirror local completo** de `docs.happyrobot.ai` (que en
> público está tras un access code); **no se versiona en este repo** —que es público— y se
> reparte por privado entre el equipo.

## Dónde está

```
docs/_inbox/2026-09-18-happyrobot-docs-oficiales/
```

~6 MB, 389 páginas. Incluye `llms.txt` (índice completo) y `openapi.json` (spec de la
API pública v2: 179 paths, 224 operaciones, servidor `https://platform.happyrobot.ai/api/v2`,
auth `bearerAuth`).

⚠️ **Esa carpeta está en `.gitignore` a propósito.** Es documentación del proveedor que
en público está tras un access code, y este repo es público: no la subimos. Si al clonar
no la tienes, consíguela de una de estas dos formas:

1. **Pídesela a un compañero** (se reparte por privado).
2. **Regenérala tú**, que tarda un par de minutos:

```bash
HR_DOCS_CODE=<access-code> python3 scripts/scrape_docs.py
```

El access code es el del hackathon; no lo escribas en ningún fichero del repo.

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
