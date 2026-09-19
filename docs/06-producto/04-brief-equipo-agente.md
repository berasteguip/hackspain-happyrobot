# Brief para el equipo del agente (la parte de "la gente")

> Versión corta para pegar al equipo que monta los workflows de HappyRobot. El detalle de campos está
> en `03-contrato-de-datos.md`; si falta algo, se añade ahí antes de inventarlo en el workflow.

## Reparto

- **Vosotros**: el workflow de HappyRobot que habla por texto con 300 vecinos simulados, extrae los datos
  de cada casa, se los manda a nuestra API, recibe la instrucción y se la dice al vecino. Mismo guion en
  voz para 3 o 4 llamadas reales a móviles del equipo o del jurado. Y el workflow que avisa a la patrulla.
- **Nosotros (backend/api/)**: mapa, refugios, capacidad, rutas, prioridad. El agente **no calcula nada geográfico**:
  pregunta a `GET /instructions/{person_id}` y lee `say_this`. Motivo: el Python Sandbox de HappyRobot no
  tiene red saliente, así que dentro de la plataforma no se puede consultar nada externo.

## 1. Cada vecino simulado tiene (dataset, lo generamos nosotros con semilla)

- Identidad: `id`, nombre, edad, `house_id`, dirección real (OSM, 3 pueblos de Zamora), `phone` en `+3460099xxxx`.
- Núcleo familiar: quién vive en la casa, edad y movilidad de cada uno (`car | walking | reduced | immobile`).
- Recursos: `has_car`, `seats_free`, `has_smartphone`.
- Personalidad (catálogo cerrado, reparto aproximado):
  - `cooperative` 60 % · `anxious` 15 % · `reluctant` 10 % · `confused` 7 % · `no_answer` 5 % (~15 casas) · `wrong_info` 3 %.
- Ubicación: `lat, lon` de la casa; opcionalmente otra si "está fuera".
- `vulnerable: true/false` y motivo (oxígeno, encamado, teleasistencia).
- `neighbors_known`: 0 a 2 casas que conoce, para que diga "Rosa la de al lado está sola".

## 2. La conversación (ping-pong de texto)

1. Loop sobre las 300 casas, en paralelo hasta el límite de la cuenta.
2. Cada turno: Generate produce la frase del agente y un nodo Webhook la manda a
   `POST /persona/{id}/reply` con `{run_id, turn, agent_text}`. Nuestro LLM contesta como el vecino:
   `{persona_text, ended}`.
3. Objetivo 4 a 6 turnos. El agente se identifica como IA (obligatorio, AI Act), dice qué pasa y va a por los datos.
4. Al terminar, AI Extract saca el JSON (`additionalProperties: false`) y lo manda a `POST /calls/outcome`:
   - `answered`
   - `people_at_home[]` con `age` y `mobility` por persona (decide la velocidad en el mapa)
   - `declared_location` y, si lo da, `declared_lat/lon`
   - `has_car`, `seats_free`, `has_smartphone`
   - `will_evacuate` (`true | false | undecided`)
   - `consent_position`
   - `vulnerable_people[]`
   - `neighbors_mentioned[]` (nombre, dirección o teléfono)
   - `agent_notes` (una frase)
5. Regla: **lo no dicho va a `null`, nunca se inventa.** Un `null` sube la prioridad; un dato inventado la esconde.

## 3. Qué tiene que saber manejar el agente (guion por personalidad)

- **Cooperativo**: datos, instrucción, confirmar, cerrar. 4 turnos.
- **Ansioso**: repetir la instrucción en frase corta, nada nuevo, cerrar con "te vuelvo a llamar si algo cambia".
- **Reticente**: un turno de discusión como máximo. Sacar el motivo a `agent_notes`, `will_evacuate: false`, cerrar.
  La API dispara la segunda llamada con otro guion (sección 5).
- **Confuso**: preguntas de sí/no, una cosa por turno, pedir algo visible ("¿ves la iglesia?"). Si tras 6 turnos
  no hay ubicación, cerrar con `declared_lat/lon: null`.
- **Información errónea**: la detecta la API (GPS del enlace distinto de lo declarado), no el agente.
- **Menciona a un vecino**: pedir dirección o teléfono en un turno y meterlo en `neighbors_mentioned`.
- **Pide hablar con una persona**: nodo Transfer al operador (móvil de uno de nosotros).
- **Pregunta "¿a dónde voy?"**: llamar a `GET /instructions/{person_id}` y leer `say_this` tal cual. El agente no decide destino.

## 4. Refugios y capacidad (lo hace la API; conocerlo para explicarlo)

- 3 o 4 refugios reales (`SafeZone`): `capacity`, `occupancy`, `status` (`open | filling >80 % | threatened | closed`), capacidad médica sí/no.
- Asignación **por tiempo de llegada, no por distancia**: ruta real a pie o en coche, a la velocidad del más lento del
  núcleo (adulto 5 km/h, mayor de 75 unos 3, `reduced` 1,5 a 2, coche a velocidad de tramo).
- Condiciones: plaza libre, la ruta no cruza el fuego ni su cono de avance, llega antes de que el frente alcance la ruta.
- No se llenan porque la plaza se reserva **al asignar**, no al llegar. `filling` manda a los siguientes al segundo mejor;
  `threatened` reasigna a todos los de ese refugio y os genera una tanda de rellamadas.
- Vulnerables van al refugio con capacidad médica si llegan a tiempo.
- Convoyes: casas de la misma calle al mismo refugio con un coche con plazas forman grupo con coche guía.
- Lo recibís en `/instructions` como `{instruction, exit_name, route_summary, convoy, urgency, minutes_to_front, say_this}`.

## 5. Los que no cogen el teléfono (~15 casas)

1. Intento 1 sin respuesta: `POST /calls/outcome` con `answered: false`. La API pasa la casa a `no_answer`.
2. Intento 2 a los ~3 minutos (la API os lo pide por webhook o lo hacéis vosotros, a decidir). Si falla: `unreachable`.
3. La API la mete en `GET /houses/no-answer`, ordenada por `priority_rank` (minutos hasta el frente menos ETA de la
   patrulla). Una casa a la que la patrulla no llega antes que el fuego baja de prioridad.
4. **Aviso a la patrulla (vuestro)**: workflow aparte, disparado por el webhook `house_escalated_to_patrol`, que manda
   dirección exacta, personas esperadas según censo, vulnerables, minutos hasta el frente y casas cercanas también sin
   respuesta para un solo viaje. Canal: SMS o WhatsApp al "teléfono de la patrulla" (móvil nuestro) y Slack al puesto
   de mando. Solo se envía tras Aprobar en el dashboard (`POST /human/approve`).
5. Si otro vecino dice "Rosa está en casa" la API sube su prioridad; "Rosa se fue a Zamora" la baja. Por eso importa `neighbors_mentioned`.
6. Rellamada al reticente (`refusing`): guion distinto, ofrece solución al motivo si viene en `say_this` ("hay sitio en el
   coche de Antonio para tu abuela, pasa en 8 minutos") o da hora límite y qué hacer si se queda. Si sigue en no,
   pasa a la lista de patrulla con `occupants_refuse`.

## 6. Rellamadas que os dispara la API

Webhook a vuestro trigger con `{person_id, reason, say_this, urgency}`. Tres guiones:

- `route_recalculated` / `exit_reassigned`: "no sigas por ahí, tu salida ahora es X". Un turno, confirmar, cerrar.
- `at_risk` (parado 5 min o va hacia el fuego): llamada inmediata, una frase.
- `refusing` segundo intento (sección 5).

Extraer solo `acknowledged: true/false`.

## 7. Llamadas de voz reales (3 o 4)

- Mismo guion, mismo Extract, mismo `POST /calls/outcome`. Cambia el trigger (Outbound phone) y el número Telnyx de España.
- Destinos: móviles del equipo y, si se puede, uno del jurado que se mete como "una casa más" desde el dashboard.
- `ALLOW_REAL_CALLS=false` por defecto. Allowlist explícita de teléfonos reales; cualquier `+3460099xxxx` se simula siempre.

## 8. Preguntar en el stand antes de construir

- Saldo de créditos: ~300 casas x 10 mensajes x 7 créditos ≈ 20 a 25k por pasada, más rellamadas. Si no da, 100 vecinos por HappyRobot y el resto simulado.
- Límite de conversaciones en paralelo del Loop.
- Si el nodo Webhook puede esperar la respuesta de `/persona/{id}/reply` en síncrono o hay que montar dos webhooks asíncronos.
- Si el agente de voz puede llamar a una tool (`/instructions`) a mitad de conversación.

## 9. Qué os damos y cuándo

- Hoy: generador de vecinos con semilla y `POST /persona/{id}/reply` contestando en carácter. Mientras, stub con frases fijas.
- Hoy: `POST /calls/outcome` aceptando el payload del contrato.
- Mañana temprano: `GET /instructions/{person_id}` con `say_this` real.
- Túnel público (`PUBLIC_BASE_URL`) con `x-api-key`.
