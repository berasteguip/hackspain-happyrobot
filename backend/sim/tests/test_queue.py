"""La cola: si un tramo se traga 1 coche/min, el décimo coche tarda ~10 minutos en entrar.

Es el test más importante del simulador. Si esto no se cumple, el modelo no tiene capacidad y
todo lo demás (comparar planes) es decorado: sin cola, cualquier plan saca a todo el mundo
instantáneamente y la pregunta "¿quién sale primero?" no existe.
"""

from __future__ import annotations

import numpy as np

from sim.fire import FireModel
from sim.geo import LocalFrame
from sim.graph import RoadGraph
from sim.model import Population, SimConfig, SimWorld, run_variant
from sim.plans import Plan
from sim.routing import build_route_tables


def _one_road_world(n_vehicles: int, cap_vpm: float, length_m: float = 600.0) -> SimWorld:
    """Un pueblo, un tramo, un refugio. Nada más, para aislar la capacidad."""
    frame = LocalFrame(41.7, -6.0)
    nodes = [(41.700, -6.000), (41.700, -5.990)]
    edges = [
        {
            "from": 0,
            "to": 1,
            "len_m": length_m,
            "speed_kmh": 36.0,  # 600 m a 36 km/h = 1 min de viaje
            "cap_vpm": cap_vpm,
            "lanes": 1,
            "name": "carretera unica",
            "ref": "TEST-1",
            "highway": "unclassified",
        }
    ]
    g = RoadGraph.from_edge_list(frame, nodes, edges, source="test")
    # fuego lejísimos y lento: este test mide cola, no supervivencia
    fire = FireModel(frame=frame, origin_lat=40.0, origin_lon=-7.0, head_bearing_deg=0.0, spread_rate_mh=1.0)
    x, y = frame.to_xy(41.700, -6.000)
    pop = Population(
        person_id=[f"v-{i}" for i in range(n_vehicles)],
        village_idx=np.zeros(n_vehicles, dtype=np.int32),
        sector_id=["s-1"] * n_vehicles,
        node=np.zeros(n_vehicles, dtype=np.int32),
        x=np.full(n_vehicles, float(x)),
        y=np.full(n_vehicles, float(y)),
        mobility=["car"] * n_vehicles,
        consumes_capacity=np.ones(n_vehicles, dtype=bool),
        speed_kmh=np.zeros(n_vehicles),
        ready_delay_min=np.zeros(n_vehicles),
        never_leaves=np.zeros(n_vehicles, dtype=bool),
        front_arrival_min=np.full(n_vehicles, np.inf),
        weight=np.ones(n_vehicles, dtype=np.int32),
    )
    phases = np.array([0.0])
    routes = build_route_tables(g, [1], np.full(g.n_edges, np.inf), phases)
    return SimWorld(
        graph=g,
        fire=fire,
        pop=pop,
        exit_ids=["x-a"],
        exit_nodes=[1],
        exit_capacity=[1000],
        routes=routes,
        village_ids=["T"],
        village_names=["T"],
        edge_burn_min=np.full(g.n_edges, np.inf),
        config=SimConfig(dt_min=0.5, horizon_min=60.0, reaction_jitter_min=0.0),
    )


def _plan() -> Plan:
    return Plan(plan_id=0, exit_per_village=(0,), release_order=(0,), order_key="random")


def test_tramo_saturado_forma_cola():
    """10 coches, 1 coche/min: el último sale sobre el minuto 10, no en el minuto 1."""
    world = _one_road_world(n_vehicles=10, cap_vpm=1.0)
    res = run_variant(world, _plan(), seed=1)
    assert res.safe == 10, res
    # 1 coche/min de entrada + 1 min de viaje: el último llega a salvo sobre t=10
    assert 9.0 <= res.clearance_max_min <= 11.5, res.clearance_max_min
    # y el primero pasa enseguida: la cola es de los de atrás, no de todos
    assert res.clearance_p50_min <= 6.5, res.clearance_p50_min
    assert res.max_queue >= 5


def test_sin_saturacion_no_hay_cola():
    """Los mismos 10 coches por un tramo de 30 coches/min salen todos en el primer minuto."""
    world = _one_road_world(n_vehicles=10, cap_vpm=30.0)
    res = run_variant(world, _plan(), seed=1)
    assert res.safe == 10
    assert res.clearance_max_min <= 2.0, res.clearance_max_min


def test_la_capacidad_escala_el_tiempo_de_vaciado():
    """Doblar la capacidad debe (aproximadamente) partir por dos el tiempo de vaciado."""
    slow = run_variant(_one_road_world(20, 1.0), _plan(), seed=1)
    fast = run_variant(_one_road_world(20, 2.0), _plan(), seed=1)
    assert slow.clearance_max_min > fast.clearance_max_min * 1.6, (slow.clearance_max_min, fast.clearance_max_min)
