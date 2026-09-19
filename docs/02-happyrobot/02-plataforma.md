# La plataforma HappyRobot: qué nos da para construir

> **Actualizado:** 2026-09-18 · **Estado:** estable (contrastado con la documentación oficial)
> **En una frase:** workflows como grafo dirigido de nodos que orquestan agentes de voz
> (SIP/WebRTC) y de texto, con Postgres gestionado, señales en tiempo real, apps web
> desplegables dentro de la propia plataforma y MCP con OAuth — todo construible desde el
> IDE sin tocar la UI.

Contrastado con el mirror local de la documentación oficial:
[`00-documentacion-oficial.md`](00-documentacion-oficial.md).

## Modelo mental

```
Trigger  →  Workflow (grafo de nodos)  →  Run (transcript + grabación + outputs)
   ↑                    ↓
canales / API      Agents · Tools · Integraciones · Twin
```

| Concepto | Qué es |
| --- | --- |
| **Workflow** | Contenedor de una automatización. Tiene **slug único** usado para disparar por API, un grafo dirigido de nodos, y versiones + historial de runs |
| **Node** | Paso del workflow. Cuatro tipos primarios: **action** (integraciones), **prompt** (conversaciones IA), **tool** (function calls y utilidades), **condition** (branching) |
| **Agent** | **Voice agents** (SIP y WebRTC; pipeline STT → LLM → TTS en tiempo real) y **text agents** (SMS, WhatsApp, email, chatbot, Teams, Slack). Se configuran como prompt nodes |
| **Run** | Una ejecución: estado, output por nodo, grabación, transcript, mensajes, duración y billing |
| **Contact** | Se crea solo a partir de interacciones: histórico multicanal, atributos extraídos y **memories persistentes** que el agente usa en futuras conversaciones |
| **Environments** | dev / staging / production con versionado y **rollback instantáneo** |

## Core nodes (sin integración de terceros)

`AI Extract` (datos estructurados de texto libre) · `AI Classify` (clasificar en
categorías) · `AI Generate` · **`Custom Code` (Python dentro del workflow)** · `Webhook`
(enviar y recibir HTTP) · `Schedule` (esperas y timing) · `File Operations` (subir,
parsear, buscar y extraer texto de ficheros) · `Conditionals` · `Loops` ·
`Module Change` · **`Call Workflow`** (invocar otro workflow y esperar respuesta, o
lanzarlo y continuar → sub-workflows reutilizables).

> `Call Workflow` + `Conditionals` es lo que permite meter la lógica crítica en ramas
> deterministas y dejar al LLM solo la conversación.

## Piezas que pueden decidir el hackathon

### Signals — eventos en tiempo real a un agente **vivo**
Modelo pub/sub por topics: el agente se suscribe a topics al construir el workflow, tus
sistemas publican por API **mientras la llamada está en curso**, y el agente reacciona a
mitad de conversación sin reiniciar el run ni hacer polling. Tres topics por defecto
(`org.`, `usecase.`, `session.`) más keys custom. Hay también **scheduled signals**
(diferidos, cancelables y modificables).

> HIPÓTESIS: en un caso de crisis esto es enorme. El agente está hablando con un
> ciudadano cuando el CECOPI cambia el estado de la zona → señal → el agente cambia el
> mensaje en la misma llamada.

### Twin — PostgreSQL gestionado
Base de datos dedicada por organización, con constructor visual de esquema, consola SQL,
nodos de workflow, REST API y **su propio servidor MCP**. Permite:
- persistir estado entre runs (tablas de lookup, configuración, caché),
- **polling tables** que se sincronizan solas desde cualquier endpoint HTTP,
- **workflow run dumps**: volcar los outputs de cada run completado a una tabla
  automáticamente, sin añadir nodos.

> Traducción: dashboard en vivo alimentado por las llamadas, gratis y sin montar backend.

### Apps — frontend dentro de la plataforma
Aplicaciones web con repo de GitHub gestionado, editor sandbox en navegador con agente de
código, deploy a URL en vivo con un click, variables de entorno compartidas con el resto
de la plataforma y acceso a Twin por un gateway REST inyectado como variable de entorno.
Casos típicos: consolas internas, portales, front-ends de workflow y **"agent companions"**
(transcript en vivo, superficie de escalado).

> Es literalmente el "control tower" que necesitaría un CECOPI, sin salir de HappyRobot.

### Escalado a humano
`Forward call` (desviar la llamada entrante a un número, sin agente en la línea) y
**transfer popup** (enviar contexto al agente humano al transferirle la llamada). Son la
pieza central de nuestro caso de uso, no un detalle.

## Developer tools

- **REST API v2**, bearer token. **224 operaciones / 179 paths** (cifra del OpenAPI
  oficial, 2026-09-18; la estimación previa de ~205/162 salía de apis.io). Spec en el mirror
  (`openapi.json`) y en https://platform.happyrobot.ai/api/v2/docs/json.
- **Trigger por webhook**: `POST https://platform.happyrobot.ai/hooks/<slug>`. Cualquier
  campo JSON que envíes **se convierte en variable del workflow automáticamente**, sin
  definir esquema.
- **SDK TypeScript** `@happyrobot-ai/sdk` con tutoriales de voice call, voice agent y
  chatbot.
- **MCP servers** por **Streamable HTTP + OAuth 2.1** (sin API key ni Node en local):
  `/mcp` (todo), `/frontal/mcp` (construir y editar workflows conversando),
  `/workflows/mcp` (gestión, integraciones, testing, evals), `/twin/mcp` (esquema,
  queries, tablas). Recomiendan conectar solo el que necesites.
- **Frontal**: asistente de IA que construye y edita workflows conversando, también desde
  Claude Desktop.
- **Cluster EU**: `platform.eu.happyrobot.ai` con su propio OpenAPI y MCP;
  `HAPPYROBOT_CLUSTER=eu`.

> Consecuencia: podemos construir el workflow **desde Cursor vía MCP**, versionarlo y
> enseñar el proceso. Encaja con que Cursor y Cognition son sponsors del evento.

## Integraciones (19+)

- **Comunicación:** Gmail, Outlook, Slack, Microsoft Teams, Twilio SMS, Telnyx SMS,
  WhatsApp, SendGrid, HappyRobot Email, Genesys Audio Connector.
- **Sistemas de negocio:** McLeod TMS, Turvo TMS, TPro, 3PL, Custom TMS, Broker App,
  CXone, Mastery, Richpanel.
- **Datos:** Google Sheets, Snowflake, Redis, AWS, Google Maps, Kafka, Salesforce, Twin.

Además: **MCP Tools** para importar herramientas de servidores MCP externos *dentro* del
workflow, y creación de tools propias.

> Para sector público no hay nada de serie (obvio). Todo iría por `Webhook` / tools
> custom / MCP. Para el hackathon: Google Sheets y Twin como "sistema de la
> administración" simulado.

## Governance y evaluación

Northstars · Audits (incluidas **audio audits**) · Issues · Custom tests · Test suites ·
**Adversarial tests** · Experimentos con A/B testing y métricas. Es la capa que convierte
"el bot habla bien" en "puedo demostrar que se comporta".

## Cumplimiento: AI Act y RGPD en la propia plataforma

La documentación oficial tiene una página dedicada (`compliance/eu-ai-act-and-gdpr.md`).
Lo esencial:

- **Modelo de responsabilidad:** cuando los equipos de HappyRobot construyen los
  workflows, la disclosure del AI Act y el aviso de grabación **vienen activados por
  defecto**. Pero eso no transfiere la responsabilidad: bajo el AI Act tu organización es
  el **deployer**, y bajo el RGPD el **controller**.
- **Art. 50 AI Act:** hay que informar de que se habla con una IA como muy tarde en la
  primera interacción. *"Una llamada de teléfono no cuenta como obvio"* — la posición
  defendible es disclosure explícita al inicio de cada conversación, chatbots incluidos.
- **Tres formas de darla en voz, de más a menos robusta:**
  1. **Disclaimer pregrabado** (recomendado): ajuste *AI and recording disclosure* en el
     nodo de voz. Suena antes del mensaje inicial. Frase estándar:
     *"This is a recorded call with an AI agent."* **Es la opción por defecto en
     despliegues EU**, y elegir otra cosa lanza un warning en el nodo. Al ser
     configuración del nodo y no prompt, ni una edición del prompt ni una variante de
     experimento pueden eliminarla, y no se corta si el llamante interrumpe.
  2. **Initial message con "Protect initial message from interruptions"**: texto fijo,
     no output del modelo. La protección de interrupción es lo que lo hace defendible.
  3. **En el prompt**: la más débil; se genera cada vez, se puede interrumpir y una
     edición posterior la elimina en silencio.
- Se puede desactivar *Record call* y no se almacena audio; la obligación de disclosure
  sigue aplicando a la conversación.
- Chatbots: nombre del widget que deje claro que es IA, o primer mensaje fijo vía
  *Deliver Text Session Message*. SMS/WhatsApp: en la plantilla del primer mensaje.
  Email: footer fijo en la plantilla del cuerpo.
- **Residencia de datos EU completa** disponible bajo petición al equipo de cuenta.

> Para nuestra demo esto no es burocracia: **es un punto de pitch**. Enseñar el toggle de
> disclosure activado y explicar por qué está en el nodo y no en el prompt demuestra que
> entendemos el dominio mejor que un equipo que solo hace que el bot hable bonito.

## Infraestructura y seguridad

Kubernetes en red virtual aislada; doble edge (WAF+LB para REST/webhooks, gateway SIP
endurecido para voz); TLS 1.3; SIP sobre TLS + SRTP con peering a carriers tier-1, PBX
on-prem y cloud; WebRTC; pipeline de modelos enchufable con failover automático entre
proveedores de LLM/TTS/STT y modelos propios en cluster (TTS, VAD, fin de turno, limpieza
de voz). Despliegue en cloud gestionado, **VPC del cliente** (AWS/GCP/Azure) u **on-prem**.
Retención por workflow con borrado automático; sin entrenamiento con datos del cliente ni
compartición entre tenants; SSO OAuth, MFA, RBAC. Declaran SOC 2 Type II, RGPD, HIPAA,
EU AI Act, NIST CSF y DORA (docs bajo NDA).

## Preguntas abiertas

- [ ] ¿Qué nos dan en el hackathon: cuenta, API key, número de teléfono, créditos?
      (La doc dice que las cuentas son vía `sales@happyrobot.ai`.)
- [ ] ¿Cluster US o EU?
- [ ] ¿Tenemos acceso a **Apps** y a **Twin**? Cambiarían mucho el alcance de la demo.
- [ ] ¿Está habilitado el MCP con OAuth para nuestras cuentas?
- [ ] Latencia real end-to-end y concurrencia máxima en el entorno de prueba.

## Fuentes

- Mirror local de la documentación oficial (ver [`00-documentacion-oficial.md`](00-documentacion-oficial.md)):
  `platform-overview.md`, `quickstart.md`, `core-nodes/overview.md`, `workflows/signals.md`,
  `twin/overview.md`, `apps/overview.md`, `developer-tools/mcp.md`,
  `compliance/eu-ai-act-and-gdpr.md`, `integrations/overview.md`, `llms.txt`
- HappyRobot — Technical overview — https://www.happyrobot.ai/blog/technical-overview (2026-09-18)
- HappyRobot — Security and reliability — https://www.happyrobot.ai/product/security-and-reliability (2026-09-18)
- HappyRobot — Inside the workflow engine — https://www.happyrobot.ai/blog/inside-happyrobots-workflow-engine (2026-09-18)
- APIs.io — Happyrobot Public API v2 / EU cluster / Trust Center — https://apis.io/apis/happyrobot/happyrobot-public-api/ (2026-09-18)
