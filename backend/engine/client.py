"""Cliente HTTP hacia la API de estado de crisis (`backend/api/`).

Regla número uno: **si la API no responde, el motor no muere.** Avisa, reintenta con backoff y
sigue con el guion. En una demo en vivo, un motor que se cae porque la API tardó 300 ms es una
demo perdida; un motor que escribe `API no responde (intento 2/3), sigo` es una demo que se salva.

Nunca lanza excepciones hacia arriba: devuelve `Response(ok=False, ...)`.
"""

from __future__ import annotations

import json
import time
from dataclasses import dataclass, field
from typing import Callable
from urllib.parse import urljoin

import requests

DEFAULT_TIMEOUT_S = 4.0
DEFAULT_MAX_ATTEMPTS = 3
DEFAULT_BACKOFF_BASE_S = 0.4
DEGRADED_AFTER_FAILURES = 3


@dataclass
class Response:
    ok: bool
    status: int | None
    body: dict | None
    error: str | None = None
    attempts: int = 1

    @property
    def state_version(self) -> int | None:
        if isinstance(self.body, dict):
            v = self.body.get("state_version")
            return int(v) if isinstance(v, int) else None
        return None

    @property
    def decisions(self) -> list[dict]:
        if isinstance(self.body, dict) and isinstance(self.body.get("decisions"), list):
            return self.body["decisions"]
        return []


@dataclass
class ClientStats:
    sent: int = 0
    ok: int = 0
    failed: int = 0
    retries: int = 0
    suppressed: int = 0
    by_path: dict[str, int] = field(default_factory=dict)


class CrisisApiClient:
    """POST/GET contra la API, con reintentos, backoff y modo `--dry-run`."""

    def __init__(
        self,
        base_url: str,
        api_key: str | None = None,
        dry_run: bool = False,
        timeout_s: float = DEFAULT_TIMEOUT_S,
        max_attempts: int = DEFAULT_MAX_ATTEMPTS,
        backoff_base_s: float = DEFAULT_BACKOFF_BASE_S,
        log: Callable[[str], None] = print,
        sleeper: Callable[[float], None] = time.sleep,
        session: "requests.Session | None" = None,
    ) -> None:
        self.base_url = base_url.rstrip("/") + "/"
        self.api_key = api_key
        self.dry_run = dry_run
        self.timeout_s = timeout_s
        self.max_attempts = max(1, int(max_attempts))
        self.backoff_base_s = backoff_base_s
        self.log = log
        self._sleeper = sleeper
        self._session = session or requests.Session()
        self.stats = ClientStats()
        self.consecutive_failures = 0
        self.degraded = False
        # Canales silenciados por un evento `integration_down`.
        self.suppressed_channels: set[str] = set()
        # Todo lo que se habría enviado, en orden. El `--dry-run` y los tests lo leen.
        self.outbox: list[dict] = []

    # -- utilidades --------------------------------------------------------------------

    @property
    def headers(self) -> dict:
        h = {"content-type": "application/json"}
        if self.api_key:
            h["x-api-key"] = self.api_key
        return h

    def suppress(self, channels: set[str]) -> None:
        self.suppressed_channels |= channels

    def unsuppress(self, channels: set[str]) -> None:
        self.suppressed_channels -= channels

    # -- envío -------------------------------------------------------------------------

    def post(self, path: str, payload: dict, channel: str = "other") -> Response:
        return self._send("POST", path, payload, channel)

    def get(self, path: str, channel: str = "read") -> Response:
        return self._send("GET", path, None, channel)

    def _send(self, method: str, path: str, payload: dict | None, channel: str) -> Response:
        url = urljoin(self.base_url, path.lstrip("/"))
        self.outbox.append({"method": method, "path": path, "channel": channel, "payload": payload})
        self.stats.by_path[path] = self.stats.by_path.get(path, 0) + 1

        if channel in self.suppressed_channels:
            self.stats.suppressed += 1
            return Response(ok=False, status=None, body=None, error=f"canal '{channel}' caido (integration_down)")

        if self.dry_run:
            return Response(ok=True, status=None, body=None, error=None)

        self.stats.sent += 1
        # En modo degradado no insistimos: un solo intento para no frenar el reloj.
        attempts_allowed = 1 if self.degraded else self.max_attempts
        last_error = "sin intentos"
        for attempt in range(1, attempts_allowed + 1):
            try:
                if method == "GET":
                    r = self._session.get(url, headers=self.headers, timeout=self.timeout_s)
                else:
                    r = self._session.post(
                        url, data=json.dumps(payload), headers=self.headers, timeout=self.timeout_s
                    )
                body: dict | None
                try:
                    body = r.json()
                except ValueError:
                    body = None
                if 200 <= r.status_code < 300:
                    self._on_success()
                    return Response(ok=True, status=r.status_code, body=body, attempts=attempt)
                last_error = f"HTTP {r.status_code}"
                # 4xx (salvo 429) no se arregla reintentando.
                if 400 <= r.status_code < 500 and r.status_code != 429:
                    self._on_failure(f"{method} {path}: {last_error}", fatal_for_path=True)
                    return Response(ok=False, status=r.status_code, body=body, error=last_error, attempts=attempt)
            except requests.RequestException as exc:
                last_error = type(exc).__name__
            if attempt < attempts_allowed:
                self.stats.retries += 1
                wait = self.backoff_base_s * (2 ** (attempt - 1))
                self.log(
                    f"      ! {method} {path} fallo ({last_error}); reintento {attempt + 1}/{attempts_allowed} en {wait:.1f}s"
                )
                self._sleeper(wait)
        self._on_failure(f"{method} {path}: {last_error}")
        return Response(ok=False, status=None, body=None, error=last_error, attempts=attempts_allowed)

    # -- salud -------------------------------------------------------------------------

    def _on_success(self) -> None:
        self.stats.ok += 1
        if self.degraded:
            self.log("      + la API vuelve a responder; salgo de modo degradado")
        self.degraded = False
        self.consecutive_failures = 0

    def _on_failure(self, detail: str, fatal_for_path: bool = False) -> None:
        self.stats.failed += 1
        self.consecutive_failures += 1
        self.log(f"      ! {detail} -- sigo con el guion")
        if not self.degraded and self.consecutive_failures >= DEGRADED_AFTER_FAILURES:
            self.degraded = True
            self.log(
                "      ! la API no responde: entro en modo degradado (1 intento por evento). "
                "El escenario sigue avanzando."
            )

    def summary(self) -> str:
        s = self.stats
        mode = " [DRY-RUN]" if self.dry_run else ""
        return (
            f"{len(self.outbox)} peticiones{mode}: {s.ok} ok, {s.failed} fallidas, "
            f"{s.retries} reintentos, {s.suppressed} silenciadas por caida de integracion"
        )
