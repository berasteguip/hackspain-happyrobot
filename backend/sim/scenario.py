"""Del JSON del escenario al mundo simulable: grafo + fuego + población + rutas.

Tres decisiones de modelado que conviene tener a la vista:

**1. El agente es un grupo de viaje, no una persona.** 292 personas no son 292 coches: una
familia de cuatro sale en un coche. Modelar una persona por vehículo multiplicaría el tráfico
por ~1,5 y haría ilegible la capacidad de la carretera. Así que agrupamos por (casa, modo):
el coche de la casa, los que salen andando, y los que necesitan asistencia. Cada agente lleva
un `weight` = personas que van dentro. **Las métricas se cuentan en personas**, no en agentes.

**2. El reloj del fuego no es el reloj de la orden.** En `sierra-culebra` el incendio nace 14 km
al SW y tarda ~7 h en llegar a Losacio: si simuláramos desde el minuto 0 del incendio, cualquier
plan salvaría a todo el mundo y no habría nada que decidir. Lo que se decide de verdad es *con
el frente a X minutos*. Por eso el simulador recibe `front_arrival_min` (minutos desde la orden
hasta que el frente toca la primera casa) y calcula el desfase `fire_t0_min` necesario. El
parámetro sale en el JSON de salida: es un supuesto del escenario, no una propiedad del plan.

**3. Las salidas son absorbentes.** Llegar al nodo del refugio = estar a salvo. Un refugio que
cae fuera del extracto OSM descargado (Alcañices) se representa por el nodo de borde por el que
se sale hacia él: llegar ahí significa haber salido de la zona. Está en las limitaciones.
"""

from __future__ import annotations

import json
import math
from collections import defaultdict
from pathlib import Path

import numpy as np

from .fire import FireModel, WindShift
from .geo import LocalFrame
from .graph import RoadGraph, build_graph
from .model import (
    ASSIST_DELAY_MIN,
    NO_ANSWER_EXTRA_MIN,
    REFUSAL_EXTRA_MIN,
    REFUSAL_NEVER_PROB,
    Population,
    SimConfig,
    SimWorld,
)
from .routing import build_route_tables, front_arrival_times

BOUNDARY_SNAP_M = 2000.0  # más lejos que esto, el refugio está fuera del mapa: nodo de borde
PHASE_STEP_MIN = 5.0
CONTRAFLOW_CANDIDATE_REFS = ("ZA-P-2434", "N-122", "ZA-P-2427", "N-631")


def load_scenario(path: str | Path) -> dict:
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


# ---------------------------------------------------------------- fuego
def fire_from_scenario_perimeter(
    frame: LocalFrame, fire_spec: dict, wind_shifts=None, spread_scale: float = 1.0
) -> FireModel:
    """Adapta el bloque `fire` del contrato (que trae `perimeter`) al `FireModel` (que quiere origen).

    El contrato da el perímetro actual como polígono GeoJSON; `FireModel` nace de un origen y un
    radio. Tomamos el centroide del anillo como origen y la distancia media centroide-vértice
    como radio inicial. Para el rectángulo que genera `backend/data/generate.py` es exacto salvo la
    esquina; para un perímetro real es una aproximación razonable del área quemada.

    `spread_scale` multiplica la velocidad de propagación del contrato. Sirve para explorar el
    peor caso ("el viento arrecia"): con el incendio de `sierra-culebra` a su velocidad nominal
    (1800 m/h) el frente tarda horas en barrer los tres pueblos y la elección de plan casi no
    cambia los alcanzados; a x3 sí. Es un supuesto declarado, no un ajuste oculto: sale en el
    JSON de salida.
    """
    ring = fire_spec["perimeter"]["coordinates"][0]
    lons = np.array([p[0] for p in ring], dtype=np.float64)
    lats = np.array([p[1] for p in ring], dtype=np.float64)
    if len(ring) > 1 and ring[0] == ring[-1]:
        lons, lats = lons[:-1], lats[:-1]
    clat, clon = float(lats.mean()), float(lons.mean())
    xs, ys = frame.to_xy(lats, lons)
    cx, cy = frame.to_xy(clat, clon)
    radius = float(np.mean(np.hypot(xs - cx, ys - cy)))
    return FireModel(
        frame=frame,
        origin_lat=clat,
        origin_lon=clon,
        head_bearing_deg=float(fire_spec.get("head_bearing_deg", 45.0)),
        spread_rate_mh=float(fire_spec.get("spread_rate_mh", 1800.0)) * float(spread_scale),
        initial_radius_m=max(radius, 100.0),
        wind_shifts=list(wind_shifts or []),
    )


# ---------------------------------------------------------------- población
def build_population(
    scenario: dict,
    g: RoadGraph,
    seed: int = 0,
) -> tuple[Population, list[str], list[str]]:
    """Agrupa personas en agentes (casa, modo) y les pone sus retrasos de comportamiento."""
    villages = scenario["villages"]
    village_names = [v["name"] for v in villages]
    v_index = {name: i for i, name in enumerate(village_names)}
    houses = {h["id"]: h for h in scenario["houses"]}
    rng = np.random.default_rng(seed)

    by_group: dict[tuple, list[dict]] = defaultdict(list)
    for person in scenario["people"]:
        sim = person.get("_sim", {})
        mob = person.get("mobility", "car")
        mode = "car" if mob == "car" else ("walk" if mob == "walking" else "assist")
        extra = 0.0
        if not sim.get("will_answer_call", True):
            extra += NO_ANSWER_EXTRA_MIN
        never = False
        if sim.get("will_refuse_evacuation", False):
            extra += REFUSAL_EXTRA_MIN
            never = bool(rng.random() < REFUSAL_NEVER_PROB)
        delay = float(sim.get("evacuation_delay_min", 8.0)) + extra + ASSIST_DELAY_MIN.get(mob, 0.0)
        key = (person["house_id"], "stay" if never else mode)
        by_group[key].append({"person": person, "delay": delay})

    person_id, vidx, sector, node, xs, ys = [], [], [], [], [], []
    mobility, consumes, speed, ready, never_leaves, weight = [], [], [], [], [], []
    for (house_id, mode), members in sorted(by_group.items()):
        house = houses.get(house_id, members[0]["person"])
        lat = float(house.get("lat", members[0]["person"]["lat"]))
        lon = float(house.get("lon", members[0]["person"]["lon"]))
        x, y = g.frame.to_xy(lat, lon)
        person_id.append(f"{house_id}:{mode}")
        vidx.append(v_index.get(house.get("village", village_names[0]), 0))
        sector.append(house.get("sector_id") or "")
        node.append(g.nearest_node(lat, lon))
        xs.append(float(x))
        ys.append(float(y))
        mobility.append(mode)
        consumes.append(mode in ("car", "assist"))
        speed.append(0.0 if mode in ("car", "assist") else SimConfig().walk_speed_kmh)
        ready.append(max(m["delay"] for m in members))
        never_leaves.append(mode == "stay")
        weight.append(len(members))

    pop = Population(
        person_id=person_id,
        village_idx=np.asarray(vidx, dtype=np.int32),
        sector_id=sector,
        node=np.asarray(node, dtype=np.int32),
        x=np.asarray(xs, dtype=np.float64),
        y=np.asarray(ys, dtype=np.float64),
        mobility=mobility,
        consumes_capacity=np.asarray(consumes, dtype=bool),
        speed_kmh=np.asarray(speed, dtype=np.float64),
        ready_delay_min=np.asarray(ready, dtype=np.float64),
        never_leaves=np.asarray(never_leaves, dtype=bool),
        front_arrival_min=np.full(len(person_id), np.inf),
        weight=np.asarray(weight, dtype=np.int32),
    )
    return pop, village_names, [v["name"] for v in villages]


# ---------------------------------------------------------------- mundo
def build_world(
    scenario: dict,
    cache_dir: str | Path = None,
    horizon_min: float = 120.0,
    front_arrival_min: float = 25.0,
    dt_min: float = 0.5,
    capacity_scale: float = 1.0,
    force_synthetic: bool = False,
    wind_shift_min: float | None = None,
    wind_shift_bearing: float | None = None,
    spread_scale: float = 1.0,
    pop_seed: int = 0,
    record_positions: bool = False,
) -> SimWorld:
    cache_dir = Path(cache_dir) if cache_dir else Path(__file__).parent / "cache"
    g = build_graph(scenario, cache_dir, capacity_scale=1.0, force_synthetic=force_synthetic)

    shifts = []
    if wind_shift_min is not None and wind_shift_bearing is not None:
        shifts.append(WindShift(t_min=float(wind_shift_min), head_bearing_deg=float(wind_shift_bearing)))
    fire = fire_from_scenario_perimeter(g.frame, scenario["fire"], shifts, spread_scale=spread_scale)

    pop, village_ids, village_names = build_population(scenario, g, seed=pop_seed)

    # --- calibración del reloj del fuego -------------------------------------
    # Sweep hasta 12 h: cuándo toca el frente cada casa y cada tramo (reloj absoluto del fuego).
    sweep_horizon = 720.0
    abs_house = front_arrival_times(fire, pop.x, pop.y, sweep_horizon, step_min=1.0)
    ex, ey = g.edge_midpoints()
    abs_edge = front_arrival_times(fire, ex, ey, sweep_horizon, step_min=1.0)
    first_touch = float(np.nanmin(abs_house)) if np.isfinite(abs_house).any() else sweep_horizon
    fire_t0 = max(first_touch - float(front_arrival_min), 0.0)
    pop.front_arrival_min = abs_house - fire_t0
    edge_burn = abs_edge - fire_t0

    # --- salidas -------------------------------------------------------------
    exit_ids, exit_nodes, exit_cap = [], [], []
    for z in scenario["safe_zones"]:
        nid = g.nearest_node(z["lat"], z["lon"])
        exit_ids.append(z["id"])
        exit_nodes.append(int(nid))
        exit_cap.append(int(z.get("capacity", 10**6)))
    # dos refugios que caen en el mismo nodo del grafo serían la misma salida: avisamos
    if len(set(exit_nodes)) != len(exit_nodes):
        raise ValueError("dos refugios comparten nodo de grafo; el escenario no discrimina salidas")

    phases = np.arange(0.0, horizon_min + PHASE_STEP_MIN, PHASE_STEP_MIN)
    routes = build_route_tables(g, exit_nodes, edge_burn, phases)

    masks = {}
    for ref in CONTRAFLOW_CANDIDATE_REFS:
        m = g.edges_matching_ref(ref)
        if m.any():
            masks[ref] = m

    cfg = SimConfig(
        dt_min=dt_min,
        horizon_min=horizon_min,
        fire_t0_min=fire_t0,
        capacity_scale=capacity_scale,
        record_positions=record_positions,
    )
    return SimWorld(
        graph=g,
        fire=fire,
        pop=pop,
        exit_ids=exit_ids,
        exit_nodes=exit_nodes,
        exit_capacity=exit_cap,
        routes=routes,
        village_ids=village_ids,
        village_names=village_names,
        edge_burn_min=edge_burn,
        config=cfg,
        contraflow_masks=masks,
    )


def nearest_exit_per_village(world: SimWorld, scenario: dict) -> list[int]:
    """Refugio más cercano (en tiempo de viaje libre, fase 0) para cada pueblo. Base del plan naive."""
    out = []
    eta = world.routes.eta_min[0]
    for v in scenario["villages"]:
        node = world.graph.nearest_node(v["lat"], v["lon"])
        etas = [eta[xi, node] for xi in range(len(world.exit_nodes))]
        finite = [e for e in etas if math.isfinite(e)]
        out.append(int(np.argmin(etas)) if finite else 0)
    return out


def exit_diagnostics(world: SimWorld, scenario: dict) -> list[dict]:
    """Distancia de enganche de cada refugio al grafo: por encima de BOUNDARY_SNAP_M es nodo de borde."""
    from .geo import haversine_m

    out = []
    for z, nid in zip(scenario["safe_zones"], world.exit_nodes):
        d = float(haversine_m(z["lat"], z["lon"], world.graph.node_lat[nid], world.graph.node_lon[nid]))
        out.append(
            {
                "id": z["id"],
                "name": z.get("name", z["id"]),
                "node": int(nid),
                "snap_m": round(d, 1),
                "kind": "boundary" if d > BOUNDARY_SNAP_M else "mapped",
            }
        )
    return out
