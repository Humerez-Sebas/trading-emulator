"""Doble de prueba de la libreria MetaTrader5.

`mt5_common` importa MetaTrader5 en el nivel de modulo, asi que sin este doble
no se puede importar (ni en CI, que no instala la libreria, ni en la maquina
Windows del pipeline, donde importarla de verdad hablaria con la terminal real).
El doble se instala en `sys.modules` ANTES de la coleccion para que
`import mt5_common` funcione en cualquier maquina.

El doble modela el defecto que motivo estos tests: `copy_rates_range` solo ve la
CACHE LOCAL de la terminal; hasta que no se llama a `copy_rates_from_pos` la
terminal no descarga el historial del servidor. Por eso el doble distingue entre
``barras`` (lo que el servidor puede servir) y ``cache`` (lo que devuelve el
rango mientras el simbolo siga frio).
"""

from __future__ import annotations

import sys
import types

import numpy as np
import pytest

RATES_DTYPE = np.dtype(
    [
        ("time", "<i8"),
        ("open", "<f8"),
        ("high", "<f8"),
        ("low", "<f8"),
        ("close", "<f8"),
    ]
)

_NOMBRES_TF = [
    "M1", "M2", "M3", "M4", "M5", "M6", "M10", "M12", "M15", "M20", "M30",
    "H1", "H2", "H3", "H4", "H6", "H8", "H12", "D1", "W1", "MN1",
]  # fmt: skip


def barras(times: list[int]) -> np.ndarray:
    """Array de velas sinteticas con el dtype que devuelve MetaTrader5."""
    arr = np.zeros(len(times), dtype=RATES_DTYPE)
    for i, t in enumerate(times):
        arr[i] = (t, 1.0 + i, 1.5 + i, 0.5 + i, 1.2 + i)
    return arr


def minutos(desde: int, cuantos: int) -> list[int]:
    """Serie de epochs M1 consecutivos."""
    return [desde + 60 * i for i in range(cuantos)]


class _TerminalInfo:
    def __init__(self, maxbars: int) -> None:
        self.maxbars = maxbars


class _Tick:
    def __init__(self, time: int) -> None:
        self.time = time


class FakeMT5(types.ModuleType):
    """Terminal MT5 simulada, controlable desde cada test."""

    def __init__(self) -> None:
        super().__init__("MetaTrader5")
        for i, nombre in enumerate(_NOMBRES_TF, start=1):
            setattr(self, f"TIMEFRAME_{nombre}", i)
        self.reiniciar()

    # -- control del test ---------------------------------------------------
    def reiniciar(self) -> None:
        self.llamadas: list[tuple] = []
        self.barras: dict[str, np.ndarray] = {}
        self.cache: dict[str, np.ndarray] = {}
        self.visible: dict[str, bool] = {}
        self.caliente: set[str] = set()
        self.ticks: dict[str, int] = {}
        self.maxbars = 100_000
        self.error = (1, "Success")
        self.from_pos_vacios = 0
        self.rango_devuelve_none = False
        # Tope duro por simbolo: el rango nunca devuelve velas posteriores,
        # ni siquiera tras calentar (truncado que la terminal no sabe resolver).
        self.rango_tope: dict[str, int] = {}

    def cargar(
        self,
        symbol: str,
        servidor: list[int],
        cache: list[int] | None = None,
        visible: bool = True,
    ) -> None:
        """Da de alta un simbolo. ``cache`` = lo que ve el rango en frio."""
        self.barras[symbol] = barras(servidor)
        self.cache[symbol] = barras(servidor if cache is None else cache)
        self.visible[symbol] = visible

    def _disponible(self, symbol: str) -> np.ndarray:
        if symbol in self.caliente:
            return self.barras.get(symbol, barras([]))
        return self.cache.get(symbol, barras([]))

    # -- API que consume mt5_common ----------------------------------------
    def initialize(self, *a, **k) -> bool:
        self.llamadas.append(("initialize",))
        return True

    def shutdown(self) -> None:
        self.llamadas.append(("shutdown",))

    def last_error(self):
        return self.error

    def terminal_info(self):
        return _TerminalInfo(self.maxbars)

    def symbol_info_tick(self, symbol: str):
        self.llamadas.append(("symbol_info_tick", symbol))
        t = self.ticks.get(symbol)
        return _Tick(t) if t is not None else None

    def symbol_select(self, symbol: str, enable: bool = True) -> bool:
        self.llamadas.append(("symbol_select", symbol, enable))
        self.visible[symbol] = enable
        return True

    def copy_rates_from_pos(self, symbol: str, tf, start: int, count: int):
        self.llamadas.append(("copy_rates_from_pos", symbol))
        if self.from_pos_vacios > 0:
            self.from_pos_vacios -= 1
            return barras([])
        # Esta es la llamada que fuerza la sincronizacion con el servidor.
        self.caliente.add(symbol)
        disponibles = self.barras.get(symbol, barras([]))
        if not len(disponibles):
            return barras([])
        return disponibles[-count:]

    def copy_rates_range(self, symbol: str, tf, desde, hasta):
        self.llamadas.append(("copy_rates_range", symbol, desde, hasta))
        if self.rango_devuelve_none:
            return None
        disponibles = self._disponible(symbol)
        if not len(disponibles):
            return barras([])
        d, h = int(desde.timestamp()), int(hasta.timestamp())
        tope = self.rango_tope.get(symbol)
        if tope is not None:
            h = min(h, tope)
        return disponibles[(disponibles["time"] >= d) & (disponibles["time"] <= h)]


_FAKE = FakeMT5()
sys.modules.setdefault("MetaTrader5", _FAKE)
if sys.modules["MetaTrader5"] is not _FAKE:  # una libreria real ganaria la carrera
    sys.modules["MetaTrader5"] = _FAKE


@pytest.fixture
def mt5_falso() -> FakeMT5:
    """Terminal simulada, limpia para cada test."""
    _FAKE.reiniciar()
    return _FAKE
