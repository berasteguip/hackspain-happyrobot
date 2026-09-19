# Geografía real de la Sierra de la Culebra / Losacio para el escenario de incendio

Investigación con fuentes web (principalmente Wikipedia en español, cruzada entre artículos) para el escenario de HackSpain 2026, track HappyRobot. Objetivo: que el mapa de la demo sea creíble ante un jurado que puede conocer la zona (Zamora, Sierra de la Culebra, incendios de 2022).

**Método y limitaciones:** la investigación se ha hecho con `WebFetch` sobre artículos de Wikipedia en español (y algún intento fallido sobre RTVE, Wikipedia en inglés y páginas de clima/incendios de 2022 que no existen con esas URLs — devolvieron 404). No he tenido acceso a un motor de búsqueda genérico, así que allí donde Wikipedia no tenía el dato (sobre todo: viento exacto del incendio real de julio de 2022, denominación oficial de alguna carretera, capacidad de refugios) lo marco explícitamente como **ESTIMADO** y explico el razonamiento. No me invento nombres de instalaciones: donde no aparece un nombre real, digo "genérico".

---

## 1. Pueblos de la zona (tabla)

Fuente por defecto: Wikipedia en español (INE incluido en la ficha de cada artículo). Coordenadas en grados/minutos/segundos y su equivalente decimal.

| Pueblo | Municipio | Comarca | Población (INE) | Coordenadas (decimal) | Altitud |
|---|---|---|---|---|---|
| **Losacio** | Losacio (municipio propio) | Tierra de Alba | 90 hab. (2025) | 41.71088, -6.03987 | 756 m |
| **Tábara** | Tábara (capital de la Tierra de Tábara) | Tierra de Tábara | 743 hab. (2025) | 41.82611, -5.95889 | 749 m (el texto también dice 744 m) |
| **Ferreras de Arriba** | Ferreras de Arriba | La Carballeda | 350 hab. (2025), municipio total. Núcleo Ferreras de Arriba: 230 hab. (2024); Villanueva de Valrojo: 128 hab. (2024) | 41.89861, -6.19441 | 891 m |
| **Ferreruela de Tábara** | Ferreruela de Tábara | Tierra de Tábara | 409 hab. (2025), municipio total (incluye Escober de Tábara y Sesnández de Tábara). Núcleo Ferreruela solo: no desglosado por Wikipedia — ver nota abajo | 41.76583, -6.07194 | 826 m |
| **Riofrío de Aliste** | Riofrío de Aliste | Aliste | 589 hab. (2025), municipio total | 41.81528, -6.17722 | 788 m |
| **Sarracín de Aliste** | Riofrío de Aliste (pedanía) | Aliste | 226 hab. (2024) / 240 hab. citados para 2022 (discrepancia en el propio artículo) | 41.84390, -6.19040 | 861 m |
| **Villardeciervos** | Villardeciervos | La Carballeda | 383 hab. (2025), municipio total. Núcleo Villardeciervos: 354 hab. (2024); Cional: 41 hab. (2024) | 41.94120, -6.28690 | 863 m |
| **Otero de Bodas** | Otero de Bodas | La Carballeda | 164 hab. (2025), municipio total. Núcleo Otero de Bodas: 129 hab. (2024); Val de Santa María: 37 hab. (2024) | 41.93917, -6.15083 | 835 m (836 m en el cuerpo del texto) |
| **Mahíde** | Mahíde | Aliste | 299 hab. (2025), municipio total. Núcleos (2024): Mahíde 100, Pobladura de Aliste 91, Torres de Aliste 63, Boya 44, San Pedro de las Herrerías 14 | 41.86917, -6.37722 | 824 m |
| **Pobladura de Aliste** | Mahíde (pedanía) | Aliste | 91 hab. (2024) | 41.84856, -6.33346 | No encontrada (el artículo no da cifra exacta) |
| **Sesnández de Tábara** | Ferreruela de Tábara (pedanía) | Tierra de Tábara | 136 hab. (2024) | 41.80778, -6.07667 | 834 m |
| **Moldones** | Figueruela de Arriba (pedanía) | Aliste | 30 hab. (2024) | 41.84186, -6.48582 | 783 m |
| **Figueruela de Arriba** | Figueruela de Arriba | Aliste | 310 hab. (2025), municipio total. Núcleos (2024): Figueruela de Arriba 104, Gallegos del Campo 78, Figueruela de Abajo 45, Riomanzanas 36, Moldones 30, Villarino de Manzanas 18, Flechas 10 | 41.86861, -6.44306 | 857 m (858 m en el cuerpo del texto) |
| **Fonfría** | Fonfría (municipio propio, con varias pedanías: Arcillera, Bermillo de Alba, Brandilanes, Castro de Alcañices, Ceadea, Fornillos de Aliste, Moveros, Salto de Castro) | Aliste | 794 hab. (2025), municipio total | 41.63556, -6.14041 | 804 m (809 m en el cuerpo del texto) |

**Nota sobre Ferreruela de Tábara:** Wikipedia no desglosa la población por núcleo. Como Sesnández de Tábara (pedanía) tiene 136 hab. y el municipio entero tiene 409 hab., el núcleo de Ferreruela + Escober de Tábara suman aritméticamente ≈273 hab.; el núcleo de Ferreruela en solitario es previsiblemente inferior a esa cifra (ESTIMADO, sin fuente que lo confirme).

**Pueblos no encontrados / sin datos verificables:** ningún pueblo de la lista quedó sin al menos coordenadas y población; donde falta un dato concreto (altitud de Pobladura de Aliste) lo indico arriba.

---

## 2. Los tres pueblos elegidos para el escenario

### Losacio (90 hab.) + Ferreruela de Tábara (409 hab., municipio) + Sesnández de Tábara (136 hab., pedanía de Ferreruela)

| Pueblo | Población | Coordenadas |
|---|---|---|
| Losacio | 90 hab. (2025) | 41.71088, -6.03987 |
| Ferreruela de Tábara | 409 hab. (2025, municipio; núcleo probablemente <300, ver nota §1) | 41.76583, -6.07194 |
| Sesnández de Tábara | 136 hab. (2024, pedanía de Ferreruela) | 41.80778, -6.07667 |

**Distancias reales (línea recta, calculadas a partir de las coordenadas anteriores):**
- Losacio ↔ Ferreruela de Tábara: **6,7 km**
- Ferreruela de Tábara ↔ Sesnández de Tábara: **4,7 km** (el propio artículo de Sesnández cita "unos 5,5 km" por carretera, coherente)
- Losacio ↔ Sesnández de Tábara: **11,2 km**

Los tres caben holgadamente dentro del radio de 15 km pedido.

**Por qué estos tres y no otros:**
1. **Losacio es obligado y encaja perfectamente**: es donde se originó realmente el segundo gran incendio de la Sierra de la Culebra, el 17 de julio de 2022 (el que causó dos muertos), y ese incendio avanzó precisamente hacia Tábara. Usar Losacio como origen narrativo del fuego es fiel a la historia real de la zona — un jurado zamorano lo va a reconocer y eso juega a favor, no en contra.
2. **Ferreruela de Tábara y Sesnández de Tábara están literalmente en la ruta de escape hacia Tábara**: el artículo de Sesnández de Tábara dice explícitamente que su acceso principal es "a través de la N-631, tomando después la carretera provincial ZA-P-2434 (que conecta Riofrío de Aliste con Tábara)". Es decir, existe una carretera provincial real, con denominación real, que sirve de única vía asfaltada para estos dos núcleos hacia la red principal.
3. **Los tres tienen una salida natural hacia un núcleo mayor real y próximo**: Tábara (743 hab., capital de la comarca, con colegio rural agrupado y centro de salud reales) está a 10-14 km, y desde allí sigue la N-631 hacia Zamora capital o hacia Alcañices.
4. **Población dentro del rango pedido** (con la salvedad de Ferreruela de Tábara explicada en la nota del §1: la cifra municipal de 409 incluye la pedanía Sesnández, que ya contamos aparte; el núcleo en sí es menor).

**Alternativa que descarté:** Sarracín de Aliste (226 hab., pedanía de Riofrío de Aliste) también aparece citada como afectada por el incendio real de julio de 2022, y está sobre "la carretera que atraviesa Aliste de norte a sur, conectando Alcañices con Ferreras". La descarté como tercer pueblo porque queda a ~19 km de Losacio (fuera del radio de 15 km) y porque Ferreruela+Sesnández forman un triángulo más compacto y mejor documentado en cuanto a carretera única de salida.

---

## 3. Carreteras de la zona

| Carretera | De — a | Paso por la zona | ¿Única salida de algún pueblo? |
|---|---|---|---|
| **N-631** | Une la N-630 (junto al embalse de Ricobayo, cerca de Zamora) con la N-525 en El Empalme, cerca de Rionegro del Puente. ~56 km, íntegramente en la provincia de Zamora. | Pasa por La Encomienda, Pozuelo de Tábara, **Tábara**, Otero de Bodas, y bordea el límite de la Sierra de la Culebra. Cruza el embalse de Ricobayo por el puente de la Estrella. Tiene un puerto de montaña, el Portillo del Sazadón (820 m). | Es la columna vertebral de la comarca: **la única vía rápida real que conecta Tábara (y por tanto Ferreruela/Sesnández) con Zamora capital o con la N-525 hacia Puebla de Sanabria/Galicia.** Cortar la N-631 a la altura de Tábara aísla a todo el clúster Losacio-Ferreruela-Sesnández de cualquier salida rápida. |
| **ZA-P-2434** | Conecta Riofrío de Aliste con Tábara. | Pasa junto a / por Sesnández de Tábara (confirmado por el propio artículo de Sesnández: "tomando después la carretera provincial ZA-P-2434"). | **Sí — es la única carretera provincial confirmada que da salida a Sesnández de Tábara** (y, por estar en el mismo corredor, a Ferreruela de Tábara) hacia la N-631/Tábara. Es el corte perfecto para el drama: si se corta este tramo, Ferreruela y Sesnández quedan atrapadas aunque Tábara esté a solo 10 km. |
| **ZA-902** | Conecta Fonfría con Losacio (confirmado por el artículo de Fonfría: "ZA-902 (conecta con Losacio)"). | Tramo sur de Losacio, hacia Fonfría y de ahí a la N-122. | Es la salida sur de Losacio. **No he podido confirmar en las fuentes consultadas la denominación oficial de la carretera que conecta Losacio directamente hacia el norte con Ferreruela/Tábara** — Wikipedia no la nombra. Lo marco como dato pendiente de verificar sobre el terreno (Google Maps / IGN), no me invento el número. |
| **N-122** | Carretera internacional Zamora–Portugal (frontera), pasa por Alcañices ("cruza la mitad de la villa por su plaza mayor") y por el municipio de Fonfría (entre los pK 492 y 512). | Eje este-oeste de la comarca de Aliste, capital Alcañices. | No es única salida de ningún pueblo de nuestro trío, pero es la vía de Alcañices como núcleo de referencia. |
| **A-52 (Autovía de las Rías Bajas)** | Cruza Puebla de Sanabria (pK 80-81) y arranca en Benavente. | Zona noroeste de la Sierra de la Culebra, lejos de nuestro trío elegido (ver §4). | No aplica a Losacio/Ferreruela/Sesnández — relevante solo si el escenario se desplazara hacia el clúster occidental de la sierra (Otero de Bodas, Villardeciervos, Puebla de Sanabria). |
| **ZA-P-2438** | Carretera comarcal que atraviesa el casco urbano de Figueruela de Arriba. | Zona de Aliste, paralela a la sierra. | Mencionada aquí por completitud (Figueruela de Arriba / Moldones), no forma parte del trío elegido. |

**Resumen de la pieza dramática:** el corte más creíble y mejor documentado es **ZA-P-2434** (Riofrío de Aliste–Tábara, pasando por Sesnández). Es la única carretera provincial confirmada que da salida a Sesnández de Tábara y, por el mismo corredor, a Ferreruela de Tábara. Cortarla aísla a ambos pueblos de Tábara aunque estén a menos de 15 km.

---

## 4. Núcleos mayores como zona segura

| Núcleo | Población (INE) | Coordenadas | Distancia a Losacio (línea recta) | Distancia a Ferreruela/Sesnández | Instalación real para acogida |
|---|---|---|---|---|---|
| **Tábara** | 743 hab. (2025) | 41.82611, -5.95889 | 14,4 km | 11,5 km / 10,0 km | **Colegio rural agrupado "León Felipe"** (nombre real, construido 1970 como colegio comarcal, transformado en CRA en 1994) + centro de salud + casa consistorial. No se menciona polideportivo con nombre propio en el artículo — para esa instalación, usar "genérico". |
| **Alcañices** | 1.062 hab. (2025) | 41.69887, -6.34793 | 25,6 km (línea recta; ESTIMADO 35-40 km por carretera vía N-122/comarcales) | — | Capital de la comarca de Aliste. Instalaciones reales confirmadas: **CEIP Virgen de la Salud**, **IES Aliste**, centro de salud "Z.B.S. Aliste", cuartel de la Guardia Civil, comisaría de Policía Nacional, un centro cultural con biblioteca y auditorio (sin nombre propio citado). No se menciona polideportivo ni plaza de toros — "genérico" para ambos. |
| **Zamora capital** | 59.815 hab. (2025) | 41.50333, -5.75556 | 33,0 km (línea recta; ESTIMADO 45-50 km por carretera, vía N-630→N-631) | — | El artículo de Wikipedia se truncó antes de la sección de instalaciones deportivas/sanitarias — **no puedo confirmar el nombre del hospital ni de ningún polideportivo desde esta fuente.** No me invento nombres: usar "genérico" hasta verificarlo. |
| Benavente (referencia, descartado como primera zona segura) | 17.309 hab. (2025) | 42.00487, -5.67562 | ESTIMADO >60 km desde Losacio | — | Demasiado lejos de nuestro trío para ser la primera zona segura; útil solo como nodo regional (cruce A-6/A-66/A-52/N-525). |
| Puebla de Sanabria (referencia, descartado) | 1.378 hab. (2025) | 42.05528, -6.63361 | 62,3 km línea recta (ESTIMADO 70-80 km por carretera) | — | Demasiado lejos; sería la zona segura natural para el clúster occidental de la sierra (Villardeciervos/Otero de Bodas), no para Losacio. |

**Recomendación de diseño:** usar **Tábara** como primer punto de acogida/paso (real, cercano, con colegio rural agrupado de nombre confirmado) y **Zamora capital** como zona segura final de mayor capacidad, con **Alcañices** como alternativa/segunda opción por la N-122. Benavente y Puebla de Sanabria quedan fuera del radio práctico para este trío concreto de pueblos.

---

## 5. Geografía física de la Sierra de la Culebra

- **Relieve:** sierra de relieve suave y redondeado, la estribación más meridional de la Cordillera Cantábrica. Formada geológicamente por cuarcitas del Ordovícico Inferior en las cumbres y pizarras en zonas deprimidas (orogenia hercínica).
- **Altitudes:** cota máxima **Peña Mira, 1.241 m**; otras cumbres: Miño Cuevo (1.207-1.211 m), Peña Castillo (1.185 m). Altitud media en torno a 1.000 m; la sierra se hunde hacia 700-800 m donde se funde con la meseta norte. Es efectivamente una sierra baja.
- **Vegetación:** predomina el **pinar de repoblación** (Pinus pinaster, pino resinero/negral, junto a pino silvestre), plantado a mediados del s. XX. También hay **rebollo/roble melojo** (Quercus pyrenaica) en canchales, encinar muy degradado con alcornoque y madroño en solanas, y sobre todo **matorral de jaral-brezal** (jara común, romero, escobonales, cambronales, piornales) — la carga de combustible que hace crítica la zona. Bosques de ribera: alisedas, fresnedas, choperas.
- **Lobo ibérico:** "el emblema de la sierra", con una de las mayores densidades de la especie en la península ibérica y en toda la Europa Occidental. Declarada **Reserva Nacional de Caza en 1973** (Reserva Regional de Caza desde 1996), 67.340 ha, con caza controlada para gestión poblacional. Buen dato de color para el pitch: el estatus protegido de la reserva explica en parte por qué el monte se ha gestionado poco y acumula carga de combustible.
- **Extensión:** ~70.000 ha totales, 65 km de longitud x 32 km de anchura; 61.305 ha declaradas LIC (Red Natura 2000). Abarca 12 municipios zamoranos (Pedralba de la Pradería, Puebla de Sanabria, Ferreras de Abajo, Ferreras de Arriba, Ferreruela, Tábara, Manzanal de Arriba, Otero de Bodas, Villardeciervos, Figueruela de Arriba, Mahíde y Riofrío de Aliste), unos 6.200 habitantes en 45 localidades.
- **Incendios de 2022 (contexto real, no forma parte del escenario ficticio pero da credibilidad):**
  - **Junio 2022**: originado el 15 de junio por una tormenta eléctrica en plena ola de calor, quemó más de 25.000 ha (algunas fuentes dan >30.000 ha). Afectó principalmente a Ferreras de Arriba, Riofrío de Aliste y Ferreras de Abajo.
  - **Julio 2022**: originado el 17 de julio **en Losacio**, quemó más de 36.000 ha, con dos fallecidos (un ganadero y un brigadista). Afectó a Losacio, Tábara, Litos, Sarracín de Aliste, Ferreras de Abajo, Melgar de Tera y Calzadilla de Tera — es decir, avanzó de Losacio hacia el norte/noreste, exactamente la dirección que necesitamos para el escenario.

---

## 6. Contexto demográfico

- **Comarca de Aliste** (capital Alcañices, 16 municipios, 193.883 ha): población 6.920 hab. (2024), **densidad 5,85 hab./km²**. El propio artículo señala que "a comienzos del siglo XX su población está envejecida y existe una limitada presencia de población adulta joven" y que sufre despoblación continua desde los años 70, con algunos pueblos alistanos "al estado de completo abandono". No da un porcentaje exacto de mayores de 65 años — no lo invento, lo marco como no encontrado.
- **Corrección importante sobre "Laponia española":** ese apodo, según Wikipedia, corresponde específicamente a la **Serranía Celtibérica** — una región que abarca 1.311 municipios en Teruel, Zaragoza, Cuenca, Guadalajara, Burgos, Segovia, Soria, Castellón, Valencia y La Rioja. **Zamora y la comarca de Aliste/Tábara NO están incluidas** en esa región según el artículo consultado. No usaría literalmente "Laponia española" para esta zona en el pitch sin matizarlo, porque un jurado informado podría corregirlo.
  - Dato útil de comparación, sin embargo: la densidad de la Serranía Celtibérica es 7,98 hab./km² — **la comarca de Aliste (5,85 hab./km²) es todavía más despoblada que esa región de referencia**, aunque no forme parte de ella administrativa ni geográficamente. Se puede decir con seguridad: "esta zona de Zamora tiene una densidad de población inferior a la de la Serranía Celtibérica, la región más despoblada de España" — eso es defendible con la fuente.
- **Despoblación / envejecimiento (dato general de la Serranía Celtibérica, no aplicable directamente a Aliste pero útil como referencia del fenómeno en la España interior):** más del 76% de las localidades de esa región están a más de 45 minutos en coche de la ciudad más cercana; el 40% de los municipios superan una edad media de 50 años.
- **Para el argumento del pitch** (población envejecida, dispersa, sin smartphone, casas de una sola persona mayor): la comarca de Aliste, con 5,85 hab./km² y pueblos de 30 a 400 habitantes muy dispersos entre sí (como los del §1), es un terreno real y verificable para ese argumento, aunque el dato concreto de "% mayores de 65" o "% sin smartphone" no está en las fuentes consultadas — habría que citarlo como estimación razonada, no como cifra oficial.

---

## 7. Meteorología

**Lo verificado:**
- Clima de la zona (Zamora capital, referencia climática más próxima con datos): clima estepario (Köppen BSk) con rasgos de continentalidad mediterránea. Veranos cálidos, inviernos fríos, sequía estival marcada.
- Temperatura máxima **media** de julio en Zamora capital: 31,1 °C (dato climático normal, no de ola de calor).
- Humedad relativa media de verano en Zamora capital: junio 49%, **julio 46%**, agosto 48% (de nuevo, valores normales, no de episodio extremo).
- La ola de calor de julio de 2022 en España (11-19 julio aprox.) provocó temperaturas "cercanas a los 44 grados" en varias zonas de España (Zaragoza, Cantabria, Badajoz, Navarra, La Rioja, Córdoba, Sevilla citadas explícitamente) y más de 360 muertes en sus primeros 6 días. El artículo consultado no da la cifra exacta para Zamora ni para Losacio/Tábara — no la invento.

**ESTIMADO (no encontrado con precisión en las fuentes consultadas, pero razonado):**
- **Temperatura máxima en un día de ola de calor de julio en la comarca**: 40-44 °C (coherente con los valores citados para el resto de España en esas fechas y con que Zamora es una de las provincias que más calor registra en la meseta norte).
- **Humedad relativa mínima en las horas centrales de un día de ola de calor**: 12-20% (muy por debajo del 46% medio de julio, que es un promedio de todo el mes y todas las horas; en la práctica meteorológica, los días de ola de calor con viento del suroeste bajan la humedad relativa a mínimos de ese orden en la meseta norte).
- **Viento dominante en verano en la meseta zamorana**: no encontrado un dato explícito de "dirección dominante" en las fuentes consultadas (ni el artículo de Zamora ni las páginas de clima de Castilla y León, que devolvieron 404, lo especifican). Razonamiento climatológico general para justificar el guion de la demo: los episodios de ola de calor en la península ibérica en verano suelen llegar con **flujo del suroeste** (aire cálido subtropical/sahariano), y terminan típicamente con la entrada de un frente que gira el viento hacia el **noroeste/norte** (aire atlántico más fresco) — este es el patrón sinóptico genérico que se citó en la prensa como factor de riesgo en varios incendios de ese verano en el noroeste de España, aunque no he podido verificar con una fuente accesible el dato horario exacto del incendio de Losacio del 17 de julio de 2022 en particular.
- Para el escenario: **viento inicial del suroeste (dirección meteorológica 225°)** empujando el fuego hacia el noreste (hacia Losacio → Ferreruela → Sesnández/Tábara, que es la dirección real en que avanzó el incendio de julio de 2022), y **giro hacia el noroeste (315°)** a mitad de simulación, que redirige el flanco del incendio hacia el corredor Ferreruela-Sesnández-Tábara — precisamente hacia la carretera ZA-P-2434 identificada en el §3 como única salida. Esto es una construcción narrativa razonada sobre un patrón climatológico real, no un dato medido; lo marco así para que el equipo lo use con esa salvedad si un jurado pregunta.

---

## 8. Bounding box, centro y zoom

Caja calculada para contener los tres pueblos elegidos (Losacio, Ferreruela de Tábara, Sesnández de Tábara), la zona segura primaria (Tábara) y el polígono de fuego inicial del §9, más un margen para que el grafo de carreteras de OSMnx no corte rutas por el borde:

- **lat_min:** 41.55
- **lat_max:** 41.88
- **lon_min:** -6.30
- **lon_max:** -5.90

Esto da una caja de ~37 km (norte-sur) x ~30 km (este-oeste), tamaño razonable para descargar con OSMnx sin un grafo excesivo.

- **Centro recomendado:** lat 41.715, lon -6.10
- **Zoom recomendado en Leaflet:** 11 (para ver el trío de pueblos + Tábara con detalle de carreteras; bajar a 10 si se quiere ver también Alcañices, que queda justo fuera de esta caja, a lon ≈ -6.35).

**Nota:** si el equipo quiere incluir también Alcañices o Zamora capital dentro del mismo grafo de carreteras (para simular la evacuación hasta el final), habría que ampliar la caja a aproximadamente lat_min 41.45 / lat_max 41.88 / lon_min -6.40 / lon_max -5.70, con el coste de un grafo OSMnx notablemente más grande.

---

## 9. Polígono de fuego inicial

Diseñado (no es un incendio real) para representar un fuego ya establecido, al suroeste de los tres pueblos elegidos, en terreno real de la comarca de Aliste (entre Fonfría y Alcañices, zona de monte bajo/jaral-brezal coherente con la vegetación descrita en el §5). Área calculada por la fórmula del área de Gauss (shoelace) sobre los vértices: **≈3.580 ha**, dentro del rango pedido (2.000-4.000 ha).

- El vértice más próximo a un pueblo es la "punta" noreste del polígono, a **≈8,3 km de Losacio** (el más cercano de los tres) — no toca ningún núcleo.
- Con viento inicial del suroeste (225°, ver §7), el frente avanza hacia el noreste, directamente hacia Losacio. Un avance medio de ~12,5 km/h en las próximas simulaciones de 40 minutos lo pondría en el borde de Losacio — una velocidad de propagación alta pero dentro de lo documentado para incendios de matorral con viento fuerte en España (el incendio real de Losacio de julio de 2022 se caracterizó precisamente por una velocidad de propagación extrema).

```json
{
  "type": "Feature",
  "properties": {
    "nombre": "Fuego inicial (diseñado, no real) al SO de Losacio",
    "area_ha_aproximada": 3580,
    "nota": "ESTIMADO/diseñado para el escenario; terreno real de la comarca de Aliste, no un incendio histórico"
  },
  "geometry": {
    "type": "Polygon",
    "coordinates": [[
      [-6.2050, 41.5980],
      [-6.2350, 41.6150],
      [-6.2300, 41.6400],
      [-6.1900, 41.6600],
      [-6.1250, 41.6720],
      [-6.1400, 41.6500],
      [-6.1700, 41.6250],
      [-6.1900, 41.6050],
      [-6.2050, 41.5980]
    ]]
  }
}
```

---

## Bloque JSON para el generador del dataset

```json
{
  "villages": [
    { "name": "Losacio", "lat": 41.71088, "lon": -6.03987, "population": 90 },
    { "name": "Ferreruela de Tábara", "lat": 41.76583, "lon": -6.07194, "population": 409 },
    { "name": "Sesnández de Tábara", "lat": 41.80778, "lon": -6.07667, "population": 136 }
  ],
  "safe_zones": [
    { "name": "Tábara (colegio rural agrupado León Felipe)", "lat": 41.82611, "lon": -5.95889, "capacity": 400 },
    { "name": "Alcañices (CEIP Virgen de la Salud / IES Aliste)", "lat": 41.69887, "lon": -6.34793, "capacity": 1000 },
    { "name": "Zamora capital (instalación genérica, hospital/polideportivo sin confirmar)", "lat": 41.50333, "lon": -5.75556, "capacity": 3000 }
  ],
  "roads": [
    { "name": "N-631", "from": "Zamora (N-630, embalse de Ricobayo)", "to": "El Empalme / N-525 (Rionegro del Puente)", "sole_exit_for": null },
    { "name": "ZA-P-2434", "from": "Riofrío de Aliste", "to": "Tábara", "sole_exit_for": ["Sesnández de Tábara", "Ferreruela de Tábara"] },
    { "name": "ZA-902", "from": "Fonfría", "to": "Losacio", "sole_exit_for": ["Losacio (salida sur; salida norte hacia Tábara no confirmada en fuentes)"] },
    { "name": "N-122", "from": "Zamora / Alcañices", "to": "frontera portuguesa", "sole_exit_for": null }
  ],
  "bbox": { "lat_min": 41.55, "lat_max": 41.88, "lon_min": -6.30, "lon_max": -5.90 },
  "map": { "center_lat": 41.715, "center_lon": -6.10, "zoom": 11 },
  "wind_initial": { "direction_deg": 225, "speed_kmh": 30 },
  "wind_after_shift": { "direction_deg": 315, "speed_kmh": 45 },
  "fire_initial_polygon": {
    "type": "Polygon",
    "coordinates": [[
      [-6.2050, 41.5980],
      [-6.2350, 41.6150],
      [-6.2300, 41.6400],
      [-6.1900, 41.6600],
      [-6.1250, 41.6720],
      [-6.1400, 41.6500],
      [-6.1700, 41.6250],
      [-6.1900, 41.6050],
      [-6.2050, 41.5980]
    ]]
  }
}
```

**Notas de honestidad sobre el bloque JSON (léelas antes de usarlo a ciegas):**
- `wind_initial` y `wind_after_shift` son una construcción narrativa razonada sobre un patrón sinóptico real (ola de calor con flujo SO seguido de giro a NO), no una medición del incendio real de julio de 2022 — no encontré esa cifra horaria exacta en las fuentes accesibles.
- `safe_zones[].capacity` son estimaciones a partir del tipo de instalación (colegio rural agrupado / instituto+colegio / capital de provincia), no cifras oficiales de aforo — no existe una fuente que las dé.
- La carretera de salida norte de Losacio (hacia Ferreruela/Tábara) no tiene denominación oficial confirmada en las fuentes consultadas; solo se confirmó ZA-902 hacia el sur (Fonfría). Si el equipo necesita el número exacto, lo más rápido es mirarlo en el IGN/Google Maps directamente sobre el terreno, no inventarlo.
- `fire_initial_polygon` es diseñado, no un incendio histórico georreferenciado.
