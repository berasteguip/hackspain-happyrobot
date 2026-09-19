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
Los marcadores mantienen un tamaño pequeño: referencias en marfil y ubicaciones
compartidas en azul cielo, con borde oscuro nítido para contrastar con la cartografía
y el fuego. Se evita el morado y se conserva la distinción entre referencia y posición.

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
sintéticas de ~~100 m~~ → ~~25 m~~ → **5 m** (refinadas el 2026-09-19), con manchas separadas y huecos interiores, inspirada en la
captura aportada por el equipo. El tamaño de celda es una decisión visual de la
demo, no la resolución de un instrumento NASA. La propagación y los puntos térmicos
quedan ocultos inicialmente; pueden activarse desde Capas. La fuente externa FIRMS
continúa separada y no se utiliza para inventar superficies quemadas.

El último ajuste visual del 2026-09-19 sustituye las agrupaciones elípticas por una
masa principal alargada y ramificada con huecos de tamaños variables y fragmentos
periféricos. El rojo es opaco y la base satélite se muestra menos oscura. Esta
morfología es una composición gráfica inspirada en la referencia, no un cálculo
basado en terreno, meteorología ni detecciones reales.

Para la escena cercana de Guisando se añade una extensión del frente al noroeste
del núcleo: queda aproximadamente a 220 m del centro de referencia y a 124 m del
punto residencial sintético más cercano. Son distancias de composición de la demo,
no distancias de seguridad ni estimaciones de riesgo. La cuadrícula de 5 m se agrupa
en tramos horizontales para mantener compacta la geometría al trabajar con zoom alto.

## Grupos y puntos de encuentro — revisión 2026-09-19

La versión actual sustituye el estado sin desplazamientos descrito antes por una
simulación explícita a **×20**: llamada → ubicación y grupo confirmados → consulta
de recorridos → reserva de plazas → preparación → salida → llegada simulada.
Los 300 registros son contactos/representantes; cada uno puede representar a varias
personas. La composición se muestra tras responder la llamada de demostración.

| Punto candidato | Ubicación publicada | Aforo de demo | Función ficticia |
| --- | --- | --- | --- |
| PE-01 La Dehesa | Guisando, 40.220682, -5.140945 | 100 | Recepción y transporte |
| PE-02 El Risquillo | Guisando, 40.221327, -5.144282 | 90 | Recepción y ayuda básica |
| PE-03 Jesús Navarro | Arenas, 40.2126907, -5.0930363 | 650 | Cobijo, ayuda y transporte |

Las coordenadas se extraen de los mapas incrustados en las páginas municipales
citadas abajo. **No son refugios oficiales validados:** servicios, aforos y
accesibilidad operativa son supuestos del escenario. No se ha verificado humo,
viento, cortes de carretera, disponibilidad del recinto ni instrucciones oficiales.

- Un punto representa a todo el grupo junto. Adultos, menores y mayores se cuentan
  de forma excluyente; el representante está incluido en adultos.
- Los perfiles del guion declaran medio de transporte y movilidad. Sus velocidades
  y tiempos de preparación son parámetros ficticios; no una evaluación clínica.
- Los grupos que solicitan recogida no se desplazan automáticamente.
- Mapbox Directions se consulta **solo al pulsar Play**, con el token de Mapbox del
  navegador. Consume cuota. Se limita a cuatro grupos en planificación concurrente
  y cuatro consultas por segundo; existe caché durante la sesión.
- Se comparan las rutas devueltas a puntos con capacidad disponible y compatibles
  con el perfil. Se elige la de menor longitud entre las alternativas admisibles
  consultadas, no una garantía de óptimo global sobre todas las carreteras.
- El trazado procede de Directions; cada enlace entre la ubicación aproximada y el
  trazado, o entre el trazado y el recinto, se admite solo hasta 40 m y se informa
  en la ficha. No se inventa una ruta recta cuando falla el proveedor.
- Se rechazan segmentos que intersecten la huella simulada, ampliada con un margen
  gráfico de 35 m. Este filtro y los límites de recorrido (5 km a pie, 2.5 km con
  acompañamiento, 20 km en vehículo) **no son criterios de seguridad operativa**.
- Las reservas se aplican secuencialmente por el tamaño completo de cada grupo,
  incluyendo quienes se preparan y quienes ya han llegado; no se divide una familia.
- Pausar congela el reloj y aborta consultas pendientes; continuar conserva la
  posición y las reservas. Las llegadas se registran una sola vez.
- Los pings reales no reciben movimiento ni destinos ficticios. Si un ping reemplaza
  una ficha de demo, se descarta su recorrido y se libera su reserva de demo.

Seleccionar un grupo muestra composición, destino y progreso; solo su recorrido se
superpone para evitar saturar el mapa. Los puntos se representan con un símbolo de
cobijo y disponen de ficha con plazas y grupos asignados. También se abren desde Capas.

Las consultas exploratorias de OpenStreetMap devolvieron 406/429; no se incorporó una
red vial sin verificar. Las pruebas automatizadas usan respuestas de Directions
simuladas, sin tokens reales ni consumo del proveedor. La respuesta real de Directions
depende del token y de la disponibilidad del servicio.

Verificación desde `apps/command-center`, con Node.js 24: `npm test`, `npm run build`,
`npm run lint`. Las pruebas cubren fases, grupo completo, aforos, ritmos, llegada,
protección del GPS, intersecciones, caché, abortos y errores de proveedor.

## Fuentes

- Aparcamientos de Guisando y coordenadas de sus mapas incrustados — https://guisando.net/servicios-publicos/aparcamientos (consultado 2026-09-19).
- Polideportivo Jesús Navarro, dirección y mapa municipal — https://arenasdesanpedro.es/concejalias/deportes/polideportivo-jesus-navarro/ (consultado 2026-09-19).
- Mapbox Directions API, perfiles, alternativas y geometría — https://docs.mapbox.com/api/navigation/directions/ (consultado 2026-09-19).
- Implementación del flujo: [routing.ts](../../apps/command-center/src/routing.ts), [simulation.ts](../../apps/command-center/src/simulation.ts) y [simulation.test.mjs](../../apps/command-center/simulation.test.mjs).

- Implementación local: [scenario.ts](../../apps/command-center/src/scenario.ts), [CommandMap.tsx](../../apps/command-center/src/CommandMap.tsx), [CommandCenter.tsx](../../apps/command-center/src/CommandCenter.tsx), [simulation.ts](../../apps/command-center/src/simulation.ts) y [vite.config.ts](../../apps/command-center/vite.config.ts) (revisada 2026-09-19).
- Arenas de San Pedro, coordenadas del núcleo — https://es.wikipedia.org/wiki/Arenas_de_San_Pedro (consultado 2026-09-19).
- Guisando, referencia geográfica — https://www.ayuntamiento.es/guisando/ (consultado 2026-09-19).
- AEMET, coordenadas de El Hornillo — https://www.aemet.es/es/eltiempo/prediccion/municipios/hornillo-el-id05100 (consultado 2026-09-19).
- El Arenal, coordenadas del núcleo — https://es.wikipedia.org/wiki/El_Arenal_(%C3%81vila) (consultado 2026-09-19).

- Decisión de producto de equipo, 2026-09-19 (este hackathon)
- NASA FIRMS active fire CSV — https://firms.modaps.eosdis.nasa.gov/ (consultado 2026-09-19)
- FireMap.live como referencia visual de focos — https://firemap.live/ (consultado 2026-09-19)
- Encaje de producto: [`../03-dominio-crisis/02-encaje-sector-publico.md`](../03-dominio-crisis/02-encaje-sector-publico.md)
