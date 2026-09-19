"""El espacio de planes: qué decisiones puede tomar el sistema antes de dar la primera orden.

Un plan NO es una ruta. Es el conjunto de decisiones que Protección Civil toma de verdad:

1. **Por dónde sale cada pueblo** (`exit_per_village`). En Sesnández la ZA-P-2434 es la única
   salida provincial: mandar a los tres pueblos por ahí es lo obvio y no siempre lo mejor.
2. **En qué orden se avisa a los pueblos** (`release_order`).
3. **A quién primero dentro del pueblo** (`order_key`): al que tiene el frente encima, al que
   está lejos, o al azar.
4. **Escalonado o todos a la vez** (`wave_gap_min`, `wave_size`, `group_gap_min`).
5. **Contraflow** (`contraflow_ref`): abrir los dos sentidos de una vía hacia la salida. Cuesta
   montarlo (`contraflow_setup_min`) y gana capacidad (`contraflow_gain`).

El **plan naive** es la referencia contra la que se mide todo: avisar a todos a la vez, cada
pueblo a su refugio más cercano, sin escalonar y sin contraflow. Es lo que sale por defecto si
nadie piensa. La cifra que importa del entregable es cuánta gente separa al naive del elegido.
"""

from __future__ import annotations

import itertools
from dataclasses import dataclass

import numpy as np

ORDER_KEYS = ("front_first", "far_first", "random")


@dataclass(frozen=True)
class Plan:
    plan_id: int
    exit_per_village: tuple[int, ...]
    release_order: tuple[int, ...]
    order_key: str = "front_first"
    wave_gap_min: float = 0.0
    wave_size: int = 0
    group_gap_min: float = 0.0
    contraflow_ref: str | None = None
    contraflow_setup_min: float = 12.0
    contraflow_gain: float = 1.7
    label: str = ""

    def as_dict(self, world=None) -> dict:
        exits = list(self.exit_per_village)
        villages = list(self.release_order)
        if world is not None:
            exits = [world.exit_ids[i] for i in self.exit_per_village]
            villages = [world.village_names[i] for i in self.release_order]
        return {
            "plan_id": self.plan_id,
            "label": self.label,
            "exit_per_village": exits,
            "release_order": villages,
            "order_key": self.order_key,
            "wave_gap_min": self.wave_gap_min,
            "wave_size": self.wave_size,
            "group_gap_min": self.group_gap_min,
            "contraflow_ref": self.contraflow_ref,
            "contraflow_setup_min": self.contraflow_setup_min if self.contraflow_ref else None,
        }


def naive_plan(n_villages: int, nearest_exit: list[int]) -> Plan:
    """Todos a la vez, cada pueblo al refugio más cercano, sin escalonar ni contraflow."""
    return Plan(
        plan_id=0,
        exit_per_village=tuple(nearest_exit),
        release_order=tuple(range(n_villages)),
        order_key="random",
        wave_gap_min=0.0,
        wave_size=0,
        group_gap_min=0.0,
        contraflow_ref=None,
        label="naive (todos a la vez, refugio mas cercano)",
    )


def generate_variants(
    n_variants: int,
    n_villages: int,
    n_exits: int,
    nearest_exit: list[int],
    contraflow_refs: list[str],
    seed: int = 0,
) -> list[Plan]:
    """El naive primero, luego la rejilla sistemática, y si sobran huecos, muestreo aleatorio.

    Primero rejilla y no aleatorio puro porque con pocas variantes queremos cubrir las palancas
    (orden, salida, escalonado, contraflow) antes que repetir combinaciones parecidas.
    """
    plans = [naive_plan(n_villages, nearest_exit)]
    rng = np.random.default_rng(seed)

    exit_choices = list(itertools.product(range(n_exits), repeat=n_villages))
    orders = list(itertools.permutations(range(n_villages)))
    gaps = [0.0, 2.0, 5.0, 10.0]
    sizes = [0, 10, 25, 50]
    group_gaps = [0.0, 3.0, 8.0]
    cfs: list[str | None] = [None] + list(contraflow_refs)

    grid = itertools.product(exit_choices, orders, ORDER_KEYS, zip(gaps, sizes), group_gaps, cfs)
    seen = set()
    for exits, order, key, (gap, size), ggap, cf in grid:
        if len(plans) >= n_variants:
            break
        sig = (exits, order, key, gap, size, ggap, cf)
        if sig in seen:
            continue
        seen.add(sig)
        plans.append(
            Plan(
                plan_id=len(plans),
                exit_per_village=exits,
                release_order=order,
                order_key=key,
                wave_gap_min=gap,
                wave_size=size,
                group_gap_min=ggap,
                contraflow_ref=cf,
            )
        )

    while len(plans) < n_variants:
        gi = int(rng.integers(len(gaps)))
        sig = (
            tuple(int(v) for v in rng.integers(n_exits, size=n_villages)),
            tuple(int(v) for v in rng.permutation(n_villages)),
            ORDER_KEYS[int(rng.integers(len(ORDER_KEYS)))],
            gaps[gi],
            sizes[gi],
            group_gaps[int(rng.integers(len(group_gaps)))],
            cfs[int(rng.integers(len(cfs)))],
        )
        if sig in seen:
            continue
        seen.add(sig)
        plans.append(
            Plan(
                plan_id=len(plans),
                exit_per_village=sig[0],
                release_order=sig[1],
                order_key=sig[2],
                wave_gap_min=sig[3],
                wave_size=sig[4],
                group_gap_min=sig[5],
                contraflow_ref=sig[6],
            )
        )
    return plans[:n_variants]
