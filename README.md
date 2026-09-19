# hackspain-happyrobot

Repo del equipo **`router123`** en **HackSpain 2026** — track **HappyRobot**.

**Tesis de partida (abierta):** llevar los *AI workers* de HappyRobot al **sector público
y la gestión de crisis**.

> **Estado: hay un primer frontend.** El CECOP está en `apps/command-center`.
> La tesis de producto está en [`docs/06-producto/01-vigia.md`](docs/06-producto/01-vigia.md).

## Empieza aquí

| Si eres… | Lee |
| --- | --- |
| Persona nueva en el equipo | [`docs/README.md`](docs/README.md) — índice y ruta de lectura |
| Un agente de IA | [`AGENTS.md`](AGENTS.md) — reglas de trabajo y convenciones |
| Quien va a decidir el producto | [`docs/06-producto/01-vigia.md`](docs/06-producto/01-vigia.md) |
| Quien quiere ver el CECOP | [`apps/command-center/README.md`](apps/command-center/README.md) |

```bash
cd apps/command-center
npm install
npm run dev
```

Hace falta un token público de Mapbox. La app lo pide al abrir si no está en `.env`.

## Estructura

```
AGENTS.md              Contexto y reglas para agentes (fuente de verdad)
CLAUDE.md              Puntero a AGENTS.md
.cursor/rules/         Reglas para Cursor
.devin/config.json     Permisos de proyecto para Devin
apps/command-center    Frontend del CECOP (Mapbox)
docs/                  Base de conocimiento (ver docs/README.md)
  _inbox/              Material crudo sin procesar → destilar a docs/
```

## Regla de oro

Todo lo que aprendamos —de los mentores, de la plataforma, de la calle— **se escribe en
`docs/`, con fuente y fecha**. Lo que solo está en el chat, no existe.
