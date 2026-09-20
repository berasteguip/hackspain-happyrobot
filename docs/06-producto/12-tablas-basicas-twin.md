# Las tablas básicas de Twin: el padrón sobre el que se apoya el log

> **Creado:** 2026-09-19 (tarde) · **Estado:** creadas y cargadas en Twin, verificado
> **En una frase:** el log de llamadas guarda un `person_id`, y hasta ahora ese id no apuntaba a nada.
>
> ⚠️ Los docs 07 a 11 de esta carpeta viven hoy en otra rama sin fusionar. Los enlaces a
> `07-twin-log-de-llamadas.md` y `11-plan-log-compartido.md` quedan rotos hasta que esa rama entre;
> se numera este como 12 para no chocar con ellos.

## 1. El agujero que esto tapa

[`11-plan-log-compartido.md`](11-plan-log-compartido.md) y [`07-twin-log-de-llamadas.md`](07-twin-log-de-llamadas.md)
diseñan `call_log` con `created_at`, `persona`, `telefono` y `zona`. Tres de esas cuatro columnas son
texto libre que no se puede resolver contra nada:

- `persona` es un nombre. Hay dos «Josefa Mateos» y tres «Adoración» en 120 vecinos.
- `zona` mezcla dos cosas distintas: «Sesnández» (un núcleo), «Ferreruela» (un municipio **y** un
  núcleo) y «la pista de La Cernada» (un paraje sin entidad administrativa). Filtrar por ahí es
  filtrar por `like`.
- `telefono` sí es una llave, pero sin nada al otro lado.

Con eso, la pregunta que el agente necesita responder en mitad de una llamada —«¿qué se sabe de la
zona **de esta persona**?»— no tiene consulta. Este documento es la otra mitad: las tablas contra
las que ese `person_id` y esa `zona` significan algo.

## 2. La jerarquía, que es la real y no una inventada

```
municipality  Losacio · Ferreruela de Tábara · Tábara     (ayuntamiento; el alcalde dirige el PEMU)
   └─ locality   Losacio · Ferreruela · Sesnández · Tábara  (núcleo: lo que el vecino dice por teléfono)
        └─ house    h-001 … h-120                            (lo que la patrulla visita)
             └─ person  p-001 … p-120                        (a quien se llama)
```

Los dos niveles de arriba no son burocracia: **Sesnández de Tábara no es un municipio, es pedanía de
Ferreruela de Tábara**. Sin `locality`, «estoy en Sesnández» no se resuelve; sin `municipality`, no
se puede decir a qué alcalde se escala ni contar cuánta gente hay en su término. Son dos preguntas
distintas y hacían falta dos tablas.

Y cruzando la jerarquía, una sola cosa operativa: `sector`, el polígono del incidente. Un sector
**no respeta límites municipales** —se dibuja sobre el fuego, no sobre el mapa administrativo— y por
eso es una dimensión aparte y no un nivel más del árbol. Confundir «zona administrativa» con «zona
operativa» es exactamente lo que hoy hace ambigua la columna `zona` del log.

## 3. La regla que decide qué vive aquí

> **¿El dato cambia durante el incendio?**
> **No** → Twin. Es padrón: quién vive dónde, y dónde está ese dónde.
> **Sí** → `api/`. Es estado, y el contrato dice que en runtime solo hay una fuente de verdad.

Por eso en estas tablas **no hay** `status`, `call_attempts`, `priority_score`, `minutes_to_front`,
`assigned_route`, `assigned_exit_id`, `occupancy` ni `answered`. No es que se hayan olvidado: si
estuvieran, habría dos sitios afirmando a la vez en qué estado está `p-001`, y en una demo en vivo
esa es la clase de bug que no se depura delante de un jurado. Decisión completa en
[`../07-decisiones/005-padron-en-twin-estado-en-api.md`](../07-decisiones/005-padron-en-twin-estado-en-api.md).

## 4. Las tablas

DDL completo en [`../../data/twin/schema.sql`](../../data/twin/schema.sql). Aquí va el porqué de
cada una; los nombres van en inglés (AGENTS.md §4) y alineados con el contrato: `house.id` es el
`House.id` del contrato (`h-001`) y `person.id` es el `Person.id` (`p-001`), no ids nuevos.

| Tabla | Filas hoy | Para qué existe |
| --- | --- | --- |
| `municipality` | 3 | A quién se escala y sobre qué término se cuenta. Lleva `province`, `comarca` y población con año. |
| `locality` | 4 | El núcleo. `kind` distingue `capital` de `pedania`, que es la diferencia que hace falta para no tratar Sesnández como municipio. |
| `sector` | 6 | El polígono operativo del incidente, con su GeoJSON. Sin contadores: esos cambian cada minuto. |
| `house` | 120 | El domicilio. `street` + `number` separados, y `address` tal y como se dice en voz alta. |
| `person` | 120 | A quien se llama. `phone` con índice **único**: es la llave de resolución de una llamada entrante. |
| `support_need` | 27 | Quién no sale solo de casa. Tabla aparte a propósito, §4.3. |

### 4.1 `house`: una casa sin persona no es un hueco en los datos

Cinco de las 120 casas no tienen ninguna persona asociada. No falta información: **son exactamente
las casas a las que hay que mandar a la patrulla**, y por eso `house` existe como tabla propia y no
como columnas dentro de `person`. La lista viva de la sección 4.1 del escenario sale de aquí.

`number` es `text` y admite `NULL`: en los 18 diseminados no hay número: no existe, que no es lo
mismo que el número 0 (§1 del contrato de datos).

### 4.2 `person.source`: el padrón está mal a propósito

`source` vale `padron` o `call`. Hoy hay 108 y 12. Los doce de `call` son gente que **el censo no
tiene**: el nieto en agosto, la cuidadora, el visitante. El escenario ya los genera
(`_sim.uncensored`) y hasta ahora se perdían en la carga.

Esta columna es la que deja **enseñar** el momento más vistoso de la demo —30 llamadas convierten
120 números en muchos más— en vez de que ese crecimiento parezca un error de datos. Y es honesta
sobre lo que un padrón real es: una foto vieja de un pueblo de 90 habitantes.

`house` lleva la misma columna, para las casas que aparecen por `neighbors_mentioned`.

### 4.3 `support_need`: tabla aparte, y el motivo no es de diseño

El contrato ya avisa (§2.1) de que `mobility` en `reduced`/`immobile` es **probablemente dato de
salud**: categoría especial del art. 9 del RGPD, no dato ordinario. Si eso es una columna de
`person`, viaja en cada `SELECT *`, en cada log de depuración y en cada consulta que el agente de voz
haga en caliente.

Separado en su propia tabla: se puede dar acceso a `person` sin dar acceso a esto, y **la vista que
lee el agente durante la llamada no lo incluye**. Ausencia de fila = la persona se vale por sí misma.

De paso deshace una mezcla que traía el contrato: el enum `mobility` junta dos cosas que no son la
misma, **tener coche** (dato ordinario) y **poder andar** (dato de salud). Aquí van separadas —
`person.has_vehicle` y `support_need.mobility`— y la vista reconstruye el enum original. Se comprobó
que la reconstrucción es exacta: `car` 77 · `walking` 21 · `reduced` 17 · `immobile` 5, los mismos
números que el dataset. No se pierde nada al separarlo.

## 5. Dos vistas, y la frontera entre ellas es la de privacidad

- **`v_person_location`** — sin dato de salud. Es la que lee el agente de voz en mitad de una
  llamada: `where phone = ?` contra un índice único, sin joins escritos a mano, y nada que no pueda
  salir por un altavoz. Esto responde al presupuesto de «< 1 s» del plan 3.
- **`v_person_support`** — con el dato de salud y el enum `mobility` reconstruido. Para `api/` y para
  el puesto de mando, no para el agente.

```sql
-- lo que hace el agente cuando entra una llamada, una vez:
select person_id, name, address, locality, municipality, sector_id
from v_person_location where phone = '+34600994010';
-- p-001 · Mercedes Cid · Calle de la Iglesia 2, Losacio · Losacio · Losacio · s-2
```

Con eso, la consulta al log deja de ser `like '%Sesnández%'` y pasa a ser
`where locality_id = 'n-sesnandez-de-tabara'`.

## 6. `call_log`: el diseño, y por qué se ve en la pantalla

DDL completo en [`../../data/twin/call_log.sql`](../../data/twin/call_log.sql). La idea que ordena
todo lo demás: **una fila no es «esto pasó en la llamada X», es una afirmación** — qué se sabe de un
tema, quién lo dice y hasta cuándo es fiable. Por eso la respuesta vive en la misma fila que la
pregunta: «¿alguien preguntó esto?» y «¿hay respuesta?» tienen que ser una sola lectura.

Cambios respecto al diseño del doc 07, y el porqué:

| Antes | Ahora | Por qué |
| --- | --- | --- |
| `tipo` (vecino/testimonio/autoridad/pendiente) | `topic` + `source_id` | Mezclaba dos ejes. `vecino` y `autoridad` son **quién**; `testimonio` es **qué clase de dato**. Separados, `testimonio` cae dentro de `topic` y `pendiente` desaparece: pendiente es `answer is null`. |
| `asunto` en texto para buscar | `topic` cerrado + `road` / `locality_id` | Buscar «¿está cortada la ZA-P-2551?» por texto no funciona: nadie repite la frase. `question` se queda, pero para que lo lea un humano. |
| `zona` texto | `locality_id` FK + `place_text` + `road` | Llave cuando el sitio existe, texto cuando no, y **`road` aparte**: una carretera no pertenece a un núcleo. La ZA-P-2434 es la salida de Sesnández *y* de Ferreruela; archivarla bajo una sola pierde el dato para la otra. |
| `fuente` texto | `source_id` FK + `source_detail` | `source.label` es lo que el agente **pronuncia** al citar, y `source.rank` resuelve contradicciones con un `order by` en vez de un `CASE` repetido. |
| `vigencia_min` | `validity_min` + `source.default_validity_min` | Se mantiene en minutos, y no en fecha, porque **el nodo `Write to Twin` escribe valores, no expresiones**: no puede calcular `now() + interval`. La caducidad se evalúa en la lectura, y si el agente no dice nada, la hereda de la fuente. |
| `resuelto` / `answered_at` | nada | El canvas solo sabe insertar y hacer upsert por PK: no hay camino para actualizar una fila desde un nodo. Así que el log es **append-only**: la duda y su respuesta son dos filas del mismo tema, y la lectura se queda con la mejor. Una columna que nadie puede escribir es peor que no tenerla. |

### La tabla de resumen por zona: de momento, no

El plan 3 pedía una segunda tabla precocinada porque el `Extract` no cabe dentro de una llamada.
Ese argumento se ha debilitado: el nodo `Llamada a tercero` del canvas está configurado con
`timeout: 240`, o sea que **un nodo puede esperar cuatro minutos**. Una lectura indexada de
`call_log` no llega al segundo. Una pieza menos que construir y mantener; se añade el día que se
mida que la lectura va lenta, no antes.

### Verlo apilarse en vivo

El dashboard no puede leer de Twin (contrato §0: Twin no tiene API REST pública fuera de un
workflow, y el navegador nunca la toca). Así que la anotación va **a los dos sitios**:

```
agente ──► Write to Twin        (la fuente: es lo que leen las otras 299 instancias)
       └─► POST /calls/log      (la copia: es lo que ve el puesto de mando)
```

El CECOP (`apps/command-center`) lo lee con `GET /calls/log` y lo pinta en el panel «Memoria
compartida», abajo a la izquierda sobre el mapa. Si el webhook falla, el log sigue funcionando y
solo se retrasa la pantalla: ese es el lado correcto del fallo.

Dos asimetrías deliberadas entre las dos copias:

- **Twin es estricto** (`source_id` con clave foránea), **la copia es permisiva**. Si el agente
  escribe una fuente que no está en el vocabulario, la fila de Twin falla en voz alta pero la
  pantalla la enseña igual: el conocimiento no se pierde de la demo y la deriva se ve.
- **`id` lo genera Twin** (`gen_random_uuid()`) y el workflow lo pasa a `POST /calls/log`. Si se
  comparte el id, las dos copias son la misma anotación y no dos.

`GET /calls/log` filtra por `topic`, `road`, `locality_id`, `person_id`, `only_open` (la cola de lo
que hay que volver a preguntar) y `vigentes`.

### La lectura que hace el agente

Ensancha en vez de devolver vacío, que es lo que hace un humano: primero su núcleo, luego su
municipio, luego la carretera por la que va. Solo es posible porque el padrón tiene la jerarquía.

```sql
select l.name as zona, c.question, c.answer, s.label as fuente,
       extract(epoch from (now() - c.created_at)) / 60 as hace_min
from call_log c
join source s on s.id = c.source_id
left join locality l on l.id = c.locality_id
where c.answer is not null
  and (c.valid_until is null or c.valid_until > now())
  and (c.locality_id = $1 or c.road = $2)
order by s.rank, c.created_at desc
limit 5;
```

`order by s.rank` es lo que resuelve las contradicciones: si un vecino y los bomberos dicen lo
contrario de la misma carretera, gana el de mejor rank. Y `hace_min` va en la consulta porque el
agente está **obligado** a citar fuente y antigüedad — «hace veinte minutos los bomberos nos
dijeron que…» — no a afirmar por su cuenta.

## 7. Lo que esto destapó del dataset

Cuatro cosas que estaban en `data/scenarios/sierra-culebra.json` y que no se veían hasta cruzarlas:

1. **97 teléfonos fijos fantasma.** Las 120 casas tienen `phone`, pero solo 23 tienen
   `_sim.has_landline`. Un número que no existe es peor que ninguno: la patrulla lo marcaría. La
   carga pone `landline = NULL` en las 97, y queda como fallo a corregir en `data/generate.py`.
2. **`village` mezclaba dos niveles.** Losacio y Ferreruela son municipios; Sesnández es pedanía. La
   traducción vive en un único bloque de `data/twin_seed.py`, con la fuente citada.
3. **La vulnerabilidad estaba en el edificio.** `House.vulnerable` describe a quien vive dentro, no a
   la casa. Al pasarla a `support_need` hay **un caso ambiguo** (una casa marcada como vulnerable con
   dos residentes y ninguno con movilidad afectada): se le asigna al primero y el generador lo
   cuenta y lo dice, en vez de repartirlo en silencio.
4. **`household_size` no es consistente dentro de una casa.** En h-016 conviven un `1` y un `3`.
   Resulta ser correcto —el segundo residente es `uncensored`, no está en el censo—, pero solo se
   entiende con la columna `source` del §4.2.

## 8. Cómo se recarga

```bash
python data/twin_seed.py          # data/scenarios/*.json -> data/twin/seed.sql (determinista)
```

Y luego, contra Twin (nodo `Query Twin with SQL`, o `execute_sql` del MCP), en este orden:

| Fichero | Qué es | A mano o generado |
| --- | --- | --- |
| `data/twin/schema.sql` | Las 8 tablas y las 3 vistas | a mano |
| `data/twin/reference.sql` | El vocabulario de `source` y el 112 | a mano |
| `data/twin/seed.sql` | El padrón del escenario | **generado**, no editar |
| `data/twin/call_log.sql` | El log de llamadas | a mano |

Los cuatro son **SQL puro, sin un solo comentario, a propósito**: son ficheros para pegar en un
nodo de la plataforma, y el porqué de cada columna vive en este documento, no ahí. Si al leer el
SQL no se entiende una decisión, el arreglo es escribirla aquí — no comentar el `.sql`.

`seed.sql` empieza borrando las seis tablas del padrón en orden inverso de dependencia, así que
recargarlo dos veces no duplica nada. **Su contenido es sintético en su totalidad**: ningún
teléfono, nombre ni dirección corresponde a una persona real (`meta.notice` del escenario).

`sector` es la única excepción consciente a la regla del §3: los sectores se dibujan **para** un
incidente, no existen antes. Llevan columna `incident` y se reescriben enteros al cargar escenario.

## 9. Lo que deliberadamente NO está aquí

| Fuera | Por qué |
| --- | --- |
| `safe_zones` | Su `status` (`open → filling → threatened → closed`) es lo más volátil del escenario. Es estado, vive en `api/`. |
| `road_closures`, `convoys`, `patrols` | Lo mismo: nacen y mueren dentro del incidente. |
| Una tabla `street` | Ocho nombres de vía en tres pueblos. Un join más en la ruta caliente para normalizar 24 filas no se paga. |
| `ine_code` relleno | La columna está; los valores van a `NULL`. No hay fuente verificada en el repo y AGENTS.md §3.2 prohíbe inventarlos. |

## 10. Estado real, comprobado

Creado y cargado en Twin (org `hackspainteam11`, base `twin`) el 2026-09-19:
`municipality` 3 · `locality` 4 · `sector` 6 · `house` 120 · `person` 120 · `support_need` 27.
Verificado además: 5 casas sin residente conocido (las cinco, segunda residencia), 23 casas con fijo,
12 personas fuera del padrón, y la reconstrucción exacta del enum `mobility` del contrato.

```sql
-- una consulta, y sale el número que le importa a cada alcalde
select m.name as municipio, l.name as nucleo, l.kind,
       count(distinct h.id) as casas,
       count(distinct p.id) as personas,
       count(distinct s.person_id) as no_salen_solas
from locality l join municipality m on m.id = l.municipality_id
left join house h on h.locality_id = l.id
left join person p on p.house_id = h.id
left join support_need s on s.person_id = p.id
group by 1,2,3 order by 1,2;
--  Ferreruela de Tábara | Ferreruela de Tábara | capital | 77 | 75 | 15
--  Ferreruela de Tábara | Sesnández de Tábara  | pedania | 26 | 26 |  8
--  Losacio              | Losacio              | capital | 17 | 19 |  4
--  Tábara               | Tábara               | capital |  0 |  0 |  0
```

Tábara sale con cero casas y está bien: es el destino, no un origen. Tiene fila porque es el sitio
que más se nombra por teléfono («¿cabe alguien ya en Tábara?») y sin `locality_id` esa pregunta no
se podría colgar de nada en el log.

## 11. Contactos oficiales: el agente dice el número, no lo marca

Hay dos capacidades distintas que se estaban confundiendo en una sola, y solo una de las dos
marca un teléfono:

| | Quién marca | Riesgo | Tabla |
| --- | --- | --- | --- |
| **Dar el contacto** — «el 112 es el 112, llame usted» | la persona | ninguno | `phone_public` |
| **Llamar a un tercero** — el sistema marca y vuelve con la respuesta | el sistema | marcar un cuartel real | `phone_sim` |

La primera es lo que hace un operador de Protección Civil de verdad, y es útil. La segunda, contra
un organismo público y sin autorización, no se hace. Por eso son dos columnas y no una, y por eso
la columna marcable lleva una `CHECK` que **la base hace cumplir**:

```sql
constraint phone_sim_reservado check (phone_sim is null or phone_sim like '+3460099%')
```

Comprobado: insertar `+34980123456` (un prefijo real de Zamora) en `phone_sim` devuelve error. No
depende de que nadie se acuerde a las cuatro de la mañana.

`v_contact_lookup` es lo que devuelve la tool `buscar_contacto`: **no expone `phone_sim`**, solo un
booleano `dialable` que dice si el sistema puede marcar o si únicamente puede dar el número.

### El segundo cerrojo, en `api/`

El freno que ya existía, `ALLOW_REAL_CALLS`, es **global**: en la demo se enciende para hacer 3-4
llamadas de voz reales (decisión 002) y en ese mismo instante quedarían marcables los 120 vecinos
y cualquier organismo de esta tabla. No protege justo cuando hace falta.

Se añade `REAL_CALL_ALLOWLIST` en `api/settings.py`: una lista explícita de números marcables.
Para que salga una llamada de verdad hacen falta **los dos**: bandera encendida **y** número en la
lista. Vacía = nadie, aunque la bandera esté a `true`. Va en `.env` y no en el repo porque son
móviles reales del equipo, y el contrato §1 prohíbe versionar un teléfono fuera del rango reservado.

Dos tests nuevos en `api/tests/test_notify.py` lo fijan, y uno de ellos es literalmente el caso
temido: bandera encendida, `+34980123456` de un cuartel, y no sale ni una petición.

### Qué hay cargado hoy

`source` con 11 filas (el vocabulario) y `official_contact` con **una**: el 112, cuyo número es
público, corto y universal. El resto llega de la base de contactos que se está descargando aparte.
Cuando llegue: los números van a `phone_public`, `phone_sim` se queda `NULL` mientras no exista
una contraparte simulada, y `name` es el organismo — nunca el móvil de una persona con nombre.

`municipality.ine_code` sigue vacío a propósito y es el puente natural con esa base: casi cualquier
dataset oficial español viene con código INE, y así el join no depende de comparar nombres con
tildes.

> **[SIN VERIFICAR]** El valor `agente_forestal` de `source` está puesto porque en Castilla y León
> quien dirige la extinción de un incendio forestal son los **agentes medioambientales**, no unos
> bomberos municipales — pero eso no está documentado en `docs/03-dominio-crisis/` con fuente.
> Confirmarlo antes de apoyarse en su `rank` para resolver contradicciones.

Y el vocabulario de `source` es una **propuesta de partida**: si la base de contactos descargada
trae otros tipos de organismo, se insertan filas nuevas. Es aditivo y no rompe nada.

## Fuentes

- Jerarquía municipio/pedanía, poblaciones INE y coordenadas: [`../03-dominio-crisis/05-geografia-sierra-culebra.md`](../03-dominio-crisis/05-geografia-sierra-culebra.md) §1 y §4.
- Entidades, convenciones de id, nulos y el aviso de RGPD sobre `mobility`: [`03-contrato-de-datos.md`](03-contrato-de-datos.md) §1 y §2.1.
- Diseño de `call_log` y presupuesto de latencia del read: [`07-twin-log-de-llamadas.md`](07-twin-log-de-llamadas.md) y [`11-plan-log-compartido.md`](11-plan-log-compartido.md).
- Acceso a Twin como `twin_admin`, verificado vía MCP el 2026-09-19; tablas creadas y cargadas ese mismo día por esta sesión.
