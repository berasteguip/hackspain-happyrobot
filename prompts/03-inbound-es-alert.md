# 03 · Llamada entrante (la puerta de la Capa 0)

> Alguien nos llama. Trigger: `Inbound phone call`. Es la puerta de entrada de la Capa 0 del escenario §9:
> el ES-Alert (o el bando, o el boca a boca) no nos da teléfonos, **da un número al que llamar**, y este
> guion es lo que hay detrás de ese número.
> Criterios de rúbrica: **Decisión sin datos completos** (el agente no sabe ni quién es ni dónde está) y
> **Coordinación** (de una llamada entrante salen tres cosas: una persona en el mapa, vecinos en la cola, y
> a veces información de campo que cambia el plan de todos).

**La diferencia con el onboarding es total:** en el onboarding sabemos la casa, el pueblo y el teléfono, y
nos falta saber si la persona está dentro. Aquí sabemos el teléfono y **nada más**. El primer trabajo del
agente no es informar: es **poner a esta persona en el mapa**, porque una persona sin coordenada no recibe
ruta, no entra en un convoy, no cuenta en el recuento de un sector y no sube la prioridad de una descarga
aérea. Existe para nosotros o no existe.

---

## 1. Apertura y aviso de IA

La persona ha llamado **ella**, así que el riesgo de que cuelgue es mucho menor que en el outbound: aquí el
aviso de IA puede ir completo y limpio, sin negociar segundos.

> **«Emergencias por incendio, Protección Civil de Zamora. Le atiende un sistema de inteligencia
> artificial, y la llamada queda grabada. Dígame, ¿en qué pueblo está?»**

Tres cosas y una pregunta, en 8 segundos:
1. **Para qué es este número** — evita que la use quien busca otra cosa.
2. **Aviso de IA completo** (art. 50.1) y **aviso de grabación** (RGPD 13) juntos: aquí sí caben, porque
   quien llama no va a colgar por oírlo.
3. **La primera pregunta es la ubicación, no "¿en qué puedo ayudarle?"**. Quien llama a un número de
   emergencia de incendios ya sabe por qué llama; preguntarle el motivo regala 15 segundos y una
   divagación. Preguntar el pueblo le da estructura a la conversación desde la primera frase.

---

## 2. La bifurcación cero: esto no es el 112

Antes de cualquier otra cosa, si aparece cualquier señal de emergencia médica o de persona atrapada:

> **«Si hay alguien herido, atrapado o sin poder respirar, cuelgue y llame al 112 ahora mismo. Yo le llamo
> a usted en cuanto cuelgue.»**

Y el agente **cuelga primero él si hace falta**. Esto va en el prompt como la regla número uno del guion
entrante, por dos razones: porque es lo correcto, y porque un sistema de hackathon que se interpone entre
un herido y el 112 es indefendible delante de un jurado y de cualquier otra persona.

Señales que la disparan: "se ha quemado", "no respira", "está atrapado", "se ha caído", "el fuego está en
la casa", "no podemos salir", "hay humo dentro". Ante la duda, se dispara.

Después de decirlo, se registra: `Transfer` si hay humano disponible, y en todo caso aviso a Slack del
puesto de mando **con el teléfono**, para que un humano devuelva la llamada.

---

## 3. System prompt (nodo Agent, trigger Inbound)

```text
# QUIÉN ERES
Eres el sistema de atención telefónica de Protección Civil de Zamora durante un incendio forestal.
Te llaman vecinos de la zona. No sabes quién te llama ni dónde está. Tu trabajo, en este orden:
  1. Si hay un herido o alguien atrapado: mandarle al 112 y cortar. Antes que nada.
  2. Situarle en el mapa: pueblo, y dentro del pueblo lo más preciso que puedas.
  3. Decirle qué hacer: consultas `get_instructions` y dices lo que devuelva.
  4. Sacarle a quién más hay: en su casa y en las casas de al lado.

# PRIMERA FRASE (literal)
"Emergencias por incendio, Protección Civil de Zamora. Le atiende un sistema de inteligencia
artificial, y la llamada queda grabada. Dígame, ¿en qué pueblo está?"

# CÓMO HABLAS
- Español de España, hablando. Frases cortas. Usted. Autoridad tranquila, nada de call center.
- No digas "¿en qué puedo ayudarle?", "le comento", "perfecto", "genial", "un momentito".
- Una pregunta por turno. Nunca dos preguntas en la misma frase: la gente contesta solo a una.
- Si la persona se lanza a contar, déjala 5 segundos y reconduce: "Le sigo. Dígame el pueblo primero."

# LÍMITE DURO: LO QUE NO PUEDES AFIRMAR
No digas ni un número, ni una hora, ni un nombre de carretera, ni por dónde va el fuego, si no te lo
ha dado una tool. No estimes. No redondees. No calcules.
- Puedes afirmar sin consultar: que hay un incendio activo en la zona, que la zona está en
  evacuación, que hay que salir de casa, que eres una IA, que la llamada se graba.
- Necesitas `get_instructions` antes de decir: la salida, el pueblo de destino, los minutos, la
  carretera cortada, el convoy.
- Si no tienes la respuesta a algo que te preguntan, la frase es: "Eso no lo sé." Y sigues.
  "No lo sé" dicho con calma da más confianza que una cifra inventada, y no mata a nadie.

# SITUAR A LA PERSONA (lo más importante que haces)
Vas de lo grande a lo pequeño y paras cuando tengas algo que una patrulla pueda encontrar:
  1. "¿En qué pueblo está?"
  2. "¿Está dentro del pueblo o en el campo?"
  3. Si está en el pueblo: "¿En qué calle?" y si no la sabe: "¿Qué tiene cerca? ¿La iglesia, el bar,
     la carretera, el cementerio?"
  4. Si sigue sin concretar: "¿De quién es la casa donde está?" — en un pueblo pequeño el apellido
     de la casa la localiza mejor que el número del portal.
  5. Si va en coche: "¿Por qué carretera va? ¿Qué pueblo ha pasado el último?" — el último pueblo
     pasado es el mejor ancla para alguien que se mueve.
  6. Siempre que tenga móvil, ofrece el enlace: "Le mando un mensaje con un enlace. Lo abre y ya sé
     dónde está exactamente." Es la vía más rápida y la más precisa.
Lo que consigas va en `declared_location` con las palabras que dijo la persona, no con las tuyas.
Si no consigues NADA más que el pueblo, con el pueblo te vale: apuntas el pueblo y sigues.
Nunca inventes una calle ni un número para que el campo no quede vacío.

# CONSENTIMIENTO DE UBICACIÓN
Aunque llame ella, el permiso se pide, no se supone:
"Para guiarle necesito saber dónde está. ¿Le mando el enlace y me da permiso para ver su ubicación?"
Un "no" se acepta a la primera y no reduce la ayuda: "Sin problema, le guío igual."

# CIERRE
Repite la única cosa que tiene que hacer, y cuelga:
"Resumo: [la acción]. Si cambia algo le llamamos a este número."

# DURACIÓN
Apunta a dos minutos. Si pasas de tres, cierra: hay más llamadas entrando y esta persona ya sabe
lo que tiene que hacer.
```

---

## 4. Cómo se confirma una ubicación cuando la persona no sabe decir dónde está

Pasa más de lo que parece: gente mayor que nunca ha usado el nombre de su calle, gente en una finca sin
dirección, gente que ha salido corriendo y no sabe por dónde va. Escalera de recursos, del más fácil al
más raro, tal como va en el prompt:

| # | Pregunta | Por qué funciona | Qué se consigue |
|---|---|---|---|
| 1 | «¿En qué pueblo está?» | Todo el mundo sabe esto. | `declared_location` mínimo viable: un pueblo ya tiene sector y `minutes_to_front`. |
| 2 | «¿Dentro del pueblo o en el campo?» | Binaria. | Cambia la ruta entera: en el campo no hay calle a la que mandar una patrulla. |
| 3 | «¿Qué tiene cerca? La iglesia, el bar, la báscula, el frontón, la fuente, el cementerio…» | Se pregunta por lo que hay en **todos** los pueblos de la zona, no por una dirección postal. | Referente reconocible por la patrulla local, que es quien va a ir. |
| 4 | «¿De quién es la casa?» | En un pueblo de 80 vecinos, "la casa de los Prieto" es una dirección. | Localización social, la más fiable en rural. |
| 5 | «Mire la placa de la esquina y dígame lo que pone.» | Convierte "no sé mi calle" en un dato exacto en 10 segundos. | Calle real. |
| 6 | «¿Qué ve delante de usted ahora mismo?» | Para quien está desorientado o en movimiento. | Referente + rumbo. |
| 7 | En coche: «¿Qué pueblo ha pasado el último? ¿Va hacia dónde?» | La posición de alguien que se mueve caduca; el último pueblo y el sentido no. | Tramo + dirección, que es lo que necesita el cono del fuego. |
| 8 | **El enlace por SMS** | Resuelve todo lo anterior de golpe, con precisión de metros. | `position_source: "gps"` en vez de `"declared"`, que en el dashboard es la diferencia entre borde continuo y discontinuo. |

Regla de oro del bloque: **se acepta lo que haya.** El sistema está diseñado para funcionar con
`position_source: "declared"` y trata esa incertidumbre subiendo la prioridad (peso 0,15 de
`priority_score` en `docs/contrato-de-datos.md` §4). Una ubicación mala y honesta es útil; una ubicación
precisa e inventada es un desastre, porque manda una patrulla a una calle que no existe.

---

## 5. Los cuatro tipos de llamada entrante que van a llegar

### 5.1 «Estoy en el pueblo, ¿qué hago?» — el caso bueno

Es el onboarding al revés y sale en 90 s: situar → `get_instructions` → decir la instrucción → vecinos →
cerrar. Se rellena el mismo `extracted` que el guion 01.

### 5.2 «Mi madre vive en Losacio y no me contesta al teléfono» — el caso más valioso

Quien llama **no está en peligro**; la persona en peligro no está al teléfono. Aquí el agente no tiene que
guiar a nadie: tiene que **crear una casa en el mapa**.

```
"¿Cómo se llama su madre y en qué calle vive?"
"¿Tiene usted su número de teléfono? Démelo."
"¿Vive sola? ¿Se mueve bien, anda sin ayuda?"
"¿Tiene coche, o no conduce?"
"¿Sabe si hay alguien más en la casa?"
```
→ `neighbors_mentioned: [{name, phone, address, at_home}]` con `at_home: true` si la sitúa dentro, y
`vulnerable_people` si procede. Esa casa entra en la cola de llamadas y, si no contesta dos veces, en la
lista de la patrulla.

Y la frase que hay que decir siempre, la más importante de este bloque:
> **«No vaya usted a buscarla. Si entra, tengo dos personas dentro en vez de una. La llamo yo y le vuelvo
> a llamar a usted para contarle.»**

Eso último **es un compromiso que el sistema sí puede cumplir** (el workflow programa una llamada de vuelta
al número que ha llamado). Si el equipo decide no implementar la llamada de vuelta, hay que **quitar la
segunda mitad de la frase**: no se promete lo que no se hace.

### 5.3 «¿Qué está pasando?» — quien llama a informarse

Riesgo: convertir el sistema en un servicio de información y quemar capacidad. Respuesta acotada: **tres
datos y giro**.

```
"Hay un incendio forestal activo en la zona y hay pueblos en evacuación. Dígame dónde está usted y le
digo si le afecta."
```
Si está fuera de la zona: «Usted no está en zona de evacuación. No se acerque y deje las carreteras
libres.» + si tiene familia dentro → rama 5.2. Y se cierra. 40 segundos.

Nada de descripciones del incendio, hectáreas, medios desplegados ni previsiones: **el agente no tiene esos
datos y no se los puede inventar**, y además no es su trabajo.

### 5.4 «Por ahí no se puede pasar, el fuego ya está en el cruce» — información de campo

La llamada más valiosa que puede entrar, porque es información que el sistema **no tiene** y que invalida
rutas de mucha gente a la vez. El agente:

1. Pregunta lo justo para que sea utilizable: «¿Qué carretera? ¿Entre qué dos pueblos? ¿Lo está viendo usted ahora mismo?»
2. Lo registra en `agent_notes` con las palabras de la persona.
3. Dispara la tool `report_field_info`, que en `api/` **no cierra la carretera directamente**: crea una entrada de `decision_log` de tipo `approval_requested` que **aparece en el dashboard esperando que un humano la confirme**.
4. Y le dice la verdad sobre lo que va a pasar con su aviso: «Queda avisado el puesto de mando. Usted no pase por ahí.»

Por qué no se cierra automáticamente: el contrato marca `RoadClosure.source` y una fuente `guardia_civil`
no es lo mismo que un vecino por teléfono. Cerrar la N-631 para 40 personas porque una llamada sin verificar
lo dijo es exactamente el tipo de decisión que necesita un humano. **Que el sistema sepa distinguir la
información que aplica sola de la que necesita aprobación es el criterio "Control" de la rúbrica**, y aquí
se ve en una pantalla, en directo.

Si el aviso lo da una patrulla desde su número conocido (`Patrol.channel`), entonces sí se aplica solo. La
fuente cambia la consecuencia.

---

## 6. Notas de integración (para quien implemente `api/` y el workflow)

- En una llamada entrante **no hay `person_id`**. La extracción manda `person_id: null` + `phone`, y `api/`
  resuelve por teléfono: si el número existe, actualiza esa `Person`; si no, crea una nueva con
  `position_source: "declared"`. El modelo lo permite (`person_id: str | None`), pero **conviene
  confirmarlo con el dueño de `api/`** para que no se descarte el payload.
- `get_instructions` necesita un `person_id`. En una entrante, el agente **no puede llamarla hasta que la
  persona esté creada**. Orden obligatorio en el grafo: situar → `POST /calls/outcome` parcial (o un
  `POST /people` si existe) → ya con el `person_id` devuelto, `get_instructions`. Si eso no está resuelto,
  el guion entrante da la instrucción genérica ("salga de casa y aléjese del humo") y la ruta llega después
  por SMS. **No se bloquea la llamada esperando un id.**
- El número de entrada tiene que estar comprado en Telnyx y apuntado al workflow. A 19 sep no lo está
  (`docs/plataforma-happyrobot.md` §5). **PENDIENTE DE CONFIRMAR EN EL STAND**: cuánto tarda en
  aprovisionarse un número español y si se puede recibir entrantes con el número de pruebas del workspace.

---

## 7. Qué puede salir mal

| Riesgo | Qué pasa | Mitigación |
|---|---|---|
| **No hay número entrante el día de la demo** | El guion 03 no se puede enseñar en directo. | Plan B: el trigger **Web call** hace exactamente lo mismo desde el navegador y es lo que usa el jurado en `07-guion-demo.md`. El inbound telefónico se enseña como configuración, no como demo. |
| **El agente se queda en la ubicación 3 minutos** | Cola de entrantes, capacidad quemada. | Regla "el pueblo ya vale" + tope de 3 min en el prompt. Preferimos 60 personas situadas a nivel pueblo que 12 con la calle exacta. |
| **Alguien reporta un corte falso y el sistema lo aplica** | Se reenrutan 40 personas por una carretera peor. | No se aplica solo: `approval_requested` + humano. La fuente determina la consecuencia. |
| **Se convierte en hotline de información** | 2 minutos por llamada de gente que no está en riesgo. | Rama 5.3: tres datos y giro; si está fuera de zona, se cierra en 40 s. |
| **Un herido llama aquí en vez de al 112** | Retraso en asistencia sanitaria. | Bifurcación cero, antes de todo lo demás, con "cuelgue y llame al 112" + aviso a Slack con el teléfono. |
| **`declared_location` con una calle inventada por el modelo** | Una patrulla va a una dirección que no existe mientras el fuego avanza. | "Nunca inventes una calle" en el prompt + `05-extraccion.md` obliga a copiar las palabras de la persona + `null` si no lo dijo. |
| **Llamada en otro idioma** | No nos hacemos entender y la persona se queda sin nada. | Igual que §7.6 del guion 01: idioma que el modelo domine → mensaje mínimo; si no → Transfer, y si no hay humano, SMS bilingüe. |
