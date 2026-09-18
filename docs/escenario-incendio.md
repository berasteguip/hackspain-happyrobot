# Idea principal: evacuación conversacional en incendios forestales

> Estado: idea principal del equipo router123 (18 sep 2026). Escenario elegido: incendio forestal en la España rural. Cliente objetivo: Protección Civil / CECOPI (B2G).
> Enunciado del reto: `docs/reto-happyrobot.md`. Plataforma: `docs/plataforma-happyrobot.md`.

## 1. Qué queremos hacer (en una frase)

Cada vecino de la zona de evacuación tiene línea directa con el puesto de mando, y el puesto de mando tiene una conversación con cada vecino.

HappyRobot hoy vende agentes de voz a empresas (B2B: logística, transporte). Nuestra propuesta es llevar la misma plataforma al sector público (B2G): un centro de mando agéntico para emergencias que habla con la población afectada, no solo con los responsables.

## 2. Por qué esto y no "detecto fuego, llamo a bomberos"

Los demás equipos del track van a construir el enunciado literal: detectar el fuego, avisar a bomberos, mover medios, cambiar el viento, reasignar. Eso ya lo hace el CECOPI con radio, mapa y protocolo. Automatizarles la llamada aporta poco.

Donde el sistema falla hoy, y donde muere la gente, es en la otra mitad: la población.

- La evacuación se comunica con ES-Alert (SMS masivo unidireccional, en uso desde 2022) y Guardia Civil puerta a puerta.
- Nadie sabe en tiempo real quién se ha ido, quién no puede, quién se niega, quién ha vuelto.
- Casos reales: Losacio (Zamora, 2022), varias víctimas eran vecinos que estaban en su pueblo o volvieron a por el ganado. [PENDIENTE: verificar cifras y fuentes antes del pitch]

Lo que solo puede hacer HappyRobot y nadie ha hecho: llamar a cientos de casas de la zona de evacuación en paralelo en pocos minutos, hablar con cada una y volver con un censo vivo. La evacuación deja de ser una orden y pasa a ser una conversación.

## 3. Qué sale de esas conversaciones

### 3.1 Censo de evacuación en tiempo real
Cada llamada extrae: cuántos sois, movilidad, coche sí/no, animales, hacia dónde vais. Los que no contestan pasan a una lista geolocalizada para la patrulla puerta a puerta, ordenada por ETA (Google Maps) y cercanía al frente. La Guardia Civil deja de barrer el pueblo entero y va a las casas que faltan.

### 3.2 Los que se niegan no son un log, son una negociación
El ganadero que no se va sin las vacas es el caso real de muerte. El agente no apunta "se niega": pregunta si tiene remolque, busca en la lista un vecino con remolque libre, los pone en contacto y le da hora límite. Coordinación de evacuación de ganado como subproducto.

### 3.3 Voluntarios espontáneos
En cada incendio grande salen vecinos con tractores y cubas a hacer cortafuegos por su cuenta, sin coordinación y a veces delante del frente. Van a ir igual. El agente los registra en la misma llamada ("tengo tractor con cuba"), los asigna a tareas seguras bajo indicación del puesto de mando y, lo importante, los llama para retirarlos cuando el viento gira.

### 3.4 El pueblo como red de sensores
Línea entrante: cualquiera llama y pregunta "¿tengo que irme?" y el agente contesta con el plan vivo de su pueblo, no un mensaje genérico. En la misma llamada extrae lo que ven ("humo en el cerro de X, la carretera de Y cortada"). De noche, sin medios aéreos, esa información alimenta el perímetro estimado. Es el 112 al revés.

### 3.5 La vuelta a casa
Cuando un pueblo sale de la zona, el agente llama a sus evacuados para decirles que aún no vuelvan o que ya sí. Volver antes de tiempo es la otra causa de muerte, y hoy nadie avisa.

## 4. Los responsables: consumidores del censo, no protagonistas

CECOPI, jefe de sala de la Guardia Civil, alcaldes, Cruz Roja, hospital comarcal siguen en el sistema, pero reciben información que hoy no existe: "Ferreras 87 % evacuado, 4 casas sin contestar, 2 tractores en el flanco norte". El agente les llama cuando hay algo que decidir (aprobar retirada de voluntarios, abrir un pabellón), no para contarles el fuego.

Cada organismo recibe un mensaje distinto (criterio "a quién se avisa y cuándo"): Cruz Roja recibe necesidades del albergue, el hospital recibe previsión de heridos, el responsable recibe el resumen.

## 5. Mapeo a las seis preguntas del reto

| Pregunta | Cómo la responde el sistema | Nodos HappyRobot |
|---|---|---|
| Qué información importa | Cada llamada y webhook pasa por extracción + clasificación (gravedad, fiabilidad: confirmado / no confirmado / rumor). Deduplicación: tres llamadas del mismo sitio son un evento. | AI Extract, AI Classify, Python Sandbox, Twin |
| Qué va primero | Score por casa/pueblo: riesgo vital x personas x tiempo hasta el frente x fiabilidad, contra los medios disponibles. Lo no confirmado genera una acción de verificación, no se ignora ni se actúa a ciegas. | Python Sandbox, Twin |
| A quién se avisa y cuándo | Matriz de escalado por tipo de evento. Vecinos, voluntarios, patrulla y organismos reciben mensajes distintos. Si no contesta en X min, siguiente del escalado. | Loop, agente de voz outbound, Send SMS, Paths |
| Dónde van los recursos | ETA de patrulla, autobús y equipos a cada punto. La asignación muestra explícitamente quién se queda esperando y por qué. Si el dueño del recurso dice no, se reasigna en caliente. | Google Maps, Python Sandbox, agente de voz |
| Qué se hace ahora | Cada acción tiene dueño y plazo. El agente llama, manda SMS, abre ticket y persigue el acuse. | Agente de voz, Send SMS, Slack/Sheets, Webhook |
| Cuándo tirar el plan | El motor de escenario cambia el viento, corta carreteras, satura el hospital. El sistema replanifica y muestra el diff con motivo. | Webhook trigger, Python Sandbox, Twin |

## 6. Cambio de escenario (componente de primera clase)

Motor de escenario propio: script con timeline que dispara webhooks al workflow de HappyRobot durante la ejecución. Eventos: viento gira (entran dos pueblos nuevos en zona), carretera cortada, hospital saturado, rumor no confirmado, pueblo sale de la zona.

Cuando el viento gira el sistema hace tres cosas a la vez (coordinación de la rúbrica): llama a los pueblos nuevos, replanifica la ruta de la patrulla, y retira a los tractores del flanco que ahora es frente. El dashboard muestra el diff entre plan anterior y nuevo con el motivo.

## 7. Interfaz humana y control

Dashboard propio que lee Twin y Runs por API: mapa con perímetro y casas por estado (evacuada, sin contestar, se niega, voluntario), timeline de lo que ha cambiado en los últimos minutos, plan con dueños, llamadas en curso con transcripción.

Intervención humana:
- Approval Process de HappyRobot para acciones gordas (retirar voluntarios, pedir UME, abrir albergue).
- Nodo Transfer: si el agente no está seguro en una llamada (ganadero difícil), la pasa a una persona.
- Botones: aprobar, anular, pausar al agente, "pásame la llamada".

## 8. Aprendizaje (bonus)

Northstars en los prompts + workflow post-ejecución que lee los Runs y ajusta Twin: qué guion consigue que la gente salga de verdad (tasa de confirmación por versión de mensaje), qué números nunca contestan, a qué hora se coge más el teléfono. En la segunda pasada de la demo se nota.

## 9. De dónde salen los teléfonos (la pregunta del jurado)

No se llama a Zamora, se llama a la zona de evacuación: 3 a 6 pueblos de 50 a 400 habitantes, cientos de números, no millones.

Capas, de más real a más ambiciosa:

- **Capa 0, sin conocer ningún número: ES-Alert al revés.** ES-Alert es cell broadcast: llega a todos los móviles que están físicamente en la zona sin saber quién son. Hoy es unidireccional. Nuestro giro: el ES-Alert lleva un número ("llama o escribe al XXX para tu plan de evacuación") y el agente atiende inbound. Cubre turistas y gente fuera de todo registro, sin tocar datos personales.
- **Capa 1, datos que el ayuntamiento y Protección Civil ya tienen.** Apps de bandos municipales (la gente se apunta con su móvil), registro de personas vulnerables de los planes de Protección Civil, teleasistencia (IMSERSO, Cruz Roja: precisamente los mayores que viven solos), fijos por dirección. El alcalde de un pueblo de 200 personas tiene los teléfonos de casi todos.
- **Capa 2, la red vecinal (lo hace el sistema solo).** En cada llamada el agente pregunta por los vecinos: quién vive al lado, su teléfono, si están. Con 30 llamadas iniciales se sacan 100 números y se sabe qué casas están vacías sin llamarlas. El censo se construye conversando. Demostrable en directo.
- **Capa 3, convenios de emergencia (el producto B2G a medio plazo).** Cada casa tiene contrato de luz con teléfono del titular; las operadoras saben qué móviles hay en cada celda. La Ley del Sistema Nacional de Protección Civil obliga a colaborar en emergencias y el RGPD cubre el tratamiento por interés vital e interés público. Se vende como acuerdos de datos que solo se activan al declararse la emergencia, no como vigilancia. No se construye en 36 h; responde al "¿cómo escala?".

Para la hackathon: dataset sintético de 3 pueblos con unas 120 casas (dirección, coordenadas, teléfono, movilidad, animales), declarado como sintético. Capas 0 y 2 se ven funcionar en la demo; capas 1 y 3 se cuentan en el pitch.

## 10. Qué es de HappyRobot y qué construimos nosotros

| HappyRobot | Nosotros |
|---|---|
| Workflows, agentes de voz (inbound y outbound, multiidioma), SMS, Twin como estado de la crisis, Approval Process, Transfer, Runs, Northstars, Google Maps | Motor de escenario (timeline de webhooks), dashboard, dataset sintético de contactos y recursos, guiones de los agentes |

Con un número español comprado (Telnyx, 0,80 USD) las llamadas y SMS salen de verdad. El trigger Web call permite que el jurado hable con el agente desde el navegador sin teléfono.

## 11. La demo (3 minutos)

1. Webhook: incendio en la Sierra de la Culebra, 3 pueblos en zona. En pantalla decenas de llamadas en paralelo y el censo llenándose.
2. Uno del jurado hace de vecino por Web call: el agente le pregunta cuántos son, él dice que no se va sin las ovejas, el agente le busca remolque y le pide el teléfono del vecino.
3. Cambia el viento: entra un pueblo nuevo. El agente llama a los tractores para retirarlos y al vecino evacuado para que no vuelva. Diff del plan en pantalla.
4. Intervención humana: se anula una asignación desde el dashboard, el agente se adapta.
5. Cierre: la Guardia Civil recibe la lista de 4 casas sin contestar en vez de barrer 400.

## 12. Plan por fases (36 h)

| Fase | Qué | Desbloquea |
|---|---|---|
| F0 | Autorizar OAuth del MCP, comprar número ES, dataset sintético en Twin, motor de escenario mínimo (1 webhook) | Todo |
| F1 | Intake: agente inbound (Web call) + AI Extract + escritura en Twin | Demo paso 2 |
| F2 | Censo outbound: Loop sobre casas + agente outbound + extracción de respuestas | Demo paso 1 |
| F3 | Priorización y asignación (Python + Google Maps), replanificación al recibir evento | Demo paso 3 |
| F4 | Dashboard (mapa, timeline, diff, botones) + Approval Process + Transfer | Demo paso 4 |
| F5 | Voluntarios, vuelta a casa, aprendizaje post-run | Demo paso 5, bonus |
| F6 | Pitch y ensayo (reservar tiempo, la demo pesa tanto como el sistema) | |

## 13. Pendientes de verificar antes del pitch

- Cifras y fuentes de Losacio 2022 y de víctimas por volver antes de tiempo.
- Fecha de despliegue de ES-Alert en España y cobertura.
- Cobertura de teleasistencia en Castilla y León.
- Créditos disponibles en la cuenta del hackathon y base URL de la API EU (preguntar en el stand).
