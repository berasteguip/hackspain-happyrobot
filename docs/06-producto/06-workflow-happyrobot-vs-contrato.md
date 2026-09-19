# El workflow desplegado en HappyRobot frente al contrato

> **Actualizado:** 2026-09-19 · **Estado:** borrador
> **En una frase:** el workflow que hoy vive en la plataforma no implementa el
> contrato que este repo declara vinculante, y su prompt manda confinar justo
> donde el producto manda evacuar.

Leído directamente de la plataforma vía MCP el 2026-09-19, no supuesto. Todo lo de
aquí es contrastable abriendo el editor; si alguien toca el workflow, este documento
envejece el mismo día.

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

## Preguntas abiertas

- [ ] ¿El agente ordena moverse o solo informa la ruta? (§3 — bloquea el resto)
- [ ] ¿Quién alinea `Observación` con `prompts/05-extraccion.md`, y cuándo?
- [ ] ¿De dónde sale el número para los SMS salientes: Twilio propio o compra?
- [ ] ¿Se retira `/track` en favor de `web/gps`, o al revés?

## Fuentes

- Workflow `Triaje incendios — MVP`, nodos, prompt y extract leídos vía MCP el 2026-09-19 — https://platform.eu.happyrobot.ai/hackspainteam11/workflows/cmupqukyx4lk/editor/h9q19zzt3oxa
- Estado de la org (sin números, Twin no disponible), consultado vía MCP el 2026-09-19.
- Contrato vinculante: [`03-contrato-de-datos.md`](03-contrato-de-datos.md) y [`../../prompts/05-extraccion.md`](../../prompts/05-extraccion.md)
- Producto: [`02-escenario-incendio.md`](02-escenario-incendio.md)
