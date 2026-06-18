# -*- coding: utf-8 -*-
"""
Pipeline completo MT5 -> Parquet -> Cloudflare R2 para una lista de simbolos.

Une los dos pasos de la Milestone 1 (que tienen CLIs separadas):
  1. parquet_builder.harvest_to_parquet: cosecha M1 de MT5, remuestrea a
     M1/H1/D1 y escribe los Parquet locales (M1 particionado por anio).
  2. r2_uploader: sube el arbol local a R2 y publica manifest.json.

CORRE EN EL HOST WINDOWS con la terminal MT5 abierta (la libreria MetaTrader5
habla con ella). Las credenciales R2 se leen del entorno; con --env se carga
un archivo .env primero (utiL cuando se ejecuta desde un git worktree, donde el
.env de la raiz del repo no esta presente).

Uso::
    py backend/fill_r2.py --symbols US30,NAS100,SP500,XAUUSD --desde 2024-01-01 \
        --env C:/ruta/al/.env --out-dir C:/tmp/parquet_out

    py backend/fill_r2.py ... --skip-upload   # solo genera Parquet, sin subir
"""

from __future__ import annotations

import argparse
import logging
import os
import sys
from datetime import datetime, timezone

# backend/ en el path para importar los modulos hermanos.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import parquet_builder  # noqa: E402
import r2_uploader  # noqa: E402
from harvester import load_dotenv  # noqa: E402  (reutiliza el cargador .env minimo)


def main() -> None:
    parser = argparse.ArgumentParser(description="MT5 -> Parquet -> R2 para varios simbolos")
    parser.add_argument(
        "--symbols",
        default=os.environ.get("HARVEST_SYMBOLS", "US30,NAS100,SP500,XAUUSD"),
        help="Lista de simbolos MT5 separados por coma",
    )
    parser.add_argument("--desde", default="2024-01-01", help="Fecha inicio YYYY-MM-DD (UTC)")
    parser.add_argument("--hasta", default=None, help="Fecha fin YYYY-MM-DD (UTC); defecto: hoy")
    parser.add_argument("--out-dir", default="parquet_out", help="Directorio de Parquets locales")
    parser.add_argument("--env", default=None, help="Ruta a un .env con credenciales R2 (opcional)")
    parser.add_argument(
        "--skip-upload",
        action="store_true",
        help="Genera los Parquet pero NO sube a R2 (util para validar primero)",
    )
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")

    if args.env:
        load_dotenv(args.env)

    symbols = [s.strip() for s in args.symbols.split(",") if s.strip()]
    if not symbols:
        raise SystemExit("Indica al menos un simbolo en --symbols")

    desde = datetime.fromisoformat(args.desde).replace(tzinfo=timezone.utc)
    hasta = (
        datetime.fromisoformat(args.hasta).replace(tzinfo=timezone.utc)
        if args.hasta
        else datetime.now(tz=timezone.utc)
    )

    # 1) cosecha + parquet por simbolo
    fallidos: list[tuple[str, str]] = []
    for sym in symbols:
        print(f"=== {sym}: cosechando M1 de MT5 y escribiendo Parquet (desde {desde:%Y-%m-%d}) ===", flush=True)
        try:
            rutas = parquet_builder.harvest_to_parquet(sym, desde, hasta, args.out_dir)
        except Exception as e:  # noqa: BLE001 — un simbolo no debe abortar los demas
            print(f"  {sym}: FALLO ({e})", flush=True)
            fallidos.append((sym, str(e)))
            continue
        for ruta in rutas:
            print(f"  escrito {ruta}", flush=True)

    if fallidos:
        print("\nSimbolos con fallo en la cosecha:", flush=True)
        for n, e in fallidos:
            print(f"  - {n}: {e}", flush=True)

    if args.skip_upload:
        print("--skip-upload: Parquet generados, no se sube a R2.", flush=True)
        return

    # 2) subida a R2 + manifest (de TODO el arbol generado)
    print("=== subiendo el arbol a R2 y publicando manifest.json ===", flush=True)
    config = r2_uploader.load_config()
    bucket = config["R2_BUCKET_NAME"]
    client = r2_uploader.build_r2_client(config)
    records = r2_uploader.upload_parquet_tree(args.out_dir, bucket, client)
    r2_uploader.upload_manifest(records, bucket, client)
    print(f"OK: {len(records)} archivos Parquet + manifest.json subidos a '{bucket}'.", flush=True)


if __name__ == "__main__":
    main()
