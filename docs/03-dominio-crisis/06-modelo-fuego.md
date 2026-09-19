# Modelo de propagación del fuego — investigación para el motor de escenario

> Investigación de apoyo a `docs/06-producto/03-contrato-de-datos.md` (campos `Fire.spread_rate_mh`, `Fire.head_bearing_deg`,
> `Fire.cone_half_angle_deg`, `Person.minutes_to_front`) y a `docs/06-producto/02-escenario-incendio.md` (sección 3,
> "orden de la cola"; backlog B1-B4). No sustituye el contrato: lo explica y le da fuente.
>
> Regla seguida en todo el documento: **fórmula con unidades y con fuente, o se dice explícitamente que
> no se ha podido verificar**. Fuente principal verificada de primera mano: Finney, M.A. (1998, revisado
> 2004). *FARSITE: Fire Area Simulator — Model Development and Evaluation.* USDA Forest Service, Rocky
> Mountain Research Station, Res. Pap. RMRS-RP-4. PDF leído completo en
> `research.fs.usda.gov/download/treesearch/4617.pdf` (descargado y verificado en esta sesión).

---

## 1. El modelo de Rothermel (1972) — el modelo serio del que nos inspiramos

Richard Rothermel publicó en 1972 (*"A mathematical model for predicting fire spread in wildland
fuels"*, USDA Forest Service Res. Pap. INT-115) la ecuación que sigue siendo, medio siglo después, el
núcleo de las herramientas oficiales de EE.UU.: **BEHAVE/BehavePlus** (calculadora punto a punto),
**FARSITE** (propagación 2D del frente) y **FlamMap** (mapas de comportamiento potencial sobre un
paisaje). La confirmación de que sigue siendo el motor interno de FARSITE está en la propia fuente
verificada (Finney 2004, ec. [18], p. 8):

```
R = (I_r · ξ · (1 + Φw + Φs)) / (ρb · ε · Qig)
```

`R` = tasa de propagación en régimen estacionario (m/min), `I_r` = intensidad de reacción, `ξ` = número
de propagación sin dimensiones, `ρb` = densidad aparente del combustible, `ε` = número de calentamiento
efectivo, `Qig` = calor de ignición. `Φw` y `Φs` son los coeficientes de viento y pendiente (Finney 2004,
ec. [11]-[12], citando Rothermel 1972 y Wilson 1980):

```
Φs = 5.275 · β^(-0.3) · tan(φ)²
Φw = C · (3.281·U)^B · (β/β_op)^(-E)
```

`β` = razón de empaquetamiento del lecho de combustible, `φ` = pendiente (radianes), `U` = viento a
altura de llama media (m/s), y `C`, `B`, `E` son coeficientes que dependen del tamaño de partícula del
combustible (Burgan 1987; Rothermel 1972).

**Por qué es demasiado para nosotras en 36 h** (no es una opinión, son las entradas reales del modelo):

| Entrada | Qué exige | Por qué no la tenemos a tiempo |
|---|---|---|
| Modelo de combustible | Uno de los 13 modelos estándar NFFL/Anderson (o los 40 de Scott & Burgan 2005) — cada uno define carga de combustible por clase de tamaño, razón superficie/volumen, profundidad del lecho, contenido calorífico, humedad de extinción | Necesitaríamos un mapa de combustibles de la zona (no existe uno público y calibrado en abierto para España al nivel de detalle que usa BEHAVE) |
| Humedad del combustible | Por clase de tamaño: muerto de 1h/10h/100h, vivo herbáceo y vivo leñoso | Se deriva de estaciones meteo + modelos de humedad (NFDRS), no de un webhook de viento |
| Pendiente | Grados o tangente al cuadrado, por celda del terreno | Necesitaríamos un DEM de la zona y calcularla célula a célula |
| Viento | A altura de llama media (`midflame`), no el viento de estación — hay que reducirlo (Albini & Baughman 1979) | Otra capa de corrección que el motor de escenario no necesita para el objetivo del reto |

En una frase para el pitch: *Rothermel calcula cuánto arde, con qué combustible y con qué pendiente,
celda a celda. Nosotros no necesitamos ese nivel: necesitamos hacia dónde y con qué prioridad se mueve
la gente. Por eso tomamos prestada la idea de propagación (la elipse de Huygens que motores como
FARSITE construyen encima de Rothermel) y simplificamos la tasa de avance a un solo número de entrada.*

---

## 2. La elipse de Huygens / modelo elíptico (Richards 1990, Anderson 1983) — fórmulas verificadas

### 2.1 La idea (Huygens' Principle aplicado a incendios)

FARSITE y Prometheus (el modelo canadiense equivalente, Tymstra et al. 2009) no calculan Rothermel una
sola vez para todo el incendio: lo calculan en cada vértice del polígono del frente, y hacen crecer
cada vértice como el foco de una **elipse diminuta** ("wavelet") orientada según el viento/pendiente
local. La envolvente de todas esas elipses diminutas, avanzando cada intervalo de tiempo, es la
propagación del principio de Huygens (Anderson et al. 1982 introdujeron el término en la literatura del
fuego; Richards 1990 lo formalizó con ecuaciones diferenciales que FARSITE usa literalmente — Finney
2004, p. 2-4).

En la elipse, el punto de ignición se asume coincidente con el **foco trasero** (Alexander 1985; Bratten
1978). Esto es clave: la tasa de cabeza, flanco y cola que la gente cita **se mide desde ese foco**, no
desde el centro de la elipse.

### 2.2 Razón longitud/anchura (Length-to-Breadth, LB) — Anderson (1983)

Verificado literalmente en Finney (2004), ecuación [13], p. 7:

```
LB = 0.936·e^(0.2566·U) + 0.461·e^(-0.1548·U) − 0.397
```

**Unidades — verificadas, no supuestas**: en el párrafo inmediatamente anterior a la ecuación (p. 7),
Finney define explícitamente *"the fire shape was computed at each vertex using the 'effective'
midflame windspeed (U m s⁻¹)"*. Es decir, **en la implementación de FARSITE, U va en m/s**. El propio
Finney explica por qué se resta la constante 0.397: la ecuación original de Anderson (1983) da LB=0.936
+0.461=1.397 con viento cero, y se le resta 0.397 para forzar LB=1.0 (círculo perfecto) sin viento, que
es la condición física correcta.

**Aviso honesto sobre unidades**: distintas fuentes secundarias que citan esta misma fórmula (herramientas
de terceros, plugins GIS) la aplican con U en mph en vez de m/s — es una confusión real y documentada en
la propia literatura del fuego (el propio Finney dedica un párrafo a decir que "un número de formulaciones
empíricas... producen formas distintas para el mismo viento", p. 7). Para el hackathon, **fijamos U en
m/s** porque es lo que dice la fuente primaria que hemos leído completa. Si el equipo usa esta fórmula,
debe convertir `wind.speed_kmh / 3.6` antes de aplicarla.

Finney también documenta dos salvaguardas prácticas que conviene copiar: (1) LB con esta fórmula puede
dar excentricidades poco realistas con vientos muy fuertes, así que **se trunca LB a un máximo de 8**
(límite empírico de los datos de Alexander 1985); (2) por debajo de U=0, LB=1 (círculo).

### 2.3 De LB a las tasas de cabeza, flanco y cola

Razón cabeza/cola (head-to-back, HB), asumiendo el foco trasero = punto de ignición (Finney 2004,
ec. [14]):

```
HB = (LB + √(LB² − 1)) / (LB − √(LB² − 1))
```

Semiejes de la elipse en unidades de tasa de propagación (m/min), a partir de la tasa de cabeza `R`
(Finney 2004, ec. [15]-[17]):

```
a = 0.5·(R + R/HB) / LB      # semieje menor (lateral, medido desde el CENTRO)
b = (R + R/HB) / 2.0         # semieje mayor (medido desde el CENTRO)
c = b − R/HB                 # distancia del centro al foco (= al punto de ignición)
```

De aquí:
- **Tasa de cola** (backing rate) = `R / HB`.
- **Tasa de flanco medida desde el foco** (la definición físicamente correcta, la que usa la geometría
  real de la elipse): `R_flanco = a² / b` (semi-latus rectum de la elipse vista desde el foco).
- **Aproximación de flanco muy usada en la práctica** (Forestry Canada Fire Danger Group 1992, sistema
  canadiense FBP — medida desde el CENTRO, no desde el foco, pero mucho más simple de programar):
  `R_flanco ≈ (R + R/HB) / (2·LB) = a`.

**Hallazgo importante que hay que admitir**: hicimos el cálculo numérico con estas fórmulas para varios
vientos y **la elipse real de Anderson/Richards no reproduce exactamente el reparto "cabeza 100% /
flanco 35% / cola 10%"** que ya fijamos en `../06-producto/03-contrato-de-datos.md`. Con LB=1.7 (viento moderado-fuerte,
U≈4-5 m/s) sale cola≈10.6% (encaja) pero flanco real (foco)≈19% (no 35%); con LB=3 (viento fuerte) sale
flanco≈6% y cola≈3% (los dos muy por debajo de 35%/10%). La razón física es que en una elipse real, si
la cola es baja (10%), el flanco tiende a ser todavía más bajo, no al 35% — los dos porcentajes están
ligados por un único parámetro (LB) y no se pueden fijar de forma independiente como hace nuestro
contrato. Esto no invalida el contrato: es una simplificación deliberada, y hay que decirlo así si
alguien pregunta (ver sección "qué hemos simplificado").

---

## 3. Velocidades de avance reales

Cifras verificadas de fuente general (artículo "Wildfire", en.wikipedia.org, consultado en esta sesión,
que a su vez cita literatura de comportamiento del fuego en EE.UU./Australia):

- **Bosque (forest)**: hasta **10.8 km/h** en condiciones de "forward rate of spread" (FROS).
- **Pastizal (grassland)**: hasta **22 km/h** — el combustible de pasto es, en efecto, el más rápido,
  confirmando lo que pedía la tarea.
- Como referencia de un incendio extremo real: en el incendio de Kilmore East (parte de los **Black
  Saturday bushfires**, Australia, 2009 — verificado en Wikipedia, artículo "Black Saturday bushfires"),
  el frente **recorrió 50 km hacia el sureste** empujado por viento de **125 km/h**, con alturas de
  llama de al menos 100 m.

**Sobre incendios españoles concretos (Sierra de la Culebra 2022, incendios de 2025)**: intenté verificar
cifras de velocidad de avance en km/h específicas de estos incendios y **no conseguí una fuente que las
diera de forma explícita y verificable en esta sesión** (los intentos de acceso a Wikipedia en español
dieron error 404 con los títulos probados, y las búsquedas web devolvieron resultados no relevantes o
bloqueados por CAPTCHA/consentimiento). Lo que sí es de dominio público y no controvertido: el incendio
de Sierra de la Culebra (Zamora, junio 2022) quemó del orden de 30 000 ha en condiciones de ola de calor
y viento fuerte, y causó víctimas mortales entre quienes intentaban huir; pero **no puedo citar aquí una
cifra de km/h de ese incendio concreto sin inventarla**. Recomiendo verificarlo antes del pitch (está
además ya anotado como pendiente en `docs/06-producto/02-escenario-incendio.md` sección 13) contra fuentes como el
informe técnico de la Junta de Castilla y León o el "Estudio del comportamiento del fuego" del CIFOR-INIA.

**Rango defendible para `spread_rate_mh` en el motor de escenario**, construido a partir de las cifras
que sí están verificadas arriba (Wikipedia "Wildfire") y de órdenes de magnitud estándar de la literatura
de comportamiento del fuego (BEHAVE/Rothermel, matorral y pinar mediterráneo bajo viento fuerte y baja
humedad — este tramo es de dominio general del comportamiento del fuego, no de una fuente puntual
verificada hoy):

| Combustible | Rango orientativo | Fuente |
|---|---|---|
| Pastizal/rastrojo, viento fuerte | 1200 – 2200 m/h (1.2–2.2 km/h... **corregido**: la cifra de Wikipedia es 22 km/h = **22 000 m/h** en el extremo alto) | Wikipedia "Wildfire" (verificado) |
| Matorral mediterráneo (jara, tomillo, retama) | 500 – 1500 m/h | Orden de magnitud general de comportamiento del fuego mediterráneo — no verificado hoy con una fuente puntual |
| Pinar con sotobosque, pendiente y viento fuerte | 800 – 2000 m/h, picos muy superiores en corridas de copa | Orden de magnitud general — no verificado hoy |
| Corrida extrema tipo Sierra de la Culebra / Black Saturday | 5000 – 10000+ m/h en el frente de cabeza durante minutos/horas puntuales | Extrapolado de Black Saturday (50 km en varias horas de corrida activa, tramos puntuales mucho más rápidos) — orden de magnitud, no cifra oficial |

Para el hackathon: **usar 1500–3000 m/h como valor base del escenario, y subirlo a 5000-8000 m/h en el
evento de "giro de viento / corrida" del motor de escenario** es defendible con las fuentes de arriba y
da un rango dramático y creíble para la demo.

---

## 4. Incendios de sexta generación / pirocumulonimbos

**Verificado** (artículo "Pyrocumulonimbus", en.wikipedia.org, consultado en esta sesión): un pyroCb es
una nube cumulonimbus que se forma sobre una fuente de calor (incendio, erupción volcánica, explosión
nuclear), alcanza la tropopausa o incluso la baja estratosfera, y puede generar **granizo, rayos, vientos
extremos de nivel bajo y, en algunos casos, tornados**. La combinación de estos efectos "puede causar un
aumento drástico de la propagación del fuego y peligros directos en tierra además de los del incendio
'normal'" (traducción del artículo).

Casos documentados en el mismo artículo que sirven de ejemplo dramático para el pitch:
- **Columbia Británica, 2021**: 710 117 rayos registrados en 15 horas, generados por la propia actividad
  pirocumulonimbo, alimentando propagación errática.
- **Incendios de Francia, 2026**: nubes pyroCb generaron rayos que iniciaron incendios adicionales — la
  primera vez que se observó ese fenómeno en el país.
- **Bootleg Fire (EE.UU., 2021)**: la nube pyroCb alcanzó casi 45 000 pies, generando su propio rayo y
  lluvia, retroalimentando el ciclo de ignición.
- **Canberra 2003**: primer tornado de fuego confirmado como violento (F3).

**El término "sexta generación"** en sí (muy usado en literatura española/catalana, asociado habitualmente
a Marc Castellnou y al grupo GRAF de bomberos de la Generalitat de Catalunya / Pau Costa Foundation) **no
lo encontré en las fuentes en inglés consultadas hoy**, y las búsquedas específicas para citas textuales
de Castellnou fueron bloqueadas por CAPTCHA/consentimiento del buscador en esta sesión — no pude
verificar una cita literal suya. Lo que sí puedo afirmar con la fuente verificada de pyroCb es el
argumento de fondo, que es el que nos interesa para el pitch:

**Argumento para el pitch (con la fuente que sí tenemos)**: un incendio que genera su propia nube de
tormenta, sus propios rayos y sus propios vientos de más de 100 km/h (documentado en Black Saturday,
verificado) **deja de ser predecible por un plan trazado con antelación**. Cualquier plan de evacuación
fijo escrito a las 17:00 puede quedar invalidado a las 17:20 porque el propio incendio cambió las reglas
del terreno. Esto refuerza directamente el argumento de nuestro sistema: **el plan tiene que recalcularse
en vivo, no reescribirse desde cero cada vez** — es literalmente la sección 6 del escenario
("Cambio de escenario") y el criterio "Adaptación" de la rúbrica.

**Recomendación honesta**: si el equipo quiere citar a Castellnou textualmente en el pitch, hay que
verificarlo antes (entrevistas en RTVE, El País o La Vanguardia sobre los incendios de 2022 y 2023 son el
sitio más probable) — no lo incluyo aquí sin fuente confirmada.

---

## 5. Spotting / focos secundarios

**Verificado** (artículo "Wildfire", en.wikipedia.org): el spotting es el salto de pavesas y otros
materiales incandescentes por el aire, por delante del frente principal, salvando carreteras, ríos y
otras barreras. Cifra concreta y documentada en la misma fuente: **"spot fires are known to occur as far
as 20 kilometres (12 mi) from the fire front"** en incendios australianos (bushfires) — es decir, hasta
**20 km por delante del frente** en condiciones extremas.

Esto es, tal como pedía la tarea, el evento más dramático y más barato de implementar para el motor de
escenario: un evento `spot_fire` que crea un polígono de fuego nuevo (pequeño) a una distancia aleatoria
por delante del cono de avance (por ejemplo 500 m–3 km para un escenario "normal" con viento fuerte, y
hasta 20 km como caso extremo puntual con la fuente de arriba), **detrás de gente que ya iba de camino a
una salida que ahora queda cortada**. Encaja exactamente con la mecánica de `RoadClosure` y
`SafeZone.status = "threatened"` que ya existen en el contrato.

---

## 6. Umbrales de evacuación y "trigger buffers" — la literatura que sostiene la feature B2

**Verificado vía Semantic Scholar (API consultada en esta sesión, bibliografía real, no inventada)**:
existe una línea de investigación académica completa sobre exactamente esto, con Thomas Cova (Univ. of
Utah) y Philip Dennison como autores centrales:

1. Cova, T., Dennison, P., Kim, T.H., Moritz, M.A. (2005). **"Setting Wildfire Evacuation Trigger Points
   Using Fire Spread Modeling and GIS."** *Transactions in GIS*, 9(4).
2. Larsen, J.C., Dennison, P., Cova, T., Jones, C. (2011). **"Evaluating dynamic wildfire evacuation
   trigger buffers using the 2003 Cedar Fire."**
3. Li, D., Cova, T., Dennison, P. (2015). **"Integrating fire-spread and household-level trigger modeling
   to stage wildfire evacuation warnings"** y **"A household-level approach to staging wildfire
   evacuation warnings using trigger modeling"** (*Computers, Environment and Urban Systems*).
4. Li, D., Cova, T., Dennison, P. (2017). **"Using reverse geocoding to identify prominent wildfire
   evacuation trigger points."**
5. Li, D., Cova, T., Dennison, P. (2018). **"Setting Wildfire Evacuation Triggers by Coupling Fire and
   Traffic Simulation Models: A Spatiotemporal GIS Approach"** (*Fire Technology*).

No conseguí recuperar el abstract completo de estos papers en esta sesión (la API de Semantic Scholar
empezó a devolver 429 "too many requests" tras la primera consulta), así que no puedo citar frases
textuales — pero **los títulos, años, autores y venues están verificados** y son exactamente la línea de
investigación que la tarea pedía encontrar.

**El concepto, tal como lo usa esta literatura** (de dominio general del campo, coherente con los
títulos verificados): un **trigger point / trigger buffer** es un umbral espacio-temporal calculado a
partir del modelo de propagación del fuego y del tiempo de evacuación necesario (tiempo de preparación +
tiempo de viaje hasta la zona segura), de forma que cuando el fuego alcanza ese umbral, la orden de
evacuación ya debería haberse dado — si no, ya es tarde. La fórmula conceptual es:

```
trigger_distance = spread_rate_efectiva × evacuation_time_needed
```

y el "trigger buffer" es literalmente la zona geográfica (o el instante) donde `distancia_al_frente ==
trigger_distance`. **Esto es exactamente nuestro campo `minutes_to_front` y la feature B2 del backlog
("hora de caducidad de cada decisión")**: si `minutes_to_front - tiempo_necesario_para_actuar <= 0`, esa
decisión ha caducado. Podemos citar esta línea de investigación en el pitch como el respaldo académico
de la feature B2 — es, literalmente, lo mismo que el mundo académico lleva 20 años llamando "trigger
buffer", aplicado aquí a nivel de persona/casa en vez de a nivel de zona.

---

## 7. Refugio en el sitio (shelter in place) vs evacuar

**Parcialmente verificado**: el artículo de Wikipedia sobre Black Saturday (2009) confirma el contexto
(comisión real liderada por el juez Bernard Teague, establecida para examinar la estrategia estatal
contra incendios) pero **no detalla los criterios de la política "Prepare, Stay and Defend, or Leave
Early"** en el contenido que pude extraer, así que no puedo citar su definición formal con fuente
verificada hoy.

Lo que es de conocimiento general y ampliamente documentado en gestión de emergencias por incendios
(sin cita puntual verificada en esta sesión, pero no controvertido): tras Black Saturday (173 muertos,
muchos de ellos habiendo decidido "quedarse y defender"), Australia revisó su política de "stay or go"
porque se vio que mucha gente se quedó en casas que resultaron indefendibles, o decidió tarde evacuar
cuando ya era demasiado peligroso salir a la carretera. Los criterios que suele citar la literatura de
gestión de emergencias para decidir refugio-en-el-sitio en vez de evacuar son, en esencia:

- La vivienda está preparada (defendible: vegetación despejada, sin materiales inflamables junto a
  fachadas, agua y equipo disponible) — sin preparación, refugiarse es más peligroso que salir.
- El incendio que se aproxima es de intensidad moderada (fuego de superficie, no corrida de copa ni
  comportamiento de sexta generación/pyroCb) y de paso rápido (el frente pasa y se aleja en minutos).
- Ya no hay tiempo material para llegar a una ruta de evacuación segura sin cruzar el frente — este es
  el caso más relevante para nuestro sistema: si `minutes_to_front` de una persona es menor que el
  tiempo estimado de su ruta hasta la salida asignada, salir es más peligroso que quedarse, y el
  sistema debería poder decir "no salgas, quédate" en vez de mandarla a una carretera que el fuego
  cruzará antes de que llegue.
- Hay un refugio designado cercano y accesible (nave, polideportivo con muros resistentes) sin cruzar el
  frente.

**Para el pitch, esto se puede formular sin necesidad de citar la política australiana con precisión**:
la propia lógica de `minutes_to_front` (persona) vs `patrol_eta_min` / duración de ruta ya calculada en
el contrato es la comparación que decide entre evacuar y refugiarse — es una extensión natural y barata
de implementar del mismo dato que ya existe, y conecta con el criterio "Decisión sin datos completos" de
la rúbrica.

---

## 8. Datos abiertos utilizables

| Fuente | Qué da | API pública | Tiempo real |
|---|---|---|---|
| **AEMET OpenData** (`opendata.aemet.es`) | Predicción, observación (viento entre otras variables), avisos meteorológicos | **Sí**, REST, gratuita — verificado que existe el portal `opendata.aemet.es` y que ofrece acceso programático ("permite incluir los datos de AEMET en sus propios sistemas de información"). No pude verificar en esta sesión el flujo exacto de alta de API key ni el endpoint concreto de viento/avisos — recomendado comprobar en el propio portal antes de integrarlo. | El portal habla de interacción "periódica e incluso programada"; no confirmé la latencia exacta. |
| **NASA FIRMS** (`firms.modaps.eosdis.nasa.gov`) | Focos de calor activos (hotspots) por satélite | Sí — verificado: mapa interactivo, descargas SHP/KML/TXT, servicios WMS, "Web Services" mencionados explícitamente. Documentación técnica de endpoints no verificada hoy en detalle. | **Verificado literalmente en la fuente**: "Globally these data are available within 3 hours of satellite observation, but for the US and Canada active fire detections are available in real-time." Sensores: VIIRS (S-NPP, NOAA-20, NOAA-21) y MODIS (Aqua, Terra). |
| **EFFIS** (`forest-fire.emergency.copernicus.eu`, antiguo `effis.jrc.ec.europa.eu` — redirige) | Área quemada (mapeada y estimada, "Daily updated" — verificado), visor de situación actual, visor de riesgo de incendio, estadísticas por país | Existe una sección "Data and services" y un "Data Request Form" para totales por país — no pude verificar en esta sesión si hay WMS/WFS/API programática de detalle (foco activo por foco activo) accesible sin trámite. | Área quemada: actualización diaria (verificado). Otras capas: no verificado. |
| **Copernicus EMS Rapid Mapping** (`mapping.emergency.copernicus.eu`) | Delineación de perímetros/daños vía satélite en emergencias activadas | **Verificado**: "Only Authorised Users can request activations" — no es autoservicio, hay que solicitar activación. Entrega reciente en formato Geopackage (mencionado en la web). Sin API pública confirmada. | No verificado el plazo típico en esta sesión; en la práctica del servicio (dominio general, no confirmado hoy) suele ir de horas a 1-2 días tras activación. |

**Para la demo**: FIRMS es la única de las cuatro con API/latencia claramente verificada y gratuita —
sirve bien como "fuente real" para pintar hotspots reales de fondo en el dashboard como contraste con el
polígono sintético del motor de escenario, y es defendible en el pitch sin exagerar ("los focos de calor
de fondo son NASA FIRMS de verdad; el polígono que crece y mata gente en la demo es sintético porque
necesitamos que avance rápido para la demo de 3 minutos"). EFFIS y Copernicus EMS son mejores para citar
como "esto es lo que Protección Civil usaría en producción" (B3, replay del incendio real) que para
integrar en vivo el día de la demo — requieren activación/trámite que no encaja en 36 h.

---

## (a) Modelo recomendado para las 36 h

**Decisión**: no implementar Rothermel ni la propagación vértice-a-vértice completa de Richards (que
necesita pendiente local, aspecto, y viento por vértice — ecuaciones [1]-[10] de Finney 2004). Implementar
una versión honesta y simplificada del **principio de Huygens con reparto anisótropo fijo**, que:

1. Usa el `head_bearing_deg` y `spread_rate_mh` que YA existen en el contrato (no dependen de fórmulas
   nuevas — el motor de escenario los fija directamente, como ya está diseñado).
2. Sustituye la elipse literal de Anderson/Richards por una **curva coseno de dos armónicos** que pasa
   exactamente por los tres puntos ya fijados en el contrato (cabeza=100%, flanco=35%, cola=10%), en vez
   de por una tabla con saltos (más simple de razonar y de defender ante el jurado que un `if/elif`):

   Resolviendo `A + B·cos(θ) + C·cos(2θ)` para que pase por `θ=0°→1.00`, `θ=90°→0.35`, `θ=180°→0.10`:

   ```
   rate_factor(θ) = 0.45 + 0.45·cos(θ) + 0.10·cos(2θ)      # θ en radianes, 0=cabeza, π=cola
   ```

   Es monótona decreciente de cabeza a cola (sin baches: comprobado analíticamente,
   `d/dθ = −sin(θ)·(0.45 + 0.40·cos θ)`, y el paréntesis nunca se anula en `[0°,180°]`), y con un solo
   `cos`/`cos` es más barata que un elíptico completo.

3. Hace crecer el polígono moviendo cada vértice hacia fuera desde el centroide del polígono actual
   (aproximación deliberada del "frente normal local" que usa Huygens de verdad — ver limitaciones abajo).

```python
import math

def _bearing_deg(from_pt, to_pt):
    """Rumbo inicial from_pt -> to_pt, en grados [0,360). from_pt/to_pt = (lon, lat)."""
    lon1, lat1 = map(math.radians, from_pt)
    lon2, lat2 = map(math.radians, to_pt)
    dlon = lon2 - lon1
    y = math.sin(dlon) * math.cos(lat2)
    x = math.cos(lat1) * math.sin(lat2) - math.sin(lat1) * math.cos(lat2) * math.cos(dlon)
    return (math.degrees(math.atan2(y, x)) + 360) % 360

def _destination_point(pt, bearing_deg, distance_m, R_EARTH=6371000.0):
    """Punto a distance_m desde pt en dirección bearing_deg (fórmula geodésica esférica directa)."""
    lon1, lat1 = map(math.radians, pt)
    brng = math.radians(bearing_deg)
    d_r = distance_m / R_EARTH
    lat2 = math.asin(math.sin(lat1) * math.cos(d_r) + math.cos(lat1) * math.sin(d_r) * math.cos(brng))
    lon2 = lon1 + math.atan2(
        math.sin(brng) * math.sin(d_r) * math.cos(lat1),
        math.cos(d_r) - math.sin(lat1) * math.sin(lat2),
    )
    return (math.degrees(lon2), math.degrees(lat2))

def _angle_from_head(bearing_deg, head_bearing_deg):
    """Diferencia angular normalizada a [0,180]. 0=cabeza, 180=cola."""
    diff = abs(bearing_deg - head_bearing_deg) % 360
    return 360 - diff if diff > 180 else diff

def rate_factor(angle_deg):
    """Fracción de spread_rate_mh según el ángulo respecto a la cabeza (contrato: 100/35/10)."""
    theta = math.radians(angle_deg)
    return 0.45 + 0.45 * math.cos(theta) + 0.10 * math.cos(2 * theta)

def grow_perimeter(polygon, fire, dt_hours):
    """
    polygon: lista de (lon, lat) del anillo exterior (GeoJSON Polygon, un solo anillo, sin agujeros).
    fire: objeto con spread_rate_mh (m/h) y head_bearing_deg (grados), del contrato de datos.
    dt_hours: paso de tiempo en horas (p. ej. 5 s de tick -> 5/3600).
    Devuelve: nueva lista de (lon, lat).

    SIMPLIFICACIÓN ADMITIDA: mueve cada vértice a lo largo del rumbo centroide->vértice, no a lo largo
    de la normal local real del frente (Huygens estricto). Es válido mientras el polígono se mantenga
    razonablemente convexo/estrellado respecto al centroide; con winds que giran mucho o formas muy
    cóncavas puede autointersecarse. Mitigación barata: aplicar polygon.convex_hull o un buffer(0) de
    shapely cada pocos pasos.
    """
    cx = sum(p[0] for p in polygon) / len(polygon)
    cy = sum(p[1] for p in polygon) / len(polygon)
    centroid = (cx, cy)

    new_polygon = []
    for vertex in polygon:
        bearing = _bearing_deg(centroid, vertex)
        theta = _angle_from_head(bearing, fire.head_bearing_deg)
        eff_rate_mh = fire.spread_rate_mh * rate_factor(theta)
        dist_m = eff_rate_mh * dt_hours
        new_polygon.append(_destination_point(vertex, bearing, dist_m))
    return new_polygon

def minutes_to_front(person, fire, polygon):
    """
    person: objeto con lon, lat.
    fire: objeto con spread_rate_mh (m/h) y head_bearing_deg (grados).
    polygon: perímetro actual (lista de (lon,lat)), para hallar el punto más cercano del borde.

    Usa la MISMA rate_factor que grow_perimeter, así la persona ve exactamente lo que el motor
    de escenario está a punto de dibujar (invariante importante: coherencia entre las dos funciones).
    """
    # Punto más cercano del perímetro a la persona (en producción: shapely.ops.nearest_points
    # sobre un shapely.geometry.Polygon real, con distancia geodésica o proyectada).
    nearest = min(polygon, key=lambda v: _haversine_m(v, (person.lon, person.lat)))
    dist_m = _haversine_m(nearest, (person.lon, person.lat))

    bearing = _bearing_deg(nearest, (person.lon, person.lat))
    theta = _angle_from_head(bearing, fire.head_bearing_deg)
    eff_rate_mh = fire.spread_rate_mh * rate_factor(theta)

    if eff_rate_mh <= 0:
        return None  # con esta rate_factor nunca es <=0 (mínimo ~0.10*rate), pero se guarda por seguridad
    hours = dist_m / eff_rate_mh
    return hours * 60.0

def _haversine_m(p1, p2, R_EARTH=6371000.0):
    lon1, lat1 = map(math.radians, p1)
    lon2, lat2 = map(math.radians, p2)
    dlon, dlat = lon2 - lon1, lat2 - lat1
    a = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 2 * R_EARTH * math.asin(math.sqrt(a))
```

**Upgrade opcional si queda tiempo** (sube el criterio "Cómo decide" con algo defendible ante un
bombero): sustituir el `rate_factor` fijo por uno derivado del viento real usando Anderson/Richards
(sección 2), es decir calcular `LB` a partir de `wind.speed_kmh/3.6` (m/s) con la ecuación [13], `HB` con
la [14], y usar la fórmula focal `a²/b` para el flanco real en vez de 35% fijo. Esto es más realista pero
cambia los porcentajes actuales del contrato (ver hallazgo de la sección 2.3) — si se hace, hay que
actualizar `../06-producto/03-contrato-de-datos.md` en el mismo commit (regla 1 del propio contrato).

---

## (b) Qué podemos decir en el pitch y con qué fuente

| Afirmación | Fuente | Nivel de certeza |
|---|---|---|
| "Nos inspiramos en el modelo de Rothermel (1972), el mismo que usan BEHAVE, FARSITE y FlamMap, pero lo simplificamos porque necesitaríamos un mapa de combustibles y humedad que no existe en abierto para España en 36 h" | Finney 2004, RMRS-RP-4 (leído completo) | Alta |
| "La forma elíptica de un incendio con viento no es un capricho nuestro: es el modelo estándar de FARSITE desde los 90 (Richards 1990, Anderson 1983), con fórmulas publicadas y coeficientes exactos" | Finney 2004, ecs. [13]-[17] (leído completo) | Alta |
| "El pasto es el combustible que más rápido arde: hasta 22 km/h documentados, frente a ~11 km/h en bosque" | Wikipedia "Wildfire" (consultado hoy) | Alta para el dato puntual; fuente de divulgación, no paper primario |
| "En incendios extremos las pavesas saltan hasta 20 km por delante del frente" | Wikipedia "Wildfire" (consultado hoy) | Alta para el dato puntual; fuente de divulgación |
| "Un incendio puede generar su propia nube de tormenta (pirocumulonimbo), con rayos y vientos de más de 100 km/h — el plan de hace 20 minutos deja de valer literalmente porque el incendio cambió el tiempo atmosférico" | Wikipedia "Pyrocumulonimbus" + Black Saturday (viento 125 km/h, 50 km de corrida) — ambos consultados hoy | Alta para los datos citados; sin cita textual de un experto español verificada hoy |
| "Nuestra feature de 'hora de caducidad de la decisión' no es una idea nuestra suelta: hay 20 años de investigación académica en 'trigger buffers' para evacuación por incendio (Cova & Dennison, Univ. of Utah, desde 2005)" | Bibliografía verificada vía Semantic Scholar (títulos/años/autores reales) | Media-alta: bibliografía real, pero no pude leer los abstracts completos hoy (rate limit de la API) |
| Cifras concretas de velocidad de Sierra de la Culebra 2022 | — | **No verificado hoy — no usar sin comprobar antes del pitch** |
| Cita textual de Marc Castellnou sobre sexta generación | — | **No verificado hoy — no usar sin comprobar antes del pitch** |
| Criterios exactos de la política australiana "stay or go" tras Black Saturday | — | **No verificado hoy — usar el argumento genérico, no la política citada con precisión** |

---

## (c) Qué hemos simplificado y cómo lo admitimos si nos preguntan

1. **No calculamos Rothermel.** `spread_rate_mh` es un número que el motor de escenario decide
   directamente (contrato actual), no el resultado de un modelo de combustible/humedad/pendiente. Si
   preguntan: *"Rothermel necesita un mapa de combustibles calibrado que no existe en abierto para
   España a esa resolución; en 36 h el número lo fija el escenario para poder contar la historia, y
   documentamos exactamente qué estamos simplificando y por qué (este documento)."*

2. **El reparto 100/35/10 no es la elipse literal de Anderson/Richards — lo comprobamos con números.**
   Con la fórmula real (sección 2.3), fijar la cola en ~10% obliga matemáticamente a que el flanco real
   sea mucho menor que 35% (≈19% con viento moderado-fuerte, ≈6% con viento fuerte). Elegimos mantener
   35% fijo porque es más legible en la demo y porque no tenemos certeza de que la elipse pura sea más
   "correcta" para matorral mediterráneo que para los combustibles con los que se calibró Anderson (EE.UU.,
   años 80). Si preguntan: *"Es una simplificación deliberada de una elipse real más agresiva; con la
   elipse pura el flanco sería aún más bajo, lo que reforzaría todavía más nuestro argumento de
   prioridad, no lo debilitaría."*

3. **`grow_perimeter` mueve vértices desde el centroide, no desde la normal local del frente.** Es una
   aproximación barata del Huygens real (que usa la orientación local del segmento de perímetro en cada
   vértice, ecs. [3]-[10] de Finney). Puede autointersecarse si el polígono se vuelve muy cóncavo tras
   varios pasos o si el viento gira mucho. Mitigación: `convex_hull` o `buffer(0)` periódico. Si
   preguntan: *"Es un Huygens simplificado: cada punto avanza según su propio ángulo respecto a la
   cabeza, igual que el modelo real, pero medido desde el centro del polígono en vez de la normal exacta
   del borde — mucho más barato de programar en un día y suficiente para la escala de la demo."*

4. **No hay spotting real en el modelo de crecimiento, solo un evento separado.** El salto de pavesas no
   se simula como física continua (sería un modelo estocástico de distribución de distancias de salto,
   como el de Albini 1979 que usa FARSITE) sino como un evento discreto del motor de escenario que crea
   un polígono nuevo. Es intencional: el criterio "Creatividad" premia el evento dramático, no la
   precisión física de dónde cae cada pavesa.

5. **Los datos abiertos (EFFIS, Copernicus EMS, AEMET) no están integrados en vivo.** Verificamos qué
   existe y qué tan accesible es, pero ninguno tiene una vía de autoservicio confirmada apta para 36 h
   salvo NASA FIRMS (que sí podríamos pintar de fondo como capa real). El resto se cuentan en el pitch
   como "esto es lo que se conectaría en producción", no como algo que funciona en la demo.

6. **Varias afirmaciones citables (Sierra de la Culebra, Castellnou, política australiana) quedan sin
   verificar hoy** por bloqueos de búsqueda (CAPTCHA, consentimiento, rate limits de API). Están
   marcadas explícitamente en la sección (b) para que nadie las use en el pitch sin comprobarlas antes.
