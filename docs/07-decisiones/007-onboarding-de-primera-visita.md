# 007 — El onboarding es el recorrido que ya existe, sobre un escenario del navegador, en `/onboarding`

> **Fecha:** 2026-09-20 · **Estado:** aceptada
>
> **En una frase:** la primera visita al puesto de mando se desvía a `/onboarding`, que es el mismo
> CECOP corriendo el recorrido guiado de `demoTour.ts` sobre un escenario que solo existe en el
> navegador; al terminar o al saltárselo se aterriza en `/`. No se toca el estado de la API.

## Contexto

Se quería que quien entra por primera vez no se encontrase un mapa con siete herramientas y ninguna
explicación. La forma en que se pidió —«un onboarding con su propio escenario»— daba por hecho que
el escenario venía del backend, y ahí está el problema: en `api/` el escenario es una variable de
proceso (`SCENARIO`) y el estado es un singleton en memoria. **Un despliegue es un escenario para
todo el mundo.** No hay forma de que `/onboarding` y `/` enseñen escenarios distintos dentro del
mismo servicio.

Y el cambio en caliente no es una salida: `POST /reset {"scenario": "..."}` existe, pero verificado
contra una instancia con una persona registrada, borra a los registrados, vacía la lista blanca,
pierde el `anchor`, deja el tablero de llamadas a cero y **hace que el GPS de quien está
compartiendo ubicación devuelva 404**. El 2026-09-20 había un despliegue en Railway sirviendo
`SCENARIO=ucm-grupo` con `ALLOW_REAL_CALLS=true` y 66 personas cargadas.

Lo que sí había, y nadie estaba mirando: el recorrido guiado de `demoTour.ts` ya era un onboarding
completo —trece pasos de manos, marca en `localStorage`, popovers, y el salvavidas `?p=`— solo que
vivía dentro de `/` como una tarjeta que hay que aceptar.

## Decisión

Onboarding **solo en el frontend**, sin escenario de backend:

- **`/onboarding` es el mismo `CommandCenter`** con una prop `onboarding`. Cambia tres cosas:
  arranca en el escenario de práctica, no abre una sola conexión con la API (censo, posiciones,
  ancla y GPS de la pestaña quedan fuera por el mismo interruptor `offline` que ya usaba
  `VITE_DEMO_ONLY`), y el recorrido empieza solo en vez de ofrecerse en una tarjeta.
- **El escenario es `scenario-onboarding.ts`**, una entrada más en `SCENARIOS`: el incendio de la
  Dehesa con cuarenta vecinos en el campus en lugar de noventa, y el mismo grupo guiado de veinte
  casas con una que no descuelga. **No está en el selector del mapa** (`SELECTABLE_SCENARIOS`):
  cambiar de escenario en caliente reemplaza los ciudadanos por los locales y deja el censo de la
  API fuera del mapa hasta recargar.
- **La puerta vive en `onboarding.ts`**, con el patrón de `shouldShowTourIntro()`. Quien llega con
  `?p=` —del SMS o de `/track`, en mitad de una evacuación— **nunca** se desvía, ni siquiera si la
  URL trae también `?onboarding=1`. Si `localStorage` falla no se desvía a nadie: marcar la visita
  sería imposible y la persona quedaría dando vueltas entre `/` y `/onboarding`.
- **Siempre hay salida.** Un botón «Saltar e ir al puesto de mando» a la vista durante todo el
  recorrido, por encima del velo de Driver, y `?onboarding=1` para volver a verlo.
- **De `api/` solo la ruta estática.** Una ruta gemela a `spa_track` (el montaje de `StaticFiles`
  no hace fallback de SPA: sin ella, 404) y `/onboarding` en `PUBLIC_PATHS` (con
  `HR_SHARED_SECRET` puesto, si no, 401). De paso, `/ines` entra en `PUBLIC_PREFIXES`: las fotos
  del paso de Inés Galindo estaban devolviendo 401 en cualquier despliegue con secreto.

## Alternativas descartadas

- **Cambiar `SCENARIO` en caliente.** La única opción que toca el estado de la gente real. Cada
  persona que terminase el onboarding le borraría las llamadas y el GPS a todas las demás. Y aunque
  se arreglara `load_scenario` para preservar registrados y ancla, `settings.scenario` no se mueve:
  un reinicio del contenedor revertiría el escenario sin avisar.
- **Dos servicios en Railway.** Funciona y no toca el despliegue vivo, pero duplica variables y el
  workflow de HappyRobot apunta a un solo `{{API_BASE_URL}}` para sus callbacks: el servicio de
  onboarding no podría llamar de verdad. Es el plan B si el onboarding llega a necesitar backend.
- **Varios escenarios en memoria en `api/`.** Arquitectónicamente correcta y la peor decisión
  posible hoy: el singleton `state` se importa en once módulos y hay ~320 accesos repartidos por
  planner, eventos, llamadas y dispatcher, incluido el camino que marca teléfonos de verdad.
- **Un componente de onboarding nuevo desde cero.** Habría dejado dos recorridos que mantener y
  que se desincronizan a la primera. El recorrido de `demoTour.ts` ya es el guion bueno.

## Relación con el modo guía de `?guia=1`

Mientras esta rama estaba abierta, `main` resolvió el problema vecino por otro camino
(`2ea233d`, Luis): `?guia=1` enciende `DEMO_ONLY` **en ejecución**, de modo que el recorrido
guiado corre sobre el escenario sintético aunque el despliegue sirva el censo real. Las dos cosas
conviven y responden a preguntas distintas:

- **`?guia=1`** es para quien ya está en `/` y quiere ver el recorrido sin riesgo. Lo ofrece el
  botón «Ver recorrido»; se sale con «Salir de la guía».
- **`/onboarding`** es la puerta de entrada de quien llega por primera vez y todavía no sabe qué
  está mirando: su propio escenario, el recorrido arrancado solo y la vuelta a `/` al terminar.

El punto de contacto está en `launchTour`: el guardián que Luis puso para rebotar a `?guia=1`
cuando hay censo real pasa a mirar `offline` en vez de `DEMO_ONLY`, porque en `/onboarding` no hay
censo real del que protegerse y el recorrido tiene que correr donde está. `shouldEnterOnboarding`
tampoco desvía a quien llega con `?guia=1`: esa persona ha pedido el recorrido sobre `/`.

## Consecuencias

- En Railway **no se cambia ninguna variable**. `SCENARIO` sigue en `ucm-grupo`, y quien está en
  mitad de su evacuación no pierde ni su llamada ni su posición.
- El onboarding no puede llamar a nadie por construcción: sin censo de la API, `liveMode` nunca se
  enciende y la campaña es simulación local del navegador.
- Quien sale del onboarding tampoco recibe en `/` la tarjeta que le invita al mismo recorrido: al
  salir se marcan las dos visitas. El recorrido sigue disponible en «Ver recorrido» y en `?guia=1`.
- **Queda abierto el contenido.** Los trece pasos son los de la demo del jurado («rodéalas»,
  «llama a las veinte», el helicóptero, el frente pintado, el cierre con Inés Galindo). Nadie ha
  decidido todavía si el onboarding de un mando de Protección Civil debe contar esa misma historia
  o una más corta. Cambiarlo es editar `DEMO_TOUR_STEPS`; el andamiaje ya está.

## Fuentes

- Verificación propia sobre el código y la API local (`TestClient`, `uvicorn`), 2026-09-20:
  `/onboarding` devolvía 404 sin la ruta y 401 con `HR_SHARED_SECRET`; `/ines/*` devolvía 401.
- Comprobación de navegador con proveedores externos interceptados, 2026-09-20: 20 comprobaciones
  sobre primera visita, segunda visita, `?p=`, `?onboarding=1`, botón de saltar, fin del recorrido
  y móvil de 390 px.
- [`scripts/reset.py`](../../scripts/reset.py) y
  [`03-contrato-de-datos.md`](../06-producto/03-contrato-de-datos.md) sobre qué se lleva por delante
  un `POST /reset`.
