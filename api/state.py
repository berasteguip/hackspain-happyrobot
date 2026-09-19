"""`CrisisState`: la única fuente de verdad en runtime.

Reglas duras (contrato §0 y §6):
1. el estado vive **en memoria**; reiniciar el proceso rearranca el escenario;
2. `api/state.jsonl` es solo registro de auditoría (append-only), nunca se lee para recuperar;
3. **toda** mutación pasa por `CrisisState.mutate()`, que sube `state_version` y —salvo que sea un
   simple refresco de campo derivado— escribe una entrada en el `decision_log` con su motivo.

Ninguna ruta toca los diccionarios de entidades directamente.
"""

from __future__ import annotations

import json
import logging
import threading
import time
from enum import Enum
from typing import Any, Iterable

from models import (
    Actor,
    Convoy,
    DecisionLogEntry,
    DecisionType,
    Fire,
    House,
    Notified,
    Patrol,
    Person,
    RoadClosure,
    SafeZone,
    Sector,
    utcnow_iso,
)
from settings import settings

log = logging.getLogger("crisis.state")

# subject_type (el del decision_log) → nombre del diccionario en el estado
COLLECTIONS: dict[str, str] = {
    "person": "people",
    "house": "houses",
    "safe_zone": "safe_zones",
    "road_closure": "road_closures",
    "sector": "sectors",
    "convoy": "convoys",
    "patrol": "patrols",
}


def _jsonable(value: Any) -> Any:
    """Convierte modelos/enums a algo que json.dumps acepte."""
    if hasattr(value, "model_dump"):
        return value.model_dump(mode="json")
    if isinstance(value, dict):
        return {k: _jsonable(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_jsonable(v) for v in value]
    if isinstance(value, Enum):
        return value.value
    return value


class PendingApproval:
    """Acción que espera el visto bueno de una persona (contrato: `approval_requested`)."""

    __slots__ = ("decision_id", "action", "payload", "reason", "requested_at")

    def __init__(self, decision_id: str, action: str, payload: dict, reason: str) -> None:
        self.decision_id = decision_id
        self.action = action
        self.payload = payload
        self.reason = reason
        self.requested_at = utcnow_iso()

    def as_dict(self) -> dict:
        return {
            "decision_id": self.decision_id,
            "action": self.action,
            "payload": _jsonable(self.payload),
            "reason": self.reason,
            "requested_at": self.requested_at,
        }


class CrisisState:
    def __init__(self) -> None:
        self.lock = threading.RLock()
        self._boot_time = time.time()
        self.reset_entities(scenario=settings.scenario)

    # ------------------------------------------------------------------ ciclo de vida
    def reset_entities(self, scenario: str | None = None) -> None:
        """Vacía el estado. Lo llama `/reset` y el arranque; no escribe decision_log."""
        self.scenario = scenario or settings.scenario
        self.state_version = 0
        self.t = utcnow_iso()
        self.people: dict[str, Person] = {}
        self.houses: dict[str, House] = {}
        self.safe_zones: dict[str, SafeZone] = {}
        self.road_closures: dict[str, RoadClosure] = {}
        self.sectors: dict[str, Sector] = {}
        self.convoys: dict[str, Convoy] = {}
        self.patrols: dict[str, Patrol] = {}
        self.fire: Fire | None = None
        # Metadatos del fichero de escenario (centro del mapa, bbox, pueblos, aviso de datos
        # sintéticos). No son entidades del contrato: los consume el dashboard para centrar el mapa.
        self.scenario_meta: dict[str, Any] = {}

        self._journal: list[tuple[int, DecisionLogEntry]] = []
        self._versions: dict[str, dict[str, int]] = {k: {} for k in COLLECTIONS}
        self._versions["fire"] = {}
        self._removed: list[tuple[int, str, str]] = []  # (version, subject_type, id)

        self._event_seq = 0
        self._id_seq: dict[str, int] = {}
        self._route_cache: dict[str, tuple[str, list[tuple[float, float]]]] = {}

        # Trabajo pendiente para que el planner sea barato: solo recalcula lo marcado.
        self.dirty_exits: set[str] = set()
        self.dirty_routes: set[str] = set()
        self.dirty_all_routes = False

        # Plazas libres declaradas por teléfono. No es un campo de `Person` (el contrato no lo
        # tiene: el ejemplo lo guarda en `notes`), así que el dato estructurado vive aquí para
        # que el planner pueda formar convoyes sin inventar campos en la entidad.
        self.seats_free: dict[str, int] = {}

        # Campos pinchados por un humano: el planner no los puede revertir.
        self.overrides: dict[tuple[str, str, str], dict] = {}
        self.pending_approvals: dict[str, PendingApproval] = {}
        self.last_event_id: str | None = None

    @property
    def uptime_s(self) -> float:
        return round(time.time() - self._boot_time, 1)

    @property
    def decision_log(self) -> list[DecisionLogEntry]:
        return [entry for _, entry in self._journal]

    # ------------------------------------------------------------------ ids
    def next_event_id(self) -> str:
        self._event_seq += 1
        return f"ev-{self._event_seq:06d}"

    def next_id(self, prefix: str, width: int = 3) -> str:
        """Siguiente id libre con el prefijo del contrato (`p-001`, `h-012`, `c-1`...)."""
        collection = {
            "p": self.people,
            "h": self.houses,
            "c": self.convoys,
            "pt": self.patrols,
            "x": self.safe_zones,
            "s": self.sectors,
            "rc": self.road_closures,
        }.get(prefix, {})
        n = self._id_seq.get(prefix, 0)
        while True:
            n += 1
            candidate = f"{prefix}-{n:0{width}d}"
            if candidate not in collection:
                self._id_seq[prefix] = n
                return candidate

    # ------------------------------------------------------------------ acceso
    def collection(self, subject_type: str) -> dict[str, Any] | None:
        name = COLLECTIONS.get(subject_type)
        return getattr(self, name) if name else None

    def get(self, subject_type: str, subject_id: str | None) -> Any | None:
        if subject_type == "fire":
            return self.fire
        coll = self.collection(subject_type)
        if coll is None or subject_id is None:
            return None
        return coll.get(subject_id)

    def person(self, person_id: str) -> Person | None:
        return self.people.get(person_id)

    def person_by_phone(self, phone: str | None) -> Person | None:
        if not phone:
            return None
        return next((p for p in self.people.values() if p.phone == phone), None)

    def house_by_phone(self, phone: str | None) -> House | None:
        if not phone:
            return None
        return next((h for h in self.houses.values() if h.phone == phone), None)

    def people_to_evacuate(self) -> list[Person]:
        """Todos menos los que ya están a salvo."""
        from models import PersonStatus

        return [p for p in self.people.values() if p.status != PersonStatus.safe]

    # ------------------------------------------------------------------ overrides humanos
    def override_key(self, subject_type: str, subject_id: str | None, field: str):
        return (subject_type, subject_id or "-", field)

    def is_overridden(self, subject_type: str, subject_id: str | None, field: str) -> bool:
        return self.override_key(subject_type, subject_id, field) in self.overrides

    def set_override(
        self, subject_type: str, subject_id: str | None, field: str, value: Any, operator: str | None
    ) -> None:
        self.overrides[self.override_key(subject_type, subject_id, field)] = {
            "value": _jsonable(value),
            "operator": operator,
            "at": utcnow_iso(),
        }

    def clear_override(self, subject_type: str, subject_id: str | None, field: str) -> None:
        self.overrides.pop(self.override_key(subject_type, subject_id, field), None)

    # ------------------------------------------------------------------ LA mutación
    def mutate(
        self,
        reason: str,
        *,
        type: DecisionType,
        subject_type: str,
        subject_id: str | None = None,
        changes: dict[str, Any] | None = None,
        entity: Any | None = None,
        actor: Actor = Actor.system,
        trigger_event_id: str | None = None,
        approved_by: str | None = None,
        notified: Iterable[Notified] | None = None,
        log_decision: bool = True,
        force: bool = False,
        remove: bool = False,
    ) -> DecisionLogEntry | None:
        """Aplica un cambio al estado y lo justifica.

        - `changes`: campo → valor nuevo sobre una entidad existente.
        - `entity`: alta de entidad nueva (o sustitución completa).
        - `log_decision=False`: refresco de un campo **derivado** (`minutes_to_front`,
          `priority_score`, `priority_rank`...). Sube `state_version` para que el dashboard lo vea
          en el diff, pero no ensucia el timeline: no es una decisión, es la consecuencia
          aritmética de un evento que ya tiene su propia entrada.
        - devuelve la entrada creada, o `None` si no hubo cambio real (idempotencia) o si
          `log_decision=False`.
        """
        with self.lock:
            before: dict[str, Any] = {}
            after: dict[str, Any] = {}

            if remove:
                coll = self.collection(subject_type)
                if coll is None or subject_id not in coll:
                    return None
                before = {"existed": True}
                coll.pop(subject_id, None)
                self._versions.get(subject_type, {}).pop(subject_id, None)
                self.state_version += 1
                self._removed.append((self.state_version, subject_type, subject_id))
                self.t = utcnow_iso()
                return self._append_entry(
                    type=type,
                    subject_type=subject_type,
                    subject_id=subject_id,
                    before=before,
                    after={"removed": True},
                    reason=reason,
                    actor=actor,
                    trigger_event_id=trigger_event_id,
                    approved_by=approved_by,
                    notified=notified,
                ) if log_decision else None

            if entity is not None:
                if subject_type == "fire":
                    previous = self.fire
                    before = {"updated_at": previous.updated_at} if previous else {}
                    self.fire = entity
                    after = {"updated_at": entity.updated_at}
                else:
                    coll = self.collection(subject_type)
                    if coll is None:
                        raise ValueError(f"subject_type desconocido: {subject_type}")
                    subject_id = subject_id or getattr(entity, "id", None)
                    previous = coll.get(subject_id)
                    before = {"existed": previous is not None}
                    coll[subject_id] = entity
                    after = {"created": previous is None}
            else:
                target = self.get(subject_type, subject_id)
                if target is None:
                    log.warning(
                        "mutate sobre entidad inexistente %s/%s — ignorado", subject_type, subject_id
                    )
                    return None
                for field, value in (changes or {}).items():
                    if not hasattr(target, field):
                        log.warning("campo inexistente %s.%s — ignorado", subject_type, field)
                        continue
                    current = getattr(target, field)
                    if not force and _jsonable(current) == _jsonable(value):
                        continue  # idempotencia: sin cambio, sin decisión
                    before[field] = _jsonable(current)
                    after[field] = _jsonable(value)
                    setattr(target, field, value)
                if not after and not force:
                    return None

            self.state_version += 1
            self.t = utcnow_iso()
            self._versions.setdefault(subject_type, {})[subject_id or "-"] = self.state_version

            if not log_decision:
                return None

            return self._append_entry(
                type=type,
                subject_type=subject_type,
                subject_id=subject_id,
                before=before,
                after=after,
                reason=reason,
                actor=actor,
                trigger_event_id=trigger_event_id,
                approved_by=approved_by,
                notified=notified,
            )

    def _append_entry(
        self,
        *,
        type: DecisionType,
        subject_type: str,
        subject_id: str | None,
        before: dict,
        after: dict,
        reason: str,
        actor: Actor,
        trigger_event_id: str | None,
        approved_by: str | None,
        notified: Iterable[Notified] | None,
    ) -> DecisionLogEntry:
        entry = DecisionLogEntry(
            id=self.next_event_id(),
            t=self.t,
            type=type,
            subject_type=subject_type,
            subject_id=subject_id,
            before=before,
            after=after,
            reason=reason,
            trigger_event_id=trigger_event_id or self.last_event_id,
            actor=actor,
            approved_by=approved_by,
            notified=list(notified or []),
        )
        self._journal.append((self.state_version, entry))
        self._audit(entry)
        log.info(
            "[%s] %s %s/%s · %s",
            entry.id,
            entry.type.value,
            entry.subject_type,
            entry.subject_id or "-",
            entry.reason,
        )
        return entry

    # ------------------------------------------------------------------ auditoría en disco
    def _audit(self, entry: DecisionLogEntry) -> None:
        self.append_jsonl({"state_version": self.state_version, "decision": _jsonable(entry)})

    def append_jsonl(self, payload: dict) -> None:
        """Append-only. Si el disco falla, la demo sigue: solo avisamos."""
        try:
            settings.state_jsonl.parent.mkdir(parents=True, exist_ok=True)
            with settings.state_jsonl.open("a", encoding="utf-8") as fh:
                fh.write(json.dumps(payload, ensure_ascii=False) + "\n")
        except OSError as exc:  # pragma: no cover - disco lleno o permisos
            log.warning("no se pudo escribir %s: %s", settings.state_jsonl, exc)

    # ------------------------------------------------------------------ lectura
    def snapshot(self) -> dict:
        with self.lock:
            return {
                "state_version": self.state_version,
                "t": self.t,
                "scenario": self.scenario,
                "scenario_meta": self.scenario_meta,
                "people": [p.model_dump(mode="json") for p in self.people.values()],
                "houses": [h.model_dump(mode="json") for h in self.houses.values()],
                "fire": self.fire.model_dump(mode="json") if self.fire else None,
                "safe_zones": [z.model_dump(mode="json") for z in self.safe_zones.values()],
                "road_closures": [r.model_dump(mode="json") for r in self.road_closures.values()],
                "sectors": [s.model_dump(mode="json") for s in self.sectors.values()],
                "convoys": [c.model_dump(mode="json") for c in self.convoys.values()],
                "patrols": [p.model_dump(mode="json") for p in self.patrols.values()],
                "pending_approvals": [a.as_dict() for a in self.pending_approvals.values()],
                "overrides": [
                    {"subject_type": k[0], "subject_id": k[1], "field": k[2], **v}
                    for k, v in self.overrides.items()
                ],
            }

    def diff(self, since_version: int) -> dict:
        """Solo lo que cambió desde `since_version` + las decisiones tomadas desde entonces."""
        with self.lock:
            out: dict[str, Any] = {
                "state_version": self.state_version,
                "since_version": since_version,
                "t": self.t,
            }
            for subject_type, coll_name in COLLECTIONS.items():
                changed = [
                    getattr(self, coll_name)[sid].model_dump(mode="json")
                    for sid, v in self._versions.get(subject_type, {}).items()
                    if v > since_version and sid in getattr(self, coll_name)
                ]
                out[coll_name] = changed
            fire_version = max(self._versions.get("fire", {}).values(), default=0)
            out["fire"] = (
                self.fire.model_dump(mode="json")
                if self.fire and fire_version > since_version
                else None
            )
            out["decision_log"] = [
                entry.model_dump(mode="json") for v, entry in self._journal if v > since_version
            ]
            out["removed"] = [
                {"subject_type": st, "id": sid}
                for v, st, sid in self._removed
                if v > since_version
            ]
            out["pending_approvals"] = [a.as_dict() for a in self.pending_approvals.values()]
            return out

    # ------------------------------------------------------------------ cache de rutas
    def route_points(self, person: Person) -> list[tuple[float, float]]:
        """Puntos decodificados de la ruta asignada, con cache por polyline."""
        from geo import decode_polyline

        route = person.assigned_route
        if not route or not route.polyline:
            return []
        cached = self._route_cache.get(person.id)
        if cached and cached[0] == route.polyline:
            return cached[1]
        points = decode_polyline(route.polyline)
        self._route_cache[person.id] = (route.polyline, points)
        return points

    def mark_route_dirty(self, person_ids: Iterable[str]) -> None:
        self.dirty_routes.update(person_ids)

    def mark_exit_dirty(self, person_ids: Iterable[str]) -> None:
        self.dirty_exits.update(person_ids)


# Singleton del proceso. `main.py` lo arranca; los tests lo resetean.
state = CrisisState()
