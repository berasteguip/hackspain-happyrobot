"""Grafo de carreteras: OSM real (extracto Overpass en `cache/`) o sintético de respaldo.

Representación: arrays paralelos (CSR) en vez de objetos. Un Dijkstra sobre arrays de numpy
es dos órdenes de magnitud más rápido que sobre un `networkx.DiGraph`, y aquí hay que correr
cientos de variantes (`docs/research/routing-zonas-evitar.md` ya avisaba de esto).

Lo que hace creíble la simulación no es la geometría, es la **capacidad por tramo**: un camino
rural traga ~6 coches/min, no 60. Sin capacidad no hay cola, y sin cola la simulación no dice
nada. La tabla `CAPACITY_VEH_MIN` es por tanto el corazón del modelo, no un detalle de relleno.
"""

from __future__ import annotations

import json
import math
from dataclasses import dataclass
from pathlib import Path

import numpy as np

from .geo import LocalFrame

# ---------------------------------------------------------------------------
# Parámetros del modelo de vía. Documentados en README.md §parámetros.
#
# Capacidad de salida (vehículos/minuto y sentido). Referencia: HCM da ~1800-2000
# veh/h/carril en autovía (30-33 veh/min); una carretera convencional de un carril por
# sentido ronda 1000-1400 veh/h (17-23 veh/min) en condiciones buenas. En evacuación con
# humo, polvo, remolques y gente que no conoce la vía, se recorta agresivamente. Los
# valores de abajo son ESTIMACIONES CONSERVADORAS DE ESCENARIO, no dato de aforo real.
CAPACITY_VEH_MIN = {
    "motorway": 30.0,
    "trunk": 20.0,
    "primary": 16.0,
    "secondary": 12.0,
    "tertiary": 10.0,
    "tertiary_link": 10.0,
    "unclassified": 6.0,  # el "camino rural" del enunciado
    "residential": 6.0,
    "living_street": 4.0,
    "service": 4.0,
    "track": 3.0,
    "road": 6.0,
}
DEFAULT_CAPACITY_VEH_MIN = 6.0

# Velocidad libre (km/h) cuando la vía no trae `maxspeed`.
FREE_SPEED_KMH = {
    "motorway": 100.0,
    "trunk": 80.0,
    "primary": 70.0,
    "secondary": 60.0,
    "tertiary": 50.0,
    "tertiary_link": 40.0,
    "unclassified": 35.0,
    "residential": 25.0,
    "living_street": 15.0,
    "service": 20.0,
    "track": 20.0,
    "road": 35.0,
}
DEFAULT_FREE_SPEED_KMH = 35.0

# Longitud que ocupa un vehículo parado en cola, incluida la separación (m).
JAM_SPACING_M = 8.0
# Carriles asumidos cuando la vía no trae `lanes`.
DEFAULT_LANES = 2

ONEWAY_YES = {"yes", "true", "1"}
ONEWAY_REVERSED = {"-1", "reverse"}

# Solo vías por las que puede pasar un coche. Sin este filtro entran sendas y aceras y el
# simulador evacúa gente por caminos de cabras.
DRIVABLE_HIGHWAYS = frozenset(CAPACITY_VEH_MIN) | {"motorway_link", "trunk_link", "primary_link", "secondary_link"}

# Excluidas del grafo de evacuación por defecto: `track` es pista forestal/agrícola de tierra.
# La Sierra de la Culebra está tejida de ellas (19 000 tramos en el extracto) y meterlas
# permitiría al simulador inventar rutas de escape que Protección Civil no usaría nunca.
# Decisión de modelo, con su coste: en un incendio real un vecino SÍ puede tirar por una pista.
EXCLUDED_BY_DEFAULT = frozenset({"track"})

OVERPASS_ENDPOINTS = (
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
)
# Overpass devuelve 406 sin User-Agent propio. No es opcional.
OVERPASS_UA = "hackspain-router123-evacuation-sim/0.1 (hackathon HackSpain 2026)"


@dataclass
class RoadGraph:
    """Grafo dirigido en el plano local, en formato CSR.

    Arrays por nodo: `node_x`, `node_y` (metros), `node_lat`, `node_lon`.
    Arrays por arista dirigida (índice `e`): `edge_from`, `edge_to`, `edge_len_m`,
    `edge_speed_kmh`, `edge_cap_vpm`, `edge_storage` (vehículos que caben parados).
    CSR: `indptr[u]:indptr[u+1]` son los índices de arista que salen de `u` (`edge_order`).
    """

    frame: LocalFrame
    node_lat: np.ndarray
    node_lon: np.ndarray
    node_x: np.ndarray
    node_y: np.ndarray
    edge_from: np.ndarray
    edge_to: np.ndarray
    edge_len_m: np.ndarray
    edge_speed_kmh: np.ndarray
    edge_cap_vpm: np.ndarray
    edge_storage: np.ndarray
    edge_name: list[str]
    edge_ref: list[str]
    edge_highway: list[str]
    indptr: np.ndarray
    edge_order: np.ndarray
    source: str = "osm"

    # -------------------------------------------------------------- construcción
    @staticmethod
    def from_edge_list(frame, nodes_latlon, edges, source="osm") -> "RoadGraph":
        """`edges`: lista de dicts con from/to (índices de nodo) + atributos."""
        lat = np.array([p[0] for p in nodes_latlon], dtype=np.float64)
        lon = np.array([p[1] for p in nodes_latlon], dtype=np.float64)
        x, y = frame.to_xy(lat, lon)
        ef = np.array([e["from"] for e in edges], dtype=np.int32)
        et = np.array([e["to"] for e in edges], dtype=np.int32)
        ln = np.array([e["len_m"] for e in edges], dtype=np.float64)
        sp = np.array([e["speed_kmh"] for e in edges], dtype=np.float64)
        cap = np.array([e["cap_vpm"] for e in edges], dtype=np.float64)
        lanes = np.array([e.get("lanes", DEFAULT_LANES) for e in edges], dtype=np.float64)
        storage = np.maximum(np.floor(ln * np.maximum(lanes, 1.0) / JAM_SPACING_M), 1.0)
        order = np.argsort(ef, kind="stable").astype(np.int32)
        counts = np.bincount(ef, minlength=len(lat))
        indptr = np.zeros(len(lat) + 1, dtype=np.int32)
        np.cumsum(counts, out=indptr[1:])
        return RoadGraph(
            frame=frame,
            node_lat=lat,
            node_lon=lon,
            node_x=np.asarray(x, dtype=np.float64),
            node_y=np.asarray(y, dtype=np.float64),
            edge_from=ef,
            edge_to=et,
            edge_len_m=ln,
            edge_speed_kmh=sp,
            edge_cap_vpm=cap,
            edge_storage=storage,
            edge_name=[e.get("name", "") for e in edges],
            edge_ref=[e.get("ref", "") for e in edges],
            edge_highway=[e.get("highway", "") for e in edges],
            indptr=indptr,
            edge_order=order,
            source=source,
        )

    # -------------------------------------------------------------------- API
    @property
    def n_nodes(self) -> int:
        return len(self.node_x)

    @property
    def n_edges(self) -> int:
        return len(self.edge_from)

    def free_travel_min(self) -> np.ndarray:
        """Tiempo de recorrido a velocidad libre, en minutos, por arista."""
        return self.edge_len_m / (self.edge_speed_kmh * 1000.0 / 60.0)

    def nearest_node(self, lat: float, lon: float) -> int:
        x, y = self.frame.to_xy(lat, lon)
        d2 = (self.node_x - float(x)) ** 2 + (self.node_y - float(y)) ** 2
        return int(np.argmin(d2))

    def edge_midpoints(self) -> tuple[np.ndarray, np.ndarray]:
        return (
            (self.node_x[self.edge_from] + self.node_x[self.edge_to]) / 2.0,
            (self.node_y[self.edge_from] + self.node_y[self.edge_to]) / 2.0,
        )

    def edges_matching_ref(self, ref: str) -> np.ndarray:
        """Índices de aristas cuya `ref` o `name` contiene `ref` (para contraflujo/cortes)."""
        ref = ref.lower()
        return np.array(
            [i for i in range(self.n_edges) if ref in self.edge_ref[i].lower() or ref in self.edge_name[i].lower()],
            dtype=np.int32,
        )

    def reachable_from(self, starts: list[int]) -> np.ndarray:
        """Máscara de nodos alcanzables siguiendo aristas desde `starts` (BFS)."""
        seen = np.zeros(self.n_nodes, dtype=bool)
        stack = list(starts)
        for s in stack:
            seen[s] = True
        while stack:
            u = stack.pop()
            for k in range(self.indptr[u], self.indptr[u + 1]):
                e = self.edge_order[k]
                v = int(self.edge_to[e])
                if not seen[v]:
                    seen[v] = True
                    stack.append(v)
        return seen


# ---------------------------------------------------------------------------
# Plan A: OSM real desde el extracto de Overpass cacheado
# ---------------------------------------------------------------------------
def _parse_speed(tags: dict, highway: str) -> float:
    raw = tags.get("maxspeed")
    if raw:
        token = str(raw).split()[0]
        try:
            return float(token)
        except ValueError:
            pass
    return FREE_SPEED_KMH.get(highway, DEFAULT_FREE_SPEED_KMH)


def _parse_lanes(tags: dict) -> float:
    raw = tags.get("lanes")
    if raw:
        try:
            return max(float(str(raw).split(";")[0]), 1.0)
        except ValueError:
            pass
    return float(DEFAULT_LANES)


def find_overpass_cache(cache_dir: Path) -> Path | None:
    """El extracto cacheado con MÁS vías conducibles (hay varios, de bboxes distintas)."""
    best, best_ways = None, 0
    for f in sorted(Path(cache_dir).glob("*.json")) if Path(cache_dir).is_dir() else []:
        try:
            data = json.loads(f.read_text())
        except (OSError, json.JSONDecodeError):
            continue
        if not isinstance(data, dict) or "elements" not in data:
            continue
        n = sum(
            1
            for e in data["elements"]
            if e.get("type") == "way" and e.get("tags", {}).get("highway") in DRIVABLE_HIGHWAYS
        )
        if n > best_ways:
            best, best_ways = f, n
    return best


def fetch_overpass_extract(bbox: tuple[float, float, float, float], out_file: Path) -> Path:
    """Descarga las vías del bbox (lat_min, lon_min, lat_max, lon_max) y guarda un extracto PODADO.

    Se poda a vías conducibles y a sus nodos antes de escribir: el crudo de Overpass para esta
    zona son ~5,6 MB y el 90 % son sendas que no queremos en el repo.
    """
    import requests  # import local: el simulador corre offline si ya hay cache

    lat_min, lon_min, lat_max, lon_max = bbox
    query = f'[out:json][timeout:180];way["highway"]({lat_min},{lon_min},{lat_max},{lon_max});out body;>;out skel qt;'
    last_error = None
    for url in OVERPASS_ENDPOINTS:
        try:
            resp = requests.post(url, data={"data": query}, headers={"User-Agent": OVERPASS_UA}, timeout=200)
            if resp.status_code == 200:
                trimmed = _trim_overpass(resp.json())
                Path(out_file).parent.mkdir(parents=True, exist_ok=True)
                Path(out_file).write_text(json.dumps(trimmed))
                return Path(out_file)
            last_error = f"{url} -> HTTP {resp.status_code}"
        except Exception as exc:  # noqa: BLE001 - da igual el motivo, se prueba el siguiente
            last_error = f"{url} -> {type(exc).__name__}: {exc}"
    raise RuntimeError(f"Overpass no respondió. Último error: {last_error}")


def _trim_overpass(data: dict) -> dict:
    ways = [e for e in data["elements"] if e.get("type") == "way" and e.get("tags", {}).get("highway") in DRIVABLE_HIGHWAYS]
    keep = {n for w in ways for n in w["nodes"]}
    nodes = [e for e in data["elements"] if e.get("type") == "node" and e["id"] in keep]
    return {
        "generator": data.get("generator", ""),
        "osm3s": data.get("osm3s", {}),
        "note": "extracto podado a vías conducibles por sim/graph.py::fetch_overpass_extract",
        "elements": nodes + ways,
    }


def load_osm_graph(
    cache_file: Path,
    capacity_scale: float = 1.0,
    bbox: tuple[float, float, float, float] | None = None,
    exclude_highways: frozenset[str] = EXCLUDED_BY_DEFAULT,
) -> RoadGraph:
    """Construye el grafo desde una respuesta cruda de Overpass (nodes + ways).

    `bbox` = (lat_min, lon_min, lat_max, lon_max) recorta el extracto: el de la zona entera
    trae ~48 000 nodos y el 60 % son carreteras a 30 km del incendio que nadie va a usar.
    """
    data = json.loads(Path(cache_file).read_text())
    elements = data["elements"]
    raw_nodes = {e["id"]: (e["lat"], e["lon"]) for e in elements if e["type"] == "node"}
    if bbox is not None:
        lat_min, lon_min, lat_max, lon_max = bbox
        raw_nodes = {
            i: (la, lo) for i, (la, lo) in raw_nodes.items() if lat_min <= la <= lat_max and lon_min <= lo <= lon_max
        }
    allowed = DRIVABLE_HIGHWAYS - set(exclude_highways)
    ways = [e for e in elements if e["type"] == "way" and e.get("tags", {}).get("highway") in allowed]
    if not ways:
        raise ValueError(f"{cache_file} no tiene ways conducibles")

    used: dict[int, int] = {}
    nodes_latlon: list[tuple[float, float]] = []

    def idx_of(osm_id: int) -> int:
        if osm_id not in used:
            used[osm_id] = len(nodes_latlon)
            nodes_latlon.append(raw_nodes[osm_id])
        return used[osm_id]

    lat0 = sum(v[0] for v in raw_nodes.values()) / len(raw_nodes)
    lon0 = sum(v[1] for v in raw_nodes.values()) / len(raw_nodes)
    frame = LocalFrame(lat0=lat0, lon0=lon0)

    edges: list[dict] = []
    for way in ways:
        tags = way["tags"]
        highway = tags["highway"]
        speed = _parse_speed(tags, highway)
        lanes = _parse_lanes(tags)
        cap = CAPACITY_VEH_MIN.get(highway, DEFAULT_CAPACITY_VEH_MIN) * capacity_scale
        oneway = str(tags.get("oneway", "")).lower()
        seq = [n for n in way["nodes"] if n in raw_nodes]
        for a, b in zip(seq, seq[1:]):
            if a == b:
                continue
            ia, ib = idx_of(a), idx_of(b)
            la, lo = nodes_latlon[ia]
            lb, lob = nodes_latlon[ib]
            # haversine inline para no arrastrar arrays de un elemento
            dlat = math.radians(lb - la)
            dlon = math.radians(lob - lo)
            h = math.sin(dlat / 2) ** 2 + math.cos(math.radians(la)) * math.cos(math.radians(lb)) * math.sin(dlon / 2) ** 2
            length = 2 * 6_371_000.0 * math.asin(math.sqrt(max(h, 0.0)))
            if length <= 0.0:
                continue
            base = {
                "len_m": length,
                "speed_kmh": speed,
                "cap_vpm": cap,
                "lanes": lanes,
                "name": tags.get("name", ""),
                "ref": tags.get("ref", ""),
                "highway": highway,
            }
            if oneway in ONEWAY_REVERSED:
                edges.append({**base, "from": ib, "to": ia})
            elif oneway in ONEWAY_YES:
                edges.append({**base, "from": ia, "to": ib})
            else:
                edges.append({**base, "from": ia, "to": ib})
                edges.append({**base, "from": ib, "to": ia})
    return RoadGraph.from_edge_list(frame, nodes_latlon, edges, source=f"osm:{Path(cache_file).name}")


# ---------------------------------------------------------------------------
# Contracción: un tramo = de cruce a cruce
# ---------------------------------------------------------------------------
def simplify_graph(g: RoadGraph, protected: set[int]) -> RoadGraph:
    """Funde cadenas de nodos de paso en un solo tramo cruce-a-cruce.

    OSM guarda la geometría como nodos intermedios: un tramo de 3 km puede tener 40 nodos.
    Simular colas sobre aristas de 15 m no aporta nada y multiplica el coste. Al fundir:
    longitud = suma, capacidad = MÍNIMO (el cuello de botella manda, que es justo el efecto
    que buscamos), velocidad = media ponderada por longitud.
    """
    out_edges: list[list[int]] = [[] for _ in range(g.n_nodes)]
    in_edges: list[list[int]] = [[] for _ in range(g.n_nodes)]
    for e in range(g.n_edges):
        out_edges[int(g.edge_from[e])].append(e)
        in_edges[int(g.edge_to[e])].append(e)

    alive = np.ones(g.n_edges, dtype=bool)
    # cada arista viva se describe como cadena de aristas originales
    chains: dict[int, list[int]] = {e: [e] for e in range(g.n_edges)}
    e_from = g.edge_from.astype(np.int64).copy()
    e_to = g.edge_to.astype(np.int64).copy()

    def live_out(v: int) -> list[int]:
        # `out_edges` se queda obsoleto tras fundir, hay que comprobar el extremo real
        return [e for e in out_edges[v] if alive[e] and int(e_from[e]) == v]

    def live_in(v: int) -> list[int]:
        return [e for e in in_edges[v] if alive[e] and int(e_to[e]) == v]

    def is_passthrough(v: int) -> bool:
        if v in protected:
            return False
        outs = live_out(v)
        ins = live_in(v)
        if len(outs) == 2 and len(ins) == 2:
            a, b = int(e_to[outs[0]]), int(e_to[outs[1]])
            return a != b and {a, b} == {int(e_from[ins[0]]), int(e_from[ins[1]])}
        if len(outs) == 1 and len(ins) == 1:
            return int(e_from[ins[0]]) != int(e_to[outs[0]])
        return False

    def merge(e_in: int, e_out: int) -> None:
        u, w = int(e_from[e_in]), int(e_to[e_out])
        chains[e_in] = chains[e_in] + chains[e_out]
        e_to[e_in] = w
        alive[e_out] = False
        in_edges[w].append(e_in)

    for v in range(g.n_nodes):
        while is_passthrough(v):
            outs = live_out(v)
            ins = live_in(v)
            merged_any = False
            for e_out in outs:
                target = int(e_to[e_out])
                for e_in in ins:
                    if int(e_from[e_in]) == target:
                        continue  # no fundir la ida con su propia vuelta
                    merge(e_in, e_out)
                    merged_any = True
                    break
                if merged_any:
                    break
            if not merged_any:
                break

    kept = [e for e in range(g.n_edges) if alive[e]]
    # renumerar nodos usados
    used_nodes = sorted({int(e_from[e]) for e in kept} | {int(e_to[e]) for e in kept})
    remap = {n: i for i, n in enumerate(used_nodes)}
    nodes_latlon = [(float(g.node_lat[n]), float(g.node_lon[n])) for n in used_nodes]
    new_edges = []
    for e in kept:
        chain = chains[e]
        ln = float(g.edge_len_m[chain].sum())
        cap = float(g.edge_cap_vpm[chain].min())
        speed = float((g.edge_speed_kmh[chain] * g.edge_len_m[chain]).sum() / max(ln, 1e-9))
        lanes = float(g.edge_storage[chain].sum() * JAM_SPACING_M / max(ln, 1e-9))
        head = chain[0]
        new_edges.append(
            {
                "from": remap[int(e_from[e])],
                "to": remap[int(e_to[e])],
                "len_m": ln,
                "speed_kmh": speed,
                "cap_vpm": cap,
                "lanes": max(lanes, 1.0),
                "name": g.edge_name[head],
                "ref": g.edge_ref[head] or next((g.edge_ref[c] for c in chain if g.edge_ref[c]), ""),
                "highway": g.edge_highway[head],
            }
        )
    return RoadGraph.from_edge_list(g.frame, nodes_latlon, new_edges, source=g.source + "+simplified")


def restrict_to_reachable(g: RoadGraph, seeds: list[int]) -> tuple[RoadGraph, dict[int, int]]:
    """Se queda con el componente alcanzable desde `seeds`. Devuelve (grafo, remapeo)."""
    keep = g.reachable_from(seeds)
    used = [n for n in range(g.n_nodes) if keep[n]]
    remap = {n: i for i, n in enumerate(used)}
    edges = []
    for e in range(g.n_edges):
        u, v = int(g.edge_from[e]), int(g.edge_to[e])
        if keep[u] and keep[v]:
            edges.append(
                {
                    "from": remap[u],
                    "to": remap[v],
                    "len_m": float(g.edge_len_m[e]),
                    "speed_kmh": float(g.edge_speed_kmh[e]),
                    "cap_vpm": float(g.edge_cap_vpm[e]),
                    "lanes": float(g.edge_storage[e] * JAM_SPACING_M / max(float(g.edge_len_m[e]), 1e-9)),
                    "name": g.edge_name[e],
                    "ref": g.edge_ref[e],
                    "highway": g.edge_highway[e],
                }
            )
    nodes_latlon = [(float(g.node_lat[n]), float(g.node_lon[n])) for n in used]
    return RoadGraph.from_edge_list(g.frame, nodes_latlon, edges, source=g.source), remap


# ---------------------------------------------------------------------------
# Plan B: grafo sintético con la topología que importa
# ---------------------------------------------------------------------------
def synthetic_graph(villages: list[dict], safe_zones: list[dict]) -> RoadGraph:
    """Tres pueblos, un corredor único de salida, dos caminos rurales de poca capacidad.

    Solo se usa si no hay extracto OSM. Reproduce la topología dramática, no la geometría.
    """
    lat0 = sum(v["lat"] for v in villages) / len(villages)
    lon0 = sum(v["lon"] for v in villages) / len(villages)
    frame = LocalFrame(lat0=lat0, lon0=lon0)
    nodes_latlon: list[tuple[float, float]] = []

    def add(lat, lon) -> int:
        nodes_latlon.append((lat, lon))
        return len(nodes_latlon) - 1

    village_nodes = [add(v["lat"], v["lon"]) for v in villages]
    zone_nodes = [add(z["lat"], z["lon"]) for z in safe_zones]
    # nodo de confluencia: el cuello de botella del corredor único
    junction = add(lat0 + 0.02, lon0 + 0.03)

    edges: list[dict] = []

    def link(a: int, b: int, highway: str, name: str, ref: str, cap=None, speed=None):
        la, lo = nodes_latlon[a]
        lb, lob = nodes_latlon[b]
        dlat = math.radians(lb - la)
        dlon = math.radians(lob - lo)
        h = math.sin(dlat / 2) ** 2 + math.cos(math.radians(la)) * math.cos(math.radians(lb)) * math.sin(dlon / 2) ** 2
        length = 2 * 6_371_000.0 * math.asin(math.sqrt(max(h, 1e-12)))
        attrs = {
            "len_m": max(length, 50.0),
            "speed_kmh": speed or FREE_SPEED_KMH.get(highway, DEFAULT_FREE_SPEED_KMH),
            "cap_vpm": cap or CAPACITY_VEH_MIN.get(highway, DEFAULT_CAPACITY_VEH_MIN),
            "lanes": 2,
            "name": name,
            "ref": ref,
            "highway": highway,
        }
        edges.append({**attrs, "from": a, "to": b})
        edges.append({**attrs, "from": b, "to": a})

    for vn in village_nodes:
        link(vn, junction, "tertiary", "corredor de salida", "ZA-P-2434")
    for i, zn in enumerate(zone_nodes):
        link(junction, zn, "tertiary" if i == 0 else "unclassified", "acceso zona segura", "ZA-P-2434" if i == 0 else "N-122")
    # dos caminos rurales de poca capacidad entre pueblos (rutas alternativas malas)
    for a, b in zip(village_nodes, village_nodes[1:]):
        link(a, b, "unclassified", "camino rural", "")
    if len(zone_nodes) > 1 and len(village_nodes) > 0:
        link(village_nodes[0], zone_nodes[-1], "track", "pista forestal", "")
    return RoadGraph.from_edge_list(frame, nodes_latlon, edges, source="synthetic")


def scenario_bbox(scenario: dict, pad_deg: float = 0.04) -> tuple[float, float, float, float]:
    pts = [(p["lat"], p["lon"]) for p in scenario["villages"] + scenario["safe_zones"] + scenario["houses"]]
    lats = [p[0] for p in pts]
    lons = [p[1] for p in pts]
    return (min(lats) - pad_deg, min(lons) - pad_deg, max(lats) + pad_deg, max(lons) + pad_deg)


def build_graph(
    scenario: dict,
    cache_dir: Path,
    capacity_scale: float = 1.0,
    force_synthetic: bool = False,
    simplify: bool = True,
    exclude_highways: frozenset[str] = EXCLUDED_BY_DEFAULT,
) -> RoadGraph:
    """Plan A (OSM cacheado) con caída automática al plan B (sintético).

    Pasos del plan A: cargar extracto → recortar al bbox del escenario → contraer tramos
    cruce-a-cruce (protegiendo los puntos del escenario) → quedarse con el componente
    alcanzable desde los pueblos.
    """
    if not force_synthetic:
        cache_file = find_overpass_cache(Path(cache_dir))
        if cache_file is not None:
            g = load_osm_graph(
                cache_file,
                capacity_scale=capacity_scale,
                bbox=scenario_bbox(scenario),
                exclude_highways=exclude_highways,
            )
            if simplify:
                anchors = scenario["villages"] + scenario["safe_zones"] + scenario["houses"]
                protected = {g.nearest_node(a["lat"], a["lon"]) for a in anchors}
                g = simplify_graph(g, protected)
            seeds = [g.nearest_node(v["lat"], v["lon"]) for v in scenario["villages"]]
            seeds += [g.nearest_node(h["lat"], h["lon"]) for h in scenario["houses"]]
            g, _ = restrict_to_reachable(g, seeds)
            return g
    return synthetic_graph(scenario["villages"], scenario["safe_zones"])
