# -*- coding: utf-8 -*-
"""
Simulador de la estrategia 'Algoritmo' - replica exacta de AlgoritmoEA.mq5 v1.30
Lee xauusd_h1.csv y emite eventos_python.csv con cada decision, en el mismo
formato que el algoritmo_debug.csv que escribe el EA (para hacer diff).
"""
import csv
from datetime import datetime

# ---- parametros (espejo de los inputs del EA) -------------------------------
POINT            = 0.01
PIP_IN_POINTS    = 10
MAX_GAP_PIPS     = 5.0          # InpMaxGapPips
TECHO_MAX_BARS   = 100          # InpTechoMaxBars
ORDER_EXPIRY     = 100          # InpOrderExpiryBars (lo subiste a 100)
MIN_SIZE_POINTS  = 300          # InpMinSizePoints
TP_RR            = 2.0          # InpTakeProfitRR

MAX_GAP  = MAX_GAP_PIPS * PIP_IN_POINTS * POINT   # 0.50 USD
MIN_SIZE = MIN_SIZE_POINTS * POINT                 # 3.00 USD

CSV_IN  = r"C:\Users\78701\Desktop\algoritmo\xauusd_h1.csv"
CSV_OUT = r"C:\Users\78701\Desktop\algoritmo\eventos_python.csv"

# ---- carga de datos ----------------------------------------------------------
bars = []
with open(CSV_IN, encoding="utf-8") as f:
    for row in csv.DictReader(f):
        bars.append({
            "t": row["time"],
            "o": float(row["open"]), "h": float(row["high"]),
            "l": float(row["low"]),  "c": float(row["close"]),
        })

eventos = []
def dbg(evento, bar_time, p1=0.0, p2=0.0, detalle=""):
    eventos.append((bar_time, evento, f"{p1:.2f}", f"{p2:.2f}", detalle))

# ---- estado ------------------------------------------------------------------
ST_ACTIVE, ST_BROKEN = 0, 1
techos = []   # dict: level, formIdx, state, qHigh, qLow, qIdx
trades = []   # dict: contIdx, entry, sl, tp, estado

# ---- bucle principal: identico al orden de pasos del EA ----------------------
for i in range(1, len(bars)):
    b1, b2 = bars[i], bars[i-1]          # b1 = vela evaluada, b2 = anterior
    o1,h1,l1,c1,tm1 = b1["o"],b1["h"],b1["l"],b1["c"],b1["t"]
    o2,c2,tm2       = b2["o"],b2["c"],b2["t"]

    # === PASO 1: continuaciones (techos rotos en la vela previa) =============
    rep_idx, rep_level = -1, -1.0
    for k,t in enumerate(techos):
        if t["state"]==ST_BROKEN and t["qIdx"]==i-1 and t["level"]>rep_level:
            rep_level, rep_idx = t["level"], k

    restantes = []
    for k,t in enumerate(techos):
        if t["state"]!=ST_BROKEN:
            restantes.append(t)
            continue
        if k==rep_idx:
            supera_max = h1 > t["qHigh"]
            mecha_ok   = l1 >= t["qLow"]
            if supera_max and mecha_ok:
                entry, sl = l1, t["qLow"]
                dbg("ALGORITMO_VALIDO", tm1, entry, sl, f"techo={t['level']:.2f}")
                risk = entry - sl
                if risk <= 0:
                    dbg("OMITIDO_RIESGO_NEG", tm1, entry, sl)
                elif risk < MIN_SIZE:
                    dbg("OMITIDO_MUY_PEQUENO", tm1, risk/POINT, MIN_SIZE_POINTS)
                else:
                    tp = entry + risk*TP_RR
                    dbg("ORDEN_COLOCADA", tm1, entry, sl, f"tp={tp:.2f}")
                    trades.append({"contIdx": i, "entry": entry, "sl": sl,
                                   "tp": tp, "estado": "PENDIENTE"})
            else:
                dbg("CONT_FALLIDA", tm1, t["level"], 0,
                    f"h1={h1:.2f} vs qHigh={t['qHigh']:.2f} | l1={l1:.2f} vs qLow={t['qLow']:.2f}")
        # representante o no, todo techo roto por ese quiebre muere
    techos = restantes

    # === PASO 2: quiebres sobre techos activos ===============================
    c1_bull  = c1 > o1
    open_gap = o1 - c2
    for t in techos:
        if t["state"]!=ST_ACTIVE:
            continue
        level = t["level"]
        if not (c1_bull and o1<=level and c1>level):
            continue
        if open_gap > MAX_GAP:
            dbg("QUIEBRE_GAP_IGNORADO", tm1, level, open_gap,
                f"O={o1:.2f} C={c1:.2f} maxGap={MAX_GAP:.2f}")
            continue
        t["state"], t["qHigh"], t["qLow"], t["qIdx"] = ST_BROKEN, h1, l1, i
        dbg("QUIEBRE", tm1, level, 0, f"O={o1:.2f} C={c1:.2f} gapApertura={open_gap:.2f}")

    # === PASO 3: nuevo techo (b2 alcista + b1 bajista) ========================
    if c2>o2 and c1<o1:
        gap_price = abs(c2 - o1)
        if gap_price <= MAX_GAP:
            techos.append({"level": max(c2,o1), "formIdx": i, "state": ST_ACTIVE,
                           "qHigh":0, "qLow":0, "qIdx":-1})
            dbg("NUEVO_TECHO", tm1, max(c2,o1), gap_price)

    # === PASO 4: invalidar por gap que sobrepasa / caducar ===================
    vivos = []
    for t in techos:
        if t["state"]==ST_ACTIVE:
            if o1 > t["level"]:
                dbg("TECHO_INVALIDADO_GAP", tm1, t["level"], o1)
                continue
            if (i - t["formIdx"]) > TECHO_MAX_BARS:
                dbg("TECHO_CADUCADO", tm1, t["level"], i - t["formIdx"])
                continue
        vivos.append(t)
    techos = vivos

# ---- simulacion de fills / TP / SL (aproximada por OHLC) ---------------------
for tr in trades:
    fill_idx = None
    for j in range(tr["contIdx"]+1, min(tr["contIdx"]+1+ORDER_EXPIRY, len(bars))):
        if bars[j]["l"] <= tr["entry"]:
            fill_idx = j
            break
    if fill_idx is None:
        tr["estado"] = "EXPIRADA"
        continue
    tr["estado"] = "ABIERTA"
    for j in range(fill_idx, len(bars)):
        hit_sl = bars[j]["l"] <= tr["sl"]
        hit_tp = bars[j]["h"] >= tr["tp"]
        if hit_sl and hit_tp:
            tr["estado"] = "AMBIGUA(SL y TP misma vela)"
            break
        if hit_sl:
            tr["estado"] = "SL"
            break
        if hit_tp:
            tr["estado"] = "TP"
            break

# ---- salida -------------------------------------------------------------------
with open(CSV_OUT, "w", newline="", encoding="utf-8") as f:
    w = csv.writer(f)
    w.writerow(["bar_time","evento","p1","p2","detalle"])
    w.writerows(eventos)

from collections import Counter
cnt = Counter(e[1] for e in eventos)
print(f"Velas procesadas : {len(bars)}")
print(f"Eventos          : {len(eventos)} -> {CSV_OUT}")
for ev,n in cnt.most_common():
    print(f"  {ev:<24} {n}")
res = Counter(t["estado"] for t in trades)
print(f"\nTrades simulados : {len(trades)}")
for st,n in res.most_common():
    print(f"  {st:<28} {n}")
