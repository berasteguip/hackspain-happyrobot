# Preguntas para el stand de HappyRobot

> Lista cerrada de lo que **no hemos podido verificar** leyendo su documentación ni explorando el
> workspace del equipo. Cada pregunta lleva por qué importa y qué hacemos si la respuesta es "no",
> para que nadie se quede bloqueado esperando. Investigación previa: `docs/02-happyrobot/03-workspace-y-limites-verificados.md`
> y `docs/02-happyrobot/04-api-y-sdk.md`.
>
> Regla: esto no se adivina. Si algo de la plataforma no está claro, la respuesta es preguntar aquí,
> no suponer. Cuando alguien conteste, **se anota la respuesta en este fichero con quién la dio**.

## Bloqueantes (afectan al diseño, preguntar primero)

### 1. ¿Cuántas llamadas simultáneas aguanta la cuenta de la hackathon? ¿Y qué rate limit tiene la API?

**Por qué importa:** la demo entera es una llamada masiva. Si el límite son 2 llamadas concurrentes, el
"llamamos a 120 casas" pasa de ser una ola a ser una cola de 40 minutos, y eso cambia el guion de la
demo (habría que enseñar la cola priorizada trabajando en serie, que sigue siendo buena historia, pero
es otra historia). También cambia cómo escalonamos: si podemos lanzar 20 a la vez, el orden de la cola
importa menos que si van de una en una.

**Si la respuesta es "pocas":** el dashboard enseña la cola con el motivo de cada posición y se demuestra
que el sistema elige bien **a quién llamar primero** con un recurso escaso. Es exactamente el criterio
"Prioridad" de la rúbrica, así que no perdemos puntos — cambiamos qué enseñamos, no qué construimos.

### 2. ¿Twin tiene endpoint REST fuera de un workflow?

**Por qué importa:** hemos verificado que se accede por nodos `twin.read`/`twin.write` dentro de un
workflow, o por su MCP con `execute_sql`. Lo que no sabemos es si hay una URL que podamos llamar desde
nuestro backend. Si la hay, Twin puede ser el espejo de estado que los agentes consultan sin salir de la
plataforma y nos ahorra latencia.

**Si la respuesta es "no":** ya está decidido y no se cae nada. El dashboard lee de `api/`, Twin es
espejo y no fuente (`docs/06-producto/03-contrato-de-datos.md` §0). Solo confirma la arquitectura que ya tenemos.

### 3. ¿Nos dais número español para llamadas salientes? ¿Y cuántos créditos tiene la cuenta?

**Por qué importa:** un +34 es la diferencia entre que un vecino de Zamora conteste y que no. Y si los
créditos son contados, hay que decidir cuántas llamadas de verdad gastamos en ensayos y cuántas guardamos
para el momento de la demo. Con `ALLOW_REAL_CALLS=false` los ensayos no gastan nada, pero el ensayo final
sí tiene que ser real.

**Si la respuesta es "no hay número español":** se prueba con el número que haya y en el pitch se dice
que en producción sería un número institucional del 112 — que además es lo correcto, porque una llamada
de evacuación desde un móvil desconocido es menos creíble que desde un número oficial.

## Importantes (no bloquean, pero cambian qué features entran)

### 4. ¿Qué es exactamente "Approval Process" y tiene API?

**Por qué importa:** nuestro criterio "Control" se apoya en que un humano apruebe lo irreversible
(abrir una carretera en contraflujo, mandar una patrulla a una casa). Si la plataforma ya tiene un
mecanismo de aprobación con API, lo usamos y ganamos integración real. No hemos encontrado ni rastro de
endpoint, así que sospechamos que es solo de UI, pero no lo damos por cierto.

**Si es solo UI:** nuestro dashboard ya tiene `POST /human/approve` y el `decision_log` con
`approved_by`. Funciona igual, solo es menos "nativo de la plataforma".

### 5. ¿La tarjeta de `transfer_popup.create_popup` se puede renderizar en nuestro propio dashboard?

**Por qué importa:** si el operador del puesto de mando puede ver la tarjeta de la llamada en curso
**dentro de nuestro mapa**, la intervención humana deja de ser "cambia de pestaña" y pasa a ser un solo
sitio. Eso sube directamente el criterio "Control" con muy poco código.

**Si no:** el Web Call embed (`client.voice.createToken()` + `HappyRobotVoiceClient`) ya nos da el audio
en la página, y con `should_takeover` el operador puede coger la llamada. Es la vía que ya teníamos
prevista.

### 6. Timeouts reales: ¿cuánto CPU tiene el Python Sandbox, y cuánto espera un nodo webhook usado como tool del agente?

**Por qué importa:** el agente de voz llama a `GET /instructions/{person_id}` en medio de una
conversación. Si nuestro cálculo de ruta tarda 4 s y el nodo corta a 2 s, el agente se queda mudo
delante de alguien que está evacuando. Necesitamos el número para decidir si precalculamos la
instrucción antes de llamar (que probablemente sea lo correcto de todas formas).

**Si el margen es corto:** `/instructions` devuelve lo último calculado en lugar de calcular en caliente,
y el recálculo pasa a ser asíncrono. Es más robusto, solo menos elegante.

### 7. ¿Hay forma de que un run nos avise al terminar, o hay que sondear?

**Por qué importa:** verificamos que el helper oficial hace polling con `runs.get()`, y no encontramos
callback nativo. Si existe un webhook de "run terminado", el dashboard se entera antes y el timeline va
más fino.

**Si hay que sondear:** ya lo asumimos. El workflow nos hace `POST /calls/outcome` al acabar, que es
nuestro propio callback y no depende de que ellos tengan uno.

## Contexto que nos interesa (si hay tiempo y alguien con ganas de hablar)

- **Nunca han tenido un caso de uso de sector público ni de emergencias.** Tienen Series C de 150 M$ con
  Orange, Deutsche Telekom y Bankinter como inversores estratégicos, y el producto es logística. Nuestra
  propuesta les abre una vertical nueva. Merece la pena decírselo en voz alta: no es peloteo, es la razón
  por la que este proyecto les puede interesar más que uno que repite su caso de uso.
- **Qué pasa con una llamada que el destinatario cuelga a los 2 segundos**, que en una evacuación es
  frecuente. ¿Cuenta como `answered`? Nos importa porque la máquina de estados distingue `no_answer` de
  `contacted`, y colgar de inmediato es funcionalmente un no-contacto.
- **Si han visto a alguien usar el agente para hablar con más de una persona a la vez** (el caso del
  convoy: guía y seguidores necesitan instrucciones coherentes entre sí).

---

## Respuestas recibidas

_(Rellenar en el evento: pregunta, respuesta, quién la dio, hora. Si una respuesta invalida algo de
`docs/02-happyrobot/03-workspace-y-limites-verificados.md`, se corrige allí en el momento — los documentos que no se corrigen
cuando se aprende algo dejan de servir.)_
