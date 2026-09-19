"""Búsqueda del plan: simula todas las variantes y devuelve el ranking.

macOS usa `spawn` para `multiprocessing`: el proceso hijo NO hereda memoria, lo pickle-a todo.
De ahí las reglas de este módulo, que son restricciones reales y no estilo:

- La función del pool es **de nivel de módulo** (`_worker`), nunca un closure ni un lambda.
- El mundo se envía **una vez por proceso** con `initializer`, no una vez por variante (son
  ~1 MB de tablas de rutas; enviarlo 200 veces sería más caro que simular).
- La semilla viaja como **argumento explícito**: nadie usa el `random` global, porque en spawn
  cada hijo arranca con un estado distinto y la reproducibilidad se rompería sin avisar.
- El arranque va dentro de `if __name__ == "__main__"` (lo hace `cli.py`).
"""

from __future__ import annotations

import multiprocessing as mp
import os

from .model import SimWorld, VariantResult, run_variant
from .plans import Plan

_WORLD: SimWorld | None = None


def _init_worker(world: SimWorld) -> None:
    global _WORLD
    _WORLD = world


def _worker(args: tuple[Plan, int]) -> VariantResult:
    plan, seed = args
    assert _WORLD is not None, "el worker no recibió el mundo"
    return run_variant(_WORLD, plan, seed)


def search(
    world: SimWorld,
    plans: list[Plan],
    seed: int = 0,
    processes: int | None = None,
) -> list[VariantResult]:
    """Devuelve los resultados ordenados por `score()` (menos gente perdida primero)."""
    tasks = [(p, seed) for p in plans]
    if processes is None:
        processes = max(1, (os.cpu_count() or 2) - 1)
    if processes == 1 or len(plans) <= 2:
        _init_worker(world)
        results = [_worker(t) for t in tasks]
    else:
        ctx = mp.get_context("spawn")
        with ctx.Pool(processes=processes, initializer=_init_worker, initargs=(world,)) as pool:
            results = pool.map(_worker, tasks, chunksize=max(1, len(tasks) // (processes * 4)))
    results.sort(key=lambda r: r.score())
    return results
