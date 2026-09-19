# 07 · Guion de demo (3 minutos)

> Sigue los 5 pasos de `docs/escenario-incendio.md` §11. La demo pesa tanto como el sistema.
> Reparto: **Luis** narra y lleva el relato · **Pablo** conduce el portátil (dashboard + motor de escenario)
> · **un miembro del jurado** hace de vecino por `Web call`.
> Regla de `docs/escenario-incendio.md` §13 que manda sobre todo este fichero: **nada marcado NO VERIFICADO
> se dice delante del jurado.**

---

## 1. Minuto a minuto

| t | Quién | Qué se dice | Qué se ve en pantalla |
|---|---|---|---|
| **0:00** | Luis | «En la Sierra de la Culebra, en 2022, se quemaron más de 30.000 hectáreas y murieron cuatro personas. Dos de ellas no murieron por no estar avisadas: murieron porque nadie sabía dónde estaban.» | Mapa apagado, tres pueblos, un polígono de fuego quieto. Etiqueta **DATOS SINTÉTICOS** bien visible. |
| **0:12** | Luis | «Lo que falta no es el aviso. Es lo de después: saber quién está dentro, dónde, y decirle a cada uno por dónde salir. Eso es lo que hemos construido.» | — |
| **0:20** | Pablo | *(dispara el webhook del motor de escenario)* | **PASO 1.** El polígono empieza a avanzar. 30 puntos aparecen en el mapa. El panel de llamadas se llena: llamadas en paralelo, unas contestan, otras no. Contador: *contactadas / sin respuesta / en movimiento*. |
| **0:28** | Luis | «Treinta casas, treinta llamadas a la vez. El sistema no pregunta "¿está usted bien?": pide cuatro cosas, y la primera es que salgan de casa.» | Los puntos van cambiando de color según estado. |
| **0:38** | Luis | «Y lo van a oír ustedes. ¿Quién quiere ser un vecino de Losacio?» *(entrega la tarjeta de papel a un miembro del jurado)* | **PASO 2.** Botón **Hablar con el agente** del dashboard. |
| **0:45** | **Jurado** | *(la llamada, §2 de este documento)* | Mientras habla: el punto de esa casa pasa a `contacted`. Al dar el permiso, llega el SMS y **el punto salta de borde discontinuo a continuo**: `declared` → `gps`. Luego se mueve. |
| **1:20** | Luis | «Ese borde discontinuo era lo que nos había dicho. El continuo es dónde está de verdad. El sistema no los mezcla nunca.» Y: «Le ha metido en un convoy con dos coches más y le ha dicho a quién seguir, porque un vecino que va delante funciona mejor que un nombre de carretera.» | Convoy `c-1` dibujado: guía + 2 miembros, ruta en verde. |
| **1:32** | Pablo | *(dispara el cambio de viento: 225° → 315°)* | **PASO 3.** El cono de avance gira. La ruta verde del convoy se pone **roja**. |
| **1:36** | Luis | «Ha girado el viento. El frente acaba de entrar en la carretera por la que sale ese convoy. El plan de hace veinte minutos ya no vale.» | Timeline de decisiones escribiendo en vivo: `fire_updated` → `road_closed` → `route_recalculated` ×12 → `call_placed`. |
| **1:42** | — | *(altavoz: la llamada al guía del convoy, 20 s, `02-reruta-urgente.md`)* | El panel marca la llamada en curso. Los otros miembros reciben SMS (se ve el envío). |
| **2:02** | Luis | «Veinte segundos, una sola instrucción, y la frase la escribe el sistema que ve el fuego, no el modelo de voz. A la vez: la lista de casas sin contestar se ha reordenado, y el puesto de mando tiene una prioridad de sectores nueva.» | Split: lista de la patrulla reordenándose + mensaje de Slack al puesto de mando con el bloque **CAMBIO DESDE**. |
| **2:12** | Pablo | *(anula una ruta desde el dashboard: "esa salida no me gusta, ciérrala")* | **PASO 4.** `human_override` en el timeline con `operator`. Las rutas afectadas se recalculan solas y el sistema vuelve a llamar. |
| **2:18** | Luis | «Y una persona puede tirar el plan del sistema. Cuando lo hace, el sistema no discute: recoloca y vuelve a avisar. Todo lo que ha hecho está firmado: quién, cuándo y por qué.» | Timeline con `actor: human` en esa entrada. |
| **2:28** | Luis | «Cierre. La Guardia Civil no recibe "barran trescientas casas": recibe seis direcciones, en orden, y se le dice en voz alta a cuál **no** vaya porque el fuego llega antes que ella. Y el helicóptero recibe el sector con más gente dentro, contando a los que no hemos localizado.» | **PASO 5.** Lista de 6 casas con motivo. Ranking de sectores con `air_priority_reason`. |
| **2:45** | Luis | "Lo que han visto no es un aviso masivo. Son sesenta conversaciones que han acabado en sesenta instrucciones distintas, y un plan que se ha tirado a la basura en directo cuando dejó de valer." | Pantalla final: contadores + timeline completo. |
| **2:55** | Luis | «Y cada una de esas llamadas ha salido de verdad.» | — |

**Total: 2:55.** El colchón de 5 s existe porque la llamada del jurado se va a alargar. Si se alarga más de
15 s, **se sacrifica el paso 4** (la intervención humana se cuenta con una frase en vez de enseñarla), nunca
el paso 3.

---

## 2. La llamada del jurado, palabra por palabra

### 2.1 La tarjeta que se le da (se lee en 8 segundos)

```
  Usted es ROSA.
  Vive en Calle Mayor 6, en LOSACIO.
  En casa están 3 personas.
  Tiene coche, con 2 sitios libres.
  Su madre, de 87 años, vive en la casa de al lado y no anda bien.

  Contésteme como quiera. Si quiere ponérselo difícil, hágalo.
```

Dar la tarjeta no es hacer trampa: es asignar un papel, igual que en un simulacro. Y la última línea es
deliberada — **un jurado que intenta romper el agente en directo es la mejor demo posible**, siempre que el
agente aguante. Por eso el §2.3 existe.

Datos sintéticos: el teléfono asociado es del rango `+3460099xxxx` y **el jurado no da su número real en
ningún momento** (ver §4, punto 7).

### 2.2 Lo que va a pasar (el carril principal, ~35 s)

| Quién | Qué se dice | Qué esperamos del jurado |
|---|---|---|
| **Agente** | «Le llamo de Protección Civil de Zamora. Soy un sistema automático de inteligencia artificial, y esto no es una prueba: hay un incendio acercándose a Losacio y tiene que salir de casa.» | «Vale» / «¿Qué?» / silencio |
| **Agente** | «¿Está en casa ahora? ¿Puede salir ya?» | «Sí» |
| **Agente** | «¿Cuántos están en la casa?» | «Tres» |
| **Agente** | «¿Tienen coche ahí?» | «Sí, con dos sitios libres» |
| **Agente** | «Esta llamada queda grabada. Para poder guiarle por donde no está el fuego necesito saber dónde está. ¿Me da permiso para conocer su ubicación? Le mando un mensaje con un enlace: lo abre y ya está.» | «Sí» → **aquí llega el SMS y el punto pasa a GPS** |
| **Agente** | *(tras `get_instructions`)* «Salga por la carretera de Tábara y vaya al colegio de Tábara. Va en un convoy: siga al Seat León blanco de Antonio, que sale de la Calle Mayor.» | «Vale» |
| **Agente** | «¿Quién vive en la casa de al lado?» | «Mi madre, de 87 años, no anda bien» |
| **Agente** | «¿Puede salir por su pie o necesita que alguien la lleve?» | «Necesita que la lleven» |
| **Agente** | «Anotado: hace falta traslado. Queda como prioridad y lo ve el puesto de mando ahora mismo. ¿Tiene su teléfono?» | *(lo da o no)* |
| **Agente** | «Salga ahora. Si el fuego cambia de dirección le volvemos a llamar a este número.» | — |

Y en pantalla, mientras: `people_at_home: 3`, `seats_free: 2`, `consent_position: true`,
`vulnerable_people: [{madre 87 años, no anda → traslado}]` apareciendo en el panel de extracción **en
directo**. Ese panel es el que demuestra que la conversación se convierte en datos, y que los datos mueven
el mapa.

### 2.3 Cuando el jurado se salga del guion (va a pasar)

Un jurado nunca contesta lo que esperas. Estas son las siete desviaciones probables, qué hace el agente y
**qué dice Luis** para convertirla en un punto a favor en vez de un tropiezo.

| # | El jurado dice | El agente hace | Luis narra |
|---|---|---|---|
| 1 | **«No me voy de mi casa.»** | Entra el bloque §7.1 de `01`: reconoce, da el dato concreto, baja el coste («coja el móvil, las medicinas y el carnet»), y ofrece la salida: un vecino que le recoja, o dos minutos y rellamada. Si insiste: «Queda apuntado que está en casa y no sale. Voy a decirle a la Guardia Civil que su casa está ocupada.» | «Esta es la respuesta más frecuente en una evacuación real, y la que más mata. El agente no discute ni amenaza: le da un dato y le deja una puerta. Y mírenlo aquí: la casa acaba de aparecer en la lista de la Guardia Civil.» **Es la mejor desviación que nos puede pasar.** |
| 2 | **«¿Tú eres una máquina?»** / «¿Esto es real?» | Ya lo dijo en la primera frase y lo repite: «Soy un sistema automático de inteligencia artificial. No le voy a pedir ningún dato bancario ni ninguna clave. Si quiere, cuelgue y llame al 112; pero salga de casa mientras lo comprueba.» | «Lo dice en la primera frase porque el artículo 50 del Reglamento europeo de IA obliga a decirlo desde agosto. El reto era decirlo sin que la gente cuelgue.» |
| 3 | **«¿Cuántas hectáreas van?»** / «¿Cuánto tiempo tengo?» *(cuando la tool no lo ha dado)* | «Eso no lo sé.» Y sigue con la instrucción. | «Acaba de decir "no lo sé". Está prohibido en el prompt decir una cifra que no venga de nuestro sistema. Un agente de voz que se inventa los minutos que te quedan manda a alguien a cruzar por delante del fuego.» **Esta desviación se agradece: es el punto más fuerte del diseño.** |
| 4 | **No dice nada / se ríe / habla por encima** | Repite una vez, más corto: «Escúcheme: incendio. Salga de casa. Vaya hacia la carretera de Tábara.» A la segunda sin respuesta coherente: SMS + rellamada. | «Con ruido y con pánico la gente no procesa frases largas. El agente reduce a tres órdenes de cuatro palabras.» |
| 5 | **«Estoy en Madrid.»** / dice un pueblo que no está en el escenario | Pregunta el pueblo otra vez; si está fuera de zona: «Usted no está en zona de evacuación. No se acerque y deje las carreteras libres.» Y pivota: «¿Tiene familia dentro? Deme su teléfono.» | «Fuera de zona no gastamos capacidad. Pero le sacamos los teléfonos de los que sí están dentro: treinta llamadas nos dan cien números.» |
| 6 | **Contesta en inglés** | Cambia y comprime a lo esencial: *"Fire. You must leave the house now. Go to Tábara. A text message is coming."* | «En la zona hay temporeros y turismo rural. Si el agente no domina el idioma, transfiere a una persona: lo que no hace es fingir que se ha entendido.» |
| 7 | **Da su número de teléfono real** | El agente lo recoge como cualquier dato, **pero el sistema no lo llama**: `ALLOW_REAL_CALLS` solo autoriza el número del jurado que ya está en el Web call. | *(no se narra; es una salvaguarda, no una feature)* Si el jurado insiste en recibir un SMS real, se manda **solo** a ese número, y se dice en voz alta que es el único número real del sistema. |

Regla de oro para los dos presentadores: **si el agente hace algo raro, se cuenta lo que ha hecho, no se
tapa.** Un fallo explicado con honestidad cuesta menos puntos que un fallo disimulado, y este jurado va a
notar la diferencia.

---

## 3. Checklist de pre-vuelo (se hace 15 minutos antes, en este orden)

```
INFRAESTRUCTURA
 ☐ api/ arrancada          → GET /health devuelve {ok: true}
 ☐ engine/ arrancado       → el escenario "sierra-culebra" cargado, reloj en pausa
 ☐ Túnel público activo    → PUBLIC_BASE_URL responde desde fuera (probar desde el móvil, no desde el portátil)
 ☐ x-api-key igual en .env y en los nodos Webhook de HappyRobot
 ☐ POST /reset ejecutado   → estado limpio, state_version en 1

HAPPYROBOT
 ☐ Entorno = Development en todos los workflows, y las URLs del .env son las de Development
 ☐ WF-6 web-call-demo PUBLICADO y probado con una llamada de prueba completa
 ☐ WF-2 reruta probado una vez de punta a punta
 ☐ Créditos suficientes    → mirar Settings > Usage ANTES, no durante
 ☐ ALLOW_REAL_CALLS: activado solo para el número del jurado (o desactivado si va todo por Web call)
 ☐ Slack conectado (si no, se enseña el parte en el dashboard y no se menciona Slack)

DASHBOARD
 ☐ Etiqueta "DATOS SINTÉTICOS" visible en pantalla
 ☐ Mapa centrado en los 3 pueblos, zoom fijado
 ☐ Timeline de decisiones vacío y visible
 ☐ Botón "Hablar con el agente" probado
 ☐ Navegador: permiso de micrófono YA concedido (no durante la demo)
 ☐ Notificaciones del sistema operativo silenciadas · Modo No Molestar · batería enchufada

SALA
 ☐ Altavoz probado con la voz del agente al volumen de la sala (el TTS suena más bajo de lo que crees)
 ☐ Micrófono para el jurado probado, y decidido si habla al portátil o a un micro aparte
 ☐ Tarjeta de Rosa impresa (dos copias)
 ☐ Wifi: probado el túnel con la red del recinto, no con la de casa
 ☐ Móvil con la pantalla del ES-Alert simulada, y ETIQUETADA como propuesta de protocolo
```

---

## 4. Plan B para cada punto de fallo

| Falla | Síntoma | Plan B (decidido de antemano, sin improvisar) |
|---|---|---|
| **El túnel se cae** | Las tools del agente no responden; silencios raros | El agente tiene frase de repuesto («Todavía no tengo su salida asignada. Salga de casa…») y la demo **sigue**: se enseña la parte de estado con el motor local. Luis lo dice: «se nos ha caído el túnel, la llamada sigue funcionando porque el agente está escrito para eso». Es una demostración accidental de resiliencia. |
| **No hay micrófono / el navegador del jurado no deja** | El Web call no arranca | El jurado habla al portátil de Pablo. Si tampoco: **llamada grabada del ensayo**, presentada como grabación («esta es la misma llamada de hace una hora»). Nunca se finge que es en directo. |
| **El TTS va lento** | La llamada de 90 s se va a 150 s | Se corta el bloque de vecinos (objetivo (d), el primero de la lista de sacrificio) y Luis lo explica: «este bloque lo salta cuando la llamada se alarga, porque salir de casa va antes que los vecinos». |
| **El agente inventa una cifra** | Dice minutos que no vienen de la tool | Luis lo señala él mismo: «ha dicho un número que no debería: ese es exactamente el fallo que medimos con un Northstar, y aquí está el run que lo cazaría». Convertir el fallo en la explicación del control de calidad. |
| **Slack no conectado** | No hay mensaje al puesto de mando | El parte se enseña en el panel del dashboard. **No se menciona Slack.** |
| **Google Maps no conectado** | Sin ETAs reales | Distancia en línea recta, **dicho en voz alta** si alguien pregunta por las rutas. Regla §13. |
| **El mapa no carga** | Pantalla en blanco | Se narra sobre el timeline de decisiones y la lista de la patrulla, que son texto y siempre cargan. |
| **Se agotan los créditos** | La llamada no sale | Grabación del ensayo + se enseña el resto del sistema. Por eso los créditos se comprueban **antes**. |
| **La llamada del jurado se alarga** | Vamos por 1:40 y seguimos en el paso 2 | Pablo dispara el cambio de viento **mientras el jurado sigue al teléfono**: el paso 3 sucede encima del paso 2 y queda mejor. Este plan B es mejor que el plan A y conviene ensayarlo a propósito. |
| **Pregunta difícil: «¿y el modelo de fuego?»** | — | Respuesta preparada: «Es una simplificación deliberada: una curva que decae con el ángulo, más conservadora que la elipse de FARSITE, así que avisamos a más gente de la que hace falta. La derivación está escrita.» Nunca decir "modelo físico". |
| **Pregunta difícil: «¿esto lo empuja el ES-Alert?»** | — | «No. El cell broadcast es de una dirección y no nos da teléfonos: lo usamos como puerta de entrada, dando un número al que llamar. Lo que ven en el móvil es una **propuesta de protocolo**, no una integración.» Está etiquetado en pantalla. |
| **Pregunta difícil: «¿y la privacidad?»** | — | «Grabación avisada, consentimiento de ubicación pedido aparte y aceptado un "no" a la primera, y un "no" no reduce la ayuda. Datos de salud, los mínimos: preguntamos si puede salir sola, no el diagnóstico.» |

---

## 5. Qué puede salir mal (en la demo, no en el sistema)

| Riesgo | Mitigación |
|---|---|
| **Se cuentan features en vez de enseñarlas** | El guion §1 tiene una columna "qué se ve": si algo no tiene imagen, no entra en los 3 minutos. |
| **Se pasa de 3 minutos** | Orden de sacrificio decidido: primero el paso 4, luego el cierre del paso 5. El paso 3 (el cambio de escenario) **no se toca nunca**: es el obligatorio del reto. |
| **Se dice un dato no verificado** | Lista de respuestas preparadas en §4 + regla §13 del escenario. Las tres trampas conocidas: el número de la carretera norte de Losacio (no confirmado, **no se nombra**), las capacidades de las zonas de acogida (estimadas) y el modelo de fuego. |
| **El jurado cree que los teléfonos son reales** | Etiqueta "DATOS SINTÉTICOS" en pantalla desde el segundo 0 y rango `+3460099xxxx` visible en el panel. |
| **Los dos presentadores hablan encima** | Reparto fijo: Luis habla, Pablo solo dispara y no narra. Si Pablo tiene que decir algo, lo dice en dos palabras. |
| **Se ensaya una vez** | Tres ensayos completos con reloj, y uno de ellos con un desconocido haciendo de Rosa, sin avisarle de qué va a preguntar el agente. |
