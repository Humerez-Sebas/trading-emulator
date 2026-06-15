# -*- coding: utf-8 -*-
"""
Logica MT5 compartida entre el helper local (`datasource_api.py`) y el
harvester del backend (`backend/harvester.py`). Solo funciona en Windows con
la terminal MetaTrader 5 instalada y abierta (la libreria habla con el
proceso de la terminal).
"""
from datetime import datetime, timedelta

import MetaTrader5 as mt5
import numpy as np

# Segundos por vela de cada temporalidad (para trocear descargas largas).
TF_SEGUNDOS = {
    "M1": 60, "M2": 120, "M3": 180, "M4": 240, "M5": 300, "M6": 360,
    "M10": 600, "M12": 720, "M15": 900, "M20": 1200, "M30": 1800,
    "H1": 3600, "H2": 7200, "H3": 10800, "H4": 14400, "H6": 21600,
    "H8": 28800, "H12": 43200, "D1": 86400, "W1": 604800, "MN1": 2592000,
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


def iter_rango_troceado(symbol: str, tf, tf_name: str, desde: datetime, hasta: datetime):
    """Generador: copy_rates_range troceado en ventanas, deduplicando SOLO la
    vela del borde compartido entre ventanas (no carga la serie entera en
    memoria ni hace np.unique global). Las velas llegan en orden ascendente de
    tiempo, así que basta filtrar las <= a la última ya entregada.

    Yield (rates, error) por ventana: ``rates`` es un array no vacío de velas
    NUEVAS, o None si esa ventana falló (con su ``error`` de mt5.last_error()).
    Las ventanas vacías no se emiten.
    """
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


def copiar_rango_troceado(symbol: str, tf, tf_name: str, desde: datetime, hasta: datetime):
    """Versión eager de :func:`iter_rango_troceado`: concatena todos los trozos
    en un solo array (ya dedup'd y ordenado). La usa ``datasource_api.py``.
    Devuelve (rates | None, ultimo_error)."""
    trozos = []
    ultimo_error = None
    for rates, error in iter_rango_troceado(symbol, tf, tf_name, desde, hasta):
        if error is not None:
            ultimo_error = error
        elif rates is not None and len(rates):
            trozos.append(rates)
    if not trozos:
        return None, ultimo_error
    return np.concatenate(trozos), ultimo_error
