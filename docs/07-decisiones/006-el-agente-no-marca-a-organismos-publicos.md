# 006 — El agente da el número de un organismo público, pero nunca lo marca

> **Fecha:** 2026-09-19 · **Estado:** aceptada (implementada el mismo día)

## Contexto

El sistema va a tener una tool `llamar_a_tercero` y una tabla de contactos oficiales con números
**reales** descargados de una base pública. En el momento de la demo se pone `ALLOW_REAL_CALLS=true`
para hacer las 3-4 llamadas de voz reales que permite la [decisión 002](002-vecinos-simulados-por-texto.md).

Esas tres cosas juntas significan que un bucle del planner puede marcar el cuartel de la Guardia
Civil de Tábara en mitad del pitch. No es un riesgo teórico: es el comportamiento por defecto del
código tal y como estaba, porque `ALLOW_REAL_CALLS` es una bandera global y no distingue a quién se
llama.

## Decisión

Se separan dos capacidades que estaban confundidas en una:

- **Dar el contacto.** El agente dice el número en voz alta para que lo marque la persona. Es lo
  que hace un operador de Protección Civil de verdad, es útil, y no tiene riesgo. Columna
  `official_contact.phone_public`, con el número real y publicado.
- **Llamar a un tercero.** El sistema marca. Solo contra contrapartes simuladas. Columna
  `official_contact.phone_sim`, restringida por `CHECK` al rango reservado `+3460099%`.

Y se añade un segundo cerrojo en `api/`: `REAL_CALL_ALLOWLIST`. Para que salga una llamada real
hacen falta la bandera **y** que el número esté en la lista. Vacía = nadie.

La regla, en una frase: **el agente puede decir cualquier número; solo puede marcar los que alguien
ha escrito a mano en una lista.**

## Alternativas descartadas

- **No guardar los números reales.** Era mi propuesta inicial y es peor producto: decirle a un
  vecino a qué número llamar es exactamente lo que un operador humano hace, y quitarlo por miedo
  empobrece el sistema sin ganar seguridad si el cerrojo está bien puesto.
- **Confiar en el prompt de la tool** («no llames a organismos públicos»). Necesario, pero un
  guardarraíl blando no es suficiente cuando el fallo es irreversible y público. El prompt se
  escribe igualmente; lo que decide es la `CHECK` y la lista blanca.
- **Un flag por contacto** (`dialable bool`). Mismo agujero: una columna que alguien puede poner a
  `true` por error. El rango reservado no se puede poner a `true` por error.

## Consecuencias

- Los números reales de organismos se pueden guardar sin peligro, que era lo que se quería.
- Encender `ALLOW_REAL_CALLS` con la lista vacía ya no llama a nadie. El banner de arranque de
  `api/main.py` lo dice en voz alta para que no sorprenda en la demo.
- Para las llamadas reales de la demo: el móvil del compañero va a `REAL_CALL_ALLOWLIST` (en
  `.env`, no versionado) y el teléfono de la persona se cambia con `POST /human/override`, que ya
  existe y deja rastro en el `decision_log`. Así no entra un número real en el repo.
- `name` en `official_contact` es el organismo, nunca una persona con nombre: un cuartel publicado
  es información pública, el móvil de quien lo atiende no.
