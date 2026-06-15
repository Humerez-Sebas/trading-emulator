# -*- coding: utf-8 -*-
"""Descarga velas XAUUSD de varias temporalidades desde MT5 y las guarda en CSV."""
import sys
from datetime import datetime, timezone

import MetaTrader5 as mt5

SYMBOL = "XAUUSD"
DESDE = datetime(2026, 1, 1, tzinfo=timezone.utc)
HASTA = datetime.now(timezone.utc)
CARPETA = r"C:\Users\78701\Desktop\algoritmo\datos"

TIMEFRAMES = {
    "M3":  mt5.TIMEFRAME_M3,
    "M5":  mt5.TIMEFRAME_M5,
    "M15": mt5.TIMEFRAME_M15,
    "H1":  mt5.TIMEFRAME_H1,
    "H4":  mt5.TIMEFRAME_H4,
}

if not mt5.initialize():
    print(f"ERROR: no se pudo conectar a MT5: {mt5.last_error()}")
    sys.exit(1)

info = mt5.terminal_info()
print(f"Terminal : {info.name} | build {mt5.version()[1]}")

candidatos = [SYMBOL] + [s.name for s in (mt5.symbols_get(f"{SYMBOL}*") or [])]
simbolo = None
for c in candidatos:
    if mt5.symbol_select(c, True):
        simbolo = c
        break
if simbolo is None:
    print(f"ERROR: simbolo {SYMBOL} no encontrado. Disponibles: {candidatos}")
    mt5.shutdown()
    sys.exit(1)
print(f"Simbolo  : {simbolo}")

import os
os.makedirs(CARPETA, exist_ok=True)

for nombre, tf in TIMEFRAMES.items():
    rates = mt5.copy_rates_range(simbolo, tf, DESDE, HASTA)
    if rates is None or len(rates) == 0:
        print(f"{nombre:>4}: SIN DATOS (historico no descargado en el terminal?)")
        continue
    salida = os.path.join(CARPETA, f"xauusd_{nombre.lower()}.csv")
    with open(salida, "w", encoding="utf-8") as f:
        f.write("time,open,high,low,close\n")
        for r in rates:
            t = datetime.fromtimestamp(int(r["time"]), tz=timezone.utc).strftime("%Y-%m-%d %H:%M")
            f.write(f"{t},{r['open']},{r['high']},{r['low']},{r['close']}\n")
    primera = datetime.fromtimestamp(int(rates[0]["time"]), tz=timezone.utc).strftime("%Y-%m-%d")
    print(f"{nombre:>4}: {len(rates):>6} velas ({primera} -> hoy) -> {salida}")

mt5.shutdown()
print("Descarga completa.")
