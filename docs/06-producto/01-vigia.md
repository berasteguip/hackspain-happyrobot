# Vigía — prevención de incendios con agentes de voz HappyRobot

> **Actualizado:** 2026-09-19 · **Estado:** borrador
> **En una frase:** agentes de HappyRobot llaman a la población en zonas de riesgo
> de incendio, indican zonas seguras y, con consentimiento, el CECOP sigue su
> movimiento en un mapa junto a los focos.

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
