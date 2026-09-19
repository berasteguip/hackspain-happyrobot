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
`scenario.ts` y `routing.ts` el 2026-09-19. No hay nuevas capas COP implementadas
como resultado de esta investigación; las coordenadas de los centros están pendientes
de verificación antes de incorporarlas al mapa.

## Fuentes

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
