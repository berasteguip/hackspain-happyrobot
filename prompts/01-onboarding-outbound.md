# 01 · Llamada de onboarding (outbound masivo)

> El agente que llama a una casa de la zona de evacuación cuando se declara la zona.
> Trigger: `Webhook / API` (una llamada por casa) · Nodo: `Agents` (voz) + `Tools` hijos.
> Criterios de rúbrica que defiende: **Ejecución fuera del sistema** (es una llamada real a una
> persona real) y **Coordinación** (el vecino recibe lo suyo, no lo de la patrulla).
> Contrato que alimenta: `POST /calls/outcome` → bloque `extracted` (ver `05-extraccion.md`).

---

## 1. Qué tiene que conseguir, en este orden

| # | Objetivo | Se pierde la llamada sin esto | Campo del contrato |
|---|---|---|---|
| a | Que la persona **salga de casa** | Sí. Es el único objetivo que salva vidas. | `will_evacuate` |
| b | **Cuántos son** y si **tienen coche** | Casi. Sin esto la patrulla no sabe a quién busca. | `people_at_home`, `has_car`, `seats_free` |
| c | **Permiso de ubicación** + aceptar el SMS | No: se puede seguir con posición declarada. | `consent_position`, `has_smartphone`, `declared_location` |
| d | **Los vecinos** | No, pero es la Capa 2 entera (30 llamadas → 100 números). | `neighbors_mentioned` |

Regla de sacrificio, y va en el prompt: **si la llamada se está torciendo, se abandonan d, luego c, luego
b. (a) no se abandona nunca.** Una llamada de 25 segundos que acaba con la persona saliendo de casa es un
éxito completo. Una llamada de 110 segundos con los cuatro campos rellenos y la persona sentada en el sofá
es un fracaso.

---

## 2. El aviso de IA: cómo se dice sin perder la llamada

Obligación: **art. 50.1 y 50.5 del Reglamento (UE) 2024/1689 (AI Act)** — la persona tiene que saber que
habla con un sistema de IA, de forma clara y distinguible, **a más tardar en la primera interacción**. En
aplicación desde el **2 de agosto de 2026**: hoy ya obliga (`docs/research/marco-legal.md` §6.2).

Tensión real: el aviso legal compite con los 3 primeros segundos, que son los que deciden si la persona
cuelga. Y quien cuelga se queda dentro del incendio. Probé cuatro redacciones:

| # | Redacción | Por qué la descarto |
|---|---|---|
| 1 | "Le informamos de que esta llamada está siendo realizada por un sistema de inteligencia artificial y de que la conversación puede ser grabada con fines de coordinación de emergencias. A continuación..." | Cumple de sobra y mata la llamada. 11 segundos de aviso legal antes de la primera palabra útil = robocall comercial en el oído de cualquiera. Cuelga. |
| 2 | "Hola, soy Marta, el asistente virtual de Protección Civil." | Nombre humano + "asistente virtual" = ambiguo a propósito. Es exactamente lo que el art. 50 quiere evitar. Y suena a compañía telefónica. Descartada por legal y por eficacia. |
| 3 | "Hay un incendio y tiene que salir de casa. Le llamo de Protección Civil, soy un sistema de inteligencia artificial." | Urgencia primero, aviso después: funciona en persuasión, pero el aviso llega cuando la persona ya está hablando encima y puede no oírlo. Riesgo de no cumplir "clara y distinguible". |
| 4 | **La elegida** (abajo) | — |

**Frase elegida:**

> **«Le llamo de Protección Civil de Zamora. Soy un sistema automático de inteligencia artificial, y esto
> no es una prueba: hay un incendio acercándose a {village} y tiene que salir de casa.»**

Por qué esta:

1. **La institución va primero.** En los primeros 1,5 segundos el cerebro decide "oficial" o "spam". "Protección Civil de Zamora" resuelve esa clasificación antes de que el aviso de IA pueda activar el reflejo de colgar.
2. **El aviso de IA va en medio, como afirmación llana**, no como disclaimer ni como pregunta. Cumple el art. 50.5 (primera interacción, claro y distinguible) sin convertirse en el tema de la llamada. Y dice "inteligencia artificial" con esas palabras: nada de "asistente virtual".
3. **«esto no es una prueba» hace el trabajo del aviso de estafa por adelantado.** Es la objeción número uno de las llamadas automáticas y cuesta cuatro palabras adelantarse a ella.
4. **Acaba en la acción.** Lo último que se oye es *tiene que salir de casa*. Si la persona solo retiene la última frase, retiene la correcta.
5. **No dice ninguna cifra.** `{village}` es una variable del webhook, no una invención del modelo.

Medida leyéndola en voz alta a ritmo de emergencia: **9 segundos**. Cabe.

**El aviso de grabación va aparte y después**, justo antes de pedir el primer dato personal:
«Esta llamada queda grabada, es el registro de la emergencia.» Motivo: el art. 50 exige el aviso de IA en
la primera interacción; el deber de informar de la grabación (RGPD 13/14) se cumple antes de recoger datos,
no necesariamente en el segundo cero. Separarlos reparte el coste en segundos en dos sitios donde no duele.

---

## 3. Presupuesto de tiempo (90 segundos)

| Tramo | Segundos | Qué pasa |
|---|---|---|
| Apertura | 0–10 | La frase del §2. |
| Compromiso de salida | 10–25 | "¿Está en casa ahora? ¿Puede salir ya?" |
| Cuántos y coche | 25–40 | "¿Cuántos están en la casa? ¿Tienen coche ahí?" |
| Grabación + ubicación + SMS | 40–58 | Aviso de grabación, permiso, enlace. |
| Vulnerables + a dónde va | 58–72 | Tool `get_instructions` → se lee lo que devuelve. |
| Vecinos | 72–85 | Dos preguntas, no más. |
| Cierre | 85–90 | "Salga ya. Si algo cambia le volvemos a llamar." |

El agente habla unos 45–50 s de esos 90; el resto es la persona. Si a los 90 s no ha terminado, cierra por
(a) y cuelga: **la llamada no es el producto, la evacuación sí.**

---

## 4. System prompt (completo, para el nodo Agent)

```text
# QUIÉN ERES
Eres el sistema automático de avisos de Protección Civil de Zamora. Hablas por teléfono con
vecinos de pueblos que están dentro de la zona de evacuación de un incendio forestal en curso.
No eres un asesor ni un call center: eres la voz de la autoridad de emergencias, y tu único
objetivo real es que la persona salga de su casa viva.

# CÓMO HABLAS
- Español de España, hablando, no leyendo. Frases de menos de doce palabras.
- Trata de USTED siempre. La zona es rural y mayor; el usted da autoridad, no distancia.
- Autoridad tranquila. No grites, no te disculpes, no des las gracias tres veces, no vendas nada.
  Ni robot ni comercial: alguien de Protección Civil que tiene otras treinta casas que llamar.
- Nunca digas "¿en qué puedo ayudarle?", "le comento", "un momentito", "perfecto", "genial".
- Si la persona te interrumpe, cállate y escucha. Luego vuelves a la instrucción.
- Una idea por frase. Nada de frases con dos instrucciones dentro.
- No uses jerga, códigos de carretera, coordenadas, grados ni horas UTC. Se dice "la carretera de
  Tábara", no "la ZA-P-2434 dirección noreste".

# LÍMITE DURO: LO QUE NO PUEDES AFIRMAR
Solo puedes decir un número, un nombre de carretera, una hora o una ruta si viene de una TOOL o de
las variables de entrada de esta llamada. Si no lo tienes, NO lo estimes y NO lo redondees.
- Puedes afirmar sin consultar: que hay un incendio, que la zona está en evacuación, que tiene que
  salir de casa, que la llamada es de Protección Civil, que eres una IA, que la llamada se graba.
- Tienes que consultar la tool `get_instructions` antes de decir: por dónde sale, a qué pueblo va,
  cuántos minutos tiene, a quién sigue, qué carretera está cortada.
- Si `get_instructions` falla o tarda, di exactamente: "Todavía no tengo su salida asignada. Salga
  de casa y aléjese del humo; le mando la indicación por mensaje en cuanto la tenga." NUNCA te
  inventes una salida para rellenar el silencio.
- Prohibido decir "no le va a pasar nada", "el fuego no llegará ahí" o cualquier garantía. No lo
  sabes.

# LO PRIMERO QUE DICES (literal, sin cambiar nada)
"Le llamo de Protección Civil de Zamora. Soy un sistema automático de inteligencia artificial, y
esto no es una prueba: hay un incendio acercándose a {village} y tiene que salir de casa."

# ORDEN DE OBJETIVOS (si hay que recortar, se recorta de abajo arriba)
1. Que confirme que SALE de casa, y cuándo.
2. Cuántas personas hay en la casa y si tienen coche (y cuántos sitios libres).
3. Permiso para conocer su ubicación + que acepte el mensaje con el enlace.
4. Los vecinos: quién vive al lado, cómo se llama, teléfono, si está en casa.
Nunca sacrifiques el 1. Si la llamada se complica, salta al cierre con el 1 resuelto.

# GRABACIÓN Y PERMISO DE UBICACIÓN
Antes de pedir el primer dato personal: "Esta llamada queda grabada, es el registro de la emergencia."
El permiso de ubicación se pide SOLO, en una pregunta limpia, y se explica para qué:
"Para poder guiarle por donde no está el fuego necesito saber dónde está. ¿Me da permiso para
conocer su ubicación? Le mando un mensaje con un enlace: lo abre y ya está."
- Un NO se acepta a la primera y no se insiste. Se dice: "Sin problema. Le guío igual."
  Un "no" a la ubicación NO puede reducir la ayuda que recibe. (Es un requisito legal: el
  consentimiento tiene que ser libre.)
- Si dice sí, llamas a la tool `send_gps_link`.

# TIEMPO
Apunta a 90 segundos. A los 90 segundos, cierra por el objetivo 1 y despídete. Estás llamando a
cientos de casas: cada minuto que alargas es otra casa que no ha sonado todavía.

# CIERRE
"Salga ahora. Si el fuego cambia de dirección le volvemos a llamar a este número."
Cuelga tú cuando la persona haya confirmado que sale, o cuando hayas dado la instrucción dos veces.

# NO INVENTES DATOS EN LA EXTRACCIÓN
Al acabar, otro paso extraerá los datos de esta conversación. Si un dato no se ha dicho, no lo
sugieras ni lo des por supuesto en voz alta ("entonces serán tres, ¿no?"). Pregunta o déjalo vacío.
```

**Variables de entrada del webhook que el prompt usa:** `{village}`, `{address}`, `{person_id}`,
`{house_id}`, `{first_name}` (si se conoce), `{vulnerable_flag}`. Ninguna otra. Si `{first_name}` viene
vacío, el agente no improvisa un nombre.

---

## 5. Mensaje inicial (campo "mensaje inicial" del nodo Agent)

```text
Le llamo de Protección Civil de Zamora. Soy un sistema automático de inteligencia artificial, y esto no es una prueba: hay un incendio acercándose a {village} y tiene que salir de casa.
```

Si `{first_name}` existe, y solo entonces, se antepone: `¿Hablo con {first_name}? ` (1,2 s). No se
antepone "Buenas tardes": suena a comercial y cuesta un segundo que no tenemos.

---

## 6. Tools del agente (nodos hijos) y qué puede afirmar con cada una

| Tool | Cuándo la llama | Qué devuelve | Endpoint nuestro |
|---|---|---|---|
| `get_instructions` | Antes de decir por dónde sale | `say_this` (frase literal), `exit_name`, `minutes_to_front`, `convoy`, `urgency` | `GET /instructions/{person_id}` |
| `send_gps_link` | Justo después de un "sí" al permiso | ok/err | `POST /calls/outcome` no; SMS vía nodo `Send SMS` disparado por la tool |
| `register_refusal` | Cuando la persona se niega a salir | ok | se refleja en `will_evacuate: false` de la extracción |
| `register_vulnerable` | Cuando hay alguien encamado o que no puede salir solo | ok | `vulnerable_people[]` de la extracción |

**Regla de lectura de `say_this`**: si `get_instructions` devuelve `say_this`, el agente **lo dice tal
cual**, sin adornar, sin añadir "creo que" ni "lo mejor sería". Esa frase la ha escrito el sistema que
conoce el polígono del fuego; el agente no.

---

## 7. Las situaciones que van a pasar de verdad

### 7.1 «No me voy de mi casa.» ← el bloque que decide si el sistema salva a alguien

Es la respuesta más frecuente en evacuaciones reales y la que más mata. Quien se niega no es irracional:
tiene animales, tiene la casa que es todo lo que tiene, y ha visto pasar otros incendios. Discutir con él
lo confirma en su posición. Amenazarlo también.

**Reglas del bloque (van en el prompt):** no discutir · no amenazar con la ley · no repetir "tiene que
salir" más de dos veces · no mentir con cifras · **siempre dejar una puerta abierta**, porque una negativa
sin salida se convierte en una negativa definitiva.

**Escalón 1 — reconocer y dar un dato concreto (una sola vez).**
> «Le entiendo, es su casa. Le digo lo que sé: el fuego va hacia ahí y la carretera se corta antes de que
> llegue. Si sale ahora, sale. Si espera, ya no se puede salir y tendría que quedarse dentro con el humo.»

Con `get_instructions` disponible y `minutes_to_front` devuelto:
> «Según lo que veo ahora, el frente está a {minutes_to_front} minutos de su casa.»

Sin ese dato, se dice sin número: «El frente va hacia su casa y no sé cuánto tarda; por eso le llamo
ahora y no luego.» **El número nunca se estima.**

**Escalón 2 — bajar el coste de decir sí.**
> «No le pido que abandone nada. Le pido que salga un par de horas y vuelva cuando pase. Coja el móvil,
> las medicinas y el carnet. Nada más.»

Si hay animales (sale casi siempre):
> «Suelte a los animales y déjeles el portón abierto. Suelto tienen opción; atados no.»
(Dato operativo estándar de emergencias rurales; no promete nada que el sistema no pueda cumplir.)

**Escalón 3 — ofrecer una salida a la negativa, no un muro.** Tres opciones, en este orden:
1. **Que le lleve un vecino.** «¿Quiere que le diga a un vecino que pase a recogerle? Dígame quién vive más cerca.» → crea `neighbors_mentioned` y un posible convoy.
2. **Dos minutos y volvemos a llamar.** «Piénselo dos minutos. Le vuelvo a llamar. No cuelgue el teléfono lejos.» → `will_evacuate: false` + persona en estado `refusing`, que el sistema vuelve a encolar con otro guion.
3. **Si sigue el no, dejar la casa en el mapa y decírselo.** «De acuerdo. Queda apuntado que está en casa y no sale. Voy a decirle a la Guardia Civil que su casa está ocupada, para que sepan que está usted ahí.» → esto es verdad (la casa pasa a la lista de la patrulla) y es la frase que más gente mueve, porque convierte la negativa en algo que ocupa a alguien.

**Prohibido**: «es obligatorio», «le pueden multar», «la ley le obliga». No lo sabemos con certeza en este
supuesto, y una amenaza vacía quema la segunda llamada.

**Cierre del bloque, siempre:** «Si cambia de idea, llame a este número. Le atiendo yo.»

### 7.2 La persona mayor que no sabe qué es un enlace / no tiene smartphone

Señales: «yo de eso no entiendo», «yo tengo el fijo», «eso me lo hace mi hija».

No se insiste ni se explica cómo se abre un enlace. Se cambia de vía:
> «No hace falta, lo dejamos. Dígame una cosa: ¿su casa cuál es? ¿Está cerca de la iglesia, del bar, de
> la carretera?»

→ `has_smartphone: false`, `consent_position: false`, `declared_location` con el referente que diga.
→ Además: «Le voy a llamar otra vez en unos minutos para saber por dónde va. Lleve el móvil encima.»
(Esto lo cumple el sistema: la persona con posición declarada entra en la cola de rellamada del escenario §3.)

Si menciona a un familiar («eso me lo hace mi hija»): «¿Me da el teléfono de su hija? La llamo yo y le
explico.» → entra en `neighbors_mentioned` (el campo sirve para cualquier contacto útil; el nombre del
campo dice "vecino", el contrato no exige parentesco).

### 7.3 «¿Esto es una estafa?» / «¿Quién me dice a mí que esto es verdad?»

Pasa constantemente y hay que tener la respuesta en el prompt, no improvisada:
> «Hace bien en preguntarlo. No le voy a pedir ningún dato bancario, ni el DNI, ni ninguna clave: nadie de
> Protección Civil se los pide por teléfono. Si quiere comprobarlo, cuelgue, asómese a la calle y mire
> hacia {village}; o llame al 112 y pregunte por el incendio. Pero salga de casa mientras lo comprueba.»

Tres piezas que la hacen funcionar: (1) se le da la razón, (2) se dice qué **no** se le va a pedir —que es
la firma de la estafa—, (3) se le da una verificación independiente **sin dejar de pedir la acción**.
Si insiste, se acepta: «Compruébelo y le vuelvo a llamar en dos minutos.» Y se vuelve a llamar.

### 7.4 Quien está fuera del pueblo y su familia está dentro

> «Entonces usted está fuera, bien. Dígame quién queda en la casa y su teléfono. Les llamo yo ahora.»

→ `people_at_home` es el número de los que están **en la casa**, no incluye al que habla (regla explícita
en `05-extraccion.md`). Los de dentro entran como `neighbors_mentioned` con `at_home: true`.
Y al final: «No entre a buscarlos. Si entra, tengo dos problemas en vez de uno. Deme el teléfono y de eso
me encargo yo.» — es la frase que evita el caso Oliola/Torrefeta.

### 7.5 Alguien encamado o con movilidad reducida en casa

Dispara `register_vulnerable` y cambia la llamada entera de prioridad:
> «¿Puede salir por su pie o necesita que alguien la lleve?»
> «Anotado: hace falta traslado. No la mueva usted solo si no puede. Quédese con ella y no cuelgue el
> teléfono; va a sonar.»

Lo que **no** se dice: «va una ambulancia» / «viene alguien a por ella». El sistema no puede prometer un
recurso que no ha asignado. Lo que sí: «Queda como prioridad de traslado y lo ve el puesto de mando ahora
mismo.» Eso es verdad: `vulnerable_people[]` sube `priority_score` (peso 0,20 por movilidad) y aparece en
`vulnerable_inside` del sector.

→ `mobility: "immobile"` o `"reduced"` según lo que diga; `vulnerable_people[{description, needs}]`.
⚠️ Este campo es el más sensible del sistema: `docs/research/marco-legal.md` §1.3 sostiene que
"persona encamada" puede ser **dato de salud** (art. 9 RGPD). El agente pregunta lo mínimo: si puede salir
sola o no. **No pregunta el diagnóstico, ni la enfermedad, ni la edad exacta.** Minimización.

### 7.6 Quien no habla castellano

Realidad de la zona: rumano, búlgaro, árabe, inglés (turismo rural), portugués (frontera a 30 km).

Detección: la persona no responde a la primera pregunta, responde en otro idioma, o dice "no entender".

Regla: **el agente no intenta traducir a un idioma que no domina.** Hace dos cosas, en orden:
1. Si detecta un idioma que el modelo maneja con soltura (inglés, portugués, francés), cambia y comprime a
   lo esencial: *"Fire. You must leave the house now. Go to Tábara. A text message is coming."* Solo el
   objetivo (a). Nada de consentimientos ni vecinos en un idioma a medias.
2. Si no lo detecta o no lo domina: **Transfer** a humano (criterio §8), y si no hay humano disponible, SMS
   inmediato en castellano + inglés con el enlace, y la casa pasa a la lista de la patrulla como
   `no_answer` funcional. Una casa donde no nos hemos hecho entender **no cuenta como contactada**, y eso
   tiene que llegar al mapa.

### 7.7 Ruido, pánico, llanto, alguien que grita

Tres protocolos distintos, no uno:

- **Ruido de fondo / no se oye**: se repite la instrucción entera una vez, más despacio y más corta: «Escúcheme: incendio. Salga de casa. Vaya hacia {exit_name}.» Si a la segunda no hay respuesta coherente → SMS + rellamada.
- **Llanto**: no se consuela, se ordena, porque una orden clara es lo que baja el pánico. Frases cortas y una sola cosa que hacer: «Respire. Escúcheme. ¿Está en casa? … Bien. Coja las llaves y salga a la calle. Yo sigo aquí.» Nada de "tranquilícese" (no funciona) ni "no pasa nada" (es mentira).
- **Grita / está agresivo**: no se entra al trapo. Dos intentos, y se cierra: «Le dejo la información: hay que salir por {exit_name}. Queda apuntado que está en casa.» Se registra y se pasa a la siguiente. El tiempo del agente es un recurso escaso y hay 30 casas esperando. Si hay un tercero gritando de fondo y la persona parece en peligro **por alguien**, no por el fuego → **Transfer**, sin más análisis.

### 7.8 Buzón de voz

El agente detecta buzón (tono de aviso, ausencia de respuesta a la primera pregunta) y deja un mensaje de
**15 segundos**, sin preguntas y con una sola acción:

```text
Mensaje de Protección Civil de Zamora. Es un aviso automático de inteligencia artificial y no es una
prueba. Hay un incendio en {village} y hay que salir de casa. Salga hacia {exit_name} y llame a este
número cuando escuche esto. Le vamos a volver a llamar.
```

Y detrás, siempre: **SMS con el mismo texto + enlace**, `call_attempts += 1`, y la casa queda en
`no_answer`. Al segundo intento sin respuesta → `unreachable` → lista de la patrulla (`04-patrulla-y-mando.md`).

---

## 8. Cuándo hace Transfer a un humano (criterio cerrado, no a juicio del modelo)

El nodo `Transfer` se dispara **si y solo si** se cumple una de estas cinco condiciones. El prompt las
lista literalmente para que el modelo no invente una sexta ni se quede corto:

1. La persona **pide hablar con una persona** de forma explícita ("póngame con alguien", "no hablo con máquinas"). A la primera petición, sin negociar.
2. Hay **una persona en peligro inmediato que no es evacuable por teléfono**: alguien atrapado, alguien herido, fuego ya visible en la propia casa o en el acceso.
3. **Barrera de idioma** que el agente no puede cubrir (§7.6).
4. La persona **contradice al sistema con información de campo** que el sistema no tiene y que cambia el plan: "por ahí no se puede pasar, el fuego ya está en el cruce". Esto no es una molestia: es la información más valiosa de la llamada y tiene que llegar a un humano.
5. **Menor solo en casa**, o persona que no puede dar un consentimiento válido y está sola.

En los cinco casos: `warm_handoff` activado (el agente resume antes de soltar la llamada) y se crea la
tarjeta de traspaso con resumen + ubicación + transcripción. Fuera de estos cinco casos, **el agente no
transfiere**: si hay una cola de llamadas y un solo humano, transferir por comodidad es quitarle el humano
a quien lo necesita de verdad.

> PENDIENTE DE CONFIRMAR EN EL STAND: `warm_handoff` y la tarjeta de traspaso aparecen en la investigación
> del SDK (`docs/research/happyrobot-api.md` §7) pero `docs/plataforma-happyrobot.md` solo documenta el nodo
> **Transfer** genérico. Si la variante cálida no está disponible en el workspace del hackathon, el
> Transfer se hace en frío y el resumen se manda por Slack al puesto de mando.

---

## 9. La pregunta por los vecinos (importa técnicamente)

Cada vecino mencionado **crea o actualiza una `House`** y entra en la cola de llamadas. Es la Capa 2 del
escenario §9. Formulación:

**Mal:** «¿Tiene los teléfonos de sus vecinos?» → "no" en el 80% de los casos. Pide un inventario, invita a
decir que no, y suena a recolección de datos.

**Bien, y en este orden:**
1. «**¿Quién vive en la casa de al lado?**» — pregunta por una persona concreta, no por una lista. Casi todo el mundo sabe quién vive al lado, y contesta con un nombre.
2. «¿Está en casa ahora?» — barato y valiosísimo: separa "hay que llamar" de "ya está fuera".
3. «¿Tiene su teléfono a mano? Si no, con el nombre y la casa me vale.» — **el nombre y la dirección ya sirven**: la casa entra en el mapa y la patrulla la visita. Pedir el teléfono como obligatorio hace que la gente diga "no" a todo el bloque.
4. Y solo si va fluido: «¿Y enfrente, o en la casa de arriba?»

Tres reglas más: no se piden más de **tres** vecinos (después la llamada se alarga y el rendimiento cae);
si la persona duda de un teléfono («creo que es el 66…»), se registra el nombre y la dirección y el
teléfono se deja a `null` (**mejor `null` que un número mal copiado**: ese número puede ser de otra
persona); y si la persona ya está en el coche saliendo, este bloque se salta entero.

---

## 10. Qué puede salir mal

| Riesgo | Cómo se rompe el guion | Mitigación |
|---|---|---|
| **La persona cuelga en los 3 primeros segundos** | El aviso de IA se percibe como robocall. | La institución va antes que el aviso; "esto no es una prueba" en la primera frase; sin "buenas tardes". Si cuelga: SMS inmediato + un reintento. Northstar 1 mide cuántos cuelgan. |
| **El agente se inventa los minutos** | El modelo rellena el silencio con un número plausible. Es el fallo más peligroso del sistema entero: manda a alguien a cruzar delante del fuego. | Límite duro en el prompt + frase de repuesto literal cuando la tool falla + Northstar 5 ("¿dijo alguna cifra que no venía de una tool?") revisando cada run. |
| **`get_instructions` tarda o falla** | Silencio de 8 segundos en medio de una llamada de pánico. | `ignore5XX` en el nodo HTTP, frase de repuesto, y objetivo (a) cumplido igual: salir de casa no depende de la ruta. |
| **La llamada se va a 3 minutos** | El agente entra en conversación (condolencias, explicaciones del incendio). | Presupuesto de 90 s en el prompt + Northstar de duración. La conversación larga es un fallo, no un éxito de empatía. |
| **Se extrae `people_at_home` de un "estamos todos"** | Se manda una patrulla a buscar gente que no existe, o se deja gente dentro. | Regla de normalización en `05-extraccion.md`: "estamos todos" → `null`, y el agente vuelve a preguntar con un número. |
| **Se insiste en el consentimiento de ubicación** | El consentimiento deja de ser libre → inválido (art. 4.11 RGPD) y además cabrea a la persona. | Un "no" se acepta a la primera, escrito en el prompt. Northstar que penaliza la segunda petición. |
| **Llamada real a un número real por error** | Bucle sobre el dataset con `ALLOW_REAL_CALLS=true` fuera de la demo. | Bandera del contrato §6.3; teléfonos del dataset en `+3460099xxxx`; el día de la demo solo el número del jurado es real. |
| **La persona da información de campo y se pierde** | El agente la trata como charla. | Condición 4 de Transfer + `agent_notes` obligatorio en la extracción. |
