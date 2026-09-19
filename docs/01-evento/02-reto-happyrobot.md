# HackSpain 2026 · Reto HappyRobot: ¿Puede la IA gestionar una crisis?

Enunciado oficial del track HappyRobot, transcrito tal cual lo publicó la organización. Es la fuente de verdad del proyecto: cualquier decisión de diseño o de demo se contrasta contra este documento.

- Escenario: una crisis que elegimos nosotros (incendio, apagón, inundación, o lo que se nos ocurra).
- Entorno: cambia mientras el sistema corre.
- Recursos: plataforma HappyRobot.

## Lo esencial: seis preguntas que tiene que contestar el sistema

En una crisis nunca se tiene toda la información, y lo que se sabe a las 12:00 ya no sirve a las 12:20. Un agente que siga una lista de pasos fija se queda atrás en el primer cambio. Estas son las seis preguntas que tiene que contestar el sistema, una y otra vez, mientras la situación va cambiando.

1. **Qué información importa.** Llegan cien mensajes y solo tres cambian algo. El sistema tiene que quedarse con esos tres y tirar el resto.
2. **Qué va primero.** Se pueden hacer veinte cosas a la vez, pero alguna importa más que las demás. El sistema tiene que decir por dónde se empieza ahora.
3. **A quién se avisa y cuándo.** Un vecino, un bombero y un responsable no necesitan lo mismo. Hay que decidir a quién se llama, qué se le cuenta y en qué orden.
4. **Dónde van los recursos.** Tenemos tres ambulancias y cinco sitios que las piden. Mandarlas a un lado es dejar el otro esperando.
5. **Qué se hace ahora.** No basta con contar cómo va la cosa. Hace falta la siguiente acción concreta y quién la hace.
6. **Cuándo tirar el plan.** Cambia el viento y el plan de hace veinte minutos ya no vale. ¿Se da cuenta el sistema, o sigue como si nada?

## Qué debe hacer: cuatro capacidades del agente

1. **Enterarse de lo que pasa.** Recoge lo que va llegando: llamadas, mensajes, sensores, APIs, lo que haya a mano. Con eso monta una pantalla donde se vea en dos segundos qué está pasando y qué ha cambiado en los últimos minutos.
2. **Priorizar.** De todo lo que hay abierto, dice qué se atiende primero y por qué. Contando con los medios que quedan, no con los que harían falta.
3. **Coordinar la respuesta.** Avisa a la gente, reparte tareas y sigue quién ha cogido qué. Llamadas, mensajes, tickets, APIs. El sistema mueve cosas, no solo las propone.
4. **Adaptarse.** A mitad de la ejecución algo cambia: se corta una carretera, se cae una integración, aparecen cincuenta personas más. El sistema es capaz de rehacer el plan.

## Requisitos de la entrega

| Qué | Qué significa | Estado |
|---|---|---|
| Sistema agéntico | Decide y actúa por su cuenta. Un chatbot que contesta preguntas no entra. | Obligatorio |
| Escenario que se mueve | La situación cambia mientras el sistema corre. Si el caso es fijo, no hay nada que adaptar. | Obligatorio |
| Respuesta de varios pasos | Una cadena de acciones con un objetivo, no una acción suelta. | Obligatorio |
| Interacción de verdad | Llama, escribe, crea tickets o mueve datos en un sistema real. Hablar con una persona cuenta. | Obligatorio |
| Interfaz para la persona | Una pantalla donde se pueda entender cuál es la situación, ver qué está haciendo el sistema e intervenir cuando sea necesario. | Obligatorio |
| Aprende de interacciones pasadas | Revisa las llamadas y las decisiones de ejecuciones anteriores, ve qué funcionó y qué no, y ajusta cómo actúa la próxima vez. | Bonus |

## Evaluación

Tres bloques con el mismo peso: cómo decide, cómo actúa, cómo se supervisa.

### Cómo decide
- **Decisión.** ¿Decide algo sensato sin tener todos los datos?
- **Prioridad.** ¿Sabe qué va primero cuando todo parece urgente?
- **Adaptación.** ¿Hace algo distinto cuando la situación cambia?

### Cómo actúa
- **Coordinación.** ¿Lleva a la vez a la gente, la información y los medios?
- **Ejecución.** ¿Ejecuta acciones fuera del sistema o solo las propone? Llamadas, mensajes, tickets, llamadas a APIs.

### Cómo se supervisa
- **Control.** ¿Se entiende qué está haciendo y se puede intervenir si hace falta?
- **Creatividad.** ¿El escenario y la forma de gestionarlo tienen algo propio?
- **Aprendizaje.** Puntos extra si aprende de las ejecuciones anteriores.

## Ideas de escenario (ejemplos del enunciado, lista abierta)

- **Incendio forestal.** Avisar a los pueblos, mover medios y rehacer el plan cada vez que el frente gira.
- **Apagón general.** Sin luz y con la cobertura a medias, decidir a quién se informa y qué se recupera primero.
- **Conflicto armado.** Mover civiles y transporte cuando la mitad de lo que llega no se puede confirmar.
- **Inundación u otro desastre natural.** Avisos a tiempo, carreteras cortadas y equipos repartidos por la zona.
- **Fallo de infraestructura crítica.** Se cae un sistema del que cuelgan otros. ¿Qué se levanta primero?
- **Lo que se nos ocurra.** Un accidente con muchos heridos, una emergencia humanitaria, un brote. El escenario es libre a propósito.

## Qué pone HappyRobot

- **La plataforma de HappyRobot.** La misma que tienen en producción, moviendo miles de interacciones al día entre voz, chat, email, etc.
- **El equipo.** Estarán en el evento durante el fin de semana para ayudar con la plataforma o con el escenario. Les gusta ver a la gente pelearse con sus propios problemas.
- **La demo cuenta tanto como el sistema.** Por muy bueno que sea lo construido, si en el pitch no se le saca valor, se queda a medias. Currarse la puesta en escena y guardar tiempo para ensayarla.
