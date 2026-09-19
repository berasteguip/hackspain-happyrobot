"""Priorización: la fórmula del contrato §4, escrita una sola vez.

| Factor | Peso |
|---|---|
| Urgencia temporal `1 / max(minutes_to_front, 1)` | 0.45 |
| Penalización por movilidad (immobile 1.0 / reduced 0.6 / walking 0.3 / car 0.0) | 0.20 |
| Incertidumbre (status unknown/no_answer, o position_source == declared) | 0.15 |
| Tamaño del núcleo familiar `min(household_size, 6) / 6` | 0.10 |
| Deriva de trayectoria hacia el cono del fuego | 0.10 |

El factor de incertidumbre es deliberado: **lo que no se sabe SUBE la prioridad**. Es la respuesta
al criterio "¿decide algo sensato sin tener todos los datos?".
"""

from __future__ import annotations

from models import House, Mobility, Person, PersonStatus, PositionSource
from settings import settings

WEIGHTS: dict[str, float] = {
    "urgency": 0.45,
    "mobility": 0.20,
    "uncertainty": 0.15,
    "household_size": 0.10,
    "trajectory_drift": 0.10,
}

MOBILITY_PENALTY: dict[Mobility, float] = {
    Mobility.immobile: 1.0,
    Mobility.reduced: 0.6,
    Mobility.walking: 0.3,
    Mobility.car: 0.0,
}

# Contrato §4: el factor de incertidumbre se activa con estos estados.
UNCERTAIN_STATUSES = {PersonStatus.unknown, PersonStatus.no_answer}


def urgency_factor(minutes_to_front: float | None) -> float:
    """`1 / max(minutes, 1)`, ya en [0, 1]. Sin frente calculado no aporta urgencia (la falta de
    dato la castiga el factor de incertidumbre, no este)."""
    if minutes_to_front is None:
        return 0.0
    return 1.0 / max(float(minutes_to_front), 1.0)


def mobility_factor(mobility: Mobility | None) -> float:
    if mobility is None:
        # Movilidad desconocida: se asume lo intermedio (no se regala prioridad ni se ignora).
        return 0.3
    return MOBILITY_PENALTY.get(mobility, 0.3)


def uncertainty_factor(person: Person) -> float:
    if person.status in UNCERTAIN_STATUSES:
        return 1.0
    if person.position_source == PositionSource.declared:
        return 1.0
    if person.lat is None or person.lon is None:
        return 1.0  # no sabemos ni dónde está
    return 0.0


def household_factor(household_size: int | None) -> float:
    if not household_size or household_size < 1:
        return 1.0 / 6.0  # asumimos 1 persona mientras no se sepa
    return min(int(household_size), 6) / 6.0


def priority_score(person: Person, state) -> tuple[float, dict[str, float]]:
    """Devuelve `(score, score_breakdown)`. El breakdown es factor → **aportación** al score,
    para que el dashboard pueda explicar por qué alguien está primero."""
    from fire import drift_toward_fire

    raw = {
        "urgency": urgency_factor(person.minutes_to_front),
        "mobility": mobility_factor(person.mobility),
        "uncertainty": uncertainty_factor(person),
        "household_size": household_factor(person.household_size),
        "trajectory_drift": drift_toward_fire(
            person, getattr(state, "fire", None), settings.at_risk_horizon_min
        ),
    }
    breakdown = {k: round(WEIGHTS[k] * v, 4) for k, v in raw.items()}
    score = round(min(1.0, sum(breakdown.values())), 4)
    return score, breakdown


def explain_score(person: Person, breakdown: dict[str, float]) -> str:
    """Motivo legible para `/queue`: lo que se lee en el dashboard al lado del nombre."""
    etiquetas = {
        "urgency": "minutos hasta el frente",
        "mobility": "movilidad",
        "uncertainty": "incertidumbre",
        "household_size": "personas en casa",
        "trajectory_drift": "va hacia el fuego",
    }
    top = sorted(breakdown.items(), key=lambda kv: kv[1], reverse=True)[:2]
    partes = [f"{etiquetas[k]} (+{v:.2f})" for k, v in top if v > 0]
    minutos = (
        f"{person.minutes_to_front:.0f} min hasta el frente"
        if person.minutes_to_front is not None
        else "sin estimación de frente"
    )
    detalle = ", ".join(partes) if partes else "sin factores dominantes"
    extra = ""
    if uncertainty_factor(person) > 0:
        extra = " · dato incierto: la ignorancia sube la prioridad"
    return f"{minutos}; pesa sobre todo {detalle}{extra}"


# ----------------------------------------------------------------------------------------
# Casas: la resta que decide si se manda a la patrulla
# ----------------------------------------------------------------------------------------


def house_margin_min(house: House) -> float | None:
    """`minutes_to_front - patrol_eta_min`: minutos de margen que tendría la patrulla.

    Negativo = la patrulla NO llega antes que el fuego; mandarla allí es matarla (contrato §2.2).
    """
    if house.minutes_to_front is None or house.patrol_eta_min is None:
        return None
    return round(float(house.minutes_to_front) - float(house.patrol_eta_min), 1)


def house_priority_key(house: House) -> tuple:
    """Clave de orden de la lista viva de casas sin contestar.

    Orden: primero las alcanzables con menos margen (urgente pero factible), después las
    vulnerables, y al final las que el fuego alcanza antes que la patrulla.
    """
    margin = house_margin_min(house)
    unreachable = margin is not None and margin < 0
    # sin datos: van después de las alcanzables conocidas, antes de las imposibles
    margin_key = margin if margin is not None else 9_999.0
    if unreachable:
        # entre las imposibles, primero la que menos imposible es
        margin_key = -margin
    return (
        1 if unreachable else 0,
        margin_key,
        0 if house.vulnerable else 1,
        -(house.residents_expected or 0),
        house.id,
    )


def ranked_no_answer_houses(state) -> list[House]:
    from models import HouseStatus

    houses = [h for h in state.houses.values() if h.status == HouseStatus.no_answer]
    return sorted(houses, key=house_priority_key)


def house_priority_rank(house: House, state) -> int | None:
    """Puesto (1 = primero) de esta casa en la lista viva. `None` si no está en la lista."""
    for i, h in enumerate(ranked_no_answer_houses(state), start=1):
        if h.id == house.id:
            return i
    return None


def house_reason(house: House) -> str:
    margin = house_margin_min(house)
    frente = (
        f"{house.minutes_to_front:.0f} min hasta el frente"
        if house.minutes_to_front is not None
        else "frente sin estimar"
    )
    if house.patrol_eta_min is None:
        eta = "sin patrulla asignada"
    elif house.patrol_eta_min < 1:
        # "patrulla a 0 min" se lee como "ya está allí"; si está a 300 m hay que decirlo así.
        eta = "patrulla a menos de 1 min"
    else:
        eta = f"patrulla a {house.patrol_eta_min:.0f} min"
    vuln = " · vulnerable" if house.vulnerable else ""
    if margin is None:
        return f"{frente}, {eta}{vuln}"
    if margin < 0:
        return (
            f"{frente}, {eta}: el fuego llega {abs(margin):.0f} min ANTES que la patrulla — "
            f"no se manda sin aprobación humana{vuln}"
        )
    return f"{frente}, {eta}: {margin:.0f} min de margen{vuln}"
