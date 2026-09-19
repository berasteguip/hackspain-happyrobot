# 05 · Esquema de extracción (nodo AI Extract)

> Convierte una conversación en el bloque `extracted` de `POST /calls/outcome`. **Exactamente ese bloque:
> ni un campo más, ni uno menos.** Fuente: `docs/contrato-de-datos.md` §3 + `api/models.py`
> (`CallExtracted`, `NeighborMention`, `VulnerablePerson`, `Mobility`).
> Criterio de rúbrica: **Decisión sin datos completos** — este fichero es donde se decide qué es un dato y
> qué es una suposición, y esa frontera es la que hace que el resto del sistema pueda razonar con huecos.

## La regla que gobierna el fichero

> **Si la persona no lo ha dicho, el valor es `null`. Nunca un valor plausible.**

Un `people_at_home: 3` inventado manda a una patrulla a buscar a gente que no existe, mientras el fuego
avanza y hay una casa real esperando. Un `null` no hace eso: el sistema sabe que no lo sabe y **sube la
prioridad** por incertidumbre (peso 0,15 de `priority_score`). El sistema está construido para trabajar con
`null`. No está construido para trabajar con mentiras.

Corolario del contrato §1: **`null` ≠ `0`.** `seats_free: 0` es "el coche va lleno". `seats_free: null` es
"no lo sé". Son decisiones opuestas para quien reparte plazas de convoy.

---

## 1. Cotejo campo por campo contra el contrato

Enumeración de las dos partes, una al lado de la otra. Izquierda: lo que el contrato y `api/models.py`
declaran. Derecha: lo que este esquema produce.

| # | `CallExtracted` (contrato + código) | Tipo | Este esquema | ¿Coincide? |
|---|---|---|---|---|
| 1 | `people_at_home` | `int \| null` | `people_at_home` | ✅ |
| 2 | `declared_location` | `str \| null` | `declared_location` | ✅ |
| 3 | `declared_lat` | `float \| null` | `declared_lat` | ✅ |
| 4 | `declared_lon` | `float \| null` | `declared_lon` | ✅ |
| 5 | `mobility` | enum `car\|walking\|reduced\|immobile` `\| null` | `mobility` | ✅ |
| 6 | `has_car` | `bool \| null` | `has_car` | ✅ |
| 7 | `seats_free` | `int \| null` | `seats_free` | ✅ |
| 8 | `has_smartphone` | `bool \| null` | `has_smartphone` | ✅ |
| 9 | `consent_position` | `bool \| null` | `consent_position` | ✅ |
| 10 | `will_evacuate` | `bool \| null` | `will_evacuate` | ✅ |
| 11 | `neighbors_mentioned[]` → `name`, `phone`, `address`, `at_home` | lista de objetos, 4 campos, todos anulables | igual, los 4 | ✅ |
| 12 | `vulnerable_people[]` → `description`, `needs` | lista de objetos, 2 campos, anulables | igual, los 2 | ✅ |

**Resultado: 12 campos a cada lado, coincidencia exacta. Ningún campo extra, ninguno que falte.**
Listas por defecto `[]` (no `null`), igual que `Field(default_factory=list)` en el modelo.

### Los otros campos de `POST /calls/outcome` no los pone el extractor

| Campo del payload | Quién lo rellena |
|---|---|
| `run_id` | variable del run de HappyRobot |
| `person_id` | variable de entrada del webhook (en entrantes: `null`, ver `03-inbound-es-alert.md` §6) |
| `phone` | variable del run |
| `answered` | resultado de la llamada (nodo del workflow, no el extractor) |
| `duration_s` | resultado de la llamada |
| `extracted` | **este esquema** |
| `agent_notes` | **este esquema** (campo 13, ver §4) |
| `transcript_url` | variable del run |

### Campos que me habría gustado tener y que NO existen

`refusal_reason`, `language`, `needs_callback`, `field_report`, `animals`, `scam_suspected`.
**No se añaden por mi cuenta** (contrato §6.1: "no inventes campos"). Todos viajan dentro de `agent_notes`
como texto, que es el sitio legítimo para lo que no tiene campo. Si el equipo los quiere estructurados, se
añaden **primero** a `docs/contrato-de-datos.md` y a `api/models.py`, y luego aquí.

---

## 2. El esquema, campo a campo, con su instrucción anti-invención

En el nodo **AI Extract** la descripción de cada campo *es* el prompt de ese campo. Van redactadas para
pegar tal cual.

### 2.1 `people_at_home` · entero · anulable

```text
Cuántas personas hay FÍSICAMENTE en la casa en el momento de la llamada, incluida la persona con la
que hablas SOLO SI ella está en la casa.
- Cuenta bebés, niños y visitantes. NO cuentes animales.
- Si quien habla está fuera del pueblo y su familia está dentro, cuenta solo a los de dentro y NO
  la cuentes a ella.
- Si la persona da un número, ponlo: "somos tres" -> 3. "mi mujer y yo" -> 2. "yo solo" -> 1.
  "estoy con mi madre y mis dos hijos" -> 4.
- Si da un rango ("cuatro o cinco"), pon el MAYOR y copia la frase literal en agent_notes. Buscar a
  una persona de más cuesta minutos; dejar a una dentro no tiene arreglo.
- Si NO da un número, pon null. En concreto, estas frases valen null y no un número:
  "somos los de siempre", "estamos todos", "los de casa", "la familia", "unos cuantos", "nosotros".
  No hay ninguna manera de saber cuántos son "los de siempre".
- Si la persona dice que está sola en casa, pon 1 (eso sí es un número).
```

Y la contramedida al final de la cadena: cuando el agente oye "estamos todos", **vuelve a preguntar con un
número**: «¿Cuántos son, contándose usted?» (regla en el prompt del guion 01). El extractor no arregla lo
que la llamada no preguntó.

### 2.2 `declared_location` · texto · anulable

```text
Dónde dice la persona que está, CON SUS PALABRAS. Copia, no interpretes.
- "Calle Mayor 4" -> "Calle Mayor 4". "Al lado de la iglesia" -> "al lado de la iglesia".
  "En la casa de los Prieto" -> "en la casa de los Prieto".
- Si dice pueblo y calle, pon los dos: "Calle La Fuente 11, Losacio".
- Si solo dice el pueblo, pon el pueblo. Es suficiente y es verdad.
- NO completes una calle a partir de la dirección que ya teníamos en el sistema: este campo es lo que
  la persona DICE, y su valor está justamente en que puede contradecir lo que teníamos.
- NO inventes un número de portal. NO conviertas una referencia en una dirección postal.
- NO pongas coordenadas aquí. NO traduzcas ni normalices nombres de calles.
- Si no dice dónde está, null.
```

### 2.3 y 2.4 `declared_lat` / `declared_lon` · decimal · anulable

```text
Casi siempre null. Rellénalos SOLO si la persona dicta coordenadas de viva voz (alguien leyendo una
app de GPS, un agente forestal). Formato: grados decimales, WGS84.
- NO geocodifiques. NO calcules las coordenadas de un pueblo, de una calle ni de una referencia.
- Si has puesto algo en declared_location, estos dos siguen siendo null salvo que hayas oído los
  números.
La conversión de texto a coordenadas la hace api/, que tiene el mapa. Tú no lo tienes.
```

### 2.5 `mobility` · enum · anulable

```text
Cómo puede moverse LA PERSONA CON LA QUE HABLAS. Valores permitidos, exactamente estos cuatro:
  car      -> va a salir en coche (propio o de alguien)
  walking  -> sale andando y anda con normalidad
  reduced  -> anda despacio o necesita que alguien la lleve, pero puede moverse
  immobile -> no puede salir por su pie (encamada, no se levanta)
- Si habla de OTRA persona ("mi madre no anda"), eso NO va aquí: va en vulnerable_people. Este campo
  es solo de tu interlocutor.
- Si dice que tiene coche pero no que vaya a usarlo, mobility puede ser null y has_car true. No son
  el mismo dato.
- Si no hay información, null. No lo deduzcas de la edad, de la voz ni del pueblo.
- Coherencia obligatoria: si mobility es "car", has_car tiene que ser true.
```

⚠️ **Minimización (art. 9 RGPD).** `reduced` e `immobile` pueden ser datos de salud
(`docs/research/marco-legal.md` §1.3). El agente pregunta **si puede salir sola o no**, y nada más: ni
diagnóstico, ni enfermedad, ni edad exacta. El extractor **no completa** lo que no se preguntó.

### 2.6 `has_car` · booleano · anulable

```text
true  -> dice que tiene un vehículo disponible ahí ("tengo el coche en la puerta", "cojo la furgoneta").
false -> dice explícitamente que no tiene coche, que no conduce, o que el coche no está o no arranca.
null  -> no se ha hablado de coche.
No lo deduzcas de que viva en un pueblo. No lo deduzcas de que vaya a salir.
```

### 2.7 `seats_free` · entero · anulable

```text
Plazas libres en su vehículo para llevar a vecinos.
- Si lo dice, ponlo: "me caben dos más" -> 2.
- Si dice la capacidad del coche y cuánta gente va, puedes restar: "somos tres y el coche es de
  cinco" -> 2. Restar dos números que la persona ha dicho está permitido; suponer la capacidad de un
  coche que no ha descrito, no.
- "Voy lleno", "no me cabe nadie" -> 0. (0 es un dato, no un hueco.)
- has_car false -> seats_free null (no 0: no hay coche del que hablar).
- Si no hay información, null.
```

### 2.8 `has_smartphone` · booleano · anulable

```text
true  -> puede abrir un enlace en el móvil (dice que sí, o abre el enlace durante la llamada, o habla
         de WhatsApp).
false -> "yo tengo el fijo", "yo de eso no entiendo", "no tengo internet", "este móvil es de teclas",
         o no consigue abrir el enlace tras intentarlo.
null  -> no se ha hablado del tema.
Que te hable desde un móvil NO significa que sea smartphone. No lo deduzcas del número.
```

### 2.9 `consent_position` · booleano · anulable

```text
true  -> la persona dice claramente SÍ a que conozcamos su ubicación ("sí", "vale, mándamelo",
         "de acuerdo", y abre el enlace).
false -> dice NO, o dice que prefiere no darla.
null  -> no se le preguntó, o la respuesta no está clara.
- Un "vale" que responde a OTRA pregunta no es consentimiento. Si la afirmación no responde
  directamente a la pregunta de la ubicación, es null.
- Si dudas entre true y null, pon null. El consentimiento tiene que ser inequívoco (art. 4.11 RGPD):
  un consentimiento dudoso registrado como válido es peor que no tenerlo.
- null y false NO son lo mismo y api/ los trata distinto: false es una negativa registrada (y hay que
  respetarla en las siguientes llamadas); null es que falta preguntar.
```

### 2.10 `will_evacuate` · booleano · anulable

```text
true  -> confirma que sale: "sí", "ya salgo", "estoy cogiendo las llaves", "nos vamos ahora".
false -> dice que no sale, O contesta con evasivas: "ya veré", "cuando acabe de...", "si veo que
         se acerca", "de momento me quedo".
null  -> no se le preguntó o no se entendió la respuesta.
- Las evasivas van a false, no a true y no a null: para el sistema, una salida sin confirmar NO
  puede contar como confirmada. api/ mapea false a estado `refusing` y la vuelve a llamar con otro
  guion, que es exactamente lo que hay que hacer con un "ya veré".
- Copia la frase literal de la evasiva en agent_notes: "ya veré" y "no me voy de aquí" son el mismo
  false, pero no la misma persona, y quien llame después necesita saberlo.
```

### 2.11 `neighbors_mentioned[]` · lista de objetos

```text
Una entrada por PERSONA U HOGAR mencionado que esté, o pueda estar, dentro de la zona. Cada vecino
que pongas aquí crea una casa en el mapa y una llamada de verdad: no metas a nadie por rellenar.

  name    -> tal como lo dijo: "Rosa", "los Prieto", "mi madre". NO inventes apellidos ni completes
             nombres. Si solo dice "el vecino de al lado", pon null en name y describe la casa en
             address.
  phone   -> en formato E.164 (+34 y nueve dígitos). Ver las reglas de normalización abajo.
             Si la persona duda del número ("creo que es el 66..."), pon null. Un número mal copiado
             es la llamada a un desconocido y una casa que se queda sin avisar.
  address -> "Calle Mayor 6", "la casa de enfrente", "la última del pueblo". Con sus palabras.
  at_home -> true si dice que está en casa; false si dice que ya se ha ido o que no vive allí;
             null si no lo sabe. "No sé" es null, no false.

- NO incluyas a familiares que están claramente FUERA de la zona ("mi hijo vive en Madrid"): no hay
  que evacuarlos y crearían una casa falsa. Eso va a agent_notes.
- NO incluyas números de emergencia (112, 062) ni servicios.
- Sí incluye a hijos, cuidadores o familiares que la persona proponga como quien puede ir a recogerla:
  son un recurso de evacuación.
- Deduplica: si nombra a la misma persona dos veces, una sola entrada con toda la información.
- Con name + address ya vale. No descartes una entrada por no tener teléfono.
```

### 2.12 `vulnerable_people[]` · lista de objetos

```text
Personas que no pueden salir solas. Una entrada por persona.

  description -> lo mínimo para identificarla y encontrarla: "madre, 87 años, no anda",
                 "vecino en silla de ruedas", "niño de meses".
  needs       -> qué hace falta, en dos o tres palabras: "traslado", "acompañamiento",
                 "no puede quedarse sola", "silla de ruedas".

- Anota la LIMITACIÓN FUNCIONAL, no la enfermedad. Si la persona menciona un diagnóstico, no lo
  copies: escribe qué necesita. "Tiene alzhéimer" -> description "persona mayor que no puede quedarse
  sola", needs "acompañamiento". Es minimización de datos de salud (art. 9 RGPD) y además es lo
  operativamente útil: a quien va a ir a la casa le importa si anda, no el diagnóstico.
- No infieras vulnerabilidad de la edad ni del tono de voz. Solo lo que se ha dicho.
- Si la persona con la que hablas es la vulnerable, va aquí Y en mobility.
- Lista vacía [] si no se mencionó a nadie. Nunca null.
```

---

## 3. Normalización de teléfonos a E.164

Contrato §1: `+34600990012` — **todo teléfono del repo va en el rango reservado `+3460099xxxx`**,
ejemplos incluidos, porque con `ALLOW_REAL_CALLS=true` un ejemplo copiado marca a una persona real.
Reglas para el extractor, sin excepciones:

| Lo que se oye / transcribe | Resultado | Por qué |
|---|---|---|
| "600 99 00 12", "600990012" | `+34600990012` | 9 dígitos españoles → se prefija `+34` |
| "0034 600 99 00 12", "34600990012" | `+34600990012` | se normaliza el prefijo |
| "seis cero cero, nueve nueve..." | `+34600990012` | se transcribe a dígitos |
| "9 80 ..." (fijo, 9 dígitos) | `+34980…` | los fijos también valen |
| "el 66 y algo", "creo que empieza por 6" | `null` | incompleto → no se reconstruye |
| "el mismo que el mío pero acabado en 31" | `null` + literal en `agent_notes` | reconstruir un número a partir de otro es inventarlo |
| menos de 9 dígitos | `null` | incompleto |
| más de 9 dígitos (sin prefijo reconocible) | `null` + literal en `agent_notes` | probablemente mal transcrito |
| "112", "062", "061" | `null` | no es un teléfono personal |
| número extranjero con `+` y prefijo de país | se deja tal cual con su `+` | hay temporeros y turismo; E.164 lo admite |

Sin espacios, sin puntos, sin guiones, sin paréntesis. Y la regla que lo resume:
**ante la duda, `null`.** Llamar a un número equivocado gasta una llamada, molesta a un desconocido y —lo
grave— deja una casa real creyendo que ya ha sido avisada.

---

## 4. `agent_notes` (el campo 13, fuera de `extracted`)

```text
Máximo 200 caracteres. En español, telegráfico. Solo lo que sirva a quien llame después o a quien
mire el mapa. Prioridad, en este orden:
 1. Información de campo que el sistema no tiene ("dice que el fuego ya está en el cruce de la N-631").
 2. La frase literal de una ambigüedad que has resuelto ("dijo 'cuatro o cinco'"; "dijo 'ya veré'").
 3. El motivo de una negativa ("no sale por los animales").
 4. Idioma si no es castellano; si hace falta rellamada y por qué; si sospecha estafa.
 5. Estado emocional SOLO si cambia cómo hay que llamarle ("muy nerviosa, ir muy despacio").
No metas aquí datos que ya tienen su campo. No metas juicios sobre la persona.
```

---

## 5. Qué puede salir mal

| Riesgo | Cómo se manifiesta | Mitigación |
|---|---|---|
| **El extractor rellena huecos con lo plausible** | `people_at_home: 3` en una casa de la que nadie dijo cuántos son. La patrulla busca a quien no existe. | La regla `null` repetida en cada campo, con las frases prohibidas enumeradas literalmente ("somos los de siempre"). Es un fallo silencioso: no lo detecta ningún test, solo el Northstar que audita transcripción contra payload. |
| **Teléfono mal transcrito** | Se llama a un desconocido y una casa real se queda sin avisar. | Tabla de §3 + `null` ante la duda + el agente repite el número en voz alta durante la llamada para que la persona lo confirme. |
| **`consent_position: true` por un "vale" ambiguo** | Consentimiento no inequívoco → inválido, y se trata la posición como consentida. | "Si dudas, null" + el "vale" tiene que responder a la pregunta de la ubicación. |
| **La evasiva se guarda como `true`** | Alguien que dijo "ya veré" cuenta como evacuado y nadie vuelve a llamarle. | Evasiva → `false` + literal en notas, escrito en el campo. |
| **`mobility` con la limitación de otra persona** | Se marca al interlocutor como `immobile` y sube su prioridad por algo que dijo de su madre. | Regla explícita: `mobility` es solo del interlocutor; lo demás a `vulnerable_people`. |
| **Diagnósticos médicos en `description`** | Datos de salud recogidos sin base y sin necesidad. | "Limitación funcional, no enfermedad", con el ejemplo del alzhéimer. |
| **Vecino de Madrid convertido en casa** | Casa fantasma en el mapa y una llamada gastada. | Regla de exclusión explícita para quien está fuera de la zona. |
| **El esquema y el contrato se separan** | El payload se rechaza o se pierden campos en silencio. | Este cotejo (§1) se repite si `api/models.py` cambia. Hoy: 12 = 12. |
