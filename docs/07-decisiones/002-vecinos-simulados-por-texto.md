# 002 — Los 300 vecinos son LLMs con personalidad y hablan con HappyRobot por texto; la voz se reserva para 3-4 llamadas reales

> **Fecha:** 2026-09-19 · **Estado:** aceptada

## Contexto

El escenario tiene que moverse desde dentro de las conversaciones, no solo por el viento:
un vecino que no quiere irse sin la abuela, una abuela que anda a 2 km/h o una casa que no
coge el teléfono cambian el reparto de refugios y las rutas de los demás. Para eso hacen
falta 300 interlocutores distintos. Llamar por voz a 300 números exige 300 líneas con TTS
propio: caro, frágil y no aporta nada al jurado frente a la alternativa.

## Decisión

- Nuestro backend genera 300 vecinos con semilla fija (edad, núcleo familiar, movilidad,
  coche, rasgo de personalidad) sobre casas reales de OSM.
- El workflow de HappyRobot (Generate + Loop + Extract) conversa con cada vecino **por
  texto**: manda su frase a `POST /persona/{id}/reply`, nuestro LLM contesta en carácter,
  4-6 turnos, y Extract saca el JSON de la casa a `POST /calls/outcome`.
- Las conversaciones son reales y quedan en los Runs de HappyRobot.
- **3 o 4 llamadas de voz reales**, mismo guion, a móviles del equipo o del jurado, cubren el
  criterio "interacción real" del reto.
- Todo el cálculo geográfico (refugios, capacidad, rutas, prioridad) vive en `backend/api/`; el agente
  pregunta `GET /instructions/{person_id}` y lee `say_this`. Motivo: el Python Sandbox de
  HappyRobot no tiene red saliente.

Detalle operativo: [`../06-producto/04-brief-equipo-agente.md`](../06-producto/04-brief-equipo-agente.md).

## Alternativas descartadas

- 300 llamadas de voz a 300 LLMs con voz: coste y fragilidad sin ganancia para el jurado.
- Simular los dos lados en nuestro backend y usar HappyRobot solo para la voz: más barato,
  pero la plataforma del sponsor pintaría poco.

## Consecuencias

- Coste estimado por pasada completa: 300 casas x ~10 mensajes x ~7 créditos ≈ 20-25k
  créditos. Hay que preguntar el saldo en el stand; si no da, 100 vecinos por HappyRobot y el
  resto simulado, y se declara.
- Se declara en el pitch: "300 vecinos simulados con personalidad, casas reales, calles reales,
  tiempos reales, y 4 vecinos de carne y hueso en la sala".
- `ALLOW_REAL_CALLS=false` por defecto; los `+3460099xxxx` se simulan siempre.
