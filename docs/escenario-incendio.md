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
- **Rutas.** Cada persona tiene una ruta a su zona de salida calculada tratando el polígono del fuego y las carreteras cortadas como zonas prohibidas. Cuando el fuego se mueve, se recalculan las rutas afectadas y solo se escribe a quien le cambia la instrucción.
  > ⚠️ **Corregido tras investigar** (`docs/research/routing-zonas-evitar.md`). Aquí decía "Google Maps", y **Google Maps no puede hacer esto**: el `RouteModifiers` de la Routes API v2 solo admite `avoidTolls`, `avoidHighways`, `avoidFerries`, `avoidIndoor` y `avoidTunnels` — cero soporte de polígonos. Tampoco OSRM (su `exclude` filtra clases del perfil Lua, no geometrías) ni Mapbox (categorías y hasta 50 puntos, no áreas). El proveedor que sí lo hace es **Valhalla** con `exclude_polygons`, que acepta anillos `[lon, lat]` y no está marcado experimental; se autoaloja en Docker y cada recálculo es sin estado, así que mover el fuego no obliga a reconstruir nada. Plan B: grafo propio de OSM (que además hace falta para el simulador de B1). Plan C: Openrouteservice autoalojado con `avoid_polygons`. **Evitar el polígono del fuego es el corazón de la idea, así que el proveedor no era un detalle de implementación.**
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
| Qué información importa | De cada llamada se extrae solo lo que decide: cuántos, dónde, movilidad, coche, hacia dónde. Posiciones GPS y fuego se funden en un solo estado. | AI Extract, Webhook → `api/`, Twin |
| Qué va primero | Cola por minutos hasta el frente, no por distancia. Casas sin contestar ordenadas igual. | `api/` (`/queue`), Twin como espejo |
| A quién se avisa y cuándo | Cada persona recibe su instrucción, el guía del convoy recibe la ruta, la patrulla recibe casas, el puesto de mando recibe sectores. Nadie recibe lo del otro. | Agente de voz outbound, Send SMS, Loop, Paths |
| Dónde van los recursos | Zonas de salida por capacidad y ruta, patrulla a casas concretas, prioridad de descarga aérea por personas dentro. | `api/` + Valhalla (rutas), Webhook |
| Qué se hace ahora | Cada persona tiene una acción concreta (sal por X, sigue a Y, quédate en Z), cada patrulla una casa, cada medio aéreo un sector. | Agente de voz, Send SMS, Webhook, Slack/Sheets |
| Cuándo tirar el plan | El fuego se mueve: se recalculan rutas, se reagrupan convoyes, cambia la lista de casas y la prioridad aérea. El dashboard muestra el diff con motivo. | Webhook trigger, `api/`, Twin |

> ⚠️ **Corregido tras investigar** (`docs/research/happyrobot-api.md`). Esta tabla decía "Python Sandbox"
> en cuatro filas, y el Sandbox de HappyRobot **no tiene red saliente**: su lista blanca de módulos es
> `math, datetime, pytz, re, dateutil, random, collections, json, _strptime, time, base64`, así que
> `requests` no existe ahí y **ningún nodo de Python puede llamar a nuestra API**. Todo lo que sale de
> la plataforma hacia nosotros va por nodos `webhook.*`. No es un problema: confirma la decisión de que
> el cálculo viva en `api/`, porque en el Sandbox nunca habría cabido. Twin sigue siendo el espejo que
> consultan los agentes, pero **el dashboard lee de `api/`, nunca de Twin** (Twin no tiene API REST
> confirmada fuera de un workflow).

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
  > ⚠️ **Corregido tras investigar** (`docs/research/es-alert.md`). Cell broadcast es *unconfirmed push* por diseño: el emisor nunca sabe quién recibió el mensaje, así que no hay canal de vuelta que aprovechar. La idea sigue en pie pero hay que contarla bien: el estándar admite URLs y hasta 1.395 caracteres, así que lo que proponemos es **usar ese margen para meter un teléfono o un enlace que lleve a un canal que sí es bidireccional** (nuestra llamada). No es ES-Alert volviéndose bidireccional, es ES-Alert como puerta de entrada. Y no tenemos acceso al sistema oficial de Protección Civil, así que en la demo el ES-Alert se enseña simulado en una pantalla de móvil, presentado como propuesta de mejora del protocolo; lo que se ejecuta de verdad son las llamadas. El único ES-Alert real verificado (DANA de Valencia, 29 oct 2024, 20:11) fue una frase corta sin enlace ni teléfono: no hay precedente ni prohibición, es terreno no pisado, y así hay que decirlo.
- **Capa 1, datos que el ayuntamiento y Protección Civil ya tienen.** Apps de bandos municipales, registro de personas vulnerables, teleasistencia (IMSERSO, Cruz Roja), fijos por dirección.
- **Capa 2, la red vecinal.** En cada llamada el agente pregunta por los vecinos (quién vive al lado, su teléfono, si están). Con 30 llamadas se sacan 100 números.
- **Capa 3, convenios de emergencia (B2G a medio plazo).** Contratos de suministro, celdas de las operadoras. La Ley del Sistema Nacional de Protección Civil obliga a colaborar y el RGPD cubre interés vital e interés público. Acuerdos que solo se activan al declararse la emergencia.

Para la hackathon: dataset sintético de 3 pueblos con unas 120 casas (dirección, coordenadas, teléfono, movilidad), declarado como sintético. Capas 0 y 2 se ven funcionar; 1 y 3 se cuentan en el pitch.

## 10. Qué es de HappyRobot y qué construimos nosotros

| HappyRobot | Nosotros |
|---|---|
| Workflows, agentes de voz (inbound y outbound), SMS y WhatsApp, AI Extract, Twin como espejo del estado, nodos Webhook, Transfer, Runs, Northstars | `api/` con el estado y **todo el cálculo** (prioridad, rutas, convoyes, patrullas, prioridad aérea), página del enlace GPS, motor de escenario, dashboard con el mapa, dataset sintético, guiones de los agentes, rutas con Valhalla |

Con un número español comprado (Telnyx, 0,80 USD) las llamadas y SMS salen de verdad. El trigger Web call permite que el jurado hable con el agente desde el navegador; el SDK oficial expone además `should_takeover` (tomar el control de una llamada en curso) y `.listen()` (escuchar en silencio), que es justo lo que pide el criterio "Control" de la rúbrica.

Dato útil para el marco B2G del pitch: HappyRobot cerró una Serie C de 150 M$ (~200 M$ totales, valoración 1.200 M$) con Orange, Deutsche Telekom y Bankinter entre los inversores estratégicos, y **no tiene ningún caso de uso previo en sector público ni en emergencias**. Nuestra propuesta les abre una vertical nueva, y eso se puede decir en voz alta.

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

## 13. Verificación para el pitch

La investigación de respaldo vive en `docs/research/`. Cada informe acaba con frases usables en el
pitch y con lo que quedó sin verificar; **nada marcado "NO VERIFICADO" se dice delante del jurado**.

| Tema | Estado | Dónde |
|---|---|---|
| Víctimas en incendios españoles al evacuar | ✅ verificado | `research/incendios-espana-datos.md` |
| ES-Alert: viabilidad de la Capa 0 | ⚠️ corregido, ver §9 | `research/es-alert.md` |
| Marco legal (RGPD, Protección Civil, AI Act) | ✅ verificado, obliga a §15 | `research/marco-legal.md` |
| Modelo de avance del fuego | ✅ verificado, simplificación asumida | `research/modelo-fuego.md` |
| Rutas con zonas a evitar (¿lo hace Google?) | ⚠️ **no, no lo hace** — corregido en §3 | `research/routing-zonas-evitar.md` |
| API de HappyRobot y preguntas para el stand | ⚠️ dos límites corregidos en §5 y §10 | `research/happyrobot-api.md` |
| Competencia y estado del arte | en curso | `research/estado-del-arte.md` |
| Geografía real de la zona | ✅ verificada, ya en el generador | `research/geografia-zona.md` |

**La zona, con nombres y coordenadas reales** (ya cargada en `data/generate.py`): Losacio (90 hab.,
donde se originó el incendio real de julio de 2022), Ferreruela de Tábara (409) y Sesnández de Tábara
(136), los tres a menos de 12 km entre sí. Zona segura primaria: Tábara, a 10-14 km. Y la pieza
dramática que hace creíble el escenario: la **ZA-P-2434** es la única vía provincial que da salida a
Sesnández y, por el mismo corredor, a Ferreruela. Cortarla los aísla de Tábara **aunque estén a menos
de 15 km**. Eso no lo hemos inventado para la demo: está así sobre el terreno.

Dos honestidades que hay que mantener al hablar: el giro de viento (225° → 315°) es una construcción
narrativa razonada sobre el patrón sinóptico de las olas de calor ibéricas, **no un dato medido** del
incendio de 2022; y los aforos de las zonas seguras son estimaciones por tipo de instalación. Además,
el apodo "Laponia española" **no** corresponde a esta zona sino a la Serranía Celtibérica — no usarlo.
Lo que sí se puede decir es que Aliste, con 5,85 hab./km², está más despoblada que esa región de
referencia (7,98).

**Precisión que hay que tener clara al hablar** (de `research/incendios-espana-datos.md`): "Sierra de
la Culebra 2022" son **dos incendios distintos**, y confundirlos es el error que un jurado de Zamora
detecta al vuelo. El de junio (Ferreras–Sarracín, 15–24 jun, ~29.670 ha) no tuvo muertos. El que
importa para nosotros es el de **Losacio** (17 jul – 14 ago, ~35.960 ha, **4 fallecidos**), y de esos
cuatro, dos murieron alcanzados por las llamas y dos semanas después por quemaduras **huyendo del
fuego**. Copernicus EMS tiene perímetros reales descargables de los dos: **EMSR580** (junio) y
**EMSR602** (Losacio) — es lo que hace viable el replay del backlog B3.

El caso que describe nuestro escenario con más exactitud es más reciente: Oliola/Torrefeta (Lleida,
1–2 jul 2025), **dos muertos al quedarse el coche atascado intentando escapar**. Eso es literalmente
lo que el simulador de B1 existe para evitar.

Queda por preguntar en el stand de HappyRobot: créditos disponibles en la cuenta, base URL de la API
de la región EU, y si nos dan número español para llamadas salientes.

## 14. Backlog (decidido, no en el alcance base de 36 h)

Todo esto se construye encima del mapa de personas y del fuego. Orden = prioridad.

| # | Feature | Qué es | Por qué gana |
|---|---|---|---|
| B1 | **Simulador de evacuación** | Antes de dar la primera orden, el backend simula la evacuación completa: 300 agentes sobre la red de carreteras real (OSM), capacidad por tramo (un camino rural traga 6 coches/min, no 60), fuego avanzando según el viento. Prueba cientos de variantes (quién sale primero, por qué salida, escalonado o no, contraflujo sí o no) y elige la que menos gente pierde. Muestra el número: "plan ingenuo: 31 interceptados en la cola de la N-631; plan elegido: 2". Al girar el viento, resimula en segundos delante del jurado. | Adaptación y prioridad convertidas en algo que se ve moverse y en una cifra que nadie más tendrá. Es Paradise 2018 (gente muerta en el coche en la cola de la única salida) evitado. |
| B2 | **Hora de caducidad de cada decisión** | Cada decisión pendiente tiene un punto de no retorno calculado por el simulador: abrir la N-631 en contraflujo vale hasta las 17:52 (después la cola ya está formada); evacuar sector 3 vale hasta las 18:05 (después es refugio, no evacuación). Se muestra como cuenta atrás al lado del botón Aprobar. | "Cuándo tirar el plan" con reloj. El humano decide, pero sabe cuánto tiempo tiene. Criterio Control convertido en tensión visible. |
| B3 | **Replay del incendio real (Sierra de la Culebra 2022)** | Cargar la línea de tiempo real (perímetros por horas de Copernicus EMS, lugar y hora de los cuatro fallecidos) y ver qué habría ordenado el sistema a las 17:10 cuando giró el viento. "El sistema habría sacado a Losacio 40 minutos antes." | Credibilidad que ninguna demo sintética da. Diapositiva de cierre del pitch. Bonus de aprendizaje en su versión seria. **Verificar datos antes del pitch.** |
| B4 | **El simulador aprende su propio error** | Tras cada incidente (o cada ensayo en la demo) compara predicción con realidad y recalibra parámetros: tiempo de salida de casa tras la orden (predijo 8 min, fueron 14), velocidad en camino rural, tasa de gente que no se mueve. En la segunda pasada de la demo los números cambian y se explica por qué. | Bonus de aprendizaje aplicado al modelo, no a los guiones. Es lo que hace que un VC se lo crea como producto. |

Dependencias: B2, B3 y B4 necesitan B1. B1 es un fin de semana de JS (grafo OSM + polígono que crece); B2 y B4 son lecturas distintas de la misma simulación; B3 depende de encontrar los datos.

## 15. Qué existe ya, y el hueco que ocupamos

El jurado va a preguntar "¿esto no lo hace ya alguien?". Sí y no, y la respuesta exacta es lo que nos
diferencia. Investigación con fuentes primarias en `docs/research/estado-del-arte.md`.

**El competidor de verdad es Genasys Protect (antes Zonehaven)**, desplegado en decenas de condados de
California. No es una startup: es producto en producción en emergencias reales. Y opera **por zonas**.
Su vocabulario lo delata — "know your zone", "check your zone number", "zone status" — y una portavoz lo
dijo literalmente a CBS News: *"If you're in the polygon, you're going to get an alert."* El sistema sabe
en qué polígono está el fuego y a qué polígono pertenece cada casa. No sabe dónde está cada persona.

Ese techo no es teoría, hay prueba de campo involuntaria: **enero de 2025, incendio Kenneth, Los
Ángeles. Una alerta de evacuación errónea llegó a unos 10 millones de personas** porque faltaba subir un
polígono al sistema, y sin polígono la única opción era el condado entero. Hay informe del Congreso de
EEUU sobre el episodio. Lo importante para nosotros es que **ese fallo solo puede ocurrir en un sistema
que razona por geocercas**: si supieras dónde está cada persona, la ausencia de un polígono no puede
hacer que avises a diez millones de golpe.

El resto del mercado, verificado uno a uno:

| | Zonas/polígonos | Posición individual | Ruta individual que se recalcula | Llamada saliente conversacional | Simulación conectada a la ejecución |
|---|---|---|---|---|---|
| Genasys / Zonehaven | ✅ | ❌ | ❌ (planes pre-dibujados) | ❌ (su "voice" son altavoces LRAD, unidireccionales) | ❌ |
| Everbridge, F24, OnSolve, Rave | ✅ | ❌ | ❌ | ❌ | ❌ |
| ES-Alert (España) | ✅ | ❌ (cell broadcast, sin canal de vuelta por diseño) | ❌ | ❌ | ❌ |
| Carbyne, Prepared911, RapidSOS | — | (del llamante) | ❌ | ❌ **solo llamada entrante**: ayudan al operador humano | ❌ |
| MATSim, SUMO, FLEE | — | (agentes simulados) | ❌ | ❌ | ❌ herramientas offline, desconectadas de cualquier sistema de aviso |
| **Nosotros** | ✅ | ✅ | ✅ | ✅ | ✅ (backlog B1) |

La frase para el pitch: **el mercado sabe en qué zona está el fuego y a qué zona pertenece cada casa;
nosotros sabemos dónde está cada persona en ese momento, y por eso podemos guiarla a ella y no a su zona.**

Y el contrapunto honesto, que decimos nosotros antes de que nos lo saquen: no sustituimos a Genasys ni
pretendemos. Ellos tienen despliegue real en decenas de condados y nosotros 36 horas. Lo que hacemos es
la capa que a su modelo le falta por construcción, y la evidencia de que falta es su propio incidente de
Los Ángeles.

## 16. Marco legal (verificado — y lo que no)

Un sistema que llama a vecinos por su nombre, les pide el GPS y le pasa a la Guardia Civil una lista de
casas va a recibir la pregunta "¿esto es legal?". La respuesta corta es que sí, y que ya hay un
precedente europeo que va más lejos que nosotros. Investigación completa con citas y fuentes en
`docs/research/marco-legal.md`. **Nada de lo marcado aquí como no verificado se dice delante del jurado.**

### 15.1 La respuesta de 30 segundos

> El 112 español ya recibe tu posición GPS sin pedirte permiso. Se llama **AML** (Advanced Mobile
> Location), es obligatorio en todos los smartphones vendidos en el mercado único de la UE desde marzo
> de 2022, está desplegado en España, y si tienes la ubicación desactivada **la activa él solo**, manda
> los datos y la vuelve a dejar como estaba. No es una app y no requiere ninguna acción de quien llama.
> Nosotros sí pedimos permiso antes de mandar el enlace. Somos más protectores que el estándar que ya
> está en tu bolsillo.

Esa comparación es el argumento más fuerte del pitch porque no es doctrina, es una obligación vigente
del mercado único. Ojo con el matiz si alguien del jurado es jurista: son dos flujos distintos (llamante
→ 112 frente a Protección Civil → vecino), así que es una analogía funcional muy buena, no una prueba
de legalidad por sí sola.

### 15.2 Las bases jurídicas (RGPD, todas verificadas con texto literal)

| Base | Texto | A qué parte del sistema ampara |
|---|---|---|
| **Art. 6.1.e** — interés público | "necesario para el cumplimiento de una misión realizada en interés público o en el ejercicio de poderes públicos" | El tratamiento base de un sistema de Protección Civil. Es la base natural del B2G. |
| **Art. 6.1.d** — interés vital | "necesario para proteger intereses vitales del interesado o de otra persona física" | Sobre todo **quien no contesta**: si no hay nadie al teléfono no hay consentimiento posible, y es justo a esa persona a la que hay que encontrar. |
| **Art. 6.1.a** — consentimiento | (art. 7.1: el responsable "deberá ser capaz de demostrar que aquel consintió") | El GPS de quien sí contesta. El RGPD no exige firma ni formulario: exige poder **probarlo**, y la llamada grabada con un "sí, comparto mi ubicación" explícito es ese medio de prueba. |
| **Art. 9.2.c** — interés vital, datos de salud | "en el supuesto de que el interesado no esté capacitado, física o jurídicamente, para dar su consentimiento" | El campo `mobility` cuando vale `reduced`/`immobile`. |
| **Considerando 46** | menciona expresamente las "catástrofes naturales o de origen humano" y dice que ese tratamiento puede responder **a la vez** a interés público y a interés vital | La pieza más citable: describe nuestro supuesto de hecho casi literalmente. |

Dos consecuencias de diseño, no adornos legales:

1. **`mobility: immobile` es probablemente dato de salud.** "Encamada, no sale sin ambulancia" revela
   información sobre el estado de salud en el sentido literal del art. 4.15, así que ese campo va al
   régimen reforzado del art. 9, no al ordinario. En el producto eso significa acceso restringido y base
   jurídica propia documentada para ese campo, separada de la que ampara `lat/lon` o `phone`.
2. **Pasar la lista de casas sin contestar a la Guardia Civil no es cooperación policial penal.** La LO
   7/2021 se excluye a sí misma: su art. 2.3.a) deja fuera los tratamientos "para fines distintos de los
   previstos en el artículo 1" (prevención y enjuiciamiento de infracciones penales), que vuelven al
   RGPD ordinario. Evacuar a alguien no es investigarlo, así que la cesión se ampara en la misma base de
   interés público e interés vital que el tratamiento original, con la misma finalidad. No hace falta el
   régimen estricto de la directiva penal.

### 15.3 AI Act: el agente se identifica como IA, y eso ya es obligatorio hoy

El art. 50.1 del Reglamento (UE) 2024/1689 obliga a que quien interactúa con un sistema de IA lo sepa,
y el art. 50.5 exige que la información se dé "a más tardar en el momento de la primera interacción".
Por el art. 113 el Reglamento se aplica con carácter general **desde el 2 de agosto de 2026**, y el art.
50 no está entre las excepciones con fecha distinta: **a fecha de esta hackathon ya está en aplicación**.
No es una obligación futura que prometemos cumplir, es una que cumplimos. Por eso la regla 6 del
contrato de datos es vinculante y todos los guiones de `prompts/` abren identificándose.

Y lo decimos nosotros primero, antes de que lo pregunte el jurado: el **Anexo III.5.d** clasifica como
alto riesgo los sistemas destinados a evaluar y clasificar llamadas de emergencia o a **priorizar el
despacho de servicios de primera intervención**. Nuestros módulos de prioridad de patrullas y de medios
aéreos apuntan directamente ahí. Si se confirma, conlleva obligaciones bastante más pesadas que el art.
50 (gestión de riesgos, documentación técnica, supervisión humana), y **son exigibles desde el 2 de
diciembre de 2027**, no hoy. O sea: hay margen para hacerlo bien, y el diseño ya empuja en esa dirección
(supervisión humana en el bucle, `decision_log` con motivo, aprobación humana para lo irreversible).

### 15.4 Lo que NO está verificado (no llevarlo al pitch)

- **El número exacto del artículo de la Ley 11/2022** que obliga a transmitir la localización del
  llamante al 112. Está en el Título III Capítulo III (arts. 56-63) según el preámbulo, pero no hemos
  leído el articulado. Se cita la obligación, nunca un número.
- **Si la Ley 17/2015 de Protección Civil basta como norma habilitante del art. 6.3 RGPD.** Es el hueco
  real del análisis: el texto que hemos leído no menciona "datos personales" con el detalle que el art.
  6.3 pide (tipos de datos, plazos). Pregunta para un jurista, no afirmación.
- **Ningún dictamen de la AEPD o del EDPB** sobre si la movilidad reducida declarada por un vecino es
  dato de salud, ni las Directrices 05/2020 del EDPB sobre consentimiento. Son interpretaciones por
  analogía con el art. 4.15, razonables y etiquetadas como tales.
- **El procedimiento formal de cesión** entre Protección Civil y Fuerzas y Cuerpos de Seguridad
  (¿convenio previo, protocolo del CECOPI, o decisión directa del director del plan?). Pregunta para
  Protección Civil.

Una nota de honestidad sobre el consentimiento: el "no" a compartir la ubicación tiene que ser un "no"
real, y no puede cortar el resto de la ayuda. Quien dice que no quiere dar el GPS sigue recibiendo la
ruta, el convoy y la llamada de la patrulla. Si negarse te deja fuera del sistema, no era consentimiento
libre — era un peaje.
