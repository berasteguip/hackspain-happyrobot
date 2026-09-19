# 02 · Llamada de reruta urgente (20 segundos)

> El sistema ya sabía qué hacer, el escenario cambió, y hay que corregir a alguien **que ya va por la
> carretera**. Trigger: `Webhook / API` disparado por el motor de escenario a través de `api/`.
> Criterios de rúbrica: **Adaptación al cambio** (es la prueba visible de que el plan viejo se tiró) y
> **Ejecución fuera del sistema** (la corrección no se propone, se dice al oído del conductor).

Esta es la llamada que gana la demo. Es también la más peligrosa: la persona está conduciendo, con humo,
con niños detrás, y solo va a retener **una** cosa. Por eso el guion tiene una regla que está por encima
de todas las demás:

> ## El agente lee `say_this` tal cual. Ni una palabra más.

---

## 1. Por qué `say_this` y no una redacción del modelo

`GET /instructions/{person_id}` devuelve, entre otras cosas, `say_this`: *"la frase literal, ya redactada,
para que el TTS no improvise en algo que puede matar a alguien"* (`docs/06-producto/03-contrato-de-datos.md` §3).

Esa frase la produce `api/`, que es lo único que conoce el polígono del fuego, el corte de carretera, la
salida asignada y el convoy. El modelo de voz **no tiene nada de eso**. Si el modelo adorna, pasan estas
cuatro cosas, todas malas:

1. **Añade un número.** "Tienes unos diez minutos" — inventado. La persona decide en función de un dato falso.
2. **Suaviza el imperativo.** "Lo mejor sería que cogieras…" → la persona lo trata como una sugerencia y sigue recto.
3. **Añade una alternativa que no existe.** "Puedes ir por ahí o por el otro camino" → el otro camino está en llamas.
4. **Cambia el nombre de la salida.** "Hacia el norte" en vez de "la carretera de Tábara" → la persona no sabe hacia dónde es el norte conduciendo con humo.

Los cuatro son fallos de redacción. Los cuatro matan. De ahí la regla.

---

## 2. Presupuesto de 20 segundos

| Tramo | Segundos | Contenido |
|---|---|---|
| Marca de identidad | 0–2 | "Protección Civil, sistema automático." |
| Anclaje | 2–5 | "{first_name}, cambio de ruta. Escúcheme." |
| `say_this` literal | 5–15 | Lo que devuelve la tool. Sin tocar. |
| Confirmación | 15–20 | "Repítame por dónde va a salir." |

### El aviso de IA en 2 segundos

En el onboarding el aviso ocupa 9 s y está justificado. Aquí no caben: una llamada de reruta de 45 s es una
llamada que llega tarde. La solución es una **marca de identidad**, no un aviso completo:

> **«Protección Civil, sistema automático.»**

Defensa legal (`docs/04-regulacion/02-marco-legal-llamadas-geolocalizacion.md` §6.2): el art. 50.1 exige informar *a más tardar en la
primera interacción*. La primera interacción con esta persona fue la llamada de onboarding, donde el aviso
se dio completo ("soy un sistema automático de inteligencia artificial"). Esta es una **interacción
posterior del mismo sistema con la misma persona**, y "sistema automático" la reidentifica sin ambigüedad.

Excepción escrita en el prompt: **si la persona no ha tenido llamada previa** (`call_attempts == 0`,
p. ej. entró por el geofence con posición GPS del enlace pero nunca hablamos con ella), la marca corta no
vale y se usa la apertura larga:
> «Protección Civil de Zamora, soy un sistema de inteligencia artificial. Cambio de ruta, escúcheme.»
(4,5 s. La llamada se va a 23 s: aceptable.)

---

## 3. System prompt (nodo Agent de reruta)

```text
# QUÉ ES ESTA LLAMADA
Eres el sistema automático de Protección Civil de Zamora. Llamas a una persona que YA está
evacuando por una ruta que acaba de dejar de ser segura. Tu única misión es que cambie de ruta.
No es una conversación. Son veinte segundos y cuelgas.

# LA REGLA QUE ESTÁ POR ENCIMA DE TODO
La tool `get_instructions` te devuelve un campo `say_this`. Dices ESE TEXTO, PALABRA POR PALABRA.
- No lo resumes. No lo alargas. No lo reordenas. No le añades "por favor" ni "¿de acuerdo?".
- No añades NINGÚN número, hora, distancia, nombre de carretera ni referencia que no esté dentro.
- No ofreces alternativas. Si `say_this` dice una salida, hay UNA salida.
- No explicas por qué. Si la persona pregunta por qué, contestas UNA frase: "El fuego ha entrado
  por donde iba usted." Y vuelves a `say_this`.
- Si `say_this` viene vacío o la tool falla: NO te inventes una ruta. Di exactamente:
  "Pare en un sitio seguro, fuera de la carretera, y no siga. Le llamo en un minuto con la salida."
  Y cuelga. Parar es siempre mejor que seguir en la dirección equivocada.

# CÓMO HABLAS
- Español de España, hablando. Frases de menos de diez palabras. Ritmo firme, no gritado.
- Imperativo directo, en usted: "Coja", "Salga", "Pare", "Siga".
- La persona está conduciendo. Va a retener UNA cosa: la ruta nueva. Todo lo demás es ruido.
- Nada de saludos, cortesías, disculpas ni "perdone que le moleste".

# SECUENCIA
1. "Protección Civil, sistema automático."
   (Si es la primera llamada a esta persona: "Protección Civil de Zamora, soy un sistema de
    inteligencia artificial.")
2. "{first_name}, cambio de ruta. Escúcheme."
3. Llamas a `get_instructions` y dices `say_this` literal.
4. "Repítame por dónde va a salir."
5. Si repite bien: "Eso es. Vaya." y cuelgas.
   Si repite mal: dices `say_this` UNA segunda vez, entero, más despacio. Luego cuelgas igual.
   Nunca lo dices una tercera vez: si a la segunda no ha entrado, lo que hace falta es un SMS y
   otra llamada, no repetir más por teléfono mientras conduce.

# LO QUE NO PUEDES HACER NUNCA
- Preguntar cómo está, cuántos van, si quiere agua. Eso era el onboarding. Aquí no.
- Decir "tranquilo" o "no pasa nada".
- Dar una cifra de minutos que no venga en `say_this`.
- Seguir hablando más de 30 segundos. A los 30 segundos cuelgas hayas conseguido lo que sea.
```

---

## 4. Las tres variantes (cambian 2 frases, no el prompt)

El mismo nodo Agent sirve para las tres; lo que cambia es el `say_this` que devuelve `api/` y una línea de
anclaje que el prompt selecciona con la variable `{role}`.

### 4.1 Guía de convoy (`convoy_role: "leader"`)

Es el caso más delicado: detrás van 3 coches que hacen lo que hace él. Un guía que se equivoca se lleva a
todos.

```
"Protección Civil, sistema automático. Antonio, usted va delante y le siguen tres coches. Cambio de ruta."
→ [say_this]
"Ponga el intermitente antes de girar, que le vean. Repítame por dónde sale."
```

La frase del intermitente **no es una invención de ruta**: es una instrucción de conducción genérica y no
afirma nada sobre el fuego. Es el único añadido permitido en el guion, y está aquí escrito, no a criterio
del modelo. Cabe en 2 s y el presupuesto sube a 22 s.

Si el guía dice que no puede o que no quiere seguir de guía: **no se discute**. «De acuerdo, siga usted
solo.» → `convoy_broken` en el sistema, que reasigna guía y llama al siguiente. Esa reasignación es la
demo de "el sistema tira el plan".

### 4.2 Conductor solo (`mobility: "car"`, sin convoy)

El caso base, 20 s exactos.

```
"Protección Civil, sistema automático. María, cambio de ruta. Escúcheme."
→ [say_this]
"Repítame por dónde va a salir."
```

### 4.3 Persona a pie (`mobility: "walking"` o `"reduced"`)

Cambia todo el cálculo: va a 4 km/h, no a 60. Una reruta a pie casi nunca es "vaya por otro sitio", es
**"métase en un sitio y no se mueva"** o "suba a un coche".

```
"Protección Civil, sistema automático. Escúcheme, esto es importante."
→ [say_this]     (que para un peatón suele ser del tipo: "No siga andando. Métase en el
                  colegio, en la puerta de atrás, y quédese ahí. Vamos a por usted.")
"¿Me ha entendido? Dígame qué va a hacer."
```

⚠️ **Nota para quien implemente `say_this` en `api/`** (fuera de mi alcance, pero condiciona este guion):
si el `say_this` de un peatón contiene *"vamos a por usted"*, eso es una **promesa de recurso** y solo se
puede decir si hay una patrulla o un convoy realmente asignado (`assigned_patrol_id` o `convoy_id` no
nulos). Si no hay recurso asignado, la frase correcta es *"quédese ahí y no cuelgue el teléfono"*. El
agente no puede comprobar esto: tiene que venir bien desde el origen.

---

## 5. Si no contesta (pasa, y hay que tenerlo resuelto)

Cadena automática, sin intervención humana, en el workflow (§3 de `06-workflows-happyrobot.md`):

| t | Acción | Nodo |
|---|---|---|
| 0 s | Llamada | `Agents` |
| +18 s sin descolgar | **SMS inmediato** con el `say_this` en texto (y el enlace del mapa) | `Send SMS` |
| +45 s | **Segundo intento de llamada** | `Sleep` + `Agents` |
| sin respuesta | `person.status = at_risk`, entra arriba en `/queue`, y **aviso al puesto de mando por Slack** con nombre, última posición conocida y rumbo | `webhook.post` + `slack` |
| y además | Si va en convoy: se llama **al guía** para que avise por ventanilla, y a los otros miembros | `Agents` |

Dos decisiones de diseño aquí, y las dos son defendibles delante del jurado:

- **El SMS va antes del segundo intento, no después.** Es gratis, es instantáneo y una persona conduciendo con el móvil en el soporte ve la notificación aunque no descuelgue.
- **Un `at_risk` no se queda en una lista: suena en el puesto de mando.** Que el sistema sepa que no ha podido corregir a alguien y no se lo diga a nadie es exactamente el fallo que queremos no tener. La escalada a humano es parte del criterio "Control".

---

## 6. Qué puede salir mal

| Riesgo | Qué pasa | Mitigación |
|---|---|---|
| **El modelo adorna `say_this`** | Añade un minutaje o una alternativa. Es *el* fallo crítico del proyecto. | Regla en mayúsculas en el prompt + Northstar binario "¿el texto dicho coincide literalmente con `say_this`?" evaluable sobre la transcripción. Es el Northstar más importante que tenemos. |
| **`get_instructions` falla en mitad de la llamada** | El agente se queda sin qué decir con alguien conduciendo al teléfono. | Frase de repuesto ("Pare en un sitio seguro… le llamo en un minuto") + `ignore5XX` en el nodo webhook. **Parar nunca es la respuesta equivocada.** |
| **La persona está conduciendo y no debería hablar** | Le distraemos justo en el momento peligroso. | 20 s, imperativo, una sola idea. Y `say_this` de peatón/parada empieza por la acción, no por el contexto. Riesgo aceptado: el coste de no llamar es mayor. |
| **Llega la llamada cuando ya ha pasado el cruce** | La instrucción es imposible de cumplir y confunde. | `api/` recalcula con la posición GPS de los últimos 5 s antes de generar `say_this`; el agente no lo puede arreglar. Si la persona dice "ya he pasado ese cruce" → se trata como información de campo: se registra en `agent_notes` y el sistema recalcula (segunda reruta). |
| **Se repite `say_this` cuatro veces** | La persona se agobia y cuelga. | Máximo dos, escrito en el prompt; a la tercera, SMS. |
| **Persona distinta descuelga** ("está conduciendo, soy su mujer") | La instrucción llega a quien no conduce. | Es *mejor*, no peor: «Dígaselo usted ahora mismo, palabra por palabra:» + `say_this`. Y se pide confirmación a esa persona. Va escrito en el prompt como caso previsto. |
| **Latencia de TTS** | 20 s se convierten en 30. | Medir en los ensayos. Si el TTS tarda, se recorta el anclaje (paso 2) antes que `say_this`. |
