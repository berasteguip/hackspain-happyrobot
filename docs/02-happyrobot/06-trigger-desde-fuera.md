# Arrancar llamadas desde nuestro repo — cómo funciona y qué nos costó

> Escrito el 19 sep 2026 contra el workspace `hackspainteam11`. **Funciona y está probado en
> vivo**: llamadas reales simultáneas a los móviles del equipo desde un círculo dibujado
> en Vigía. Todo lo de aquí sale de una llamada al MCP oficial o de un run real, no de la
> documentación.

## Lo que hace

Rodear un círculo en Vigía → cada punto de dentro se lleva **su propia llamada**, en paralelo,
con su nombre, su teléfono y su nivel estimado.

```
Vigía (navegador)                 API de crisis (api/)              HappyRobot
  círculo lat/lon/radio  ──POST /calls/dispatch──►  N × POST al hook  ──►  N runs de voz
                         ◄──tablero de la ráfaga──   (en paralelo)          │
  poll GET /calls        ◄──estado por llamada───   ◄──POST /calls/started──┘
                                                    ◄──POST /calls/outcome──┘
```

Los hilos no saben nada de HappyRobot: hacen un POST HTTP a `HR_WORKFLOW_WEBHOOK` y ya. El POST
solo **arranca** el run; la conversación sigue por su cuenta y vuelve por los dos callbacks.

## Cómo quedó montado

**Workflow:** «Triaje incendios — MVP» (`cmupqukyx4lk`), v5, publicada y live en `development`.

| Pieza | Valor |
|---|---|
| Nodo raíz | **Incoming hook** (`01929b66-a335-7514-a159-cae2fe715286`), sin auth |
| URL | `https://workflows.platform.eu.happyrobot.ai/hooks/development/cmupqukyx4lk` |
| `persistent_id` del hook | `01a0b74c-31e9-752e-85b3-abfbb6c4e728` |
| `to` del nodo de voz | `{{<hook>.data.NUMERO_TELEFONO}}` |
| Prompt y saludo | 9 + 3 referencias a `{{<hook>.data.*}}` |

En `.env` (no se comitea):

```bash
HR_WORKFLOW_WEBHOOK=https://workflows.platform.eu.happyrobot.ai/hooks/development/cmupqukyx4lk
HR_API_KEY=                       # vacía: el hook de development no pide auth
HR_SHARED_SECRET=...              # NUESTRA puerta. Nunca sale de aquí (ver §3)
ALLOW_REAL_CALLS=true             # cerrojo 1
CALL_ALLOWLIST=+34...,+34...      # cerrojo 2
CAMPANA_ORGANISMO=Protección Civil de Madrid
CAMPANA_ZONA=Ciudad Universitaria
```

Ensayo: `make vigia && make ensayo`, y `make reset` entre tandas. Círculo que coge exactamente
al equipo (cinco personas): centro **40.45298 / -3.72695**, radio **150 m**.

---

## Las cinco trampas, por orden de lo que costó cada una

### 1. Un `Workflow Function Request` no se puede disparar desde fuera

Los seis workflows de la familia Vigía/Triaje nacieron con ese trigger
(`019d95d2-e3e0-779a-9731-893810e5691f`, `callable_by_workflows: true`). Sirve para que un
workflow llame a **otro** como si fuera una función — es lo que hace `llamar_a_tercero`. No abre
ninguna superficie HTTP.

**Y `POST /workflows/:id/runs` tampoco vale**, aunque `04-api-y-sdk.md` §2 lo daba por "trigger
universal": devuelve `404 {"error": "Workflow not found upstream"}` contra dos workflows
publicados, por slug y por UUID. Lo único que arranca desde fuera es un trigger de webhook con
su propia URL: `webhook.incoming_hook` o `webhook.predefined_request`.

### 2. El payload del hook llega **anidado bajo `data`**

Esta es la que más tiempo se llevó. `set_custom_output` con el payload plano hace que el editor
ofrezca `{{<hook>.NUMERO_TELEFONO}}`… y en ejecución eso **no resuelve**, porque el output real
del nodo es:

```json
{"data": {...lo que mandaste...}, "query": {}, "method": "POST", "headers": {...}}
```

La referencia buena es `{{<hook>.data.NUMERO_TELEFONO}}`. Declara el custom output con esa forma
anidada y el editor ya te ofrece `data.X`.

> ⚠️ **El síntoma engaña.** Con el `to` sin resolver, el nodo de voz falla con
> `invalid phone number: : invalid outbound phone number` — el hueco entre los dos puntos. Es
> **el mismo error** que si mandas el teléfono vacío a propósito. Mandar vacío y ver ese error
> no prueba que la variable esté bien atada; prueba justo lo contrario de lo que parece. Para
> saber si resuelve, mira el **output del nodo del hook** en el run, no el error del de voz.

### 3. `HR_SHARED_SECRET` y `HR_API_KEY` van en direcciones contrarias

Y cruzarlas no es un 401: es una fuga.

* `HR_API_KEY` nos autentica **a nosotros ante HappyRobot**. Es la única que sale del repo.
* `HR_SHARED_SECRET` autentica **a quien llama a nuestra API**. Es nuestra puerta.

`notify._webhook_headers()` tenía un `settings.hr_api_key or settings.hr_shared_secret`. Con
`HR_API_KEY` vacía mandaba nuestro secreto de entrada en el POST saliente, y **quedaba escrito
literal en el output del nodo del webhook** (`"X-Api-Key": "..."`), a la vista de cualquiera con
acceso al workspace. Quitado el respaldo: sin `HR_API_KEY` se va sin cabecera de auth, que es lo
que el hook de development espera igualmente.

Pendiente: el nodo que nos llama de vuelta manda `x-api-key: {{API_KEY}}`, **otra variable
distinta** de `HR_SHARED_SECRET` y oculta en la UI. Si no valen lo mismo, `/calls/outcome` dará
401 en cuanto se monte el túnel y parecerá un problema del webhook.

### 4. Una clave con `ñ` vale o no según el cliente

Una cabecera HTTP es una secuencia de bytes **latin-1** (RFC 9110). El navegador manda `ñ` como
un byte (0xF1) y acierta; `curl` desde una terminal UTF-8 manda dos (0xC3 0xB1) y falla. Misma
clave, mismo servidor, **200 en la UI y 401 en `curl`**. Una hora de ensayo se fue en eso.

Dos arreglos, los dos en el repo:

* `_api_key_ok()` en `api/main.py` acepta las dos lecturas (con `compare_digest` **sobre bytes**:
  con `str` no ASCII lanza `TypeError`, que es justo el caso que tolera).
* `notify._header_value()` manda los valores no ASCII en latin-1 en vez de reventar con
  `'ascii' codec can't encode character '\xf1'`.

Aun así: **poned las claves en ASCII**. Esto lo hace funcionar, no lo hace correcto.

### 5. Publicar bloquea la versión

Tras `publish`, la versión queda `locked` y cualquier `update_workflow_nodes` da
`Cannot set custom output on a locked version`. El ciclo es **`unpublish` → editar →
`publish --force`**.

Y el validador del publish avisa de variables «no resueltas» que sí existen —incluido
`transcript` del agente de voz—. Con variables anidadas da falsos positivos: no es señal de
nada, comprobadlo con un run.

---

## Lo que sigue pendiente

* **Callbacks.** El tablero se queda en `ringing` y no pasa a `answered` hasta que HappyRobot
  pueda alcanzar `/calls/outcome`. Hace falta Railway o un túnel, y que `API_KEY` y
  `HR_SHARED_SECRET` valgan lo mismo (§3).
* **`from_number` es `+1 937 749 9893`**, de EEUU. Los dos números del workspace son americanos.
  Llamando a móviles españoles de noche, mucha gente no lo coge.
* **`llamar_a_organismo_oficial` marca un número fijo escrito en el nodo**, y sin prefijo `+34`.
  Es un móvil de ensayo del equipo, pero en ese formato no marca desde un número de EEUU — y
  además no debería estar escrito en el workflow: mismo criterio que con el repo.
* **`force` en la UI.** Para repetir sobre las mismas personas hay que `make reset`, que borra el
  tablero entero. Un checkbox «volver a llamar» conserva el historial de intentos, que es lo que
  hace bonito el tablero en la demo.
* **`predefined_request` en vez de `incoming_hook`** cuando haya tiempo: tipa los parámetros y
  quita el salto `data.`.
