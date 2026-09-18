# HappyRobot: la empresa

> **Actualizado:** 2026-09-18 · **Estado:** estable
> **En una frase:** startup española-americana que vende "AI workers" que hacen llamadas,
> emails y coordinación operativa en empresas grandes; nació resolviendo el teléfono de
> los freight brokers americanos y hoy es una plataforma de €1.200M de valoración que se
> está expandiendo a energía, telco, seguros y aerolíneas.

## Ficha rápida

| | |
| --- | --- |
| Fundación | 2022–2023 (según fuente); YC |
| Sede | San Francisco; oficinas en Madrid (Chamberí) y 8 localizaciones (NA, Europa, LATAM, Australia) |
| Fundador/CEO | Pablo Palafox (cofundador; también Javi Palafox en el equipo) |
| Plantilla | ~220 personas (LinkedIn, 2026), +40 en España |
| Financiación | Serie A $15,6M (finales 2024, liderada por a16z) → Serie B $44M (sep-2025, Base10, ~$500M valoración) → **Serie C $150M (ago-2026, $1.200M valoración)** |
| Inversores | a16z, Y Combinator, Base10, Array, Avra, Samsara Ventures, Tokio Marine, WaVe-X, WiL, Eurazeo, Prysm, Baobab Ventures |
| Clientes | **150+ enterprise** (ago-2026): DHL, Kuehne+Nagel, Uber, Ryder, Flexport, Circle Logistics, MODE Global, WWEX Group, **Naturgy**, **Repsol** |

## Qué venden realmente

No venden "un bot de voz". Venden **trabajo hecho**: agentes autónomos que mantienen
conversaciones (voz, email, SMS, WhatsApp, Slack, Teams, chat web), consultan y escriben
en los sistemas del cliente (TMS, ERP, CRM), y dejan registro estructurado de todo.

El caso canónico —y el que explica todo lo demás— es el **carrier sales** de un freight
broker: entra una llamada de un transportista, el agente le presenta la carga, negocia la
tarifa con datos de mercado en vivo, comprueba que el carrier tiene autoridad y no es
fraudulento, cierra la reserva y lo escribe en el TMS. Alrededor de eso montaron
*track-and-trace* (llamar al conductor en cada hito), recogida de documentos, cobros,
programación de muelles.

## Números que citan públicamente

Cuidado: son cifras de marketing del propio HappyRobot y de sus clientes, no auditadas.

- **Circle Logistics** (primer gran cliente, broker de ~$800M): 18% de la carga reservada
  sin intervención humana, reducción del 80–100% de llamadas manuales en cada caso de uso,
  +10% de margen por consistencia en la negociación, 100% de llamadas atendidas 24/7,
  ROI >5x. Superaron las 100.000 llamadas con IA.
- **WWEX Group**: 6 agentes cubriendo el ciclo de vida de la carga, entregados en 6 semanas
  (sprints de 2 semanas).
- **Plataforma (ago-2026)**: un cliente automatiza 28.000 horas de trabajo al mes; 9,4/10
  de satisfacción en atención al cliente; >70% de resolución autónoma media; equipos de
  operaciones con 10x capacidad; 78% de "ejecución autónoma en trabajo crítico".

## Por qué ganan (su propia tesis)

1. **Forward Deployed Engineers (FDE).** No entregan producto empaquetado: meten
   ingenieros dentro del cliente a co-construir. Es lo que citan MODE, WWEX y Naturgy como
   razón de elegirlos frente a ~30 competidores.
2. **Profundidad de integración.** No es una API de voz: está enchufado al TMS, al DAT,
   al Truckstop, al Highway. La conversación *hace cosas*.
3. **El contexto se acumula.** Cada despliegue deja datos operativos (tarifas negociadas,
   contactos muertos, patrones de excepción) que mejoran el siguiente. Es su foso.
4. **Multi-vertical con la misma estructura.** Palafox lo dice explícito: la asistencia en
   carretera en trucking es el mismo caso que en seguro de auto. La plataforma sirve para
   cualquier industria, pero el go-to-market exige foco vertical.

## Expansión: de logística a "la economía real"

Orden histórico: freight brokers → freight forwarders → ocean carriers → trucking →
aerolíneas. Verticales nuevas: **energía y utilities, telco, servicios financieros
(seguros y banca)**.

El caso **Naturgy** es el más relevante para nosotros: gas y electricidad en España,
millones de clientes, línea de asistencia técnica telefónica con compromiso de técnico en
casa en <3 horas en cualquier punto de España. Evaluaron ~30 proveedores, hicieron POC con
HappyRobot, la llevaron de kickoff a entrega en 3 meses, y hoy HappyRobot opera su línea
técnica principal —el canal de mayor volumen y mayor riesgo—. Es el precedente más cercano
a "servicio esencial, infraestructura crítica, contexto europeo, cambio organizativo duro".

> HIPÓTESIS: Naturgy y Repsol son la prueba de que HappyRobot ya sabe operar en entornos
> regulados europeos con infraestructura crítica. El salto a sector público es menor de lo
> que parece técnicamente, y mayor de lo que parece contractualmente.

## Preguntas abiertas

- [ ] ¿Tienen ya algún cliente público (ayuntamiento, CCAA, agencia)? No hemos encontrado
      ninguno documentado públicamente a 2026-09-18.
- [ ] ¿Existe oferta específica para administración pública o certificación ENS?
- [ ] ¿Cuál es el tiempo mínimo real de despliegue? Naturgy: 3 meses POC; WWEX: 6 semanas
      para 6 agentes. ¿Qué se puede hacer en 36 horas?

## Fuentes

- Reuters — HappyRobot raises $44 million to expand AI agents for freight operators — https://www.reuters.com/technology/happyrobot-raises-44-million-expand-ai-agents-freight-operators-2025-09-03/ (2026-09-18)
- Tech.eu — HappyRobot lands $150M Series C — https://tech.eu/2026/08/04/happyrobot-lands-150m-series-c-to-scale-agentic-ai-for-enterprise-operations/ (2026-09-18)
- GlobeNewswire — HappyRobot raises $44M Series B — https://www.globenewswire.com/de/news-release/2025/09/03/3143661/0/en/HappyRobot-raises-44M-to-build-a-digital-workforce-for-the-real-economy.html (2026-09-18)
- HappyRobot — Circle Logistics case study — https://www.happyrobot.ai/blog/circle-logistics-x-happyrobot-case-study (2026-09-18)
- HappyRobot — MODE Global customer story — https://www.happyrobot.ai/customer-story/mode (2026-09-18)
- HappyRobot — WWEX Group customer story — https://www.happyrobot.ai/customer-story/wwex (2026-09-18)
- HappyRobot — Naturgy customer story — https://www.happyrobot.ai/customer-story/naturgy (2026-09-18)
- Startupeable — 0 to $1.2B: HappyRobot's anti-Silicon Valley playbook — https://startupeable.com/happyrobot-serie-c/ (2026-09-18)
- GlobeNewswire — DHL Supply Chain x HappyRobot — https://www.globenewswire.com/news-release/2025/11/25/3194627/0/en/dhl-boosts-operational-efficiency-and-customer-communications-with-happyrobot-s-ai-agents.html (2026-09-18)
- Microsoft for Startups — HappyRobot builds AI workflows for global commerce — https://www.microsoft.com/en-us/startups/blog/happyrobot-building-the-ai-operating-system-for-the-real-economy/ (2026-09-18)
