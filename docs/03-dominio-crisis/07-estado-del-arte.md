# Estado del arte y competencia — guiado individual de evacuación en incendios

> Investigación de mercado para defender (o descartar) la idea del equipo router123 ante el jurado de HackSpain 2026.
> Idea evaluada: `docs/06-producto/02-escenario-incendio.md`. Plataforma: `docs/02-happyrobot/03-workspace-y-limites-verificados.md`.
> Metodología: 4 líneas de investigación web en paralelo (agentes con WebSearch/WebFetch). Varios
> intentos se bloquearon por CAPTCHA de motores de búsqueda dentro de esta sesión y hubo que
> relanzarlos; todos acabaron con al menos una pasada que consiguió fetch en vivo sobre fuentes
> reales. Cada claim de este informe lleva la URL que un agente visitó de verdad; donde algo quedó
> sin confirmar se dice "no verificado" en vez de inventar (ver la sección 3 y "Limitaciones" al
> final para el detalle de qué quedó con menos cobertura).
>
> Regla seguida: distinguir siempre producto real y comprable hoy vs. anuncio de prensa/roadmap vs.
> paper académico. Donde una fuente no se pudo verificar, se dice "no verificado" en vez de inventar.

## 1. Plataformas de aviso masivo (mass notification)

| Producto | Qué hace | Voz saliente | Recoge respuesta/posición del ciudadano | Mapa geoespacial | IA generativa/agéntica | Fuente |
|---|---|---|---|---|---|---|
| **Everbridge** | Plataforma de mass notification multicanal (SMS, voz, email, app) para empresas y gobierno | Sí, "Launch by phone" | Two-way communication + geolocalización (nivel producto, no conversacional) | Sí | "Everbridge 360 AI" / AI Agent en xMatters — **disponibilidad general recién en Q4 2026**, hoy mayormente anuncio | https://www.everbridge.com/wp-content/uploads/2022/02/BO-DS-EN-Mass-Notification.pdf · https://supportcenter.everbridge.com/hc/en-us/articles/19141782360603 · https://www.webull.com/news/15588071914406912 |
| **Rave Mobile Safety** (hoy de Motorola Solutions) | Mass notification para campus/gobierno local, adquirida por Motorola en 2022 | Sí (multicanal) | No verificado a fondo (fuente propia no revisada en detalle) | Sí | No verificado | https://www.motorolasolutions.com/en_us/products/command-center-software/rave.html |
| **OnSolve / CodeRED** (hoy bajo Crisis24) | Alertas de emergencia ("severe weather warnings, evacuations, boil water notices") | Sí | No verificado | Location-based alerting, según comparativa de terceros (no fuente propia) | No verificado | https://codered.crisis24.com/ |
| **AlertMedia, Blackboard Connect, Regroup** | Mass notification multicanal (SMS/voz/email/app) | Presumible (no verificado en fuente propia) | No verificado | No verificado | No verificado | — |
| **F24 / FACT24 ENS+** | Sistema europeo de notificación de emergencias, ~5.500 clientes, enfoque B2B/gobierno | Sí (multicanal) | No verificado | No verificado | No verificado | https://f24.com/en/solutions/emergency-notification-system-2/ · https://fact24.f24.com/en/product/fact24-ens/ |
| **Hyperion** | No se pudo confirmar la existencia de una empresa relevante de mass notification con ese nombre exacto | — | — | — | — | No verificado — pedir la referencia exacta si el reto la menciona |

**Conclusión de esta capa:** ningún jugador de mass notification "clásico" pide GPS individual por
llamada de voz conversacional ni genera rutas de evacuación personalizadas. Todos operan al nivel
de "enviar una alerta a un grupo/zona", no "guiar a cada persona". La IA generativa en este segmento
está en fase de anuncio (Everbridge AI, GA Q4 2026), no de producto maduro desplegado.

### 1.1 Genasys / Zonehaven — el competidor más peligroso, investigado a fondo

Genasys (antes LRAD Corporation, fabricante de altavoces de largo alcance) adquirió **Zonehaven** en
junio de 2021. Hoy el producto se vende como **Genasys Protect**, aunque URLs heredadas de Zonehaven
siguen vivas (myzone.zonehaven.com, aware.zonehaven.com, help.zonehaven.com).

**Veredicto verificado: trabaja con ZONAS/polígonos predefinidos, no con personas individuales.**

- Terminología de producto y de las webs de decenas de condados de California: "**Know your zone**",
  "**check your zone number**", "**zone status**" (Evacuation Order / Shelter in Place / Warning) —
  siempre agregado por zona, nunca por persona.
  Fuentes: https://www.hayward-ca.gov/fire-department/disaster-preparedness/zonehaven-emergency-evacuation-platform ·
  https://help.zonehaven.com/articles/zonehaven-aware-faqs
- **Prueba de campo involuntaria — el fallo de Los Ángeles, enero 2025 (incendio Kenneth):** una alerta
  errónea llegó a ~10 millones de personas porque faltaba subir un "**evacuation area polygon**" al
  sistema; sin polígono, el sistema hizo *fallback* al condado entero en vez de al barrio concreto.
  Informe del Congreso de EEUU: https://robertgarcia.house.gov/.../false-alerts-final-report-5.10.pdf ·
  cobertura: https://www.nbclosangeles.com/news/california-wildfires/kenneth-fire-evacuation-alert-error-report/3699037/
  Este fallo **solo tiene sentido en un sistema que opera por polígono/geocerca**: si hubiera
  tracking GPS individual, la ausencia de un polígono no habría podido mandar la alerta a 10 millones
  de personas de una vez.
- Cita directa de una portavoz de Genasys a CBS News: "**If you're in the polygon, you're going to
  get an alert**"; el algoritmo "**considers population density, hazard areas and how people can get
  out**" para *dibujar* esos polígonos (no para trackear personas dentro de ellos).
  https://www.cbsnews.com/news/los-angeles-wildfires-evacuation-alerts-genasys/
- **No hay evidencia de rutas de evacuación individuales ni de recálculo dinámico por persona.**
  El producto define zonas, "traffic control points" y "arrival points" a nivel de plan de evacuación
  pre-diseñado por la agencia (https://next.zonehaven.com/evac/), es decir, planificación agregada,
  no ruta personalizada.
- **No hay evidencia de llamadas de voz con IA conversacional.** Los canales documentados son SMS,
  IPAWS-WEA, email, push, redes sociales y "voice" (sin detalle técnico) — lo único descrito con
  detalle es "Genasys ACOUSTICS", altavoces LRAD de largo alcance, unidireccionales por hardware
  físico, no telefonía conversacional. Fuente: https://www.genasys.com/genasys-protect
- Un detalle a favor de Genasys que sí conviene conocer: tiene un "**mobile panic button that shares
  their location with security**" — opt-in bajo pánico, no una llamada proactiva de IA pidiendo
  consentimiento y posición.
- Casos reales desplegados y verificados (no solo anuncio): San Diego County/ciudad (ene 2025), LA
  County, Santa Barbara County (jun 2025), San José (activado horas antes del Ranch Fire, jun 2025),
  Maui/Molokai/Lanai (may 2025). Fuente cruzada: https://en.wikipedia.org/wiki/Genasys y cobertura de
  prensa del incidente de LA (NYT, LA Times, BBC, CNN).
- Nota académica relevante: existe un paper reciente (**BEACON**, arXiv 2609.03301) que propone un
  agente multilingüe combinando GPS + perímetro de fuego + checklist personalizado — es decir, la
  idea de ruta individual dinámica **ya existe en investigación académica de 2026**, pero no en
  ningún producto comercial desplegado que se haya podido verificar.
  https://arxiv.org/html/2609.03301v1

**Esto es la diapositiva más incómoda y la más útil del pitch.** Genasys/Zonehaven es el competidor
más cercano y más grande (desplegado en condados enteros de California, con presupuesto y casos de
uso reales), y el salto que proponemos — de zona agregada a persona individual con GPS y ruta que se
recalcula — es exactamente el punto donde su propio incidente de enero 2025 demuestra la debilidad
estructural del modelo por zonas: todo o nada dentro del polígono.

## 2. Sistemas españoles de aviso a población

*Nota de fiabilidad: la investigación de este bloque se apoyó sobre todo en Wikipedia en español
(que cita fuentes primarias en notas no verificadas de segundo nivel) y en las webs oficiales que
respondieron. Recomendado verificar las cifras exactas de víctimas antes de citarlas en el pitch.*

- **ES-Alert** (implementación española del EU-Alert europeo): tecnología **Cell Broadcast**, envía
  mensajes simultáneos a todos los terminales en un área de cobertura "sin necesidad de conocer su
  numeración". **Es unidireccional por diseño**: no identifica usuarios, no accede a geolocalización,
  no permite respuesta del receptor — y por eso "no es de aplicación la normativa de protección de
  datos personales". Financiado con fondos Next Generation EU. Lo activan los servicios de
  emergencias autonómicos junto con el Centro Nacional de Seguimiento y Coordinación de Emergencias
  del Ministerio del Interior. Activación oficial: 22 feb 2023. Requiere Android 11+/iOS 15.6+ y
  4G/5G (limitación real de alcance en según esta fuente).
  Fuente: https://es.wikipedia.org/wiki/EU-Alert
- **AlertCops** (Policía Nacional / Guardia Civil, Ministerio del Interior): es **unidireccional
  ciudadano→autoridad**, no al revés. Botón SOS, chat con policía, compartir ubicación para "que te
  acompañen", función "Guardián". No tiene capacidad de aviso masivo saliente de las autoridades
  hacia la población. Fuente: https://alertcops.ses.mir.es/
- **112 / planes autonómicos de incendios**: confirmado el mapa de siglas — INFOCA (Andalucía),
  INFOCAT (Cataluña), INFOCAM (Castilla-La Mancha), PROCINFO (Aragón), INFOMUR (Murcia), INFOEX
  (Extremadura), INFOBAL (Baleares) — coordinados a nivel nacional vía Ministerio de Medio Ambiente +
  UME + Comité de Lucha contra Incendios Forestales (CLIF) + CCINIF.
  Fuente: https://es.wikipedia.org/wiki/Incendios_forestales_en_España
  **No verificado**: el detalle operativo explícito de "megafonía + patrulla puerta a puerta" no se
  encontró documentado en fuente oficial accesible en esta sesión (la web de la Junta de Andalucía
  sobre INFOCA devolvió 404). Es una inferencia razonable a partir de cómo se describen las
  evacuaciones reactivas en Sierra de la Culebra 2022, no una confirmación documental. **Recomendado
  verificar en el stand o con fuente primaria antes de presentarlo como hecho cerrado.**
- **BandoMóvil** (apps de bando municipal): tiene dos módulos — "Comunicados inmediatos" (push del
  ayuntamiento a vecinos, unidireccional) y "Gestión de Incidencias" (canal vecino→ayuntamiento).
  **Matiz importante para el pitch**: no es puramente unidireccional, tiene un canal de vuelta —
  aunque no está claro que sirva para gestión de crisis en tiempo real ni que use geolocalización.
  Fuente: https://www.bandomovil.com/
- **Teleasistencia (IMSERSO, Cruz Roja)**: >2,1 millones de personas en el SAAD según IMSERSO. Tiene
  función de "recordatorio" (la central puede contactar al usuario) y alertas automáticas por
  caída/salida de zona segura activadas por el dispositivo. **No verificado**: no se encontró
  confirmación de campañas de llamadas salientes masivas proactivas (ej. olas de calor) en la fuente
  consultada. Fuente: https://es.wikipedia.org/wiki/Servicio_de_teleasistencia

**Conclusión de esta capa:** el proceso real de aviso a población en un incendio forestal en España
hoy es, con la evidencia disponible: ES-Alert (unidireccional, sin respuesta ni posición) + megafonía
y patrulla puerta a puerta (inferido, no documentado con detalle operativo público) + AlertCops (solo
para que el ciudadano llame, no al revés). **Ningún sistema español hace hoy una llamada saliente
conversacional que pida consentimiento y posición GPS.** El hueco que ataca la propuesta es real en
lo que se pudo verificar, con la salvedad honesta de que el detalle exacto del protocolo "manual"
actual no está confirmado con fuente primaria — es una inferencia razonable, no un hecho documentado.

## 3. IA de voz en emergencias / 911-112 y software de evacuación

> Nota de fiabilidad: esta sección tardó dos intentos (el primero se quedó bloqueado por CAPTCHA de
> motores de búsqueda). El segundo intento consiguió fetch en vivo sobre las webs oficiales de los
> productos citados — cada claim de abajo tiene URL real visitada en esta sesión, salvo donde se
> indica "no verificado" de forma explícita (Aurelian, Bandwidth, literatura académica de Cova/
> Dennison/Wolshon).

- **Empresas de IA para call-takers de 911/112 — las tres verificadas son de llamada ENTRANTE, ninguna
  hace salientes masivas:**
  - **Carbyne** (hoy integrada como "Axon 911 Core" tras su adquisición por Axon): "the cloud-native
    infrastructure layer of Axon 911". Transcripción/traducción en vivo para el operador, vídeo y
    ubicación en vivo del que llama, mapas. Cero mención de notificación saliente masiva.
    https://carbyne.com
  - **Prepared** (Prepared911, también integrada en "Axon 911" como "The Intelligence Layer"):
    "Real-time transcription, automated detail capture, and live translation so call-takers stay
    focused on the caller." Triaje de llamadas no urgentes, QA de llamadas, traducción en +40
    idiomas — todo sobre la llamada ENTRANTE. https://www.prepared911.com
  - **RapidSOS**: no es un call-taker, es una red de datos que enriquece la llamada ENTRANTE con
    ubicación/telemetría/vídeo de dispositivos y empresas antes de que el operador conteste ("Before
    a word is spoken, critical context is already there for faster dispatch"). Intake de datos, no
    salida hacia ciudadanos. https://www.rapidsos.com
  - **Aurelian**: no se pudo confirmar la empresa/URL correcta en esta sesión — no se afirma su
    existencia ni producto. **No verificado.**
  - **Bandwidth Emergency Calling**: la página de producto devolvió 404 en los intentos realizados;
    la home solo menciona "Emergency" como uno de tres pilares de sus APIs empresariales, sin
    detalle. **No verificado** — por lo que se sabe del sector (sin confirmar hoy), sería
    enrutamiento E911 para VoIP/UCaaS empresarial (llamada saliente del empleado hacia el 911, no
    notificación masiva a ciudadanos).
- **¿Existe un producto de llamadas SALIENTES masivas con IA conversacional real para evacuación?**
  No se encontró ninguno confirmado. El caso más cercano con evidencia viva es de nuevo **Genasys
  Protect** (la misma plataforma de la sección 1.1): combina planificación de zonas de evacuación
  con ejecución real de alertas — pero por **SMS, IPAWS, email, redes sociales, app pública y
  "Genasys ACOUSTICS"** (altavoces LRAD de largo alcance). La propia web del producto no menciona en
  ningún momento llamadas salientes conversacionales con IA — todo el aviso está descrito como
  *broadcast* multicanal unidireccional, no conversación bidireccional. https://www.genasys.com/genasys-protect/
  Esto es evidencia directa a favor de la hipótesis: el jugador comercial más avanzado en ejecución
  real de avisos de evacuación (Genasys) todavía no es conversacional.
- **Software de simulación de evacuación — confirmado que son herramientas de planificación/
  investigación offline, no sistemas que disparan acciones reales:**
  - **MATSim**: "open-source framework for large-scale agent-based transport simulations"; cada
    agente "optimiza su día" en iteraciones sucesivas. Usado por SBB (ferrocarril suizo), MOIA, ARUP,
    BVG para planificación de transporte. Sin mención de evacuación ni de triggers en tiempo real —
    es analítico y offline. https://matsim.org
  - **SUMO**: "microscopic and continuous multi-modal traffic simulation package". Tiene una interfaz
    "TraCI" para interacción "online", pero es control **dentro** de la simulación (semáforos y
    detectores simulados), no actuación sobre infraestructura real. Sin mención de evacuación.
    https://eclipse.dev/sumo/
  - **FLEE**: toolkit de modelado basado en agentes para simular desplazamiento de refugiados,
    validado contra 10 conflictos históricos y publicado en el Journal of Computational Science —
    explícitamente académico, sin conexión a sistemas operativos en tiempo real.
    https://flee.readthedocs.io/en/master/
  - Literatura de Cova/Dennison/Wolshon sobre evacuación por incendio forestal: **no verificado en
    esta sesión** (Semantic Scholar devolvió error 429 dos veces, buscadores bloqueados por CAPTCHA).
    No se cita ningún paper concreto por no poder confirmarlo con fuente viva.
  - Referencia adicional que apoya indirectamente el hueco: https://en.wikipedia.org/wiki/Emergency_population_warning
    confirma que IPAWS/Wireless Emergency Alerts/cell broadcast son sistemas *one-way*, no
    conversacionales.

**Veredicto, con evidencia real (aunque no exhaustiva):**
- **¿Existe el hueco "IA conversacional saliente masiva en emergencias"?** Parece real. Las tres
  empresas de IA para 911/112 verificadas con fuente viva están del lado entrante, y el jugador
  comercial más avanzado en ejecución real de avisos de evacuación (Genasys) es *broadcast* one-way,
  no conversacional. No se encontró ningún contraejemplo que lo desmienta.
- **¿Existe el hueco "simulación + ejecución combinadas"?** También parece real. Los tres
  simuladores verificados (MATSim, SUMO, FLEE) son inequívocamente offline/analíticos y desconectados
  de cualquier sistema operativo de aviso; el único sistema comercial con ejecución real encontrado
  (Genasys) hace planificación de zonas estáticas, no simulación dinámica de movimiento individual.
  Ningún resultado combina ambos.
- **Límite honesto de esta conclusión**: no es una búsqueda exhaustiva (herramientas de búsqueda
  poco fiables en esta sesión, con varios CAPTCHA), y Aurelian, Bandwidth y la literatura académica
  concreta quedan sin verificar. "No encontrado con las herramientas disponibles" no equivale a "no
  existe en ningún sitio" — recomendable una segunda pasada con búsqueda nativa o preguntar
  directamente al equipo de HappyRobot en el stand antes de defenderlo ante el jurado como hecho
  cerrado.

## 4. Precedentes de compartir posición GPS individual en emergencia

- **Radar COVID (España)**: usa Bluetooth de baja energía (protocolo DP-3T + API Apple/Google),
  diseñado explícitamente como alternativa *privacy-preserving* a la geolocalización. **No pedía GPS**
  en ningún momento — es un contraejemplo, no un precedente a favor.
  Fuente: https://en.wikipedia.org/wiki/COVID-19_apps · https://en.wikipedia.org/wiki/COVID-19_pandemic_in_Spain
- **what3words en servicios de emergencia**: ampliamente documentado en Reino Unido (+85% de equipos
  de emergencia en 2021: policía, bomberos de Londres, ambulancias de Escocia), Australia (Ambulance
  Tasmania, app "Emergency Plus"), Singapur, EEUU (Alabama, Wisconsin), Alemania, Canadá. **No se
  encontró ningún caso documentado en España** (ni Guardia Civil GREIM ni 112 autonómico) en las
  fuentes consultadas — no verificado, no necesariamente inexistente. En todos los casos encontrados
  el ciudadano **inicia** el compartir su posición (llama o abre la app), no es una llamada saliente
  que lo pide con consentimiento verbal. Fuente: https://en.wikipedia.org/wiki/What3words
- **FEMA (EEUU)**: no se encontró ningún sistema que pida ubicación vía link/app durante un desastre.
  Wireless Emergency Alerts (WEA) es, igual que ES-Alert, **unidireccional por Cell Broadcast**, sin
  canal de retorno. La propia fuente desmiente el mito de que WEA accede a ubicación/cámara del
  dispositivo. Fuente: https://en.wikipedia.org/wiki/Wireless_Emergency_Alerts
- **INE España — datos de operadoras móviles**: el INE tiene un marco técnico y precedente
  institucional real de usar datos agregados de telefonía móvil para medir movilidad — el "Estudio de
  movilidad 2020-2021" se hizo específicamente para medir movilidad durante el estado de alarma
  COVID, y hay un estudio 2019 preparatorio del Censo 2021. **Pero ningún uso documentado para
  emergencias, evacuaciones o incendios** — el precedente existe, pero no se ha aplicado a protección
  civil. Fuente: https://www.ine.es/experimental/movilidad/experimental_em.htm
  El precedente de EEUU usando datos de movilidad comercial (Meta Disaster Maps, Cuebiq, Streetlight)
  durante huracanes es plausible por conocimiento general pero **no se pudo verificar con fuente en
  vivo** en esta sesión — no citarlo como hecho sin confirmarlo antes.

**Veredicto:** no se encontró ningún precedente documentado que combine literalmente los tres
elementos de la propuesta — llamada de voz + consentimiento verbal en la misma llamada + enlace que
activa el GPS del navegador — ni en covid-tracing (que evita el GPS por diseño), ni en FEMA/WEA (que
es unidireccional), ni en what3words (que lo inicia el propio ciudadano, no una llamada saliente).
Esto es un hallazgo genuinamente favorable para el pitch, con la salvedad honesta de que "no
encontrado por los investigadores en esta sesión" no equivale a "no existe en ningún sitio del
mundo" — es la mejor evidencia disponible, no una garantía absoluta.

## 5. Qué se hizo mal en emergencias recientes en España

*Misma salvedad de fiabilidad que la sección 2: basado sobre todo en Wikipedia en español; cifras a
verificar con fuente primaria (BOE, prensa, informes oficiales) antes de citarlas en el pitch de
forma categórica.*

- **DANA de Valencia (octubre 2024)**: cronología documentada — 12:07h la Confederación Hidrográfica
  del Júcar alerta sobre el caudal de la Rambla del Poyo; 18:43h llega al Centro de Coordinación el
  aviso de un caudal más de 11 veces el umbral, sin transmitirse a los municipios ribereños; el
  **ES-Alert se envía a las 20:11h**. La consejera Salomé Pradas cortó la comunicación con el CECOPI
  entre las 18:00 y las 19:00h "para pensar qué hacer"; el presidente Carlos Mazón no se incorporó al
  CECOPI hasta las 20:28h. Hay instrucción judicial que imputa a la consejera y a un exsecretario
  autonómico por la tardanza. Fuente: https://es.wikipedia.org/wiki/Inundaciones_de_la_DANA_de_2024_en_España
  **Cifra a verificar antes del pitch**: la fuente consultada cita ≥156 fallecidos (84% del total)
  antes de las 20:11h y 82 solo entre 19:00-20:00h, pero el número total de víctimas de la DANA se ha
  reportado en distintas cifras según la fuente y el momento (cifras oficiales revisadas al alza en
  semanas posteriores al suceso) — **no usar el número exacto en la demo sin confirmarlo con una
  fuente de prensa actualizada el día del pitch.**
  No se encontró en las fuentes consultadas el contenido específico de comisiones parlamentarias
  (Cortes Valencianas/Congreso) con recomendaciones técnicas sobre sistemas de aviso — la
  investigación se centró en la cronología judicial, no en el trabajo parlamentario. **Pendiente de
  verificar** si algún informe oficial pide explícitamente algo parecido a llamadas individualizadas
  o seguimiento de posición — no se encontró esa cita textual, y no debe presentarse como si existiera.
- **Incendios de España, agosto 2025**: ES-Alert usado en Torrefeta/Lleida (>20.000 personas
  confinadas en 11 municipios); ~6.000 desalojados en el conjunto de incendios de España hacia el 12
  de agosto; 9 fallecidos; Fiscalía de Medio Ambiente investigando deficiencias de **prevención**, no
  se documentaron críticas técnicas específicas al sistema de aviso en sí.
  Fuente: https://es.wikipedia.org/wiki/Incendios_forestales_de_España_de_2025
- **Sierra de la Culebra (2022)**: evacuaciones reactivas y progresivas de decenas de localidades; el
  fuego avanzó "casi 15 km en línea recta durante la noche" en un episodio, forzando evacuaciones
  nocturnas urgentes. Críticas documentadas: la Junta de Castilla y León mantuvo riesgo "medio" pese
  a la ola de calor, no declaró peligro alto hasta el 27 de junio, y los operativos disponibles no
  llegaban "al 25% de los previstos". Protestas ciudadanas documentadas. **No se documentan detalles
  técnicos del protocolo de alerta** (sirenas/SMS/apps) en la fuente consultada — las críticas son
  sobre medios de prevención/extinción, no sobre el sistema de aviso a población en concreto.
  Fuente: https://es.wikipedia.org/wiki/Incendios_de_la_sierra_de_la_Culebra_de_2022

**Conclusión honesta de esta capa:** no se encontró la "diapositiva perfecta" que el enunciado pedía
(un informe oficial que pida explícitamente lo que construimos). Lo que sí hay, y es defendible, es
la cronología documentada del retraso del ES-Alert en la DANA (más de 7 horas entre la primera alerta
técnica y el envío, con la mayoría de las víctimas ya producidas) como evidencia de que **el sistema
de aviso unidireccional actual llega tarde y no sabe quién está en riesgo real** — no como cita de un
informe que pida nuestra solución, sino como el hueco que la solución llenaría.

## 6. Mercado B2G en España

- **Organismo**: Secretaría General de Protección Civil y Emergencias (SGPCyE), con el Sistema
  Nacional de Protección Civil (SNPC) y el Centro Nacional de Seguimiento y Coordinación de
  Emergencias (CENEM). Fuente: https://www.proteccioncivil.es/
- **rescEU**: reserva de capacidades 100% financiada por la UE, creada en 2019 tras los incendios de
  Portugal de 2017; incluye aviones/helicópteros de extinción y evacuación médica. España activó el
  Mecanismo de Protección Civil de la UE (UCPM) en 2025 para incendios forestales — "por primera vez
  en su historia" según la fuente consultada, aunque no se pudo confirmar si España aloja/financia
  aeronaves rescEU en su propio territorio. Fuente: https://es.wikipedia.org/wiki/Mecanismo_de_Protección_Civil_de_la_Unión_Europea
- **No verificado**: no se consiguió, por bloqueo de motores de búsqueda en esta sesión, ninguna
  cifra citable de coste por hora de helicóptero/hidroavión de extinción en España, ni el detalle del
  proceso de contratación pública (pliegos, quién decide en las consejerías autonómicas). Se
  recomienda verificar directamente en la Plataforma de Contratación del Sector Público
  (contrataciondelestado.es) o en prensa especializada antes de citar una cifra en el pitch — **no
  inventar un número aquí**.

## (a) Qué existe y qué no

| Capacidad de nuestra propuesta | Genasys/Zonehaven | Everbridge/mass notification | ES-Alert/AlertCops | IA 911/112 (Carbyne, Prepared, RapidSOS...) | Software de simulación (FLEE/MATSim/SUMO) |
|---|---|---|---|---|---|
| Llamada de voz saliente masiva | ❌ (SMS/push/app, "voice" sin detalle) | ✅ (voz saliente, no conversacional-IA) | ❌ (unidireccional cell broadcast) | ❌ (foco entrante) | ❌ (no aplica) |
| IA conversacional en la llamada | ❌ | Parcial (anuncio, GA Q4 2026) | ❌ | ✅ pero **entrante**, no saliente | ❌ |
| Pide y recoge posición GPS individual con consentimiento | ❌ (opt-in solo bajo botón de pánico) | Parcial (geolocalización a nivel producto, no conversacional) | ❌ | Parcial (enriquece la llamada entrante con datos del dispositivo) | ❌ (no ejecuta nada, solo simula) |
| Mapa de personas (no solo de zonas) | ❌ (zonas/polígonos, no personas) | ❌ | ❌ | ❌ | ❌ (agentes simulados, no personas reales) |
| Ruta de evacuación individual que se recalcula | ❌ (planes de zona pre-diseñados) | ❌ | ❌ | ❌ | Parcial (simula rutas, pero offline y sin ejecutar el aviso) |
| Lista viva de "no contesta" para patrulla | ❌ | Parcial (estado de entrega de mensaje, no visita física) | ❌ | ❌ | ❌ |
| Convoyes con coche guía | ❌ | ❌ | ❌ | ❌ | ❌ |
| Prioridad de medios aéreos por personas dentro del sector | ❌ | ❌ | ❌ | ❌ | ❌ |
| Simulación + ejecución combinadas en el mismo sistema | ❌ | ❌ | ❌ | ❌ | ❌ (solo simulación, sin ejecución real) |

## (b) Nuestra diferencia en una frase defendible

**El mercado sabe en qué zona está el fuego y a qué zona pertenece cada casa; nosotros sabemos dónde
está cada persona en ese momento, y por eso podemos guiarla a ella — no a su zona — hasta que sale
viva.** El paso de "gestionar zonas" a "gestionar personas con posición real" es el mismo paso que el
propio incidente de Genasys/Zonehaven en Los Ángeles (enero 2025) demuestra que el mercado líder
todavía no ha dado: cuando falta un polígono, el sistema no sabe qué hacer con la gente real que hay
dentro — solo sabe alertar a "todo el condado" o a nadie.

## (c) La pregunta del jurado que más nos puede doler y cómo se contesta

**"¿Esto no es lo que ya hace Zonehaven en California?"**

Respuesta honesta y con evidencia: **No, y lo sabemos porque investigamos su fallo más público.**
Zonehaven/Genasys Protect gestiona **zonas**, no personas: define polígonos de evacuación y manda un
estado (orden de evacuación, refugio, aviso) a todo el que está dentro de esa zona, por los canales
que ya existen (SMS, push, app, altavoces de largo alcance). En enero de 2025, cuando a un incendio
en Los Ángeles le faltó subir su polígono al sistema, la única opción que tenía Zonehaven era alertar
a un condado entero de 10 millones de personas o a nadie — porque el sistema no sabe dónde está cada
persona, solo sabe qué polígono existe. Nuestra propuesta parte de la posición real de cada persona
(no de un polígono fijo), así que un fallo equivalente en nuestro sistema afecta a personas concretas
localizables, no a un condado entero por defecto. No decimos que sustituimos a Zonehaven — ni tenemos
su despliegue en decenas de condados ni su hardware de altavoces —, decimos que resolvemos el
problema exacto que su modelo por zonas no puede resolver por diseño: saber quién queda dentro de
verdad, en tiempo real, y guiarlo a él.

Segunda vuelta de la misma pregunta que hay que anticipar: **"¿Y no es más simple, más barato y más
fiable simplemente ampliar el modelo de zonas?"** — Respuesta: el modelo de zonas es más simple
precisamente porque renuncia a la pregunta que más importa en un incendio real (¿queda alguien
dentro, y quién exactamente?), y esa renuncia es lo que produjo el fallo del condado entero. Ampliar
el modelo de zonas no resuelve ese problema estructural; cambiar de unidad de gestión (persona en vez
de zona) sí.

## (d) Cifras citables

- **≥20.000 personas confinadas** en 11 municipios (Torrefeta, Lleida, incendios de julio-agosto
  2025) vía ES-Alert. Fuente: https://es.wikipedia.org/wiki/Incendios_forestales_de_España_de_2025
- **~6.000 personas desalojadas** en el conjunto de incendios de España hacia el 12 de agosto de 2025.
  Misma fuente.
- **9 fallecidos** en los incendios de agosto de 2025 en España. Misma fuente.
- **ES-Alert enviado a las 20:11h** en la DANA de Valencia, más de 7 horas después de la primera
  alerta técnica de caudal (12:07h) y con la consejera de Interior sin comunicación con el CECOPI
  entre las 18:00 y las 19:00h. Fuente: https://es.wikipedia.org/wiki/Inundaciones_de_la_DANA_de_2024_en_España
  — **la cifra exacta de víctimas antes/después del envío varía según la fuente y el momento de
  actualización; verificar con prensa reciente antes de citar un número concreto en la demo.**
- **>2,1 millones de personas** en el Sistema de Atención a la Dependencia (SAAD) según IMSERSO, base
  potencial de personas vulnerables ya registradas y contactables. Fuente:
  https://es.wikipedia.org/wiki/Servicio_de_teleasistencia
- **~10 millones de personas** recibieron una alerta de evacuación errónea en Los Ángeles (enero
  2025) por un polígono no subido al sistema Genasys/Zonehaven — la cifra que mejor ilustra el límite
  del modelo por zonas. Fuente: https://robertgarcia.house.gov/.../false-alerts-final-report-5.10.pdf
- **Coste por hora de helicóptero/hidroavión de extinción en España**: **no verificado en esta
  sesión** (motores de búsqueda bloqueados). No usar ningún número en el pitch sin confirmarlo antes
  con fuente primaria — recomendado preguntar en el stand de HappyRobot o buscar en
  contrataciondelestado.es / prensa especializada antes de la demo.
- **Créditos de voz de HappyRobot**: ~24 créditos/minuto según `docs/02-happyrobot/03-workspace-y-limites-verificados.md` §6 —
  cifra interna del propio proyecto, no de mercado, útil para dimensionar el coste de la demo (no del
  pitch de mercado).

## Limitaciones de esta investigación (léase antes de defenderla ante el jurado)

1. La sección 3 (IA de voz en 911/112 y software de simulación de evacuación) se apoya en fetch en
   vivo sobre las webs oficiales de Carbyne, Prepared911, RapidSOS, Genasys Protect, MATSim, SUMO y
   FLEE, pero **no es una búsqueda exhaustiva**: dos de los intentos previos se bloquearon por
   CAPTCHA de los motores de búsqueda, Aurelian no se pudo confirmar como empresa real, Bandwidth
   Emergency Calling quedó sin verificar (404), y la literatura académica concreta de Cova/Dennison/
   Wolshon no se pudo citar con fuente viva. Es la parte del informe con menos redundancia de fuentes
   — conviene tenerlo presente si el jurado profundiza mucho en ella.
2. Las cifras de víctimas de la DANA de Valencia y el detalle del protocolo manual actual en España
   (megafonía + patrulla puerta a puerta) se apoyan sobre todo en Wikipedia en español, que a su vez
   cita fuentes primarias no verificadas de segundo nivel en esta investigación. Tratarlas como punto
   de partida sólido, no como cifra cerrada para citar sin repasar.
3. No se encontró ningún informe oficial (comisión de investigación, informe técnico) que pida
   explícitamente algo parecido a "llamadas individualizadas" o "seguimiento de posición GPS" tras la
   DANA o los incendios recientes. No inventar esa cita — el argumento del pitch se apoya en la
   cronología documentada del retraso, no en una recomendación oficial que no existe.
4. El coste por hora de un helicóptero/hidroavión de extinción en España no se pudo verificar; no
   usar ninguna cifra de ese tipo sin confirmarla antes de la demo.
