# Plataforma HappyRobot: qué expone y cómo la usamos

Workspace del equipo: `https://platform.eu.happyrobot.ai/hackspainteam11/` (región EU, login Auth0 con la cuenta del equipo). Organización: "HackSpain - Team 11".

Fuentes: recorrido del workspace con navegador el 18 sep 2026 (22:00 CEST) más tutorial oficial y Developer Tools de happyrobot.ai. La doc técnica (docs.happyrobot.ai) está detrás de un access code: **pedirlo en el stand**.

Leyenda: [OK] visto en el workspace · [DOC] solo en doc pública · [?] pendiente de confirmar en el stand.

## 1. Mapa del workspace [OK]

Sidebar: **Frontal**, **Workflows**, **Twin**, **Interfaces**, **Integrations**, **Settings**.

- **Frontal**: copiloto de la plataforma. Chat con "Claude Opus 5" en modo Build: le describes el workflow y lo construye. Ejemplos sugeridos: "outbound call que cuente un chiste", "inbound triaging". Ahorra horas de canvas.
- **Workflows**: lista de workflows (ya existe uno, `test`, con trigger Web call). Botón Create crea uno vacío; el trigger se elige en el canvas.
- **Twin**: Graph (vacío), Knowledge bases (subir documentos para que el agente consulte), Contacts (se llenan solos al interactuar). Twin también aparece como nodo dentro del workflow: base de datos propia de la plataforma.
- **Interfaces**: no visitado (la URL adivinada redirige al editor). Por doc: Web SDK y chat embebido.
- **Integrations**: 167 integraciones disponibles, **0 conectadas**. Slack, Google Sheets, Gmail, Redis, Google Maps, HubSpot, etc. Cada una se conecta con OAuth o API key.
- **Settings**: Usage (créditos), API Keys (se pueden crear), MCP Clients, Telephony.

## 2. Workflow: estructura y pestañas [OK]

Cada workflow tiene: Editor, Runs, Experiments, Northstars, Tests, Analytics, Audits, General, Variables, Approval Process, Out of Office, Signals. Arriba: Pull requests, Fork, Version options, Preview, Publish. Engine V3 (loops, merges, A/B).

Versiones publicadas inmutables; para editar, Fork. Tres entornos (Development / Staging / Production) con URL de webhook propia.

## 3. Triggers [DOC, uno OK]

| Trigger | Se dispara cuando | Para nosotros |
|---|---|---|
| Web call [OK] | llamada desde el navegador (WebRTC) | **demo sin teléfono: el jurado habla con el agente** |
| Inbound phone call | entra llamada a un número asignado | ciudadanos/equipos llaman al centro de crisis |
| Webhook / API | POST a la URL del workflow (params tipados, `x-api-key`) | **nuestro motor de eventos dispara acciones** |
| SMS / WhatsApp | mensaje entrante a un número | reportes de campo [?] número |
| Email | correo a Gmail/Outlook conectado | poco útil en 36h |
| Schedule | cron/intervalo | re-evaluación periódica del plan |

## 4. Catálogo de nodos [OK]

Menú "+" del canvas: **Agents**, **AI**, **Built-in**, y una categoría por integración.

- **Agents**: agente de voz o texto (STT+LLM+TTS). Persona, modelo, prompt, mensaje inicial. Con **Tools** hijos: funciones que el agente llama a mitad de conversación (consultar nuestro estado de crisis en vivo).
- **AI**: Generate, Extract, Classify. Pasos LLM sin conversación (clasificar un mensaje entrante, extraer campos de una transcripción).
- **Built-in**: Webhook GET/POST (llamar a nuestra API), **Python Sandbox** (lógica arbitraria), Loop, Paths (condiciones/ramas), Sleep, **Function Call** (invocar otro workflow), **Send SMS**, **Transfer** (pasar la llamada a un humano).
- **Integraciones como nodos**: Google Maps (distancias y rutas: asignar recursos por proximidad), Twin (BD propia), Slack, Google Sheets, Redis, etc.
- Variables `@nombre` entre nodos.

## 5. Telefonía [OK]

- Sin números asignados al workspace de partida.
- **Se pueden comprar números** desde Settings > Telephony > Add New (proveedor Telnyx): 0,80 $ compra + 0,18 $/mes. **España está en la lista de países.** También SIP trunk.
- No comprado todavía. Decidir si hace falta (la demo puede ir por Web call sin número). [?] Preguntar en el stand si nos dan número o créditos para llamadas salientes a móviles españoles.

## 6. Créditos y precios [OK]

Settings > Usage. Orientativo: voz ~24 créditos/min, texto ~7 créditos/mensaje. [?] Cuántos créditos tiene la cuenta del hackathon y si se recargan.

## 7. Programático [OK parcial]

- **API Keys**: se crean en Settings > API Keys. REST API sobre workflows, agents, integrations, contacts, runs. [?] Base URL de la región EU (probablemente `platform.eu.happyrobot.ai/api/...`, confirmar en docs).
- **MCP Clients** en Settings: la plataforma como tools MCP (crear workflows, integraciones, evals) desde Kiro/Claude. "Clientes locales sin config". **Vía rápida para construir desde el IDE.**
- TypeScript SDK [DOC].
- Twin/Context: capa de datos con API. Candidato a "estado de crisis" compartido entre nuestro motor y los agentes.

## 8. Observabilidad y aprendizaje [OK]

Runs (transcripción, logs, versión, entorno), Northstars (criterios binarios evaluados por auditor automático en cada run), Tests, Experiments (A/B), Analytics, Audits, Signals. El bonus "aprende de ejecuciones anteriores" se alimenta de Runs + Northstars sin inventar nada.

## 9. Qué queda por confirmar en el stand [?]

1. Créditos disponibles y si dan número/llamadas salientes gratis.
2. Base URL y access code de docs.happyrobot.ai.
3. Qué hace exactamente Interfaces y si el Web SDK se puede embeber en nuestro dashboard.
4. Límites del Python Sandbox (librerías, red saliente).
5. Si el MCP Server permite crear workflows completos o solo gestionarlos.

## 10. Cómo encaja con el reto

```
Motor de escenario (nuestro) --webhook--> Workflows HappyRobot --> llamadas / SMS / Slack / Sheets
        |                                          |
        v                                          v
   Estado de crisis  <--Tool nodes / Webhook GET--  Agente de voz consulta y escribe
        |
        v
   Dashboard humano (estado, runs, decisiones; intervención; botón Web call)
```

- **Cambio de escenario en runtime**: nuestro motor empuja eventos por webhook y actualiza el estado.
- **Decisión y priorización**: agente nuestro (LLM) o workflow con Paths + AI Classify; decidir según velocidad de construcción.
- **Ejecución real**: llamadas y SMS salen por HappyRobot. Google Maps para asignar recursos por distancia. Slack para avisar a responsables.
- **Control humano**: dashboard + Transfer node (el agente pasa la llamada a una persona) + Approval Process del workflow.
- **Demo**: botón Web call en el dashboard para que el jurado hable con el agente sin teléfono.
