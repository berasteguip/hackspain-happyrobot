# Índice de conocimiento — router123 @ HackSpain 2026 (track HappyRobot)

> **Actualizado:** 2026-09-19 (mediodía) · **Estado:** vivo

Base de conocimiento del equipo. Todo lo que aprendemos vive aquí, con fuente y fecha.
Reglas de escritura: [`../AGENTS.md`](../AGENTS.md) y [`00-meta/convenciones.md`](00-meta/convenciones.md).
Ocho carpetas, numeradas en orden de lectura. No crear más: si algo no encaja, va a la más
cercana.

## Mapa

| Carpeta | Qué contiene | Empieza por |
| --- | --- | --- |
| `00-meta/` | Cómo escribimos aquí | [convenciones.md](00-meta/convenciones.md) |
| `01-evento/` | HackSpain 2026 y el **enunciado oficial del reto** | [02-reto-happyrobot.md](01-evento/02-reto-happyrobot.md) |
| `02-happyrobot/` | La empresa, la plataforma, **qué expone de verdad**, API/SDK, preguntas para el stand | [03-workspace-y-limites-verificados.md](02-happyrobot/03-workspace-y-limites-verificados.md) |
| `03-dominio-crisis/` | Emergencias en España, ES-Alert, datos de incendios, geografía de la zona, modelo de fuego, competencia | [01-sistema-emergencias-espana.md](03-dominio-crisis/01-sistema-emergencias-espana.md) |
| `04-regulacion/` | AI Act, ENS, RGPD, LCSP, y el marco legal de llamar y geolocalizar | [01-marco-regulatorio.md](04-regulacion/01-marco-regulatorio.md) |
| `05-investigacion/` | Notas fechadas: barridos, contactos, entrevistas | [2026-09-19-contacto-ines-galindo-csic.md](05-investigacion/2026-09-19-contacto-ines-galindo-csic.md) |
| `06-producto/` | **Qué construimos**: escenario, contrato de datos, brief del agente | [README.md](06-producto/README.md) |
| `07-decisiones/` | Decisiones cerradas y propuestas abiertas (ADR ligero) | [README.md](07-decisiones/README.md) |
| `_inbox/` | Material crudo sin destilar (mirror de docs.happyrobot.ai, no versionado) | [README.md](_inbox/README.md) |

## Ruta de lectura rápida (20 min)

1. [`01-evento/02-reto-happyrobot.md`](01-evento/02-reto-happyrobot.md): qué se juzga. Todo se mide contra esto.
2. [`06-producto/02-escenario-incendio.md`](06-producto/02-escenario-incendio.md): qué construimos y qué se enseña en la demo.
3. [`06-producto/03-contrato-de-datos.md`](06-producto/03-contrato-de-datos.md): entidades y API, vinculante para todo el código.
4. [`02-happyrobot/03-workspace-y-limites-verificados.md`](02-happyrobot/03-workspace-y-limites-verificados.md): qué nos deja hacer la plataforma de verdad.
5. [`07-decisiones/README.md`](07-decisiones/README.md): qué está cerrado y qué falta por decidir.

Si vas a construir el agente de HappyRobot: [`06-producto/04-brief-equipo-agente.md`](06-producto/04-brief-equipo-agente.md) y [`../prompts/`](../prompts/README.md).

## Estado del conocimiento

Verificado (con fuente en el doc):
- Enunciado y rúbrica del track ([`01-evento/02-reto-happyrobot.md`](01-evento/02-reto-happyrobot.md)).
- HappyRobot: empresa, plataforma, documentación oficial completa en local, workspace del equipo recorrido, API y SDK leídos del código publicado.
- Sistema español de emergencias, caso DANA, ES-Alert (qué permite y qué no).
- Incendios de la Sierra de la Culebra 2022: dos incendios distintos, víctimas con lugar y fecha.
- Geografía real de la zona, modelo de propagación (FARSITE), qué proveedor de rutas evita polígonos.
- Marco regulatorio y legal de llamar en masa y geolocalizar con consentimiento.

Pendiente:
- Saldo de créditos, paralelismo del Loop, webhook síncrono, tool call en voz: [`02-happyrobot/05-preguntas-stand.md`](02-happyrobot/05-preguntas-stand.md). **Preguntar en el stand antes de construir el agente.**
- Validación con alguien que ha coordinado emergencias reales: [`05-investigacion/2026-09-19-contacto-ines-galindo-csic.md`](05-investigacion/2026-09-19-contacto-ines-galindo-csic.md).
- Un solo frontend y un solo dataset: [`07-decisiones/003-frontend-y-dataset-unicos.md`](07-decisiones/003-frontend-y-dataset-unicos.md).
- Formato y duración de la demo final, quién juzga.

Superado (se conserva, no se borra):
- [`06-producto/01-vigia.md`](06-producto/01-vigia.md) como alcance de producto: sigue valiendo como tesis y frontera con el 112; el alcance vigente es el 02.
- La tesis abierta "llevar HappyRobot al sector público" del primer barrido ya está concretada: incendio forestal, saliente preventivo, Protección Civil. Lo que queda abierto está en `07-decisiones/`.
