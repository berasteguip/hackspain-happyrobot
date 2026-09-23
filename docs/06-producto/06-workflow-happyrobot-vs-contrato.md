# El workflow desplegado en HappyRobot frente al contrato

> **Actualizado:** 2026-09-20 · **Estado:** borrador
> **En una frase:** el workflow que hoy vive en la plataforma no implementa el
> contrato que este repo declara vinculante, y su prompt manda confinar justo
> donde el producto manda evacuar.

Leído directamente de la plataforma vía MCP el 2026-09-19, no supuesto. Todo lo de
aquí es contrastable abriendo el editor; si alguien toca el workflow, este documento
envejece el mismo día.

## 1. Qué hay desplegado

Workflow **`Triaje incendios — MVP`** (`01a0b74c-0573-7ae5-9206-55a933434ad0`).

> **Foto de la v2, obsoleta desde el 19 sep 2026 por la tarde.** Ese día el workflow
> creció hasta la **v6 (publicada y LIVE)**, con 15 nodos: trigger `Incoming hook`,
> tres cerrojos de destino en Python Sandbox, tres agentes de voz (la persona, un
> tercero mencionado y un organismo oficial) y sus tools. La v6 sigue siendo la base;
> lo único que le falta al contrato es lo que añade la **v7** del §5. La tabla de abajo
> se conserva porque el nodo `Observación` y el prompt no han cambiado.

Cuatro nodos (v2):

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
3. ~~**El extract no sale a ningún sitio.** No hay nodo `Webhook` que empuje el
   resultado a `api/`.~~ **Resuelto el 2026-09-19** — ver §5.

> **Corrección (2026-09-19).** Una versión anterior de este documento decía que el
> `Initial Message` del agente tenía las variables sin interpolar. **Es falso.** Los chips
> de variable están en su sitio y la llamada suena bien; lo comprobamos escuchándola y
> leyendo el Plate JSON del nodo. El error vino de leer la vista en markdown que devuelve
> el MCP, que **elimina los chips de variable** y deja huecos que parecen texto roto. Para
> auditar un prompt hay que pedir `include_plate_json=true`.

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

## Propuesta de demo con llamadas reales al equipo — 2026-09-19

> HIPÓTESIS de producto, pendiente de cerrar con el equipo: el coordinador debe poder
> abrir la conversación de una persona para comprobar qué declaró y por qué cambió
> su plan. La ficha debería priorizar la instrucción vigente y los datos confirmados,
> conservando conversación e historial de llamadas por `person_id` y `run_id`.

La petición del equipo plantea una llamada de HappyRobot a un participante que hace
de afectado, movimiento simulado después de colgar, un cambio de viento que exponga
al norte y una solicitud posterior de refuerzos. La secuencia propuesta es:

1. Una llamada real de prueba recoge respuesta, disposición a evacuar, movilidad y
   consentimiento. Su resultado estructurado actualiza al contacto correspondiente.
2. Solo un resultado compatible inicia el movimiento de su avatar de demo; colgar
   por sí solo no demuestra aceptación ni evacuación. La ubicación del avatar no se
   presenta como GPS real del participante.
3. Un evento de escenario modifica el viento y la versión del plan. El backend
   determina nuevas exposiciones y rutas afectadas; el agente consulta el contexto
   actualizado y comunica solo a quienes necesitan una instrucción nueva.
4. Un rol separado prepara una solicitud de apoyo con sector, necesidad y estado de
   evacuación, revisable por el mando. Un compañero representa al centro receptor y
   confirma disponibilidad/ETA. No se llama a servicios públicos reales en la demo.

> HIPÓTESIS: conviene demostrar primero una llamada completa → callback → estado →
> movimiento, después el cambio de situación y finalmente la coordinación de recursos.
> Los roles pueden ser nodos/workflows con guiones distintos sobre el mismo estado;
> no requieren agentes autónomos negociando entre sí ni varias fuentes de verdad.

**Transcripción en vivo pendiente de verificación para el canal elegido.** Las notas
locales de SDK documentan sesiones/runs y escucha WebRTC, pero eso no demuestra un
stream de texto para llamadas telefónicas outbound. En esta revisión no se pudo leer
el mirror privado por sus restricciones de acceso. Como alternativa de demo se puede
plantear conversación/resumen al finalizar, confirmando antes cómo entrega esos datos
el workflow. No se debe presentar un texto simulado como transcript de una llamada real.

**Revisión necesaria del guion existente:** `prompts/07-guion-demo.md` §2.2 contiene
«esto no es una prueba». Para llamadas de demostración al equipo la presentación debe
identificar el simulacro. Tampoco deben darse por ejecutadas las capacidades descritas
en ese guion solo porque estén escritas: cada evento debe corresponder a una acción
observada. Llamar de verdad requiere destinos de prueba autorizados; no basta con
tratar el interruptor global `ALLOW_REAL_CALLS` como si fuera una lista de destinos.

Fuentes de esta revisión: solicitud del equipo del 2026-09-19;
[`../02-happyrobot/04-api-y-sdk.md`](../02-happyrobot/04-api-y-sdk.md) §§8–9;
[`03-contrato-de-datos.md`](03-contrato-de-datos.md) §3;
[`../../api/notify.py`](../../api/notify.py) y
[`../../prompts/07-guion-demo.md`](../../prompts/07-guion-demo.md) (revisados 2026-09-19).

## 5. El camino de vuelta: la observación vuelve a Vigía — 2026-09-19

Hecho, no hipótesis. Versión **7** del workflow `Triaje incendios — MVP`
(`cmupqukyx4lk`), forkeada de la v6 que estaba en vivo: un nodo **`Webhook POST`
«Observación → Vigía»** cuelga del nodo `Observación` y postea el extract a
`{{API_BASE_URL}}/calls/observation` con `x-api-key: {{API_KEY}}`.

En `api/` lo recoge `POST /calls/observation`
([`api/routers/calls.py`](../../api/routers/calls.py)), que **envuelve** a `/calls/outcome`
—o sea, no duplica el mecanismo de llamadas— y además escribe un objeto `Triage` sobre la
`Person`. `GET /api/roster` lo expone y el puesto de mando colorea el punto con él.

Sobre el desajuste del §2, que sigue siendo real: no se ha renombrado nada en la plataforma.
Los nombres del extract (`nivel`, `zona_declarada`, `discrepancia`…) se aceptan **como alias**
del contrato en inglés, y `person_id` viaja aparte, desde `{{hook.data.PERSONA_ID}}`, que es el
mismo id que la API mandó al disparar la llamada. Los puntos 1 y 2 del §2 quedan así:

- **Punto 1 (no hay `person_id`)**: resuelto. No sale del extract, sale del trigger.
- **Punto 2 (`nivel` vs `minutes_to_front`)**: **no se mapean, y es deliberado.**
  `minutes_to_front` es geometría y sigue ordenando la cola; `triage.level` es lo que dijo una
  persona y es lo que tiñe el mapa. Inventar una equivalencia (`rojo = 10 min`) sería fabricar
  un dato: la persona no dijo minutos. Donde discrepan, el campo `discrepancia` del propio
  extract lo dice con todas las letras y el mando lo lee en la ficha.

### Verificado con sondas contra la plataforma (2026-09-19)

- La sustitución de variables dentro de un `body.raw` con `contentType: application/json`
  **escapa las comillas** del texto libre: una `nota_libre` con `Dice: "salgo ya"` llega como
  JSON válido. Comprobado con `test_node` contra `POST /positions` de la API desplegada, que
  devolvió el cuerpo parseado en su error de validación.
- `test_node` sobre un nodo webhook lo ejecuta **sin lanzar la llamada de voz**: es la forma
  barata de probar este nodo sin que suene ningún teléfono.

### Pendiente antes de publicar la v7

1. **La variable `API_KEY` del workflow no la acepta la API desplegada** (`401 x-api-key
   inválida o ausente`, sonda del 19 sep 2026). Tiene que valer exactamente lo mismo que
   `HR_SHARED_SECRET` en Railway. La variable `HR_SHARED_SECRET` del workflow tampoco vale:
   está comprobado que da 401.
2. **`/calls/observation` todavía no está desplegado.** Vive en la rama
   `claude/agent-app-webhook-bidirectional-a8316e`; hasta que llegue a Railway el nodo daría 404.

Con esas dos cosas hechas, publicar la v7 (reemplaza a la v6 en producción) y volver a lanzar la
sonda: un `501` desde `/sim/run` o un `200` desde `/calls/observation` confirman el circuito.

## 6. La segunda llamada al colgar, y quién anima cada punto — 2026-09-20

Hecho, leído en los runs de la plataforma vía MCP (`monitor_runs`, workflow `cmupqukyx4lk`,
v12 publicada y en vivo), no supuesto.

**Síntoma.** Tras colgar una llamada atendida, el mismo teléfono volvía a sonar sin motivo.
Ráfaga de las 05:37 UTC: cinco llamadas atendidas, cinco runs nuevos creados 0,4 s antes de
que cada run original marcase `completed`. El `Incoming hook` de esos runs nuevos trae
`reason: "Su trayectoria entra en el cono de avance del fuego"` y `say_this: "…pare y
escúcheme: el fuego se está metiendo por donde va. Dé la vuelta…"`. Es decir: los disparó
nuestra API, no la plataforma.

**Causa.** El nodo «Observación → Vigía» postea a `/calls/observation`; la API deja a la
persona en `contacted` y corre el planner; `detect_at_risk` admitía `contacted` y decidía por
posición (`is_in_advance_cone`), no por trayectoria; la casa está dentro del cono (que cubre el
pueblo entero) → `at_risk` y `place_call` en el acto. Alguien sentado en su salón recibía la
orden de dar la vuelta. Y si rechazaba esa segunda llamada, el `no_contactado` lo dejaba en
`no_answer` (rojo) y su casa escalaba a la patrulla: run `8e23f34e` (Allan), decisiones
`ev-000087`…`ev-000090`.

**Arreglos en `api/`** (con tests):

- `planner.detect_at_risk` solo dispara sobre `moving`: la llamada en el acto es para quien va
  hacia el fuego. Quien acaba de colgar en casa ya tiene la instrucción, y la cola y la
  patrulla ya cuentan con su casa.
- El planner ya no marca a quien tiene un intento vivo en el tablero (`_GuardedNotify`).
- Un «SMS» del planner (cambio de ruta, convoy) salía por el mismo webhook que la voz, y el
  workflow ignora `action`: también era una llamada. Sin `HR_SMS_WEBHOOK` el SMS se registra
  en el decision_log y no sale.
- Los números del rango sintético `+3460099…` no se marcan: HappyRobot los intentaba (el
  «Freno de mano» solo comprueba que parezcan un móvil español), la centralita los devolvía
  `busy` / `sip_user_unavailable` a los 0 s (ráfaga de las 03:21: 8 de 14), el extract decía
  `no_contactado` y la API pintaba de rojo a un vecino inventado, pisando la simulación local.
  Quedan como `simulated` con el motivo en el tablero, y `dialable` del roster ya lo refleja.

**Arreglo en el CECOP.** El círculo en modo real enrolaba a TODOS en la simulación local,
también a los teléfonos reales: el punto «descolgaba» a los 2,4 s y echaba a correr antes de
que la persona cogiera el teléfono. Ahora quien tiene un intento vivo en HappyRobot queda
marcado `real` y la simulación no le toca ni estado ni posición: lo que le pase entra por el
tablero (`ringing` → `answered` / `no_answer`) y por el triaje del roster. Sin respuesta,
buzón de voz o rechazo → el extract dice `no_contactado` (verificado en los runs `a57e7928`
y `8e23f34e`) → punto rojo con la escalada a fuerzas de seguridad disponible, exactamente
igual que para un vecino simulado. Un intento `stale` (cinco minutos sin desenlace) también
se pinta como sin respuesta: para el mando es una casa a la que nadie ha llegado.

Lo que sigue igual: `voice_mail: "hangup"` en el Outbound Voice Agent (cuelga al saltar el
buzón, 3-5 s) y `from_number` de EEUU (§ pendientes de `02-happyrobot/06-trigger-desde-fuera.md`).

Fuentes: runs `2aaecbb0`, `2838e80e`, `c4bb7eb7`, `8e23f34e`, `14de1d9a`, `a57e7928` y las
sesiones del workflow (`monitor_runs action=sessions`), leídos vía MCP el 2026-09-20.

## Preguntas abiertas

- [ ] ¿El agente ordena moverse o solo informa la ruta? (§3 — bloquea el resto)
- [x] ¿Quién alinea `Observación` con `prompts/05-extraccion.md`, y cuándo? — 2026-09-19: no se alinea en la plataforma; la API acepta los nombres del extract como alias (§5).
- [ ] ¿De dónde sale el número para los SMS salientes: Twilio propio o compra?
- [ ] ¿Se retira `/track` en favor de `web/gps`, o al revés?

## Fuentes

- Workflow `Triaje incendios — MVP`, nodos, prompt y extract leídos vía MCP el 2026-09-19 — https://platform.eu.happyrobot.ai/hackspainteam11/workflows/cmupqukyx4lk/editor/h9q19zzt3oxa
- Estado de la org (sin números, Twin no disponible), consultado vía MCP el 2026-09-19.
- Contrato vinculante: [`03-contrato-de-datos.md`](03-contrato-de-datos.md) y [`../../prompts/05-extraccion.md`](../../prompts/05-extraccion.md)
- Producto: [`02-escenario-incendio.md`](02-escenario-incendio.md)
