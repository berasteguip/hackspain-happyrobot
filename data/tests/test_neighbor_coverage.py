"""La feature de la capa 2 ('con 30 llamadas se sacan 100 números', sección 9
del escenario) depende de que la red vecinal cubra el pueblo. Si este test
falla, esa feature no se puede demostrar en la demo: no es un detalle menor.
"""
import random


def _coverage_from_random_seeds(houses, n_seeds: int, rng_seed: int) -> float:
    house_ids = [h["id"] for h in houses]
    adjacency = {h["id"]: set(h["_sim"]["neighbor_ids"]) for h in houses}

    rng = random.Random(rng_seed)
    seeds = rng.sample(house_ids, k=min(n_seeds, len(house_ids)))

    visited = set(seeds)
    frontier = list(seeds)
    while frontier:
        next_frontier = []
        for hid in frontier:
            for neighbor in adjacency[hid]:
                if neighbor not in visited:
                    visited.add(neighbor)
                    next_frontier.append(neighbor)
        frontier = next_frontier

    others_total = len(house_ids) - len(seeds)
    if others_total <= 0:
        return 1.0
    reached_others = len(visited) - len(seeds)
    return reached_others / others_total


def test_30_random_houses_reach_80_percent_of_the_rest(scenario_120):
    coverage = _coverage_from_random_seeds(scenario_120["houses"], n_seeds=30, rng_seed=123)
    assert coverage >= 0.80, f"cobertura {coverage:.1%} desde 30 semillas aleatorias (se exige >=80%)"


def test_coverage_holds_across_several_random_samples(scenario_120):
    # No debe depender de qué 30 casas caigan por azar: probamos varias
    # semillas de muestreo distintas sobre el mismo escenario generado.
    for rng_seed in (1, 2, 3, 4, 5):
        coverage = _coverage_from_random_seeds(scenario_120["houses"], n_seeds=30, rng_seed=rng_seed)
        assert coverage >= 0.80, f"seed de muestreo {rng_seed}: cobertura {coverage:.1%} (< 80%)"
