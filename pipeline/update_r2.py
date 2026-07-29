# -*- coding: utf-8 -*-
"""
Actualizacion INCREMENTAL de las velas en R2 (MT5 -> Parquet -> R2).

A diferencia de `fill_r2.py` (que recosecha TODO el rango y reescribe los
Parquet completos), este script:

  1. Lee de R2 el ultimo timestamp M1 existente por simbolo.
  2. Cosecha de MT5 SOLO desde el inicio del dia de esa ultima vela hasta ahora
     (el dia entero, para poder recomputar sin sesgo la ultima H1/D1 que habia
     quedado parcial).
  3. Descarga de R2 los Parquet afectados (m1/<anio>, h1/all, d1/all), fusiona
     por 'time' (gana lo nuevo), reordena y reescribe SOLO esos archivos.
     - H1/D1 se recomputan desde el M1 fusionado en la ventana afectada y se
       empalman al historico (el corte cae en frontera de dia, asi que ningun
       bucket queda partido).
  4. Sube unicamente los archivos tocados y PARCHEA manifest.json (las entradas
     no tocadas -- p.ej. m1/2024, m1/2025 -- conservan su size/etag/updatedAt).

Para la carga INICIAL de un simbolo sigue usandose `fill_r2.py`.

CORRE EN EL HOST WINDOWS con la terminal MT5 abierta.

Uso::
    py pipeline/update_r2.py --env C:/ruta/al/.env --skip-upload   # valida
    py pipeline/update_r2.py --env C:/ruta/al/.env                 # sube
"""

from __future__ import annotations

import argparse
import io
import json
import logging
import os
import sys
from datetime import datetime, timezone
from typing import Any

import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq

# pipeline/ en el path para importar los modulos hermanos.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import fill_r2  # noqa: E402
import manifest as manifest_mod  # noqa: E402
import parquet_builder  # noqa: E402
import r2_uploader  # noqa: E402

logger = logging.getLogger("update_r2")

_MARKET_DATA_PREFIX = "market-data/v1"


# ---------------------------------------------------------------------------
# Helpers puros
# ---------------------------------------------------------------------------


def merge_por_tiempo(viejo: pd.DataFrame, nuevo: pd.DataFrame) -> pd.DataFrame:
    """Fusiona dos frames OHLC por 'time'; en empate gana la fila NUEVA."""
    combinado = pd.concat([viejo, nuevo], ignore_index=True)
    combinado = (
        combinado.drop_duplicates(subset="time", keep="last")
        .sort_values("time")
        .reset_index(drop=True)
    )
    combinado["time"] = combinado["time"].astype("int64")
    return combinado[["time", "open", "high", "low", "close"]]


def empalmar(historico: pd.DataFrame, recomputado: pd.DataFrame, corte: int) -> pd.DataFrame:
    """Conserva el historico anterior al 'corte' y le pega el tramo recomputado."""
    cabeza = historico[historico["time"] < corte]
    return merge_por_tiempo(cabeza, recomputado)


def inicio_de_dia_utc(epoch_s: int) -> datetime:
    """Medianoche del dia al que pertenece 'epoch_s'.

    Los sellos vienen en hora del SERVIDOR del broker, asi que esta medianoche
    es el inicio del dia del servidor: exactamente donde empiezan los buckets D1
    que ya estan guardados, que es lo que hace seguro cortar aqui.
    """
    dt = datetime.fromtimestamp(epoch_s, tz=timezone.utc)
    return dt.replace(hour=0, minute=0, second=0, microsecond=0)


# ---------------------------------------------------------------------------
# R2 IO
# ---------------------------------------------------------------------------


def leer_parquet_r2(client: Any, bucket: str, key: str) -> pd.DataFrame | None:
    """Descarga un Parquet de R2 como DataFrame; None si la clave no existe."""
    try:
        cuerpo = client.get_object(Bucket=bucket, Key=key)["Body"].read()
    except client.exceptions.NoSuchKey:
        return None
    except Exception as exc:  # noqa: BLE001
        if "NoSuchKey" in type(exc).__name__ or "404" in str(exc):
            return None
        raise
    df = pq.read_table(io.BytesIO(cuerpo)).to_pandas()
    df["time"] = df["time"].astype("int64")
    return df[["time", "open", "high", "low", "close"]]


def escribir_parquet(df: pd.DataFrame, ruta: str, schema: pa.Schema) -> None:
    os.makedirs(os.path.dirname(ruta), exist_ok=True)
    tabla = pa.Table.from_pandas(df.reset_index(drop=True), schema=schema, preserve_index=False)
    pq.write_table(tabla, ruta, compression="snappy")


# ---------------------------------------------------------------------------
# Cosecha MT5 (unica parte que toca la terminal)
# ---------------------------------------------------------------------------


def cosechar_m1(symbol: str, desde: datetime, hasta: datetime) -> pd.DataFrame:
    """Trae el tramo M1 que falta, ya sin la vela en formacion.

    El calentado del historial (imprescindible para simbolos que no estan en el
    Observador de Mercado) y la verificacion de cobertura los hace
    `mt5_common.copiar_rango_troceado`.
    """
    import MetaTrader5 as mt5  # noqa: PLC0415

    from mt5_common import (  # noqa: PLC0415
        TIMEFRAMES,
        conectar,
        copiar_rango_troceado,
        ultimo_minuto_cerrado,
    )

    if not conectar():
        raise RuntimeError(f"MT5 no disponible: {mt5.last_error()}")

    rates, error = copiar_rango_troceado(symbol, TIMEFRAMES["M1"], "M1", desde, hasta)
    if rates is None or not len(rates):
        raise RuntimeError(f"Sin datos M1 nuevos para {symbol}: {error}")

    df = pd.DataFrame(
        {
            "time": rates["time"].astype("int64"),
            "open": rates["open"].astype("float64"),
            "high": rates["high"].astype("float64"),
            "low": rates["low"].astype("float64"),
            "close": rates["close"].astype("float64"),
        }
    )
    df = parquet_builder.descartar_vela_en_formacion(df, ultimo_minuto_cerrado(symbol))

    if df.empty:
        raise RuntimeError(f"Sin velas M1 cerradas nuevas para {symbol}")

    return df.reset_index(drop=True)


# ---------------------------------------------------------------------------
# Orquestacion por simbolo
# ---------------------------------------------------------------------------


def actualizar_simbolo(
    symbol: str,
    client: Any,
    bucket: str,
    out_dir: str,
    hasta: datetime,
    schema: pa.Schema,
    resample_anchors,
) -> dict[str, Any]:
    """Fusiona el tramo faltante de un simbolo y deja los Parquet tocados en out_dir."""
    resumen: dict[str, Any] = {"symbol": symbol, "archivos": [], "nuevas_m1": 0}

    # -- 1) estado actual en R2 ----------------------------------------------
    anio_actual = hasta.year
    m1_por_anio: dict[int, pd.DataFrame] = {}
    for anio in range(anio_actual - 1, anio_actual + 1):
        df = leer_parquet_r2(client, bucket, f"{_MARKET_DATA_PREFIX}/{symbol}/m1/{anio}.parquet")
        if df is not None and not df.empty:
            m1_por_anio[anio] = df

    if not m1_por_anio:
        raise RuntimeError(
            f"{symbol}: no hay m1 previo en R2 para {anio_actual - 1}/{anio_actual} "
            f"-> usa pipeline/fill_r2.py para la carga inicial"
        )

    ultima_m1 = max(int(df["time"].max()) for df in m1_por_anio.values())
    corte = int(inicio_de_dia_utc(ultima_m1).timestamp())
    resumen["ultima_previa"] = datetime.fromtimestamp(ultima_m1, timezone.utc)
    resumen["desde"] = datetime.fromtimestamp(corte, timezone.utc)

    if ultima_m1 >= int(hasta.timestamp()):
        resumen["sin_cambios"] = True
        return resumen

    # -- 2) cosecha MT5 del tramo faltante -----------------------------------
    nuevas = cosechar_m1(symbol, resumen["desde"], hasta)
    nuevas = nuevas[nuevas["time"] >= corte]
    resumen["nuevas_m1"] = int((nuevas["time"] > ultima_m1).sum())
    resumen["ultima_nueva"] = datetime.fromtimestamp(int(nuevas["time"].max()), timezone.utc)

    # -- 3) M1: fusion por particion de anio ---------------------------------
    anios_nuevos = sorted(pd.to_datetime(nuevas["time"], unit="s", utc=True).dt.year.unique())
    m1_fusionado_por_anio: dict[int, pd.DataFrame] = {}
    for anio in anios_nuevos:
        tramo = nuevas[pd.to_datetime(nuevas["time"], unit="s", utc=True).dt.year == anio]
        base = m1_por_anio.get(anio)
        if base is None:
            base = leer_parquet_r2(
                client, bucket, f"{_MARKET_DATA_PREFIX}/{symbol}/m1/{anio}.parquet"
            )
        if base is None:
            base = tramo.iloc[0:0]
        fusion = merge_por_tiempo(base, tramo)
        m1_fusionado_por_anio[int(anio)] = fusion
        ruta = os.path.join(out_dir, symbol, "m1", f"{anio}.parquet")
        escribir_parquet(fusion, ruta, schema)
        resumen["archivos"].append(
            {
                "ruta": ruta,
                "filas_antes": 0 if base is None else len(base),
                "filas_despues": len(fusion),
            }
        )

    # -- 4) H1/D1: recomputar la ventana afectada y empalmar -----------------
    #    La ventana arranca en frontera de dia -> ningun bucket queda partido.
    m1_ventana = pd.concat(
        [df[df["time"] >= corte] for df in m1_fusionado_por_anio.values()], ignore_index=True
    ).sort_values("time")
    anchors = resample_anchors(m1_ventana)

    for tf_key, tf_dir in (("H1", "h1"), ("D1", "d1")):
        historico = leer_parquet_r2(
            client, bucket, f"{_MARKET_DATA_PREFIX}/{symbol}/{tf_dir}/all.parquet"
        )
        if historico is None:
            historico = anchors[tf_key].iloc[0:0]
        fusion = empalmar(historico, anchors[tf_key], corte)
        ruta = os.path.join(out_dir, symbol, tf_dir, "all.parquet")
        escribir_parquet(fusion, ruta, schema)
        resumen["archivos"].append(
            {"ruta": ruta, "filas_antes": len(historico), "filas_despues": len(fusion)}
        )

    return resumen


# ---------------------------------------------------------------------------
# Manifest (parcheo, no reconstruccion)
# ---------------------------------------------------------------------------


def parchear_manifest(
    client: Any,
    bucket: str,
    records: list[dict[str, Any]],
    backup_path: str,
) -> dict[str, Any]:
    """Mezcla los registros subidos sobre el manifest existente.

    Reconstruirlo entero borraria las entradas de las particiones que este
    script no toca (m1/2024, m1/2025...), que siguen estando en el bucket.
    """
    try:
        crudo = client.get_object(Bucket=bucket, Key="manifest.json")["Body"].read()
        actual = json.loads(crudo)
        with open(backup_path, "wb") as fh:
            fh.write(crudo)
        logger.info("manifest.json previo respaldado en %s", backup_path)
    except Exception:  # noqa: BLE001 — sin manifest previo se crea uno nuevo
        actual = {"version": 1, "symbols": {}}

    nuevo = manifest_mod.build_manifest(records)
    for sym, tfs in nuevo["symbols"].items():
        for tf, parts in tfs.items():
            actual.setdefault("symbols", {}).setdefault(sym, {}).setdefault(tf, {}).update(parts)
    actual["version"] = 1

    cuerpo = json.dumps(actual, indent=2, ensure_ascii=False).encode("utf-8")
    client.put_object(Bucket=bucket, Key="manifest.json", Body=cuerpo)
    logger.info("manifest.json actualizado (%d bytes)", len(cuerpo))
    return actual


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def main() -> None:
    import mt5_common  # noqa: PLC0415

    parser = argparse.ArgumentParser(description="Actualizacion incremental de velas en R2")
    parser.add_argument(
        "--symbols",
        default=os.environ.get("HARVEST_SYMBOLS", "US30,NAS100,SP500,XAUUSD"),
        help="Lista de simbolos MT5 separados por coma",
    )
    parser.add_argument(
        "--out-dir", default="parquet_update", help="Directorio de Parquet fusionados"
    )
    parser.add_argument("--hasta", default=None, help="YYYY-MM-DD; defecto: ahora")
    parser.add_argument("--env", default=None, help="Ruta a un .env con credenciales R2 (opcional)")
    parser.add_argument(
        "--margen-horas",
        type=float,
        default=mt5_common.MARGEN_SERVIDOR_HORAS,
        help=(
            "Horas que se suman a --hasta. Las velas de MT5 llevan hora del "
            "SERVIDOR del broker (+2 h en invierno, +3 h en verano); sin margen "
            "cada corrida se corta ~3 h antes de la ultima vela disponible"
        ),
    )
    parser.add_argument("--skip-upload", action="store_true", help="Fusiona local, no sube a R2")
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")

    if args.env:
        fill_r2.load_dotenv(args.env)

    config = r2_uploader.load_config()
    bucket = config["R2_BUCKET_NAME"]
    client = r2_uploader.build_r2_client(config)

    hasta = mt5_common.aplicar_margen_servidor(
        datetime.fromisoformat(args.hasta).replace(tzinfo=timezone.utc)
        if args.hasta
        else datetime.now(tz=timezone.utc),
        args.margen_horas,
    )
    symbols = [s.strip() for s in args.symbols.split(",") if s.strip()]

    print(
        f"=== bucket '{bucket}' | hasta {hasta:%Y-%m-%d %H:%M} "
        f"(margen {args.margen_horas:g} h por la hora del servidor) ===",
        flush=True,
    )

    resumenes = []
    fallidos: list[tuple[str, str]] = []
    for sym in symbols:
        print(f"\n--- {sym} ---", flush=True)
        try:
            r = actualizar_simbolo(
                sym,
                client,
                bucket,
                args.out_dir,
                hasta,
                parquet_builder._SCHEMA,
                parquet_builder.resample_anchors,
            )
        except Exception as exc:  # noqa: BLE001 — un simbolo no aborta los demas
            print(f"  FALLO: {exc}", flush=True)
            fallidos.append((sym, str(exc)))
            continue
        resumenes.append(r)
        if r.get("sin_cambios"):
            print(f"  ya al dia (ultima {r['ultima_previa']:%Y-%m-%d %H:%M})", flush=True)
            continue
        print(
            f"  ultima previa en R2: {r['ultima_previa']:%Y-%m-%d %H:%M} -> "
            f"nueva: {r['ultima_nueva']:%Y-%m-%d %H:%M}  (+{r['nuevas_m1']:,} velas M1)",
            flush=True,
        )
        for a in r["archivos"]:
            print(
                f"    {os.path.relpath(a['ruta'], args.out_dir)}: "
                f"{a['filas_antes']:,} -> {a['filas_despues']:,} filas",
                flush=True,
            )

    if fallidos:
        print("\nSimbolos con fallo:", flush=True)
        for n, e in fallidos:
            print(f"  - {n}: {e}", flush=True)

    if not resumenes or all(r.get("sin_cambios") for r in resumenes):
        print("\nNada que subir.", flush=True)
        return

    if args.skip_upload:
        print(
            f"\n--skip-upload: Parquet fusionados en {args.out_dir}, no se subio nada.",
            flush=True,
        )
        return

    print("\n=== subiendo archivos tocados a R2 ===", flush=True)
    records = r2_uploader.upload_parquet_tree(args.out_dir, bucket, client)
    parchear_manifest(
        client,
        bucket,
        records,
        os.path.join(args.out_dir, "manifest.previo.json"),
    )
    print(f"OK: {len(records)} Parquet + manifest.json actualizados en '{bucket}'.", flush=True)


if __name__ == "__main__":
    main()
