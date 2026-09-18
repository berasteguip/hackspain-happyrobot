# HappyRobot × instituciones públicas para gestión de crisis: ventajas, inconvenientes y retos

> **Actualizado:** 2026-09-18 · **Estado:** borrador — es nuestro análisis, no un hecho
> **En una frase:** técnicamente HappyRobot está listísimo (voz SIP, workflows
> deterministas, auditoría, VPC/on-prem, cluster EU); lo que no está resuelto es el
> **triaje de llamadas de emergencia bajo el AI Act**, la **compra pública** y la
> **responsabilidad política cuando falle una llamada**.

## 1. Lo que juega a favor

### Producto
- **La voz es el canal nativo del sector.** El 112 es un call center de misión crítica.
  HappyRobot no hace "chatbots con teléfono añadido": hace SIP/TLS + SRTP con peering a
  carriers tier-1 y PBX on-prem, que es exactamente donde vive un centro 112.
- **Determinismo donde importa.** El workflow engine permite que la parte crítica
  (¿escalo?, ¿transfiero?, ¿qué pregunto?) sea una rama determinista y no un prompt.
  Es la única arquitectura defendible ante un regulador.
- **Governance de serie.** Northstars, AI Auditor, tests adversariales y evals ya
  existen. Un pliego público pide exactamente eso: trazabilidad, métricas, evidencia.
- **Elasticidad instantánea.** El argumento de oro: un CECOPI no puede multiplicar por 10
  sus teleoperadores en dos horas; un agente sí. Y HappyRobot ya opera picos de 100% de
  llamadas atendidas 24/7 en clientes de logística.
- **Multi-idioma (30+).** España tiene cooficiales; en catástrofe hay turistas y
  residentes extranjeros. Grays Harbor lo vende explícitamente como equidad de acceso.
- **Multicanal desde un mismo agente.** Voz, WhatsApp, SMS, email: el ciudadano en crisis
  usa lo que le funciona, y a menudo la voz está saturada pero el dato pasa.
- **Salientes proactivas.** La capacidad que menos tiene la administración: llamar a
  5.000 personas vulnerables antes de que el barranco se desborde y registrar quién
  contestó y quién no. Es *track-and-trace* aplicado a personas.

### Empresa y contexto
- **Precedente Naturgy y Repsol.** Servicio esencial, infraestructura crítica, cliente
  europeo grande, compromiso de SLA físico (<3 h), gestión del cambio dura. Es el ensayo
  general de un cliente público.
- **Modelo FDE.** La administración no tiene equipo para configurar un producto
  autoservicio. El modelo "metemos ingenieros y co-construimos" encaja con cómo compra lo
  público (proyecto llave en mano) mucho mejor que un SaaS.
- **Cluster EU y despliegue en VPC/on-prem** con residencia en país y claves por cliente:
  respuesta directa a la objeción número uno de cualquier CIO público.
- **Empresa española.** Peso real en política industrial, soberanía tecnológica y
  narrativa "campeón nacional". No es menor en una licitación.
- **Cumplimiento ya declarado**: SOC 2 Type II, RGPD, HIPAA, EU AI Act, NIST CSF, DORA.

## 2. Lo que juega en contra

### Regulatorio (el muro)
- **Anexo III, punto 5(d) del AI Act nombra literalmente nuestro caso**: sistemas de IA
  destinados a *evaluar y clasificar llamadas de emergencia* o a *despachar o priorizar el
  despacho de servicios de primera respuesta* (policía, bomberos, asistencia médica) y
  triaje de pacientes. Eso es **alto riesgo**. Ver [`../04-regulacion/01-marco-regulatorio.md`](../04-regulacion/01-marco-regulatorio.md).
- El *escape* del art. 6(3) (tarea puramente preparatoria + humano decide) **se cierra en
  cuanto el sistema perfila personas**, y difícilmente cubre un sistema que prioriza.
- **El ENS no es opcional.** Real Decreto 311/2022, art. 2.3: el proveedor privado entra en
  el ámbito del ENS por ser proveedor de lo público, y los pliegos deben exigir declaración
  o certificación de conformidad, extensible a la cadena de suministro. Si el sistema es
  categoría MEDIA o ALTA, hace falta **certificación** por entidad acreditada por ENAC, con
  auditoría cada dos años. Y la cadena de suministro incluye a los proveedores de LLM/TTS.

### Comercial y organizativo
- **Ciclo de venta.** Naturgy tardó 3 meses solo de POC tras evaluar 30 proveedores; una
  administración añade pliego, mesa de contratación, recurso, fiscalización previa.
  Frente a un broker americano que firma en semanas, el coste de oportunidad es brutal.
- **Fragmentación del comprador.** 17 CCAA con su propio 112, su propio software, su
  propio plan territorial, más diputaciones, ayuntamientos, Interior, Sanidad. No hay "el
  cliente 112 de España": hay 17+ ventas casi independientes, cada una pequeña.
- **Presupuesto y precio.** El modelo de HappyRobot es por volumen de conversación con ROI
  medido en margen comercial (10% más de margen negociando tarifas). En lo público no hay
  margen: hay presupuesto anual cerrado y un ahorro que nadie se apunta como ingreso.
- **Sindicatos y empleo.** Los teleoperadores del 112 suelen ser plantilla pública o
  contrata con convenio. "IA que coge llamadas" es titular sindical inmediato. El framing
  de Grays Harbor ("la IA no coge el 911, libera a los operadores para que lo cojan") es la
  única versión que sobrevive.
- **Riesgo reputacional asimétrico.** 10.000 llamadas bien atendidas no salen en prensa;
  una mal atendida sale en portada y en un juzgado. Y el caso DANA ya está judicializado:
  cualquier proveedor tecnológico que toque el 112 entra en un terreno con instrucción
  penal abierta sobre la gestión de emergencias.
- **Transparencia obligatoria.** Richmond no avisa de que es IA y Axios lo destapó;
  Seattle lleva dos años analizando llamadas sin que los ciudadanos lo supieran. En España,
  con el art. 50 del AI Act **ya en vigor desde ago-2026**, eso sería directamente ilegal.

### Técnico
- **Integración con sistemas 112 propietarios**, muchos heredados, sin API moderna.
- **Localización y ruido**. En crisis las llamadas son ruidosas, entrecortadas, con la
  persona gritando dentro de un coche que se inunda. El ASR y el VAD trabajan fuera de
  distribución respecto a un carrier llamando desde una cabina de camión.
- **Dependencia de la red**. Si caen las antenas, tu agente no existe. La lección DANA
  incluye una avería del propio sistema del 112.
- **Datos de entrenamiento y contexto inexistentes.** El foso de HappyRobot es acumular
  contexto operando. En una catástrofe, por definición, no hay volumen previo: el evento
  ocurre una vez cada década y es distinto cada vez.

## 3. Los tres retos de verdad

1. **Reto de clasificación regulatoria.** Diseñar el sistema para que *no* sea Anexo III
   5(d), o asumir que lo es y construirlo como alto riesgo desde el día uno. Es una
   decisión de arquitectura, no de legal: cambia qué hace el agente.
2. **Reto de la primera referencia.** Nadie en la administración quiere ser el primero. Hay
   que encontrar el caso donde el downside sea ~0: post-crisis, información, salientes,
   no-emergencia. Y luego escalar hacia dentro, exactamente como hicieron con Circle
   Logistics (carrier sales → track-and-trace → documentos → cobros).
3. **Reto del "fuera de distribución".** Una crisis es el momento en que todos los
   supuestos del sistema dejan de valer. El agente tiene que degradar con elegancia:
   cuando no entiende, transfiere; cuando no hay humano libre, registra y promete; cuando
   no hay red, cae a SMS. La calidad del *fallback* es el producto.

## 4. Dónde está el hueco defendible (nuestra apuesta preliminar)

> HIPÓTESIS. A validar con el enunciado real del track y con los mentores de HappyRobot.

Ordenado de menor a mayor riesgo regulatorio y político:

| # | Caso de uso | Riesgo | Por qué funciona |
| --- | --- | --- | --- |
| 1 | **Llamadas salientes proactivas** pre-evento: avisar, confirmar evacuación, censar quién está en casa | Bajo | No clasifica emergencias, las previene. Registra quién no contesta = lista de búsqueda |
| 2 | **Línea de no-emergencia / información** durante y después de la crisis: ayudas, cortes, realojo, voluntariado | Bajo | Precedente masivo en EEUU. Descarga el 112 sin tocarlo |
| 3 | **Gestión post-crisis**: censo de damnificados, seguimiento de expedientes de ayuda, coordinación de voluntarios y donaciones | Bajo | Volumen enorme, urgencia alta, cero criticidad vital por llamada |
| 4 | **Situational awareness agregado**: escuchar el flujo de llamadas y dar al CECOPI un mapa en vivo de qué se está reportando y desde dónde | Medio | Es el fallo exacto de la DANA. Cuidado: si prioriza, es Anexo III |
| 5 | **Copiloto del teleoperador**: transcribe, rellena el incidente, sugiere protocolo | Medio-alto | Perfila y asiste priorización → probablemente alto riesgo |
| 6 | **Atender y triar el 112** | Alto | Anexo III 5(d) puro. No en 36 horas y no sin cliente |

Los casos 1–3 son, además, los que mejor reutilizan lo que HappyRobot ya hace: *outbound
a escala, check-in por hitos, recogida de documentos, escalado a humano*. Literalmente
track-and-trace, pero de personas en vez de cargas.

## Preguntas abiertas

- [ ] ¿El track de HappyRobot nos limita a un vertical o un tipo de caso?
- [ ] ¿Hay alguien de HappyRobot con experiencia en sector público a quien preguntar?
- [ ] ¿Existe algún 112 autonómico o ayuntamiento con proyecto piloto de IA en España?
- [ ] ¿Cuál es el dato español equivalente al "60% de llamadas son no-emergencia"?

## Fuentes

Ver [`01-sistema-emergencias-espana.md`](01-sistema-emergencias-espana.md),
[`../02-happyrobot/01-la-empresa.md`](../02-happyrobot/01-la-empresa.md),
[`../02-happyrobot/02-plataforma.md`](../02-happyrobot/02-plataforma.md) y
[`../04-regulacion/01-marco-regulatorio.md`](../04-regulacion/01-marco-regulatorio.md).
El análisis de este documento es del equipo.
