# `happyrobot/prompts/` — los guiones de voz y los workflows de HappyRobot

Este directorio es **la parte del sistema que toca a una persona**. Todo lo demás (el motor de escenario, la
API de estado, el mapa, el simulador) existe para que estas conversaciones puedan ocurrir y para que lo que
se dice en ellas sea verdad.

Dos documentos mandan sobre todo lo que hay aquí y no se contradicen desde este directorio:
- `docs/06-producto/03-contrato-de-datos.md` — los campos, los endpoints y las reglas de seguridad. **Vinculante.**
- `docs/02-happyrobot/03-workspace-y-limites-verificados.md` — qué nodos existen de verdad. **Nada que no esté ahí se usa sin marcarlo.**

---

## Índice

| Fichero | Qué es | Trigger / nodo | Duración objetivo |
|---|---|---|---|
| [`01-onboarding-outbound.md`](01-onboarding-outbound.md) | La llamada masiva. Sacar a la gente de casa y construir el mapa. | `Webhook / API` → `Agents` | **90 s** |
| [`02-reruta-urgente.md`](02-reruta-urgente.md) | La corrección al que ya va por la carretera. Lee `say_this` literal. | `Webhook / API` → `Agents` | **20 s** |
| [`03-inbound-es-alert.md`](03-inbound-es-alert.md) | Llamada entrante. No sabemos ni quién ni dónde: hay que situarle. | `Inbound phone call` → `AI Classify` → `Agents` | 2 min |
| [`04-patrulla-y-mando.md`](04-patrulla-y-mando.md) | Los otros dos destinatarios: patrulla (órdenes) y puesto de mando (decisiones). | `Webhook / API` y `Schedule` | 40 s / 1 pantalla |
| [`05-extraccion.md`](05-extraccion.md) | El esquema que convierte la conversación en el bloque `extracted`. | `AI Extract` | — |
| [`06-workflows-happyrobot.md`](06-workflows-happyrobot.md) | Los 7 workflows, sus grafos, sus tools y los Northstars. | — | — |
| [`07-guion-demo.md`](07-guion-demo.md) | Los 3 minutos, minuto a minuto, con la llamada del jurado y los planes B. | — | **2:55** |

---

## Qué criterio de la rúbrica defiende cada guion

| Fichero | Criterio principal | Cómo lo defiende, concretamente |
|---|---|---|
| **01 · onboarding** | **Ejecución fuera del sistema** | Es una llamada real a una persona real que acaba con esa persona saliendo de su casa. No propone nada: lo hace. |
| **01 · onboarding** | **Coordinación** | De una sola llamada salen tres cosas: una persona guiada, plazas de coche para un convoy, y vecinos nuevos en la cola (30 llamadas → 100 números). |
| **01 · onboarding** | **Decisión sin datos completos** | El orden de sacrificio de objetivos (a → d): el sistema decide con lo que tenga y sigue. Y `null` en vez de inventar (`05`). |
| **02 · reruta** | **Adaptación al cambio** | Es la prueba audible de que el plan de hace 20 minutos se ha tirado: alguien recibe una instrucción distinta mientras conduce. |
| **02 · reruta** | **Control** | El agente no redacta: lee `say_this`. La autoridad sobre lo que se dice está en el sistema que ve el fuego, no en el modelo de voz. |
| **03 · entrante** | **Decisión sin datos completos** | Empieza sin saber quién llama ni dónde está y produce una persona situada en el mapa. La escalera de 8 preguntas para localizar a alguien es el núcleo. |
| **03 · entrante** | **Control** | El reporte de campo de un vecino **no cierra una carretera**: crea un `approval_requested` que un humano aprueba. La fuente determina la consecuencia. |
| **04 · patrulla** | **Prioridad cuando todo es urgente** | La resta `minutes_to_front − patrol_eta_min`, dicha en voz alta: «no vaya a esta casa, el frente llega antes que usted». Es la decisión difícil, y se comunica. |
| **04 · mando** | **Coordinación** + **Control** | Tres registros distintos en el mismo sistema, y la línea que no se cruza: a la patrulla se le dan órdenes, al mando se le piden decisiones (casillas por marcar, nunca "he asignado"). |
| **05 · extracción** | **Decisión sin datos completos** | Define qué es un dato y qué una suposición. `null` en vez de plausible, "estamos todos" → `null`, teléfono dudoso → `null`. |
| **06 · workflows** | **Ejecución fuera del sistema** | Todo lo que sale de estos grafos es una llamada, un SMS o un mensaje real. Ningún nodo inventado. |
| **06 · workflows** | **Aprendizaje (bonus)** | 18 Northstars binarios auditados por run, con un run por llamada para que el bucle de feedback tenga grano fino. |
| **07 · demo** | **Creatividad** + todos los demás | Un miembro del jurado hace de vecino y el sistema le llama de verdad. Las desviaciones están guionizadas: si dice «no me voy de mi casa», eso es la mejor demo posible. |

---

## Reglas transversales (quien edite estos ficheros las mantiene)

1. **Español de España, hablado, no escrito.** Frases de menos de doce palabras. Si no se puede decir de un tirón, se reescribe. Se lee en voz alta antes de dar nada por bueno.
2. **Usted**, siempre. Zona rural y población mayor: el usted da autoridad sin distancia. Imperativos en usted («Salga», «Coja») son urgentes y respetuosos a la vez.
3. **Sin jerga y sin códigos.** «La carretera de Tábara» sí; «la ZA-P-2434 dirección noreste» no. Ni coordenadas, ni grados, ni horas UTC, ni hectáreas.
4. **Ninguna cifra que el sistema no sepa.** Si el agente dice un número, una hora, una carretera o un tiempo, ese dato viene de una **tool**, no del modelo. Cada guion declara explícitamente qué puede afirmar y qué tiene que consultar antes, y qué frase de repuesto usa cuando la tool falla.
5. **Ninguna promesa que el sistema no pueda cumplir.** Nunca «va una ambulancia», «no le va a pasar nada», «el fuego no llegará ahí». Sí: «queda como prioridad de traslado y lo ve el puesto de mando ahora mismo», que es verdad y comprobable.
6. **Todos los guiones abren identificándose como IA.** Obligación del art. 50 del Reglamento (UE) 2024/1689, en aplicación desde el 2 de agosto de 2026. En el onboarding y en la entrante va el aviso completo; en la reruta, una marca de reidentificación de 2 segundos, porque la primera interacción ya lo dio.
7. **Tono: autoridad tranquila.** Protección Civil, no un call center. Nada de «¿en qué puedo ayudarle?», «perfecto», «genial», «un momentito».
8. **Cada guion acaba con un bloque "Qué puede salir mal"**, con la mitigación al lado. Un guion sin ese bloque está a medias.

---

## Resultado de las verificaciones

| Verificación | Resultado |
|---|---|
| `05-extraccion.md` vs el bloque `extracted` de `POST /calls/outcome` | **12 campos = 12 campos, coincidencia exacta.** Cotejo campo por campo en `05` §1, contra `docs/06-producto/03-contrato-de-datos.md` §3 **y** contra `backend/api/models.py` (`CallExtracted`), que hoy coinciden entre sí. Ningún campo extra, ninguno que falte. Los 6 campos que me habrían gustado (`refusal_reason`, `language`, `needs_callback`, `field_report`, `animals`, `scam_suspected`) **no se han añadido**: viajan en `agent_notes`. |
| Nodos de `06` vs `docs/02-happyrobot/03-workspace-y-limites-verificados.md` | **Ningún nodo inventado** (tabla completa en `06` §8). Una advertencia: `Loop` consta en el catálogo del workspace pero sin evento `loop.*` en el SDK → plan B escrito (fan-out desde `backend/engine/`). Y `Approval Process` **no es un nodo**: es una pestaña, y la investigación no encontró API para él. |
| Tiempos leídos en voz alta | Onboarding: apertura 9 s, presupuesto de 90 s con el agente hablando 45–50 s → **cabe**, con orden de sacrificio escrito para cuando no cabe. Reruta: 2 + 3 + 10 + 5 = **20 s** exactos (22 s la variante de guía de convoy, por la frase del intermitente). Patrulla: **38 s** de dictado. Briefing de mando: **41 s**. Demo: **2:55**. |
| Todos los guiones abren identificándose como IA | **Sí.** `01` frase literal en el mensaje inicial · `02` marca «Protección Civil, sistema automático» + apertura larga si no hubo llamada previa · `03` aviso completo de IA y de grabación en la primera frase · `04` «sistema automático» en la primera frase con patrulla y con mando. |
| Ninguna promesa imposible | Revisado guion a guion. Dos frases se quedaron al borde y están acotadas: «vamos a por usted» en un `say_this` de peatón **solo** si hay patrulla o convoy asignado (`02` §4.3), y «le vuelvo a llamar para contarle» en la rama del familiar (`03` §5.2) **solo** si se implementa la llamada de vuelta; si no, se quita la frase. |

---

## Inconsistencias detectadas — ya corregidas

Las tres que se señalaron aquí (carretera `ZA-P-1508` inventada, `"Polideportivo de Tábara"` en vez del
colegio rural agrupado **"León Felipe"**, y el ejemplo de `last_instruction` en tuteo) **están arregladas**
en `docs/06-producto/03-contrato-de-datos.md`, `backend/api/loader.py`, `backend/api/planner.py` y los mocks de `web/`. Lo que quedó
grabado como regla, porque es la razón de fondo:

- **Toda carretera, pueblo e instalación sale de `docs/03-dominio-crisis/05-geografia-sierra-culebra.md`**, nunca de la
  imaginación. Verificadas: N-631, ZA-P-2434, ZA-902, N-122, ZA-P-2438; Tábara = CRA "León Felipe"
  (41.82611, −5.95889); Alcañices = CEIP Virgen de la Salud (41.69887, −6.34793), acceso por N-122.
  Un destino con nombre falso es peor que uno genérico: la gente pregunta por él al llegar.
- **`last_instruction.text` y `say_this` van en usted**, siempre. El agente lee ese texto literal, así que
  un tuteo en los datos sale por el altavoz. Regla escrita ahora en el contrato §2.1.

Sigue abierta una cuestión de integración (`03` §6): en una llamada entrante no hay `person_id`, así que la
extracción manda `person_id: null` + `phone`. El modelo lo admite, pero hay que confirmar con quien
implemente `backend/api/` que ese payload no se descarta y que resuelve la persona por teléfono.

---

## Preguntas para el stand de HappyRobot

1. **Northstars y variables del run**: ¿puede un Northstar comparar la transcripción con el valor de una variable del run? Es lo que necesita el criterio más importante que tenemos («¿el agente dijo `say_this` literal, sin añadir nada?»).
2. **Semántica del `Loop`**: ¿paralelismo, límite de iteraciones, qué pasa si una iteración falla? ¿Y `Function Call` dentro de un `Loop` genera un run por invocación?
3. **`Transfer`**: ¿existe traspaso cálido (`warm_handoff`, mensaje de resumen, whisper) en el workspace del hackathon, o solo transferencia en frío?
4. **Timeouts**: ¿cuánto espera un nodo Webhook y cuánto una Tool antes de rendirse? Determina las frases de repuesto del agente.
5. **Concurrencia y duración**: ¿cuántas llamadas de voz simultáneas soporta la cuenta, y hay duración máxima por llamada? No vamos a anunciar un número de llamadas en paralelo que no hayamos probado.
6. **Créditos**: cuántos tiene la cuenta y si se recargan. Una oleada de 30 llamadas de 90 s ≈ 1.080 créditos.
7. **Número español**: ¿nos dan número y llamadas salientes a móviles españoles, y cuánto tarda en aprovisionarse? Sin número no hay WF-3 (entrante) ni WF-7 (SMS).
8. **Approval Process**: ¿es gobernanza de versiones o sirve para aprobar decisiones en runtime? Si es lo segundo, nos ahorra pantalla propia.
9. **Latencia del TTS en español de España** y si se puede elegir voz: 20 segundos de reruta son 20 segundos de verdad.
