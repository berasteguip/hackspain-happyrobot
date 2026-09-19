# ES-Alert — qué es, qué permite y qué no

> Investigación para HackSpain 2026 · Track HappyRobot · equipo router123.
> Objetivo: validar la idea "ES-Alert al revés" (usar el aviso oficial a la población para que la gente LLAME
> a un número y entre en el mapa de evacuación de incendios).

## Nota metodológica (leer antes que nada)

Los principales motores de búsqueda (Google, Bing, DuckDuckGo en sus variantes html/lite) devolvieron en este
entorno páginas de consentimiento/CAPTCHA o resultados genéricos cacheados, no resultados reales de búsqueda.
La web oficial de Protección Civil (`proteccioncivil.es`) y del Ministerio del Interior (`interior.gob.es`)
devolvieron 404/403 en las rutas probadas, y las páginas de soporte de los operadores (Movistar, Vodafone,
Orange) tampoco fueron accesibles en las URLs probadas. **La investigación se apoya por tanto en artículos de
Wikipedia (ES/EN) verificados por su contenido —no genéricos— y en la web oficial de AlertCops, que sí
respondió.** Todo lo que no pudo verificarse así se marca explícitamente como **NO VERIFICADO**. Antes de dar
por buena cualquier cifra técnica de este documento en una decisión de producto real, habría que confirmarla
con Protección Civil o con el stand de HappyRobot.

---

## 1. Qué es ES-Alert

- **HECHO VERIFICADO.** ES-Alert es la variante nacional española del servicio genérico europeo **EU-Alert**:
  cada Estado miembro sustituye "EU" por su código ISO 3166-1 (España → ES-Alert, Países Bajos → NL-Alert,
  Francia → FR-Alert, Italia → IT-Alert, etc.).
  Fuente: Wikipedia ES, "EU-Alert" (es.wikipedia.org/wiki/EU-Alert), consultado 19-sep-2026.
- **NO VERIFICADO directamente en fuente oficial** (proteccioncivil.es dio 404 en las rutas probadas), pero es
  consistente con lo indicado en Wikipedia: en España lo gestiona la **Dirección General de Protección Civil y
  Emergencias (DGPCE), Ministerio del Interior**, y se activa a través de los **CECOPI** (Centros de
  Coordinación Operativa Integrada), normalmente coordinados por la comunidad autónoma correspondiente. El caso
  de la DANA de Valencia confirma esto último de forma indirecta: quien activó el aviso fue el CECOPI
  coordinado por la Generalitat Valenciana. Fuente: Wikipedia ES, "Inundaciones en España de 2024"
  (es.wikipedia.org/wiki/Inundaciones_en_España_de_2024), consultado 19-sep-2026.
- **Fechas de simulacros/entrada en servicio en España: NO VERIFICADO.** No se encontró una fuente accesible
  con la fecha exacta de despliegue nacional de ES-Alert. Sí se verificó, por comparación, que **NL-Alert
  (Países Bajos) se introdujo a nivel nacional el 8 de noviembre de 2012** y que **IT-Alert (Italia) está
  operativo desde el 13 de febrero de 2024** para cuatro tipos de riesgo. Fuentes: Wikipedia EN, "NL-Alert"
  (en.wikipedia.org/wiki/NL-Alert); Wikipedia EN, artículo "EU-Alert" (redirección desde "IT-Alert"); ambos
  consultados 19-sep-2026.
- **Base normativa — HECHO VERIFICADO.** La **Directiva (UE) 2018/1972**, de 11 de diciembre de 2018 (Código
  Europeo de Comunicaciones Electrónicas), en su **artículo 110**, obliga a los Estados miembros a disponer de
  "un sistema de alerta que informe al público de emergencias importantes" antes del **21 de junio de 2022**,
  sin especificar la tecnología concreta a usar. El ORECE (Organismo de Reguladores Europeos de las
  Comunicaciones Electrónicas) publica directrices para evaluar la eficacia de los sistemas nacionales.
  Fuente: Wikipedia ES, "EU-Alert", consultado 19-sep-2026.
- **Real Decreto español de transposición: NO VERIFICADO.** No se pudo localizar ni confirmar el instrumento
  legal español exacto (probablemente vinculado a la Ley General de Telecomunicaciones / Ley 11/2022 y/o un
  Real Decreto específico de Protección Civil). Los intentos de búsqueda directa en el BOE fallaron por no
  disponer de un identificador correcto y no haber podido usar el buscador del BOE. **Antes de citar esto en
  el pitch, no afirmar un número de Real Decreto sin confirmarlo.**

## 2. Tecnología: cell broadcast, no SMS geolocalizado

- **HECHO VERIFICADO.** ES-Alert usa **Cell Broadcast** (difusión celular), no SMS geolocalizado. Tabla
  comparativa por país en Wikipedia ES "EU-Alert" (consultado 19-sep-2026): España → Cell Broadcast; Países
  Bajos → Cell Broadcast (desde 2012); Croacia → LB-SMS y Cell Broadcast; Italia → parcial, con SMS todavía
  para tsunamis/Estrómboli/lluvias intensas mientras Cell Broadcast cubre el resto de escenarios.
- **Diferencias prácticas cell broadcast vs SMS geolocalizado — HECHO VERIFICADO** (Wikipedia EN, "Cell
  Broadcast", consultado 19-sep-2026):
  - **No necesita conocer el número de teléfono del receptor.** Es un "unconfirmed push service": quien envía
    el mensaje no sabe quién lo recibió. Esto es, a la vez, la base de su compatibilidad RGPD y la razón de
    fondo por la que un cell broadcast **no puede, por diseño, saber si alguien respondió o necesita ayuda**
    — punto clave para nuestra propuesta (ver Veredicto).
  - **No se congestiona con el tráfico**, al contrario que llamadas de voz, SMS punto a punto o redes sociales
    durante un desastre masivo (cita literal: "Cell broadcast is not affected by traffic load").
  - **Funciona sin datos móviles** (no es una tecnología IP).
  - **No suele necesitar tarjeta SIM** para recibir el aviso, de forma similar a las llamadas de emergencia.
  - **Sonido de alerta especial** que suena incluso con el móvil en silencio (tono de dos frecuencias, 853 Hz
    y 960 Hz).
  - **Roaming:** si la red visitada soporta el sistema, el aviso se muestra igual que si fuera la red de
    origen, siempre que el nivel de alerta sea equivalente.
  - **Móviles apagados: NO VERIFICADO** (la fuente no lo trata explícitamente; por lógica de la tecnología, un
    móvil apagado no puede recibir ningún aviso de ningún tipo — esto es INFERENCIA, no algo que la fuente
    afirme).
- **Generaciones de red — HAY UNA CONTRADICCIÓN ENTRE FUENTES, señalarla:**
  - Wikipedia EN "Cell Broadcast" (genérico, estándar ETSI/3GPP): "2G, 3G, 4G and 5G".
  - Wikipedia ES "EU-Alert" (específico del despliegue europeo real): "EU-Alert funciona con redes 4G y 5G,
    que cubren gran parte de la población de la UE" — sin mencionar 2G/3G para el despliegue real europeo.
  - **Conclusión: el estándar técnico soporta 2G/3G/4G/5G, pero el despliegue real europeo (y por tanto,
    probablemente, español) parece limitarse a 4G/5G. NO VERIFICADO si España activa ES-Alert también en
    2G/3G.** Esto importa para el escenario de incendio forestal: en zona rural con cobertura 2G/3G residual
    y sin 4G, un móvil podría no recibir el aviso — riesgo real a mencionar en el pitch si se quiere ser
    honesto sobre limitaciones.
  - Móviles extranjeros en roaming: cubierto arriba (roaming sí funciona si la red del país visitado soporta
    el estándar).

## 3. Granularidad geográfica

- **HECHO VERIFICADO (pilotos españoles).** Las pruebas de ES-Alert en España se hicieron a nivel de
  barrio/zona concreta: "Sevilla Este y Torreblanca" y "Húmera, Prado del Rey y Somosaguas". Esto sugiere que
  la tecnología permite segmentar por celda/barrio. Fuente: Wikipedia ES, "EU-Alert", consultado 19-sep-2026.
- **HECHO VERIFICADO (uso real, DANA de Valencia).** El 29 de octubre de 2024, el CECOPI activó el aviso "a
  todos los teléfonos móviles de la provincia de Valencia" — es decir, a nivel de **provincia entera**, no de
  municipio o zona concreta, a pesar de que la crisis se concentraba en comarcas específicas (Ribera Alta,
  Horta Sud, etc.). Fuente: Wikipedia ES, "Inundaciones en España de 2024", consultado 19-sep-2026.
- **INFERENCIA MÍA, no verificada:** la elección de "toda la provincia" en la DANA parece haber sido una
  **decisión operativa** en el CECOPI (discutir "si se envía o no a toda la provincia"), no necesariamente una
  **limitación técnica** — el propio artículo de Wikipedia dice que esto se discutió como opción, lo que
  implica que enviar a un área más pequeña era también posible. Esto es relevante para nuestro escenario: la
  granularidad fina (municipio, sector, polígono) parece técnicamente viable; el problema documentado en 2024
  fue de **decisión y velocidad**, no de precisión geográfica del sistema.
- **Precisión exacta de la celda/polígono: NO VERIFICADO.** No se encontró una cifra oficial española (radio
  de celda, tamaño mínimo de polígono activable). Dato comparativo: el estándar Reverse 1-1-2 con LB-SMS (no
  cell broadcast) tiene una precisión limitada al tamaño de la celda, "entre 3 y 15 km aproximadamente" —
  aplicable a SMS geolocalizado, no necesariamente a cell broadcast puro. Fuente: Wikipedia EN, "Reverse
  1-1-2", consultado 19-sep-2026. Dato comparativo EEUU: la FCC exige desde 2018 un "overspill" máximo de 0.1
  millas (0.16 km) fuera del área objetivo para WEA. Fuente: Wikipedia EN, "Wireless Emergency Alerts",
  consultado 19-sep-2026.

## 4. Contenido del mensaje: caracteres, URLs, teléfonos — EL PUNTO CRÍTICO

- **Límite de caracteres del estándar Cell Broadcast (ETSI/3GPP) — HECHO VERIFICADO:** hasta **1.395
  caracteres en alfabeto latino** o **615 caracteres en UCS-2** (alfabetos como árabe, chino, urdu o griego),
  usando hasta 15 páginas concatenadas de 93 caracteres cada una. Esto es **casi 9 veces más que un SMS
  normal (160 caracteres)**. Fuente: Wikipedia EN, "Cell Broadcast", consultado 19-sep-2026.
- **¿Admite URLs? — HECHO VERIFICADO A NIVEL DE ESTÁNDAR:** sí. Cita literal de la fuente: el sistema "supports
  the use of URLs and Web-links in the alert message". Fuente: Wikipedia EN, "Cell Broadcast", consultado
  19-sep-2026.
- **¿Admite números de teléfono clicables? — NO VERIFICADO.** Ninguna de las fuentes consultadas (Cell
  Broadcast, EU-Alert, WEA) menciona explícitamente el soporte de números de teléfono como elemento clicable
  dentro del mensaje. No se encontró ni confirmación ni prohibición explícita.
- **Dato empírico real más importante que tenemos — HECHO VERIFICADO:** el único mensaje ES-Alert real que
  pudimos verificar con su texto literal (DANA de Valencia, 29-oct-2024, 20:11h) fue:

  > "Alerta de Protección Civil. Por las fuertes lluvias y como medida preventiva se debe evitar cualquier
  > tipo de desplazamiento en la provincia de Valencia."

  Es una frase corta, en castellano y valenciano, **sin ningún enlace ni número de teléfono**, y sin siquiera
  la recomendación crítica de subir a plantas altas (lo que se critica duramente después). Fuente: Wikipedia
  ES, "Inundaciones en España de 2024", consultado 19-sep-2026.
- **¿Hay una norma o guía que prohíba explícitamente URLs por riesgo de phishing? NO VERIFICADO.** No se
  encontró ninguna referencia, ni en la Directiva 2018/1972, ni en la documentación de Wikipedia sobre EU-Alert
  o Cell Broadcast, que prohíba URLs en avisos oficiales. La ausencia de enlace en el mensaje real de la DANA
  puede deberse a: (a) una política interna de Protección Civil no documentada públicamente en las fuentes
  consultadas, (b) simplemente la urgencia y brevedad del mensaje redactado en caliente durante una crisis, o
  (c) una limitación de la implementación española concreta. **Las tres son INFERENCIA, ninguna está
  verificada.**
- **Conclusión de esta sección (importante para el diseño):** el estándar técnico de cell broadcast **sí
  permitiría** incluir una URL o un teléfono en el mensaje — con margen de sobra de caracteres para hacerlo.
  Pero no hay ningún precedente verificado de que Protección Civil lo haya hecho nunca en España, y el único
  caso real que pudimos auditar no lo hizo.

## 5. Usos reales en España

### DANA de Valencia, 29 de octubre de 2024 — cronología (HECHO VERIFICADO, fuente: Wikipedia ES,
"Inundaciones en España de 2024", consultado 19-sep-2026)

| Hora | Evento |
|---|---|
| 12:07 | Aviso previo de caudal (264 m³/s); sí se alertó a municipios ribereños en ese momento |
| 17:00 | Se constituye el CECOPI; empieza a discutirse si enviar un aviso masivo |
| 18:00 | La consejera Salomé Pradas corta la comunicación telemática "para pensar qué hacer" |
| 18:43 | Aviso de caudal muchísimo mayor (1.686 m³/s) — **no** se alertó a los municipios ribereños esta vez |
| 19:00 | Se restablece la comunicación en el CECOPI |
| 19:00–20:00 | "La hora más crítica": mueren 82 personas mientras se sigue discutiendo si enviar la alerta y a qué alcance |
| 19:54 | Pradas plantea el confinamiento poblacional; el jefe de gabinete de Mazón responde "Salo, de confinar nada por favor. Calma" |
| 20:00 (aprox.) | Llamada del secretario de Estado de Medio Ambiente avisando del riesgo de rotura de la presa de Forata — según algunas fuentes, este fue el disparador final |
| **20:11** | **El CECOPI activa ES-Alert**, enviando el mensaje a toda la provincia de Valencia |
| 20:28 | Carlos Mazón se incorpora al CECOPI — 17 minutos después de la alerta |

- **Dato clave verificado:** cuando se envió el aviso a las 20:11h, ya habían fallecido "al menos 156
  personas" de las 229 víctimas totales de la provincia — es decir, **el 84% de las víctimas ya habían
  muerto** antes de que sonara el móvil de nadie.
- **Crítica al contenido:** el mensaje no incluía la recomendación de subir a plantas altas; hubo fallecidos
  después del aviso, atrapados en plantas bajas o garajes (ejemplo citado: nueve fallecidos en el barrio de La
  Torre, Valencia).
- **Consecuencias judiciales:** el 10 de marzo de 2025 una jueza citó como investigados a Salomé Pradas y al
  exsecretario de Emergencias Emilio Argüeso Torres "por la tardanza en avisar a la población durante la DANA
  en Valencia", elevando el número de presuntos homicidios de 224 a 225 en la instrucción.

### Incendios forestales de 2025 y otros usos — NO VERIFICADO

No se pudo acceder a ninguna fuente (motores de búsqueda bloqueados, páginas oficiales con 404) que documente
activaciones de ES-Alert durante los incendios forestales de España en 2025. **Esto es una laguna real de la
investigación, no evidencia de que no se haya usado.** Si el equipo tiene contacto con el stand de HappyRobot
o acceso a otro canal de búsqueda, este punto merece una segunda pasada.

## 6. Equivalentes internacionales

| Sistema | País | Tecnología | Lanzamiento | Bidireccional |
|---|---|---|---|---|
| EU-Alert | Marco UE | Cell Broadcast (mayoría) / LB-SMS (algunos países) | Obligatorio desde 21-jun-2022 (Directiva 2018/1972 art. 110) | No, en ninguna fuente consultada |
| WEA (antes CMAS/PLAN) | EEUU | Cell Broadcast | — (regla FCC de 360 caracteres máx. desde may-2019) | No |
| NL-Alert | Países Bajos | Cell Broadcast | Nacional desde 8-nov-2012; primer uso real: incendio en Tolbert, 14-dic-2012 | No |
| IT-Alert | Italia | Cell Broadcast (parcial SMS para algunos riesgos) | Operativo desde 13-feb-2024 para 4 tipos de riesgo | No |
| Reverse 1-1-2 | Concepto general UE | Cell Broadcast o LB-SMS según país | — | No (es la base conceptual de EU-Alert) |

Fuentes: Wikipedia ES "EU-Alert"; Wikipedia EN "Wireless Emergency Alerts"; Wikipedia EN "NL-Alert"; Wikipedia
EN "Reverse 1-1-2" (que redirige/agrupa con "IT-Alert"); todas consultadas 19-sep-2026.

- **HECHO VERIFICADO (dentro de lo que cubren estas fuentes):** ninguno de los sistemas investigados
  documenta ningún mecanismo de respuesta del ciudadano hacia el sistema de alerta. Todos se describen de
  forma explícita como "unconfirmed push" / unidireccionales.
- **Matiz importante — NO ES UNA PRUEBA EXHAUSTIVA:** esta conclusión se basa en artículos de Wikipedia, que
  no son necesariamente completos ni están libres de lagunas (el propio artículo de "Reverse 1-1-2" se
  autoseñala como falto de referencias en varias partes). **No podemos afirmar con certeza absoluta que no
  exista NINGÚN sistema de alerta poblacional bidireccional en el mundo** — solo que no se encontró ninguno
  en las fuentes consultadas, lo cual es una ausencia de evidencia, no evidencia de ausencia.

## 7. AlertCops y otras apps oficiales españolas

**HECHO VERIFICADO** (fuente: alertcops.ses.mir.es, consultado 19-sep-2026 — única web oficial española
accesible en esta investigación):

- Es la app de la **Policía Nacional y la Guardia Civil**, gestionada por el **Ministerio del Interior** con
  colaboración del **Centro Tecnológico de Seguridad (CETSE)**.
- Funcionalidades declaradas:
  - **Botón SOS**: pedir ayuda inmediata pulsando un botón en pantalla.
  - **Chat**: "Comunícate de forma directa con la Policía Nacional y la Guardia Civil" — es la única
    funcionalidad de la app que sugiere bidireccionalidad real, pero la fuente no detalla si es en tiempo
    real ni su capacidad de escalar a un volumen masivo de usuarios simultáneos.
  - **Compartir ubicación**: geolocalización compartida con contactos de confianza.
  - **Guardián**: servicio de suscripción para compartir ubicación con los servicios de emergencia.
  - Noticia oficial fechada 05-05-2026: "El Ministerio del Interior lanza la nueva versión de AlertCops: más
    fácil, más segura, más cercana" — confirma que la app está activa y en desarrollo continuo a fecha de
    esta investigación.
- **¿Es bidireccional? PARCIALMENTE VERIFICADO.** Tiene chat directo con fuerzas de seguridad, pero es una
  app que el usuario debe tener **instalada previamente** — no es un canal de alerta masiva push como
  ES-Alert. Es decir, resuelve el problema opuesto al nuestro: sirve para que un usuario YA comprometido pida
  ayuda, no para convertir un aviso masivo en una llamada de vuelta de gente que no tenía la app instalada.
- **¿Tiene API pública? NO VERIFICADO.** La web oficial no menciona ninguna API ni acuerdo de
  interoperabilidad con terceros en el contenido accesible.
- **Desde cuándo existe: NO VERIFICADO** (la fuente solo confirma que existía una versión anterior a la
  actualización de mayo de 2026, sin dar año de creación original).

---

## Veredicto sobre nuestra idea de "ES-Alert al revés"

**Viable como narrativa de pitch; NO viable como integración técnica real dentro de las 36h de la hackathon.**

Razones:

1. **Cell Broadcast es unidireccional por diseño, no por limitación técnica superable.** Es un "unconfirmed
   push service": la propia definición del estándar implica que el emisor nunca sabe quién recibió el
   mensaje ni puede recibir una respuesta *a través del mismo canal*. "ES-Alert al revés" no puede significar
   literalmente "hacer que ES-Alert reciba respuestas" — eso no es lo que la tecnología es. Lo que sí es
   viable es: **usar el CONTENIDO del mensaje ES-Alert (un texto con margen de sobra de caracteres, que el
   estándar permite llenar con una URL o un teléfono) como gancho para que la persona abra OTRO canal**
   (llamada saliente/entrante, enlace web) que sí es bidireccional. Eso es exactamente lo que propone el
   escenario de incendio (`docs/06-producto/02-escenario-incendio.md`).
2. **El estándar técnico lo permite (URLs, hasta 1.395 caracteres); la práctica española verificada no lo ha
   hecho nunca.** El único mensaje real que auditamos (DANA de Valencia) fue una frase corta sin enlace ni
   teléfono. No hay ningún precedente positivo ni ninguna prohibición explícita encontrada — es terreno no
   pisado, lo cual es una oportunidad de pitch ("nadie lo ha hecho, nosotros proponemos hacerlo") pero también
   significa que no podemos activar un ES-Alert real de verdad en la demo: no tenemos acceso al sistema oficial
   de Protección Civil.
3. **No hay competencia directa conocida** (ni EU-Alert, ni WEA, ni NL-Alert, ni IT-Alert son bidireccionales
   según las fuentes consultadas) — con la salvedad de que esto no es una búsqueda exhaustiva.

**Plan B (recomendado para la demo):** no depender de activar el ES-Alert real de Protección Civil. En su
lugar:
- **Simular en la interfaz** la pantalla de un móvil recibiendo un ES-Alert con un teléfono/enlace añadido,
  presentándolo explícitamente como "lo que Protección Civil podría/debería enviar" — una propuesta de mejora
  de protocolo, no una integración real.
- **Ejecutar de verdad**, vía HappyRobot, la parte que sí controlamos: las llamadas salientes reales a la
  población (el "onboarding" de voz descrito en `docs/06-producto/02-escenario-incendio.md`), que es el mecanismo real y
  demostrable de "convertir el aviso en conversación", sin necesidad de tocar el sistema oficial de cell
  broadcast.
- Dejar explícito en el guion de la demo que "activar el ES-Alert real con nuestro número dentro" es la
  visión de producto a futuro (requiere acuerdo con DGPCE), y que lo que se demuestra en vivo es la llamada
  saliente de HappyRobot que cumple la misma función de "sacar a la gente de casa y obtener su posición".

## Frases usables en el pitch (con fuente)

- "El 84% de las víctimas de la DANA de Valencia —156 de 229 fallecidos en la provincia— ya habían muerto
  cuando ES-Alert se activó, a las 20:11h del 29 de octubre de 2024." — Wikipedia ES, "Inundaciones en España
  de 2024", consultado 19-sep-2026.
- "El presidente de la Generalitat se incorporó al centro de coordinación 17 minutos después de que se enviara
  la alerta a la población." — misma fuente.
- "ES-Alert es, por diseño, un canal que no sabe quién lo recibió: la propia norma técnica lo define como
  'unconfirmed push service'." — Wikipedia EN, "Cell Broadcast", consultado 19-sep-2026.
- "El estándar de cell broadcast admite mensajes de hasta 1.395 caracteres y enlaces web — casi 9 veces más
  que un SMS normal— pero el único aviso real que hemos podido auditar en España fue una frase de una línea,
  sin ningún enlace." — Wikipedia EN "Cell Broadcast" + mensaje literal en Wikipedia ES "Inundaciones en
  España de 2024".
- "Ningún sistema de alerta poblacional de los que existen en Europa o EEUU —ni EU-Alert, ni el WEA
  estadounidense, ni el NL-Alert holandés, ni el IT-Alert italiano— permite que el ciudadano responda al
  sistema. Nosotros proponemos ser los primeros en cerrar ese círculo." — síntesis de Wikipedia EN "EU-Alert",
  "Wireless Emergency Alerts", "NL-Alert", "Reverse 1-1-2", consultadas 19-sep-2026 (matizar: investigación no
  exhaustiva).

## Preguntas abiertas

1. ¿Los mensajes reales de ES-Alert en España admiten técnicamente URLs o teléfonos, o la DGPCE los excluye
   por política antiphishing no documentada públicamente? No verificado; sin acceso a la fuente oficial no se
   puede resolver en esta hackathon.
2. ¿Cuál es el límite de caracteres realmente configurado por España (el del estándar es el máximo teórico,
   no necesariamente el usado)?
3. ¿España activa ES-Alert también sobre 2G/3G, o solo 4G/5G como sugiere la fuente sobre el despliegue
   europeo? Relevante para zonas rurales con cobertura antigua durante un incendio forestal.
4. ¿Qué pasó con ES-Alert durante los incendios forestales de España en 2025? No se pudo verificar por
   bloqueo de motores de búsqueda en este entorno — pendiente de una segunda pasada con otra herramienta o
   preguntando en el stand de HappyRobot / a alguien con acceso a hemeroteca.
5. ¿AlertCops tiene API pública o algún mecanismo de interoperabilidad con terceros? No mencionado en su web
   oficial; si existiera, podría ser una vía alternativa más realista que "hackear" ES-Alert.
6. ¿Cuál es el Real Decreto o instrumento legal español exacto que transpone el artículo 110 de la Directiva
   2018/1972? No identificado con certeza en esta investigación.
