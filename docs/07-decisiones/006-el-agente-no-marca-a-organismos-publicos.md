# 006 — El agente da el número de un organismo público, pero nunca lo marca

> **Fecha:** 2026-09-19 · **Estado:** aceptada en su parte de datos; **la parte de `api/` se
> retiró el 2026-09-20 sin llegar a fusionarse**.
>
> Esta decisión proponía dos cosas. La primera —dos columnas de teléfono en `official_contact`, con
> una `CHECK` que impide meter un número real en la marcable— sigue en pie y está implementada. La
> segunda era una lista blanca `REAL_CALL_ALLOWLIST` en `api/`, y **se ha quitado**: mientras esta
> rama estaba abierta, `main` eliminó por su cuenta una lista blanca equivalente (`CALL_ALLOWLIST`,
> commit `052c776`) con un argumento que también derriba la mía y que no había visto.

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

~~Y se añade un segundo cerrojo en `api/`: `REAL_CALL_ALLOWLIST`.~~ **Retirado.** Una lista blanca
es incompatible con lo que hace el agente: cuando un vecino cuenta que su madre está sola en otra
casa, el agente le pide el móvil y la llama. Ese número no puede estar escrito de antemano —si
estuviera, no haría falta preguntárselo—. `main` ya se topó con esto en runtime: el nodo rechazaba
esas llamadas con «Destino no autorizado para el simulacro» y la rama entera moría.

Los cerrojos que quedan en `api/`, que son de `main` y no de esta decisión: `ALLOW_REAL_CALLS`,
`PHONE_OVERRIDES` (sustituye el teléfono de una persona concreta al cargar el escenario, y es donde
viven los móviles reales de los ensayos), `REGISTER_ONLY_CALLS`, los topes de lote y radio, y que
los teléfonos del dataset estén en el rango reservado.

La regla que sí sobrevive, y es la de esta decisión: **el agente puede decir el número de un
organismo público; el sistema nunca lo marca.** Eso se sostiene en la `CHECK` de `phone_sim`, que
no depende de ninguna lista.

## Alternativas descartadas

- **No guardar los números reales.** Era mi propuesta inicial y es peor producto: decirle a un
  vecino a qué número llamar es exactamente lo que un operador humano hace, y quitarlo por miedo
  empobrece el sistema sin ganar seguridad si el cerrojo está bien puesto.
- **Confiar en el prompt de la tool** («no llames a organismos públicos»). Necesario, pero un
  guardarraíl blando no es suficiente cuando el fallo es irreversible y público. El prompt se
  escribe igualmente; lo que decide es la `CHECK` y la lista blanca.
- **Un flag por contacto** (`dialable bool`). Mismo agujero: una columna que alguien puede poner a
  `true` por error. El rango reservado no se puede poner a `true` por error.
- **La lista blanca de números marcables.** Descartada por lo de arriba. El error de diseño fue
  tratar «a quién se puede llamar» como un conjunto cerrado, cuando media gracia del producto es
  que el agente descubre teléfonos hablando.

## Consecuencias

- Los números reales de organismos se pueden guardar sin peligro, que era lo que se quería.
- Para las llamadas reales de la demo se usa `PHONE_OVERRIDES` de `main`, no nada de esta rama.
- `name` en `official_contact` es el organismo, nunca una persona con nombre: un cuartel publicado
  es información pública, el móvil de quien lo atiende no.
