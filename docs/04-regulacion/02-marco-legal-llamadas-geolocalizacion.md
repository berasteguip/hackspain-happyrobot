# Marco legal — llamadas masivas de evacuación, geolocalización y cesión a Guardia Civil

> Investigación jurídica para el pitch de HackSpain 2026 (equipo router123, escenario de incendio forestal,
> ver `docs/06-producto/02-escenario-incendio.md` y `docs/06-producto/03-contrato-de-datos.md`). Objetivo: tener una respuesta defendible
> cuando el jurado pregunte "¿esto es legal?", sin inventar artículos.
>
> **Convención de esta nota:** cada afirmación normativa lleva una etiqueta:
> - 🟢 **HECHO VERIFICADO** — leído directamente en la fuente oficial (URL incluida), en español salvo que se indique.
> - 🟡 **INTERPRETACIÓN** — lectura razonable del texto verificado, pero no es una afirmación jurisprudencial ni un dictamen.
> - 🔴 **NO VERIFICADO** — no he encontrado la fuente primaria con las herramientas disponibles (sin buscador web real, solo
>   fetch de URLs conocidas). Se dice explícitamente en vez de inventar un número de artículo. Pendiente de un jurista o de
>   consulta directa a boe.es/aepd.es.
>
> Metodología: sin acceso a un motor de búsqueda real, la investigación se hizo con fetch directo a fuentes oficiales
> (EUR-Lex, BOE consolidado vía resolutor ELI, artificialintelligenceact.eu, privacy-regulation.eu, Wikipedia/GSMA para AML).
> Las páginas del BOE y de EUR-Lex para leyes largas se truncaron en varios intentos por tamaño — donde eso pasó, se indica.

---

## 1. Base jurídica para tratar datos personales en emergencia (RGPD)

### 1.1 Artículo 6.1.d — interés vital

🟢 **HECHO VERIFICADO.** Art. 6.1.d RGPD: "el tratamiento es necesario para proteger intereses vitales del interesado
o de otra persona física." (Fuente: https://www.privacy-regulation.eu/es/6.htm, texto oficial en
https://eur-lex.europa.eu/legal-content/ES/TXT/?uri=CELEX%3A32016R0679)

🟡 **INTERPRETACIÓN — ¿requiere incapacidad física para consentir?** El RGPD no exige expresamente esa condición en el
art. 6.1.d (a diferencia del art. 9.2.c, ver 1.3). La guía doctrinal habitual (EDPB, no verificado el texto exacto aquí)
es que el interés vital es una base *subsidiaria*: solo se usa cuando no hay otra base claramente aplicable, y típicamente
se invoca cuando el interesado no puede consentir (inconsciente, en peligro inmediato) o cuando el tratamiento protege a
*otra* persona distinta del interesado. Una llamada donde la persona sí puede hablar y sí puede decir "sí, comparto mi
ubicación" encaja mejor en **consentimiento (art. 6.1.a)** que en interés vital puro — el interés vital sirve sobre todo
para justificar el tratamiento de quien **no contesta** (la lista de "casas sin contestar" de la sección 4.1 del escenario)
o de quien contesta pero no puede prestar un consentimiento válido (menores, personas con discapacidad cognitiva, pánico).

### 1.2 Artículo 6.1.e — misión de interés público

🟢 **HECHO VERIFICADO.** Art. 6.1.e: "el tratamiento es necesario para el cumplimiento de una misión realizada en interés
público o en el ejercicio de poderes públicos conferidos al responsable del tratamiento." Y el art. 6.3 exige que esa base
"deberá ser establecida por: a) el Derecho de la Unión, o b) el Derecho de los Estados miembros que se aplique al
responsable del tratamiento", con finalidad determinada en dicha base jurídica, proporcional al fin legítimo.
(Fuente: https://www.privacy-regulation.eu/es/6.htm)

🟡 **INTERPRETACIÓN.** Esto **sí exige una ley habilitante concreta**, no basta con invocar "interés público" en abstracto.
Para Protección Civil, esa ley habilitante es candidata natural la **Ley 17/2015 del Sistema Nacional de Protección Civil**
(sección 2) — pero como se detalla ahí, el texto que he podido leer no menciona expresamente "datos personales" ni cubre
con el detalle que exige el art. 6.3 (tipos de datos, plazos de conservación, etc.). Esto es un hueco real: la base de
interés público es la más "natural" para un sistema B2G de Protección Civil, pero su solidez depende de que exista una
norma con rango de ley que cubra el tratamiento con ese nivel de detalle — **pregunta para un jurista**: ¿la Ley 17/2015
es suficiente base del art. 6.3, o falta una norma de desarrollo (reglamento, protocolo del CECOPI) que la complete?

### 1.3 Artículo 9 — categorías especiales de datos (¿es la movilidad reducida un dato de salud?)

🟢 **HECHO VERIFICADO.** Art. 9.1: prohibición general de tratar datos que revelen "origen étnico o racial, opiniones
políticas, convicciones religiosas o filosóficas, o afiliación sindical", datos genéticos, "datos biométricos dirigidos a
identificar de manera unívoca a una persona física", "datos relativos a la salud o datos relativos a la vida sexual o las
orientaciones sexuales". Excepciones relevantes:
- Art. 9.2.c: "el tratamiento es necesario para proteger intereses vitales del interesado o de otra persona física, **en
  el supuesto de que el interesado no esté capacitado, física o jurídicamente, para dar su consentimiento**".
- Art. 9.2.g: "el tratamiento es necesario por razones de un interés público esencial, sobre la base del Derecho de la
  Unión o de los Estados miembros, que debe ser proporcional al objetivo perseguido, respetar en lo esencial el derecho a
  la protección de datos y establecer medidas adecuadas y específicas para proteger los intereses y derechos fundamentales
  del interesado."
(Fuente: https://www.privacy-regulation.eu/es/9.htm)

🟢 **HECHO VERIFICADO — definición de dato de salud.** Art. 4.15 RGPD: "datos personales relativos a la salud física o
mental de una persona física [...] que revelen información sobre su estado de salud." (Fuente:
https://www.privacy-regulation.eu/es/4.htm)

🟡 **INTERPRETACIÓN — el punto que el usuario pidió mirar con cuidado.** El contrato de datos del proyecto
(`docs/06-producto/03-contrato-de-datos.md`, campo `mobility`) usa valores `car · walking · reduced · immobile`, y `reduced`/`immobile`
llevan notas como "encamada, no sale sin ambulancia o vecino". Un dato que dice "esta persona está encamada" **revela
información sobre su estado de salud** en el sentido literal del art. 4.15, así que **hay un argumento sólido para tratarlo
como categoría especial del art. 9**, no como dato ordinario. Esto es importante porque:
- Si es dato de salud, el régimen aplicable no es solo el art. 6, sino que además hay que encontrar una excepción del
  art. 9.2. La más aplicable en emergencia es el **9.2.c (interés vital, con incapacidad para consentir)** — que calza mejor
  aquí que en el art. 6.1.d, porque el 9.2.c exige explícitamente que el interesado no pueda consentir, y alguien "encamado"
  que no puede moverse sin ayuda puede seguir siendo capaz de hablar por teléfono y sí prestar consentimiento — habría que
  distinguir caso por caso.
- El **9.2.g** (interés público esencial) exige también base legal con rango de ley y medidas específicas de
  salvaguarda — mismo hueco que en el art. 6.3.
- **Consecuencia práctica para el diseño del sistema**: si `mobility: immobile/reduced` se trata como dato de salud, el
  producto necesita un nivel de protección más alto para ese campo (cifrado, acceso restringido, base jurídica reforzada
  y explicable) que para `lat/lon` o `phone`. Esto es exactamente lo que pidió verificar la tarea y **no es una cuestión
  menor**: si un jurista confirma que `mobility` es dato de salud, el diseño actual del contrato de datos debería
  documentar qué base del art. 9.2 ampara ese campo específico, separado de la base que ampara el resto.
- 🔴 **NO VERIFICADO**: no he encontrado un dictamen de la AEPD o del EDPB que se pronuncie específicamente sobre si
  "movilidad reducida" o "persona encamada" declarada por un vecino/familiar (no por la propia persona, ni por un
  profesional sanitario) es dato de salud a efectos del art. 9. Es una interpretación razonable por analogía con el art.
  4.15, no una certeza jurisprudencial. **Pregunta para un jurista.**

### 1.4 Considerando 46 — catástrofes naturales y epidemias

🟢 **HECHO VERIFICADO (resumen fiel, no cita literal completa por limitaciones de la herramienta de fetch).** El
Considerando 46 del RGPD dice, en sustancia: el tratamiento de datos personales basado en el interés vital de otra persona
solo debe aplicarse cuando el tratamiento no pueda ampararse manifiestamente en otra base jurídica; y **algunos tipos de
tratamiento pueden responder tanto a motivos importantes de interés público como a los intereses vitales del interesado**,
por ejemplo cuando el tratamiento es necesario con fines humanitarios, incluido el control de epidemias y su propagación, o
en situaciones de emergencia humanitaria, en particular en casos de **catástrofes naturales o de origen humano**.
(Fuente: https://eur-lex.europa.eu/legal-content/ES/TXT/HTML/?uri=CELEX:32016R0679, considerandos; confirmado también por
resumen en inglés vía gdpr-info.eu)

🟡 **INTERPRETACIÓN.** Este es el considerando que más directamente respalda el escenario del proyecto: un incendio
forestal es literalmente una "catástrofe natural", y el considerando dice expresamente que ese caso puede apoyarse **a la
vez** en interés público (6.1.e) y en interés vital (6.1.d/9.2.c). Es la pieza más citable del RGPD para este proyecto,
precisamente porque menciona el supuesto de hecho casi literalmente.

### 1.5 ¿La geolocalización es un dato personal? Régimen de tráfico/localización (ePrivacy)

🟡 **INTERPRETACIÓN, pero pacífica.** La geolocalización (lat/lon asociada a una persona identificada o identificable, como
en el modelo `Person` del contrato de datos) es dato personal sin duda: identifica o permite ubicar a una persona física
identificada. No hace falta un artículo específico para esto — se deduce directamente de la definición de "dato personal"
del art. 4.1 RGPD (información sobre persona física identificada o identificable). No lo he verificado literalmente porque
es un punto de partida no controvertido.

🟢 **HECHO VERIFICADO — art. 15 Directiva 2002/58/CE (ePrivacy), régimen de datos de tráfico/localización de operadoras.**
El art. 15.1 permite a los Estados miembros **restringir** ciertos derechos y obligaciones de la directiva (incluidos los
relativos a confidencialidad de las comunicaciones y datos de tráfico/localización) cuando sea "necesaria, proporcionada y
apropiada en una sociedad democrática" para fines como la seguridad del Estado, la defensa, la seguridad pública, o la
prevención/investigación/detección de delitos; y permite la conservación de datos por un plazo limitado con esas
finalidades. (Fuente: https://eur-lex.europa.eu/legal-content/ES/TXT/HTML/?uri=CELEX:32002L0058, art. 15)

🟡 **INTERPRETACIÓN.** Este artículo 15 es la puerta por la que las operadoras (Movistar, Vodafone, Orange...) pueden
tener obligaciones o habilitaciones especiales de localización en emergencias — pero regula la relación
Estado-operadora (a través de norma nacional), no directamente la relación entre el vecino y un sistema de Protección
Civil como el del proyecto. Es relevante para la **Capa 3** del escenario (convenios con operadoras, sección 9 de
`docs/06-producto/02-escenario-incendio.md`), no para la Capa 0-2 que usa llamada + SMS/WhatsApp con consentimiento directo del vecino.

---

## 2. Ley 17/2015, del Sistema Nacional de Protección Civil

🟢 **HECHO VERIFICADO** (BOE-A-2015-7730, texto consolidado vía
https://www.boe.es/eli/es/l/2015/07/09/17/con — el fetch se truncó antes del final del texto, así que puede haber
disposiciones adicionales no revisadas):

- **Art. 7 bis, apartado 1** — deber de colaboración: obligación general de "colaborar, personal o materialmente, en la
  protección civil, en caso de requerimiento de la autoridad competente."
- **Art. 7 bis, apartado 2** — obligación de "realización de las prestaciones personales que exijan las autoridades
  competentes" en emergencia declarada.
- **Art. 7 bis, apartado 6** — el personal de vigilancia/seguridad de empresas "se considerarán, a todos los efectos,
  colaboradores en la protección civil."
- **Art. 7 bis, apartado 7** — deberes de titulares de centros/actividades de riesgo, incluida la instalación y
  mantenimiento de sistemas de generación de señales de alarma.
- **Art. 7 bis, apartado 8** — deber específico de los **medios de comunicación**: "están obligados a colaborar de manera
  gratuita con las autoridades en la difusión de las informaciones" (relevante para el Capa 0 "ES-Alert" del escenario,
  no para llamadas individuales).
- **Art. 9** — Red Nacional de Información sobre Protección Civil: intercambio de información sobre riesgos, planes y
  recursos entre administraciones, en términos generales de "información", no específicamente de "datos personales".
- **Art. 21.4** — intercambio de datos entre Administraciones y el Consorcio de Compensación de Seguros: "podrán
  intercambiarse los datos sobre beneficiarios de las ayudas e indemnizaciones que se concedan."
- **Art. 5.3** — identificación de víctimas: obligación de identificar "lo más rápidamente posible a las víctimas" y
  ofrecer información a familiares.

🔴 **NO VERIFICADO / hueco real.** En el texto al que he tenido acceso **no aparece ninguna referencia explícita a
"operadoras de telecomunicaciones"** como sujeto obligado a colaborar, ni **ningún artículo que mencione expresamente el
"tratamiento", "cesión" o "comunicación de datos personales"** en el sentido de normativa de protección de datos
(no se cita ni la LOPD ni el RGPD en el articulado que pude leer). Esto es relevante porque el escenario del proyecto
(sección 9, Capa 3) afirma: *"La Ley del Sistema Nacional de Protección Civil obliga a colaborar y el RGPD cubre interés
vital e interés público"* — la primera mitad de esa frase (deber general de colaboración, art. 7 bis.1) está verificada;
la mención específica a operadoras de telecomunicaciones **no la he podido confirmar con el texto legal** y podría requerir
otra norma (posiblemente la LGTel, sección 3) o un convenio sectorial específico, no la Ley 17/2015 en sí misma.

---

## 3. Ley 11/2022, General de Telecomunicaciones — 112 y localización del llamante

🟢 **HECHO VERIFICADO (parcial).** Confirmado que https://www.boe.es/eli/es/l/2022/06/28/11/con es el texto consolidado
de la Ley 11/2022, de 28 de junio, General de Telecomunicaciones (BOE-A-2022-10757). El **preámbulo** de la ley (apartado
IV) menciona expresamente que el **Título III** regula, entre otras materias, las "garantías de acceso a las
comunicaciones de emergencia y al número 112, de emergencias de ámbito europeo", y que "se refuerza el funcionamiento del
número 112 como número de llamada de emergencia en toda Europa". Por la estructura del índice, esa materia debería estar en
el **Capítulo III del Título III (arts. 56 a 63)**, dedicado según el propio Título a "derechos de los usuarios de las
telecomunicaciones y las garantías de acceso a las comunicaciones de emergencia y al número 112".

🔴 **NO VERIFICADO — número exacto del artículo.** El fetch del texto completo de la ley se truncó por tamaño antes de
llegar al articulado de los arts. 56-63 (se cortó en el art. 17), y las búsquedas que he podido hacer (sin motor de
búsqueda real disponible en esta sesión) no devolvieron el texto literal de esos artículos. **No voy a inventar el número
exacto** (p. ej. "artículo 61") sin haberlo leído. Lo que sí se puede afirmar con la fuente disponible: la obligación de
garantizar el acceso a comunicaciones de emergencia y la transmisión de la localización del llamante al 112 **existe en
la ley vigente**, dentro del Título III Capítulo III — pero el número exacto del artículo y su redacción literal quedan
como pendiente de verificación directa en boe.es antes de citarlo en una diapositiva o documento formal.

🟡 **INTERPRETACIÓN.** El origen de esta obligación en España no es autónomo: viene de transponer el **Código Europeo de
Comunicaciones Electrónicas (Directiva (UE) 2018/1972)**, que exige a los Estados miembros garantizar que la información
de localización del llamante llegue automáticamente al PSAP (punto de recepción de llamadas de emergencia) — ver sección 4
sobre AML, que sí está verificada con más detalle.

---

## 4. AML (Advanced Mobile Location) — ¿el 112 ya recibe el GPS sin pedir permiso?

🟢 **HECHO VERIFICADO (fuente secundaria: Wikipedia en inglés, con referencias a ETSI y a la normativa de la UE;
no he podido verificar el texto legal primario de la directiva delegada ni de la Directiva 2018/1972 directamente en esta
sesión — tratar como fuente de calidad razonable pero secundaria):**

- AML es "a protocol to transport data with SMS and/or HTTPS from the phone to the emergency call centre"; explícitamente
  "it is not an app and does not require any action from the caller."
- Fue estandarizado técnicamente por **ETSI** en 2019.
- Una **regulación delegada que complementa la Directiva de Equipos Radioeléctricos** exige que todos los smartphones
  vendidos en el mercado único de la UE incorporen AML desde marzo de 2022.
- El **Código Europeo de Comunicaciones Electrónicas** (que corresponde a la Directiva (UE) 2018/1972, aunque el artículo
  de Wikipedia no cita el número de artículo exacto) obligó a todos los Estados miembros de la UE a implementar AML antes
  de diciembre de 2020.
- Funcionamiento: si los servicios de localización o el wifi del teléfono están desactivados, AML los activa
  temporalmente para obtener la posición, envía los datos, y devuelve ambos ajustes a su estado anterior.
- España figura en la lista de países donde AML **está desplegado** (dato de octubre de 2024), pero la fuente no precisa
  la fecha exacta de despliegue en España ni el detalle de compatibilidad Android/iOS para el caso español.
(Fuente: https://en.wikipedia.org/wiki/Advanced_Mobile_Location — la versión en español del artículo no existe o no está
indexada, devolvió 404)

🟡 **INTERPRETACIÓN — por qué esto ayuda mucho al caso del proyecto.** Si AML ya envía la posición GPS del llamante al
112 **automáticamente, sin acción del usuario y sin pedir un consentimiento específico separado**, eso es un precedente
regulatorio europeo muy fuerte de que **la localización de quien llama a un servicio de emergencia (o de quien un
servicio de emergencia llama, por analogía funcional) puede tratarse con una base jurídica distinta del consentimiento
explícito** — probablemente interés público/interés vital, exactamente las bases del art. 6.1.d/6.1.e RGPD. El caso del
proyecto es **más protector** que AML en un aspecto relevante para el pitch: el sistema **sí pide permiso explícito**
("pedir permiso para conocer su ubicación", sección 3 de `docs/06-producto/02-escenario-incendio.md`) antes de mandar el enlace de
geolocalización, mientras que AML ni siquiera pregunta. Esto es un argumento de comparación útil, no una prueba de que el
diseño del proyecto sea legal por sí solo — son dos flujos de datos distintos (llamante→112 vs. Protección Civil→vecino) y
un jurista podría matizar hasta qué punto la analogía es aplicable.

---

## 5. Consentimiento verbal grabado en la llamada

🟢 **HECHO VERIFICADO.** Art. 7.1 RGPD: "Cuando el tratamiento se base en el consentimiento del interesado, el
responsable deberá ser capaz de demostrar que aquel consintió el tratamiento de sus datos personales."
(Fuente: https://www.privacy-regulation.eu/es/7.htm)

🟡 **INTERPRETACIÓN.** El RGPD no exige una forma específica (no exige firma ni formulario web): exige poder **probar**
que hubo consentimiento. Una llamada grabada donde la persona dice explícitamente "sí, comparto mi ubicación" es, en
principio, un medio de prueba válido — es análogo a la práctica extendida en telemarketing de grabar el "sí, acepto" como
evidencia. Para que sea un consentimiento válido conforme al art. 4.11 RGPD (no verificado el texto exacto de esa
definición en esta sesión, pero es de uso común: manifestación de voluntad libre, específica, informada e inequívoca),
la pregunta que hace el agente antes de grabar la respuesta debe:
- explicar con claridad para qué se usa la ubicación (guiado individual, no vigilancia genérica),
- no estar mezclada con otras preguntas de forma que no quede claro a qué está diciendo "sí" la persona,
- ofrecer la posibilidad real de decir "no" sin que eso corte el resto de la ayuda (evacuación, información) — un "no"
  a la geolocalización no debería significar "no te ayudamos a salir".

🔴 **NO VERIFICADO.** No he podido acceder al texto de las Directrices 05/2020 del EDPB sobre consentimiento
(intenté descargar el PDF oficial del EDPB y consultar la página de resumen; ambos intentos fallaron con la herramienta
disponible en esta sesión) ni a un informe específico de la AEPD sobre validez del consentimiento verbal en llamadas.
Es una pieza que un jurista debería poder citar de memoria o localizar fácilmente (son directrices muy conocidas), pero yo
no la he verificado con fuente primaria aquí.

---

## 6. Grabación de llamadas, IA, y el Reglamento Europeo de IA (AI Act, Reglamento UE 2024/1689)

### 6.1 Deber de informar de la grabación

🟡 **INTERPRETACIÓN, con base general no verificada artículo por artículo en esta sesión.** El deber de informar de que
una llamada se está grabando viene del deber general de información del RGPD (arts. 13/14, no verificados aquí
literalmente) y de la normativa española de protección de datos (LOPDGDD). Es una obligación bien asentada y no
controvertida en el sector de contact centers en España — pero no he verificado el artículo exacto de la LOPDGDD que la
recoge en detalle en esta sesión (el fetch de la LOPDGDD llegó hasta el art. 38 y no encontré un artículo dedicado
expresamente a "grabación de llamadas").

### 6.2 Artículo 50 AI Act — obligación de informar de que se habla con una IA

🟢 **HECHO VERIFICADO (resumen fiel por apartados, no cita literal completa por limitaciones de la herramienta de
fetch).** El art. 50 del Reglamento (UE) 2024/1689 (AI Act) establece, en síntesis:

- **Apartado 1**: los proveedores deben garantizar que los sistemas de IA que interactúan directamente con personas
  físicas estén diseñados de forma que estas sepan que están interactuando con un sistema de IA, salvo que resulte
  evidente para una persona razonablemente informada. Hay una excepción para sistemas de IA autorizados por ley para
  detectar/prevenir/investigar/enjuiciar delitos (con matices).
- **Apartado 2**: obligaciones de marcado de contenido sintético (audio/imagen/vídeo/texto generado por IA) en formato
  legible por máquina y detectable.
- **Apartado 3**: obligaciones de informar sobre sistemas de reconocimiento de emociones o categorización biométrica.
- **Apartado 4**: obligación de revelar "deepfakes" y contenido generado artificialmente, con matices para obras
  artísticas/satíricas y para texto de interés público con revisión editorial humana.
- **Apartado 5**: la información debe darse de forma clara y distinguible, a más tardar en el momento de la primera
  interacción.
(Fuente: https://artificialintelligenceact.eu/article/50/ — nota: es una fuente secundaria especializada, no el DOUE
directamente; recomendable confirmar contra https://eur-lex.europa.eu/legal-content/ES/TXT/?uri=CELEX:32024R1689 antes
de citarlo en un documento formal, ya que ese fetch no llegó al articulado por tamaño de página)

🟡 **INTERPRETACIÓN — aplicación directa al proyecto.** El apartado 1 aplica **de lleno**: un agente de voz que llama a
un vecino durante una evacuación es exactamente el supuesto "sistema de IA que interactúa directamente con una persona
física". El agente **debe** decir, al principio de la llamada, que quien habla es un sistema de IA (salvo que fuera
"evidente", lo cual no aplica a una llamada de voz realista). Esto es un requisito de diseño, no solo legal: **el guion
del agente debe incluir una frase de auto-identificación como IA al inicio de la llamada.**

🟢 **HECHO VERIFICADO — fecha de aplicación del art. 50.** Según el art. 113 del Reglamento (fuente:
https://artificialintelligenceact.eu/article/113/, que resume el texto oficial): la regla general del art. 113 es que el
Reglamento **se aplica desde el 2 de agosto de 2026**. El art. 50 (Capítulo IV) no está entre las excepciones con fecha
adelantada o retrasada que lista el propio art. 113 (Capítulos I-II desde 2 de febrero de 2025; sistemas de alto riesgo
del Anexo III desde 2 de diciembre de 2027), así que **sus obligaciones se rigen por la regla general: 2 de agosto de
2026.** Dato relevante para el pitch: a fecha de la hackathon (19 de septiembre de 2026) **el art. 50 ya está en
aplicación** — no es una obligación futura, es actual.

### 6.3 Anexo III — ¿el agente de voz de emergencias es "alto riesgo"?

🟢 **HECHO VERIFICADO — cita literal en inglés (el fetch no pudo darla en español; el texto en inglés es el hallado en la
fuente).** Anexo III, apartado 5, letra d) del AI Act:

> "AI systems intended to evaluate and classify emergency calls by natural persons or to be used to dispatch, or to
> establish priority in the dispatching of, emergency first response services, including by police, firefighters and
> medical aid, as well as of emergency healthcare patient triage systems."

(Fuente: https://artificialintelligenceact.eu/annex/3/ — recomendable confirmar contra el texto oficial del DOUE en
español antes de citarlo formalmente)

🟡 **INTERPRETACIÓN — esto es el hallazgo más importante de toda la investigación y hay que tratarlo con cuidado en el
pitch.** Traducido: son de alto riesgo los sistemas de IA destinados a **evaluar y clasificar llamadas de emergencia**, o
a **despachar o priorizar el despacho de servicios de primera intervención** (policía, bomberos, asistencia médica),
incluidos los sistemas de triaje de pacientes en emergencia sanitaria.

El sistema del proyecto hace varias de estas cosas exactamente:
- Prioriza a quién se atiende primero por `minutes_to_front` y factores de vulnerabilidad (`priority_score`,
  sección 4 de `docs/06-producto/03-contrato-de-datos.md`) — esto es "establecer prioridad" de forma bastante literal, aunque el
  Anexo III habla de priorizar el **despacho de servicios de primera intervención** (policía/bomberos/sanidad), no de
  priorizar a quién se evacúa primero. Hay un matiz real aquí:
  - **Sí encaja con bastante claridad**: la priorización de qué **casas sin contestar** recibe la Guardia Civil primero
    (sección 4.1 del escenario, campo `priority_rank` en `House`) — eso es literalmente "establecer prioridad en el
    despacho" de un servicio de primera intervención (Guardia Civil/Policía Local actuando en emergencia). Y la
    priorización de descarga de medios aéreos por sector (sección 4.3 del escenario) también encaja: es priorizar el
    despacho de un medio de primera intervención (el helicóptero de extinción, análogo funcional a "asistencia médica"
    en el sentido de servicio de emergencia con medios limitados).
  - **Encaja peor**: la priorización de a qué vecino se llama o guía primero (`priority_score` de personas) no es
    "despacho de servicios de primera intervención" en sentido estricto — es priorización de *a quién ayudar*, no de
    *qué recurso de emergencia despachar*. Es una zona gris, no una respuesta clara.
- El agente no "evalúa y clasifica llamadas de emergencia" en el sentido de un 112 clásico (no decide qué tipo de
  recurso enviar a partir de una llamada entrante de socorro) — es una llamada **saliente** de evacuación, un caso de uso
  distinto del que el Anexo III parece tener en mente (que es más el propio sistema de gestión del 112/PSAP). Pero el
  texto del Anexo III no distingue expresamente llamadas entrantes de salientes, así que no se puede descartar la
  aplicación solo por eso.

**Conclusión honesta**: hay un **riesgo real y no trivial** de que partes del sistema (en concreto, la asignación de
prioridad a patrullas de Guardia Civil y a medios aéreos) caigan dentro del Anexo III, apartado 5.d, y por tanto sean
"alto riesgo" conforme al AI Act. Si eso se confirma, conlleva obligaciones mucho más pesadas que el art. 50 (gestión de
riesgos, calidad de datos, documentación técnica, supervisión humana reforzada, registro en la base de datos de la UE,
evaluación de conformidad) — obligaciones que, según el art. 113, entran en aplicación el **2 de diciembre de 2027**, no
antes. Para una hackathon esto no bloquea nada (es un prototipo, no un sistema en producción, y la fecha de aplicación aún
no ha llegado), pero **es exactamente el tipo de riesgo que el jurado puede plantear y que conviene reconocer
proactivamente en el pitch en vez de que lo señale el jurado primero.** 🔴 **NO VERIFICADO**: no he consultado si existe
alguna exención para uso por autoridades públicas de protección civil/emergencias dentro del propio AI Act (el
Reglamento tiene exenciones para "seguridad nacional" y para determinados usos militares/policiales que no he revisado
en detalle) — pregunta directa para un jurista antes de dar esto por cerrado.

---

## 7. Compartir la lista de casas sin contestar con Guardia Civil / Policía Local

🟢 **HECHO VERIFICADO — LO 7/2021 no es la norma aplicable aquí.** La Ley Orgánica 7/2021, de 26 de mayo (BOE-A-2021-8806,
verificado vía https://www.boe.es/eli/es/lo/2021/05/26/7/con), que regula el tratamiento de datos por autoridades
competentes con fines penales, define su objeto en el **art. 1**: tratamiento con fines de "prevención, detección,
investigación y enjuiciamiento de infracciones penales o de ejecución de sanciones penales" y protección frente a
amenazas a la seguridad pública. El **art. 2, apartado 3, letra a)** excluye expresamente de su ámbito "los realizados por
las autoridades competentes para fines distintos de los previstos en el artículo 1", que quedan sometidos al RGPD y a la
LO 3/2018 (LOPDGDD).

🟡 **INTERPRETACIÓN.** Esto es una buena noticia para el proyecto: compartir con la Guardia Civil la lista de casas sin
contestar **no es una actividad de investigación penal**, es coordinación de protección civil/rescate — por tanto **cae
fuera del ámbito de la LO 7/2021** y se rige por el **RGPD y la LOPDGDD ordinarios** (las mismas bases jurídicas de la
sección 1: interés vital + interés público), no por el régimen más estricto de la directiva penal. Esto simplifica el
análisis: no hay que justificar la cesión como "cooperación policial en materia penal", basta con que la cesión entre
Protección Civil y Guardia Civil/Policía Local esté cubierta por la misma base de interés público/interés vital que
ampara el tratamiento original, y que la finalidad de la cesión (encontrar y evacuar a la persona) sea compatible con la
finalidad original (evacuarla) — lo cual es casi tautológico aquí, es la misma finalidad.

🔴 **NO VERIFICADO.** No he encontrado un artículo específico (ni en la Ley 17/2015 ni en la LOPDGDD) que regule
expresamente el **procedimiento** de cesión de datos entre Protección Civil y Fuerzas y Cuerpos de Seguridad del Estado
en emergencia (por ejemplo, si necesita un convenio previo, un protocolo del CECOPI, o basta con la actuación directa del
director del plan de emergencia). Es razonable que exista algo en la normativa de planes de protección civil autonómica
o en los protocolos del CECOPI, pero no lo he podido verificar aquí — **pregunta directa a Protección Civil/CECOPI o a un
jurista administrativo.**

---

## 8. Precedentes de la AEPD (incendios, emergencias, COVID)

🔴 **NO VERIFICADO — limitación importante de esta investigación.** He intentado varias vías para localizar informes
jurídicos o entradas del blog de la AEPD sobre tratamiento de datos en emergencias, incendios, catástrofes o COVID-19
(rastreo de contactos/movilidad):
- Búsqueda en el buscador de "criterios jurídicos" de aepd.es (`/informes-y-resoluciones/criterios-juridicos-aepd`):
  solo devolvió 12 resultados totales, ninguno relacionado con estos temas.
- Búsqueda en `/informes-y-resoluciones/informes-juridicos`: devolvió informes de 2017 no relacionados.
- Búsqueda del blog de la AEPD por palabras clave: la página de resultados con parámetro de búsqueda devolvió errores de
  servidor (503) en los intentos realizados.
- Motores de búsqueda externos (Bing, DuckDuckGo) usados como proxy: DuckDuckGo bloqueó con CAPTCHA; Bing devolvió
  resultados genéricos no relacionados con el tema buscado (posible problema de localización/caché de la herramienta de
  fetch, no necesariamente ausencia real de contenido en aepd.es).

**Lo que sé, sin poder citarlo con URL, es de conocimiento general no verificado en esta sesión**: es ampliamente sabido
que la AEPD publicó guías/comunicados durante la pandemia de COVID-19 sobre geolocalización y rastreo de contactos (por
ejemplo, en el contexto de apps como Radar COVID), y que el Comité Europeo de Protección de Datos (EDPB) publicó
directrices específicas sobre geolocalización y herramientas de rastreo de contactos en el contexto de la pandemia. **No
puedo dar el número de informe ni la URL exacta en este documento** porque no lo he verificado — sería inventar la cita,
que es justo lo que las reglas de esta tarea prohíben. **Antes de citar un informe AEPD/COVID en el pitch, alguien del
equipo debería confirmarlo directamente en aepd.es o edpb.europa.eu.**

---

## (a) Respuesta de 30 segundos si el jurado pregunta si es legal

*"Sí, hay una base jurídica real, no es una zona gris que nos inventamos. El RGPD, en su Considerando 46, dice
literalmente que tratar datos personales por interés vital y por interés público es la base normal en catástrofes
naturales — y un incendio forestal es exactamente eso. Además, España ya lo hace: cuando alguien llama al 112 hoy, el
teléfono manda automáticamente su GPS al centro de emergencias sin pedirle permiso — es la tecnología AML, obligatoria en
toda la UE desde 2020. Nosotros pedimos permiso explícito antes de compartir la ubicación, que es más protector que lo que
ya existe. Donde sí hay una pregunta abierta real, y la reconocemos: el Reglamento Europeo de IA clasifica como 'alto
riesgo' los sistemas que priorizan el despacho de policía, bomberos o asistencia médica — nuestra priorización de
patrullas y medios aéreos podría entrar ahí, y esas obligaciones (más pesadas: gestión de riesgo, supervisión humana
reforzada) entran en vigor en diciembre de 2027, así que tenemos tiempo, pero lo hemos identificado nosotros mismos, no
esperamos a que nos lo señalen."*

---

## (b) Qué tendríamos que hacer para ser conformes

- [ ] **Aviso de IA al inicio de la llamada** (art. 50.1 AI Act, en aplicación desde el 2 de agosto de 2026): el agente
  debe decir explícitamente, en los primeros segundos, que es un sistema de inteligencia artificial y no una persona.
- [ ] **Aviso de grabación**: informar de que la llamada se grava, antes de pedir cualquier dato o consentimiento.
- [ ] **Consentimiento específico y separado para la geolocalización**: la pregunta sobre compartir ubicación debe ser
  clara, distinta de otras preguntas, y su respuesta ("sí"/"no") debe registrarse de forma verificable (grabación +
  campo `consent_position` en el modelo `Person`, que el contrato de datos ya contempla).
- [ ] **Un "no" a la geolocalización no debe bloquear la ayuda de evacuación** — desacoplar el consentimiento de
  ubicación del resto de la asistencia, para que el consentimiento sea realmente libre (art. 4.11 RGPD, no forzado).
- [ ] **Minimización**: no pedir ni registrar más datos de los necesarios para evacuar. El campo `mobility` con valores
  `reduced`/`immobile` debería tratarse con las cautelas de un dato de categoría especial (ver sección 1.3) hasta que un
  jurista confirme si aplica el art. 9, no como un campo ordinario.
- [ ] **Retención**: el dataset sintético del hackathon no tiene plazo de retención definido — en un sistema real habría
  que fijar cuánto tiempo se conservan las posiciones, transcripciones y listas de casas tras el fin de la emergencia.
- [ ] **Base jurídica documentada por campo**, no solo por sistema: justificar por separado la base del `phone`/`lat/lon`
  ordinarios (interés público/interés vital, art. 6) y la del campo `mobility` si se trata como dato de salud (art. 9).
- [ ] **Trazabilidad de la cesión a Guardia Civil/Policía Local**: aunque cae fuera de la LO 7/2021 (sección 7), documentar
  qué protocolo o convenio ampara la cesión de la lista de "casas sin contestar", y quién la autoriza (esto conecta con el
  `DecisionLogEntry` y el `Approval Process` que ya contempla el diseño del sistema en `docs/06-producto/02-escenario-incendio.md`
  sección 7).
- [ ] **Revisar si el módulo de priorización de patrullas/medios aéreos** entra en el Anexo III.5.d del AI Act (sección
  6.3) y, si aplica, planificar las obligaciones de alto riesgo antes de cualquier despliegue real (no antes de diciembre
  de 2027, pero sí antes de un piloto con Protección Civil).
- [ ] **Confirmar con un jurista** los puntos marcados 🔴 NO VERIFICADO de este documento antes de usarlos como afirmación
  cerrada frente a un cliente real (no frente al jurado de una hackathon, donde el nivel de rigor exigido es distinto).

---

## (c) Riesgos y preguntas abiertas

1. **Anexo III.5.d AI Act** (sección 6.3): riesgo más serio identificado en esta investigación. La priorización de
   despacho de Guardia Civil y de medios aéreos podría ser "alto riesgo". Pendiente: consultar si hay exención para
   protección civil, y si la clasificación cambia según si el sistema decide autónomamente o solo asiste a un humano que
   decide (el diseño del proyecto ya incluye `Approval Process` y `Transfer` humano, lo cual podría ayudar a que el
   sistema se considere una **ayuda a la decisión humana** en vez de un sistema autónomo de despacho — matiz importante
   que un jurista debería confirmar).
2. **Movilidad reducida como dato de salud** (sección 1.3): interpretación razonable pero no confirmada con un dictamen.
   Afecta al nivel de protección exigible al campo `mobility`.
3. **Base legal exacta para la cesión Protección Civil → operadoras de telecomunicaciones** (sección 2): no encontrada en
   la Ley 17/2015; podría estar en la LGTel (sección 3, artículo no confirmado) o requerir convenio sectorial específico.
4. **Artículo exacto de la Ley 11/2022 sobre 112/localización** (sección 3): confirmado que existe y dónde vive
   (Título III, Cap. III, arts. 56-63), no confirmado el número exacto ni el texto literal.
5. **Precedentes AEPD** (sección 8): no localizados en esta sesión por limitaciones de búsqueda, no por inexistencia.
   Alguien del equipo con acceso a un buscador normal debería revisar aepd.es y edpb.europa.eu directamente antes del
   pitch, porque son muy citables si existen (dan peso de autoridad española específica, no solo norma europea).
6. **Validez exacta del consentimiento verbal** (sección 5): la interpretación es razonable (práctica extendida en
   telemarketing) pero no respaldada aquí con el texto de las Directrices EDPB 05/2020, que no pude descargar.
7. **¿Hace falta un jurista antes del piloto real con un CECOPI?** Sí, con alta probabilidad — este documento es
   suficiente para defender el diseño ante un jurado de hackathon, pero varios puntos (1, 2, 3, 4) tienen huecos reales
   que no se deberían presentar como resueltos ante un cliente B2G real.
