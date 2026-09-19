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
> `frontend/dashboard` MapLibre). Ambas están abiertas en [`../07-decisiones/`](../07-decisiones/README.md).

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

Código en `frontend/command-center`. Vite + React + Mapbox GL. El protocolo de
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

**Actualización respecto al frontend inicial descrito arriba:** la campaña ya no
mueve automáticamente a las personas en línea recta ni les asigna un destino.
Responder una llamada modifica el estado de contacto, no demuestra una evacuación.

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

Verificación local desde `frontend/command-center`: `npm run build`, `npm run lint`.

## Fuentes

- Implementación local: [scenario.ts](../../frontend/command-center/src/scenario.ts), [CommandMap.tsx](../../frontend/command-center/src/CommandMap.tsx), [CommandCenter.tsx](../../frontend/command-center/src/CommandCenter.tsx), [simulation.ts](../../frontend/command-center/src/simulation.ts) y [vite.config.ts](../../frontend/command-center/vite.config.ts) (revisada 2026-09-19).
- Arenas de San Pedro, coordenadas del núcleo — https://es.wikipedia.org/wiki/Arenas_de_San_Pedro (consultado 2026-09-19).
- Guisando, referencia geográfica — https://www.ayuntamiento.es/guisando/ (consultado 2026-09-19).
- AEMET, coordenadas de El Hornillo — https://www.aemet.es/es/eltiempo/prediccion/municipios/hornillo-el-id05100 (consultado 2026-09-19).
- El Arenal, coordenadas del núcleo — https://es.wikipedia.org/wiki/El_Arenal_(%C3%81vila) (consultado 2026-09-19).

- Decisión de producto de equipo, 2026-09-19 (este hackathon)
- NASA FIRMS active fire CSV — https://firms.modaps.eosdis.nasa.gov/ (consultado 2026-09-19)
- FireMap.live como referencia visual de focos — https://firemap.live/ (consultado 2026-09-19)
- Encaje de producto: [`../03-dominio-crisis/02-encaje-sector-publico.md`](../03-dominio-crisis/02-encaje-sector-publico.md)
