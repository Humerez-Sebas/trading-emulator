# -*- coding: utf-8 -*-
"""
Pipeline M1 -> Parquet (componente de la arquitectura offline v2).

COEXISTE con backend/harvester.py (que postea JSON al backend FastAPI); este
modulo genera archivos Parquet locales para subir despues a Cloudflare R2.

Flujo:
  1. Llama a mt5_common.copiar_rango_troceado para obtener velas M1 desde MT5.
  2. resample_anchors: remuestrea M1 a H1 y D1 de forma pura (sin MT5).
  3. write_anchors: escribe los tres anchors como Parquet con Snappy.
     - M1 particionado por anio UTC: <out>/<symbol>/m1/<year>.parquet
     - H1: <out>/<symbol>/h1/all.parquet
     - D1: <out>/<symbol>/d1/all.parquet

La separacion pura/orquestador facilita los tests sin MT5.
"""

from __future__ import annotations

import logging
import os
from datetime import datetime, timezone

import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq

logger = logging.getLogger(__name__)

# Esquema Parquet: coincide con el modelo Candle de la app (sin volumen).
_SCHEMA = pa.schema(
    [
        pa.field("time", pa.int64()),
        pa.field("open", pa.float64()),
        pa.field("high", pa.float64()),
        pa.field("low", pa.float64()),
        pa.field("close", pa.float64()),
    ]
)

# Parametros de remuestreo pandas para agregacion OHLC.
_OHLC_AGG = {"open": "first", "high": "max", "low": "min", "close": "last"}


# ---------------------------------------------------------------------------
# Funciones puras (sin side-effects de MT5)
# ---------------------------------------------------------------------------


def resample_anchors(df_m1: pd.DataFrame) -> dict[str, pd.DataFrame]:
    """Remuestrea un DataFrame M1 a M1, H1 y D1.

    Parametros
    ----------
    df_m1:
        DataFrame con columnas ``time`` (int64, epoch segundos UTC),
        ``open``, ``high``, ``low``, ``close`` (float64). La columna ``time``
        NO necesita ser el indice; se convierte internamente.

    Devuelve
    --------
    dict con claves 'M1', 'H1', 'D1'. Cada valor es un DataFrame con las
    mismas cinco columnas (``time`` vuelve a ser int64 epoch segundos).
    Los huecos de fin de semana/festivos NO generan filas (dropna).
    """
    # Construir DatetimeIndex UTC a partir de la columna time (epoch segundos).
    idx = pd.to_datetime(df_m1["time"], unit="s", utc=True)
    df = df_m1[["open", "high", "low", "close"]].copy()
    df.index = idx

    def _resample_tf(rule: str) -> pd.DataFrame:
        resampled = df.resample(rule, label="left", closed="left").agg(_OHLC_AGG).dropna()
        # Convertir el DatetimeIndex de vuelta a epoch segundos int64.
        resampled.insert(
            0,
            "time",
            resampled.index.asi8,
        )
        resampled = resampled.reset_index(drop=True)
        return resampled[["time", "open", "high", "low", "close"]]

    # M1 no necesita remuestreo; solo reconvertimos el tiempo.
    m1 = df_m1[["time", "open", "high", "low", "close"]].copy().reset_index(drop=True)
    m1["time"] = m1["time"].astype("int64")

    return {
        "M1": m1,
        "H1": _resample_tf("1h"),
        "D1": _resample_tf("1D"),
    }


def write_anchors(
    anchors: dict[str, pd.DataFrame],
    symbol: str,
    out_dir: str,
) -> list[str]:
    """Escribe los anchors como Parquet (compresion Snappy) en el directorio de salida.

    Layout de archivos (los nombres de directorio en minusculas coinciden con
    las claves del manifest que usara Task 2):
      <out_dir>/<symbol>/m1/<year>.parquet   (M1 particionado por anio UTC)
      <out_dir>/<symbol>/h1/all.parquet
      <out_dir>/<symbol>/d1/all.parquet

    Devuelve la lista de rutas absolutas escritas.
    """
    rutas: list[str] = []

    # -- M1: particion por anio UTC ------------------------------------------
    df_m1 = anchors["M1"]
    if df_m1.empty:
        logger.warning("write_anchors: %s M1 vacio, no se escribe", symbol)
    else:
        anios = pd.to_datetime(df_m1["time"], unit="s", utc=True).dt.year
        for anio, grupo in df_m1.groupby(anios):
            dir_m1 = os.path.join(out_dir, symbol, "m1")
            os.makedirs(dir_m1, exist_ok=True)
            ruta = os.path.join(dir_m1, f"{anio}.parquet")
            tabla = pa.Table.from_pandas(
                grupo.reset_index(drop=True), schema=_SCHEMA, preserve_index=False
            )
            pq.write_table(tabla, ruta, compression="snappy")
            rutas.append(ruta)

    # -- H1 y D1: todo en all.parquet ----------------------------------------
    for tf_key, tf_dir in [("H1", "h1"), ("D1", "d1")]:
        df_tf = anchors[tf_key]
        if df_tf.empty:
            logger.warning("write_anchors: %s %s vacio, se omite", symbol, tf_key)
            continue
        dir_tf = os.path.join(out_dir, symbol, tf_dir)
        os.makedirs(dir_tf, exist_ok=True)
        ruta = os.path.join(dir_tf, "all.parquet")
        tabla = pa.Table.from_pandas(
            df_tf.reset_index(drop=True), schema=_SCHEMA, preserve_index=False
        )
        pq.write_table(tabla, ruta, compression="snappy")
        rutas.append(ruta)

    return rutas


# ---------------------------------------------------------------------------
# Orquestador (unica parte que toca MT5)
# ---------------------------------------------------------------------------


def harvest_to_parquet(
    symbol: str,
    desde: datetime,
    hasta: datetime,
    out_dir: str,
) -> list[str]:
    """Cosecha M1 de MT5, remuestrea a H1/D1 y escribe los Parquet.

    Requiere MetaTrader5 instalado y la terminal abierta. Solo se importa
    mt5_common aqui (no en el nivel de modulo) para que las funciones puras
    sean importables sin MT5.

    Devuelve la lista de rutas escritas o lanza RuntimeError si MT5 falla.
    """
    import sys as _sys

    # mt5_common vive en la raiz del proyecto (un nivel por encima de backend/).
    _root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    if _root not in _sys.path:
        _sys.path.insert(0, _root)

    from mt5_common import TIMEFRAMES, conectar, copiar_rango_troceado  # noqa: PLC0415

    if not conectar():
        import MetaTrader5 as mt5  # noqa: PLC0415

        raise RuntimeError(f"MT5 no disponible: {mt5.last_error()}")

    rates, error = copiar_rango_troceado(symbol, TIMEFRAMES["M1"], "M1", desde, hasta)
    if rates is None:
        raise RuntimeError(f"Sin datos M1 para {symbol}: {error}")

    df_m1 = pd.DataFrame(
        {
            "time": rates["time"].astype("int64"),
            "open": rates["open"].astype("float64"),
            "high": rates["high"].astype("float64"),
            "low": rates["low"].astype("float64"),
            "close": rates["close"].astype("float64"),
        }
    )

    anchors = resample_anchors(df_m1)
    return write_anchors(anchors, symbol, out_dir)


# ---------------------------------------------------------------------------
# Entrada de linea de comandos (minima, para uso manual)
# ---------------------------------------------------------------------------


def _main() -> None:
    import argparse

    parser = argparse.ArgumentParser(
        description="Cosecha velas M1 de MT5 y escribe Parquet locales"
    )
    parser.add_argument("--symbol", required=True, help="Simbolo MT5 (p.ej. XAUUSD)")
    parser.add_argument("--desde", default="2024-01-01", help="Fecha inicio YYYY-MM-DD (UTC)")
    parser.add_argument("--hasta", default=None, help="Fecha fin YYYY-MM-DD (UTC); defecto: hoy")
    parser.add_argument("--out-dir", default="parquet_out", help="Directorio de salida")
    args = parser.parse_args()

    desde = datetime.fromisoformat(args.desde).replace(tzinfo=timezone.utc)
    hasta = (
        datetime.fromisoformat(args.hasta).replace(tzinfo=timezone.utc)
        if args.hasta
        else datetime.now(tz=timezone.utc)
    )

    rutas = harvest_to_parquet(args.symbol, desde, hasta, args.out_dir)
    for ruta in rutas:
        print(ruta)


if __name__ == "__main__":
    _main()
