# Producto

> **Actualizado:** 2026-09-19 · **Estado:** alcance cerrado, en construcción

Guiado individual de evacuación en incendios forestales para Protección Civil: llamada
masiva como onboarding, mapa de personas sobre el mapa del fuego, rutas por persona,
refugios con capacidad, lista viva de casas sin respuesta.

| Fichero | Qué es | Para quién |
| --- | --- | --- |
| [`01-vigia.md`](01-vigia.md) | Tesis de partida (problema, frontera con el 112, visor cartográfico) | Contexto; donde discrepe con el 02, manda el 02 |
| [`02-escenario-incendio.md`](02-escenario-incendio.md) | **El producto**: qué hacemos, cómo decide, qué se enseña en la demo, backlog (sección 14) | Todo el equipo |
| [`03-contrato-de-datos.md`](03-contrato-de-datos.md) | **Vinculante**: entidades, API, prioridad. Ningún componente inventa campos | Quien escribe código |
| [`04-brief-equipo-agente.md`](04-brief-equipo-agente.md) | Qué construye el equipo del agente de HappyRobot y qué le da la API | Equipo del agente |
| [`05-routing-zonas-evitar.md`](05-routing-zonas-evitar.md) | Qué proveedor de rutas evita polígonos (Google no); base de `api/` y `sim/` | Quien toca rutas |
| [`06-workflow-happyrobot-vs-contrato.md`](06-workflow-happyrobot-vs-contrato.md) | Qué hay **desplegado hoy** en la plataforma y en qué se desvía del 03 | Equipo del agente |

Guiones del agente y de la demo: [`../../prompts/`](../../prompts/README.md)
(onboarding, rerruta urgente, patrulla y mando, extracción, workflows, guion de demo).

Código: [`../../api`](../../api) (estado de crisis), [`../../engine`](../../engine)
(el escenario se mueve), [`../../sim`](../../sim) (simulador), [`../../data`](../../data)
(dataset sintético), [`../../web`](../../web) (dashboard MapLibre + página GPS),
[`../../apps/command-center`](../../apps/command-center) (CECOP Mapbox).
Hay dos frontends; ver [decisión 003](../07-decisiones/003-frontend-y-dataset-unicos.md).
