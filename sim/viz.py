"""Figuras para el pitch: el mismo minuto, dos planes, lado a lado.

No es decoración. La tesis del proyecto ("el plan obvio pierde gente") no se demuestra con una
tabla: se demuestra viendo el atasco en la ZA-P-2434 del plan naive mientras el frente llega, y
la misma escena vacía en el plan elegido. Matplotlib con backend Agg (sin ventana) + Pillow para
montar el GIF, que es lo que hay instalado; nada de dependencias nuevas.
"""

from __future__ import annotations

from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
from matplotlib.collections import LineCollection  # noqa: E402

COL_FIRE = "#d33a1f"
COL_ROAD = "#c9c9c9"
COL_MAIN = "#8a8a8a"
COL_SAFE = "#1f8a4c"
COL_MOVE = "#1f5fd3"
COL_HIT = "#000000"


def comparison_png(path: Path, panels: list[tuple[str, object]]) -> None:
    """Curvas de a salvo / alcanzados / en movimiento, un panel por plan.

    Se dibujan tres: naive, elegido y el PEOR del abanico. El tercero no es relleno: en Sierra de
    la Culebra el naive ya es óptimo, así que lo que la búsqueda aporta solo se ve comparando con
    el plan malo que un humano también podría haber dado.
    """
    fig, axes = plt.subplots(1, len(panels), figsize=(5.5 * len(panels), 4), sharey=True)
    axes = np.atleast_1d(axes)
    for ax, (title, res) in zip(axes, panels):
        t = [f["t_min"] for f in res.timeline]
        ax.plot(t, [f["safe"] for f in res.timeline], color=COL_SAFE, label="a salvo")
        ax.plot(t, [f["moving"] for f in res.timeline], color=COL_MOVE, label="en carretera")
        ax.plot(t, [f["at_home"] for f in res.timeline], color="#999999", label="en casa")
        ax.plot(t, [f["intercepted"] for f in res.timeline], color=COL_HIT, lw=2, label="alcanzados por el frente")
        ax.set_title(f"{title}\nalcanzados: {res.intercepted} personas", fontsize=11)
        ax.set_xlabel("minutos desde la orden")
        ax.grid(alpha=0.25)
    axes[0].set_ylabel("personas")
    axes[0].legend(fontsize=8, loc="center right")
    fig.tight_layout()
    fig.savefig(path, dpi=130)
    plt.close(fig)


def _road_segments(g):
    a, b = g.edge_from, g.edge_to
    seg = np.stack([np.column_stack([g.node_x[a], g.node_y[a]]), np.column_stack([g.node_x[b], g.node_y[b]])], axis=1)
    main = np.array([bool(r) for r in g.edge_ref])
    return seg, main


def side_by_side_gif(
    path: Path,
    world,
    left_res,
    right_res,
    n_frames: int = 40,
    left_label: str = "NAIVE",
    right_label: str = "ELEGIDO",
) -> None:
    g = world.graph
    seg, main = _road_segments(g)
    naive_res, chosen_res = left_res, right_res
    frames_n = min(len(naive_res.timeline), len(chosen_res.timeline))
    idx = np.unique(np.linspace(0, frames_n - 1, min(n_frames, frames_n)).astype(int))

    xs = np.concatenate([g.node_x, world.pop.x])
    ys = np.concatenate([g.node_y, world.pop.y])
    pad = 1500.0
    xlim = (xs.min() - pad, xs.max() + pad)
    ylim = (ys.min() - pad, ys.max() + pad)

    images = []
    tmp = Path(path).with_suffix(".frames")
    tmp.mkdir(exist_ok=True)
    for k, i in enumerate(idx):
        fig, axes = plt.subplots(1, 2, figsize=(12, 6))
        t = naive_res.timeline[i]["t_min"]
        for ax, res, title in ((axes[0], naive_res, left_label), (axes[1], chosen_res, right_label)):
            ax.add_collection(LineCollection(seg[~main], colors=COL_ROAD, linewidths=0.4))
            ax.add_collection(LineCollection(seg[main], colors=COL_MAIN, linewidths=1.1))
            for poly in world.fire.polygons_xy(t + world.config.fire_t0_min, n=48):
                ax.fill(poly[:, 0], poly[:, 1], color=COL_FIRE, alpha=0.35, zorder=2)
                ax.plot(poly[:, 0], poly[:, 1], color=COL_FIRE, lw=1.2, zorder=3)
            for xi in world.exit_nodes:
                ax.plot(g.node_x[xi], g.node_y[xi], marker="*", ms=14, color=COL_SAFE, zorder=5)
            f = res.timeline[i]
            pos = f.get("positions") or []
            if pos:
                lat = np.array([p[0] for p in pos])
                lon = np.array([p[1] for p in pos])
                px, py = g.frame.to_xy(lat, lon)
                ax.scatter(px, py, s=9, color=COL_MOVE, zorder=4)
            ax.set_xlim(*xlim)
            ax.set_ylim(*ylim)
            ax.set_aspect("equal")
            ax.set_xticks([])
            ax.set_yticks([])
            ax.set_title(
                f"{title}  t+{t:.0f} min\nen carretera {f['moving']}  a salvo {f['safe']}  "
                f"alcanzados {f['intercepted']}",
                fontsize=11,
            )
        fig.tight_layout()
        fp = tmp / f"f{k:03d}.png"
        fig.savefig(fp, dpi=90)
        plt.close(fig)
        images.append(fp)

    from PIL import Image

    imgs = [Image.open(p).convert("P", palette=Image.ADAPTIVE) for p in images]
    if imgs:
        imgs[0].save(path, save_all=True, append_images=imgs[1:], duration=220, loop=0)
        # los PNG sueltos eran andamio del GIF (~4 MB por ejecución): fuera una vez montado
        for img in imgs:
            img.close()
        for fp in images:
            fp.unlink(missing_ok=True)
        tmp.rmdir()
