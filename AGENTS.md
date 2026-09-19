# AGENTS.md — contexto para agentes de IA

Fuente de verdad para cualquier agente (Devin, Cursor, Claude Code, Codex) que trabaje en
este repositorio. Si otro archivo (`CLAUDE.md`, `.cursor/rules/*`) contradice a este, gana
este.

## 1. Qué es este proyecto

- **Equipo:** `router123`
- **Evento:** HackSpain 2026 (Madrid, UPM–ETSIT, 18–20 sept 2026, 36 h, 250 builders).
- **Track:** HappyRobot (primer track sponsor del evento).
- **Tesis de partida (aún abierta):** llevar los *AI workers* de HappyRobot —hoy desplegados
  en logística, energía, telco, seguros— al **sector público y la gestión de crisis**
  (112, protección civil, post-catástrofe tipo DANA).
- **Estado actual (19 sep, mediodía):** alcance de producto cerrado en
  `docs/06-producto/02-escenario-incendio.md` (guiado individual de evacuación en incendios
  forestales; 300 vecinos simulados con personalidad que hablan con HappyRobot por texto,
  decisión 002). Hay dos frontends (`web/dashboard`, `apps/command-center`) y dos datasets
  (Zamora, Ávila): unificarlos es la decisión 003, pendiente del equipo. La base de
  conocimiento sigue siendo obligatoria.


## 2. Cómo está organizado el repo

```
api/                 Estado de crisis (FastAPI): única fuente de verdad, decide prioridad, rutas, refugios
engine/              Motor de escenario: el incendio avanza y cambia la situación en runtime
sim/                 Simulador de evacuación: elige el plan que pierde a menos gente
data/                Dataset sintético (~120 casas / 300 personas, semilla fija) y validador
web/dashboard        Puesto de mando (MapLibre + OSM)      } dos frontends; ver docs/07-decisiones/003
apps/command-center  CECOP (Vite + React + Mapbox)         }
web/gps              Página del enlace que comparte la ubicación del vecino
prompts/             Guiones del agente de HappyRobot y guion de la demo
docs/                Base de conocimiento. OCHO carpetas, no crear más:
  00-meta/           Convenciones de escritura
  01-evento/         HackSpain y el enunciado oficial del reto (02-reto-happyrobot.md)
  02-happyrobot/     Empresa, plataforma, qué expone de verdad, API/SDK, preguntas para el stand
  03-dominio-crisis/ Emergencias en España, ES-Alert, datos de incendios, geografía, modelo de fuego, competencia
  04-regulacion/     AI Act, ENS, RGPD, LCSP, marco legal de llamar y geolocalizar
  05-investigacion/  Notas fechadas: barridos, contactos, entrevistas (YYYY-MM-DD-tema.md)
  06-producto/       Qué construimos: escenario, contrato de datos (vinculante), brief del agente
  07-decisiones/     Decisiones cerradas y propuestas abiertas (ADR ligero)
  _inbox/            Material crudo sin procesar (el mirror de docs.happyrobot.ai no se versiona)
```

Índice y ruta de lectura: [`docs/README.md`](docs/README.md).

## 2.bis Documentación oficial de HappyRobot (importante)

Hay un **mirror local completo** (389 páginas + OpenAPI) de `docs.happyrobot.ai`, que en
público requiere access code:

```
docs/_inbox/2026-09-18-happyrobot-docs-oficiales/
```

Antes de buscar en internet o de suponer cómo funciona la plataforma, **búscalo ahí**.
Empieza por `llms.txt` (índice completo). Guía de uso y páginas clave en
[`docs/02-happyrobot/00-documentacion-oficial.md`](docs/02-happyrobot/00-documentacion-oficial.md).

## 3. Reglas de trabajo sobre el conocimiento

1. **Todo hecho relevante va a `docs/`, no al chat.** Si descubres algo, escríbelo.
2. **Cita siempre la fuente.** Cada documento lleva cabecera con `actualizado` y una
   sección `## Fuentes` con URLs. Sin fuente, márcalo como `[SIN VERIFICAR]`.
3. **Separa hecho de hipótesis.** Usa `> HIPÓTESIS:` para lo que es nuestra opinión o
   suposición. Un juez, un mentor de HappyRobot o un compañero deben poder distinguirlo.
4. **No borres conocimiento, márcalo obsoleto.** Si algo cambia, tacha y anota la fecha.
5. **Material crudo → `docs/_inbox/`** con nombre descriptivo
   (`YYYY-MM-DD-origen-tema.ext`), y luego destílalo a un doc de la carpeta que toque.
6. **Fechas explícitas.** Este espacio se mueve rápido (HappyRobot levantó Serie B en
   sep-2025 y Serie C en ago-2026); cualquier cifra sin fecha envejece mal.

## 4. Convenciones

- **Idioma:** español para prosa, inglés para términos técnicos y de producto
  (workflow, carrier, dispatch, FDE...). No traducir nombres propios ni de producto.
- **Nombres de fichero:** `NN-slug-en-kebab-case.md`, numerados para orden de lectura.
- **Markdown:** encabezados con `##`, listas cortas, tablas solo cuando comparan.
- **Sin ficheros de documentación "de relleno".** Un doc nuevo solo si aporta algo que
  no cabe en uno existente.

## 5. Antes de empezar cualquier tarea

1. Lee `docs/README.md` (índice) y el doc del área que toques.
2. Comprueba `docs/07-decisiones/` para no reabrir algo ya cerrado.
3. Si la tarea depende de los materiales oficiales del track, mira primero
   `docs/_inbox/` y `docs/01-evento/`.

## 6. Cosas que aún NO sabemos (huecos a rellenar)

- [x] Enunciado oficial y criterios de evaluación: `docs/01-evento/02-reto-happyrobot.md`.
- [x] Restricción de vertical: no hay, la crisis la elegimos nosotros (mismo doc).
- [ ] Saldo de créditos, paralelismo del Loop, webhook síncrono, tool call en voz:
      `docs/02-happyrobot/05-preguntas-stand.md`. Preguntar en el stand.
- [ ] Formato y duración de la demo final, y quién juzga.
- [ ] Validación con quien ha coordinado emergencias reales:
      `docs/05-investigacion/2026-09-19-contacto-ines-galindo-csic.md`.

## 7. Integración del mapa avanzado con HappyRobot — 2026-09-19

Rama `devin/mapa-avanzado-happyrobot`: base `origin/main` en `f2a3214`, centralita
recuperada de `ade0f90`. Mantener las features de ese mapa, no reemplazarlo por el anterior.
El frontend conserva estado propio; no se ha unificado con la API Python ni cambiado el dataset.

Arranque y contrato de uso en `apps/command-center/README.md`. La conexión usa `/bridge`
(proxy Vite) y `sim/centralita/server.mjs`. El SDK y las claves quedan en Node, no en el cliente.
`BRIDGE_ENV_FILE` permite reutilizar el entorno de otro worktree sin copiar secretos.
Convivencia local: mapa nuevo `5174`, puente nuevo `8788`; anteriores `5173` y `8787` intactos.

Verificación: Node 24, `npm ci`; 42 tests en `apps/command-center` (39 tras viento, 37 antes), 4 en `sim/centralita`,
build y lint correctos. `npm run test:e2e` en centralita comprueba el frontend en `5174`
con Chrome instalado y proveedores controlados; no consume HappyRobot por defecto.
`E2E_LIVE_HR=1` sí lanza una ola real: exigir autorización antes de usarlo.

No reintroducir el fallo de `done` sin outcome: polling hasta extracción o fallo explícito,
sin consentimiento ficticio ni movimiento mientras falta el resultado. No animar GPS,
no cambiar el refugio comunicado por otro automáticamente ni mover a quien no ha confirmado.
Pausa no cancela chats; la demo local es una opción explícita separada, no un fallback.
No editar los workflows publicados en caliente; fork antes de cualquier cambio.

Prueba real autorizada: ocho chats (cuatro vecinos), cuatro outcomes recuperados y aplicados.
La ola no produjo cuatro salidas autónomas: hubo intención no confirmada/negativa y movilidad
reducida; esos contactos permanecen en asistencia. Detalle y run IDs en `docs/06-producto/01-vigia.md`.
El pull debe admitir runs sin fecha (`Date.parse(0)` no representa ausencia) y listas de Extract
serializadas como texto JSON. `E2E_RECOVER_HR=1 npm run test:e2e` valida recuperación sin nuevos runs.

Preferencia visual de Mateo (2026-09-19): no dibujar la zona amarilla rayada de posible
riesgo/propagación, tampoco al simular +1 h. Se conserva la huella roja y el cálculo interno
para rutas y exposición de refugios; no reintroducir esa superposición sin pedirlo.

Preferencia de interfaz (2026-09-19): mapa despejado, barra de campaña de 64 px, sin tarjeta
permanente de viento ni formulario de campaña abierto. Un único panel bajo demanda; opciones
por botones segmentados en vez de selects para canal, transporte y filtros de centros.
Campaña se abre desde el icono de ajustes de la barra; Escenario reúne viento y horizonte.
Las fichas separan Resumen, Conversación y Rutas. La leyenda vive en Capas.
Mantener todas las operaciones, los avisos de coste/demo y navegación con Escape; no volver a
superponer cajas grandes por defecto. E2E cubre escritorio 1440 px y móvil 390 px sin red externa.

Viento visual (2026-09-19): referencia de Mateo, captura de FireMap.live; usar partículas
lentas con estelas degradadas, no flechas. Posiciones geográficas reproyectadas con la cámara;
velocidad, longitud y densidad varían suavemente con el zoom. Sigue siendo viento de demo,
no una fuente meteorológica. Respetar movimiento reducido, pausa al ocultar la pestaña,
límite de partículas y canvas sin interceptar clics. Helpers comprobables en `src/wind.ts`.

Flujo de contacto revisado (2026-09-19, petición de Mateo): mapa inicialmente sin residentes,
contorno recomendado estático (`RECOMMENDED_CALL_AREA`) y círculos manuales acumulables mediante
Zona. Es una zona de contacto, no la trama amarilla de riesgo retirada. Enviar llamadas confirma
la selección; se simula la consulta censal por pueblos y se lanzan hasta cuatro chats.
**No implementar búsqueda real en censos/archivos ni extracción de teléfonos**: ese agente queda
fuera del alcance por decisión explícita del usuario. Usar únicamente los contactos sintéticos.
La selección de pueblos usa sus centros de referencia; una selección vacía no tiene fallback.
Mostrar en mapa/Personas solo ubicaciones compartidas, incluso si necesitan asistencia. La posición
sintética se activa tras consentimiento y se etiqueta demo; GPS voluntario sigue siendo GPS.
Al seleccionar un punto se dibuja su ruta asignada, con el destino comunicado, sin nueva consulta
ni línea recta de respaldo. La comparación manual es vista previa, no reasignación.
Tests de navegador cubren 0 → 1 → 4 marcadores, círculos acumulados/cancelación, zona vacía,
clic real sobre un punto y geometría de su ruta. No lanzar chats reales para estas pruebas.

Revisión solicitada del agente sustituto (2026-09-19): `Triaje incendios — MVP`, v4 publicada,
editor `l49nka6u9sbo`, ocho nodos; depende de `Vigía · llamada a tercero` v1 en borrador, cinco nodos.
Inventario completo en `docs/06-producto/06-workflow-happyrobot-vs-contrato.md` §5. Mateo pide
conservar el conjunto entero, pero primero listar funcionalidades: **integración no iniciada**.
Es voz saliente, no Chatbot Request. Dos tools: enlace de ubicación (hoy DM de Slack, no SMS)
y consulta síncrona a terceros (hijo marca NUMERO_DEMO, no el número solicitado). Extract principal
con ocho campos de triaje, distinto del contrato actual; sin callback principal `/calls/outcome`.
No dar por implementada la transferencia humana solo porque la ordene el prompt. Ambos mensajes
iniciales tienen huecos; el prompt y la tool discrepan en cuándo enviar el enlace. No corregidos.
