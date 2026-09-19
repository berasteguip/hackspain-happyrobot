# engine — el motor de escenario

Este componente es **la crisis**, no el sistema que la gestiona. Mueve el mundo por debajo del
resto (el fuego crece, el viento rola, una carretera se corta, la zona de salida deja de ser
segura, alguien se va hacia el fuego) y se lo cuenta a la API. No decide nada: decidir es trabajo
de `api/`. Su razón de existir es el requisito obligatorio del reto **"escenario que se mueve"**:
un caso fijo está descalificado.

## Cómo se arranca

```bash
# la forma que usa `make engine` y la que de verdad funciona desde engine/
cd engine && .venv/bin/python run.py --scenario scenarios/sierra-culebra.yaml --time-scale 60

# forma de módulo: solo desde la RAÍZ del repo
engine/.venv/bin/python -m engine.run --scenario engine/scenarios/sierra-culebra.yaml
```

Las dos funcionan, pero no desde el mismo sitio. `python -m engine.run` con el cwd en `engine/`
no puede resolver (buscaría `engine/engine/`), así que el `make engine` del root —que hace
`cd engine`— cae por su `2>/dev/null ||` a la **forma de script `run.py`**. Esa es la que se usa
en la demo.

El entorno es **Python 3.12** (`uv venv --python 3.12 engine/.venv`,
`.venv/bin/pip install -r requirements.txt`). El `python3` del sistema en este Mac es 3.9 y no
entiende las anotaciones del código.

### Flags útiles

| Flag | Para qué |
|---|---|
| `--time-scale 60` | 1 minuto simulado por segundo real. `0` = sin esperas (tests) |
| `--dry-run` | no envía nada, imprime lo que enviaría |
| `--from-min 26` | ensayar desde un hito: aplica todo lo anterior de golpe y sigue |
| `--until-min 45` | corta el guion antes del final |
| `--show-payloads` | imprime el cuerpo de cada POST |
| `--no-reset` | no llama a `POST /reset` al arrancar |
| `--api`, `--api-key` | si no, salen de `API_BASE_URL` / `HR_SHARED_SECRET` (o del `.env` de la raíz) |

### Arranca sin la API delante

En una demo en vivo el orden de arranque se equivoca siempre. El motor sondea `GET /health` cinco
veces, avisa con un aviso claro si no hay nadie y **sigue adelante igual**: cada POST se reintenta
con backoff, entra en modo degradado si falla tres veces seguidas y se reengancha solo en cuanto
levantas la API, sin reiniciar el motor. Nunca propaga una excepción de red.

## El guion: `scenarios/sierra-culebra.yaml`

Un YAML declarativo, ordenado por `at_min`. Con `--time-scale 60` los 88 minutos simulados caben
en 88 segundos reales, o sea dentro de la ventana de demo. Los hitos, en orden:

| min | hito | por qué está |
|---|---|---|
| 0 | incendio declarado (cabeza al 45°, monte adentro) | punto de partida |
| 16 | caída de la integración GPS, 5 min | decidir con datos incompletos |
| 26 | **giro de viento 225° → 315°** | el evento central: todo plan anterior caduca |
| 34 | foco secundario por pavesas | el fuego aparece donde no estaba |
| 42 | **corte de la ZA-P-2434** | se rompe el único acceso provincial a Tábara |
| 58 | zona de salida amenazada (x-a, Tábara) | no falla una ruta: fallan todas las que van al mismo sitio |
| 66 | `p-007` va hacia el fuego | alguien se desvía: llamada inmediata |
| 74 | `p-001` se para 10 min | el coche guía de un convoy atascado en la vía cortada |

La geografía es la verificada en `docs/research/geografia-zona.md` (Losacio, Ferreruela y
Sesnández de Tábara, zona segura en Tábara, ZA-P-2434). Dos avisos que el YAML también lleva
escritos en su cabecera:

- El giro **225° → 315° es una construcción narrativa razonada, no un dato medido** del incendio
  de 2022. No presentarlo como histórico.
- El **punto de ignición** (41.86, −6.16, en la sierra entre Riofrío y Sarracín de Aliste) es una
  decisión de diseño y **se desvía a propósito del polígono al SO de Losacio** de la §9 de la
  investigación. Motivo geométrico: con ese origen, antes del giro la cabeza (45°) se va a monte
  vacío y después del giro (135°) el que era flanco sur pasa a ser cabeza apuntando al corredor,
  a la ZA-P-2434 y a los pueblos. Con el origen de la §9 el giro no produce ese efecto.

## Viento vs cabeza (el error que invierte la demo)

`wind.direction_deg` es de dónde **viene** el viento (convención meteorológica).
`head_bearing_deg` es hacia dónde **va** la cabeza del fuego. Son opuestos:
`head = (direction_deg + 180) % 360`, y la conversión vive en un único sitio
(`fire_model.head_bearing_from_wind`). Si alguien los confunde, el fuego de la demo avanza justo
al contrario de lo que cuenta el guion y no se nota hasta que el jurado mira el mapa. Hay tests
dedicados a impedirlo.

En el YAML **no se fija `head_bearing_deg`**: se deriva del viento a propósito.

## El modelo de fuego

Perímetro radial: centro fijo y 72 radios en rumbos equiespaciados, cada uno creciendo a
`spread_rate_mh * factor(θ)`, con θ el ángulo al rumbo de cabeza. Por construcción el polígono es
estrellado, nunca se autointersecta y crece de forma monótona.

El factor es el del contrato (`docs/contrato-de-datos.md` §4):
`0.45 + 0.45·cos θ + 0.10·cos 2θ` → 1.00 en cabeza, 0.35 en flanco, 0.10 en cola. `cosine_decay`
está escrito en la forma equivalente `0.35 + 0.45c + 0.20c²` (porque `cos 2θ = 2c² − 1`); es la
**misma curva**, no hubo que alinear nada, y un test lo fija por escrito para que nadie "corrija"
una de las dos formas creyendo que difieren. La elipse de Huygens/FARSITE que valida
`docs/research/modelo-fuego.md` está implementada como `spread_law: ellipse`, pero el guion usa
`cosine` porque es lo que manda el contrato.

## Lo que el motor escribe (y lo que no)

Solo estos endpoints, y ni un campo fuera del contrato:

- `POST /reset` — al arrancar, para que la demo salga siempre del mismo estado
- `POST /events/fire` — un push por minuto simulado (el perímetro y el viento actuales)
- `POST /events/road-closure` — el corte de la ZA-P-2434
- `POST /events/exit-threatened` — Tábara deja de ser zona segura
- `POST /positions` — las dos personas con comportamiento guionizado (una que se para es,
  literalmente, un reporte de posición)

Un test comprueba el conjunto de endpoints usados contra esa lista, así que si alguien añade un
tipo de evento que escribe en otro sitio, el test lo caza.

### Deuda con el contrato

- `to_event_payload` añade `secondary_perimeters` al payload de `/events/fire` cuando hay focos
  por pavesas. **Ese campo no está en el contrato**: `api/` puede ignorarlo sin romper nada, y el
  perímetro principal sigue siendo válido por sí solo. Para quitarlo del todo, ponle
  `include_secondary_perimeters: false` en `settings`. Si el dashboard quiere pintar los focos,
  hay que añadir el campo al contrato primero.
- `scenario.py` implementa además tipos de evento que escriben en `/calls/outcome` y
  `/human/override`. Están **fuera del guion de la demo** a propósito: esos endpoints los alimentan
  los agentes de voz y la persona del puesto de mando, y el motor suplantándolos confundiría quién
  produce qué. Existen para probar la API en aislamiento; úsalos solo con ese fin.

## Tests

```bash
cd engine && .venv/bin/python -m pytest -q     # 39 pasando
```

- `test_fire_model.py` — la confusión viento/cabeza, la curva del contrato, que el crecimiento es
  máximo en la cabeza y mínimo a contraviento, que el giro del guion invierte el lado que crece, y
  que el polígono sigue siendo válido tras un avance largo.
- `test_scenario_timeline.py` — corre el YAML **real**: los hitos en el orden pedido, solo los
  endpoints permitidos, ninguna coordenada fuera de la zona investigada, dos ejecuciones idénticas,
  y una regresión con reloj falso de que los eventos se reparten en el tiempo en vez de dispararse
  todos al final.
- `test_client_retries.py` — reintentos, backoff, modo degradado y recuperación, un puerto cerrado
  de verdad, y el escenario completo terminando con la API caída.
