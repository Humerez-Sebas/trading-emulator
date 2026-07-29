# -*- coding: utf-8 -*-
"""
Logica MT5 compartida usada por el pipeline (`pipeline/parquet_builder.py` y
`pipeline/update_r2.py`). Solo funciona en Windows con la terminal MetaTrader 5
instalada y abierta (la libreria habla con el proceso de la terminal).

NOTA SOBRE LA HORA: las velas que devuelve MT5 vienen con la marca de tiempo del
SERVIDOR del broker, no en UTC real (en FivePercentOnline el servidor va +2 h en
invierno y +3 h en verano, siguiendo el horario de verano de EE.UU.). Este modulo
NO convierte nada: entrega los sellos tal cual los da la terminal, que es la
convencion con la que ya esta escrito todo lo que hay en R2.
"""

import logging
import time as _time
from datetime import datetime, timedelta, timezone

import MetaTrader5 as mt5
import numpy as np

logger = logging.getLogger(__name__)

# Por debajo de esto la diferencia es la vela en formacion o un hueco normal de
# mercado; por encima, la cosecha llego corta y hay que decirlo.
AVISO_COBERTURA_SEG = 5 * 60


# Horas que se suman al `hasta` pedido. Se pide en UTC real (datetime.now) pero
# se compara contra sellos en hora del SERVIDOR, que va por delante (+2 h en
# invierno, +3 h en verano): sin margen cada corrida se queda ~3 h corta de la
# ultima vela disponible. 4 h cubre ambos casos sin tocar nada en el cambio de
# horario, y si algun dia no bastara, la verificacion de cobertura lo cazaria.
MARGEN_SERVIDOR_HORAS = 4.0


def aplicar_margen_servidor(hasta: datetime, margen_horas: float = MARGEN_SERVIDOR_HORAS):
    """Extiende el fin del rango para cubrir el adelanto de la hora del servidor."""
    return hasta + timedelta(hours=margen_horas)


class HistorialTruncado(RuntimeError):
    """El rango cosechado termina mucho antes de lo que la terminal puede servir.

    Se lanza en vez de devolver el tramo corto en silencio: subir un historial
    truncado a R2 es una perdida de datos que nadie detecta hasta mucho despues.
    """


# Segundos por vela de cada temporalidad (para trocear descargas largas).
TF_SEGUNDOS = {
    "M1": 60,
    "M2": 120,
    "M3": 180,
    "M4": 240,
    "M5": 300,
    "M6": 360,
    "M10": 600,
    "M12": 720,
    "M15": 900,
    "M20": 1200,
    "M30": 1800,
    "H1": 3600,
    "H2": 7200,
    "H3": 10800,
    "H4": 14400,
    "H6": 21600,
    "H8": 28800,
    "H12": 43200,
    "D1": 86400,
    "W1": 604800,
    "MN1": 2592000,
}

TIMEFRAMES = {
    "M1": mt5.TIMEFRAME_M1,
    "M2": mt5.TIMEFRAME_M2,
    "M3": mt5.TIMEFRAME_M3,
    "M4": mt5.TIMEFRAME_M4,
    "M5": mt5.TIMEFRAME_M5,
    "M6": mt5.TIMEFRAME_M6,
    "M10": mt5.TIMEFRAME_M10,
    "M12": mt5.TIMEFRAME_M12,
    "M15": mt5.TIMEFRAME_M15,
    "M20": mt5.TIMEFRAME_M20,
    "M30": mt5.TIMEFRAME_M30,
    "H1": mt5.TIMEFRAME_H1,
    "H2": mt5.TIMEFRAME_H2,
    "H3": mt5.TIMEFRAME_H3,
    "H4": mt5.TIMEFRAME_H4,
    "H6": mt5.TIMEFRAME_H6,
    "H8": mt5.TIMEFRAME_H8,
    "H12": mt5.TIMEFRAME_H12,
    "D1": mt5.TIMEFRAME_D1,
    "W1": mt5.TIMEFRAME_W1,
    "MN1": mt5.TIMEFRAME_MN1,
}


def conectar() -> bool:
    """Inicializa MT5 (idempotente)."""
    return mt5.initialize()


def categoria_de(path: str) -> str:
    """Deriva la categoria del 'path' del simbolo que reporta el broker."""
    p = (path or "").lower()
    if any(k in p for k in ("forex", "fx", "major", "minor", "exotic")):
        return "Forex"
    if any(k in p for k in ("metal", "gold", "silver", "xau", "xag")):
        return "Metales"
    if any(k in p for k in ("indice", "index", "indices", "cash", "stock index")):
        return "Índices"
    if any(k in p for k in ("crypto", "cripto")):
        return "Cripto"
    if any(k in p for k in ("energ", "oil", "gas")):
        return "Energías"
    if any(k in p for k in ("share", "stock", "equit", "acciones")):
        return "Acciones"
    return "Otros"


def _ventana_troceo(tf_name: str, desde: datetime, hasta: datetime) -> timedelta:
    """Ancho de ventana para trocear copy_rates_range bajo el límite 'Máx.
    barras en gráfico' de la terminal. Un único copy_rates_range que abarque
    más velas que ese límite falla ENTERO con (-2, 'Invalid params') — por eso
    M1 desde hace un año devolvía "sin datos" aunque H1 funcionara.

    Con 'Máx. barras en gráfico' enorme (terminal sin límite real) el producto
    desborda el rango de datetime al sumarlo al cursor (OverflowError en H2+);
    se acota al rango total pedido, que de todas formas cabe en un solo trozo.
    """
    info = mt5.terminal_info()
    maxbars = info.maxbars if info and info.maxbars else 100_000
    ventana_seg = max(86_400, TF_SEGUNDOS[tf_name] * (maxbars // 2))
    rango_seg = max(86_400, int((hasta - desde).total_seconds()))
    return timedelta(seconds=min(ventana_seg, rango_seg))


def calentar_historial(symbol: str, tf, intentos: int = 5, espera: float = 1.0) -> int | None:
    """Fuerza a la terminal a sincronizar el historial del simbolo con el servidor.

    `copy_rates_range` NO dispara descarga: para un simbolo que no esta visible
    en el Observador de Mercado devuelve solo lo que haya en la cache local y la
    cosecha termina antes de tiempo SIN error (asi se perdieron NAS100 y SP500,
    cortados en el 2026-06-18 mientras US30 y XAUUSD llegaban al minuto actual).
    `copy_rates_from_pos` si la dispara, y `symbol_select` hace visible el
    simbolo, asi que se llaman ambos antes de cualquier rango.

    Devuelve el epoch de la vela mas reciente que la terminal tiene tras
    sincronizar (util para verificar la cobertura), o None si nunca respondio.
    """
    mt5.symbol_select(symbol, True)
    for intento in range(intentos):
        rates = mt5.copy_rates_from_pos(symbol, tf, 0, 1)
        if rates is not None and len(rates):
            return int(rates["time"][-1])
        if intento < intentos - 1 and espera:
            _time.sleep(espera)
    return None


def ultimo_minuto_cerrado(symbol: str) -> int | None:
    """Epoch del minuto EN FORMACION segun el ultimo tick (hora del servidor).

    Las velas con `time >= ` este valor todavia se estan formando y no deben
    llegar a los Parquet: una vela parcial contamina ademas la H1/D1 que la
    contiene. Devuelve None si no hay tick disponible.
    """
    tick = mt5.symbol_info_tick(symbol)
    if tick is None or not getattr(tick, "time", 0):
        return None
    return int(tick.time) - int(tick.time) % 60


def iter_rango_troceado(
    symbol: str,
    tf,
    tf_name: str,
    desde: datetime,
    hasta: datetime,
    *,
    verificar_cobertura: bool = True,
    tolerancia_horas: float = 24.0,
):
    """Generador: copy_rates_range troceado en ventanas, deduplicando SOLO la
    vela del borde compartido entre ventanas (no carga la serie entera en
    memoria ni hace np.unique global). Las velas llegan en orden ascendente de
    tiempo, así que basta filtrar las <= a la última ya entregada.

    Yield (rates, error) por ventana: ``rates`` es un array no vacío de velas
    NUEVAS, o None si esa ventana falló (con su ``error`` de mt5.last_error()).
    Las ventanas vacías no se emiten.

    Antes del primer rango se calienta el historial (ver :func:`calentar_historial`)
    y al terminar se verifica la cobertura: si lo cosechado se queda mas de
    ``tolerancia_horas`` por detras de lo que la terminal puede servir, se lanza
    :class:`HistorialTruncado` en vez de devolver el tramo corto en silencio.
    ``verificar_cobertura=False`` desactiva solo esa comprobacion final.
    """
    ultima_terminal = calentar_historial(symbol, tf)

    ventana = _ventana_troceo(tf_name, desde, hasta)
    cursor = desde
    ultimo_emitido = None  # epoch de la última vela ya entregada
    while cursor < hasta:
        fin = min(cursor + ventana, hasta)
        rates = mt5.copy_rates_range(symbol, tf, cursor, fin)
        cursor = fin
        if rates is None:
            yield None, mt5.last_error()
            continue
        if not len(rates):
            continue
        if ultimo_emitido is not None:
            rates = rates[rates["time"] > ultimo_emitido]
            if not len(rates):
                continue
        ultimo_emitido = int(rates["time"][-1])
        yield rates, None

    if verificar_cobertura and ultima_terminal is not None and ultimo_emitido is not None:
        # La terminal manda: si `hasta` va mas alla de su ultima vela (lo normal
        # con el margen de hora-servidor), lo exigible es su ultima vela. Asi el
        # fin de semana no dispara un falso positivo.
        limite = min(ultima_terminal, int(hasta.timestamp()))
        faltan = limite - ultimo_emitido
        if faltan > tolerancia_horas * 3600:
            fin = datetime.fromtimestamp(ultimo_emitido, timezone.utc)
            tope = datetime.fromtimestamp(limite, timezone.utc)
            raise HistorialTruncado(
                f"{symbol}: la cosecha termina en {fin:%Y-%m-%d %H:%M} pero la terminal "
                f"ya tiene velas hasta {tope:%Y-%m-%d %H:%M} (hora del servidor). "
                f"Historial incompleto: no se sube."
            )
        if faltan > AVISO_COBERTURA_SEG:
            # Con un backlog grande la terminal entrega la vela mas reciente
            # antes de acabar de descargar el tramo, asi que la cola puede
            # llegar corta. El siguiente pase la recupera (ambos scripts
            # reanudan desde lo que hay en R2), pero no debe pasar en silencio.
            logger.warning(
                "%s: la cosecha se queda %d min corta (hasta %s, la terminal ya tiene %s). "
                "Probablemente la terminal aun estaba sincronizando; el proximo pase lo completa.",
                symbol,
                faltan // 60,
                datetime.fromtimestamp(ultimo_emitido, timezone.utc).strftime("%Y-%m-%d %H:%M"),
                datetime.fromtimestamp(limite, timezone.utc).strftime("%Y-%m-%d %H:%M"),
            )


def copiar_rango_troceado(
    symbol: str,
    tf,
    tf_name: str,
    desde: datetime,
    hasta: datetime,
    *,
    verificar_cobertura: bool = True,
    tolerancia_horas: float = 24.0,
):
    """Versión eager de :func:`iter_rango_troceado`: concatena todos los trozos
    en un solo array (ya dedup'd y ordenado).
    Devuelve (rates | None, ultimo_error)."""
    trozos = []
    ultimo_error = None
    for rates, error in iter_rango_troceado(
        symbol,
        tf,
        tf_name,
        desde,
        hasta,
        verificar_cobertura=verificar_cobertura,
        tolerancia_horas=tolerancia_horas,
    ):
        if error is not None:
            ultimo_error = error
        elif rates is not None and len(rates):
            trozos.append(rates)
    if not trozos:
        return None, ultimo_error
    return np.concatenate(trozos), ultimo_error
