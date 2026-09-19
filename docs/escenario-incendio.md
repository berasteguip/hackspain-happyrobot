# Idea principal: guiado individual de evacuación en incendios forestales

> Estado: idea principal del equipo router123, alcance cerrado el 19 sep 2026. Escenario: incendio forestal en la España rural. Cliente objetivo: Protección Civil / CECOPI (B2G).
> Enunciado del reto: `docs/reto-happyrobot.md`. Plataforma: `docs/plataforma-happyrobot.md`.

## 1. Qué queremos hacer (en una frase)

Sabemos dónde está cada persona y dónde está el fuego, y guiamos a cada una hasta que sale viva.

HappyRobot hoy vende agentes de voz a empresas (B2B: logística, transporte). Nuestra propuesta es llevar la misma plataforma al sector público (B2G): un puesto de mando agéntico que trabaja para Protección Civil y el CECOPI, y cuya contraparte es la población que está dentro de la zona del incendio.

## 2. La idea en cuatro pasos

1. **La llamada es el onboarding, no el producto.** Cuando se declara la zona de evacuación, el sistema llama en masa a las casas de la zona. En la llamada hace tres cosas: sacar a la persona de casa, confirmar que está con nosotros, y pedir permiso para conocer su ubicación.
2. **Con la ubicación pintamos el mapa.** Puntos rojos: personas que tenemos que sacar de la zona. Encima, el polígono del fuego y hacia dónde avanza. Es el mapa que hoy no tiene nadie: el CECOPI ve el fuego, no ve a la gente.
3. **Guiamos a cada persona individualmente.** Cada punto tiene una salida asignada. Si el fuego se mueve hacia donde va alguien, se le avisa: "no sigas por ahí, el fuego acaba de entrar; tira a la izquierda". Cada uno recibe su instrucción, no un aviso genérico al pueblo.
4. **Repartimos a la gente por zonas de salida.** Cada persona va a la zona segura que le corresponde según dónde está, hacia dónde va y por dónde viene el fuego.

Lo que los demás equipos van a hacer con "incendio forestal" es el enunciado literal: avisar a los pueblos y mover medios. Nosotros no avisamos a pueblos: guiamos a personas con su posición real, y usamos esa posición para tres cosas más que hoy no existen (sección 4).

## 3. Cómo se consigue la posición y el guiado

- **Posición.** La llamada da una posición declarada. Acto seguido el agente manda un SMS o WhatsApp con un enlace a una página nuestra que comparte GPS mientras esté abierta. Con eso la posición pasa de ser un punto a ser una trayectoria: sabemos hacia dónde va cada persona. Quien no tiene smartphone (mayores, fijo) se queda con la posición declarada y el agente le vuelve a llamar cada pocos minutos para actualizarla.
- **Fuego.** Polígono y dirección de avance entran por webhook (motor de escenario en la hackathon; AEMET y perímetro oficial en producción).
- **Rutas.** Google Maps calcula la ruta de cada persona a su zona de salida tratando el polígono del fuego y las carreteras cortadas como zonas prohibidas. Cuando el fuego se mueve, Python recalcula las rutas afectadas y solo escribe a quien le cambia la instrucción.
- **Aviso por geofence.** Si la trayectoria de alguien se mete en el cono de avance del fuego, el agente le llama en el acto con la corrección. La llamada la dispara el sistema, no una persona mirando el mapa.
- **Orden de la cola.** Cuando hay que decidir a quién se atiende primero, la medida es minutos hasta que el fuego le alcanza (posición, dirección, velocidad, viento), no distancia. Alguien a 3 km a favor del viento está peor que alguien a 800 m en contra.

## 4. Las tres cosas que salen del mapa y no existen hoy

### 4.1 Casas sin contestar: la patrulla va a la casa concreta
Cada casa a la que se ha llamado y no ha contestado (ni a la segunda llamada) queda registrada con dirección y coordenadas en una lista viva. Esa lista se manda a la Guardia Civil y a la Policía Local ordenada por minutos hasta el frente y por ETA de la patrulla. La patrulla puerta a puerta deja de barrer 300 casas y va directamente a las 6 que faltan. Cuando alguien de la lista contesta o aparece en el mapa, sale de la lista y la patrulla lo ve actualizado.

### 4.2 Convoyes
En vez de 40 rutas individuales por el mismo camino, el sistema agrupa a los que están en la misma zona y salen por la misma carretera, nombra un coche guía (el que tiene mejor cobertura o conoce la zona) y le da la ruta solo a él. Al resto: "sigue al Seat blanco de Antonio". Menos mensajes, menos gente perdida de noche, y se sabe dónde está un grupo de 12 coches con un solo GPS. Si el guía se desvía o se para, el sistema lo detecta y llama.

### 4.3 El mapa de gente manda sobre los medios aéreos
El director de extinción decide dónde descarga el helicóptero por dónde está el fuego. Con nuestro mapa puede decidir por dónde está la gente: "sector 4, 8 personas todavía dentro, descarga ahí primero". Cada vez que cambia la distribución de personas por sector, el sistema manda al puesto de mando la prioridad actualizada (email, Sheet y Slack o Teams del CECOPI). Es el enlace entre el censo civil y la táctica de extinción. No existe.

## 5. Mapeo a las seis preguntas del reto

| Pregunta | Cómo la responde el sistema | Nodos HappyRobot |
|---|---|---|
| Qué información importa | De cada llamada se extrae solo lo que decide: cuántos, dónde, movilidad, coche, hacia dónde. Posiciones GPS y fuego se funden en un solo estado. | AI Extract, Python Sandbox, Twin |
| Qué va primero | Cola por minutos hasta el frente, no por distancia. Casas sin contestar ordenadas igual. | Python Sandbox, Twin |
| A quién se avisa y cuándo | Cada persona recibe su instrucción, el guía del convoy recibe la ruta, la patrulla recibe casas, el puesto de mando recibe sectores. Nadie recibe lo del otro. | Agente de voz outbound, Send SMS, Loop, Paths |
| Dónde van los recursos | Zonas de salida por capacidad y ruta, patrulla a casas concretas, prioridad de descarga aérea por personas dentro. | Google Maps, Python Sandbox |
| Qué se hace ahora | Cada persona tiene una acción concreta (sal por X, sigue a Y, quédate en Z), cada patrulla una casa, cada medio aéreo un sector. | Agente de voz, Send SMS, Webhook, Slack/Sheets |
| Cuándo tirar el plan | El fuego se mueve: se recalculan rutas, se reagrupan convoyes, cambia la lista de casas y la prioridad aérea. El dashboard muestra el diff con motivo. | Webhook trigger, Python Sandbox, Twin |

## 6. Cambio de escenario (componente de primera clase)

Motor de escenario propio: script con timeline que dispara webhooks al workflow de HappyRobot durante la ejecución. Eventos: el viento gira y el frente cambia de dirección, carretera cortada, una zona de salida queda amenazada, una persona se para o se desvía hacia el fuego.

Cuando el viento gira el sistema hace cuatro cosas a la vez: recalcula rutas y avisa solo a quien cambia, reagrupa los convoyes afectados, reordena la lista de casas sin contestar, y manda la nueva prioridad de sectores al puesto de mando.

## 7. Interfaz humana y control

Dashboard propio que lee Twin y Runs por API: mapa con polígono del fuego, puntos rojos (personas por localizar), puntos en ruta con su trayectoria, convoyes, zonas de salida, casas sin contestar; timeline de cambios; llamadas en curso con transcripción.

Intervención humana:
- Approval Process de HappyRobot para acciones que comprometen a terceros (mandar una patrulla a un sector ya amenazado, cambiar la prioridad aérea).
- Nodo Transfer: si el agente no está seguro en una llamada, la pasa a una persona.
- Botones: anular una ruta o una asignación, pausar al agente, "pásame la llamada".

## 8. Aprendizaje (bonus)

Northstars en los prompts + workflow post-ejecución que lee los Runs: qué guion consigue que la gente se mueva en menos minutos, qué números no contestan a qué hora, qué guías de convoy cumplen. En la segunda pasada de la demo ya llama con el guion que funcionó.

## 9. De dónde salen los teléfonos (la pregunta del jurado)

No se llama a Zamora, se llama a la zona de evacuación: 3 a 6 pueblos de 50 a 400 habitantes, cientos de números.

- **Capa 0, ES-Alert al revés.** ES-Alert es cell broadcast: llega a todos los móviles que están físicamente en la zona sin saber quién son. Hoy es unidireccional. Nuestro giro: el ES-Alert lleva un número y el agente atiende inbound; quien llama entra en el mapa. Cubre turistas y gente fuera de todo registro, sin tocar datos personales.
- **Capa 1, datos que el ayuntamiento y Protección Civil ya tienen.** Apps de bandos municipales, registro de personas vulnerables, teleasistencia (IMSERSO, Cruz Roja), fijos por dirección.
- **Capa 2, la red vecinal.** En cada llamada el agente pregunta por los vecinos (quién vive al lado, su teléfono, si están). Con 30 llamadas se sacan 100 números.
- **Capa 3, convenios de emergencia (B2G a medio plazo).** Contratos de suministro, celdas de las operadoras. La Ley del Sistema Nacional de Protección Civil obliga a colaborar y el RGPD cubre interés vital e interés público. Acuerdos que solo se activan al declararse la emergencia.

Para la hackathon: dataset sintético de 3 pueblos con unas 120 casas (dirección, coordenadas, teléfono, movilidad), declarado como sintético. Capas 0 y 2 se ven funcionar; 1 y 3 se cuentan en el pitch.

## 10. Qué es de HappyRobot y qué construimos nosotros

| HappyRobot | Nosotros |
|---|---|
| Workflows, agentes de voz (inbound y outbound), SMS y WhatsApp, AI Extract, Twin como estado (personas, fuego, convoyes, casas), Google Maps, Python Sandbox, Approval Process, Transfer, Runs, Northstars | Página del enlace GPS, motor de escenario (timeline de webhooks + modelo simple de avance del fuego), dashboard con el mapa, dataset sintético, guiones de los agentes |

Con un número español comprado (Telnyx, 0,80 USD) las llamadas y SMS salen de verdad. El trigger Web call permite que el jurado hable con el agente desde el navegador.

## 11. La demo (3 minutos)

1. Webhook: incendio en la Sierra de la Culebra, 3 pueblos en zona. En pantalla decenas de llamadas en paralelo y los puntos rojos apareciendo en el mapa.
2. Uno del jurado hace de vecino por Web call: el agente le pide permiso, le manda el enlace, y su punto aparece en el mapa moviéndose. Le asigna un convoy y le dice a quién seguir.
3. Cambia el viento: el frente entra en la carretera por la que sale el convoy. El agente llama al guía con la ruta nueva, los demás reciben el SMS, la lista de casas sin contestar se reordena y el puesto de mando recibe la nueva prioridad de sectores. Diff en pantalla.
4. Intervención humana: se anula una ruta desde el dashboard, el agente recoloca.
5. Cierre: la Guardia Civil recibe 6 casas concretas en vez de barrer 300, y el helicóptero recibe el sector con más gente dentro.

## 12. Plan por fases (36 h)

| Fase | Qué | Desbloquea |
|---|---|---|
| F0 | Autorizar OAuth del MCP, comprar número ES, dataset sintético en Twin, motor de escenario mínimo (1 webhook con polígono) | Todo |
| F1 | Llamada de onboarding (Web call + outbound): consentimiento, AI Extract, SMS con enlace GPS; página del enlace escribiendo posición en Twin | Demo pasos 1 y 2 |
| F2 | Mapa: dashboard con personas, fuego y zonas de salida leyendo Twin | Demo paso 1 |
| F3 | Rutas con Maps, recálculo al recibir evento, geofence que dispara llamada, cola por minutos hasta el frente | Demo paso 3 |
| F4 | Casas sin contestar (lista viva a patrulla) y convoyes (agrupación + guía) | Demo pasos 3 y 5 |
| F5 | Prioridad aérea por sector al puesto de mando; Approval Process, Transfer y botones del dashboard | Demo pasos 4 y 5 |
| F6 | Aprendizaje post-run; pitch y ensayo (la demo pesa tanto como el sistema) | Bonus |

## 13. Pendientes de verificar antes del pitch

- Cifras y fuentes de víctimas en incendios recientes en España atrapadas al evacuar (Losacio 2022 y otros).
- Fecha de despliegue de ES-Alert en España y cobertura.
- Si Google Maps en HappyRobot permite zonas a evitar; si no, el cálculo de rutas lo hace nuestro backend y HappyRobot solo lo comunica.
- Créditos disponibles en la cuenta del hackathon y base URL de la API EU (preguntar en el stand).

## 14. Backlog (decidido, no en el alcance base de 36 h)

Todo esto se construye encima del mapa de personas y del fuego. Orden = prioridad.

| # | Feature | Qué es | Por qué gana |
|---|---|---|---|
| B1 | **Simulador de evacuación** | Antes de dar la primera orden, el backend simula la evacuación completa: 300 agentes sobre la red de carreteras real (OSM), capacidad por tramo (un camino rural traga 6 coches/min, no 60), fuego avanzando según el viento. Prueba cientos de variantes (quién sale primero, por qué salida, escalonado o no, contraflujo sí o no) y elige la que menos gente pierde. Muestra el número: "plan ingenuo: 31 interceptados en la cola de la N-631; plan elegido: 2". Al girar el viento, resimula en segundos delante del jurado. | Adaptación y prioridad convertidas en algo que se ve moverse y en una cifra que nadie más tendrá. Es Paradise 2018 (gente muerta en el coche en la cola de la única salida) evitado. |
| B2 | **Hora de caducidad de cada decisión** | Cada decisión pendiente tiene un punto de no retorno calculado por el simulador: abrir la N-631 en contraflujo vale hasta las 17:52 (después la cola ya está formada); evacuar sector 3 vale hasta las 18:05 (después es refugio, no evacuación). Se muestra como cuenta atrás al lado del botón Aprobar. | "Cuándo tirar el plan" con reloj. El humano decide, pero sabe cuánto tiempo tiene. Criterio Control convertido en tensión visible. |
| B3 | **Replay del incendio real (Sierra de la Culebra 2022)** | Cargar la línea de tiempo real (perímetros por horas de Copernicus EMS, lugar y hora de los cuatro fallecidos) y ver qué habría ordenado el sistema a las 17:10 cuando giró el viento. "El sistema habría sacado a Losacio 40 minutos antes." | Credibilidad que ninguna demo sintética da. Diapositiva de cierre del pitch. Bonus de aprendizaje en su versión seria. **Verificar datos antes del pitch.** |
| B4 | **El simulador aprende su propio error** | Tras cada incidente (o cada ensayo en la demo) compara predicción con realidad y recalibra parámetros: tiempo de salida de casa tras la orden (predijo 8 min, fueron 14), velocidad en camino rural, tasa de gente que no se mueve. En la segunda pasada de la demo los números cambian y se explica por qué. | Bonus de aprendizaje aplicado al modelo, no a los guiones. Es lo que hace que un VC se lo crea como producto. |

Dependencias: B2, B3 y B4 necesitan B1. B1 es un fin de semana de JS (grafo OSM + polígono que crece); B2 y B4 son lecturas distintas de la misma simulación; B3 depende de encontrar los datos.
