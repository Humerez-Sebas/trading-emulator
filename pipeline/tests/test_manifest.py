# -*- coding: utf-8 -*-
"""Tests de logica pura para manifest.py.

No requieren boto3 ni red; trabajan solo con registros sinteticos.
"""

import os
import sys
from datetime import timezone

# manifest.py vive como modulo plano en pipeline/
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import manifest  # noqa: E402


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_record(
    symbol: str, tf: str, partition: str, size: int = 12345, etag: str = "abc123"
) -> dict:
    """Crea un registro de subida sintetico."""
    from datetime import datetime

    return {
        "symbol": symbol,
        "tf": tf,
        "partition": partition,
        "size": size,
        "etag": etag,
        "updated_at": datetime(2026, 6, 18, 12, 0, 0, tzinfo=timezone.utc),
    }


# ---------------------------------------------------------------------------
# Tests de build_manifest
# ---------------------------------------------------------------------------


class TestBuildManifest:
    """manifest.build_manifest(records) -> dict con la estructura exacta del spec."""

    def test_version_es_entero_uno(self):
        resultado = manifest.build_manifest([])
        assert resultado["version"] == 1
        assert isinstance(resultado["version"], int)

    def test_symbols_vacio_si_no_hay_registros(self):
        resultado = manifest.build_manifest([])
        assert resultado["symbols"] == {}

    def test_estructura_un_registro_m1(self):
        """Un registro M1 produce la clave de particion como anio string."""
        records = [_make_record("XAUUSD", "m1", "2024", size=15000, etag="abc1234567890")]
        resultado = manifest.build_manifest(records)
        assert "XAUUSD" in resultado["symbols"]
        assert "m1" in resultado["symbols"]["XAUUSD"]
        assert "2024" in resultado["symbols"]["XAUUSD"]["m1"]
        entrada = resultado["symbols"]["XAUUSD"]["m1"]["2024"]
        assert entrada["size"] == 15000
        assert entrada["etag"] == "abc1234567890"
        assert "updatedAt" in entrada

    def test_estructura_registro_h1_all(self):
        """H1 usa 'all' como clave de particion."""
        records = [_make_record("XAUUSD", "h1", "all", size=5000, etag="def987")]
        resultado = manifest.build_manifest(records)
        assert "all" in resultado["symbols"]["XAUUSD"]["h1"]

    def test_estructura_registro_d1_all(self):
        """D1 usa 'all' como clave de particion."""
        records = [_make_record("XAUUSD", "d1", "all", size=3000, etag="ghi456")]
        resultado = manifest.build_manifest(records)
        assert "all" in resultado["symbols"]["XAUUSD"]["d1"]

    def test_etag_sin_comillas(self):
        """El etag almacenado no debe tener comillas dobles."""
        records = [_make_record("XAUUSD", "m1", "2024", etag='"etag-con-comillas"')]
        resultado = manifest.build_manifest(records)
        entrada = resultado["symbols"]["XAUUSD"]["m1"]["2024"]
        assert '"' not in entrada["etag"]
        assert entrada["etag"] == "etag-con-comillas"

    def test_updated_at_formato_iso_z(self):
        """updatedAt debe ser ISO-8601 UTC con sufijo Z y sin microsegundos."""
        records = [_make_record("XAUUSD", "m1", "2024")]
        resultado = manifest.build_manifest(records)
        updated_at = resultado["symbols"]["XAUUSD"]["m1"]["2024"]["updatedAt"]
        # Debe terminar con Z
        assert updated_at.endswith("Z")
        # No debe tener microsegundos (punto seguido de digitos antes de la Z)
        assert "." not in updated_at
        # Debe ser parseable como ISO-8601
        from datetime import datetime

        dt = datetime.fromisoformat(updated_at.replace("Z", "+00:00"))
        assert dt.tzinfo is not None

    def test_multiples_simbolos_y_tfs(self):
        """Multiples simbolos y tfs se anidan correctamente."""
        records = [
            _make_record("XAUUSD", "m1", "2024", size=1000, etag="e1"),
            _make_record("XAUUSD", "m1", "2025", size=2000, etag="e2"),
            _make_record("XAUUSD", "h1", "all", size=3000, etag="e3"),
            _make_record("XAUUSD", "d1", "all", size=4000, etag="e4"),
            _make_record("EURUSD", "d1", "all", size=5000, etag="e5"),
        ]
        resultado = manifest.build_manifest(records)
        assert set(resultado["symbols"].keys()) == {"XAUUSD", "EURUSD"}
        assert set(resultado["symbols"]["XAUUSD"].keys()) == {"m1", "h1", "d1"}
        assert set(resultado["symbols"]["XAUUSD"]["m1"].keys()) == {"2024", "2025"}
        assert resultado["symbols"]["XAUUSD"]["m1"]["2025"]["size"] == 2000
        assert resultado["symbols"]["EURUSD"]["d1"]["all"]["etag"] == "e5"

    def test_size_es_int(self):
        """size debe ser un entero."""
        records = [_make_record("XAUUSD", "m1", "2024", size=99999)]
        resultado = manifest.build_manifest(records)
        size = resultado["symbols"]["XAUUSD"]["m1"]["2024"]["size"]
        assert isinstance(size, int)
        assert size == 99999

    def test_claves_de_nivel_superior(self):
        """El manifest solo debe tener 'version' y 'symbols' en el nivel raiz."""
        resultado = manifest.build_manifest([])
        assert set(resultado.keys()) == {"version", "symbols"}

    def test_updated_at_usa_el_valor_del_registro(self):
        """updatedAt debe reflejar el valor del campo updated_at del registro."""
        from datetime import datetime

        dt_especifico = datetime(2025, 3, 15, 8, 30, 45, tzinfo=timezone.utc)
        records = [
            {
                "symbol": "XAUUSD",
                "tf": "m1",
                "partition": "2024",
                "size": 100,
                "etag": "xyz",
                "updated_at": dt_especifico,
            }
        ]
        resultado = manifest.build_manifest(records)
        updated_at = resultado["symbols"]["XAUUSD"]["m1"]["2024"]["updatedAt"]
        assert updated_at == "2025-03-15T08:30:45Z"
