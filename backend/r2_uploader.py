# -*- coding: utf-8 -*-
"""
Uploader de Parquet a Cloudflare R2 y generador de manifest.json.

Sube el arbol de Parquets producido por parquet_builder.py al bucket R2
siguiendo el layout:
  market-data/v1/<SYMBOL>/<tf>/<file>.parquet

Despues construye y sube manifest.json a la raiz del bucket.

El cliente boto3 es inyectable para facilitar los tests sin red real.

Uso CLI::
    python r2_uploader.py --out-dir parquet_out [--dry-run]
"""

from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

# Prefijo base de todos los objetos Parquet en R2.
_MARKET_DATA_PREFIX = "market-data/v1"


# ---------------------------------------------------------------------------
# Configuracion (variables de entorno)
# ---------------------------------------------------------------------------

#: Variables requeridas para conectar a R2.
_REQUIRED_VARS = ("R2_ACCOUNT_ID", "R2_BUCKET_NAME", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY")


def load_config() -> dict[str, str | None]:
    """Lee las variables de entorno necesarias para R2.

    Devuelve un dict con las claves de configuracion.
    Lanza ValueError si alguna variable requerida no esta definida.
    """
    faltantes = [v for v in _REQUIRED_VARS if not os.environ.get(v)]
    if faltantes:
        raise ValueError(
            f"Variables de entorno R2 requeridas no definidas: {', '.join(faltantes)}"
        )

    return {
        "R2_ACCOUNT_ID": os.environ["R2_ACCOUNT_ID"],
        "R2_BUCKET_NAME": os.environ["R2_BUCKET_NAME"],
        "R2_ACCESS_KEY_ID": os.environ["R2_ACCESS_KEY_ID"],
        "R2_SECRET_ACCESS_KEY": os.environ["R2_SECRET_ACCESS_KEY"],
        # Opcional: si no esta definida, se construye desde R2_ACCOUNT_ID.
        "R2_ENDPOINT": os.environ.get("R2_ENDPOINT") or None,
    }


def build_r2_client(config: dict[str, str | None] | None = None):
    """Construye un cliente boto3 S3 apuntando a Cloudflare R2.

    Parametros
    ----------
    config:
        Dict retornado por ``load_config()``. Si es None se llama a
        ``load_config()`` internamente.

    Devuelve
    --------
    Un cliente boto3 S3.
    """
    import boto3  # importacion local para que manifest.py no dependa de boto3

    if config is None:
        config = load_config()

    endpoint_url: str = (
        config.get("R2_ENDPOINT")
        or f"https://{config['R2_ACCOUNT_ID']}.r2.cloudflarestorage.com"
    )

    return boto3.client(
        "s3",
        endpoint_url=endpoint_url,
        aws_access_key_id=config["R2_ACCESS_KEY_ID"],
        aws_secret_access_key=config["R2_SECRET_ACCESS_KEY"],
        region_name="auto",
    )


# ---------------------------------------------------------------------------
# Logica de subida
# ---------------------------------------------------------------------------


def _r2_key(symbol: str, tf: str, filename: str) -> str:
    """Construye la clave R2 para un archivo Parquet.

    Ejemplo: market-data/v1/XAUUSD/m1/2024.parquet
    """
    return f"{_MARKET_DATA_PREFIX}/{symbol}/{tf}/{filename}"


def upload_parquet_tree(
    out_dir: str,
    bucket: str,
    client: Any,
) -> list[dict[str, Any]]:
    """Sube todos los Parquets del arbol local a R2.

    Recorre ``out_dir/<SYMBOL>/<tf>/<file>.parquet`` y sube cada archivo a
    ``market-data/v1/<SYMBOL>/<tf>/<file>.parquet`` en el bucket R2.

    Parametros
    ----------
    out_dir:
        Directorio raiz producido por parquet_builder.write_anchors.
    bucket:
        Nombre del bucket R2.
    client:
        Cliente S3 (boto3 o stub de test) que implementa put_object.

    Devuelve
    --------
    Lista de registros de subida (dicts) listos para pasarle a
    manifest.build_manifest.
    """
    records: list[dict[str, Any]] = []
    root = Path(out_dir)

    for symbol_dir in sorted(root.iterdir()):
        if not symbol_dir.is_dir():
            continue
        symbol = symbol_dir.name  # p.ej. "XAUUSD" (tal como esta en disco)

        for tf_dir in sorted(symbol_dir.iterdir()):
            if not tf_dir.is_dir():
                continue
            tf = tf_dir.name.lower()  # "m1", "h1" o "d1"

            for parquet_file in sorted(tf_dir.glob("*.parquet")):
                key = _r2_key(symbol, tf, parquet_file.name)
                file_size = os.path.getsize(parquet_file)

                with open(parquet_file, "rb") as fh:
                    body = fh.read()

                logger.info("Subiendo %s -> s3://%s/%s (%d bytes)", parquet_file, bucket, key, file_size)
                response = client.put_object(Bucket=bucket, Key=key, Body=body)

                etag: str = response.get("ETag", "").strip('"')
                uploaded_at = datetime.now(tz=timezone.utc)

                # Derivar la clave de particion del nombre de archivo:
                # "2024.parquet" -> "2024" | "all.parquet" -> "all"
                partition = parquet_file.stem  # quita la extension .parquet

                records.append({
                    "symbol": symbol,
                    "tf": tf,
                    "partition": partition,
                    "size": file_size,
                    "etag": etag,
                    "updated_at": uploaded_at,
                })

    logger.info("Subida completada: %d archivos Parquet", len(records))
    return records


def upload_manifest(
    records: list[dict[str, Any]],
    bucket: str,
    client: Any,
) -> None:
    """Construye y sube manifest.json a la raiz del bucket R2.

    Parametros
    ----------
    records:
        Lista de registros devuelta por ``upload_parquet_tree``.
    bucket:
        Nombre del bucket R2.
    client:
        Cliente S3 (boto3 o stub de test) que implementa put_object.
    """
    import manifest as manifest_mod  # importacion local para evitar circularidad

    manifest_dict = manifest_mod.build_manifest(records)
    body = json.dumps(manifest_dict, indent=2, ensure_ascii=False).encode("utf-8")

    logger.info("Subiendo manifest.json a s3://%s/manifest.json (%d bytes)", bucket, len(body))
    client.put_object(Bucket=bucket, Key="manifest.json", Body=body)
    logger.info("manifest.json subido correctamente")


# ---------------------------------------------------------------------------
# Entrada de linea de comandos (minima)
# ---------------------------------------------------------------------------


def _main() -> None:
    import argparse

    parser = argparse.ArgumentParser(
        description="Sube Parquets locales a Cloudflare R2 y genera manifest.json"
    )
    parser.add_argument("--out-dir", required=True, help="Directorio raiz de Parquets locales")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Registra las subidas planeadas y muestra el manifest sin subir nada",
    )
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")

    config = load_config()
    bucket = config["R2_BUCKET_NAME"]

    if args.dry_run:
        _dry_run(args.out_dir, bucket)
    else:
        client = build_r2_client(config)
        records = upload_parquet_tree(args.out_dir, bucket, client)
        upload_manifest(records, bucket, client)


def _dry_run(out_dir: str, bucket: str) -> None:
    """Muestra las subidas planeadas y el manifest resultante sin tocar la red."""
    import manifest as manifest_mod

    root = Path(out_dir)
    records: list[dict[str, Any]] = []

    for symbol_dir in sorted(root.iterdir()):
        if not symbol_dir.is_dir():
            continue
        symbol = symbol_dir.name
        for tf_dir in sorted(symbol_dir.iterdir()):
            if not tf_dir.is_dir():
                continue
            tf = tf_dir.name.lower()
            for parquet_file in sorted(tf_dir.glob("*.parquet")):
                key = _r2_key(symbol, tf, parquet_file.name)
                file_size = os.path.getsize(parquet_file)
                logger.info("[DRY-RUN] %s -> s3://%s/%s (%d bytes)", parquet_file, bucket, key, file_size)
                records.append({
                    "symbol": symbol,
                    "tf": tf,
                    "partition": parquet_file.stem,
                    "size": file_size,
                    "etag": "dry-run-etag",
                    "updated_at": datetime.now(tz=timezone.utc),
                })

    manifest_dict = manifest_mod.build_manifest(records)
    print(json.dumps(manifest_dict, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    _main()
