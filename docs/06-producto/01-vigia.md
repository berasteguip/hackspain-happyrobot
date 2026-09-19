# Vigía — prevención de incendios con agentes de voz HappyRobot

> **Actualizado:** 2026-09-19 · **Estado:** borrador (tesis inicial, 18-19 sep)
> **En una frase:** agentes de HappyRobot llaman a la población en zonas de riesgo
> de incendio, indican zonas seguras y, con consentimiento, el CECOP sigue su
> movimiento en un mapa junto a los focos.
>
> **Nota de organización (19 sep, mediodía):** este doc es la tesis de partida y sigue
> valiendo para el problema, la frontera con el 112 y el visor cartográfico. El alcance
> vigente del producto (300 vecinos simulados con personalidad, rutas reales por persona,
> refugios con capacidad, convoyes, lista de casas sin respuesta) está en
> [`02-escenario-incendio.md`](02-escenario-incendio.md). Donde los dos discrepen, manda el 02.
> Diferencias conocidas: dataset (aquí Ávila; en el 02 Zamora) y mapa (aquí Mapbox; en
> `web/dashboard` MapLibre). Ambas están abiertas en [`../07-decisiones/`](../07-decisiones/README.md).

## Problema

Cuando hay un incendio forestal, el aviso a la población llega tarde, es genérico
(ES-Alert / megafonía) y el mando no sabe quién ha entendido el mensaje, quién se
mueve y quién se ha quedado atrás. El 112 se satura *después*. El hueco está en
el **saliente preventivo**, no en el triaje de llamadas de emergencia.

## Qué construimos

**Vigía**: un centro de mando (CECOP) y un workflow de llamadas salientes.

1. Se declara un perímetro de riesgo y unas zonas seguras.
2. Agentes de voz HappyRobot llaman a los teléfonos de esa zona, explican el
   riesgo y la zona segura más cercana, y piden consentimiento para compartir
   ubicación mientras dura la evacuación.
3. El mando ve en un mapa Mapbox: focos (escenario + NASA FIRMS), zonas seguras
   y personas en tránsito en tiempo real.

## Qué no hace (a propósito)

- No tria ni prioriza llamadas del 112. Eso es Anexo III 5(d) del AI Act.
- No despacha medios de extinción.
- No rastrea a nadie sin consentimiento explícito tras la llamada.

## Frontend inicial

Código en `apps/command-center`. Vite + React + Mapbox GL. El protocolo de
llamadas y el movimiento de personas van simulados; la página `/track` ya puede
pintar un consentimiento real contra `/api/locations`.

## Visor cartográfico — revisión 2026-09-19

La interfaz actual prioriza el mapa a pantalla completa. Personas y capas se abren
bajo demanda; seleccionar un punto muestra su fuente de ubicación, antigüedad,
precisión disponible, resumen de llamada y familiares cuando existen datos.

El dataset contiene 300 personas ficticias: 156 referencias en Arenas de San Pedro,
48 en Guisando, 36 en El Hornillo, 48 en El Arenal y 12 ubicaciones compartidas de
demostración fuera de los núcleos. Los centroides de los pueblos se apoyan en las
fuentes geográficas indicadas abajo; la distribución alrededor de ellos es sintética,
no un censo ni una geocodificación de viviendas. Las cantidades no representan
población real ni ocupación.

**Obsoleto según revisión del código del 2026-09-19:** ~~la campaña ya no
mueve automáticamente a las personas en línea recta ni les asigna un destino.~~
El código actual vuelve a simular desplazamientos y asignar puntos de encuentro;
ver la revisión técnica abajo. Responder una llamada no demuestra una evacuación real.

La superficie, el frente y la propagación son geometrías ilustrativas del escenario.
NASA FIRMS es una fuente opcional de detecciones térmicas, no un perímetro actual ni
un pronóstico. Las posiciones de `/track` conservan el origen GPS/simulación y la
precisión cuando la aporta el dispositivo; las antiguas posiciones sin origen se
muestran como desconocidas. El endpoint de desarrollo no autentica identidades y
no debe exponerse como servicio de seguimiento de producción.

**Revisión visual del fuego (2026-09-19):** el polígono de superficie y su contorno
anteriores ya no se dibujan. La representación activa es una huella roja de celdas
sintéticas de ~~100 m~~ **25 m** (refinadas el 2026-09-19), con manchas separadas y huecos interiores, inspirada en la
captura aportada por el equipo. El tamaño de celda es una decisión visual de la
demo, no la resolución de un instrumento NASA. La propagación y los puntos térmicos
quedan ocultos inicialmente; pueden activarse desde Capas. La fuente externa FIRMS
continúa separada y no se utiliza para inventar superficies quemadas.

El último ajuste visual del 2026-09-19 sustituye las agrupaciones elípticas por una
masa principal alargada y ramificada con huecos de tamaños variables y fragmentos
periféricos. El rojo es opaco y la base satélite se muestra menos oscura. Esta
morfología es una composición gráfica inspirada en la referencia, no un cálculo
basado en terreno, meteorología ni detecciones reales.

Verificación local desde `apps/command-center`: `npm run build`, `npm run lint`.

## Revisión técnica del frontend — 2026-09-19

- Stack: React 19, TypeScript 6, Vite 8 y Mapbox GL JS 3; estilos CSS propios.
  `App.tsx` selecciona el CECOP o `/track` mediante `window.location.pathname`,
  sin router externo. El token público de Mapbox procede de `VITE_MAPBOX_TOKEN`
  o de `localStorage`; `/track` no necesita ese token.
- `CommandCenter.tsx` mantiene el estado en hooks de React y conecta mapa,
  paneles de personas/capas, simulación y polling de `/api/locations` cada 1,5 s.
  No hay integración de llamadas reales con HappyRobot en esta app.
- `routing.ts` obtiene corredores de Mapbox Directions con cuatro peticiones
  concurrentes y elige el punto de encuentro por la menor longitud de corredor
  disponible para cada grupo. No verifica la seguridad de la ruta ante el fuego.
  `simulation.ts` pasa de `tracking` a `evacuating`, simula acceso a pie y avance
  por carretera con reloj acelerado ×12; sin corredor utiliza un rumbo directo.
  Las personas con sesión `live` quedan excluidas de esa simulación.
- `/track` ofrece GPS del navegador o movimiento ficticio, ambos tras consentimiento.
  Detener el envío conserva la última posición en el visor. La API de Vite guarda
  únicamente el último ping por ID en memoria, sin persistencia ni autenticación.
  Tanto esa API como el proxy de FIRMS están configurados para desarrollo, no
  incluidos como backend en el build estático.
- `firms.ts` lee un CSV de Europa de las últimas 24 h, filtra por un rectángulo
  geográfico y limita la capa a 250 detecciones; ese filtro no equivale a una
  frontera administrativa de España.
- Verificación local del 2026-09-19: `npm run build` y `npm run lint` pasan.
  Vite avisa de un chunk JavaScript de unos 2,11 MB minificado (595 kB gzip).
  `package.json` no define un script de tests. Esta revisión no valida visualmente
  el mapa en navegador ni la disponibilidad de los servicios externos.

Fuentes de esta revisión: código local enlazado a continuación y ejecución de los
scripts declarados en `package.json` el 2026-09-19.

## Puntos de encuentro reales — integración selectiva 2026-09-19

Se incorporan de `origin/devin/vigia-grupos-puntos-encuentro` (commit `a584037`)
las tres ubicaciones y sus metadatos, conservando la simulación y la geometría del
fuego de `main`. Los antiguos puntos de El Arenal y La Parra quedan sustituidos;
el de Arenas pasa a las coordenadas del polideportivo Jesús Navarro.

| Punto candidato | Latitud, longitud importadas | Aforo ficticio de demo |
| --- | --- | --- |
| PE-01 La Dehesa · Guisando | 40.220682, -5.140945 | 100 |
| PE-02 El Risquillo · Guisando | 40.221327, -5.144282 | 90 |
| PE-03 Jesús Navarro · Arenas | 40.2126907, -5.0930363 | 650 |

Las páginas municipales consultadas el 2026-09-19 confirman los aparcamientos de
La Dehesa y El Risquillo y el polideportivo de C/ Obispo, 1. Las coordenadas se
conservan de la branch de origen, que documenta su extracción de mapas municipales.
**Son lugares reales, no refugios oficiales validados.** Servicios, aforos y radios
son parámetros de demo; no se confirma disponibilidad, accesibilidad ni seguridad.

El mapa incorpora el icono de cobijo de esa branch, códigos PE-01–03 y nombres de
recinto. Al pulsarlos se abre un popup con descripción, aforo ficticio, servicios
de demo y fuente municipal. `/track` y el panel de capas distinguen ubicación real
de uso simulado. Los destinos iniciales y corredores existentes se recalculan desde
`SAFE_ZONES`, sin mantener referencias a los puntos retirados.

No se incorpora el motor de grupos, las reservas de plazas, los nuevos estados ni
los cambios de rutas/fuego de la otra branch. La simulación actual **no aplica los
aforos como límites de asignación** y sigue sin verificar la seguridad de las rutas.

Verificación del 2026-09-19: build y lint correctos; comprobación local con el module
runner de Vite de coordenadas/metadatos, 300 personas, 48 corredores dirigidos a los
nuevos puntos, llegadas dentro del radio de demo y exclusión de sesiones GPS del
movimiento simulado. No se ha validado visualmente el mapa en navegador.

## Investigación para ampliar el COP — 2026-09-19

- La propagación actual es una geometría fija (`SPREAD_AREA`), no una simulación
  temporal. La documentación técnica de FARSITE describe modelos con combustible,
  meteorología y topografía; una animación dirigida por viento no equivale a un
  pronóstico validado. La huella inicial de esta demo también es sintética.
- El routing actual compara longitudes y no conserva la duración del proveedor.
  Mapbox Directions devuelve `duration` en segundos y permite solicitar alternativas;
  es necesario conservar ese campo para comparar tiempos entre rutas consultadas.
  La menor duración no demuestra seguridad ante un incendio.
- SACYL confirma el Centro de Salud de Arenas de San Pedro en C/ Pintor Martínez
  Vázquez, 21, y el Hospital Nuestra Señora de Sonsoles en Ávila. Son tipos de centro
  distintos; no debe presentarse el centro de salud como hospital ni suponerse
  disponibilidad de camas, urgencias o recursos a partir de su presencia en un mapa.
- La operatividad actual del parque comarcal de bomberos de Ramacastañas queda
  **[SIN VERIFICAR]**. La información periodística localizada sobre su puesta en
  marcha en 2026 no basta para marcarlo como recurso disponible.
- La petición del equipo del 2026-09-19 amplía el interés hacia avisos a centros
  sanitarios y coordinación con bomberos. La frontera anterior «no despacha medios
  de extinción» sigue vigente hasta concretar el alcance: mostrar un centro,
  preparar un aviso y ordenar un despliegue son operaciones diferentes.

Fuentes consultadas para esta investigación: referencias siguientes y revisión de
`scenario.ts` y `routing.ts` el 2026-09-19. **Estado anterior, sustituido por la
implementación descrita abajo (2026-09-19):** ~~No hay nuevas capas COP implementadas
como resultado de esta investigación; las coordenadas de los centros están pendientes
de verificación antes de incorporarlas al mapa.~~

## COP configurable y coordinación de demo — 2026-09-19

**Interfaz y asignación de rutas parcialmente obsoletas (2026-09-19):** los sliders,
el horizonte manual y la asignación previa se sustituyen por la revisión «Viento
visible y evacuación coherente» de abajo. Se conserva esta descripción como historial.

El equipo elige **simulación configurable** y **avisos solo en interfaz** el
2026-09-19. No se integra meteorología real ni se envían comunicaciones externas.

- **Propagación:** `fire-model.ts` rasteriza conservadoramente los rectángulos de la
  huella sintética en celdas de 100 m y calcula tiempos de llegada por expansión a
  ocho vecinos hasta 120 minutos. La huella inicial de 25 m sigue visible; no se
  traslada ni se sustituye por observaciones FIRMS. La antigua `SPREAD_AREA` fija
  queda conservada en código, pero ya no es la capa dibujada.
- **Parámetros ficticios:** viento de 0–60 km/h, dirección **hacia** la que sopla
  (no la procedencia meteorológica), avance base de 0–20 m/min y horizonte
  0–120 min. El multiplicador direccional es `1 + viento/20 × max(0, cos(ángulo))`.
  Es una regla gráfica, no una relación física validada entre viento y fuego.
  No contempla combustible, humedad, pendiente, supresión ni saltos de fuego.
- **Exposición:** rojo para huella inicial/proximidad, ámbar si el margen se alcanza
  dentro del horizonte, azul si no hay afectación calculada y gris sin evaluación.
  El margen configurable de 50–500 m y los radios de los recintos son de demo,
  no distancias oficiales de seguridad. El análisis no se desactiva al ocultar capas.
- **Rutas:** en la ficha de una persona se solicita a Mapbox una comparación en
  vehículo o a pie hacia los tres puntos, con alternativas. Se ordena por duración
  del proveedor más accesos aproximados a pie a 4 km/h, limitados a 100 m en cada
  extremo. No se consulta tráfico en vivo. Se comprueban segmentos completos y
  destinos contra la huella expandida y su margen, hasta el mayor horizonte entre
  el seleccionado y la duración del viaje; recorridos superiores a 120 min quedan
  fuera de cobertura. No se inventan rutas cuando falla el proveedor.
- La comparación muestra fallos parciales y se invalida visualmente al cambiar el
  modo o desplazarse el origen más de 50 m. Las consultas se cancelan al reemplazarlas
  o cerrar la ficha y tienen un timeout de 12 s. Un recorrido no afectado por esta
  geometría no equivale a una ruta segura ni a una carretera abierta.
- El simulador previo de llamadas conserva su reloj independiente y sus destinos;
  los movimientos se frenan ante destinos/tramos expuestos o sin corredor. Las rutas
  seleccionadas en el COP son para revisión, no órdenes automáticas de evacuación.
- **Centros:** se incorporan el Centro de Salud de Arenas de San Pedro, el Hospital
  Nuestra Señora del Prado y el Parque de Bomberos de Talavera de la Reina. Son una
  selección documentada, no un inventario completo ni una asignación territorial.
  Sus coordenadas son centros aproximados de recintos de OpenStreetMap, no accesos
  de emergencia. SACYL/SESCAM corroboran los centros sanitarios; el parque se apoya
  en cartografía OSM. Dotaciones, camas, disponibilidad y competencia no verificadas.
  Ramacastañas no se posiciona a partir del centroide del pueblo.
- **Avisos:** borrador revisable → envío simulado → acuse simulado, siempre por
  acción explícita del operador. Incluyen una instantánea textual del escenario;
  permanecen solo en memoria (máximo 50). No incluyen destinos telefónicos ni de
  email, no afirman que haya heridos y no ejecutan dispatch. Las solicitudes a
  bomberos indican un sector a valorar, no una posición de mitigación validada.

Fuentes: implementación en [fire-model.ts](../../apps/command-center/src/fire-model.ts),
[routing.ts](../../apps/command-center/src/routing.ts),
[response.ts](../../apps/command-center/src/response.ts),
[CopPanels.tsx](../../apps/command-center/src/CopPanels.tsx) y los componentes de mapa
citados abajo (revisados 2026-09-19). Tests automatizados locales en
[cop.test.mjs](../../apps/command-center/cop.test.mjs), ejecutables mediante `npm test`;
no requieren tokens ni llamadas a proveedores. Build y lint: `npm run build`,
`npm run lint` desde `apps/command-center`.

Verificación final del 2026-09-19: **13 tests pasan**, build correcto y lint sin
avisos; continúa el aviso de tamaño del bundle de Mapbox. Prueba de interacción
con Chrome headless y Playwright 1.55.1, en viewports 1440×1000 y 390×844:
propagación, exposición de refugios, comparación y ausencia de rutas, avisos a
centros sanitarios/bomberos, conservación de la bandeja al cambiar de panel,
reinicio de scroll y foco con Escape. Las respuestas cartográficas y de Directions
se sustituyeron por mocks; no valida disponibilidad, tiempos ni recorridos reales
del proveedor. No se realizaron comunicaciones a centros.

## Viento visible y evacuación coherente — revisión 2026-09-19

**Parcialmente sustituido el 2026-09-19:** la revisión «Campañas por círculo» de
abajo cambia la selección de destinatarios, los colores de respuesta, el filtro de
alejamiento y las posiciones mostradas de hospital/bomberos. Se conserva el historial.

Petición del equipo del 2026-09-19: sustituir los controles manuales por una capa
visual de viento on/off y un botón «Simular incendio dentro de 1 hora», mostrar los
centros desde el arranque, usar azul para todas las personas y evitar trayectos
que las acerquen al fuego.

- La app abre con el incendio inicial, sin proyección. La capa de viento muestra
  trazos animados en la dirección del escenario, adaptados al bearing del mapa.
  On/off controla solo su visibilidad; ocultar la capa no elimina el viento del
  cálculo. Con `prefers-reduced-motion` se muestran flechas estáticas.
- El botón calcula/muestra la extensión a +60 min y permite volver al inicio.
  Se mantienen **parámetros ficticios prefijados**, no meteorología en vivo:
  viento hacia SO (225°), 20 km/h, avance base 5 m/min y margen de demo 150 m.
  La fórmula, discretización y límites del modelo anterior siguen aplicando.
- El encuadre inicial abarca el incendio, población, refugios y los centros de
  Arenas/Talavera, sin modificar coordenadas para acercarlos artificialmente.
  «Centrar incendio» recupera el detalle y «Ver todo» el encuadre general.
  Al simular +1 h se centra automáticamente el área del incendio para ver la
  proyección; «Ver todo» vuelve a incluir los centros distantes.
- Todas las personas usan el mismo azul opaco, tanto en mapa como en lista.
  Fuente, antigüedad y estado permanecen en las fichas y filtros; el color ya no
  codifica el contacto ni convierte una referencia residencial en un GPS.
- Causa comprobada del movimiento incoherente: el simulador asignaba destinos por
  distancia, descartaba alternativas antes de evaluar exposición y podía escoger
  corredores de otra localidad. Además, conservaba un fallback de movimiento
  directo sin carretera. Dos tests reprodujeron recomendaciones hacia el fuego
  y movimiento sin ruta antes de corregirlos.
- Ahora se consultan los tres refugios (72 corredores potenciales) y se conserva
  la duración del proveedor. Tanto comparación manual como asignación automática
  aplican el filtro de exposición durante **al menos la próxima hora**, aunque la
  proyección esté oculta, y rechazan destinos más cercanos a la huella inicial.
- El filtro de alejamiento usa la distancia al margen cuadrado de las celdas
  iniciales. Rechaza acercamientos del recorrido superiores a una celda (100 m),
  tolerancia de discretización de demo, no criterio operativo. La asignación
  requiere corredores de la localidad, acceso inicial de hasta 100 m y una ruta
  concreta por persona; las geometrías se comprueban completas antes de salir.
- La simulación sigue exclusivamente esa ruta. Sin alternativa admisible, sin
  proveedor o con un recorrido incoherente, conserva la posición y muestra
  **«Ruta pendiente de revisión»** con el motivo. No fuerza una evacuación para
  completar la animación ni inventa nuevos refugios. Las sesiones GPS quedan
  excluidas de la asignación y del movimiento ficticios.

Fuentes: solicitud del equipo y revisión local del 2026-09-19 de
[WindOverlay.tsx](../../apps/command-center/src/WindOverlay.tsx),
[CommandMap.tsx](../../apps/command-center/src/CommandMap.tsx),
[CommandCenter.tsx](../../apps/command-center/src/CommandCenter.tsx),
[routing.ts](../../apps/command-center/src/routing.ts),
[simulation.ts](../../apps/command-center/src/simulation.ts),
[fire-model.ts](../../apps/command-center/src/fire-model.ts) y
[cop.test.mjs](../../apps/command-center/cop.test.mjs).

Verificación de esta revisión, 2026-09-19: **18 tests pasan**, build correcto,
lint sin avisos y `git diff --check` limpio. En navegador con proveedores mockeados
se comprueban el encuadre inicial de todos los centros en desktop/móvil, azul
uniforme, animación on/off, reduced motion, proyección a +1 h/reset y ausencia de
sliders. Tras avanzar 75 segundos de llamadas en el navegador, los contactos de
El Arenal sin ruta admisible permanecen en su posición, sin desplazarse hacia el
fuego. No se han validado aquí carreteras ni meteorología reales.

## Campañas por círculo y centros reubicados — revisión 2026-09-19

**Actualización posterior del 2026-09-19:** la precarga de corredores y la exclusión
estática de toda la proyección futura se sustituyen por «Rutas individuales y tiempo
de paso», descrito abajo. El resto del flujo de campaña se conserva.

El equipo confirma **demo completa en interfaz** y **solo carreteras reales** el
2026-09-19. Esta revisión afecta al CECOP de Gredos; no conecta sus contactos con
HappyRobot ni unifica sus IDs con el backend de Zamora. `api/notify.py` y sus controles
de llamadas reales no se modifican.

- **Selección:** «Zona» permite dibujar un círculo arrastrando desde su centro con
  ratón o pantalla táctil. Se muestran el radio y las personas seleccionadas antes
  de lanzar ninguna llamada. Escape o «Borrar selección» cancela la selección;
  también existe una selección por botón del entorno del incendio (3 km).
  El gesto admite radios de 50 m a 20 km y usa distancia geodésica para incluir puntos.
- **Campaña:** solo se encolan contactos ficticios pendientes de la selección.
  La lista de IDs se conserva aunque los puntos se muevan o se borre el círculo.
  Nuevas selecciones pueden añadir contactos sin duplicar los ya encolados. Los
  pings de sesiones GPS no reciben llamadas ni desplazamientos simulados.
- Los 300 contactos parten sin llamar; se eliminan las 12 respuestas precargadas de
  la primera demo. Las llamadas avanzan en oleadas de cuatro, con pausa/reanudación
  y contadores de respuestas, movimiento, ausencia de respuesta y falta de ruta.
- **Respuesta y movimiento:** azul antes de responder, amarillo en llamada y verde
  al contestar; el verde confirma respuesta de demo, no llegada a salvo. El contorno
  de selección queda bajo el punto para no ocultar su estado. La ausencia de respuesta
  no produce movimiento. Respuesta con consentimiento y ruta disponible permite
  simular la salida; rechazo o falta de ruta quedan explicados en la ficha.
- **Refugios:** se precargan corredores de Mapbox, pero la asignación individual se
  hace tras responder y consentir. Entre alternativas admisibles de la localidad se
  escoge la menor distancia restante por carretera, incluyendo el acceso aproximado.
  La comparación manual sigue ofreciendo tiempos del proveedor.
- **Corrección del bloqueo excesivo:** se retira la exigencia de que todo el trayecto
  aumente su distancia al fuego. Un refugio puede estar geométricamente más cerca
  del fuego que el origen y seguir fuera de la zona expuesta. Se mantiene la exclusión
  de destinos, carreteras y accesos que intersecten la huella/proyección y su margen,
  evaluando al menos la próxima hora. No se inventan rutas si Mapbox falla. Por tanto,
  contestar no garantiza que toda persona tenga un recorrido admisible en esta demo.
- **Centros próximos:** hospital y bomberos se muestran en posiciones ficticias de
  Gredos, rotuladas **DEMO**, por petición explícita del equipo. Hospital:
  40.215, -5.075; bomberos: 40.208, -5.148. Se conservan sus coordenadas originales
  de Talavera en `realLocation` y las fuentes originales, diferenciadas de la posición
  mostrada. El centro de salud de Arenas no se desplaza.

Datos de interfaz locales (no se incorporan al contrato HTTP de `api/`): `CallArea`
contiene `lng`, `lat`, `radiusM`; la campaña conserva IDs de contactos y tiempos de
llamada del simulador existente. `ResponseCenter.locationSource` distingue `osm`
de `demo`, y `realLocation` conserva la referencia real de los centros reubicados.

Fuentes: petición y respuestas del equipo del 2026-09-19; código local en
[CommandCenter.tsx](../../apps/command-center/src/CommandCenter.tsx),
[CommandMap.tsx](../../apps/command-center/src/CommandMap.tsx),
[simulation.ts](../../apps/command-center/src/simulation.ts),
[routing.ts](../../apps/command-center/src/routing.ts),
[scenario.ts](../../apps/command-center/src/scenario.ts),
[response.ts](../../apps/command-center/src/response.ts) y
[cop.test.mjs](../../apps/command-center/cop.test.mjs).

Verificación del 2026-09-19: **24 tests pasan**, build correcto y lint sin avisos.
Pruebas en Chrome headless con Mapbox/Directions mockeados: círculo por arrastre,
selección táctil en móvil, cancelación con Escape, destinatarios congelados,
pausa/reanudación, colores y referencias de los centros reubicados. En una selección
de 156 contactos de Arenas, tras 35 s simulados hubo 40 respuestas y 15 personas
que habían cambiado de posición; los no contactados y todos los ajenos a la selección
permanecieron inmóviles. Son resultados de un test con geometrías de proveedor
mockeadas, no una validación de itinerarios reales. No se enviaron llamadas externas.

## Rutas individuales y tiempo de paso — corrección 2026-09-19

Tras el aviso del equipo de que los contactos respondían pero no se movían, se
reprodujeron dos bloqueos en código:

1. Un corredor compartido podía rechazarse por un tramo anterior a la posición de
   la persona, aunque desde esa persona hasta el refugio quedara una ruta admisible.
   Además, quedar a más de 100 m de los corredores precargados impedía buscar una
   carretera propia.
2. Se trataba la extensión de fuego a +60 min como si ya estuviera ardiendo. Eso
   impedía salir de una zona futura amenazada aunque el trayecto pudiera terminar
   antes de que llegara el fuego.

Correcciones implementadas en el CECOP:

- No se cargan 72 corredores al abrir. Tras respuesta y consentimiento se consulta
  Directions **desde la posición de esa persona**, con dos planificaciones en paralelo.
  Se mantiene la selección del refugio más cercano entre las alternativas admisibles.
- Cada tramo se contrasta con el tiempo estimado de paso: se usan anotaciones de
  duración del proveedor y, cuando faltan, un reparto proporcional a la longitud.
  Los accesos aproximados se temporizan a 4 km/h. La comprobación divide los tramos
  en partes de hasta 50 m e incluye un margen temporal **de demo** de 2 min.
- Un refugio sigue evaluándose al menos a +60 min. El trayecto puede salir de la
  proyección futura si pasa antes de la llegada simulada del fuego; nunca se admite
  atravesar la huella actual con su margen. Durante la animación se comprueba el
  fuego actual, no se convierte la proyección de una hora en fuego presente.
- Se muestra «Calculando ruta individual» mientras llega la respuesta. HTTP de
  Directions, timeout, fallo de conexión, accesos excesivos y falta de alternativas
  tienen mensajes distintos, sin mostrar el token. «Reintentar rutas pendientes»
  repite la planificación, no las llamadas. Pausar aborta peticiones pendientes;
  reanudar permite volver a consultarlas sin duplicar desplazamientos.

Estos cambios corrigen bloqueos reproducibles del planificador. No demuestran que
el token o las peticiones del navegador del equipo funcionen; esa comprobación
requiere observar el resultado real de Directions. La proyección y su margen
siguen siendo ilustrativos, no un cálculo de seguridad operativa.

Fuentes: reproducción local del 2026-09-19 y código de
[routing.ts](../../apps/command-center/src/routing.ts),
[CommandCenter.tsx](../../apps/command-center/src/CommandCenter.tsx) y
[cop.test.mjs](../../apps/command-center/cop.test.mjs). Las regresiones incluyen la
salida a tiempo de una proyección futura, una salida demasiado lenta, planificación
desde la persona, HTTP 403 sin exponer credenciales y exclusión de sesiones reales.

Verificación del 2026-09-19: **29 tests pasan**, build correcto y lint sin avisos.
En navegador, con respuestas de Directions controladas, se verificó ausencia de
precarga, consulta después de responder, diagnóstico HTTP 403, recuperación mediante
reintento, movimiento de 24 personas, pausa/reanudación y ausencia de cambios fuera
de la selección. Esta prueba no valida credenciales ni disponibilidad real de Mapbox.

## Integración del mapa avanzado y la centralita — 2026-09-19

Por petición de Mateo se usa `main` (`f2a3214`) como base del mapa y se integra la conexión
HappyRobot de `devin/vigia-grupos-puntos-encuentro` (`ade0f90`) en
`devin/mapa-avanzado-happyrobot`. Se conserva el mapa avanzado: círculo de campaña,
propagación a una hora, viento, centros de respuesta y comparación de rutas.
No se modifica la otra copia de trabajo ni se unifica todavía el estado con `api/`.

El modo HappyRobot inicia hasta cuatro contactos de la selección, o cuatro de Guisando con
el botón rápido. Cada uno tiene una conversación real entre dos agentes de texto (ocho runs
para una ola de cuatro). El puente Node usa el SDK del workspace EU y devuelve transcripción y
Extract por polling, con recuperación por API cuando falla el webhook del túnel.
La campaña local completa permanece como opción explícita, no como fallback de errores de chat.

Correcciones frente al puente inicial: esperar el outcome incluso después de `done`, refrescar
los nodos del run durante el pull, distinguir fallo técnico de `answered:false`, preservar
consentimiento desconocido, IDs únicos por ola y enlace de tracking con el ID del mapa.
No se simulan respuestas mientras falta Extract. Se valida el punto candidato antes del chat,
se reconsulta la ruta con la movilidad extraída y no se cambia el destino comunicado en silencio.
La asignación HappyRobot comprueba plazas por tamaño del grupo. Necesidad de ayuda pendiente,
falta de intención, consentimiento o ruta bloquean el movimiento. GPS real queda excluido.

Verificación local: 37 tests del frontend, 4 del pull, build y lint correctos.
Prueba de navegador con proveedores controlados: una ola de cuatro, cuatro transcripciones y
outcomes, cuatro grupos en movimiento, cero cambios en los otros 296, pausa/reanudación sin
duplicar runs y recepción del outcome durante pausa. También se probaron viento, propagación
y panel de centros. Esto no valida credenciales ni respuestas reales de Mapbox.
Prueba real autorizada: una ola de cuatro, ocho sesiones de chat, sin telefonía ni SMS.
Los runs del agente fueron `d1255369-1f20-4d8d-83dc-5af162edbe3f`,
`afd62c2a-b0e2-458a-996f-c079f5b15369`, `825cb370-2414-4fd5-b733-837edecd2e4f`
y `b12337a3-c027-440d-aef7-a33ddbdc00d9` (2026-09-19, 14:26 UTC).
Agente y Extract terminaron; el webhook del túnel falló. El primer pull local también falló:
cuando faltaba fecha en la lista de runs, `Date.parse(0)` producía enero de 2000 y el filtro
los descartaba. Se corrigió, se fijó con test y se recuperaron los mismos cuatro runs sin
volver a conversar. También se normalizan listas serializadas como texto JSON por Extract.
Un puente actualizado recuperó automáticamente las cuatro extracciones, y el navegador
aplicó los cuatro resultados con sus transcripciones y enlaces mediante «Recuperar última ola».

**No se verificaron cuatro movimientos con esos resultados reales:** dos `will_evacuate`
son null, uno false y el único true declara movilidad reducida y necesidad de ayuda.
Los cuatro quedan en asistencia según las reglas, sin inventar consentimiento de salida.
El recorrido de cuatro grupos está verificado con outcomes controlados, no con esta ola real.
Mapbox permaneció controlado en ambas pruebas automatizadas; no se validó su servicio real.
No se cambiaron prompts ni versiones publicadas para forzar respuestas favorables.

Fuentes: commits de base y origen indicados, pruebas ejecutadas el 2026-09-19,
[bridge.ts](../../apps/command-center/src/bridge.ts),
[CommandCenter.tsx](../../apps/command-center/src/CommandCenter.tsx),
[server.mjs](../../sim/centralita/server.mjs), [pull.mjs](../../sim/centralita/pull.mjs) y
[e2e-integration.mjs](../../sim/centralita/e2e-integration.mjs).
Arranque y limitaciones: [README del frontend](../../apps/command-center/README.md).

## Retirada de la superposición de riesgo — 2026-09-19

Por petición de Mateo, se retira del mapa la zona amarilla rayada de posible riesgo:
relleno, trama y contorno. Tampoco aparece al simular +1 hora ni tiene un control en Capas.
La huella roja permanece. El cálculo interno de propagación, la exposición de refugios y
los filtros de rutas no cambian. Esta decisión sustituye la visualización de la proyección
descrita en las revisiones anteriores, no su cálculo.

Fuente: petición y captura del usuario en esta sesión (2026-09-19),
[CommandMap.tsx](../../apps/command-center/src/CommandMap.tsx) y
[CommandCenter.tsx](../../apps/command-center/src/CommandCenter.tsx).

## Interfaz mínima y controles bajo demanda — 2026-09-19

Por petición de Mateo se sustituye la composición de tarjetas permanentes por una barra
compacta de campaña (64 px), marca discreta y navegación de cuatro entradas: Personas,
Escenario, Centros y Capas. El mapa queda libre al abrir, sin panel ni select visibles.
La leyenda pasa a Capas; viento y horizonte se reúnen en Escenario.

El icono de ajustes de la barra abre Campaña: canal HappyRobot/local, zona, actividad,
recuperación de conversaciones y reintentos. Solo se muestra un panel a la vez.
La acción principal cambia entre Iniciar, Pausar y Reanudar. Las fichas presentan Resumen,
Conversación y Rutas por separado. No se cambia el protocolo ni la conexión con HappyRobot.

Se verifican en navegador el tamaño de la barra, navegación y cierre con Escape,
controles accesibles en móvil, panel sin solaparse con la barra, selección de canal/zona,
viento y horizonte, centros, pestañas de ficha y el flujo de cuatro resultados controlados.
Las peticiones externas se interceptan en estas pruebas: no crean runs ni verifican el
servicio real de Mapbox. Se mantienen las advertencias de ejercicio y consumo de créditos.

Fuente: petición y captura del usuario de esta sesión (2026-09-19),
[CommandCenter.tsx](../../apps/command-center/src/CommandCenter.tsx),
[CopPanels.tsx](../../apps/command-center/src/CopPanels.tsx),
[index.css](../../apps/command-center/src/index.css) y
[e2e-integration.mjs](../../sim/centralita/e2e-integration.mjs).

## Viento con partículas ligadas al mapa — 2026-09-19

La captura de FireMap.live aportada por Mateo sirve como referencia visual: trazos suaves,
movimiento lento y adaptación a la cámara. Se sustituyen las flechas en coordenadas de pantalla
por partículas en coordenadas geográficas, reproyectadas al desplazar, girar o inclinar el mapa.
La longitud, velocidad aparente y densidad cambian gradualmente con el zoom; cada estela tiene
un degradado hacia una cabeza más clara y un ciclo de aparición/desaparición suave.

La capa sigue usando el rumbo y la velocidad ficticios del escenario. Su velocidad visual
está ajustada para legibilidad y no representa un transporte meteorológico calibrado.
No se consulta una fuente de viento real ni se modifica el modelo de propagación.

La animación usa tiempo transcurrido, con un máximo de 650 partículas y resolución de canvas
limitada a DPR 2. Se detiene al ocultar la pestaña, desactivar el viento o pedir movimiento
reducido; en este último caso sigue reproyectándose al mover la cámara. No captura eventos
de puntero. Se comprueban escala continua, avance a 30/60 pasos por segundo y opacidad en tests;
en navegador, animación, imagen estática con movimiento reducido, zoom/giro/inclinación y
encendido/apagado. Build y lint forman parte de la verificación habitual.

Fuentes: petición y captura del usuario (2026-09-19),
[WindOverlay.tsx](../../apps/command-center/src/WindOverlay.tsx),
[wind.ts](../../apps/command-center/src/wind.ts),
[cop.test.mjs](../../apps/command-center/cop.test.mjs) y
[e2e-integration.mjs](../../sim/centralita/e2e-integration.mjs).

## Zona de contacto y aparición progresiva — 2026-09-19

Por petición de Mateo se cambia el flujo: primero se define dónde explorar, después se envían
las llamadas y solo se muestran personas cuando se obtiene su ubicación. La recomendación es
un contorno estático suave alrededor del incendio (`RECOMMENDED_CALL_AREA`), sin trama amarilla;
no representa peligro, predicción meteorológica ni una orden oficial. En este escenario incluye
los centros de Guisando y El Hornillo. Se pueden sumar círculos manuales y retirar cada uno;
la recomendación está incluida por defecto y también se puede desmarcar.

**La búsqueda censal no se construye y queda fuera del alcance.** Al pulsar Enviar llamadas se
simula esa fase usando los contactos existentes del escenario. No se consulta un censo, no se
lee un archivo externo ni se descubre un teléfono real. La selección se aproxima por el centro
geográfico de cada pueblo; se deduplican contactos de pueblos cubiertos por varias zonas.
Cada ola HappyRobot conserva el límite de cuatro contactos y congela sus destinatarios al enviar.
Una zona sin pueblos/contactos de demo no dispara llamadas a Guisando como fallback.

La población completa deja de aparecer en el mapa y el listado de Personas al arrancar.
El consentimiento activa una ubicación **sintética y etiquetada como demo**, incluso cuando
la persona necesita asistencia o no confirma salida. Eso no es un GPS ni geocodificación de
la dirección declarada. Los GPS voluntarios siguen mostrándose con su origen y sin animación.
Las fichas pendientes no muestran coordenadas censales ni habilitan la comparación de rutas.

Seleccionar un punto dibuja su ruta asignada desde el índice ya calculado, comprobando persona,
localidad y destino comunicado. No solicita otra ruta ni genera un fallback recto. Si falta un
recorrido admisible se muestra el motivo, no un camino inventado. La comparación manual permanece
como vista previa explícita y no modifica la ruta que sigue la simulación.

Verificación: **42 tests** del frontend, build correcto y lint limpio. En navegador, con fuentes
controladas y sin nuevos chats reales: cero marcadores iniciales, recomendación visible, dos
círculos manuales acumulados, cancelación sin perderlos, zona vacía sin envíos, aparición de
marcadores 0 → 1 → 4 y clic sobre una persona que muestra su ruta y destino exactos sin otra
consulta a Directions. Se conserva el movimiento de los cuatro con outcomes favorables de test,
sin tocar a los otros 296. No implica validación de carretera real ni cuatro salidas en la ola
real anterior, cuyos resultados no favorables siguen registrados arriba.

Fuentes: petición del usuario en esta sesión (2026-09-19),
[scenario.ts](../../apps/command-center/src/scenario.ts),
[simulation.ts](../../apps/command-center/src/simulation.ts),
[bridge.ts](../../apps/command-center/src/bridge.ts),
[CommandCenter.tsx](../../apps/command-center/src/CommandCenter.tsx),
[CommandMap.tsx](../../apps/command-center/src/CommandMap.tsx),
[routing.ts](../../apps/command-center/src/routing.ts) y las pruebas locales.

## Fuentes

- OpenStreetMap, recinto sanitario de Arenas (40.2116975, -5.0855068) — https://www.openstreetmap.org/way/992325099 (localizado con Nominatim el 2026-09-19).
- SESCAM, Hospital Nuestra Señora del Prado — https://sanidad.castillalamancha.es/ciudadanos/centros/hospital-nuestra-senora-del-prado (consultado 2026-09-19).
- OpenStreetMap, hospital de Talavera (39.9646542, -4.8073831) — https://www.openstreetmap.org/way/668566543 (localizado con Nominatim el 2026-09-19).
- OpenStreetMap, parque de bomberos de Talavera (39.9552966, -4.8151033) — https://www.openstreetmap.org/way/645765574 (localizado con Nominatim el 2026-09-19; no confirma operatividad).
- Datos cartográficos de centros: © OpenStreetMap contributors, ODbL — https://www.openstreetmap.org/copyright (atribución incluida en el mapa).
- USDA Forest Service, FARSITE — modelos de propagación, combustible y terreno — https://research.fs.usda.gov/sites/default/files/2024-01/firelab-finney_and_andrews_1999_fmn_v59_i2_pp13-15.pdf (extracto localizado 2026-09-19).
- Mapbox Directions API — perfiles, alternativas y duración — https://docs.mapbox.com/api/navigation/directions/ (consultado 2026-09-19).
- SACYL, Centro de Salud de Arenas de San Pedro — https://www.saludcastillayleon.es/CAAvila/es/area-influencia/z-b-s-arenas-san-pedro (consultado 2026-09-19).
- SACYL, Hospital Nuestra Señora de Sonsoles — https://www.saludcastillayleon.es/CAAvila/es/hospital-senora-sonsoles (extracto localizado 2026-09-19).
- Ávilared, selección de personal y apertura prevista de parques — https://avilared.com/art/91127/primeros-cabos-parques-bomberos-avila-seleccion-apertura-2026 (extracto localizado 2026-09-19; no confirma disponibilidad actual).
- Branch de origen: `origin/devin/vigia-grupos-puntos-encuentro`, commit `a584037`, `src/scenario.ts`, `src/types.ts` y `src/CommandMap.tsx` (revisados 2026-09-19).
- Ayuntamiento de Guisando, aparcamientos de La Dehesa y El Risquillo — https://guisando.net/servicios-publicos/aparcamientos (consultado 2026-09-19).
- Ayuntamiento de Arenas de San Pedro, polideportivo Jesús Navarro — https://arenasdesanpedro.es/concejalias/deportes/polideportivo-jesus-navarro/ (consultado 2026-09-19).
- Revisión técnica local: [App.tsx](../../apps/command-center/src/App.tsx), [CitizenTrack.tsx](../../apps/command-center/src/CitizenTrack.tsx), [routing.ts](../../apps/command-center/src/routing.ts), [firms.ts](../../apps/command-center/src/firms.ts), [token.ts](../../apps/command-center/src/token.ts) y [package.json](../../apps/command-center/package.json) (revisados 2026-09-19).

- Implementación local: [scenario.ts](../../apps/command-center/src/scenario.ts), [CommandMap.tsx](../../apps/command-center/src/CommandMap.tsx), [CommandCenter.tsx](../../apps/command-center/src/CommandCenter.tsx), [simulation.ts](../../apps/command-center/src/simulation.ts) y [vite.config.ts](../../apps/command-center/vite.config.ts) (revisada 2026-09-19).
- Arenas de San Pedro, coordenadas del núcleo — https://es.wikipedia.org/wiki/Arenas_de_San_Pedro (consultado 2026-09-19).
- Guisando, referencia geográfica — https://www.ayuntamiento.es/guisando/ (consultado 2026-09-19).
- AEMET, coordenadas de El Hornillo — https://www.aemet.es/es/eltiempo/prediccion/municipios/hornillo-el-id05100 (consultado 2026-09-19).
- El Arenal, coordenadas del núcleo — https://es.wikipedia.org/wiki/El_Arenal_(%C3%81vila) (consultado 2026-09-19).

- Decisión de producto de equipo, 2026-09-19 (este hackathon)
- NASA FIRMS active fire CSV — https://firms.modaps.eosdis.nasa.gov/ (consultado 2026-09-19)
- FireMap.live como referencia visual de focos — https://firemap.live/ (consultado 2026-09-19)
- Encaje de producto: [`../03-dominio-crisis/02-encaje-sector-publico.md`](../03-dominio-crisis/02-encaje-sector-publico.md)
