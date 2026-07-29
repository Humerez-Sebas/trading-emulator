"""Tests de logica pura para update_r2.py (actualizacion incremental de R2).

Solo cubren las funciones puras de fusion y empalme; no tocan R2 ni MT5.
"""

import os
import sys
from datetime import UTC, datetime

import pytest

pd = pytest.importorskip("pandas")

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import update_r2

COLUMNAS = ["time", "open", "high", "low", "close"]


def _epoch(dt_str: str) -> int:
    return int(datetime.fromisoformat(dt_str).replace(tzinfo=UTC).timestamp())


def _frame(filas: list[tuple[int, float]]) -> "pd.DataFrame":
    """Frame OHLC minimo: (time, valor) -> las cuatro columnas valen lo mismo."""
    return pd.DataFrame(
        {
            "time": [t for t, _ in filas],
            "open": [v for _, v in filas],
            "high": [v for _, v in filas],
            "low": [v for _, v in filas],
            "close": [v for _, v in filas],
        }
    )


class TestMergePorTiempo:
    """merge_por_tiempo(viejo, nuevo): fusiona por 'time', gana lo NUEVO."""

    def test_concatena_series_disjuntas(self):
        viejo = _frame([(_epoch("2026-07-20 00:00"), 1.0)])
        nuevo = _frame([(_epoch("2026-07-20 00:01"), 2.0)])

        out = update_r2.merge_por_tiempo(viejo, nuevo)

        assert list(out["time"]) == [_epoch("2026-07-20 00:00"), _epoch("2026-07-20 00:01")]

    def test_en_empate_gana_la_fila_nueva(self):
        t = _epoch("2026-07-20 00:00")
        out = update_r2.merge_por_tiempo(_frame([(t, 1.0)]), _frame([(t, 9.0)]))

        assert len(out) == 1
        assert float(out.iloc[0]["close"]) == pytest.approx(9.0)

    def test_ordena_por_tiempo(self):
        viejo = _frame([(_epoch("2026-07-20 00:05"), 1.0)])
        nuevo = _frame([(_epoch("2026-07-20 00:01"), 2.0)])

        out = update_r2.merge_por_tiempo(viejo, nuevo)

        assert list(out["time"]) == sorted(out["time"])

    def test_elimina_duplicados_dentro_del_nuevo(self):
        t = _epoch("2026-07-20 00:00")
        nuevo = _frame([(t, 1.0), (t, 5.0)])

        out = update_r2.merge_por_tiempo(_frame([]), nuevo)

        assert len(out) == 1
        assert float(out.iloc[0]["close"]) == pytest.approx(5.0)

    def test_devuelve_las_cinco_columnas_en_orden(self):
        out = update_r2.merge_por_tiempo(
            _frame([(_epoch("2026-07-20 00:00"), 1.0)]),
            _frame([(_epoch("2026-07-20 00:01"), 2.0)]),
        )

        assert list(out.columns) == COLUMNAS

    def test_time_es_int64(self):
        out = update_r2.merge_por_tiempo(
            _frame([(_epoch("2026-07-20 00:00"), 1.0)]),
            _frame([(_epoch("2026-07-20 00:01"), 2.0)]),
        )

        assert out["time"].dtype == "int64"

    def test_indice_reiniciado(self):
        viejo = _frame([(_epoch("2026-07-20 00:05"), 1.0)])
        nuevo = _frame([(_epoch("2026-07-20 00:01"), 2.0)])

        out = update_r2.merge_por_tiempo(viejo, nuevo)

        assert list(out.index) == [0, 1]

    def test_viejo_vacio(self):
        nuevo = _frame([(_epoch("2026-07-20 00:01"), 2.0)])

        out = update_r2.merge_por_tiempo(_frame([]), nuevo)

        assert len(out) == 1


class TestEmpalmar:
    """empalmar(historico, recomputado, corte): historico < corte + recomputado."""

    def _historico(self):
        return _frame(
            [
                (_epoch("2026-07-18 00:00"), 1.0),
                (_epoch("2026-07-19 00:00"), 2.0),
                (_epoch("2026-07-20 00:00"), 3.0),  # quedo parcial
            ]
        )

    def test_conserva_lo_anterior_al_corte(self):
        out = update_r2.empalmar(
            self._historico(),
            _frame([(_epoch("2026-07-20 00:00"), 30.0)]),
            _epoch("2026-07-20 00:00"),
        )

        assert list(out["time"])[:2] == [_epoch("2026-07-18 00:00"), _epoch("2026-07-19 00:00")]

    def test_reemplaza_el_bucket_que_estaba_parcial(self):
        out = update_r2.empalmar(
            self._historico(),
            _frame([(_epoch("2026-07-20 00:00"), 30.0)]),
            _epoch("2026-07-20 00:00"),
        )

        assert float(out.iloc[-1]["close"]) == pytest.approx(30.0)

    def test_agrega_los_buckets_nuevos(self):
        out = update_r2.empalmar(
            self._historico(),
            _frame([(_epoch("2026-07-20 00:00"), 30.0), (_epoch("2026-07-21 00:00"), 40.0)]),
            _epoch("2026-07-20 00:00"),
        )

        assert list(out["time"])[-1] == _epoch("2026-07-21 00:00")
        assert len(out) == 4

    def test_descarta_lo_viejo_posterior_al_corte(self):
        """Si el recomputado ya no tiene un bucket, el viejo no debe sobrevivir."""
        historico = _frame(
            [
                (_epoch("2026-07-19 00:00"), 2.0),
                (_epoch("2026-07-20 00:00"), 3.0),
                (_epoch("2026-07-21 00:00"), 4.0),
            ]
        )

        out = update_r2.empalmar(
            historico,
            _frame([(_epoch("2026-07-20 00:00"), 30.0)]),
            _epoch("2026-07-20 00:00"),
        )

        assert list(out["time"]) == [_epoch("2026-07-19 00:00"), _epoch("2026-07-20 00:00")]

    def test_historico_vacio_devuelve_el_recomputado(self):
        recomputado = _frame([(_epoch("2026-07-20 00:00"), 30.0)])

        out = update_r2.empalmar(_frame([]), recomputado, _epoch("2026-07-20 00:00"))

        assert list(out["time"]) == [_epoch("2026-07-20 00:00")]


class TestInicioDeDiaUtc:
    """El corte cae en frontera de dia para no partir ningun bucket D1."""

    def test_devuelve_la_medianoche_del_mismo_dia(self):
        out = update_r2.inicio_de_dia_utc(_epoch("2026-07-29 19:09"))

        assert out == datetime(2026, 7, 29, tzinfo=UTC)

    def test_una_medianoche_se_devuelve_igual(self):
        out = update_r2.inicio_de_dia_utc(_epoch("2026-07-29 00:00"))

        assert out == datetime(2026, 7, 29, tzinfo=UTC)

    def test_el_ultimo_minuto_del_dia_no_pasa_al_siguiente(self):
        out = update_r2.inicio_de_dia_utc(_epoch("2026-07-29 23:59"))

        assert out == datetime(2026, 7, 29, tzinfo=UTC)

    def test_devuelve_datetime_con_zona(self):
        out = update_r2.inicio_de_dia_utc(_epoch("2026-07-29 19:09"))

        assert out.tzinfo is not None
