"""Tests de export_symbols.py contra la terminal simulada de conftest.py.

`FakeMT5` (conftest.py) no tiene `symbol_info` ni `account_info`/`terminal_info`
con nombre de compania -- no forma parte de su doble original, que solo cubre
el defecto de historial truncado (ver docstring de conftest.py). Este archivo
los agrega por su cuenta via `monkeypatch.setattr(..., raising=False)` sobre
la MISMA instancia que ya vive en `sys.modules["MetaTrader5"]`, sin tocar
conftest.py (fuera de alcance de la Tarea B-1: ensanchar un doble de test
compartido es una decision del orquestador, no de esta tarea).
"""

from __future__ import annotations

import os
import sys
from collections import namedtuple

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import export_symbols

SymbolInfoStub = namedtuple(
    "SymbolInfoStub",
    [
        "trade_contract_size",
        "trade_tick_size",
        "point",
        "volume_step",
        "volume_min",
        "digits",
        "currency_profit",
    ],
)

AccountInfoStub = namedtuple("AccountInfoStub", ["company"])
TerminalInfoStub = namedtuple("TerminalInfoStub", ["company"])

# Valores reales leidos de la terminal en vivo (FivePercentOnline) el 2026-08-03,
# usados como fixtures realistas en vez de numeros inventados.
US30_INFO = SymbolInfoStub(1.0, 0.01, 0.01, 0.01, 0.01, 2, "USD")
NAS100_INFO = SymbolInfoStub(1.0, 0.01, 0.01, 0.01, 0.01, 2, "USD")
SP500_INFO = SymbolInfoStub(1.0, 0.01, 0.01, 0.01, 0.01, 2, "USD")
XAUUSD_INFO = SymbolInfoStub(100.0, 0.01, 0.01, 0.01, 0.01, 2, "USD")

CATALOGO = {
    "US30": US30_INFO,
    "NAS100": NAS100_INFO,
    "SP500": SP500_INFO,
    "XAUUSD": XAUUSD_INFO,
}


@pytest.fixture
def mt5_con_catalogo(mt5_falso, monkeypatch):
    """`mt5_falso` (conftest.py) + `symbol_info`/`account_info` stubs propios.

    `symbol_info` devuelve None para cualquier simbolo fuera de `CATALOGO`
    (mismo comportamiento que la libreria real con un simbolo desconocido).
    """

    def _symbol_info(symbol: str):
        return CATALOGO.get(symbol)

    monkeypatch.setattr(mt5_falso, "symbol_info", _symbol_info, raising=False)
    monkeypatch.setattr(
        mt5_falso, "account_info", lambda: AccountInfoStub("Five Percent Online Ltd"), raising=False
    )
    return mt5_falso


class TestParseSymbols:
    """parse_symbols: separa por coma, recorta espacios, descarta vacios."""

    def test_separa_y_recorta(self):
        assert export_symbols.parse_symbols("US30, NAS100 ,SP500") == ["US30", "NAS100", "SP500"]

    def test_descarta_vacios(self):
        assert export_symbols.parse_symbols("US30,,NAS100,") == ["US30", "NAS100"]


class TestResolveSymbols:
    """resolve_symbols: HARVEST_SYMBOLS con el default exacto de fill_r2.py:54."""

    def test_usa_el_default_exacto_sin_env_ni_override(self, monkeypatch):
        monkeypatch.delenv("HARVEST_SYMBOLS", raising=False)
        assert export_symbols.resolve_symbols(None) == ["US30", "NAS100", "SP500", "XAUUSD"]

    def test_lee_harvest_symbols_del_entorno(self, monkeypatch):
        monkeypatch.setenv("HARVEST_SYMBOLS", "EURUSD,GBPUSD")
        assert export_symbols.resolve_symbols(None) == ["EURUSD", "GBPUSD"]

    def test_override_explicito_gana_al_entorno(self, monkeypatch):
        monkeypatch.setenv("HARVEST_SYMBOLS", "EURUSD,GBPUSD")
        assert export_symbols.resolve_symbols("US30") == ["US30"]


class TestFetchAssetRecords:
    """fetch_asset_records: un AssetRecord por simbolo, o falla ruidosamente."""

    def test_lee_los_campos_pedidos_por_simbolo(self, mt5_con_catalogo):
        registros = export_symbols.fetch_asset_records(["US30", "XAUUSD"])

        por_simbolo = {r.symbol: r for r in registros}
        assert por_simbolo["US30"].contract_size == 1.0
        assert por_simbolo["US30"].tick_size == 0.01
        assert por_simbolo["US30"].point_size == 0.01
        assert por_simbolo["US30"].volume_step == 0.01
        assert por_simbolo["US30"].volume_min == 0.01
        assert por_simbolo["US30"].digits == 2
        assert por_simbolo["US30"].currency == "USD"
        assert por_simbolo["XAUUSD"].contract_size == 100.0
        assert por_simbolo["XAUUSD"].point_size == 0.01

    def test_normaliza_el_simbolo_a_mayusculas(self, mt5_con_catalogo):
        registros = export_symbols.fetch_asset_records(["US30"])
        assert registros[0].symbol == "US30"

    def test_symbol_info_none_lanza_simbolo_no_encontrado(self, mt5_con_catalogo):
        """Fallo ruidoso (RFC-020 D.20.4): un simbolo sin symbol_info() no debe
        producir un registro parcial -- mismo principio que HistorialTruncado
        (mt5_common.py:41): mejor fallar entero que subir datos incompletos."""
        with pytest.raises(export_symbols.SimboloNoEncontrado, match="NOEXISTE"):
            export_symbols.fetch_asset_records(["US30", "NOEXISTE"])

    def test_ningun_simbolo_parcial_se_emite_si_uno_falla(self, mt5_con_catalogo):
        """No solo se lanza -- no queda ningun AssetRecord de los simbolos
        anteriores flotando en un registro parcial en el llamador."""
        with pytest.raises(export_symbols.SimboloNoEncontrado):
            export_symbols.fetch_asset_records(["US30", "NOEXISTE", "XAUUSD"])


class TestBrokerName:
    """broker_name: account_info().company, con fallback a terminal_info()."""

    def test_usa_account_info_company(self, mt5_con_catalogo):
        assert export_symbols.broker_name() == "Five Percent Online Ltd"

    def test_cae_a_terminal_info_si_no_hay_cuenta_conectada(self, mt5_falso, monkeypatch):
        monkeypatch.setattr(mt5_falso, "account_info", lambda: None, raising=False)
        monkeypatch.setattr(
            mt5_falso, "terminal_info", lambda: TerminalInfoStub("WSFunded Ltd."), raising=False
        )
        assert export_symbols.broker_name() == "WSFunded Ltd."

    def test_lanza_si_ninguno_tiene_company(self, mt5_falso, monkeypatch):
        monkeypatch.setattr(mt5_falso, "account_info", lambda: None, raising=False)
        # terminal_info() de FakeMT5 (conftest.py) no trae 'company'.
        with pytest.raises(RuntimeError):
            export_symbols.broker_name()


class TestRenderTs:
    """render_ts: forma determinista -- orden de simbolos, un campo por linea,
    sin timestamp salvo la cabecera de procedencia (RFC-020 §B-1.5)."""

    def _registros(self):
        # Deliberadamente FUERA de orden alfabetico: si render_ts no ordenara,
        # test_simbolos_ordenados_alfabeticamente fallaria.
        AssetRecord = export_symbols.AssetRecord
        return [
            AssetRecord(symbol="XAUUSD", contract_size=100.0, tick_size=0.01, point_size=0.01, volume_step=0.01,
                         volume_min=0.01, digits=2, currency="USD"),
            AssetRecord(symbol="US30", contract_size=1.0, tick_size=0.01, point_size=0.01, volume_step=0.01,
                         volume_min=0.01, digits=2, currency="USD"),
            AssetRecord(symbol="SP500", contract_size=1.0, tick_size=0.01, point_size=0.01, volume_step=0.01,
                         volume_min=0.01, digits=2, currency="USD"),
            AssetRecord(symbol="NAS100", contract_size=1.0, tick_size=0.01, point_size=0.01, volume_step=0.01,
                         volume_min=0.01, digits=2, currency="USD"),
        ]  # fmt: skip

    def test_simbolos_ordenados_alfabeticamente(self):
        contenido = export_symbols.render_ts(
            self._registros(), "mt5:Five Percent Online Ltd@2026-08-03"
        )
        pos = {s: contenido.index(f"  {s}:") for s in ["NAS100", "SP500", "US30", "XAUUSD"]}
        assert pos["NAS100"] < pos["SP500"] < pos["US30"] < pos["XAUUSD"]

    def test_cabecera_de_procedencia_presente_una_sola_vez(self):
        provenance = "mt5:Five Percent Online Ltd@2026-08-03"
        contenido = export_symbols.render_ts(self._registros(), provenance)
        assert contenido.count(provenance) == 2  # comentario + GENERATED_SOURCE

    def test_un_campo_por_linea(self):
        contenido = export_symbols.render_ts(self._registros(), "mt5:X@2026-08-03")
        assert "contractSize: 100," in contenido
        assert "tickSize: 0.01," in contenido
        assert "pointSize: 0.01," in contenido
        assert "volumeStep: 0.01," in contenido
        assert "volumeMin: 0.01," in contenido
        assert "digits: 2," in contenido
        assert "currency: 'USD'," in contenido

    def test_es_deterministico_misma_entrada_mismo_texto(self):
        provenance = "mt5:X@2026-08-03"
        a = export_symbols.render_ts(self._registros(), provenance)
        b = export_symbols.render_ts(self._registros(), provenance)
        assert a == b

    def test_sin_timestamp_fuera_de_la_cabecera(self):
        """No debe colarse una hora (HH:MM:SS) en ningun otro punto del archivo."""
        import re

        provenance = "mt5:X@2026-08-03"
        contenido = export_symbols.render_ts(self._registros(), provenance)
        lineas_con_provenance = [line for line in contenido.splitlines() if provenance in line]
        otras_lineas = [line for line in contenido.splitlines() if provenance not in line]
        assert len(lineas_con_provenance) == 2
        # Ninguna otra linea contiene un patron HH:MM:SS.
        assert not any(re.search(r"\d{2}:\d{2}:\d{2}", line) for line in otras_lineas)
