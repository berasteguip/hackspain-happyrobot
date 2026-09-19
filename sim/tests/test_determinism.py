"""Misma semilla, mismo resultado. Sin esto, comparar planes no significa nada.

Dos exigencias distintas:

1. `run_variant(world, plan, seed)` es una función pura: repetirla da el mismo `VariantResult`.
2. La búsqueda en paralelo (multiprocessing, `spawn` en macOS) también es reproducible: la semilla
   viaja como argumento a cada worker, nadie usa el `random` global y el orden final se decide por
   `score()`, no por el orden en que terminan los procesos.

El punto 2 es el que se rompe solo: basta que un worker toque `np.random` sin semilla propia, o que
el ranking dependa de quién contesta antes, para que el mismo comando dé dos respuestas distintas.
"""

from __future__ import annotations

from dataclasses import asdict
from pathlib import Path

from sim.model import run_variant
from sim.plans import generate_variants, naive_plan
from sim.scenario import build_world, load_scenario, nearest_exit_per_village
from sim.search import search

FIXTURE = Path(__file__).parent / "fixtures" / "mini-scenario.json"


def _world(seed: int = 7):
    scenario = load_scenario(FIXTURE)
    # grafo sintético: el test no debe depender de la caché de OSM ni de la red
    return build_world(scenario, horizon_min=120.0, front_arrival_min=10.0, force_synthetic=True, pop_seed=seed), scenario


def _comparable(res) -> dict:
    d = asdict(res)
    d.pop("plan", None)  # el dict del plan incluye nombres, no números; se compara aparte
    return d


def test_misma_semilla_mismo_resultado():
    world, scenario = _world()
    plan = naive_plan(len(world.village_ids), nearest_exit_per_village(world, scenario))
    a = run_variant(world, plan, seed=3)
    b = run_variant(world, plan, seed=3)
    assert _comparable(a) == _comparable(b)
    assert a.timeline == b.timeline


def test_semillas_distintas_dan_resultados_distintos():
    """Control del test anterior: si todo diera igual, la igualdad de arriba no probaría nada."""
    world, scenario = _world()
    plan = naive_plan(len(world.village_ids), nearest_exit_per_village(world, scenario))
    a = run_variant(world, plan, seed=3)
    b = run_variant(world, plan, seed=99)
    assert _comparable(a) != _comparable(b)


def test_el_mundo_se_reconstruye_igual():
    """Misma `pop_seed` -> misma población y mismo reloj de fuego (si no, comparar días distintos)."""
    w1, sc = _world(seed=11)
    w2, _ = _world(seed=11)
    assert w1.pop.n == w2.pop.n and w1.pop.n_people == w2.pop.n_people
    assert list(w1.pop.person_id) == list(w2.pop.person_id)
    assert (w1.pop.ready_delay_min == w2.pop.ready_delay_min).all()
    assert (w1.pop.never_leaves == w2.pop.never_leaves).all()
    assert w1.config.fire_t0_min == w2.config.fire_t0_min


def test_la_busqueda_en_paralelo_es_reproducible():
    """El ranking completo de 24 variantes es idéntico en dos ejecuciones distintas."""
    world, scenario = _world()
    plans = generate_variants(
        n_variants=24,
        n_villages=len(world.village_ids),
        n_exits=len(world.exit_nodes),
        nearest_exit=nearest_exit_per_village(world, scenario),
        contraflow_refs=sorted(world.contraflow_masks),
        seed=5,
    )
    first = search(world, plans, seed=5, processes=2)
    second = search(world, plans, seed=5, processes=2)
    assert [r.plan_id for r in first] == [r.plan_id for r in second]
    assert [r.score() for r in first] == [r.score() for r in second]
    assert [_comparable(r) for r in first] == [_comparable(r) for r in second]
    # y el ganador es realmente el mínimo, no el primero que contestó
    assert first[0].score() == min(r.score() for r in first)
