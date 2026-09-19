"""El simulador: agentes sobre el grafo, con capacidad y cola por tramo, y el fuego encima.

Modelo **mesoscópico** (ni microscópico ni macroscópico):

- No simulamos coches con aceleración y distancia de seguridad (microscópico, caro y falso a
  esta escala de datos), ni flujos agregados por zona (macroscópico, que no sabe de cuellos
  de botella concretos).
- Simulamos cada agente individualmente pero el tramo de carretera como un **servidor con
  capacidad de entrada** (veh/min) y **almacenamiento** (veh que caben parados). Es el modelo
  clásico de evacuación (cell-transmission / queueing network).

El corazón del modelo es esto: **un tramo rural se traga ~6 coches por minuto, no 60.** Si 120
coches quieren salir de Sesnández por la ZA-P-2434 a la vez, la carretera no va más rápido: se
forma una cola, la cola se propaga hacia atrás (spillback) y el minuto 40 sigue habiendo gente
dentro del pueblo. Ese es el mecanismo por el que un plan pierde gente y otro no.

Reglas del tiempo:
- `t` = minutos desde la orden de evacuación (t=0 es cuando el sistema decide).
- El fuego se evalúa en `t + fire_t0_min`: el incendio empezó antes que la orden.
- Paso de integración `dt_min` (0.5 min por defecto).
"""

from __future__ import annotations

from dataclasses import dataclass, field, replace

import numpy as np

from .fire import FireModel
from .graph import RoadGraph
from .routing import RouteTables

# --- estados del agente ------------------------------------------------------
AT_HOME = 0
ON_EDGE = 1
QUEUED = 2  # ha terminado el tramo pero no puede entrar en el siguiente: está en la cola
SAFE = 3
INTERCEPTED = 4
NEVER_LEAVES = 5  # se niega a evacuar y no cambia de opinión (sigue en casa)
STUCK = 6  # sin ruta al refugio asignado

MOVING_STATES = (ON_EDGE, QUEUED)

# --- parámetros de comportamiento (documentados en README) -------------------
WALK_SPEED_KMH = 4.5
NO_ANSWER_EXTRA_MIN = 25.0  # no coge el teléfono: se entera cuando pasa la patrulla
REFUSAL_EXTRA_MIN = 20.0  # se niega y hay que insistir
REFUSAL_NEVER_PROB = 0.35  # de los que se niegan, los que no se mueven ni con la segunda llamada
ASSIST_DELAY_MIN = {"car": 0.0, "walking": 3.0, "reduced": 15.0, "immobile": 30.0}
CREDIT_BURST_MIN = 1.0  # el crédito de entrada no se acumula más allá de 1 vehículo


@dataclass
class SimConfig:
    dt_min: float = 0.5
    horizon_min: float = 120.0
    fire_t0_min: float = 0.0
    walk_speed_kmh: float = WALK_SPEED_KMH
    capacity_scale: float = 1.0
    reaction_jitter_min: float = 1.5  # ruido de reacción por agente (0 = determinista, para tests)
    record_every_min: float = 1.0
    record_positions: bool = False


@dataclass
class Population:
    """Agentes listos para simular. Solo arrays -> picklable y barato de enviar a los workers."""

    person_id: list[str]
    village_idx: np.ndarray  # int32
    sector_id: list[str]
    node: np.ndarray  # int32, nodo del grafo más cercano a su casa
    x: np.ndarray
    y: np.ndarray
    mobility: list[str]
    consumes_capacity: np.ndarray  # bool: el que va a pie no ocupa capacidad de calzada
    speed_kmh: np.ndarray  # velocidad propia (a pie) o 0 = velocidad de la vía
    ready_delay_min: np.ndarray  # minutos desde que recibe el aviso hasta que arranca
    never_leaves: np.ndarray  # bool
    front_arrival_min: np.ndarray  # minuto (reloj sim) en que el frente llega a su casa
    weight: np.ndarray  # personas que van en este agente (una familia = un coche)

    @property
    def n(self) -> int:
        return len(self.person_id)

    @property
    def n_people(self) -> int:
        return int(self.weight.sum())


@dataclass
class VariantResult:
    """Resultado de simular UNA variante de plan."""

    plan_id: int
    plan: dict
    intercepted: int
    safe: int
    not_out: int  # ni a salvo ni alcanzado al final del horizonte (sigue en la carretera o en casa)
    never_leaves: int
    stuck: int
    clearance_p50_min: float
    clearance_p95_min: float
    clearance_max_min: float
    intercepted_by_state: dict  # dónde estaba la gente alcanzada: en casa, en la cola o en marcha
    max_queue: int
    exit_load: dict
    intercepted_by_village: dict
    worst_bottleneck: str
    timeline: list = field(default_factory=list)

    @property
    def lost(self) -> int:
        """Gente que el plan pierde: alcanzada por el frente."""
        return self.intercepted

    def score(self) -> tuple:
        """Orden lexicográfico: primero perder menos gente, luego dejar a menos fuera, luego tiempo."""
        return (self.intercepted, self.not_out, self.clearance_p95_min)


@dataclass
class SimWorld:
    """Todo lo que NO depende del plan: grafo, fuego, población, rutas. Se comparte con los workers."""

    graph: RoadGraph
    fire: FireModel
    pop: Population
    exit_ids: list[str]
    exit_nodes: list[int]
    exit_capacity: list[int]
    routes: RouteTables
    village_ids: list[str]
    village_names: list[str]
    edge_burn_min: np.ndarray  # minuto (reloj sim) en que el frente cubre cada arista
    config: SimConfig
    contraflow_masks: dict = field(default_factory=dict)  # ref -> máscara booleana de aristas


def _initial_targets(world: SimWorld, plan) -> np.ndarray:
    """Salida asignada a cada agente según el plan (índice en world.exit_nodes)."""
    per_village = np.asarray(plan.exit_per_village, dtype=np.int32)
    return per_village[world.pop.village_idx]


def _order_times(world: SimWorld, plan, rng: np.random.Generator) -> np.ndarray:
    """Minuto en que cada agente RECIBE el aviso, según el plan.

    Dos palancas distintas y deliberadamente separadas:
    - `release_order`: en qué orden se avisa a los pueblos.
    - `order_key`: dentro de un pueblo, a quién se avisa primero (el que tiene el fuego
      encima, el que está lejos, o al azar).
    - `wave_gap_min` y `wave_size`: escalonado. `wave_gap_min = 0` es "todos a la vez".
    """
    pop = world.pop
    t_notice = np.zeros(pop.n, dtype=np.float64)
    t_group = 0.0
    for vi in plan.release_order:
        idx = np.flatnonzero(pop.village_idx == vi)
        if idx.size == 0:
            continue
        if plan.order_key == "front_first":
            key = pop.front_arrival_min[idx]
        elif plan.order_key == "far_first":
            key = -pop.front_arrival_min[idx]
        else:
            key = rng.random(idx.size)
        idx = idx[np.argsort(key, kind="stable")]
        if plan.wave_gap_min > 0 and plan.wave_size > 0:
            wave = np.arange(idx.size) // plan.wave_size
            t_notice[idx] = t_group + wave * plan.wave_gap_min
            t_group += float(wave.max() * plan.wave_gap_min)
        else:
            t_notice[idx] = t_group
        t_group += plan.group_gap_min
    return t_notice


def run_variant(world: SimWorld, plan, seed: int) -> VariantResult:
    """Simula una variante completa. Determinista dado (world, plan, seed)."""
    cfg = world.config
    g = world.graph
    pop = world.pop
    dt = cfg.dt_min
    n = pop.n

    # Números aleatorios comunes: el MISMO seed da los mismos sorteos de población en todas
    # las variantes, así que las diferencias entre planes son del plan, no del ruido.
    rng = np.random.default_rng(seed)
    jitter = rng.normal(0.0, cfg.reaction_jitter_min, size=n) if cfg.reaction_jitter_min > 0 else np.zeros(n)

    t_notice = _order_times(world, plan, np.random.default_rng(seed + 977))
    depart = t_notice + pop.ready_delay_min + jitter
    depart = np.maximum(depart, 0.0)

    target = _initial_targets(world, plan)
    state = np.where(pop.never_leaves, NEVER_LEAVES, AT_HOME).astype(np.int8)
    hit_state = np.full(n, -1, dtype=np.int8)  # estado en el momento de ser alcanzado
    pos_x = pop.x.copy()
    pos_y = pop.y.copy()
    cur_edge = np.full(n, -1, dtype=np.int32)
    cur_node = pop.node.copy()
    ready_t = depart.copy()
    agent_tt = np.ones(n)  # tiempo de viaje del tramo en curso (difiere si va a pie)
    t_safe = np.full(n, np.inf)
    wait_min = np.zeros(n)

    # capacidad: crédito de entrada por arista (veh) y ocupación (veh dentro)
    base_cap = g.edge_cap_vpm * cfg.capacity_scale
    cap = base_cap.copy()
    if plan.contraflow_ref:
        mask = world.contraflow_masks.get(plan.contraflow_ref)
    else:
        mask = None
    credit = np.zeros(g.n_edges)
    occupancy = np.zeros(g.n_edges, dtype=np.int32)
    storage = g.edge_storage.astype(np.int32)
    free_tt = g.free_travel_min()
    max_queue = 0
    queue_peak_edge = -1
    contraflow_on = False

    exit_nodes = np.asarray(world.exit_nodes, dtype=np.int32)
    exit_count = np.zeros(len(exit_nodes), dtype=np.int32)

    # agentes esperando en un nodo (los que acaban tramo o arrancan de casa)
    pending: list[int] = []
    timeline = []
    next_record = 0.0
    phase = -1
    nxt_tab = None

    t = 0.0
    steps = int(round(cfg.horizon_min / dt))
    for _ in range(steps + 1):
        # --- contraflow: duplica sentido en la vía elegida a partir del minuto de montaje ---
        if mask is not None and not contraflow_on and t >= plan.contraflow_setup_min:
            cap = base_cap.copy()
            cap[mask] = base_cap[mask] * plan.contraflow_gain
            contraflow_on = True

        # --- tabla de rutas de la fase actual (el fuego corta tramos) ---
        p = world.routes.phase_for(t)
        if p != phase:
            phase = p
            nxt_tab = world.routes.next_edge[phase]
            eta_tab = world.routes.eta_min[phase]
            # si la salida asignada dejó de ser alcanzable, se cambia a la otra que sí lo sea
            live = np.flatnonzero((state == AT_HOME) | (state == ON_EDGE) | (state == QUEUED))
            if live.size:
                nodes = np.where(cur_edge[live] >= 0, g.edge_to[np.maximum(cur_edge[live], 0)], cur_node[live])
                bad = ~np.isfinite(eta_tab[target[live], nodes])
                for i in live[bad]:
                    node_i = int(g.edge_to[cur_edge[i]]) if cur_edge[i] >= 0 else int(cur_node[i])
                    alt = [xi for xi in range(len(exit_nodes)) if np.isfinite(eta_tab[xi, node_i])]
                    if alt:
                        target[i] = alt[int(np.argmin([eta_tab[xi, node_i] for xi in alt]))]

        # --- fuego: quien está dentro del perímetro queda interceptado ---
        live_mask = (state == AT_HOME) | (state == ON_EDGE) | (state == QUEUED) | (state == NEVER_LEAVES) | (state == STUCK)
        live = np.flatnonzero(live_mask)
        if live.size:
            burned = world.fire.contains(t + cfg.fire_t0_min, pos_x[live], pos_y[live])
            if burned.any():
                for i in live[burned]:
                    hit_state[i] = state[i]
                state[live[burned]] = INTERCEPTED

        # --- salidas de casa ---
        just_left = np.flatnonzero((state == AT_HOME) & (depart <= t))
        for i in just_left:
            e = int(nxt_tab[target[i], cur_node[i]])
            if e < 0:
                state[i] = STUCK
                continue
            state[i] = QUEUED  # esperando para entrar en su primer tramo
            cur_edge[i] = -1
            ready_t[i] = t
            pending.append(int(i))

        # --- recarga de crédito de entrada por arista ---
        credit = np.minimum(credit + cap * dt, np.maximum(cap * dt, CREDIT_BURST_MIN))

        # --- avance: quien terminó su tramo intenta entrar en el siguiente ---
        arrived = [i for i in np.flatnonzero(state == ON_EDGE) if ready_t[i] <= t]
        for i in arrived:
            state[i] = QUEUED
            pending.append(int(i))
        pending.sort(key=lambda i: (ready_t[i], i))
        blocked: list[int] = []
        for i in pending:
            if state[i] != QUEUED:
                continue
            e_cur = int(cur_edge[i])
            node = int(g.edge_to[e_cur]) if e_cur >= 0 else int(cur_node[i])
            xi = int(target[i])
            if node == int(exit_nodes[xi]):
                state[i] = SAFE
                t_safe[i] = t
                exit_count[xi] += int(pop.weight[i])
                if e_cur >= 0 and pop.consumes_capacity[i]:
                    occupancy[e_cur] -= 1
                continue
            e_next = int(nxt_tab[xi, node])
            if e_next < 0:
                state[i] = STUCK
                continue
            if pop.consumes_capacity[i]:
                if credit[e_next] < 1.0 or occupancy[e_next] >= storage[e_next]:
                    blocked.append(i)
                    wait_min[i] += dt
                    continue
                credit[e_next] -= 1.0
                occupancy[e_next] += 1
                if e_cur >= 0:
                    occupancy[e_cur] -= 1
            # entra en el tramo
            cur_edge[i] = e_next
            cur_node[i] = node
            state[i] = ON_EDGE
            if pop.speed_kmh[i] > 0:
                tt = g.edge_len_m[e_next] / 1000.0 / pop.speed_kmh[i] * 60.0
            else:
                tt = free_tt[e_next]
            agent_tt[i] = max(float(tt), 1e-9)
            ready_t[i] = t + tt
        pending = blocked

        if len(pending) > max_queue:
            max_queue = len(pending)
            if pending:
                blk = [int(cur_edge[i]) for i in pending if cur_edge[i] >= 0]
                queue_peak_edge = blk[0] if blk else -1

        # --- posiciones (para el fuego y para la animación) ---
        on = np.flatnonzero(state == ON_EDGE)
        if on.size:
            e = cur_edge[on]
            a, b = g.edge_from[e], g.edge_to[e]
            frac = np.clip(1.0 - (ready_t[on] - t) / agent_tt[on], 0.0, 1.0)
            pos_x[on] = g.node_x[a] + (g.node_x[b] - g.node_x[a]) * frac
            pos_y[on] = g.node_y[a] + (g.node_y[b] - g.node_y[a]) * frac
        q = np.flatnonzero((state == QUEUED) & (cur_edge >= 0))
        if q.size:
            pos_x[q] = g.node_x[g.edge_to[cur_edge[q]]]
            pos_y[q] = g.node_y[g.edge_to[cur_edge[q]]]

        # --- registro para la animación del puesto de mando ---
        if t >= next_record - 1e-9:
            w = pop.weight
            rec = {
                "t_min": round(t, 2),
                "at_home": int(w[(state == AT_HOME) | (state == NEVER_LEAVES)].sum()),
                "moving": int(w[(state == ON_EDGE) | (state == QUEUED)].sum()),
                "queued": int(w[state == QUEUED].sum()),
                "safe": int(w[state == SAFE].sum()),
                "intercepted": int(w[state == INTERCEPTED].sum()),
            }
            if cfg.record_positions:
                mv = np.flatnonzero((state == ON_EDGE) | (state == QUEUED))
                lat, lon = g.frame.to_latlon(pos_x[mv], pos_y[mv])
                rec["positions"] = [[round(float(a), 5), round(float(b), 5)] for a, b in zip(lat, lon)]
            timeline.append(rec)
            next_record += cfg.record_every_min

        if not ((state == AT_HOME) | (state == ON_EDGE) | (state == QUEUED)).any():
            break
        t += dt

    w = pop.weight
    fin = np.isfinite(t_safe)
    safe_times = np.repeat(t_safe[fin], w[fin]) if fin.any() else np.array([])
    by_village = {}
    for vi, vid in enumerate(world.village_ids):
        m = pop.village_idx == vi
        by_village[vid] = int(w[m][state[m] == INTERCEPTED].sum())
    return VariantResult(
        plan_id=plan.plan_id,
        plan=plan.as_dict(world),
        intercepted=int(w[state == INTERCEPTED].sum()),
        safe=int(w[state == SAFE].sum()),
        not_out=int(w[(state == AT_HOME) | (state == ON_EDGE) | (state == QUEUED) | (state == STUCK)].sum()),
        never_leaves=int(w[state == NEVER_LEAVES].sum()),
        stuck=int(w[state == STUCK].sum()),
        clearance_p50_min=float(np.percentile(safe_times, 50)) if safe_times.size else float("inf"),
        clearance_p95_min=float(np.percentile(safe_times, 95)) if safe_times.size else float("inf"),
        clearance_max_min=float(safe_times.max()) if safe_times.size else float("inf"),
        intercepted_by_state={
            name: int(w[(state == INTERCEPTED) & (hit_state == code)].sum())
            for name, code in (
                ("en_casa", AT_HOME),
                ("en_cola", QUEUED),
                ("en_marcha", ON_EDGE),
                ("se_niega", NEVER_LEAVES),
                ("sin_ruta", STUCK),
            )
        },
        max_queue=int(max_queue),
        exit_load={world.exit_ids[i]: int(c) for i, c in enumerate(exit_count)},
        intercepted_by_village=by_village,
        worst_bottleneck=(
            f"{g.edge_ref[queue_peak_edge] or g.edge_name[queue_peak_edge] or g.edge_highway[queue_peak_edge]}"
            if queue_peak_edge >= 0
            else ""
        ),
        timeline=timeline,
    )


def with_config(world: SimWorld, **kw) -> SimWorld:
    return replace(world, config=replace(world.config, **kw))
