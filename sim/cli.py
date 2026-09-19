"""Punto de entrada del simulador.

    cd sim && .venv/bin/python -m sim.cli --scenario ../data/scenarios/sierra-culebra.json \
        --variants 200 --out out/

Salidas (todas en `--out`):
- `sim-result.json`  ranking de variantes + comparación naive vs elegido (el entregable).
- `sim-replay.json`  animación para el dashboard: perímetro de fuego y posiciones por minuto.
- `evacuation.gif`   naive vs elegido lado a lado, para el pitch.
- `comparison.png`   curvas de gente a salvo / alcanzada de los dos planes.
"""

from __future__ import annotations

import argparse
import json
import time
from dataclasses import asdict
from pathlib import Path

import numpy as np

from .model import with_config
from .plans import generate_variants
from .scenario import build_world, exit_diagnostics, load_scenario, nearest_exit_per_village
from .search import search


def parse_args(argv=None) -> argparse.Namespace:
    p = argparse.ArgumentParser(prog="sim.cli", description="Simulador de evacuación por incendio")
    p.add_argument("--scenario", required=True, help="JSON del escenario (contrato docs/06-producto/03-contrato-de-datos.md)")
    p.add_argument("--variants", type=int, default=200, help="planes a simular (el naive es siempre el primero)")
    p.add_argument("--out", default="out/", help="directorio de salida")
    p.add_argument("--seed", type=int, default=42)
    p.add_argument("--horizon", type=float, default=120.0, help="minutos de simulación")
    p.add_argument(
        "--front-arrival",
        type=float,
        default=25.0,
        help="minutos desde la orden hasta que el frente toca la primera casa (supuesto del escenario)",
    )
    p.add_argument("--dt", type=float, default=0.5, help="paso de integración en minutos")
    p.add_argument("--capacity-scale", type=float, default=1.0, help="escala global de capacidad de vía")
    p.add_argument("--processes", type=int, default=None)
    p.add_argument("--top", type=int, default=15, help="cuántas variantes detallar en el JSON")
    p.add_argument("--synthetic", action="store_true", help="fuerza el grafo sintético (plan B)")
    p.add_argument(
        "--spread-scale",
        type=float,
        default=1.0,
        help="multiplica la velocidad de propagacion del contrato (peor caso: el viento arrecia)",
    )
    p.add_argument("--wind-shift-min", type=float, default=None, help="minuto del giro de viento")
    p.add_argument("--wind-shift-bearing", type=float, default=None, help="rumbo nuevo de cabeza (grados)")
    p.add_argument("--no-figures", action="store_true", help="no generar GIF ni PNG")
    p.add_argument("--gif-frames", type=int, default=40)
    return p.parse_args(argv)


def main(argv=None) -> int:
    args = parse_args(argv)
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    scenario = load_scenario(args.scenario)

    t0 = time.perf_counter()
    world = build_world(
        scenario,
        horizon_min=args.horizon,
        front_arrival_min=args.front_arrival,
        dt_min=args.dt,
        capacity_scale=args.capacity_scale,
        force_synthetic=args.synthetic,
        wind_shift_min=args.wind_shift_min,
        wind_shift_bearing=args.wind_shift_bearing,
        spread_scale=args.spread_scale,
        pop_seed=args.seed,
    )
    t_build = time.perf_counter() - t0
    g = world.graph
    print(
        f"grafo: {g.source} {g.n_nodes} nodos {g.n_edges} aristas | "
        f"agentes {world.pop.n} ({world.pop.n_people} personas) | "
        f"fuego t0 {world.config.fire_t0_min:.0f} min | construccion {t_build:.1f}s"
    )
    for d in exit_diagnostics(world, scenario):
        print(f"  salida {d['id']} {d['name'][:34]:34s} nodo {d['node']:6d} snap {d['snap_m']:7.0f} m [{d['kind']}]")

    nearest = nearest_exit_per_village(world, scenario)
    plans = generate_variants(
        n_variants=args.variants,
        n_villages=len(world.village_ids),
        n_exits=len(world.exit_nodes),
        nearest_exit=nearest,
        contraflow_refs=sorted(world.contraflow_masks),
        seed=args.seed,
    )

    t1 = time.perf_counter()
    results = search(world, plans, seed=args.seed, processes=args.processes)
    t_search = time.perf_counter() - t1
    print(f"{len(plans)} variantes simuladas en {t_search:.1f}s ({t_search / len(plans) * 1000:.0f} ms/variante)")

    chosen = results[0]
    naive = next(r for r in results if r.plan_id == 0)
    print(
        f"NAIVE   alcanzados {naive.intercepted:3d}  a salvo {naive.safe:3d}  sin salir {naive.not_out:3d}  "
        f"p95 {naive.clearance_p95_min:.0f} min  cola max {naive.max_queue}"
    )
    print(
        f"ELEGIDO alcanzados {chosen.intercepted:3d}  a salvo {chosen.safe:3d}  sin salir {chosen.not_out:3d}  "
        f"p95 {chosen.clearance_p95_min:.0f} min  cola max {chosen.max_queue}"
    )
    worst_r = results[-1]
    print(
        f"PEOR    alcanzados {worst_r.intercepted:3d}  a salvo {worst_r.safe:3d}  sin salir {worst_r.not_out:3d}  "
        f"p95 {worst_r.clearance_p95_min:.0f} min  cola max {worst_r.max_queue}"
    )
    print(
        f"DIFERENCIA: {naive.intercepted - chosen.intercepted} personas frente al naive, "
        f"{worst_r.intercepted - chosen.intercepted} frente al peor plan del abanico"
    )
    print(f"PLAN ELEGIDO: {chosen.plan}")

    # --- re-simulación de los dos planes con posiciones, para animar y dibujar ---
    vis_world = with_config(world, record_positions=True, record_every_min=1.0)
    from .search import _init_worker, _worker  # mismo camino de código, sin pool

    _init_worker(vis_world)
    chosen_vis = _worker((plans[chosen.plan_id], args.seed))
    naive_vis = _worker((plans[0], args.seed))
    worst = results[-1]
    worst_vis = _worker((plans[worst.plan_id], args.seed))

    payload = {
        "meta": {
            "scenario": str(args.scenario),
            "seed": args.seed,
            "variants": len(plans),
            "horizon_min": args.horizon,
            "dt_min": args.dt,
            "front_arrival_min": args.front_arrival,
            "spread_scale": args.spread_scale,
            "spread_rate_mh": round(float(world.fire.spread_rate_mh), 1),
            "fire_t0_min": round(world.config.fire_t0_min, 2),
            "graph": {
                "source": g.source,
                "nodes": g.n_nodes,
                "edges": g.n_edges,
                "median_capacity_veh_min": float(np.median(g.edge_cap_vpm)),
            },
            "agents": world.pop.n,
            "people": world.pop.n_people,
            "build_s": round(t_build, 2),
            "search_s": round(t_search, 2),
            "exits": exit_diagnostics(world, scenario),
        },
        "comparison": {
            "naive": _summary(naive),
            "chosen": _summary(chosen),
            "people_saved_vs_naive": naive.intercepted - chosen.intercepted,
            "people_saved_vs_worst": worst.intercepted - chosen.intercepted,
        },
        "ranking": [_summary(r) for r in results[: args.top]],
        "worst": _summary(worst),
    }
    (out / "sim-result.json").write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")

    replay = {
        "meta": payload["meta"],
        "fire": [
            {"t_min": t, "perimeter": world.fire.perimeter_geojson(t + world.config.fire_t0_min, n=32)}
            for t in range(0, int(args.horizon) + 1, 2)
        ],
        "chosen": {"plan": chosen.plan, "frames": chosen_vis.timeline},
        "naive": {"plan": naive.plan, "frames": naive_vis.timeline},
        "worst": {"plan": worst.plan, "frames": worst_vis.timeline},
    }
    (out / "sim-replay.json").write_text(json.dumps(replay, ensure_ascii=False), encoding="utf-8")
    print(f"escrito {out / 'sim-result.json'} y {out / 'sim-replay.json'}")

    if not args.no_figures:
        try:
            from .viz import comparison_png, side_by_side_gif

            comparison_png(
                out / "comparison.png",
                [("Plan naive", naive_vis), ("Plan elegido", chosen_vis), ("Peor del abanico", worst_vis)],
            )
            # el GIF anima el par que DE VERDAD se diferencia: el elegido contra el peor plan
            # plausible. Animar naive vs elegido cuando salen empatados es enseñar dos veces lo mismo.
            side_by_side_gif(
                out / "evacuation.gif",
                world,
                worst_vis,
                chosen_vis,
                n_frames=args.gif_frames,
                left_label="PEOR PLAN",
                right_label="PLAN ELEGIDO",
            )
            print(f"escrito {out / 'comparison.png'} y {out / 'evacuation.gif'}")
        except Exception as exc:  # las figuras son para el pitch, no bloquean el resultado
            print(f"AVISO: figuras no generadas ({type(exc).__name__}: {exc})")
    return 0


def _summary(r) -> dict:
    d = asdict(r)
    d.pop("timeline", None)
    return d


if __name__ == "__main__":
    raise SystemExit(main())
