"""Rutas al refugio: un Dijkstra inverso por (salida, fase de fuego), reutilizado por todas las variantes.

Idea clave de rendimiento: **el fuego avanza igual en todas las variantes** (no depende del plan),
así que los árboles de rutas se calculan UNA vez y se comparten con todos los procesos. Cada
variante solo cambia quién sale, cuándo y por dónde — nunca la geometría.

Un árbol de rutas es `next_edge[nodo] = arista por la que salir hacia esa salida` (-1 = sin
camino). El agente no lleva una polilínea: lee el siguiente tramo en cada cruce. Así un
recálculo cuesta cambiar de tabla, no recalcular 300 rutas.
"""

from __future__ import annotations

import heapq
from dataclasses import dataclass

import numpy as np

from .graph import RoadGraph

INF = float("inf")


@dataclass
class ReverseCSR:
    """Aristas agrupadas por nodo destino, para Dijkstra hacia atrás."""

    indptr: np.ndarray
    edges: np.ndarray

    @staticmethod
    def of(g: RoadGraph) -> "ReverseCSR":
        order = np.argsort(g.edge_to, kind="stable").astype(np.int32)
        counts = np.bincount(g.edge_to, minlength=g.n_nodes)
        indptr = np.zeros(g.n_nodes + 1, dtype=np.int32)
        np.cumsum(counts, out=indptr[1:])
        return ReverseCSR(indptr=indptr, edges=order)


def dijkstra_to_target(g: RoadGraph, rcsr: ReverseCSR, target: int, weights: np.ndarray) -> np.ndarray:
    """Coste mínimo desde cada nodo hasta `target` siguiendo aristas dirigidas.

    `weights[e] = inf` marca arista cortada (quemada). Devuelve array de tamaño n_nodes.
    """
    dist = np.full(g.n_nodes, INF, dtype=np.float64)
    dist[target] = 0.0
    heap = [(0.0, int(target))]
    e_from = g.edge_from
    while heap:
        d, v = heapq.heappop(heap)
        if d > dist[v]:
            continue
        for k in range(rcsr.indptr[v], rcsr.indptr[v + 1]):
            e = int(rcsr.edges[k])
            w = weights[e]
            if w == INF:
                continue
            u = int(e_from[e])
            nd = d + w
            if nd < dist[u]:
                dist[u] = nd
                heapq.heappush(heap, (nd, u))
    return dist


def next_edge_table(g: RoadGraph, dist: np.ndarray, weights: np.ndarray) -> np.ndarray:
    """Para cada nodo, la arista que minimiza `w[e] + dist[to[e]]` (vectorizado)."""
    cand = weights + dist[g.edge_to]
    cand = np.where(np.isfinite(cand), cand, INF)
    order = np.lexsort((cand, g.edge_from))
    nxt = np.full(g.n_nodes, -1, dtype=np.int32)
    sorted_from = g.edge_from[order]
    first = np.ones(len(order), dtype=bool)
    first[1:] = sorted_from[1:] != sorted_from[:-1]
    best_edges = order[first]
    best_nodes = sorted_from[first]
    ok = np.isfinite(cand[best_edges])
    nxt[best_nodes[ok]] = best_edges[ok].astype(np.int32)
    return nxt


@dataclass
class RouteTables:
    """Árboles de rutas por fase temporal y por salida. Picklable (solo arrays).

    `phase_times[p]` es el minuto de simulación desde el que vale la fase `p`.
    `next_edge[(p, exit_idx)]` y `eta_min[(p, exit_idx)]` son arrays por nodo.
    """

    phase_times: np.ndarray
    next_edge: np.ndarray  # (n_phases, n_exits, n_nodes) int32
    eta_min: np.ndarray  # (n_phases, n_exits, n_nodes) float64

    def phase_for(self, t_min: float) -> int:
        return int(np.searchsorted(self.phase_times, t_min, side="right") - 1)


def build_route_tables(
    g: RoadGraph,
    exit_nodes: list[int],
    edge_burn_min: np.ndarray,
    phase_times: np.ndarray,
) -> RouteTables:
    """Un árbol por (fase, salida), cortando las aristas ya quemadas en esa fase.

    `edge_burn_min[e]` = minuto de simulación en que el frente cubre el tramo `e` (inf si no).
    """
    rcsr = ReverseCSR.of(g)
    base_w = g.free_travel_min()
    n_p, n_x = len(phase_times), len(exit_nodes)
    nxt = np.full((n_p, n_x, g.n_nodes), -1, dtype=np.int32)
    eta = np.full((n_p, n_x, g.n_nodes), INF, dtype=np.float64)
    for p, t in enumerate(phase_times):
        w = np.where(edge_burn_min <= t, INF, base_w)
        for xi, target in enumerate(exit_nodes):
            dist = dijkstra_to_target(g, rcsr, int(target), w)
            eta[p, xi] = dist
            nxt[p, xi] = next_edge_table(g, dist, w)
    return RouteTables(phase_times=np.asarray(phase_times, dtype=np.float64), next_edge=nxt, eta_min=eta)


def front_arrival_times(fire, xs: np.ndarray, ys: np.ndarray, horizon_min: float, step_min: float = 1.0) -> np.ndarray:
    """Minuto (en el reloj del FUEGO) en que el frente cubre cada punto. `inf` si nunca.

    Barrido único y vectorizado: el fuego solo crece (unión de elipses que se expanden), así que
    la primera t en que un punto está dentro es su tiempo de llegada. Un barrido de 1 min sobre
    N puntos cuesta lo mismo que una llamada por punto y da todos los puntos a la vez.
    """
    out = np.full(xs.shape, INF, dtype=np.float64)
    pending = np.ones(xs.shape, dtype=bool)
    t = 0.0
    while t <= horizon_min and pending.any():
        inside = fire.contains(t, xs, ys)
        hit = inside & pending
        out[hit] = t
        pending &= ~hit
        t += step_min
    return out
