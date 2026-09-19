"""Reloj de simulación con factor de aceleración.

Sin esto no hay demo: el escenario dura 40 minutos simulados y la demo son 3 minutos reales.

`time_scale` = segundos simulados por segundo real.
  - 60  (por defecto) -> 1 minuto simulado por segundo real: 40 min de incendio en 40 s.
  - 20               -> 40 min de incendio en 2 min reales (ritmo recomendado para narrar).
  - 0 o negativo     -> "tan rápido como se pueda": no duerme nunca (tests, `--dry-run`).

El reloj se puede pausar, reanudar y saltar (`seek`) a cualquier momento del guion. Las fuentes
de tiempo (`monotonic`, `sleeper`) son inyectables para que los tests no tarden 40 minutos.
"""

from __future__ import annotations

import time
from datetime import datetime, timedelta, timezone
from typing import Callable

MAX_SLEEP_SLICE_S = 0.2  # para que pause() responda rápido durante una espera larga


class SimClock:
    def __init__(
        self,
        time_scale: float = 60.0,
        starts_at: datetime | None = None,
        start_sim_min: float = 0.0,
        monotonic: Callable[[], float] = time.monotonic,
        sleeper: Callable[[float], None] = time.sleep,
    ) -> None:
        self.time_scale = float(time_scale)
        self.starts_at = starts_at or datetime.now(timezone.utc)
        self._monotonic = monotonic
        self._sleeper = sleeper
        self._sim_min_at_mark = float(start_sim_min)
        self._mark = monotonic()
        self._paused = False

    # -- lectura -----------------------------------------------------------------------

    @property
    def instant(self) -> bool:
        """True si el reloj no espera (velocidad infinita)."""
        return self.time_scale <= 0

    @property
    def sim_minutes(self) -> float:
        """Minutos simulados desde el inicio del guion."""
        if self._paused or self.instant:
            return self._sim_min_at_mark
        elapsed_real_s = self._monotonic() - self._mark
        return self._sim_min_at_mark + elapsed_real_s * self.time_scale / 60.0

    @property
    def sim_time(self) -> datetime:
        """Momento simulado absoluto (UTC), para el campo `t` de los eventos."""
        return self.starts_at + timedelta(minutes=self.sim_minutes)

    def iso(self) -> str:
        return self.sim_time.strftime("%Y-%m-%dT%H:%M:%SZ")

    def stamp(self) -> str:
        """Etiqueta corta para la consola: `t+08:30 | 16:48:30Z`."""
        m = self.sim_minutes
        return f"t+{int(m):02d}:{int(round((m - int(m)) * 60)) % 60:02d} | {self.sim_time.strftime('%H:%M:%SZ')}"

    @property
    def is_paused(self) -> bool:
        return self._paused

    # -- control -----------------------------------------------------------------------

    def pause(self) -> None:
        if not self._paused:
            self._sim_min_at_mark = self.sim_minutes
            self._paused = True

    def resume(self) -> None:
        if self._paused:
            self._mark = self._monotonic()
            self._paused = False

    def toggle_pause(self) -> bool:
        self.pause() if not self._paused else self.resume()
        return self._paused

    def seek(self, sim_min: float) -> None:
        """Salta a un momento concreto del guion (hacia delante o hacia atrás)."""
        self._sim_min_at_mark = float(sim_min)
        self._mark = self._monotonic()

    def advance(self, minutes: float) -> None:
        """Avanza el reloj sin esperar (modo instantáneo y puesta al día)."""
        self.seek(self.sim_minutes + minutes)

    # -- espera ------------------------------------------------------------------------

    def sleep_until(self, sim_min: float) -> None:
        """Bloquea hasta que el tiempo simulado llegue a `sim_min`.

        En modo instantáneo simplemente mueve el reloj. Si está en pausa, espera a que se
        reanude (la pausa congela el tiempo simulado, no lo salta).
        """
        if self.instant:
            if sim_min > self.sim_minutes:
                self.seek(sim_min)
            return
        while True:
            now = self.sim_minutes
            if now >= sim_min:
                return
            if self._paused:
                self._sleeper(MAX_SLEEP_SLICE_S)
                continue
            real_s = (sim_min - now) * 60.0 / self.time_scale
            self._sleeper(min(real_s, MAX_SLEEP_SLICE_S))
