"""Tests de mt5_common.py contra la terminal simulada de conftest.py.

Cubren el defecto de TRUNCADO SILENCIOSO: para un simbolo que no esta visible en
el Observador de Mercado, `copy_rates_range` devuelve solo la cache local y la
cosecha termina antes de tiempo sin ningun error. Se observo con NAS100 y SP500,
que se cortaban en el 2026-06-18 mientras US30 y XAUUSD llegaban al minuto
actual, y `fill_r2.py` habria subido ese historial truncado a R2.
"""

import os
import sys
from datetime import UTC, datetime, timedelta

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from conftest import minutos

import mt5_common


def _epoch(dt_str: str) -> int:
    return int(datetime.fromisoformat(dt_str).replace(tzinfo=UTC).timestamp())


def _dt(dt_str: str) -> datetime:
    return datetime.fromisoformat(dt_str).replace(tzinfo=UTC)


UN_DIA = 1440  # velas M1 en 24 h


class TestCalentarHistorial:
    """calentar_historial(symbol, tf) fuerza la sincronizacion con el servidor."""

    def test_devuelve_el_epoch_de_la_vela_mas_reciente(self, mt5_falso):
        times = minutos(_epoch("2026-07-20 00:00"), 10)
        mt5_falso.cargar("NAS100", servidor=times)

        ultima = mt5_common.calentar_historial("NAS100", mt5_falso.TIMEFRAME_M1)

        assert ultima == times[-1]

    def test_hace_visible_el_simbolo(self, mt5_falso):
        mt5_falso.cargar("NAS100", servidor=minutos(_epoch("2026-07-20 00:00"), 5), visible=False)

        mt5_common.calentar_historial("NAS100", mt5_falso.TIMEFRAME_M1)

        assert mt5_falso.visible["NAS100"] is True

    def test_reintenta_mientras_la_terminal_no_responde(self, mt5_falso):
        times = minutos(_epoch("2026-07-20 00:00"), 5)
        mt5_falso.cargar("NAS100", servidor=times)
        mt5_falso.from_pos_vacios = 2  # las dos primeras llamadas vuelven vacias

        ultima = mt5_common.calentar_historial(
            "NAS100", mt5_falso.TIMEFRAME_M1, intentos=5, espera=0
        )

        assert ultima == times[-1]
        pedidas = [c for c in mt5_falso.llamadas if c[0] == "copy_rates_from_pos"]
        assert len(pedidas) == 3

    def test_devuelve_none_si_la_terminal_nunca_responde(self, mt5_falso):
        mt5_falso.cargar("FANTASMA", servidor=[])

        ultima = mt5_common.calentar_historial(
            "FANTASMA", mt5_falso.TIMEFRAME_M1, intentos=2, espera=0
        )

        assert ultima is None


class TestSimboloFrio:
    """El defecto: un simbolo no visible solo devolvia su cache local."""

    def test_devuelve_el_historial_completo_no_solo_la_cache(self, mt5_falso):
        # El servidor tiene 3 dias; la cache local se corto hace 2.
        servidor = minutos(_epoch("2026-07-20 00:00"), 3 * UN_DIA)
        mt5_falso.cargar(
            "NAS100",
            servidor=servidor,
            cache=servidor[:UN_DIA],
            visible=False,
        )

        rates, error = mt5_common.copiar_rango_troceado(
            "NAS100",
            mt5_falso.TIMEFRAME_M1,
            "M1",
            _dt("2026-07-20 00:00"),
            _dt("2026-07-23 00:00"),
        )

        assert error is None
        assert int(rates["time"][-1]) == servidor[-1]
        assert len(rates) == len(servidor)

    def test_calienta_antes_de_pedir_el_rango(self, mt5_falso):
        mt5_falso.cargar("NAS100", servidor=minutos(_epoch("2026-07-20 00:00"), 60))

        mt5_common.copiar_rango_troceado(
            "NAS100",
            mt5_falso.TIMEFRAME_M1,
            "M1",
            _dt("2026-07-20 00:00"),
            _dt("2026-07-20 01:00"),
        )

        nombres = [c[0] for c in mt5_falso.llamadas]
        assert "copy_rates_range" in nombres
        primer_rango = nombres.index("copy_rates_range")
        assert "symbol_select" in nombres[:primer_rango]
        assert "copy_rates_from_pos" in nombres[:primer_rango]

    def test_calienta_una_sola_vez_aunque_el_rango_se_trocee(self, mt5_falso):
        mt5_falso.maxbars = 120  # ventana de 1 h -> varios trozos
        mt5_falso.cargar("NAS100", servidor=minutos(_epoch("2026-07-20 00:00"), 5 * UN_DIA))

        mt5_common.copiar_rango_troceado(
            "NAS100",
            mt5_falso.TIMEFRAME_M1,
            "M1",
            _dt("2026-07-20 00:00"),
            _dt("2026-07-25 00:00"),
        )

        rangos = [c for c in mt5_falso.llamadas if c[0] == "copy_rates_range"]
        calientes = [c for c in mt5_falso.llamadas if c[0] == "copy_rates_from_pos"]
        assert len(rangos) > 1
        assert len(calientes) == 1


class TestCoberturaTruncada:
    """Si el rango termina mucho antes de lo que la terminal puede servir, se falla."""

    def test_lanza_cuando_el_rango_se_queda_corto(self, mt5_falso):
        # La terminal reporta velas hasta el 1-jun, pero el rango se sigue
        # cortando el 22-abr aunque el simbolo ya este caliente.
        mt5_falso.cargar("SP500", servidor=minutos(_epoch("2026-04-22 00:00"), 60 * 24 * 41))
        mt5_falso.rango_tope["SP500"] = _epoch("2026-04-22 01:00")

        with pytest.raises(mt5_common.HistorialTruncado) as exc:
            mt5_common.copiar_rango_troceado(
                "SP500",
                mt5_falso.TIMEFRAME_M1,
                "M1",
                _dt("2026-04-22 00:00"),
                _dt("2026-06-02 00:00"),
            )

        assert "SP500" in str(exc.value)

    def test_no_lanza_cuando_el_rango_llega_a_lo_que_hay(self, mt5_falso):
        """Fin de semana: la ultima vela es del viernes y `hasta` es domingo."""
        viernes = minutos(_epoch("2026-07-24 20:00"), 60)
        mt5_falso.cargar("US30", servidor=viernes)

        rates, error = mt5_common.copiar_rango_troceado(
            "US30",
            mt5_falso.TIMEFRAME_M1,
            "M1",
            _dt("2026-07-24 20:00"),
            _dt("2026-07-26 12:00"),  # domingo, 40 h despues de la ultima vela
        )

        assert error is None
        assert int(rates["time"][-1]) == viernes[-1]

    def test_no_lanza_en_una_recarga_historica(self, mt5_falso):
        """`hasta` muy anterior a lo que la terminal tiene hoy: no es truncado."""
        servidor = minutos(_epoch("2026-07-20 00:00"), 5 * UN_DIA)
        mt5_falso.cargar("US30", servidor=servidor)

        rates, error = mt5_common.copiar_rango_troceado(
            "US30",
            mt5_falso.TIMEFRAME_M1,
            "M1",
            _dt("2026-07-20 00:00"),
            _dt("2026-07-21 00:00"),
        )

        assert error is None
        assert int(rates["time"][-1]) <= _epoch("2026-07-21 00:00")

    def test_avisa_sin_fallar_cuando_se_queda_corto_por_poco(self, mt5_falso, caplog):
        """Sincronizacion aun en vuelo: se avisa, pero no se aborta la corrida.

        Con un backlog grande la terminal entrega la vela mas reciente antes de
        terminar de descargar el tramo (se observo SP500 90 min corto mientras
        US30/NAS100/XAUUSD ya estaban al dia). El siguiente pase lo recupera,
        asi que abortar seria peor que avisar.
        """
        mt5_falso.cargar("SP500", servidor=minutos(_epoch("2026-07-29 18:00"), 190))
        mt5_falso.rango_tope["SP500"] = _epoch("2026-07-29 19:40")

        with caplog.at_level("WARNING"):
            rates, _ = mt5_common.copiar_rango_troceado(
                "SP500",
                mt5_falso.TIMEFRAME_M1,
                "M1",
                _dt("2026-07-29 18:00"),
                _dt("2026-07-29 22:00"),
            )

        assert rates is not None
        assert "SP500" in caplog.text
        assert "19:40" in caplog.text

    def test_no_avisa_cuando_la_cobertura_es_completa(self, mt5_falso, caplog):
        mt5_falso.cargar("US30", servidor=minutos(_epoch("2026-07-29 18:00"), 190))

        with caplog.at_level("WARNING"):
            mt5_common.copiar_rango_troceado(
                "US30",
                mt5_falso.TIMEFRAME_M1,
                "M1",
                _dt("2026-07-29 18:00"),
                _dt("2026-07-29 22:00"),
            )

        assert caplog.text == ""

    def test_se_puede_desactivar_la_verificacion(self, mt5_falso):
        mt5_falso.cargar("SP500", servidor=minutos(_epoch("2026-04-22 00:00"), 60 * 24 * 41))
        mt5_falso.rango_tope["SP500"] = _epoch("2026-04-22 01:00")

        rates, _ = mt5_common.copiar_rango_troceado(
            "SP500",
            mt5_falso.TIMEFRAME_M1,
            "M1",
            _dt("2026-04-22 00:00"),
            _dt("2026-06-02 00:00"),
            verificar_cobertura=False,
        )

        assert rates is not None


class TestUltimoMinutoCerrado:
    """La vela M1 en formacion no debe llegar nunca a los Parquet."""

    def test_devuelve_el_inicio_del_minuto_en_curso(self, mt5_falso):
        mt5_falso.ticks["US30"] = _epoch("2026-07-29 19:21") + 34  # 19:21:34

        assert mt5_common.ultimo_minuto_cerrado("US30") == _epoch("2026-07-29 19:21")

    def test_devuelve_none_sin_tick(self, mt5_falso):
        assert mt5_common.ultimo_minuto_cerrado("SIN_TICK") is None


class TestMargenServidor:
    """`hasta` se pide en UTC real pero se compara con sellos de hora-servidor."""

    def test_extiende_el_fin_pedido(self):
        assert mt5_common.aplicar_margen_servidor(_dt("2026-07-29 16:00"), 4) == _dt(
            "2026-07-29 20:00"
        )

    def test_acepta_margen_fraccionario(self):
        assert mt5_common.aplicar_margen_servidor(_dt("2026-07-29 16:00"), 1.5) == _dt(
            "2026-07-29 17:30"
        )

    def test_margen_cero_no_cambia_nada(self):
        assert mt5_common.aplicar_margen_servidor(_dt("2026-07-29 16:00"), 0) == _dt(
            "2026-07-29 16:00"
        )

    def test_el_margen_por_defecto_cubre_el_offset_del_servidor(self):
        # El servidor va +2 h en invierno y +3 h en verano: 4 h deja holgura y
        # no hay que tocarlo cuando cambia el horario de verano.
        assert mt5_common.MARGEN_SERVIDOR_HORAS > 3


def test_ventana_troceo_no_desborda(mt5_falso):
    """maxbars enorme no debe desbordar el rango de datetime (regresion previa)."""
    mt5_falso.maxbars = 10**9
    ventana = mt5_common._ventana_troceo("H2", _dt("2024-01-01 00:00"), _dt("2026-01-01 00:00"))
    assert ventana <= timedelta(days=731)
