# 005 — Twin guarda el padrón; `api/` guarda el estado

> **Fecha:** 2026-09-19 · **Estado:** aceptada (implementada el mismo día)

## Contexto

Twin quedó desbloqueado y vacío, y a la vez había dos cosas que querían vivir ahí: el log de
llamadas (plan 3) y las tablas de personas, domicilios y zonas contra las que ese log tiene sentido.

La tentación inmediata era espejar en Twin las entidades del contrato tal cual —`Person` y `House`
enteras, con su `status`, su `call_attempts` y su `priority_score`— para que el agente de voz lo
tuviera todo a mano sin salir de la plataforma. El contrato ya dice que en runtime la única fuente
de verdad es `api/` ([`../06-producto/03-contrato-de-datos.md`](../06-producto/03-contrato-de-datos.md) §0),
pero no decía qué parte de esas entidades puede copiarse.

## Decisión

**Twin guarda solo lo que no cambia durante el incendio.**

- **Twin (padrón):** `municipality`, `locality`, `sector`, `house`, `person`, `support_need`. Quién
  vive dónde y dónde está ese dónde.
- **`api/` (estado):** `status`, `call_attempts`, `answered`, `priority_score`, `minutes_to_front`,
  `assigned_exit_id`, `assigned_route`, convoyes, patrullas, cierres de carretera y el aforo de las
  zonas seguras.

El criterio operativo, para no tener que releer esta lista: **¿el dato cambia durante el incendio?
Sí → `api/`. No → Twin.**

Una sola excepción consciente: `sector`. Un sector se dibuja **para** un incidente, así que no es
padrón; está en Twin porque `house.sector_id` necesita a qué apuntar, lleva columna `incident` y se
reescribe entero al cargar escenario.

## Alternativas descartadas

- **Espejar las entidades completas en Twin.** Da dos sitios afirmando a la vez en qué estado está
  `p-001`. Se descarta por una razón práctica, no estética: en una demo en vivo esa desincronización
  aparece como «el mapa dice una cosa y el agente dice otra» y no se depura delante de un jurado.
- **No tener tablas en Twin y que el agente lo pregunte todo a `api/`.** Los nodos de Python de
  HappyRobot no tienen red saliente ([`../06-producto/03-contrato-de-datos.md`](../06-producto/03-contrato-de-datos.md) §0),
  así que cada lectura sería un webhook de ida y vuelta en mitad de una llamada de voz. Y deja el
  log de llamadas sin nada contra lo que resolver un `person_id`.
- **Una sola tabla desnormalizada** (el criterio original del plan 3: «con dos tablas en 36 h nos
  peleamos con joins en mitad de una llamada»). El argumento es bueno y se conserva entero: los
  joins están escritos **una vez** en dos vistas, y la consulta que el agente hace en caliente sigue
  siendo un `where phone = ?` contra un índice único.

## Consecuencias

- `POST /reset` de `api/` es quien debe recargar `sector` y volver a dejar el padrón coherente con el
  escenario cargado. Hoy la recarga es manual (`python data/twin_seed.py`); cablearla al reset queda
  pendiente.
- El dato de salud (`support_need`) queda en una tabla que la vista del agente no toca. Es lo que
  permite decir, si lo preguntan, que el agente de voz nunca leyó una categoría especial del art. 9.
- `call_log` puede por fin tener claves foráneas en vez de tres columnas de texto libre. El detalle,
  en [`../06-producto/12-tablas-basicas-twin.md`](../06-producto/12-tablas-basicas-twin.md) §6.
