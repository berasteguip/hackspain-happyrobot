# Cómo funciona la gestión de emergencias en España

> **Actualizado:** 2026-09-18 · **Estado:** estable
> **En una frase:** el sistema es **autonómico por defecto** (112 + CECOP de cada CCAA),
> escala a CECOPI cuando entra el Estado, y su cuello de botella en una catástrofe no es
> la falta de medios sino el **teléfono y la coordinación de información**.

## El mapa de actores

| Nivel | Quién | Qué hace |
| --- | --- | --- |
| Autonómico | **112** de cada CCAA | Atiende la llamada, clasifica el incidente, despacha recursos |
| Autonómico | **CECOP** | Centro de coordinación operativa del plan territorial |
| Mixto | **CECOPI** | El CECOP "integrado" cuando la emergencia requiere apoyo del Estado. Suele estar físicamente en las instalaciones del 112 |
| Estatal | **CENEM** (Protección Civil, Interior) | Seguimiento y coordinación nacional 24/7; Red de Alerta Nacional; punto de contacto con el Mecanismo Europeo de Protección Civil; activa la UME |
| Estatal | **UME** | Fuerza militar de emergencias, se activa a petición de la autoridad competente |
| Ciudadanía | **ES-Alert** | Aviso masivo por Cell Broadcast a móviles en un área. Lo emiten los centros de coordinación de las CCAA y el CENEM |

**Fases de emergencia:** situaciones 0 a 3, según gravedad y medios necesarios. En
situación de **interés nacional** el Ministro del Interior declara y el CENEM se
constituye en centro de coordinación operativa nacional. Marco: Ley 17/2015 del Sistema
Nacional de Protección Civil y el **PLEGEM** (Plan Estatal General de Emergencias).

Detalle útil de ES-Alert: al usar Cell Broadcast se envía a todas las antenas del área sin
conocer números, por lo que **no le aplica la normativa de protección de datos**. Dos
niveles: "Alerta de Protección Civil" (EU-Alert nivel 1, no desactivable) y "Pre-Alerta"
(nivel 2, desactivable en el terminal).

## El caso DANA (29 oct 2024) — dónde se rompió el sistema

227 muertos en la provincia de Valencia. Los datos que el 112 remitió a la jueza:

- **19.821 llamadas** el 29 de octubre; **4.770 incidentes** gestionados.
- Primera llamada a las **05:03** (agua en una casa en Cofrentes).
- Subida abrupta desde las 13:00; **1.462 llamadas a las 15:00**; **pico de 2.438 a las 17:00**
  (justo cuando empezaba la reunión del CECOPI); 1.833 a las 16:00.
- **4.943 llamadas en las tres horas previas** al ES-Alert.
- Paiporta, 18:32: *"Se está desbordando el barranco, no han cortado la zona"*.
  Catarroja, 18:56: *"Se desborda el barranco, gente atrapada dentro de coches"*.
- El **ES-Alert se envió a las 20:11**, considerado por la jueza "tardío" y de "contenido
  erróneo".
- La cifra real de intentos fue mayor: mucha gente no consiguió contactar. Empleados del
  112 denunciaron además una avería del sistema, avisada días antes, que en muchos casos
  impidió que los ciudadanos oyeran al operador.

### Qué nos dice esto (lectura de producto)

1. **El fallo no fue de detección, fue de agregación.** La información estaba dentro del
   sistema —en 19.821 llamadas— horas antes de la alerta. Nadie pudo convertir ese flujo
   de audio en una imagen agregada y accionable en tiempo real.
2. **La capacidad telefónica es finita y no elástica.** Se refuerza con más teleoperadores,
   que tardan horas en llegar y tienen un techo. La demanda en una catástrofe es un pico
   de 10–100x.
3. **El pico de llamadas es en sí mismo una señal.** 1.833 llamadas a las 16:00 desde unos
   municipios concretos es un dato epidemiológico, no solo una cola de trabajo.
4. **Después de la emergencia viene otra ola**: ayudas, seguros, censo de damnificados,
   voluntarios, realojos. Volumen enorme, urgencia alta, sensibilidad emocional máxima y
   cero picos de criticidad vital por llamada.

> HIPÓTESIS (a validar, no a dar por buena): el espacio más defendible no es "IA que
> atiende el 112" —eso es alto riesgo regulatorio y políticamente radiactivo— sino
> **(a) escuchar/agregar el flujo para dar situational awareness al CECOPI**, y
> **(b) absorber todo lo que NO es la llamada de auxilio** (no-emergencia, información,
> post-crisis, llamadas salientes proactivas).

## Precedentes internacionales: qué se está haciendo ya

El patrón dominante en EEUU es exactamente el de arriba: **la IA no coge el 911, coge la
línea de no-emergencia.**

- **Grays Harbor (WA, sept-2026)**: despliega "AVA" (Aurelian) en la línea de
  no-emergencia. En 2025 tuvieron 42.014 llamadas de emergencia y **60.596 de
  no-emergencia** (≈60% del total). AVA habla 45+ idiomas, crea el *call for service* en el
  sistema de despacho y **transfiere a humano si detecta una emergencia**. Mensaje público
  explícito: "si llamas al 911 te contesta una persona; eso no cambia".
- **Weber County (UT)**: ~280.000 llamadas/año, dos tercios no-emergencia; la IA maneja
  ~10% de esas. Detecta frases y **temperamento** del llamante (ansiedad, miedo) para
  escalar a 911 con prioridad alta. El ciudadano puede pedir hablar con una persona.
- **Akron (OH, dic-2025)**: ~160.000 no-emergencia y ~140.000 al 911 al año. Diseño
  explícito: asuntos sensibles (ej. agresión sexual) se transfieren directamente sin pasar
  por la IA.
- **Richmond (VA)**: asistente de Amazon Connect desde abr-2025, 10–15% de las
  no-emergencia resueltas del todo; coste ~$52.000. Las respuestas atendidas en <15 s
  pasaron del 85% al 93%. **Punto negro documentado:** no se avisa al ciudadano de que
  habla con una IA, y las respuestas no son consistentes. La NENA recomienda decirlo.
- **Seattle**: la tecnología de **Corti** lleva 2+ años analizando llamadas médicas del 911
  y sugiriendo a los operadores desviar pacientes a una línea de enfermería, **sin que los
  ciudadanos lo supieran**. Es el ejemplo de manual de cómo se genera el escándalo.

Lecciones directas: **(1) empezar por no-emergencia, (2) decir siempre que es una IA,
(3) transferencia inmediata ante emergencia o asunto sensible, (4) el humano siempre
disponible bajo petición.**

## Preguntas abiertas

- [ ] ¿Cuántas llamadas del 112 español son realmente no-emergencia / consulta? (En EEUU
      ~60%. Buscar dato equivalente en España: el 112 español filtra distinto.)
- [ ] ¿Qué software usan los 112 autonómicos y qué interfaces de integración tienen?
- [ ] ¿Existe un canal de llamadas *salientes* en crisis (confirmar evacuación, censar
      afectados, avisar a personas vulnerables)? Ahí no hay problema de triaje.
- [ ] ¿Quién compra: CCAA, diputación, ayuntamiento, Interior? El presupuesto y el ciclo
      cambian radicalmente.

## Fuentes

- RTVE — El 112 recibió 19.821 llamadas y gestionó 4.770 incidentes el día de la dana — https://www.rtve.es/noticias/20250304/112-recibio-19821-llamadas-gestiono-4770-incidentes-dia-dana/16475826.shtml (2026-09-18)
- RTVE — El 112 el día de la dana: las 20.000 llamadas que certifican la catástrofe — https://www.rtve.es/noticias/20250506/112-dia-dana-20000-llamadas-catastrofe/16558130.shtml (2026-09-18)
- 20minutos — El 112 recibió casi 20.000 llamadas por la DANA — https://www.20minutos.es/noticia/5687903/0/112-recibio-casi-20-000-llamadas-dia-dana-mayoria-partir-las-15-00-horas/ (2026-09-18)
- ABC — El 112 recibió llamadas de auxilio horas antes de la alerta — https://www.abc.es/espana/comunidad-valenciana/112-recibio-llamadas-auxilio-horas-alerta-dia-20250304140438-nt.html (2026-09-18)
- eldiario.es — Empleados del 112 llevaban días avisando de una avería — https://www.eldiario.es/comunitat-valenciana/empleados-112-valencia-llevaban-dias-avisando-averia-impidio-atender-llamadas-durante-dana_1_11809252.html (2026-09-18)
- Protección Civil — Public Warning System (ES-Alert) — https://www.proteccioncivil.es/coordinacion/redes/ran/public-warning-system (2026-09-18)
- Protección Civil — CENEM — https://espacios.proteccioncivil.es/web/guest/coordinacion/cenem (2026-09-18)
- Protección Civil — PLEGEM — https://www.proteccioncivil.es/documents/20121/115963/PLEGEM_V2.pdf (2026-09-18)
- Newtral — Cómo funciona el Cecopi ante una emergencia — https://www.newtral.es/como-funciona-cecopi-emergencia/20250227/ (2026-09-18)
- The Daily World — Grays Harbor Communications deploys AVA — https://www.thedailyworld.com/2026/09/16/grays-harbor-communications-deploys-ava-for-non-emergency-calls-keeping-telecommunicators-focused-on-911/ (2026-09-18)
- KJZZ — AI now handling Weber County non-emergency dispatch calls — https://kjzz.com/news/local/ai-now-handling-weber-county-non-emergency-dispatch-calls (2026-09-18)
- Spectrum News — New AI system takes Akron's non-emergency calls — https://spectrumlocalnews.com/tx/austin/news/2025/12/22/new-ai-system-takes-akron-s-non-emergency-calls- (2026-09-18)
- Axios Richmond — Amazon AI is answering Richmond's non-emergency calls — https://www.axios.com/local/richmond/2026/07/21/richmond-amazon-ai-non-emergency-calls (2026-09-18)
- Seattle Times — Seattle uses AI to help triage, divert 911 medical calls — https://www.seattletimes.com/seattle-news/times-watchdog/seattle-uses-ai-to-help-triage-divert-911-medical-calls/ (2026-09-18)
