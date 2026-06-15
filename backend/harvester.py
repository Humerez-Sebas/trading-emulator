# -*- coding: utf-8 -*-
"""
Harvester MT5 -> backend. CORRE EN EL HOST WINDOWS, FUERA DE DOCKER: la
libreria `MetaTrader5` de Python solo existe para Windows y habla con la
terminal MT5 abierta en esta misma maquina; un contenedor Linux no puede
conectarse a ella. El backend (dockerizado) es el UNICO escritor de la base
de datos: este script solo lee de MT5 y postea lotes a `/ingest/*` con la
API key.

Uso (desde la raiz del proyecto, con MT5 abierto y el compose levantado):
    py backend/harvester.py
    py backend/harvester.py --symbols US30,XAUUSD --tfs M5,H1 --desde 2024-01-01
    py backend/harvester.py --all-tfs --desde 2024-01-01   # los 21 timeframes

Configuracion por `.env` en la raiz (ver `.env.example`): BACKEND_URL,
INGEST_API_KEY, HARVEST_SYMBOLS, HARVEST_TFS, HARVEST_DESDE. Los flags de
CLI tienen prioridad. Sin --tfs ni --all-tfs se cosecha un conjunto sensato
(M1,M5,M15,H1,H4,D1); --all-tfs barre los 21 timeframes (pesado, opt-in).
Re-ejecutarlo es seguro: el backend hace upsert por (symbol, tf, time) y no
duplica velas.
"""

import argparse
import json
import os
import queue
import sys
import threading
import time
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone

import MetaTrader5 as mt5

# mt5_common vive en la raiz del proyecto (compartido con datasource_api.py)
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from mt5_common import (  # noqa: E402
    TF_SEGUNDOS,
    TIMEFRAMES,
    categoria_de,
    conectar,
    iter_rango_troceado,
)

BATCH_SIZE = 50_000
RETRIES = 3
COLA_LOTES = 4  # backpressure: RAM acotada a ~COLA_LOTES x BATCH_SIZE velas


def load_dotenv(path: str) -> None:
    """Minimal .env loader (no extra dependency). Does not override the env."""
    if not os.path.isfile(path):
        return
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            os.environ.setdefault(key.strip(), value.strip())


def post_json(url: str, payload: dict, api_key: str) -> dict:
    """POST con reintentos y backoff exponencial. Lanza RuntimeError si agota
    los reintentos (el llamador decide si abortar la serie o toda la cosecha)."""
    body = json.dumps(payload).encode("utf-8")
    last_error: Exception | None = None
    for attempt in range(1, RETRIES + 1):
        req = urllib.request.Request(
            url,
            data=body,
            headers={"Content-Type": "application/json", "X-API-Key": api_key},
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=120) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            detail = e.read().decode("utf-8", errors="replace")[:300]
            last_error = RuntimeError(f"HTTP {e.code}: {detail}")
            if e.code in (401, 413, 422):  # no sirve reintentar
                break
        except (urllib.error.URLError, TimeoutError) as e:
            last_error = e
        if attempt < RETRIES:
            wait = 2**attempt
            print(f"    reintento {attempt}/{RETRIES - 1} en {wait}s ({last_error})")
            time.sleep(wait)
    raise RuntimeError(f"ERROR posteando a {url}: {last_error}")


def get_json(url: str) -> dict:
    """GET simple (sin auth: /symbols es público). None-safe ante fallos."""
    with urllib.request.urlopen(url, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def fetch_cobertura(backend: str) -> dict[str, dict[str, int]]:
    """{symbol: {tf: hasta_epoch}} desde /symbols, para reanudar (resume)."""
    try:
        data = get_json(f"{backend}/symbols")
    except Exception as e:  # red caída / backend abajo: seguimos sin resume
        print(f"  (sin resume: no se pudo leer /symbols: {e})")
        return {}
    return {
        s["name"]: {c["tf"]: c["hasta"] for c in s.get("cobertura", [])}
        for s in data.get("symbols", [])
    }


def desde_efectivo(desde: datetime, hasta_cov: int | None, tf_name: str) -> datetime:
    """Punto de reanudación de una serie: la última vela ya cubierta menos un
    solape de 1 vela (el upsert por (symbol, tf, time) la deduplica), nunca
    antes de ``desde``. Sin cobertura previa, arranca en ``desde``."""
    if not hasta_cov:
        return desde
    reinicio = datetime.fromtimestamp(hasta_cov, tz=timezone.utc) - timedelta(
        seconds=TF_SEGUNDOS[tf_name]
    )
    return max(desde, reinicio)


def cosechar_serie(backend, api_key, symbol, tf_name, tf, desde, hasta, n_posters):
    """Pipeline de una serie (symbol, tf): un hilo LEE de MT5 y arma lotes,
    un pool de posters los ENVÍA en paralelo (la lectura del lote N+1 se solapa
    con el envío del N). Devuelve {total, primera, ultima, error_mt5}. Lanza la
    excepción del primer POST que falle (la serie queda incompleta -> sin
    refresh)."""
    cola: queue.Queue = queue.Queue(maxsize=COLA_LOTES)
    fallos: list[Exception] = []
    enviadas = {"n": 0}
    lock = threading.Lock()

    def poster():
        while True:
            lote = cola.get()
            try:
                if lote is None:
                    return
                if fallos:  # otra serie/poster ya falló: drena sin postear
                    continue
                try:
                    post_json(
                        f"{backend}/ingest/candles",
                        {"symbol": symbol, "tf": tf_name, "velas": lote},
                        api_key,
                    )
                    with lock:
                        enviadas["n"] += len(lote)
                        print(f"  {symbol} {tf_name}: {enviadas['n']} velas enviadas", flush=True)
                except Exception as e:
                    fallos.append(e)
            finally:
                cola.task_done()

    hilos = [threading.Thread(target=poster, daemon=True) for _ in range(n_posters)]
    for h in hilos:
        h.start()

    estado = {"total": 0, "primera": None, "ultima": None, "error_mt5": None}
    buf: list[list] = []
    for rates, error in iter_rango_troceado(symbol, tf, tf_name, desde, hasta):
        if error is not None:
            estado["error_mt5"] = error
            continue
        if estado["primera"] is None:
            estado["primera"] = int(rates["time"][0])
        estado["ultima"] = int(rates["time"][-1])
        estado["total"] += len(rates)
        for r in rates:
            buf.append(
                [
                    int(r["time"]),
                    float(r["open"]),
                    float(r["high"]),
                    float(r["low"]),
                    float(r["close"]),
                ]
            )
            if len(buf) >= BATCH_SIZE:
                cola.put(buf)
                buf = []
        if fallos:  # corta la lectura temprano si un POST ya reventó
            break
    if buf and not fallos:
        cola.put(buf)
    for _ in hilos:  # un sentinel por poster
        cola.put(None)
    for h in hilos:
        h.join()

    if fallos:
        raise fallos[0]
    return estado


def main() -> None:
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    load_dotenv(os.path.join(root, ".env"))

    parser = argparse.ArgumentParser(description="Cosecha velas de MT5 hacia el backend")
    parser.add_argument("--symbols", default=os.environ.get("HARVEST_SYMBOLS", ""))
    parser.add_argument(
        "--categorias", default="", help="p.ej. Forex,Metales (alternativa a --symbols)"
    )
    parser.add_argument("--tfs", default=os.environ.get("HARVEST_TFS", "M1,M5,M15,H1,H4,D1"))
    parser.add_argument(
        "--all-tfs",
        action="store_true",
        help="cosecha los 21 timeframes de MT5 (ignora --tfs / HARVEST_TFS)",
    )
    parser.add_argument("--desde", default=os.environ.get("HARVEST_DESDE", "2024-01-01"))
    parser.add_argument("--backend", default=os.environ.get("BACKEND_URL", "http://127.0.0.1:8000"))
    parser.add_argument("--api-key", default=os.environ.get("INGEST_API_KEY", ""))
    parser.add_argument(
        "--posters",
        type=int,
        default=2,
        help="hilos que postean lotes en paralelo por serie (def. 2)",
    )
    parser.add_argument(
        "--no-resume",
        action="store_true",
        help="descarga completa desde --desde; ignora la cobertura ya existente",
    )
    args = parser.parse_args()
    if args.posters < 1:
        raise SystemExit("--posters debe ser >= 1")

    if not args.api_key:
        raise SystemExit("Falta INGEST_API_KEY (en .env o --api-key)")
    if not conectar():
        raise SystemExit(f"MT5 no disponible: {mt5.last_error()}. Abre la terminal y reintenta.")

    todos = {s.name: s for s in (mt5.symbols_get("*") or [])}
    if args.symbols:
        names = [s.strip() for s in args.symbols.split(",") if s.strip()]
        missing = [n for n in names if n not in todos]
        if missing:
            raise SystemExit(f"Símbolos no encontrados en MT5: {', '.join(missing)}")
    elif args.categorias:
        cats = {c.strip() for c in args.categorias.split(",") if c.strip()}
        names = [n for n, s in todos.items() if categoria_de(s.path) in cats]
        if not names:
            raise SystemExit(f"Ningún símbolo en las categorías: {args.categorias}")
    else:
        raise SystemExit("Indica --symbols o --categorias (o HARVEST_SYMBOLS en .env)")

    if args.all_tfs:
        # full sweep: every MT5 timeframe (heavy — opt-in, not the default)
        tfs = list(TIMEFRAMES.keys())
    else:
        tfs = [t.strip().upper() for t in args.tfs.split(",") if t.strip()]
        bad = [t for t in tfs if t not in TIMEFRAMES]
        if bad:
            raise SystemExit(f"Temporalidades inválidas: {', '.join(bad)}")

    desde = datetime.fromisoformat(args.desde).replace(tzinfo=timezone.utc)
    hasta = datetime.now(timezone.utc)

    # 1) metadatos de los simbolos
    post_json(
        f"{args.backend}/ingest/symbols",
        {
            "symbols": [
                {
                    "name": n,
                    "descripcion": todos[n].description,
                    "categoria": categoria_de(todos[n].path),
                    "digits": todos[n].digits,
                }
                for n in names
            ]
        },
        args.api_key,
    )
    print(f"Símbolos registrados: {', '.join(names)}")

    # 2) velas por simbolo x TF. Cada serie usa un pipeline lee/postea; al
    #    terminarla se refresca candles_daily UNA vez (no por lote).
    cobertura = {} if args.no_resume else fetch_cobertura(args.backend)
    fallidos: list[tuple[str, str, str]] = []
    for name in names:
        mt5.symbol_select(name, True)
        for tf_name in tfs:
            hasta_cov = None if args.no_resume else cobertura.get(name, {}).get(tf_name)
            desde_ef = desde_efectivo(desde, hasta_cov, tf_name)
            if desde_ef >= hasta:
                print(f"  {name} {tf_name}: ya al día")
                continue

            try:
                est = cosechar_serie(
                    args.backend,
                    args.api_key,
                    name,
                    tf_name,
                    TIMEFRAMES[tf_name],
                    desde_ef,
                    hasta,
                    args.posters,
                )
            except Exception as e:
                print(f"  {name} {tf_name}: FALLO ({e})")
                fallidos.append((name, tf_name, str(e)))
                continue

            if est["total"] == 0:
                detalle = f" (MT5: {est['error_mt5']})" if est["error_mt5"] else ""
                print(f"  {name} {tf_name}: sin velas en el rango{detalle}")
                continue

            # refresco único de la cobertura para esta serie (no fatal si falla)
            try:
                post_json(
                    f"{args.backend}/ingest/refresh",
                    {"desde": est["primera"], "hasta": est["ultima"]},
                    args.api_key,
                )
            except Exception as e:
                print(
                    f"  {name} {tf_name}: velas OK pero refresh falló ({e}); la policy se pondrá al día"
                )
            primera = datetime.fromtimestamp(est["primera"], tz=timezone.utc)
            print(f"  {name} {tf_name}: OK ({est['total']} velas desde {primera:%Y-%m-%d %H:%M})")

    if fallidos:
        print("\nSeries con fallo:")
        for n, t, e in fallidos:
            print(f"  - {n} {t}: {e}")
        raise SystemExit(f"Cosecha terminó con {len(fallidos)} serie(s) fallida(s).")
    print("Cosecha completa.")


if __name__ == "__main__":
    main()
