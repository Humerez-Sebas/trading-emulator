"""Harvester pure-logic tests. The harvester imports MetaTrader5 (Windows-host
only) and numpy, so the whole module is skipped where they are absent."""

import os
import sys
from datetime import datetime, timezone

import pytest

pytest.importorskip("MetaTrader5")
np = pytest.importorskip("numpy")

# mt5_common vive en la raíz del repo (un nivel por encima de backend/)
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

import harvester  # noqa: E402
import mt5_common  # noqa: E402


def _rates(times):
    arr = np.zeros(
        len(times),
        dtype=[("time", "i8"), ("open", "f8"), ("high", "f8"), ("low", "f8"), ("close", "f8")],
    )
    arr["time"] = times
    return arr


def _patch_mt5(monkeypatch, ventanas, maxbars=4):
    """Hace que copy_rates_range devuelva, en orden, cada array de `ventanas`,
    y fija maxbars chico para forzar varias ventanas de troceo."""
    it = iter(ventanas)
    monkeypatch.setattr(
        mt5_common.mt5, "terminal_info", lambda: type("T", (), {"maxbars": maxbars})()
    )
    monkeypatch.setattr(mt5_common.mt5, "copy_rates_range", lambda *a, **k: next(it, _rates([])))


def test_iter_dedups_shared_border(monkeypatch):
    # maxbars=4 -> ventana de 1 día; rango de 2 días -> 2 llamadas a MT5.
    # La vela t=120 sale en ambas ventanas y debe deduplicarse.
    _patch_mt5(monkeypatch, [_rates([0, 60, 120]), _rates([120, 180])])
    desde = datetime.fromtimestamp(0, tz=timezone.utc)
    hasta = datetime.fromtimestamp(172_800, tz=timezone.utc)  # 2 días

    chunks = [
        r for r, err in mt5_common.iter_rango_troceado("X", 1, "M1", desde, hasta) if r is not None
    ]
    times = np.concatenate([c["time"] for c in chunks]).tolist()
    assert times == [0, 60, 120, 180]  # 120 no se repite


def test_iter_surfaces_window_error(monkeypatch):
    _patch_mt5(monkeypatch, [_rates([0, 60]), None])
    monkeypatch.setattr(mt5_common.mt5, "last_error", lambda: (-2, "Invalid params"))
    desde = datetime.fromtimestamp(0, tz=timezone.utc)
    hasta = datetime.fromtimestamp(172_800, tz=timezone.utc)

    out = list(mt5_common.iter_rango_troceado("X", 1, "M1", desde, hasta))
    errores = [err for r, err in out if r is None]
    assert errores == [(-2, "Invalid params")]


def test_copiar_eager_concatenates_deduped(monkeypatch):
    _patch_mt5(monkeypatch, [_rates([0, 60, 120]), _rates([120, 180])])
    desde = datetime.fromtimestamp(0, tz=timezone.utc)
    hasta = datetime.fromtimestamp(172_800, tz=timezone.utc)

    rates, err = mt5_common.copiar_rango_troceado("X", 1, "M1", desde, hasta)
    assert err is None
    assert rates["time"].tolist() == [0, 60, 120, 180]


def test_desde_efectivo_resume():
    desde = datetime(2024, 1, 1, tzinfo=timezone.utc)
    # sin cobertura -> arranca en desde
    assert harvester.desde_efectivo(desde, None, "M5") == desde
    # con cobertura posterior -> reanuda en hasta_cov menos 1 vela (300s en M5)
    hasta_cov = int(datetime(2024, 6, 1, tzinfo=timezone.utc).timestamp())
    ef = harvester.desde_efectivo(desde, hasta_cov, "M5")
    assert ef == datetime.fromtimestamp(hasta_cov - 300, tz=timezone.utc)
    # cobertura anterior a desde -> respeta desde
    viejo = int(datetime(2023, 1, 1, tzinfo=timezone.utc).timestamp())
    assert harvester.desde_efectivo(desde, viejo, "M5") == desde
