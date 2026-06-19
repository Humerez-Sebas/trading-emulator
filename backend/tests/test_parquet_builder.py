# -*- coding: utf-8 -*-
"""Tests de logica pura para parquet_builder.py.

Solo cubren las funciones puras (remuestreo y escritura/lectura en disco);
NO requieren MetaTrader5. El modulo parquet_builder importa mt5_common solo
desde el orquestador; las funciones puras no tienen esa dependencia.
"""

import os
import sys
from datetime import datetime, timezone

import pytest

pd = pytest.importorskip("pandas")
pa = pytest.importorskip("pyarrow")
pq = pytest.importorskip("pyarrow.parquet")

# parquet_builder vive como modulo plano en backend/
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import parquet_builder  # noqa: E402


# ---------------------------------------------------------------------------
# Helpers de construccion de datos sinteticos
# ---------------------------------------------------------------------------


def _make_m1_rates(times_utc: list[int]) -> "pd.DataFrame":
    """Devuelve un DataFrame M1 sintetico con columnas time/open/high/low/close."""

    arr = {
        "time": times_utc,
        "open": [float(1 + i * 0.01) for i in range(len(times_utc))],
        "high": [float(1 + i * 0.01 + 0.005) for i in range(len(times_utc))],
        "low": [float(1 + i * 0.01 - 0.005) for i in range(len(times_utc))],
        "close": [float(1 + i * 0.01 + 0.002) for i in range(len(times_utc))],
    }
    return pd.DataFrame(arr)


def _epoch(dt_str: str) -> int:
    """Convierte 'YYYY-MM-DD HH:MM' UTC a epoch segundos."""
    return int(datetime.fromisoformat(dt_str).replace(tzinfo=timezone.utc).timestamp())


# ---------------------------------------------------------------------------
# Tests de remuestreo (resample_anchors)
# ---------------------------------------------------------------------------


class TestResampleAnchors:
    """La funcion resample_anchors(df_m1) debe devolver {'M1': df, 'H1': df, 'D1': df}."""

    def test_retorna_las_tres_claves(self):
        times = [_epoch("2024-01-02 09:00"), _epoch("2024-01-02 09:01")]
        df = _make_m1_rates(times)
        resultado = parquet_builder.resample_anchors(df)
        assert set(resultado.keys()) == {"M1", "H1", "D1"}

    def test_m1_preserva_filas_originales(self):
        times = [
            _epoch("2024-01-02 09:00"),
            _epoch("2024-01-02 09:01"),
            _epoch("2024-01-02 09:02"),
        ]
        df = _make_m1_rates(times)
        resultado = parquet_builder.resample_anchors(df)
        assert list(resultado["M1"]["time"]) == times

    def test_h1_agrupa_velas_del_mismo_hora(self):
        # Tres velas en 09:00-09:02 mas dos en 10:00-10:01 -> 2 filas H1
        times = [
            _epoch("2024-01-02 09:00"),
            _epoch("2024-01-02 09:01"),
            _epoch("2024-01-02 09:02"),
            _epoch("2024-01-02 10:00"),
            _epoch("2024-01-02 10:01"),
        ]
        df = _make_m1_rates(times)
        h1 = parquet_builder.resample_anchors(df)["H1"]
        assert len(h1) == 2
        # El tiempo de la vela H1 debe ser el borde izquierdo (inicio de la hora)
        assert int(h1.iloc[0]["time"]) == _epoch("2024-01-02 09:00")
        assert int(h1.iloc[1]["time"]) == _epoch("2024-01-02 10:00")

    def test_h1_ohlc_correcto(self):
        # 09:00 open=1.0 high=1.005 low=0.995 close=1.002
        # 09:01 open=1.01 high=1.015 low=1.005 close=1.012
        # -> H1: open=first(1.0), high=max(1.015), low=min(0.995), close=last(1.012)
        times = [_epoch("2024-01-02 09:00"), _epoch("2024-01-02 09:01")]
        df = pd.DataFrame(
            {
                "time": times,
                "open": [1.0, 1.01],
                "high": [1.005, 1.015],
                "low": [0.995, 1.005],
                "close": [1.002, 1.012],
            }
        )
        h1 = parquet_builder.resample_anchors(df)["H1"]
        assert len(h1) == 1
        row = h1.iloc[0]
        assert row["open"] == pytest.approx(1.0)
        assert row["high"] == pytest.approx(1.015)
        assert row["low"] == pytest.approx(0.995)
        assert row["close"] == pytest.approx(1.012)

    def test_d1_agrupa_por_dia_utc(self):
        # Velas del 2 y del 3 de enero -> 2 filas D1
        times = [
            _epoch("2024-01-02 09:00"),
            _epoch("2024-01-02 23:59"),
            _epoch("2024-01-03 00:00"),
        ]
        df = _make_m1_rates(times)
        d1 = parquet_builder.resample_anchors(df)["D1"]
        assert len(d1) == 2
        assert int(d1.iloc[0]["time"]) == _epoch("2024-01-02 00:00")
        assert int(d1.iloc[1]["time"]) == _epoch("2024-01-03 00:00")

    def test_no_produce_filas_nan_en_huecos(self):
        # Velas del viernes y del lunes (hueco fin de semana) -> solo 2 filas H1
        times = [
            _epoch("2024-01-05 09:00"),  # viernes
            _epoch("2024-01-08 09:00"),  # lunes
        ]
        df = _make_m1_rates(times)
        anchors = parquet_builder.resample_anchors(df)
        for tf_name, df_tf in anchors.items():
            nan_filas = df_tf[df_tf.isnull().any(axis=1)]
            assert len(nan_filas) == 0, f"{tf_name} tiene filas con NaN tras hueco de fin de semana"

    def test_columnas_schema_correcto(self):
        times = [_epoch("2024-01-02 09:00")]
        df = _make_m1_rates(times)
        anchors = parquet_builder.resample_anchors(df)
        for tf_name, df_tf in anchors.items():
            assert list(df_tf.columns) == ["time", "open", "high", "low", "close"], (
                f"{tf_name} tiene columnas incorrectas: {list(df_tf.columns)}"
            )


# ---------------------------------------------------------------------------
# Tests de escritura / particion (write_anchors)
# ---------------------------------------------------------------------------


class TestWriteAnchors:
    """write_anchors(anchors, symbol, out_dir) -> lista de rutas escritas."""

    def _anchors_dos_anios(self):
        """Anchors con velas en 2024 y 2025 para probar particion por anio."""
        times = [
            _epoch("2024-06-15 10:00"),
            _epoch("2024-06-15 10:01"),
            _epoch("2025-03-10 14:00"),
            _epoch("2025-03-10 14:01"),
        ]
        df = _make_m1_rates(times)
        return parquet_builder.resample_anchors(df)

    def test_devuelve_lista_de_rutas(self, tmp_path):
        anchors = self._anchors_dos_anios()
        rutas = parquet_builder.write_anchors(anchors, "XAUUSD", str(tmp_path))
        assert isinstance(rutas, list)
        assert len(rutas) == 4

    def test_m1_particion_por_anio(self, tmp_path):
        anchors = self._anchors_dos_anios()
        parquet_builder.write_anchors(anchors, "XAUUSD", str(tmp_path))
        assert os.path.isfile(os.path.join(str(tmp_path), "XAUUSD", "m1", "2024.parquet"))
        assert os.path.isfile(os.path.join(str(tmp_path), "XAUUSD", "m1", "2025.parquet"))

    def test_h1_escribe_all_parquet(self, tmp_path):
        anchors = self._anchors_dos_anios()
        parquet_builder.write_anchors(anchors, "XAUUSD", str(tmp_path))
        assert os.path.isfile(os.path.join(str(tmp_path), "XAUUSD", "h1", "all.parquet"))

    def test_d1_escribe_all_parquet(self, tmp_path):
        anchors = self._anchors_dos_anios()
        parquet_builder.write_anchors(anchors, "XAUUSD", str(tmp_path))
        assert os.path.isfile(os.path.join(str(tmp_path), "XAUUSD", "d1", "all.parquet"))

    def test_roundtrip_schema_m1(self, tmp_path):
        """El Parquet escrito se puede leer y tiene las columnas y tipos correctos."""
        anchors = self._anchors_dos_anios()
        parquet_builder.write_anchors(anchors, "XAUUSD", str(tmp_path))
        tabla = pq.read_table(os.path.join(str(tmp_path), "XAUUSD", "m1", "2024.parquet"))
        assert tabla.schema.field("time").type == pa.int64()
        assert tabla.schema.field("open").type == pa.float64()
        assert tabla.schema.field("high").type == pa.float64()
        assert tabla.schema.field("low").type == pa.float64()
        assert tabla.schema.field("close").type == pa.float64()

    def test_roundtrip_valores_m1_2024(self, tmp_path):
        """Las velas de 2024 en el Parquet coinciden con las del DataFrame original."""
        anchors = self._anchors_dos_anios()
        parquet_builder.write_anchors(anchors, "XAUUSD", str(tmp_path))
        tabla = pq.read_table(os.path.join(str(tmp_path), "XAUUSD", "m1", "2024.parquet"))
        df_leido = tabla.to_pandas()
        # Solo velas del 2024
        esperado_times = [_epoch("2024-06-15 10:00"), _epoch("2024-06-15 10:01")]
        assert sorted(df_leido["time"].tolist()) == sorted(esperado_times)

    def test_roundtrip_compresion_snappy(self, tmp_path):
        """Los archivos deben usar compresion Snappy."""
        anchors = self._anchors_dos_anios()
        parquet_builder.write_anchors(anchors, "XAUUSD", str(tmp_path))
        meta = pq.read_metadata(os.path.join(str(tmp_path), "XAUUSD", "m1", "2024.parquet"))
        # pyarrow expone la compresion por row group y columna
        for rg in range(meta.num_row_groups):
            for col in range(meta.num_columns):
                compression = meta.row_group(rg).column(col).compression
                assert compression.lower() == "snappy", (
                    f"Se esperaba snappy, se obtuvo {compression}"
                )

    def test_m1_no_mezcla_anios(self, tmp_path):
        """El archivo 2024.parquet no debe contener velas de 2025."""
        anchors = self._anchors_dos_anios()
        parquet_builder.write_anchors(anchors, "XAUUSD", str(tmp_path))
        tabla_2024 = pq.read_table(os.path.join(str(tmp_path), "XAUUSD", "m1", "2024.parquet"))
        df_2024 = tabla_2024.to_pandas()
        anios = pd.to_datetime(df_2024["time"], unit="s", utc=True).dt.year.unique()
        assert list(anios) == [2024]

    def test_rutas_devueltas_existen(self, tmp_path):
        """Todas las rutas devueltas por write_anchors deben existir en disco."""
        anchors = self._anchors_dos_anios()
        rutas = parquet_builder.write_anchors(anchors, "XAUUSD", str(tmp_path))
        for ruta in rutas:
            assert os.path.isfile(ruta), f"Ruta devuelta no existe: {ruta}"
