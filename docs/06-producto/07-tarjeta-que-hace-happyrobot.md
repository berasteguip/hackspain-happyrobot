# La tarjeta «qué hace HappyRobot detrás»

> **Actualizado:** 2026-09-20 · **Estado:** plantilla cerrada y dos materializaciones hechas (fichas «Campaña» y «Medio»)
> **Vinculante:** cualquier tarjeta o diagrama de HappyRobot que se construya después sale de esta
> plantilla. No se hacen tarjetas nuevas ni se inventan estilos de diagrama: ver §«Plantilla».
> **En una frase:** una tarjeta lateral del CECOP que enseña, ficha a ficha, qué workflow de
> HappyRobot se dispara, qué nodo habla con quién y por dónde vuelve el resultado; y que dice
> con todas las letras qué parte es real y qué parte es todavía interfaz.

## Para qué sirve (rúbrica)

- **Control** («se entiende y se puede intervenir»): el mando ve el circuito que hay debajo del
  mapa, no solo su efecto. Sin esto, un punto que cambia de color es magia; con esto es un webhook.
- **Ejecución fuera del sistema**: enseña que el color viene de una llamada de verdad, y marca
  como «previsto» lo que hoy solo dibuja la interfaz. La honestidad es parte del argumento, no
  un descargo.
- Es la pieza de demo que explica HappyRobot al jurado sin salir del CECOP.

## Dónde vive

`apps/command-center/src/HappyRobotCard.tsx` (componentes) y `src/hrModel.ts` (vocabulario:
workflow desplegado, tipos de nodo y estado, cobertura por ficha). Estilos en `src/index.css`,
bloque `.hr-*`.

- A la derecha del mapa, bajo la barra de herramientas. Con una ficha abierta se desplaza a la
  izquierda del panel (`.map-app.has-panel`), a 12 px; sin ficha ocupa el sitio del panel.
- Se enseña u oculta desde el botón **HappyRobot** de la barra de herramientas
  (`data-demo="tool-happyrobot"`); el cabecero la pliega a una sola fila. El estado se recuerda
  por navegador (`localStorage.router.hrCard`).
- Por debajo de 1100 px de ancho desaparece mientras haya una ficha abierta; por debajo de
  760 px no se enseña.

## Anatomía (común a todas las fichas)

| Zona | Qué lleva |
| --- | --- |
| Cabecero (58 px) | Marca HappyRobot (símbolo + palabra) · pill de estado · plegar · ocultar |
| Fila de contexto | «DETRÁS DE» + nombre de la ficha + (si hay campaña) chip con el número de llamadas + etiqueta de cobertura |
| Cuerpo | El diagrama de esa ficha, sobre el lienzo claro con retícula de puntos. Con scroll propio. Sin pie: el enlace al workflow y la leyenda se quitaron el 2026-09-20 a petición de Pablo. |

**Pill de estado.** Sale del estado del CECOP, no del diagrama: `Modo demo` (la API de crisis no
responde), `API conectada` (responde `/api/roster`), `Llamadas reales` (además «Llamar de verdad»
está encendido; late en ámbar). Es lo primero que se lee y es lo que separa demo de ejecución.

**Marca.** Es **marca ajena** y vive en un solo fichero, `src/HappyRobot.tsx`, con la geometría
del SVG que sirve happyrobot.ai: `HappyRobotLogo` (símbolo + nombre) en el cabecero de la tarjeta
y en la entradilla, y `HappyRobotSymbol` (solo el símbolo) en el botón de la barra donde no cabe
el logotipo entero. Una sola tinta heredada de `currentColor`, así que vale en claro y en oscuro.
Si el equipo consigue su archivo oficial se sustituye ese fichero y nada más cambia; **no se
redibuja la marca en ningún otro sitio**.

**La tarjeta va en claro.** Es la única superficie clara de un CECOP oscuro, y eso es
deliberado: lo que se ve dentro no es el centro de mando, es HappyRobot. El cuerpo reproduce el
lienzo del editor (fondo casi blanco con retícula de puntos) para que quien haya visto el
workflow reconozca de inmediato dónde está mirando. La paleta vive en tokens `--hr-*` declarados
en `.hr-card`; **ningún color del CECOP (`--panel`, `--text`, `--move`…) entra dentro de la
tarjeta**, porque están calculados para fondo oscuro y ahí no contrastan.

## Lenguaje visual de los diagramas

Estas reglas **no son sugerencias**: un diagrama que no las cumpla no entra. Son las que hacen
que cinco diagramas hechos en cinco momentos distintos parezcan el mismo producto.

**1 · Icono y una palabra.** Cada nodo es un icono en caja blanca y **una sola palabra**. El
detalle va en el `title` (tooltip) con el nombre real del nodo en el editor de HappyRobot, para
que alguien pueda ir a buscarlo allí. Nada de frases dentro del diagrama.

**2 · Los iconos salen de `HR_ICONS`.** Un tipo de nodo, un trazo. Si hace falta uno nuevo se
añade al mapa (24×24, `fill: none`, `stroke: currentColor`, grosor 1,6) y se reutiliza; no se
pega un SVG suelto en un componente.

**3 · Las aristas corren.** Toda arista es una tira de guiones en movimiento en el sentido del
circuito: hacia abajo en las verticales, hacia la derecha en los codos. Que se mueva es el
mensaje —aquí está pasando algo— y es lo que separa esto de un dibujo. Se pintan con
`.hr-edge-y` / `.hr-edge-x` o copiando su gradiente; la velocidad y el color salen de
`--hr-flow` y `--hr-flow-speed`, que un nodo `active` acelera y tiñe.

**4 · Lo que una acción dispara detrás se dibuja encadenado.** Si un nodo provoca otros nodos
(normalizar un número y llamar, escribir en el Twin y postear), van a su derecha como iconos
pequeños unidos por flechas (`HrChainLink`). Es la diferencia entre «el agente tiene una tool» y
«el agente hace que pase algo fuera», que es justo lo que hay que enseñar.

**5 · Lo más fuerte se tiñe, el resto es gris.** Como mucho un elemento destacado por diagrama,
en `--hr-move`. En la ficha «Campaña» son los dos teléfonos en los que una llamada genera otra
llamada. Si todo destaca, no destaca nada.

**6 · El estado viene del CECOP, no de adornos.** Los contadores y los estados (`active`,
`done`…) salen de `HrDiagramProps`. Un diagrama no inventa números ni simula actividad.

**7 · Nada se mueve para quien no quiere movimiento.** `prefers-reduced-motion` apaga todas las
animaciones de la tarjeta; el circuito se entiende igual quieto.

**Estructura.** Un diagrama es una lista ordenada: `HrFlow` + `HrNode` para un flujo lineal (el
nodo admite además una línea de detalle y el **carril** en el que corre: `HappyRobot`, `API
router`, `Mando` o `Vecino`), o el árbol `.hr-tree` cuando hay ramas colgando de un nodo, como
las tools del agente. Usar una lista, y no `div`s, es lo que hace que un lector de pantalla lo
lea en orden.

Estados de un nodo:

| Estado | Pinta | Significa |
| --- | --- | --- |
| `idle` | borde fino | existe, no está haciendo nada ahora |
| `active` | borde claro + punto que late | ejecutando en este momento |
| `done` | verde | terminó en esta pasada |
| `error` | ámbar | terminó mal o no llegó el resultado |
| `mock` | **discontinuo** + etiqueta «previsto» | **no existe conectado**: es lo que pasaría; hoy lo dibuja la interfaz |

Regla: «no conectado en esta sesión» (API caída) **no** se pinta como `mock`; lo dice el pill y
una nota. `mock` se reserva para lo que no está construido. Confundir las dos cosas vendería como
hecho lo que no lo es, o como inexistente lo que sí existe.

El discontinuo con ese significado es el **borde del nodo**. Las aristas son siempre de guiones
porque llevan flujo; lo que distingue a un `mock` es que su arista **no se mueve**: nada corre por
donde no hay nada construido.

## La anatomía de una llamada (ficha «Campaña»)

Calcada del lienzo del editor de HappyRobot (captura del 2026-09-20). Se enseñan N llamadas, pero
se dibuja **una**: cómo es y qué puede hacer el agente dentro de ella.

**Tronco** (la columna central del lienzo): Disparo (`Incoming hook`) → Cerrojo (`Python Sandbox`,
freno de mano del simulacro) → Agente (`Outbound Voice Agent` + su `Prompt`) → Observación
(`Extract`) → Vigía (`POST`).

**Las cinco tools** cuelgan del agente, en el orden del lienzo. Lo que el diagrama añade sobre un
listado es la **cadena**: a la derecha de cada tool van, en iconos pequeños unidos por flechas, los
nodos que dispara detrás. Usar una tool no es contestar; es hacer que pase algo fuera.

| Tool | Palabra | Cadena en el editor |
| --- | --- | --- |
| `enviar_enlace_ubicacion` | Ubicación | Send direct message |
| `llamar_a_organismo_oficial` | Organismo | Python Sandbox (número fijo del mando) → **Outbound Voice Agent** con su propio Prompt |
| `llamar_a_persona` | Persona | Python Sandbox (normalizar número) → **Outbound Voice Agent** con su propio Prompt |
| `consultar_log` | Consultar | Query Twin with SQL |
| `anotar_log` | Anotar | Write to Twin (`call_log`) → POST «Anotación → Vigía» |

Los dos teléfonos del final de `Organismo` y `Persona` van **teñidos de azul**: son el único sitio
del circuito donde una llamada genera otra llamada, y es lo que hay que mirar en la demo.
`consultar_log` y `anotar_log` son el par de memoria: lo que una llamada aprende queda en el Twin
y la siguiente lo lee. Cada icono lleva en su `title` el nombre real del nodo, para poder buscarlo
en el editor.

**Con llamadas en marcha** los contadores se reparten por el tronco: Disparo enseña cuántas se han
lanzado, Agente cuántas están sonando (late, en azul) y Vigía cuántas han vuelto ya con
observación. En reposo el mismo diagrama sirve de anatomía sin números.

## El despacho de un medio (ficha «Medio»)

Se enseña al pulsar un vehículo, en el mapa o en la lista del plan operativo: una ambulancia o una
patrulla. Con el mismo formato que la llamada (tronco + tools colgando del agente de voz), dibuja
**el flujo que seguiría el agente que gestiona los medios** y lo ilumina con lo que el CECOP sabe de
verdad de ese vehículo. Datos en `HR_UNIT_TRUNK` y `HR_UNIT_TOOLS` (`hrModel.ts`); componente
`UnitDiagram`.

**Tronco:** Disparo → Elegir → Ruta → Aprobar → Conductor → Vigilar → Parte.

| Nodo | Qué es | Hoy |
| --- | --- | --- |
| Disparo | El mando pide un medio desde una ficha, una alerta o una zona; en el flujo completo, el webhook `house_escalated_to_patrol` de la API | real (CECOP) |
| Elegir | El medio libre más cercano al destino. Previsto: ETA del medio frente a minutos hasta el frente (`priority_rank`), para no mandar a nadie adonde el fuego llega antes | real (CECOP, en línea recta) |
| Ruta | Mapbox Directions desde la posición actual hasta el acceso, con su ETA. Sin carretera, `hold` y reintento del mando | real (Mapbox) |
| Aprobar | Approval Process: el mando aprueba antes de mandar un medio a un sector amenazado (`POST /human/approve`). Hoy el clic de «Enviar» hace de aprobación | previsto |
| Conductor | Outbound Voice Agent «Aviso al medio»: llama al conductor con la dirección exacta, las personas esperadas, los vulnerables y los minutos hasta el frente | previsto |
| Vigilar | Loop: compara la ETA con el frente mientras el medio va de camino. Cadena: ruta nueva → **llamada** «Ruta nueva» (`route_recalculated`) | previsto |
| Parte | Extract al colgar (en el acceso, casa vaciada, personas recogidas, medio libre). Cadena: POST «Parte → Vigía» → mensaje al puesto de mando | previsto |

**Las cuatro tools** cuelgan de Conductor, cada una con lo que dispara detrás:

| Tool | Palabra | Cadena |
| --- | --- | --- |
| `enviar_enlace_ruta` | Enlace | Send direct message «Destino y ruta» |
| `quien_espera` | Censo | GET `/houses/no-answer`: censo, vulnerables y casas cercanas sin respuesta para un solo viaje |
| `cerrar_destino` | Resultado | Write to Twin (`unit_log`) → POST «Resultado → Vigía» (la casa sale de la lista de la patrulla) |
| `no_disponible` | Relevo | POST «Medio no disponible → Vigía» → Incoming hook con el siguiente medio |

**Lo teñido** es el teléfono al final de la cadena de Vigilar: la única llamada que nace sola del
bucle, cuando el fuego entra en la carretera y el plan de hace veinte minutos ya no vale. Es el
criterio «Adaptación al cambio» dibujado; Relevo es «Cuándo tirar el plan» dicho por el propio medio.

**Estados desde el CECOP** (`HrUnitPulse`, regla 6). En patrulla nada ha disparado y los tres nodos
reales están en reposo. Con destino, Disparo y Elegir están hechos y Ruta late mientras calcula o
avanza (con la ETA en minutos), acaba en verde al llegar al acceso y en ámbar si no hay carretera
(el motivo va al `title`). Una redirección sube `revision` y Elegir lo cuenta en su `title`. La
fila de contexto pasa a enseñar distintivo y cuerpo del vehículo («A-01 · Ambulancia»), con su
estado real en el `title` y, como en la campaña, un chip con el único número que importa ahora: los
minutos que quedan por carretera.

**Honestidad, nodo a nodo.** La cobertura de la ficha es «Previsto» porque nada del despacho pasa
hoy por HappyRobot; los tres primeros nodos se iluminan igual porque los ejecuta el CECOP (y Mapbox)
de verdad. De Aprobar hacia abajo todo va discontinuo, y las aristas que entran y salen de lo
previsto están quietas (`data-edge="still"` en el nodo anterior): nada corre por donde no hay nada
construido. `built` en `HR_UNIT_TRUNK` es esa frontera; cuando el workflow exista, se cambia ahí y
el diagrama se enciende solo.

## Plantilla: cómo se añade un diagrama nuevo

Esto es lo que hay que leer antes de construir la siguiente tarjeta de HappyRobot, venga de la
sesión que venga.

**Hay una sola tarjeta.** `HappyRobotCard` es *la* superficie de HappyRobot en el producto: un
cabecero, una fila de contexto y un cuerpo. Lo único que cambia de un caso a otro es **el
diagrama del cuerpo** y **qué lo dispara**. No se crea una tarjeta nueva, ni un cabecero
alternativo, ni una variante oscura: si hace falta enseñar otra cosa, es un diagrama más dentro
de la misma tarjeta. Una segunda tarjeta rompería la promesa de que lo blanco es HappyRobot.

Pasos, todos en `apps/command-center/src`:

1. **Declara el caso** en `HrView` (`hrModel.ts`) y añade su entrada a `HR_VIEWS` con
   `title`, `summary` y `coverage` (`real` / `partial` / `planned` / `none`). La cobertura es un
   compromiso: se marca lo que de verdad ejecuta hoy, no lo que va a ejecutar.
2. **Modela el flujo como datos**, no como JSX: una constante con los nodos (`id`, `kind`,
   `word`, `hint` y, si dispara algo detrás, `chain`). Así el diagrama se puede leer, testear y
   comparar con el editor sin abrir el componente.
3. **Si necesitas un icono nuevo**, añádelo a `HR_ICONS` con su `HrNodeKind`. Compruébalo a
   13 px: a ese tamaño muchos trazos se confunden entre sí (el de chevrones `<>` del sandbox hubo
   que cambiarlo por una ventana de terminal porque parecía una flecha más de la cadena).
4. **Escribe el componente** en `HappyRobotCard.tsx` reutilizando las primitivas que ya hay
   (`HrFlow`/`HrNode`, `.hr-tree` + `CompactNode`, `HrIcon`). Recibe `HrDiagramProps`; si te hace
   falta más estado del mando, se amplía ese tipo, no se pasan props sueltas.
5. **Regístralo en `HR_DIAGRAMS`**, el mapa no exportado que asocia caso → diagrama. Es el único
   sitio donde se da de alta un diagrama; una ficha sin entrada enseña su `summary` y «Diagrama en
   preparación», que es un estado válido y honesto.
6. **Estilos, solo con tokens `--hr-*`** y las clases `.hr-*` existentes. Si añades clases, van al
   mismo bloque de `index.css` y usan los tokens; ningún color literal del CECOP.
7. **Cumple las siete reglas** de §«Lenguaje visual de los diagramas» y actualiza la tabla de
   cobertura de abajo y la tabla de `data-demo` del [README del command center](../../apps/command-center/README.md).

**Disparadores.** Hoy el diagrama se elige por la ficha abierta (`hrView` en `CommandCenter.tsx`),
con dos excepciones: con llamadas en marcha y ninguna ficha abierta manda la campaña, y con el plan
operativo abierto y un vehículo pulsado manda su despacho (ficha «Medio»). Cuando aparezcan
otros disparadores (una alerta, un cambio de viento, un webhook de vuelta), **la regla es la misma:
el disparador decide qué diagrama se enseña, nunca cómo se pinta**. Un disparador nuevo se resuelve
en `hrView` y punto; la tarjeta no se entera.

## Cobertura por ficha (estado a 2026-09-20)

| Ficha | Cobertura | Qué pasa por HappyRobot | Diagrama |
| --- | --- | --- | --- |
| Ninguna (vista por defecto) | Real | El bucle del sistema como anillo con cinco paradas, un icono y una palabra por parada (Mapa, Zona, Llamada, Vecino, Triaje). Nada más, a propósito. | hecho (estático; admite parada activa) |
| Campaña de llamadas | Parcial | El círculo va a `/calls/dispatch` y la API dispara un run por persona; con «Llamar de verdad» apagado es simulación local | hecho: **la anatomía de una llamada**, calcada del lienzo del editor. Ver §«La anatomía de una llamada». |
| Personas | Parcial | El color es el extract que el agente postea al colgar | pendiente |
| Ficha de persona | Parcial | Triaje, motivo y hora salen del extract; las rutas son de Mapbox | pendiente |
| Avisos y medios | Previsto | Aviso a la patrulla por webhook `house_escalated_to_patrol`; hoy los medios son simulados | pendiente |
| Medio (vehículo pulsado) | Previsto | Nada todavía: el CECOP elige el medio y Mapbox traza la carretera; la llamada al conductor, la vigilancia de la ETA y el parte serían HappyRobot | hecho: **el despacho de un medio**. Ver §«El despacho de un medio». |
| Centros y coordinación | Previsto | Preaviso a hospital o bomberos por voz o SMS; hoy es un borrador local | pendiente |
| Propagación y viento | Previsto | Giro de viento → reasignación → rellamadas `route_recalculated`; hoy no conecta | pendiente |
| Escenarios · Capas | Sin HappyRobot | Nada; la tarjeta enseña el circuito completo | — |

Los diagramas pendientes se registran en `HR_DIAGRAMS` dentro de `HappyRobotCard.tsx`, uno por
ficha, recibiendo `HrDiagramProps` (que se amplía con lo que cada diagrama necesite del estado del
mando: llamadas abiertas, triajes recibidos, medios enviados…).

## Fuentes

- Petición del equipo del 2026-09-20 (tarjeta lateral con cabecero común y un diagrama por ficha).
- Workflow desplegado y su camino de vuelta: [`06-workflow-happyrobot-vs-contrato.md`](06-workflow-happyrobot-vs-contrato.md) §1 y §5 (leído vía MCP el 2026-09-19).
- Qué construye el equipo del agente: [`04-brief-equipo-agente.md`](04-brief-equipo-agente.md) §§5–6 (patrulla, rellamadas).
- Convenciones de la interfaz mínima: `AGENTS.md` §8.
