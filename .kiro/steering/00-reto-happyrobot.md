---
inclusion: always
---

# HackSpain 2026 · Track HappyRobot · Equipo router123

Este repo es el proyecto de Luis (luismols / 34lumo) y Pablo (berasteguip) para el reto de HappyRobot en HackSpain 2026. Tú acompañas al equipo durante toda la hackathon: cada idea, decisión de diseño, línea de código y ensayo de demo se mide contra el enunciado oficial.

**Fuente de verdad del reto:** `docs/01-evento/02-reto-happyrobot.md` (enunciado íntegro). Léelo antes de proponer nada. Lo de abajo es el resumen operativo.

## El reto en una frase

Un sistema agéntico que gestiona una crisis (la elegimos nosotros) mientras el escenario cambia debajo de él, usando la plataforma de HappyRobot para actuar de verdad (llamadas, mensajes, tickets, APIs), con una pantalla para que una persona entienda e intervenga.

## Las seis preguntas que el sistema responde en bucle

1. Qué información importa (filtrar 100 mensajes hasta los 3 que cambian algo).
2. Qué va primero (priorizar con los medios que quedan, no los que harían falta).
3. A quién se avisa y cuándo (vecino, bombero y responsable no reciben lo mismo).
4. Dónde van los recursos (3 ambulancias, 5 sitios: toda asignación deja a alguien esperando).
5. Qué se hace ahora (siguiente acción concreta y quién la hace, no un parte de situación).
6. Cuándo tirar el plan (detectar que el plan de hace 20 minutos ya no vale).

## Obligatorios (si falta uno, no hay entrega)

- **Agéntico:** decide y actúa solo. Un chatbot que responde preguntas NO cuenta.
- **Escenario que se mueve:** la situación cambia en tiempo de ejecución. Caso fijo = descalificado.
- **Varios pasos:** cadena de acciones con objetivo, no una acción suelta.
- **Interacción real:** llama, escribe, crea tickets o mueve datos en un sistema real. Hablar con una persona cuenta.
- **Interfaz humana:** pantalla para entender la situación, ver qué hace el sistema e intervenir.
- **Bonus:** aprende de ejecuciones anteriores (revisa llamadas y decisiones pasadas y ajusta).

## Rúbrica (tres bloques, mismo peso)

| Bloque | Criterios |
|---|---|
| Cómo decide | Decisión sin datos completos · Prioridad cuando todo es urgente · Adaptación al cambio |
| Cómo actúa | Coordinación (gente + información + medios a la vez) · Ejecución fuera del sistema, no solo propuesta |
| Cómo se supervisa | Control (se entiende y se puede intervenir) · Creatividad (escenario y gestión con algo propio) · Aprendizaje (extra) |

## Reglas de trabajo para ti

- **Cada propuesta se justifica con la rúbrica.** Si una feature no sube ningún criterio, no se construye. Si un criterio queda a cero, avisa.
- **Ejecución real por encima de simulación.** "El sistema mueve cosas, no solo las propone" es literal. Priorizar siempre la vía que llama, escribe o crea algo en un sistema real via HappyRobot.
- **El cambio de escenario es parte del producto, no del guion de la demo.** Diseñar el motor de eventos que altera la situación en runtime como componente de primera clase.
- **La demo pesa tanto como el sistema.** Reservar tiempo para el pitch y ensayarlo. Todo lo que se construya debe poder enseñarse en un momento de demo comprensible en menos de 3 minutos.
- **36 horas.** Construible, demostrable en vivo, sin dependencias que no controlemos. Ante la duda, recortar alcance antes que fiabilidad.
- **El equipo de HappyRobot está en el evento** para dudas de plataforma o de escenario. Cuando algo de la plataforma no esté claro, la respuesta es "preguntar a HappyRobot en el stand", no inventar.
- **Antes de tocar la plataforma HappyRobot:** verificar en su documentación qué expone de verdad (agentes de voz, canales, webhooks, APIs, números de prueba). No asumir capacidades.

## Estado y decisiones

Registrar en `docs/` lo que se decida (escenario, arquitectura, qué expone HappyRobot, guion de demo). Este steering solo resume el enunciado; no duplicar aquí el estado del proyecto.
