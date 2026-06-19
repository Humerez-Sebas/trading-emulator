# -*- coding: utf-8 -*-
"""
Generador de manifest.json para el bucket R2 (logica pura, sin red).

Este modulo es intencionalmente libre de side-effects: recibe una lista de
registros de subida y devuelve el dict del manifest. Testeable sin boto3.

Esquema del manifest (version 1):
{
  "version": 1,
  "symbols": {
    "XAUUSD": {
      "m1": {
        "2024": { "size": 15423992, "etag": "abc123", "updatedAt": "2026-06-18T12:00:00Z" }
      },
      "d1": {
        "all": { "size": 250000, "etag": "def987", "updatedAt": "2026-06-18T12:00:00Z" }
      }
    }
  }
}
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any


def _format_updated_at(dt: datetime) -> str:
    """Formatea un datetime UTC como ISO-8601 con sufijo Z y sin microsegundos.

    Ejemplo: 2026-06-18T12:00:00Z
    """
    # Aseguramos que sea UTC y eliminamos microsegundos antes de formatear.
    dt_utc = dt.astimezone(timezone.utc).replace(microsecond=0)
    return dt_utc.strftime("%Y-%m-%dT%H:%M:%SZ")


def build_manifest(records: list[dict[str, Any]]) -> dict[str, Any]:
    """Construye el dict del manifest a partir de una lista de registros de subida.

    Parametros
    ----------
    records:
        Lista de dicts con las claves:
          - ``symbol``     (str) Simbolo en mayusculas, p.ej. "XAUUSD".
          - ``tf``         (str) Timeframe en minusculas: "m1", "h1" o "d1".
          - ``partition``  (str) Clave de particion: anio (p.ej. "2024") para m1,
                           o "all" para h1/d1.
          - ``size``       (int) Tamano del archivo en bytes.
          - ``etag``       (str) ETag devuelto por R2, con o sin comillas dobles.
          - ``updated_at`` (datetime) Momento de la subida en UTC.

    Devuelve
    --------
    dict con la estructura exacta descrita en el modulo docstring.
    """
    symbols: dict[str, Any] = {}

    for rec in records:
        symbol: str = rec["symbol"]
        tf: str = rec["tf"]
        partition: str = rec["partition"]
        size: int = int(rec["size"])
        etag: str = rec["etag"].strip('"')
        updated_at: datetime = rec["updated_at"]

        # Asegurar anidamiento symbol -> tf -> partition
        symbols.setdefault(symbol, {}).setdefault(tf, {})[partition] = {
            "size": size,
            "etag": etag,
            "updatedAt": _format_updated_at(updated_at),
        }

    return {"version": 1, "symbols": symbols}
