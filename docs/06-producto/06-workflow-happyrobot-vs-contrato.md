# El workflow desplegado en HappyRobot frente al contrato

> **Actualizado:** 2026-09-19 · **Estado:** borrador
> **En una frase:** el workflow que hoy vive en la plataforma no implementa el
> contrato que este repo declara vinculante, y su prompt manda confinar justo
> donde el producto manda evacuar.

Leído directamente de la plataforma vía MCP el 2026-09-19, no supuesto. Todo lo de
aquí es contrastable abriendo el editor; si alguien toca el workflow, este documento
envejece el mismo día.

> **Revisión posterior del 2026-09-19:** las secciones 1–4 describen la v2 histórica.
> El inventario actual de la v4 indicada por Mateo, con su workflow de terceros, está en §5.
> No interpretar la falta de número ni el esquema de 12 campos de la revisión antigua como estado actual.

## 1. Qué hay desplegado

Workflow **`Triaje incendios — MVP`** (`01a0b74c-0573-7ae5-9206-55a933434ad0`),
versión 2, **draft: ni publicada ni live**. Cuatro nodos:

| Nodo | Tipo | Qué hace |
| --- | --- | --- |
| Llamada de prueba (web) | trigger | Llamada **web** de prueba — no hay saliente telefónico |
| Agente de triaje | voice agent | Voz `Pau HR`, español, `gpt-5.6-luna`, grabación activada |
| Prompt | prompt | Guion: tres preguntas, clasificación por colores, replanificación |
| Observación | AI extract | 12 campos a partir del transcript |

Contexto que recibe (`use_case_variables`): `CAMPANA_ORGANISMO`, `CAMPANA_ZONA`,
`PERSONA_NOMBRE`, `PRIOR_ZONA`, `PRIOR_NIVEL`, `ORDEN_AUTORIDAD`.

La organización (`hackspainteam11`, cluster EU) **no tiene ningún número de teléfono
asociado** y **Twin no está disponible** (`404 — Twin database not available`). Para
mandar SMS desde el workflow harían falta credenciales propias de Twilio o comprar un
número; `use_existing_toll_free` no sirve, y además es solo US/CA.

## 2. En qué se desvía del contrato

[`03-contrato-de-datos.md`](03-contrato-de-datos.md) es vinculante y
[`../../prompts/05-extraccion.md`](../../prompts/05-extraccion.md) fija el esquema de
salida de la llamada (`run_id`, `person_id`, `phone`, `answered`, `duration_s`,
`extracted`, `agent_notes`, `transcript_url`). El nodo `Observación` desplegado emite
otra cosa completamente distinta:

`nivel` · `zona_declarada` · `tipo_lugar` · `llamas` · `humo_incapacita` · `pavesas` ·
`ladera_arriba` · `salida_libre` · `discrepancia` · `confianza` · `resultado` ·
`nota_libre`

Tres consecuencias:

1. **No hay `person_id`.** Sin él la llamada no se puede correlacionar con la persona
   del dataset, que es la clave de todo el contrato.
2. **`nivel` clasifica en rojo / naranja / amarillo / verde**, mientras el contrato
   ordena la cola por **minutos hasta que el fuego alcanza a la persona**
   ([`03-contrato-de-datos.md`](03-contrato-de-datos.md) §4). Son dos modelos de
   severidad distintos y nadie los ha mapeado.
3. **El extract no sale a ningún sitio.** No hay nodo `Webhook` que empuje el
   resultado a `api/`.

**Bug, además:** el `Initial Message` del agente tiene las variables sin interpolar.
Sale por voz *«le llama el asistente automático de ␣ por el incendio en ␣.»*, con los
huecos vacíos. Hay que arreglarlo antes de cualquier demo.

## 3. El conflicto de fondo: confinar vs. mover

El prompt desplegado es explícito:

- «**Nunca ordenas evacuar.** Puedes decir "prepare la salida". La orden la da la autoridad.»
- En NARANJA, por defecto **confinamiento**: «dentro es más seguro que salir por su cuenta».

El producto que describe [`02-escenario-incendio.md`](02-escenario-incendio.md) es
**guiado individual de evacuación**: cada persona con su ruta a su zona de salida. La
palabra «confinar» no aparece en ningún documento de producto ni en ningún prompt de
`prompts/`; solo en el agente que está desplegado. Son dos productos distintos
hablando por la misma boca.

> HIPÓTESIS de salida: el agente **nunca ordena** salir por iniciativa propia; informa
> la ruta y la zona de salida, y solo manda moverse cuando `ORDEN_AUTORIDAD` trae una
> evacuación decretada. Conserva el suelo de seguridad del prompt sin renunciar al
> guiado individual. Decidirlo es previo a tocar nada: cambia el guion, el SMS y el mapa.

## 4. Dos páginas de ubicación, no una

Hay dos páginas de ciudadano que hacen el mismo trabajo:
[`web/gps/index.html`](../../web/gps/index.html), que postea a `/positions` contra
`api/`, y `/track` de [`apps/command-center`](../../apps/command-center), que postea a
`/api/locations` — un middleware de Vite que **no sobrevive a `vite build`**. La
[decisión 003](../07-decisiones/003-frontend-y-dataset-unicos.md) dice que `web/gps`
sigue. Mientras no se cierre, conviene no invertir en las dos.

Cómo levantar `/track` y compartirlo con un móvil real está en
[`apps/command-center/README.md`](../../apps/command-center/README.md#seguimiento-de-ubicación-desde-un-móvil-real),
con el filtro DNS de la wifi de la UPM documentado: aplica a cualquier túnel, también
al de `web/gps`.

## 5. Inventario completo de la v4 indicada por Mateo — 2026-09-19

Inspección de configuración mediante MCP, sin ejecutar llamadas, pruebas de nodos ni mensajes.
Se leyeron los ocho nodos del padre y los cinco del workflow hijo, incluidos ambos prompts completos.
La petición es usar el agente entero; esta revisión no inicia la integración ni modifica workflows.

### Versiones y estructura

- Padre: `Triaje incendios — MVP`, workflow `01a0b74c-0573-7ae5-9206-55a933434ad0`,
  versión 4 `01a0b9fc-fa88-781b-b522-9286c460cb5b`, publicada/live, editor `l49nka6u9sbo`.
- Hijo: `Vigía · llamada a tercero`, workflow `01a0ba15-1f67-78cb-ae15-8870aad68040`,
  versión 1 `01a0ba15-1f79-715a-8530-977c1e415f72`, borrador, no publicada/live.

Padre: Workflow Function Request → Outbound Voice Agent → Observación (AI Extract).
El prompt del agente tiene dos tools: `enviar_enlace_ubicacion` → Ask for location
(Slack Send direct message) y `llamar_a_tercero` → Llamada a tercero (Workflow Function Call).
No hay nodos de condiciones, bucles, transferencia humana ni webhook de resultado principal.

Hijo: Petición del agente principal → Llamada al tercero → Qué han dicho (AI Extract)
→ POST `/calls/external`. La llamada tiene su propio prompt, sin tools adicionales.

### Funcionalidades del agente principal

- Llamada telefónica saliente al valor de `NUMERO_TELEFONO`, con número emisor de prueba
  configurado, voz Damaris HR, español y acento es-ES. Modelo del prompt y extractor:
  `gpt-5.6-luna`. La acción fuera de horario es `sleep`; no se ha verificado activación/calendario.
- Contexto de campaña: organismo, zona, nombre de persona, ubicación supuesta, nivel previo y
  orden de autoridad. El prompt no consulta censos, mapas ni bases de datos.
- Objetivos ordenados: determinar peligro, dar autoprotección y recoger observaciones para
  actualizar después un mapa. No despacha medios ni decide evacuaciones.
- Tres preguntas iniciales: ubicación/tipo de lugar y municipio, humo/llamas y proximidad,
  y acompañantes vulnerables. Puede cerrar si está claramente lejos del peligro.
- Clasificación por prompt: rojo (peligro inmediato/sin salida), naranja (amenaza próxima o
  salida comprometida), amarillo (humo sin llamas y salida libre), verde (sin humo/llamas y fuera).
  Ante duda elige el nivel mayor. La vulnerabilidad cambia el plan, no el nivel por sí sola.
- Autoprotección diferenciada por edificio/exterior/vehículo. En naranja propone confinamiento
  o preparación de salida, no evacuación autónoma. En amarillo aconseja precaución e información
  oficial; en verde cierre breve. Si existe una orden de autoridad, la transmite sin alternativas.
- El guion pide transferencia inmediata ante peligro vital o petición de humano, y que quien
  conduce pare antes. No hay transferencia ni destino humano conectado en los nodos inspeccionados.
- Replanificación asimétrica: verifica una vez municipio/paraje si hay discrepancia; puede bajar
  el nivel al principio si la observación coherente contradice el prior. Puede subirlo en cualquier
  momento e interrumpir el cuestionario. Pide confirmar salida libre antes de cerrar una rebaja.
- Estilo: identificación como asistente automático, tono calmado, una pregunta por turno,
  máximo siete preguntas, no más de dos seguidas sin aportar algo útil, sin consejos médicos
  ni afirmaciones propias sobre ubicación/avance/ETA del fuego. Incluye reglas de pronunciación
  de horas, distancias, direcciones y teléfonos. Son instrucciones al modelo, no contadores de nodos.

### Enlace de ubicación

La tool no recibe parámetros. El prompt principal indica ofrecer el enlace después de la
instrucción de amarillo/naranja, una vez por llamada, anunciándolo y respetando una negativa;
no usarlo en rojo/verde. La descripción de la tool, en cambio, pide enviarlo en el segundo turno,
antes de preguntar por humo y antes de clasificar, salvo peligro rojo ya conocido o conducción.
**Hay una contradicción de timing entre prompt y tool.**

La acción real no es SMS: el event ID `01926df9-9a6a-787c-a684-0473188490b0` corresponde a
Slack Send direct message y el destinatario es un usuario fijo de Slack. Envía un enlace `/track`
con un dominio de túnel fijo. `{{use_case_variables.PERSONA_ID}}` está escrito en un nodo de texto,
no como referencia Plate; su interpolación no se ha validado. No se comprobó el túnel ni la
recepción de GPS. Enviar ese enlace no implementa seguimiento, recálculo o rellamada por sí mismo.

### Consulta a terceros

La tool recibe `numero`, `a_quien`, `tipo`, `motivo` y, opcionalmente, `de_parte_de`.
Puede consultar a un organismo una duda sobre carretera/refugio/orden que cambie la acción,
o contactar a un familiar/vecino mencionado que podría estar en peligro. En el segundo caso
el guion pide ofrecerlo de forma proactiva y recoger número, nombre, ubicación y mensaje.

Exige anunciar destinatario, avisar de la espera y esperar aceptación. No usarla en rojo,
si retiene una salida urgente, sin número confirmado, ante negativa ni a números de emergencias.
El límite de dos consultas por llamada está escrito en el prompt. Al volver debe citar fuente
antigüedad y ausencia de respuesta sin inventar información.

La invocación del hijo es síncrona (`fire_and_forget=false`), timeout 240 s, entorno del caller
y manejo tolerante de errores/timeout. El nodo de respuesta seleccionado es Qué han dicho.
Además de los cinco parámetros de la tool se pasan `zona`, `persona`, `person_id` y `run_id_padre`.

El hijo se declara callable por workflows y acepta esos nueve parámetros. Su guion diferencia:

- Oficial: identificarse, explicar la consulta, preguntar, repetir la respuesta para confirmar,
  preguntar desde cuándo es válida y cerrar. No pedir despliegues ni transmitir órdenes.
- Particular: identificarse de parte del conocido, explicar el aviso, preguntar si está bien y
  dónde está; ante peligro indica llamar al 112. No ordena evacuar ni decide dónde está el fuego.
- Duración deseada inferior a dos minutos, cierre rápido, sin insistencia. Voz Damaris HR,
  es-ES, GPT-5.6 Luna y fondo call center configurado.

**En la configuración actual marca `NUMERO_DEMO`, no el `numero` recibido.** Es un ensayo:
el número solicitado se conserva para registro junto al que realmente se marca.

El extractor hijo devuelve seis campos: `contactado`, `respuesta`, `quien_responde`,
`vigencia_min`, `esta_bien`, `donde_esta`. No contacto/buzón/interrupción se describen como false
con respuesta vacía. Después hay un POST JSON a `API_BASE_URL/calls/external`, autenticado con
`x-api-key` usando `API_KEY`, con contexto, IDs padre/persona, número solicitado y marcado,
los seis campos y URL del run del hijo. Tiene `ignore5XX=true`; no se ha verificado la entrega.
El puente local actual no expone `/calls/external`.

### Datos extraídos al terminar la llamada principal

La v4 tiene **ocho campos**, no los doce de la v2:

| Campo | Significado configurado |
| --- | --- |
| `nivel` | rojo, naranja, amarillo o verde; vacío si no se pudo determinar |
| `zona_declarada` | municipio/paraje dicho por la persona |
| `tipo_lugar` | edificio, exterior o vehiculo |
| `llamas` | booleano cuya descripción actual pregunta por «llamas o humo» |
| `discrepancia` | ninguna, prior_alto_obs_baja o prior_bajo_obs_alta |
| `confianza` | alta/media/baja según claridad y completitud de la conversación |
| `resultado` | completada, cortada o no_contactado |
| `nota_libre` | dos o tres frases de información adicional |

No produce directamente `will_evacuate`, `consent_position`, `mobility`, `people_at_home`
ni coordenadas. No hay POST `/calls/outcome` principal. No tiene asignación de refugio/ruta,
monitorización de movimiento ni búsqueda censal.

### Otros puntos a resolver antes de integrar entero

- Ambos mensajes iniciales tienen huecos literales en nombres/organismo/zona. El padre abre
  con «asistente automático de  por el incendio en »; el hijo tiene huecos equivalentes.
- El trigger del padre no tiene configuración ni parámetros declarados. El contexto se referencia
  mediante variables del workflow, no el payload del Chatbot Request de nuestra centralita.
- Variables del padre disponibles: CAMPANA_ORGANISMO, CAMPANA_ZONA, PERSONA_NOMBRE, PRIOR_ZONA,
  PRIOR_NIVEL, ORDEN_AUTORIDAD, NUMERO_TELEFONO, PERSONA_ID, API_BASE_URL, API_KEY, PUBLIC_URL_BASE,
  HR_SHARED_SECRET. Que existan no significa que todos sus valores o usos estén verificados.
- Variables del hijo: CAMPANA_ORGANISMO, NUMERO_DEMO, API_BASE_URL, API_KEY.
- El padre está publicado, pero el hijo está en borrador; no se ha probado invocación productiva.
- La transferencia humana se ordena en texto pero no está conectada. Los límites conversacionales
  del prompt no equivalen a límites duros del motor.
- Sustituir solo el workflow ID del chat no basta: este conjunto usa telefonía saliente y otro
  contrato de resultados. Usarlo entero incluye ambas tools, el workflow hijo y sus efectos externos.

## Preguntas abiertas

- [ ] ¿El agente ordena moverse o solo informa la ruta? (§3 — bloquea el resto)
- [ ] ¿Quién alinea `Observación` con `prompts/05-extraccion.md`, y cuándo?
- [ ] ¿De dónde sale el número para los SMS salientes: Twilio propio o compra?
- [ ] ¿Se retira `/track` en favor de `web/gps`, o al revés?

## Fuentes

- Revisión actual §5: ocho nodos de `Triaje incendios — MVP` v4 leídos mediante `get_workflow_details`, `get_node_details`, `get_available_variables` y esquema de Outbound Voice Agent, MCP 2026-09-19 — https://platform.eu.happyrobot.ai/hackspainteam11/workflows/cmupqukyx4lk/editor/l49nka6u9sbo
- Cinco nodos y variables de `Vigía · llamada a tercero` v1, MCP 2026-09-19 — https://platform.eu.happyrobot.ai/hackspainteam11/workflows/iif4pdcxctya/editor/zwio6k0fgc46
- Catálogo de integraciones Slack consultado por MCP (`list_integrations`, búsqueda slack), 2026-09-19: el event ID del nodo Ask for location es Send direct message, no SMS.
- Revisión histórica: Workflow `Triaje incendios — MVP`, nodos, prompt y extract leídos vía MCP el 2026-09-19 — https://platform.eu.happyrobot.ai/hackspainteam11/workflows/cmupqukyx4lk/editor/h9q19zzt3oxa
- Estado de la org (sin números, Twin no disponible), consultado vía MCP el 2026-09-19.
- Contrato vinculante: [`03-contrato-de-datos.md`](03-contrato-de-datos.md) y [`../../prompts/05-extraccion.md`](../../prompts/05-extraccion.md)
- Producto: [`02-escenario-incendio.md`](02-escenario-incendio.md)
