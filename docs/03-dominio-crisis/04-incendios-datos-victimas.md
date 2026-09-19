# Datos verificados: víctimas y personas atrapadas al evacuar incendios forestales

> Investigación para el pitch de HackSpain 2026 (track HappyRobot, equipo router123).
> Metodología: búsqueda web dirigida a fuentes primarias/secundarias (Wikipedia con notas al pie verificables, Copernicus EMS, MITECO). Cada cifra lleva fuente + fecha. Donde dos fuentes discrepan, se muestran ambas. Donde no se pudo verificar nada, se marca **NO VERIFICADO**.
>
> Limitación de la sesión: no tuve acceso a un motor de búsqueda general (Google/Bing devolvieron resultados corruptos/irrelevantes; DuckDuckGo bloqueó con CAPTCHA). Toda la investigación se apoyó en fetch directo a Wikipedia (es/en, vía su buscador interno, citando las notas al pie que el propio artículo referencia a medios como El País, EFE, RTVE, La Opinión de Zamora, Zamora24horas, etc.) y a la web oficial de Copernicus EMS. Esto es más lento pero más trazable; no elimina el riesgo de que un artículo de Wikipedia tenga un error, así que las cifras más sensibles (nombres de víctimas, cifras de evacuados) deberían recontrastarse con el medio original si el jurado presiona.

---

## 1. Sierra de la Culebra (Zamora) — verano 2022: DOS incendios distintos, no uno

**Error común a evitar en el pitch:** "el incendio de la Sierra de la Culebra de 2022" en realidad son **dos incendios separados**, con nombres, fechas y víctimas distintas. Losacio es el incendio de julio, no el de junio.

| | Ferreras-Sarracín (junio) | Losacio (julio) |
|---|---|---|
| Inicio | 15 junio 2022, 19:00-21:00, tormenta seca ("11 focos... 6 en la sierra de la Culebra") | 17 julio 2022, ~18:00, otra tormenta seca |
| Controlado / extinguido | Controlado 24 junio (10 días) | Controlado 14 agosto; extinción oficial 31 agosto (45 días) |
| Superficie (perímetro oficial) | 29.670 ha | 35.960 ha |
| Superficie con daño relevante (Sentinel-2) | 25.216,6 ha (27.242 ha con algo de severidad) | 31.473,1 ha (cifra oficial redondeada citada: "31.500 ha quemadas") |
| Muertes | 0 (según el artículo consultado) | **4** (ver tabla abajo) |
| Activación Copernicus EMS | **EMSR580** — "Forest Fire in Sierra Culebra - Spain", activada 17/06/2022 10:55 | **EMSR602** — "Wildfires in Castilla y Leon - Spain", activada 20/07/2022 16:11 |

Fuente: artículo de Wikipedia "Incendios de la sierra de la Culebra de 2022" (es.wikipedia.org), que a su vez cita: Junta de Castilla y León — Centro para la Defensa contra el Fuego, "Incendio de la Sierra de la Culebra (15-19/06)" (PDF); Zamora24horas.com, "Fallece un brigadista en el incendio de Losacio" (17 jul 2022); La Opinión de Zamora, "Losacio, el fuego más veloz de la historia, devoró diez mil hectáreas en 4 horas" (19 jul 2022); elDiario.es/Vozpópuli, "Controlado el incendio de Losacio, el mayor del año" (14 ago 2022); EFE, "Dos muertos, 11 heridos y más de 3.000 evacuados en el incendio de Zamora"; Copernicus EMS EMSR580 y EMSR602 directamente.

Combinado: **~65.600-66.000 ha** quemadas entre los dos incendios, ~48% de la superficie del espacio natural Sierra de la Culebra, según el mismo artículo.

### Las 4 muertes (todas en el incendio de Losacio, julio)

| Persona | Ocupación | Dónde | Cuándo | Circunstancia |
|---|---|---|---|---|
| Daniel Gullón Vara | Bombero forestal | — | Noche del 17 julio | "Cercado por las llamas debido al rápido avance de estas" |
| Victoriano Antón Ratón | Pastor, vecino de Escober de Tábara | Término de Ferreruela | 18 julio (había salido con las ovejas la tarde del 17) | "Alcanzado por las llamas" |
| Sin nombre en la fuente consultada | Vecino de Sesnández | — | ~1 mes después (~agosto 2022) | Murió por "graves quemaduras que sufrió al huir de las llamas" (coincide con La Opinión de Zamora, "Fallece el hombre que sufrió un 85% de quemaduras...", 17 ago 2022) |
| Sin nombre en la fuente consultada | Vecino de Tábara | — | 25 octubre 2022 | Tras 3 meses en la UCI por quemaduras |

Además: 9 bomberos forestales heridos por quemaduras/inhalación de humo; 2 personas más "heridas graves en un accidente derivado de la situación del incendio"; un maquinista de bulldozer con quemaduras en la mano el 16 de junio.

**NO VERIFICADO / a recontrastar antes de decirlo en directo:** la cifra "+3.000 evacuados" solo aparece en el *título* de una referencia de EFE citada por Wikipedia, no desarrollada en el cuerpo del artículo con desglose por incendio ni por fecha. No encontré el número total de personas evacuadas por fuego, solo la lista extensa de pueblos desalojados (más de 40 localidades entre ambos incendios, ver artículo fuente).

### Viento y ferrocarril

- 17 junio: vientos "cambiantes a primera hora de la noche, con rachas de hasta 54 km/h"; por la mañana el viento de componente sur obligó a evacuar Boya y Villardeciervos; por la tarde giró a sur constante 30 km/h con rachas de 70 km/h, "erráticos".
- 18 junio (tarde): viento de casi 40 km/h con rachas de 50-70 km/h empujó las llamas hacia el norte.
- 17 julio (Losacio): el fuego generó "su propio sistema de vientos con características de tormenta ígnea" (pirocúmulo/firestorm) — no es solo viento externo, es el propio incendio generando el fenómeno.
- Ferrocarril: la línea AVE Orense-Zamora se cortó la tarde del 18 junio y se restableció el 19; la vía férrea Zamora-Ourense y la línea de alta velocidad Zamora-Sanabria se cortaron el 17-18 de julio y se restableció el 20 de julio.
- **NO VERIFICADO**: no encontré ninguna fuente que describa una evacuación de pasajeros a pie desde un tren detenido por el fuego (el dato que yo recordaba de un "tren evacuado" no aparece en esta fuente — solo el corte de la línea). Si el equipo quiere usar ese detalle en la demo, hay que buscar el reporte específico de RENFE/Adif antes de afirmarlo.

---

## 2. Incendios de agosto 2025 en España

Fuente: es.wikipedia.org, "Incendios forestales de España de 2025" (artículo agregado que cubre desde el 1 julio 2025), citando decenas de medios (El País, RTVE, EFE, Europa Press, 20minutos, La Vanguardia, etc., con fecha en cada cita).

**Total de muertos documentados en el artículo: 9**, entre julio y agosto 2025:

| Fecha | Lugar | Circunstancia |
|---|---|---|
| 1-2 julio | Oliola/Torrefeta (Lérida) | Un granjero y un trabajador muertos; según El País, murieron **"al quedar su vehículo atascado mientras intentaban escapar"** — caso más claro de muerte por quedar atrapado huyendo en coche |
| 2 julio | San Cristóbal de Cea (Ourense) | Un concejal murió ayudando a un conductor de tractor cuyo vehículo provocó un pequeño fuego |
| 28 julio | Barranco de las Cinco Villas (Ávila) | Un bombero murió en accidente de tráfico yendo al incendio |
| 11 agosto | Tres Cantos (Madrid) | Un hombre murió con quemaduras en el 98% del cuerpo; otro herido |
| 12 agosto | Zona Molezuelas de la Carballeda (Zamora/León) | Un voluntario murió intentando apagar llamas; un segundo hombre que lo acompañaba, gravemente quemado, murió 2 días después (14 agosto) |
| 18 agosto | Espinoso de Compludo, Llamas de Cabrera-Yeres (León) | Un bombero murió cuando una autobomba volcó; otro herido |

Evacuaciones puntuales citadas:
- Torrefeta (Lleida): "más de 20.000 personas confinadas en 11 municipios" (20minutos, 1 jul 2025).
- Baix Ebre (8 jul): +18.000 personas confinadas (La Vanguardia).
- Molezuelas (Zamora, 10 ago): +700 vecinos evacuados en 4 localidades (Cadena SER).
- Tarifa (Cádiz, 11-12 ago): +2.000 evacuados (RTVE).
- Nacional, 12 agosto: "unos 6.000 desalojados en toda España" (RTVE).

Hectáreas quemadas — **discrepancia sin resolver, dejarla marcada así ante el jurado**:
- Julio 2025 total: 26.300 ha (RTVE, 1 ago 2025).
- Agosto (hasta el 19): ~340.000 ha (Europa Press/Copernicus, 19 ago 2025).
- Acumulado a 19 agosto: ~400.000 ha, descrito como el peor en 30+ años (Climática, 18 ago 2025).
- Cifra de cierre de año atribuida al Ministerio para la Transición Ecológica (vía epdata.es): 5.822 ha — **contradice frontalmente los ~400.000 ha de agosto**. El propio artículo de Wikipedia no resuelve la contradicción; probablemente son series con alcance distinto (ej. una única categoría de incendio, o un error de la fuente secundaria). **NO USAR ninguna de las dos cifras en el pitch sin resolver esta contradicción contra la fuente primaria de MITECO/EGIF.**

Gente atrapada en carretera huyendo: el caso de Oliola/Torrefeta (Lleida, 1-2 julio 2025) es el ejemplo verificado más directo — coincide exactamente con el escenario que el proyecto quiere resolver (evacuación individual mal cronometrada = muerte en el coche).

---

## 3. Otros casos de referencia (ibérico e internacional)

### Pedrógão Grande, Portugal (17-24 junio 2017)
Fuente: es.wikipedia.org, "Incendio forestal de Portugal de junio de 2017".
- **Discrepancia de cifra total en la propia fuente**: la introducción dice "al menos 64 muertos"; la sección de "Acontecimientos" dice "al menos 65". Los medios en tiempo real citados en las notas dieron cifras variables (57, 61, 62) mientras evolucionaba.
- De esas muertes, **47 ocurrieron en una carretera rural cerca de Pedrógão Grande**: "30 personas murieron atrapadas en sus vehículos, mientras que otras 17 murieron intentando huir a pie". Otras 11 murieron en Nodeirinho, cerca de la autopista IC8.
- El artículo en español **no nombra la carretera como "N-236"** (esa referencia es de mi memoria, no confirmada en esta fuente) — la llama genéricamente "carretera rural". **NO VERIFICADO el número de carretera exacto**; no lo uses en el pitch sin confirmarlo contra un medio portugués (Público/Observador) o el informe oficial de la comisión técnica independiente portuguesa.
- Heridos: cifra también inconsistente dentro del mismo artículo (infobox dice "254 confirmados, 7 críticos"; el cuerpo del texto dice "más de 54 heridos, incluidos 8 bomberos, 5 en estado crítico"). **NO VERIFICADO cuál es correcta.**

**Cifra defendible con matiz**: "de las ~64-65 muertes de Pedrógão Grande, 47 fueron gente que murió en la carretera intentando huir (30 en coche, 17 a pie) — es decir, más de 7 de cada 10 muertos murieron evacuando, no quedándose en casa."

### Mati, Grecia (23 julio 2018)
Fuente: es.wikipedia.org, "Incendios forestales en Ática de 2018".
- El propio artículo muestra el número subiendo con el tiempo: "al menos 100" (primer reporte), "76 confirmadas" (24 julio), **"94" a fecha 11 de agosto** (desglosado: 46 mujeres, 35 hombres, 11 niños, 2 sin identificar). La cifra final comúnmente citada en prensa internacional posterior es ~102-104, pero **esa cifra final no aparece verificada en la fuente consultada esta sesión — NO VERIFICADO, usar la de 94 (11 ago 2018) como la más sólida de esta investigación o recontrastar antes del pitch.**
- 26 cuerpos fueron encontrados "atrapados a pocos metros del mar, aparentemente abrazándose unos a otros mientras morían" — la gente corrió hacia el mar y no llegó a tiempo.
- 10 personas más murieron ahogadas cuando volcó un bote que las rescataba desde un hotel en Mati.
- Heridos: "164 adultos y 23 niños" atendidos en hospital, 11 adultos en estado grave.
- Hectáreas quemadas: **NO VERIFICADO** — el campo del infobox aparecía vacío en la fuente consultada.

### Camp Fire / Paradise, California (8-25 noviembre 2018)
Fuente: en.wikipedia.org, "Camp Fire (2018)".
- 85 muertos (cifra revisada a la baja desde 87 el 3 de diciembre, al identificar que restos en 3 bolsas distintas eran de la misma víctima).
- Al menos 7 muertes ocurrieron con gente atrapada en vehículos (la mayoría en Edgewood Road), más 1 persona fuera de un vehículo y 2 en quads. Según la investigación del fiscal del condado de Butte: 70 de 84 fallecidos murieron dentro o inmediatamente fuera de su vivienda; 8 murieron intentando evacuar.
- Estructuras destruidas: 18.804 (infobox) / cifra detallada de Cal Fire: 18.661 destruidas + 675 dañadas.
- Evacuados en total (todas las comunidades afectadas): 52.000 personas.
- Cronología clave: fuego detectado 6:15 (hora local); cresta sobre el cañón del río Feather poco después de las 7:00; primeros focos dentro de Paradise a las 7:44; frente principal llega a Paradise a las 8:30. **De la ignición al pueblo arrasado: ~2h15.**

**Cifra defendible**: "en Paradise, California, el pueblo fue arrasado en 2 horas y cuarto desde que se detectó el fuego — no hubo margen para una evacuación ordenada casa por casa; el sistema tuvo que decidir en minutos, no en horas."

---

## 4. Datos agregados de incendios en España (MITECO / EGIF)

Fuente: es.wikipedia.org, "Incendios forestales en España", citando MITECO ("Estadísticas de Incendios Forestales") y otras fuentes secundarias con fecha.

- Media de superficie forestal quemada 2005-2014: **108.282 ha/año** (MITECO).
- Serie anual de hectáreas quemadas (con fuente MITECO/Wikipedia):
  - 2016: 87.385 ha
  - 2017: 176.587 ha, con **13.545 incendios**, de los cuales 53 "grandes incendios forestales" (GIF)
  - 2018: 25.162 ha (el más bajo de la serie)
  - 2019: 83.963 ha
  - 2020: 66.503 ha
  - 2021: 87.880 ha
  - 2022: 270.286 ha (año de Sierra de la Culebra/Losacio)
  - 2023: 89.068 ha
  - 2024: 47.711 ha
  - 2025: ~350.000 ha (cifra "peor año", con la salvedad de la discrepancia ya señalada en la sección 2)
- **96% de los incendios en España están provocados directamente por el ser humano** (intencionados o por negligencia) — fuente citada por Wikipedia: Atresmedia, "El 96% de los incendios en España son provocados y la mayoría se deben a descuidos", 24 junio 2019.
- Reparto de presupuesto (dato de 2014, informe WWF citado): 63% extinción, 13% restauración, 23% prevención.
- Fraude en contratos públicos de extinción (investigación Audiencia Nacional desde 2015): más de 250 millones de euros, en Comunidad Valenciana, Cataluña, Baleares, Andalucía y otras (fuente: Contexto/Público, 2017).

**NO VERIFICADO — importante para el pitch**: no encontré, en la sesión de esta investigación, ninguna cifra oficial de MITECO/EGIF sobre **cuántas personas se evacúan al año en España por incendios forestales**. La página oficial de estadísticas de MITECO (miteco.gob.es) que consulté describe el sistema EGIF (activo desde 1968, +150 campos de información por siniestro) pero no expone esa cifra agregada en el texto accesible — solo enlaza a PDFs anuales (1968-2021) y dashboards de Power BI (2016-2021) cuyo contenido no pude leer en esta sesión. Si el pitch necesita un "cuántas personas evacuamos al año en España", hay que abrir esos PDFs/dashboards directamente, no inventar la cifra.

---

## 5. Copernicus EMS — activaciones de Rapid Mapping para Sierra de la Culebra y Losacio (2022)

Confirmado directamente en la web oficial de Copernicus EMS (mapping.emergency.copernicus.eu), no solo referenciado por Wikipedia:

### EMSR580 — Sierra Culebra (incendio de junio)
- Nombre completo: "Forest Fire in Sierra Culebra - Spain"
- Localización según el texto de activación: provincia de Zamora, afecta a Ferreras de Arriba, Riofrío de Aliste y Ferreras de Abajo
- Activada: **17/06/2022, 10:55**
- Productos: 1 área (AOI01 "Sierra Culebra"), 1 producto de tipo "Grading Product", entregado 2022-06-26 10:07:39
- Nota: la petición original pedía "First Estimate, Delineation and Grading products" pero la página solo muestra un Grading Product entregado — puede haber productos intermedios no listados en el resumen leído.
- Descarga disponible: "Map (.pdf)" + "Vector Package (.zip)" por producto. **No se especifica en la página si el zip contiene shapefile o GeoJSON** — hay que descargarlo y comprobarlo directamente antes de asumir el formato.

### EMSR602 — Losacio / Castilla y León (incendio de julio)
- Nombre completo: "Wildfires in Castilla y Leon - Spain"
- Texto de activación menciona que el fuego empezó "near the locality of Losacio"
- Activada: **20/07/2022, 16:11**
- Escala mucho mayor que EMSR580: **8 áreas, 14 productos en total**, incluyendo AOI01 "Ferreruela" (coincide con uno de los pueblos evacuados por Losacio según la Wikipedia), más AOI02 San Esteban de Valdueza, AOI03 Candelario, AOI04 Cebreros, AOI05 Figueruela de Arriba, AOI06 Quintanilla del Coco, AOI08 Vegalatrave Zamora, AOI09 Almaraz de Duero, AOI10 Roelos de Sayago — es decir, cubre varios incendios simultáneos de esa ola de calor de julio 2022, no solo Losacio.
- Tipos de producto entregados por área: mezcla de "First Estimate Product", "Delineation Product" y "Grading Product", entregados entre el 20 de julio y el 4 de agosto de 2022.
- Descarga disponible igual que EMSR580: "Map (.pdf)" + "Vector Package (.zip)" por producto/área. Mismo aviso: **formato interno del zip no confirmado en esta sesión (probablemente shapefile, formato estándar de Copernicus EMS, pero no lo vi documentado explícitamente en la página)**.

**Conclusión práctica para el proyecto**: SÍ existen activaciones reales de Copernicus EMS para ambos incendios, con códigos verificables (EMSR580, EMSR602) y productos vectoriales descargables — esto respalda la idea de cargar perímetros reales en el sistema. Antes de construir sobre ello: (1) descargar de verdad el Vector Package de al menos un producto para confirmar formato y si trae timestamps que permitan reconstruir el avance del fuego por hora/día (el "Grading Product" normalmente sí distingue zonas por grado de severidad, no necesariamente por hora); (2) EMSR602 tiene 8 AOIs — para el escenario de Losacio interesa específicamente AOI01 "Ferreruela", no las otras 7 que son incendios distintos de la misma ola de calor.

---

## Frases usables en el pitch (defendibles si el jurado pregunta la fuente)

1. **"El incendio de Losacio, en Zamora, no es lo mismo que el de la Sierra de la Culebra de junio de 2022 — fueron dos incendios distintos, unas semanas separados, y juntos quemaron cerca de 66.000 hectáreas, casi la mitad de todo el espacio natural."** — Fuente: Wikipedia "Incendios de la sierra de la Culebra de 2022", con cifras de Junta de Castilla y León y Sentinel-2/Copernicus.

2. **"En Losacio murieron cuatro personas: un bombero forestal y un pastor alcanzados directamente por las llamas, y dos vecinos más que fallecieron semanas y meses después por las quemaduras que sufrieron huyendo del fuego — la mitad de las muertes no fue instantánea, fue gente que sobrevivió al primer contacto con el fuego pero no a la decisión de cuándo y por dónde salir."** — Fuente: Wikipedia citando Zamora24horas (17 jul 2022) y La Opinión de Zamora (17 ago 2022).

3. **"Existen dos activaciones reales de Copernicus con perímetro descargable para estos incendios — EMSR580 para Sierra Culebra y EMSR602 para Losacio, esta última con 14 productos sobre 8 zonas — podemos cargar el perímetro real de 2022 en nuestro sistema, no un mapa inventado."** — Fuente: mapping.emergency.copernicus.eu, comprobado directamente en las páginas de activación EMSR580 y EMSR602.

4. **"En julio de 2025, en Lleida, dos personas murieron porque su vehículo se quedó atascado mientras intentaban escapar del fuego — es exactamente el escenario que nuestro sistema quiere evitar: no decidir la ruta a tiempo."** — Fuente: El País (Congostrina/Carranco), 2 julio 2025, vía Wikipedia "Incendios forestales de España de 2025".

5. **"En Pedrógão Grande, Portugal, de las cerca de 65 personas que murieron en 2017, 47 murieron en una carretera intentando huir — 30 atrapadas en el coche, 17 a pie. Y en Paradise, California, en 2018, el pueblo entero fue arrasado en dos horas y cuarto desde que se detectó el fuego. La decisión de cuándo y por dónde evacuar no es un detalle, es la diferencia entre vivir y morir."** — Fuentes: Wikipedia "Incendio forestal de Portugal de junio de 2017"; Wikipedia (inglés) "Camp Fire (2018)" citando el informe de investigación del fiscal del condado de Butte.

---

## Preguntas abiertas

1. **¿Cuántas personas se evacuaron en total por Sierra de la Culebra/Losacio 2022?** Solo tengo el título de una referencia EFE ("+3.000 evacuados") sin desarrollo en el cuerpo del artículo. Necesita ir a la fuente EFE original o a la comparecencia del consejero de Medio Ambiente de la Junta de Castilla y León (25 julio 2022, citada por Wikipedia) para un número fiable.
2. **¿Hubo de verdad una evacuación a pie de un tren detenido por el fuego en Zamora en 2022?** Lo tenía en la memoria pero la fuente consultada solo confirma cortes de la línea Zamora-Sanabria/Orense-Zamora, no una evacuación de pasajeros. Si se quiere ese detalle para la demo, verificarlo con RENFE/Adif o prensa local antes de usarlo.
3. **¿Es correcto el número de carretera "N-236" para Pedrógão Grande?** No aparece así en la fuente consultada (solo "carretera rural"). Viene de mi memoria, no de esta investigación — hay que confirmarlo con fuente portuguesa antes de decirlo en el pitch.
4. **¿Cuál es la cifra de muertos final y oficial de Mati (Grecia, 2018)?** La fuente muestra una escalada de 76→94 sin un cierre claro; la cifra ~102-104 que se cita habitualmente en prensa internacional no quedó verificada en esta sesión.
5. **¿Cuál de las dos cifras de superficie quemada en España en 2025 es correcta — ~400.000 ha (Copernicus/prensa) o 5.822 ha (atribuida a MITECO vía epdata.es)?** Son incompatibles y la propia Wikipedia no las resuelve. Hay que ir directamente a MITECO/EGIF o Copernicus/EFFIS antes de citar cualquiera de las dos.
6. **¿Cuántos incendios y cuántas personas evacuadas de media al año en España, según EGIF?** No lo encontré expuesto como cifra agregada en la página oficial de MITECO consultada (solo enlaces a PDFs/dashboards no leídos en esta sesión). El único número de "incendios/año" que sí verifiqué es puntual: 13.545 incendios en 2017.
7. **¿Qué formato de fichero contiene exactamente el "Vector Package (.zip)" de Copernicus EMS (shapefile, GeoJSON, ambos)?** No estaba documentado en el texto de las páginas de activación EMSR580/EMSR602 que pude leer; requiere descargar el zip real para confirmarlo antes de prometerle al jurado un formato concreto.
