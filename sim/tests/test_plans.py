"""La hipótesis central del escalonado, medida — y refutada en su versión fuerte.

La hipótesis de partida era: *"con una sola salida estrecha, escalonar la salida (avisar por
tandas) salva más gente que avisar a todo el mundo a la vez"*. **Medido, es falsa.**

Con el cuello de botella en la carretera, el número de coches que salen del pueblo por minuto lo
fija la capacidad del tramo, no el momento del aviso. Si la carretera se traga 1 coche/min, a los
25 minutos han salido 25 coches — da igual si los 30 vecinos se enteraron en el minuto 0 o por
tandas de 10 cada 10 minutos. Los que el frente alcanza son los mismos. Retrasar el aviso solo
puede empeorarlo (si el retraso total supera lo que tardaría la cola en vaciarse sola).

Lo que el escalonado SÍ hace, y está medido aquí: **baja el pico de cola de 30 vehículos a 10**
con el mismo tiempo de vaciado. Eso importa operativamente (menos coches parados a la vez en una
vía que el fuego puede cruzar, y una cola de 10 se gestiona con una patrulla; una de 30, no) pero
no es una vida salvada, y este simulador no debe venderlo como tal.

Consecuencia de diseño: el valor de la búsqueda de variantes NO está en el escalonado, está en la
**elección de salida**. El último test de este fichero lo demuestra en el caso extremo: cuando el
refugio más cercano está en la trayectoria del frente, el plan obvio pierde a los 30 y el plan que
manda a la gente al refugio lejano salva a los 30. La búsqueda discrimina; lo que pasa en Sierra de
la Culebra (donde el plan naive ya es el óptimo) es una propiedad de esa geografía, no un empate
del modelo.
"""

from __future__ import annotations

import numpy as np

from sim.fire import FireModel
from sim.geo import LocalFrame
from sim.graph import RoadGraph
from sim.model import Population, SimConfig, SimWorld, run_variant
from sim.plans import Plan
from sim.routing import build_route_tables, front_arrival_times

ALL_AT_ONCE = Plan(plan_id=0, exit_per_village=(0,), release_order=(0,), order_key="random")
STAGGERED_10 = Plan(plan_id=1, exit_per_village=(0,), release_order=(0,), order_key="random", wave_gap_min=10.0, wave_size=10)
STAGGERED_5 = Plan(plan_id=2, exit_per_village=(0,), release_order=(0,), order_key="random", wave_gap_min=5.0, wave_size=10)


def _narrow_exit_world(n_vehicles: int = 30, cap_vpm: float = 1.0, front_touches_homes_min: float | None = None) -> SimWorld:
    """Un pueblo, una única salida estrecha de 3 km, y el frente llegando al pueblo.

    El refugio está al NORTE y el frente avanza al ESTE: el refugio queda en el flanco del
    incendio (35 % de la velocidad de cabeza), así que la salida sigue siendo viable mientras
    las casas ya no lo son. Es el caso de libro de una evacuación rural: un solo camino.
    """
    frame = LocalFrame(41.7, -6.0)
    nodes = [(41.700, -6.000), (41.727, -6.000)]  # pueblo, refugio 3 km al norte
    edges = [
        {
            "from": 0,
            "to": 1,
            "len_m": 3000.0,
            "speed_kmh": 36.0,  # 5 min de recorrido libre
            "cap_vpm": cap_vpm,
            "lanes": 1,
            "name": "carretera unica",
            "ref": "TEST-1",
            "highway": "unclassified",
        }
    ]
    g = RoadGraph.from_edge_list(frame, nodes, edges, source="test")
    x, y = frame.to_xy(41.700, -6.000)

    if front_touches_homes_min is None:
        # fuego inocuo: este mundo mide cola, no supervivencia
        fire = FireModel(frame=frame, origin_lat=40.0, origin_lon=-7.0, head_bearing_deg=0.0, spread_rate_mh=1.0)
        fire_t0 = 0.0
        front_arrival = np.full(n_vehicles, np.inf)
    else:
        fire = FireModel(
            frame=frame,
            origin_lat=41.700,
            origin_lon=-6.0145,  # ~1,2 km al oeste del pueblo
            head_bearing_deg=90.0,
            spread_rate_mh=3000.0,
            initial_radius_m=100.0,
        )
        raw = float(front_arrival_times(fire, np.array([x]), np.array([y]), 300.0, 0.5)[0])
        # calibración del reloj: el frente toca las casas en el minuto pedido
        fire_t0 = front_touches_homes_min - raw
        front_arrival = np.full(n_vehicles, front_touches_homes_min)

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
        front_arrival_min=front_arrival,
        weight=np.ones(n_vehicles, dtype=np.int32),
    )
    routes = build_route_tables(g, [1], np.full(g.n_edges, np.inf), np.array([0.0]))
    return SimWorld(
        graph=g,
        fire=fire,
        pop=pop,
        exit_ids=["x-a"],
        exit_nodes=[1],
        exit_capacity=[999],
        routes=routes,
        village_ids=["T"],
        village_names=["T"],
        edge_burn_min=np.full(g.n_edges, np.inf),
        config=SimConfig(dt_min=0.5, horizon_min=120.0, fire_t0_min=fire_t0, reaction_jitter_min=0.0),
    )


def test_escalonar_no_salva_gente_con_una_sola_salida():
    """HIPÓTESIS REFUTADA: con la salida saturada, escalonar NO reduce los alcanzados.

    Medido: 30 coches, 1 coche/min, frente en las casas en el minuto 30.
    todos a la vez -> 16 alcanzados. Escalonado 10 min/10 -> 16. Escalonado 5 min/10 -> 16.
    El cuello de botella es la carretera, no el aviso.
    """
    lost = {}
    for name, plan in (("todos", ALL_AT_ONCE), ("gap10", STAGGERED_10), ("gap5", STAGGERED_5)):
        res = run_variant(_narrow_exit_world(30, 1.0, front_touches_homes_min=30.0), plan, seed=1)
        lost[name] = res.intercepted
    assert lost["todos"] > 0, f"el escenario debe perder gente para que la comparación signifique algo: {lost}"
    # la versión fuerte de la hipótesis ("escalonar salva gente") sería lost[gap] < lost[todos]
    assert lost["gap10"] >= lost["todos"], lost
    assert lost["gap5"] >= lost["todos"], lost
    assert lost["gap10"] == lost["todos"] == lost["gap5"] == 16, lost


def test_escalonar_si_reduce_el_pico_de_cola():
    """Lo que el escalonado sí compra: el pico de cola baja de 30 a 10 con el MISMO vaciado."""
    base = run_variant(_narrow_exit_world(30, 1.0), ALL_AT_ONCE, seed=1)
    wave = run_variant(_narrow_exit_world(30, 1.0), STAGGERED_10, seed=1)
    assert base.max_queue == 30, base.max_queue
    assert wave.max_queue == 10, wave.max_queue
    assert wave.max_queue <= base.max_queue / 2.0
    # y no se paga con tiempo: el tramo sirve 1 coche/min en los dos casos
    assert abs(wave.clearance_max_min - base.clearance_max_min) < 1e-6
    assert base.safe == wave.safe == 30


def _two_exit_world(n_vehicles: int = 30, cap_vpm: float = 2.0) -> SimWorld:
    """Pueblo con dos refugios: el cercano (2 km al norte) está en la trayectoria del frente.

    El frente baja del norte: la carretera del refugio cercano se quema en el minuto 16, la del
    lejano (5 km al este) no se quema en todo el horizonte. Es el caso en el que la decisión de
    plan vale vidas, y sirve para comprobar que la búsqueda tiene poder de discriminación.
    """
    frame = LocalFrame(41.7, -6.0)
    nodes = [(41.700, -6.000), (41.718, -6.000), (41.700, -5.940)]
    edges = [
        {"from": 0, "to": 1, "len_m": 2000.0, "speed_kmh": 36.0, "cap_vpm": cap_vpm, "lanes": 1,
         "name": "salida norte", "ref": "N-1", "highway": "unclassified"},
        {"from": 0, "to": 2, "len_m": 5000.0, "speed_kmh": 36.0, "cap_vpm": cap_vpm, "lanes": 1,
         "name": "salida este", "ref": "E-1", "highway": "unclassified"},
    ]
    g = RoadGraph.from_edge_list(frame, nodes, edges, source="test")
    fire = FireModel(
        frame=frame, origin_lat=41.7145, origin_lon=-6.000, head_bearing_deg=180.0,
        spread_rate_mh=1500.0, initial_radius_m=200.0,
    )
    x, y = frame.to_xy(41.700, -6.000)
    house_arrival = float(front_arrival_times(fire, np.array([x]), np.array([y]), 600.0, 0.5)[0])
    ex, ey = g.edge_midpoints()
    edge_burn = front_arrival_times(fire, ex, ey, 600.0, 0.5)
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
        front_arrival_min=np.full(n_vehicles, house_arrival),
        weight=np.ones(n_vehicles, dtype=np.int32),
    )
    routes = build_route_tables(g, [1, 2], edge_burn, np.arange(0.0, 125.0, 5.0))
    return SimWorld(
        graph=g, fire=fire, pop=pop, exit_ids=["cerca", "lejos"], exit_nodes=[1, 2],
        exit_capacity=[999, 999], routes=routes, village_ids=["T"], village_names=["T"],
        edge_burn_min=edge_burn,
        config=SimConfig(dt_min=0.5, horizon_min=120.0, reaction_jitter_min=0.0),
    )


def test_elegir_refugio_si_cambia_el_resultado():
    """El refugio más cercano puede ser el peor: 30 alcanzados contra 0.

    Es la prueba de que la búsqueda de variantes no es un adorno: la palanca que vale vidas en
    este modelo es a qué refugio se manda a cada pueblo, no cuándo se avisa.
    """
    near = run_variant(_two_exit_world(), Plan(plan_id=0, exit_per_village=(0,), release_order=(0,), order_key="random"), seed=1)
    far = run_variant(_two_exit_world(), Plan(plan_id=1, exit_per_village=(1,), release_order=(0,), order_key="random"), seed=1)
    assert near.intercepted == 30, near.intercepted
    assert far.intercepted == 0 and far.safe == 30, (far.intercepted, far.safe)
    assert far.exit_load == {"cerca": 0, "lejos": 30}


def test_escalonar_demasiado_pierde_mas_gente():
    """Escalonar por encima de lo que tarda la cola en vaciarse es retrasar la evacuación.

    3 tandas de 10 con 25 minutos de hueco = la última tanda se entera en el minuto 50, cuando el
    frente ya pasó. Es el fallo que la búsqueda tiene que poder descartar.
    """
    base = run_variant(_narrow_exit_world(30, 1.0, front_touches_homes_min=30.0), ALL_AT_ONCE, seed=1)
    too_much = Plan(plan_id=9, exit_per_village=(0,), release_order=(0,), order_key="random", wave_gap_min=25.0, wave_size=10)
    slow = run_variant(_narrow_exit_world(30, 1.0, front_touches_homes_min=30.0), too_much, seed=1)
    assert slow.intercepted > base.intercepted, (slow.intercepted, base.intercepted)
