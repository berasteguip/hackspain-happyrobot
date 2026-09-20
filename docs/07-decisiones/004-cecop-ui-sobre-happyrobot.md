# 004 — La UI de Vigía entra en `main` sin sustituir HappyRobot

> **Fecha:** 2026-09-19 · **Estado:** aceptada

## Contexto

`main` ya tenía la integración real con HappyRobot: círculo → API → dispatch, censo `/api/roster`, tablero de llamadas, puente `/api/locations` y despliegue Railway.

La rama de interfaz (`allanbees/vigia-cecop-madrid`) tenía el catálogo Madrid/Gredos, avisos, medios, viento tipo rachas y el dock de campaña simplificado. Un merge directo a `main` habría pisado `crisisApi` y el dock en vivo.

## Decisión

Fusionar la UI **encima** de `origin/main` y conservar ambos sistemas:

- HappyRobot sigue mandando cuando el operador marca «Llamar de verdad»: `dispatchCircle`, roster, `CallBoard`, clave `HR_SHARED_SECRET`.
- Sin API, el CECOP enseña el catálogo (Madrid ETSIT por defecto, Gredos) y la campaña local.
- El viento visual de la UI (rachas en canvas) sustituye al de `main`; `api/`, `crisisApi.ts` y Railway no se tocan.

## Alternativas descartadas

- Reescribir `main` con la UI y re-implementar HappyRobot después: pierde el webhook y los cerrojos ya probados.
- Dejar dos ramas en paralelo hasta después de la demo: el puesto de mando y las llamadas reales no coinciden en el mismo mapa.

## Consecuencias

El dock muestra simulación local o llamadas reales según el toggle. Cambiar de incendio en el catálogo limpia la ráfaga viva para no mezclar un batch de HappyRobot con otro escenario.

## Fuentes

- Rama `origin/main` @ `6fd5fad` (Railway, locations, webhook circle dispatch).
- Rama `allanbees/vigia-cecop-madrid` @ `fac7af6` (UI CECOP Madrid).
- Contrato de datos: [`../06-producto/03-contrato-de-datos.md`](../06-producto/03-contrato-de-datos.md).
