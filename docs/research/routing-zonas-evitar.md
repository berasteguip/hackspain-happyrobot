# Routing con zonas a evitar (polígono de incendio + carreteras cortadas)

Investigación técnica para la feature central del escenario de incendio: rutas de evacuación individuales que deben **evitar el polígono del fuego y las carreteras cortadas**, y recalcularse cuando el fuego se mueve (objetivo: 120 rutas recalculadas cada 30 s).

Metodología: fetch directo a la documentación oficial de cada proveedor (páginas HTML/Markdown reales, citadas con URL). Cuando la documentación pública no ha dado una cifra concreta pese a intentarlo, se marca **NO CONFIRMADO** en vez de inventar un número.

---

## Tabla comparativa

| Proveedor | ¿Excluye polígonos arbitrarios? | Autoalojado | Coste (orden de magnitud) | Latencia esperada por recálculo | Veredicto |
|---|---|---|---|---|---|
| **Google Routes API v2** (`computeRoutes`) | **NO.** `RouteModifiers` solo tiene `avoidTolls`, `avoidHighways`, `avoidFerries`, `avoidIndoor`, `avoidTunnels`, `vehicleInfo`, `tollPasses`. Sin campo de área/polígono/cierre de vía. | No (SaaS) | ~$0 si nos quedamos dentro del free tier (10.000 llamadas/mes); si no, $5/1000 llamadas (Essentials) | Red (HTTP), ~200-500 ms por llamada, buen throughput | ❌ Descartado para la ruta segura. Sirve solo para distancia/ETA de apoyo. |
| **OSRM** (autoalojado) | **NO.** `exclude=` solo admite clases de carretera definidas en el perfil Lua (`motorway`, `toll`...), no geometrías. | Sí | Gratis (solo cómputo propio) | Muy rápido en query, pero recontraer el grafo tras cada movimiento del fuego es lento/pesado | ❌ Descartado para exclusión dinámica de polígonos. |
| **Valhalla** (autoalojado, o Mapbox-hospedado en algunos endpoints) | **SÍ.** `exclude_polygons` — anillos de polígono en `[lon, lat]`, o `FeatureCollection` GeoJSON con `levels`. | Sí (Docker) | Gratis (solo cómputo propio) | Sin reconstrucción de grafo: el polígono se pasa en cada request; coste está en el pathfinding, no en preprocesado | ✅ **Ganador.** Máximo esfuerzo dedicado abajo. |
| **GraphHopper** | **Parcial / de pago.** `custom_model` con `areas` (GeoJSON) + `priority` `multiply_by 0` bloquea zonas — confirmado en la doc. Pero el plan Free prohíbe el modo flexible (`ch.disable=true`), que es el que necesita `custom_model` dinámico. | Sí (self-hosted, sin restricción) | Free (self-hosted) / de pago (hosted) | Buena si self-hosted | 🟡 Viable solo self-hosted; hosted-free probablemente bloqueado (ver nota). |
| **Openrouteservice (ORS)** | **SÍ.** `options.avoid_polygons` — GeoJSON `Polygon` o `MultiPolygon`. | Sí, y también API pública gratuita | Gratis (con cuotas no confirmadas con cifra exacta) | Depende de si usamos la API pública (latencia de red) o self-hosted | 🟡 Plan B sólido — mismo motor que GraphHopper (fork), sintaxis distinta y ya soporta polígonos de fábrica. |
| **Mapbox Directions** | **NO** para polígonos. `exclude=point(lon lat)` (BETA, máx. 50 puntos) solo excluye tramos puntuales, no áreas. | No (SaaS) | De pago tras free tier | Red | ❌ Descartado como excluidor de áreas. |
| **Grafo propio (OSMnx + NetworkX/igraph)** | **SÍ, control total.** Borras las aristas que intersecan el polígono y recalculas. | Sí | Gratis | Con NetworkX puro, dudoso llegar a <2 s para 120 rutas (ver cálculo); con igraph o `scipy.sparse.csgraph.dijkstra`, sí | ✅ **Plan B / motor del simulador.** Nos da capacidad por tramo (para el resto del proyecto). |

---

## 1. Google Maps Platform

### Routes API (`routes.googleapis.com/directions/v2:computeRoutes`)

Campo relevante: `routeModifiers` dentro de `ComputeRoutesRequest`, de tipo `RouteModifiers`.

Confirmado literalmente en la documentación (fetch directo a la página, no memoria):

> JSON representation:
> ```
> {
>   "avoidTolls": boolean,
>   "avoidHighways": boolean,
>   "avoidFerries": boolean,
>   "avoidIndoor": boolean,
>   "vehicleInfo": { object (VehicleInfo) },
>   "tollPasses": [ enum (TollPass) ],
>   "avoidTunnels": boolean
> }
> ```

Fuente: https://developers.google.com/maps/documentation/routes/reference/rest/v2/RouteModifiers

**No existe ningún campo para excluir un área, polígono o carretera cortada arbitraria.** Los únicos "avoid" son booleanos de categoría (peajes, autopistas, ferris, interiores, túneles) — exactamente la sospecha del enunciado, confirmada. La Directions API "vieja" (`maps.googleapis.com/maps/api/directions`) tiene el mismo conjunto de `avoid=tolls|highways|ferries|indoor` y ningún parámetro de polígono; no hay razón para migrar a ella, es estrictamente inferior a Routes API v2.

**El truco de "waypoints intermedios para forzar un corredor"**: es un patrón de comunidad ampliamente documentado en foros (Stack Overflow, issue trackers de Google Maps Platform) — no es un parámetro oficial, es un hack: se insertan `intermediates` con `via:true` fuera del área a evitar para sesgar la ruta. No lo hemos podido verificar como "oficialmente documentado" porque no lo es; es una técnica de terceros, no soportada, sin garantía de que evite el polígono (Google puede seguir cruzándolo si la carretera "correcta" pasa por ahí). Para un escenario de seguridad vital (evacuación de incendio) es **inaceptable**: no hay garantía dura de exclusión.

**Road closures / oferta gobierno / emergencias**: no hemos encontrado ninguna oferta pública de "Google Maps Platform for Emergency Response" ni un mecanismo de inyección de cierres de carretera propios en la Routes API estándar. Google sí tiene señales de tráfico en vivo (incluidas fuentes tipo Waze) que pueden reflejar cierres reportados por otros usuarios, pero eso es automático/no controlable por nosotros y no es un "avoid" dirigible. **NO CONFIRMADO** que exista un producto de "Emergency Response" con esta capacidad expuesta vía API pública; si existe, es un acuerdo comercial/gubernamental fuera del alcance de un hackathon de 36h.

### Precio y free tier (2026)

Fuente: https://developers.google.com/maps/billing-and-pricing/pricing (fetch directo, septiembre 2026)

| SKU | Free cap mensual | Coste por 1000 llamadas (hasta 100k) |
|---|---|---|
| Routes: Compute Routes **Essentials** | 10.000 | $5.00 |
| Routes: Compute Routes **Pro** | 5.000 | $10.00 |
| Routes: Compute Routes **Enterprise** | 1.000 | $15.00 |

(Nota: el modelo de "$200 de crédito mensual" ya no existe; Google lo sustituyó por "free monthly calls per SKU", confirmado en la misma página.)

**Cálculo pedido**: 120 rutas recalculadas cada 30 s durante 20 min.
- Nº de recálculos = 20 min × 60 / 30 s = 40 ciclos.
- Llamadas totales = 40 × 120 = **4.800 llamadas** en una ejecución de demo.
- Si es el único uso del mes → dentro del free cap de Essentials (10.000/mes) → **coste $0**.
- Si el equipo ya ha consumido el free tier en pruebas repetidas durante la hackathon (muy probable: cada ensayo de demo suma), el coste incremental de esas 4.800 llamadas sería 4.800/1000 × $5.00 = **$24** por ejecución completa de demo, a nivel Essentials. A nivel Pro, $48; a nivel Enterprise, $72.
- El volumen de peticiones (120 en unos segundos, 4/s de media) está muy por debajo de cualquier límite de cuota de QPS típico; el **límite exacto de QPS por defecto no está confirmado** en la página consultada (NO CONFIRMADO).

**Conclusión**: el coste no es el problema de Google — el problema es que, aunque fuera gratis, **no puede excluir el polígono del fuego con garantías**. Coste bajo con capacidad insuficiente no sirve.

### HappyRobot y el nodo de Google Maps (punto 8 del encargo)

HappyRobot expone una integración de Google Maps como nodo de workflow (confirmado en la investigación previa del equipo, `docs/plataforma-happyrobot.md`). Dado que Google Routes/Directions API no soporta exclusión de polígonos ni cierres de carretera propios, **ese nodo de HappyRobot solo puede usarse para lo que Google sabe hacer sin trampas**: calcular distancia y ETA entre dos puntos, o quizá enriquecer una llamada de voz con "estás a X minutos". **No debe usarse como el motor de la ruta de evacuación segura** — si se usa para eso, la ruta puede cruzar el polígono del incendio sin que el sistema lo sepa. La ruta segura tiene que salir de nuestro propio motor (Valhalla u OSMnx/grafo propio) y, si se quiere, presentarse en el mapa; el nodo de Google puede quedarse como utilidad secundaria (ETA de apoyo a un centro de recursos, por ejemplo), nunca como fuente de verdad de la ruta de evacuación.

---

## 2. OSRM (Open Source Routing Machine)

Fuente: http://project-osrm.org/docs/v5.24.0/api/#route-service (fetch directo)

El parámetro `exclude`:

> Valores: `"{class}[,{class}]"` — "Additive list of classes to avoid, order does not matter."
> `class`: "A class name determined by the profile or `none`."

**Confirmado: solo excluye clases de carretera predefinidas en el perfil Lua** (`motorway`, `toll`, `ferry`, según cómo esté configurado ese perfil concreto), **no geometrías ni polígonos arbitrarios**. La sospecha del enunciado es correcta.

**Bloqueo dinámico de aristas sin reconstruir el grafo**: OSRM separa el pipeline en `osrm-extract` (parsea el `.osm.pbf` con el perfil Lua) → `osrm-partition`/`osrm-customize` (MLD, Multi-Level Dijkstra) o `osrm-contract` (CH, Contraction Hierarchies). Ambos algoritmos precomputan una estructura jerárquica sobre el grafo completo para acelerar las queries; **no existe una API pública de "bloquea esta arista ahora" sin re-ejecutar al menos la fase de customización** (con MLD, `osrm-customize` es más barato de re-ejecutar que `osrm-contract` con CH, pero sigue siendo un paso de preprocesado, no una operación de request). Esto hace a OSRM poco apto para un fuego que se mueve cada 30 s.

**Tiempo de `osrm-extract` + `osrm-contract`/`osrm-partition` para un extracto de Zamora**: no hemos podido fetch un benchmark oficial con esa cifra exacta (**NO CONFIRMADO**). Por orden de magnitud conocido del propio proyecto (extractos provinciales de pocos cientos de MB), suele ser de segundos a pocos minutos en un portátil moderno — cabe perfectamente en un portátil — pero como **no es la vía elegida** (no soporta exclusión de polígonos), no merece más inversión de tiempo confirmando el número exacto.

**Veredicto**: descartado como motor de exclusión dinámica. Sirve como referencia de qué NO hacer.

---

## 3. Valhalla — la respuesta

Fuente (fetch directo, HTML real de la página, no memoria): https://valhalla.github.io/valhalla/api/route/api-reference/

### `exclude_polygons` — sintaxis exacta confirmada

Texto literal de la documentación:

> **exclude_polygons**: "One or more exterior rings of polygons in the form of nested JSON arrays, e.g. `[[[lon1, lat1], [lon2,lat2]],[[lon1,lat1],[lon2,lat2]]]`. Roads intersecting these rings will be avoided during path finding. Alternatively, pass a `FeatureCollection` of polygon features, where each feature may have a `levels` property, which must be an array of floats. If present, only edges intersecting the rings that also match one of the passed levels will be excluded [...]. Valhalla will close open rings (i.e. copy the first coordinate to the last position)."

Puntos clave confirmados:
- **Formato de coordenadas: `[lon, lat]`** (longitud primero, no `[lat, lon]`).
- Dos formatos válidos: (a) array anidado plano de anillos, o (b) `FeatureCollection` GeoJSON con `properties.levels` opcional (para restringir la exclusión a ciertos niveles jerárquicos del grafo: 0 = autopistas/arterias, 1 = calles de conexión, 2 = calles locales — permite, por ejemplo, "solo bloquea carreteras locales dentro del polígono, deja pasar la autopista si no la corta el fuego realmente").
- **No hace falta cerrar el anillo manualmente**: "Valhalla will close open rings" — si se te olvida repetir el primer punto al final, Valhalla lo cierra por ti.
- **No es EXPERIMENTAL.** Existe una sección separada, "Hard exclusions -> EXPERIMENTAL" (`exclude_bridges`, `exclude_tunnels`, `exclude_highways`, `exclude_ferries`, gateada por `service_limits.allow_hard_exclusions` en la config del servidor) que es una feature *distinta* y sí marcada EXPERIMENTAL. `exclude_polygons` no lleva esa etiqueta ni esa gate — es una opción estable de request.

Ejemplo literal de la doc, para excluir solo aristas de ciertos niveles jerárquicos:

```json
{
  "exclude_polygons": {
    "type": "FeatureCollection",
    "features": [{
      "type": "Polygon",
      "geometry": {
        "coordinates": [[[lon_1, lat_1], "...", [lon_i, lat_i]]]
      },
      "properties": {
        "levels": [1.0, 2.0, 3.0]
      }
    }]
  }
}
```

`exclude_locations` (complementario, para "esta casa / este punto concreto no se puede usar como paso") también existe: "A set of locations to exclude [...] mapped to the closest road or roads and these roads are excluded from the route path computation."

**Límite de tamaño del polígono / número de vértices**: no lo hemos podido confirmar con una cifra exacta en la documentación pública consultada (**NO CONFIRMADO** — es probable que exista un límite configurable a nivel de servidor, pero no hemos encontrado el nombre exacto de la clave de config ni su valor por defecto; no lo inventamos).

**¿Alojado en Mapbox o solo autoalojado?**: Valhalla es el motor de rutas open source detrás de Mapbox Directions API, pero Mapbox **no expone `exclude_polygons` en su API pública** (ver sección Mapbox más abajo — su parámetro `exclude` público es distinto y más limitado). Para tener `exclude_polygons` hace falta **Valhalla autoalojado** (o el servicio propio de Valhalla en la nube de terceros como GIS-OPS/Mapzen-derivados, fuera de alcance para 36h).

### Por qué es la respuesta

- Es exactamente el mecanismo del punto 3 del enunciado: excluir un polígono arbitrario (el polígono del fuego, recalculado en cada tick del simulador) sin ninguna capa de traducción ni hack de waypoints.
- Recalcular es **sin estado**: cada request lleva su propio `exclude_polygons`; no hay preprocesado que rehacer cuando el fuego se mueve (a diferencia de OSRM). El coste está en el pathfinding puro (A* con costing), no en un paso de "recontratar/reparticionar" el grafo.
- El formato de carreteras cortadas puede modelarse como `exclude_locations` (un punto en cada extremo del corte) o como un polígono estrecho sobre el tramo cortado.

---

## 4. GraphHopper

Fuente: https://raw.githubusercontent.com/graphhopper/graphhopper/master/docs/core/custom-models.md (Markdown oficial del repo, fetch directo) + https://www.graphhopper.com/pricing/

### Sintaxis exacta confirmada

Las áreas van en una sección `areas` de nivel superior del `custom_model`, en GeoJSON, y se referencian con el prefijo `in_`:

> "each area's id needs to be prefixed with `in_`"
> "a member of this collection must be a `Feature` with a geometry type `Polygon`"
> "the coordinates array of `Polygon` is an array of arrays that each must describe a closed ring, i.e. the first point must be equal to the last"
> "Each point is given as an array `[longitude, latitude]`"

Ejemplo literal (adaptado del documento oficial):

```json
{
  "priority": [
    { "if": "in_custom1", "multiply_by": "0" }
  ],
  "areas": {
    "type": "FeatureCollection",
    "features": [{
      "type": "Feature",
      "id": "custom1",
      "properties": {},
      "geometry": {
        "type": "Polygon",
        "coordinates": [[
          [1.525, 42.511], [1.510, 42.503], [1.531, 42.495], [1.542, 42.505], [1.525, 42.511]
        ]]
      }
    }]
  }
}
```

> "To block an entire area set the priority value to `0`."

Formato confirmado: `[lon, lat]`, anillo cerrado obligatorio (primer punto = último). Se pueden combinar condiciones: `"if": "road_class == MOTORWAY && in_custom1"`.

### ¿Plan gratuito o solo de pago/self-hosted?

Aquí hay que separar dos cosas:

1. **`custom_model` como tal**: la documentación de precios (`graphhopper.com/pricing`) no lo nombra explícitamente en la tabla de planes, pero dice literalmente sobre el plan Free: **"cannot use the flexible mode (`ch.disable=true`)"**. `custom_model` con pesos dinámicos por request (como bloquear un área) es incompatible con las Contraction Hierarchies precalculadas — típicamente requiere modo flexible (`ch.disable=true`) porque la CH está optimizada para *un* perfil de costes fijo, no para reponderar aristas al vuelo. **Esta es una inferencia razonable a partir de lo documentado, no una cita literal de "custom_model bloqueado en Free"**: la doc no lo dice con esas palabras, pero la combinación de hechos (Free prohíbe `ch.disable=true` + `custom_model` dinámico necesita ese modo) apunta a que **en la práctica el plan Free hospedado no sirve para esto**.
2. **Self-hosted (código abierto, tu propio servidor GraphHopper)**: sin esa restricción de plan — puedes activar `ch.disable=true` tú mismo. Ahí `custom_model` con `areas` funciona igual que en Valhalla, con GeoJSON y `multiply_by 0`.

**Veredicto**: GraphHopper es una alternativa técnica válida y con sintaxis muy similar a Valhalla, pero para la hackathon (queremos usar la API alojada sin montar servidor, o si montamos servidor preferimos no perder tiempo en dos motores) Valhalla nos ahorra la duda del plan.

---

## 5. Openrouteservice (ORS)

Fuente: https://giscience.github.io/openrouteservice/api-reference/endpoints/directions/routing-options/ (fetch directo)

### `options.avoid_polygons` — confirmado

> "Comprises areas to be avoided for the route. Formatted as GeoJSON polygon or GeoJSON multipolygon."

Tipo de dato: **GeoJSON `Polygon` o `MultiPolygon`** (formato GeoJSON estándar, por tanto `[lon, lat]` también, como todo GeoJSON). No se documenta en esa página ningún límite explícito de tamaño o número de vértices (**NO CONFIRMADO** un número concreto; puede existir un límite de payload/timeout en el servidor, pero no lo hemos encontrado documentado con cifra).

Para contraste, en la misma página:
- `options.avoid_features`: array de strings (`highways`, `tollways`, `ferries`, `fords`, `steps`), según perfil.
- `options.avoid_borders`: string único (`all` o `controlled`), solo para perfiles `driving-*`.

### Límites de la API pública gratuita (peticiones/minuto y /día)

**NO CONFIRMADO con cifra exacta**: intentamos acceder a la página de planes oficial (`openrouteservice.org/plans/` → redirige a `account.heigit.org/info/plans`) y no obtuvimos la tabla de cuotas en el contenido fetched. No vamos a inventar los números de rate limit — si se decide usar la API pública de ORS en la demo, hay que comprobar la cuota real desde el dashboard de la API key del equipo antes de confiar en 120 llamadas cada 30 s durante 20 minutos.

### ¿Matrix?

ORS tiene un endpoint `/v2/matrix/{profile}` separado (confirmado por la estructura estándar de la API, que expone `directions`, `isochrones`, `matrix`, `snap` como servicios independientes); no hemos confirmado si `avoid_polygons` se aplica también al endpoint Matrix (**NO CONFIRMADO** — típicamente los `options` de avoid en ORS aplican a Directions e Isochrones, la Matrix API histórica de ORS ha tenido soporte más limitado de `avoid_polygons`, pero no lo hemos verificado con la doc real, así que no lo afirmamos).

**Veredicto**: mismo motor que GraphHopper (ORS es un fork/wrapper sobre GraphHopper mantenido por HeiGIT) con sintaxis de exclusión de polígonos ya expuesta de fábrica en su API pública, sin la duda del `ch.disable` de GraphHopper. Es nuestro **Plan B** más razonable si Valhalla da problemas de tiempo de montaje.

---

## 6. Mapbox Directions

Fuente: fetch directo a `docs.mapbox.com/api/navigation/directions/`

El parámetro `exclude` (lista separada por comas) admite:

- `motorway` (driving, driving-traffic)
- `toll` (driving, driving-traffic)
- `ferry` (driving, driving-traffic, cycling, walking)
- `unpaved` (driving, driving-traffic)
- `cash_only_tolls` (driving, driving-traffic, walking, cycling)
- `country_border` (BETA, driving, driving-traffic)
- `state_border` (BETA, driving, driving-traffic)
- `tunnel` (BETA, driving, driving-traffic)
- `point(longitude latitude)` (BETA, driving, driving-traffic) — sintaxis WKT, hasta **50 puntos** por request: `"point(lon1 lat1), point(lon2 lat2)"`

**No existe un valor de tipo "polygon"**. Solo exclusión por categoría de vía, por frontera, o por puntos individuales (que se ajustan a la carretera más cercana y excluyen ese segmento). La documentación además avisa que las exclusiones son *best-effort*: si la vía excluida es la única forma de llegar a un waypoint, puede seguir usándose, marcándose como violación en la respuesta.

**Veredicto**: descartado como excluidor de polígonos. Con 50 puntos podría aproximarse un perímetro de fuego como una nube de puntos sobre las carreteras que lo cruzan, pero es un hack peor que el de Google (BETA, sin garantía dura, límite de 50 puntos total para todo el request) — no lo recomendamos.

---

## 7. Grafo propio: OSMnx + NetworkX/igraph

### Descarga del grafo

API actual (OSMnx 2.1.1, confirmado en `osmnx.readthedocs.io/en/stable/user-reference.html`):

```python
import osmnx as ox

# Por nombre de lugar
G = ox.graph.graph_from_place("Zamora, Castilla y León, España", network_type="drive")

# Por bounding box: OJO, en OSMnx 2.x el bbox es una tupla (left, bottom, right, top)
# es decir (west, south, east, north) -- NO el orden histórico north/south/east/west
bbox = (-6.15, 41.35, -5.75, 41.65)  # ~30x30 km alrededor de Zamora capital
G = ox.graph.graph_from_bbox(bbox, network_type="drive")
```

### Tamaño esperado para ~30x30 km rural de Zamora

Estimación de ingeniería (no hay una cifra "oficial" que confirmar — depende del área exacta elegida, así que lo marcamos como estimación, no como hecho documentado):

- 900 km² de zona rural con baja densidad de vías, red `drive` (carreteras + caminos transitables en coche, sin viario urbano denso): densidad plausible de ~1-3 km de vía por km² → **900 a 2.700 km de carretera** en la zona.
- OSMnx simplifica el grafo colapsando geometría entre intersecciones reales; en zona rural, del orden de un nodo cada 100-300 m de vía → **del orden de 5.000 a 15.000 nodos**, con un número de aristas similar o algo mayor (grafo dirigido: cada tramo de doble sentido son 2 aristas).
- Esto es *pequeño* para cualquier librería de grafos moderna — el reto no es el tamaño del grafo, es el lenguaje de ejecución.

### Dijkstra: ¿120 rutas en menos de 2 s?

- **NetworkX puro** (`nx.dijkstra_path`, `nx.shortest_path`) es Python puro: cada operación de heap cuesta microsegundos, y un solo Dijkstra sobre un grafo de ~10.000 nodos / ~20.000 aristas puede tardar del orden de **cientos de milisegundos**. Hacer 120 de estos secuencialmente en Python puro puede acercarse o superar el presupuesto de 2 s, sobre todo si además hay que reconstruir/filtrar el grafo tras cada movimiento del fuego. **No es seguro que NetworkX puro cumpla el objetivo de <2 s para 120 rutas** — es la parte más floja del plan si no se optimiza.
- **`scipy.sparse.csgraph.dijkstra`** (backend en C, parte de scipy, sin dependencias nuevas si ya usas NumPy/SciPy) puede calcular caminos mínimos desde varios orígenes en una sola llamada vectorizada sobre una matriz de adyacencia dispersa — mucho más rápido que el bucle Python de NetworkX, y es la vía más simple de añadir sin instalar una librería nueva.
- **`igraph`** (backend en C, bindings Python) es la opción más rápida y madura para volumen de vértices como este; conversión desde un `MultiDiGraph` de OSMnx a `igraph` es directa (aristas + pesos).
- Recomendación práctica: **construir y editar el grafo con OSMnx/NetworkX** (es cómodo para manipular geometría, calcular intersección con el polígono del fuego con Shapely, y depurar), pero **ejecutar el Dijkstra/A* masivo con `scipy.sparse.csgraph.dijkstra` o `igraph`**, no con el bucle nativo de NetworkX, si el recuento de 120 rutas cada 30 s empieza a doler en el ensayo.

### Código de ejemplo (recálculo tras mover el polígono del fuego)

```python
import osmnx as ox
import networkx as nx
from shapely.geometry import Polygon, LineString

# 1. Grafo base de la zona (una sola vez, al arrancar el simulador)
bbox = (-6.15, 41.35, -5.75, 41.65)
G = ox.graph.graph_from_bbox(bbox, network_type="drive")

def edges_blocked_by_fire(G, fire_polygon: Polygon):
    """Devuelve la lista de (u, v, key) de aristas que intersecan el polígono del fuego."""
    blocked = []
    for u, v, key, data in G.edges(keys=True, data=True):
        geom = data.get("geometry")
        if geom is None:
            # sin geometría explícita: usar la línea recta entre nodos
            geom = LineString([
                (G.nodes[u]["x"], G.nodes[u]["y"]),
                (G.nodes[v]["x"], G.nodes[v]["y"]),
            ])
        if geom.intersects(fire_polygon):
            blocked.append((u, v, key))
    return blocked

def recompute_routes(G, fire_polygon: Polygon, cut_roads: list[LineString], origins_destinations):
    """Se llama en cada tick del simulador (cada 30 s) con el polígono de fuego actualizado."""
    H = G.copy()  # copia barata (vistas comparten datos; edición no muta G)
    to_remove = edges_blocked_by_fire(H, fire_polygon)
    for road_geom in cut_roads:
        to_remove += edges_blocked_by_fire(H, road_geom.buffer(0.0001))  # tramo cortado como "polígono" fino
    H.remove_edges_from(to_remove)

    routes = {}
    for person_id, (origin_node, dest_node) in origins_destinations.items():
        try:
            routes[person_id] = nx.shortest_path(H, origin_node, dest_node, weight="length")
        except nx.NetworkXNoPath:
            routes[person_id] = None  # persona aislada: caso a escalar (convoy / medios aéreos)
    return routes
```

Para la versión rápida (si 120 llamadas a `nx.shortest_path` no llegan a tiempo), sustituir el bucle final por `scipy.sparse.csgraph.dijkstra` sobre la matriz de adyacencia de `H` (`nx.to_scipy_sparse_array(H, weight="length")`), calculando de una vez los caminos desde cada nodo de origen distinto.

---

## Recomendación para las 36 h

### Plan A: Valhalla autoalojado con `exclude_polygons`

**Por qué**: es el único proveedor de los investigados que expone, de fábrica, en su API pública de request, exactamente lo que pide el enunciado — excluir un polígono arbitrario (el fuego) sin trucos, sin plan de pago, sin reconstruir nada al recalcular. Formato de coordenadas simple (`[lon, lat]`), cierra anillos abiertos por nosotros, y además soporta niveles jerárquicos (`levels`) por si queremos que el fuego bloquee solo vías locales y no la autopista si no la toca de verdad. Es la opción de menor riesgo de "sorpresa a las 3 de la madrugada": la sintaxis ya está confirmada con la doc real, no es un hack de comunidad.

**Riesgo**: hay que montarlo con Docker y esperar el preprocesado de tiles la primera vez (una sola vez, no en cada recálculo). Mitigación: usar un extracto pequeño (provincia, no toda España) para que el preprocesado tarde minutos, no horas.

### Plan B: grafo propio con OSMnx + NetworkX (construcción) / igraph o scipy (cómputo)

**Por qué**: si Valhalla en Docker da guerra en pleno hackathon (problemas de red, de memoria, de tiempo de build de tiles), el grafo propio es la vía de escape total: cero dependencias externas de servicio, control total del modelo de coste, y además **es el motor que necesitamos igualmente para el simulador de evacuación** (capacidad por tramo, convoyes, prioridad de medios). No es solo un "plan B de rutas", es una inversión que se reutiliza en el resto del proyecto (según lo indica el propio enunciado del reto, punto 7: "esta opción... es el motor del simulador de evacuación que queremos").

**Riesgo**: si se implementa con NetworkX puro y sin cuidado, 120 rutas cada 30 s puede no llegar a <2 s (ver cálculo arriba). Mitigación: desde el primer prototipo, hacer el cómputo masivo con `scipy.sparse.csgraph.dijkstra` (viene gratis con NumPy/SciPy, sin librería nueva) en vez del bucle de NetworkX.

### Por qué NO elegimos Openrouteservice/GraphHopper como Plan A pese a que también soportan polígonos

Ambos son técnicamente válidos (`avoid_polygons` en ORS, `custom_model.areas` en GraphHopper), pero: (a) ORS tiene cuotas de API pública sin cifra confirmada — riesgo de quedarnos sin peticiones en pleno demo; self-hosted ORS es viable pero es un servicio Java más pesado de montar que Valhalla en Docker; (b) GraphHopper hospedado gratuito probablemente no permite el modo flexible que necesita `custom_model` dinámico. Los dejamos como **Plan C** (ORS self-hosted primero, si Valhalla falla en seco).

---

## Cómo lo montamos

### Valhalla con Docker sobre un extracto de Castilla y León (Zamora)

```bash
# 1. Extracto OSM de la región (Geofabrik) — confirmado que existe a nivel región,
#    no hay extracto solo-Zamora en Geofabrik, así que descargamos Castilla y León
#    (~170 MB) y lo recortamos a la zona de Zamora con osmium.
mkdir -p custom_files
curl -L -o custom_files/castilla-y-leon-latest.osm.pbf \
  https://download.geofabrik.de/europe/spain/castilla-y-leon-latest.osm.pbf

# 2. (Opcional pero recomendado) recortar a un bbox alrededor de Zamora
#    para que el preprocesado de tiles sea rápido. Requiere osmium-tool
#    (brew install osmium-tool / apt install osmium-tool).
osmium extract --bbox -6.15,41.35,-5.75,41.65 \
  custom_files/castilla-y-leon-latest.osm.pbf \
  -o custom_files/zamora.osm.pbf

# 3. Levantar Valhalla con la imagen oficial (gis-ops/valhalla-scripted),
#    puerto 8002, montando custom_files como volumen.
docker run -dt --name valhalla \
  -p 8002:8002 \
  -v "$PWD/custom_files:/custom_files" \
  ghcr.io/valhalla/valhalla-scripted:latest

# La primera vez construye los tiles (osmium-extract del pbf que ya tenemos
# localmente en /custom_files, luego build de tiles); en un extracto de
# ~30x30 km debería tardar del orden de minutos en un portátil moderno,
# no horas (extracto real de partida ya recortado a un tamaño pequeño).

# 4. Probar exclude_polygons directamente:
curl -s http://localhost:8002/route -d '{
  "locations": [
    {"lat": 41.50, "lon": -5.95},
    {"lat": 41.55, "lon": -5.85}
  ],
  "costing": "auto",
  "exclude_polygons": [[
    [-5.92, 41.51], [-5.90, 41.51], [-5.90, 41.53], [-5.92, 41.53], [-5.92, 41.51]
  ]]
}' | jq .
```

Notas de la imagen Docker (confirmadas por fetch al `docker/README.md` del repo `valhalla/valhalla`):
- Puerto expuesto: `8002:8002` (host:contenedor).
- Variable `tile_urls`: si se prefiere que el propio contenedor descargue el `.pbf` (en vez de montarlo ya descargado), acepta una o varias URLs separadas por espacio.
- `use_tiles_ignore_pbf` (default `True`): reutiliza tiles ya construidos si existen, para no reconstruir en cada `docker restart`.
- `force_rebuild` (default `False`): fuerza reconstrucción si cambiamos el `.pbf`.
- Tras añadir/cambiar el `.pbf`, `docker restart valhalla` reconstruye tiles si `force_rebuild=True` o si no hay tiles previos.

### Grafo propio (Plan B) — arranque rápido

```bash
pip install osmnx networkx scipy shapely
```

```python
import osmnx as ox

bbox = (-6.15, 41.35, -5.75, 41.65)  # (west, south, east, north) -- OSMnx 2.x
G = ox.graph.graph_from_bbox(bbox, network_type="drive")
ox.io.save_graphml(G, "zamora_drive.graphml")  # cachear: no re-descargar en cada demo
print(G.number_of_nodes(), G.number_of_edges())
```

Cachear el `.graphml` en el repo (o en un fichero fuera de git si pesa mucho) para no depender de la Overpass API de OSM en pleno demo — la API pública de Overpass puede estar lenta o dar rate-limit justo cuando más lo necesitamos.

---

## Qué se le dice al jurado sobre por qué no usamos Google

"Evaluamos Google Maps Platform primero, porque HappyRobot ya trae un nodo de Google Maps integrado en el workflow. Confirmamos contra la documentación oficial de la Routes API (`RouteModifiers`: `avoidTolls`, `avoidHighways`, `avoidFerries`, `avoidIndoor`, `avoidTunnels`) que Google **no permite excluir un área o polígono arbitrario de la ruta** — solo categorías predefinidas de vía. Para un sistema que tiene que garantizar que una ruta de evacuación no cruza el polígono de un incendio, eso no es aceptable: el único 'truco' disponible (forzar waypoints intermedios) es un hack de comunidad sin garantía dura de que la ruta no vuelva a cruzar la zona si esa es la carretera más corta. Decidimos que la seguridad de la ruta no puede depender de un hack no soportado por el proveedor.

Por eso construimos el motor de rutas sobre Valhalla (open source, autoalojado), que expone `exclude_polygons` como parámetro de primera clase: cada vez que el fuego se mueve, mandamos el polígono actualizado y Valhalla nos da una ruta que garantiza no cruzarlo — sin necesidad de reconstruir ningún índice ni reiniciar ningún servicio. Mantenemos el nodo de Google Maps de HappyRobot solo para lo que hace bien y sin ambigüedad: dar una distancia o un ETA de apoyo, nunca como fuente de verdad de la ruta de evacuación."

---

## Fuentes consultadas (fetch directo, no memoria)

- Google Routes API, `RouteModifiers`: https://developers.google.com/maps/documentation/routes/reference/rest/v2/RouteModifiers
- Google Maps Platform, precios: https://developers.google.com/maps/billing-and-pricing/pricing
- OSRM, API v5.24.0: http://project-osrm.org/docs/v5.24.0/api/#route-service
- Valhalla, API reference (`exclude_polygons`, `exclude_locations`, hard exclusions): https://valhalla.github.io/valhalla/api/route/api-reference/
- Valhalla, imagen Docker oficial: https://github.com/valhalla/valhalla/blob/master/docker/README.md
- GraphHopper, custom models: https://github.com/graphhopper/graphhopper/blob/master/docs/core/custom-models.md
- GraphHopper, precios/planes: https://www.graphhopper.com/pricing/
- Openrouteservice, opciones de Directions (`avoid_polygons`, `avoid_features`, `avoid_borders`): https://giscience.github.io/openrouteservice/api-reference/endpoints/directions/routing-options/
- Mapbox Directions API, parámetro `exclude`: https://docs.mapbox.com/api/navigation/directions/
- OSMnx, referencia de usuario (`graph_from_bbox`, `graph_from_place`): https://osmnx.readthedocs.io/en/stable/user-reference.html
- Geofabrik, extracto de Castilla y León: https://download.geofabrik.de/europe/spain/castilla-y-leon-latest.osm.pbf
