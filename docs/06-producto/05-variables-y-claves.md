# Variables y claves — qué va dónde

> Escrito el 19 sep 2026 tras perder más de una hora en 401 que no eran 401. Sacado de
> `api/settings.py`, de las variables reales del workflow y de `localStorage` de Vigía, no de
> memoria.
>
> **Ningún valor real vive en este fichero.** El repo es público: aquí van los nombres y de
> dónde sale cada valor. Los secretos están en Railway, en `.env` (no versionado) y en las
> variables del workflow.

## El mapa en una frase

Hay **cuatro sitios** donde se configura algo, y tres de ellos tienen que compartir **el mismo
secreto**:

```
                    ┌─ Railway (API desplegada) ──┐
   mismo secreto ───┼─ .env local ────────────────┤
                    └─ HappyRobot: API_KEY ───────┘   ← el callback entra con esta
                       Navegador: clave de operador   ← y la UI, con esa misma
```

Si esos cuatro no coinciden, el síntoma es siempre el mismo —401— y nunca dice cuál falla.

---

## 1. Railway · Variables (la API desplegada)

| Variable | Valor | Por qué |
|---|---|---|
| `HR_SHARED_SECRET` | **secreto propio, solo ASCII** | La puerta de la API. `openssl rand -hex 32`. **Nunca el ejemplo de `.env.example`**: el repo es público y la API se niega a marcar si detecta uno. Sin acentos: una `ñ` funciona en el navegador y da 401 por `curl` (§4). |
| `HR_WORKFLOW_WEBHOOK` | URL del incoming hook | La que da HappyRobot al publicar. Sin esto: «HR_WORKFLOW_WEBHOOK sin configurar». |
| `SCENARIO` | `ucm-madrid` \| `ucm-grupo` \| `sierra-culebra` | Sin ella cae a `sierra-culebra` y no verás al equipo. Se lee **una sola vez al arrancar**: un despliegue = un escenario para todo el mundo. Cambiarlo en caliente con `POST /reset` desconecta a quien esté compartiendo GPS — ver [`03-contrato-de-datos.md` §3](03-contrato-de-datos.md#post-reset--recarga-el-escenario-y-borra-el-ensayo-en-curso) (20 sep 2026). |
| `PHONE_OVERRIDES` | `p-001:+34…,p-002:+34…` | Los móviles reales. **No están en el repo** y por eso hacen falta aquí. Un `p-00X` que no exista se descarta con un warning. |
| `CALL_ALLOWLIST` | los mismos números, separados por comas | Cerrojo 2. Vacía = «sin filtro» en nuestra API, pero **«no marca nadie»** en cuanto el workflow tiene su nodo de autorización. |
| `ALLOW_REAL_CALLS` | `true` solo cuando toca | Cerrojo 1. |
| `CAMPANA_ORGANISMO` | p.ej. `Protección Civil de Madrid` | El agente lo dice en voz alta. Vacío se **oye** como un hueco. |
| `CAMPANA_ZONA` | p.ej. `Ciudad Universitaria` | Idem. |
| `ORDEN_AUTORIDAD` | `ninguna` o la orden en vigor | Si no es `ninguna`, el agente la transmite sin ofrecer alternativas. |
| `PUBLIC_BASE_URL` | la URL pública del despliegue | De aquí salen el enlace GPS y el de instrucciones. |
| `API_BASE_URL` | la URL pública del despliegue | Respaldo de la anterior. |
| `ROUTING_PROVIDER` | `straight` sin Valhalla levantado | `valhalla`/`osrm` requieren esos servicios. |

**Opcionales, con valor por defecto razonable:** `HR_API_KEY` (vacía si el hook no pide auth),
`DEMO_MODE` (`true`), `CALL_PARALLELISM` (8), `CALL_MAX_BATCH` (25), `CALL_MAX_RADIUS_M`
(20000), `CALL_STALE_MINUTES` (5), `HR_WORKFLOW_ID`, `HR_BASE_URL`, y los umbrales del planner.

**Sobra:** `PUBLIC_URL_BASE` — el código no la lee (solo `PUBLIC_BASE_URL`). Es un nombre de las
variables del workflow que se coló. Bórrala o alguien tocará una y no la otra. `DASHBOARD_PORT`
y `GPS_PORT` tampoco pintan nada en el contenedor.

## 2. `.env` local (no versionado)

Las mismas de arriba, con dos diferencias: `API_BASE_URL=http://localhost:<puerto>` y
`HR_SHARED_SECRET` **puede** ser otra — pero si la pones igual que la de Railway te ahorras
saber cuál toca en cada comando. Crear con `make env`, que copia `.env.example`.

## 3. HappyRobot · variables del workflow

Desde que el prompt y el nodo de voz leen del hook (`{{<hook>.data.*}}`), **la mayoría ya no se
usan**:

| Variable | Estado |
|---|---|
| `API_KEY` | **En uso y crítica.** Es la que manda el callback a nuestra `/calls/outcome`. Tiene que valer **lo mismo que `HR_SHARED_SECRET` de Railway** o el callback dará 401. |
| `API_BASE_URL` | En uso por los nodos que llaman a nuestra API. |
| `PUBLIC_URL_BASE` | En uso por el nodo del enlace de ubicación. |
| `CAMPANA_ORGANISMO`, `CAMPANA_ZONA`, `PERSONA_NOMBRE`, `PERSONA_ID`, `PRIOR_ZONA`, `PRIOR_NIVEL`, `ORDEN_AUTORIDAD`, `NUMERO_TELEFONO` | **Muertas en el camino principal.** Ahora llegan en el payload del hook. Siguen ahí con valores de una sola persona de prueba, y confunden al depurar: parece que el agente lee de ellas y no es verdad. Borrarlas o renombrarlas a `EJEMPLO_*`. |
| `HR_SHARED_SECRET` | Duplicado confuso de `API_KEY`. Decidid cuál manda y borrad la otra. |

## 4. Navegador (Vigía) · `localStorage`

| Clave | Valor |
|---|---|
| `vigia.operatorKey` | **El mismo `HR_SHARED_SECRET`** de la API contra la que apunta la pestaña. |
| `vigia.mapboxToken` | Token público de Mapbox (`pk.…`). |

Se rellenan desde la interfaz, pero **se quedan pegadas**: cambiar la clave en Railway no
cambia la del navegador. Desde la consola:

```javascript
localStorage.setItem('vigia.operatorKey', '<el secreto>')
```

## 5. Cómo comprobar que está bien, sin instalar nada

```bash
U=https://<tu-despliegue>
curl -s -o /dev/null -w "vieja=%{http_code} " $U/queue -H "x-api-key: cambiame-por-algo-largo"
curl -s -o /dev/null -w "nueva=%{http_code}\n" $U/queue -H "x-api-key: <tu secreto>"
curl -s $U/api/roster | head -c 300
```

`vieja=401 nueva=200` y el censo con las personas que esperas. Si `vieja` sigue en 200, la
variable no se ha aplicado — **no es un problema de formato**: si hubieras pegado mal la nueva,
fallarían las dos.

## 6. Los tres 401 que nos costaron la noche

1. **Clave distinta en cada punta.** La de Railway no era la del `.env`, y la del navegador era
   una tercera. Mismo error para las tres causas.
2. **Una `ñ` en el secreto.** Las cabeceras HTTP son latin-1 (RFC 9110): el navegador manda un
   byte, `curl` desde una terminal UTF-8 manda dos. La misma clave daba 200 y 401 según el
   cliente. El guard ahora acepta las dos lecturas, pero **usad ASCII**.
3. **El secreto de ejemplo en producción.** `cambiame-por-algo-largo` abría el despliegue, y
   está escrito en un fichero versionado de un repo público.
