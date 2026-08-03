"""
Generador del registro de activos MT5 para el emulador (RFC-020, D.20.4).

Lee `HARVEST_SYMBOLS` (misma variable y mismo valor por defecto que
`fill_r2.py:54` / `update_r2.py:302`: "US30,NAS100,SP500,XAUUSD") y llama a
`mt5.symbol_info()` por cada simbolo, emitiendo un modulo TypeScript
determinista (`emulador/src/app/domain/sizing/asset-registry.generated.ts`)
que el kernel `domain/sizing/` consume en tiempo de carga -- la busqueda debe
ser sincrona porque se llama dentro de un reducer NgRx (RFC-020 §4.3), lo que
descarta IndexedDB/descarga en runtime.

Registro y velas de R2 leen la MISMA variable de entorno para no poder
divergir por construccion: el registro es el conjunto exacto de instrumentos
con datos en R2.

Falla ruidosamente: si `symbol_info()` devuelve None para un simbolo pedido,
se lanza `SimboloNoEncontrado` en vez de emitir un registro parcial -- la
misma postura que `HistorialTruncado` en `mt5_common.py:41`: un registro
incompleto en una herramienta de dinero es peor que fallar la generacion
entera.

Solo lectura contra la terminal: `initialize()`, `symbol_info()`,
`account_info()`/`terminal_info()` (para el nombre del broker en la cabecera
de procedencia), `shutdown()`. Ninguna llamada de trading, ninguna
interaccion con la GUI -- es la terminal real del owner.

Este script es INERTE respecto del emulador: nada importa todavia el archivo
generado (`asset-registry.generated.ts`) ni `resolveAsset()`; el cutover de
`contractSizeFor`/`pipSizeFor` es la Tarea C-1, auditada por separado.
"""

from __future__ import annotations

import argparse
import os
import sys
from dataclasses import dataclass
from datetime import UTC, datetime

# pipeline/ en el path para importar los modulos hermanos (mismo patron que
# fill_r2.py:30 / update_r2.py).
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import MetaTrader5 as mt5

RUTA_SALIDA_DEFECTO = os.path.normpath(
    os.path.join(
        os.path.dirname(os.path.abspath(__file__)),
        "..",
        "emulador",
        "src",
        "app",
        "domain",
        "sizing",
        "asset-registry.generated.ts",
    )
)


class SimboloNoEncontrado(RuntimeError):
    """`mt5.symbol_info()` devolvio None para un simbolo pedido.

    Se lanza en vez de emitir un registro parcial: ver el docstring del
    modulo y `HistorialTruncado` (`mt5_common.py:41-47`), el mismo principio
    ya aplicado en el pipeline.
    """


@dataclass(frozen=True)
class AssetRecord:
    """Los campos crudos de `symbol_info()` que el kernel TS necesita.

    `pipSize` NO esta aqui a proposito: no es un campo de MT5, es una
    convencion derivada del NOMBRE del simbolo (metales y CFDs se miden en
    puntos, pares de 6 letras en pips) que `asset-registry.ts` calcula igual
    sin importar la procedencia de estos otros campos.
    """

    symbol: str
    contract_size: float
    tick_size: float
    volume_step: float
    volume_min: float
    digits: int
    currency: str


def parse_symbols(raw: str) -> list[str]:
    """Separa una lista de simbolos por coma, recorta espacios y descarta
    vacios -- misma logica que `fill_r2.py`/`update_r2.py`."""
    return [s.strip() for s in raw.split(",") if s.strip()]


def resolve_symbols(override: str | None) -> list[str]:
    """Lista de simbolos a exportar.

    `override` (p.ej. `--symbols` en `main()`) gana sobre el entorno. Sin
    override, lee `HARVEST_SYMBOLS` con el MISMO valor por defecto que
    `fill_r2.py:54` / `update_r2.py:302` -- "US30,NAS100,SP500,XAUUSD",
    nunca una segunda lista escrita a mano (RFC-020 C2).
    """
    crudo = (
        override
        if override is not None
        else os.environ.get("HARVEST_SYMBOLS", "US30,NAS100,SP500,XAUUSD")
    )
    return parse_symbols(crudo)


def fetch_asset_records(symbols: list[str]) -> list[AssetRecord]:
    """Llama a `mt5.symbol_info()` por cada simbolo pedido.

    Lanza `SimboloNoEncontrado` en el primer simbolo sin resolver -- no se
    acumulan registros parciales de los simbolos ya procesados (fallo
    ruidoso, ver docstring del modulo).
    """
    registros: list[AssetRecord] = []
    for symbol in symbols:
        info = mt5.symbol_info(symbol)
        if info is None:
            raise SimboloNoEncontrado(
                f"{symbol}: mt5.symbol_info() devolvio None. Registro no generado."
            )
        registros.append(
            AssetRecord(
                symbol=symbol.upper(),
                contract_size=float(info.trade_contract_size),
                tick_size=float(info.trade_tick_size),
                volume_step=float(info.volume_step),
                volume_min=float(info.volume_min),
                digits=int(info.digits),
                # `currency_profit`, no `currency_base`/`currency_margin`: es
                # la divisa en la que se expresa la ganancia/perdida, la que
                # importa para el riesgo en $ de esta herramienta (cuentas
                # siempre en USD, RFC-020 §7.1 no-objetivo 8).
                currency=str(info.currency_profit),
            )
        )
    return registros


def broker_name() -> str:
    """Nombre del broker para la cabecera de procedencia (`mt5:<broker>@<fecha>`).

    Prioriza `account_info().company` (el broker de la cuenta REALMENTE
    conectada); cae a `terminal_info().company` si no hay cuenta conectada
    (puede ser distinto: el terminal instalado puede ser el de un reseller
    de marca blanca mientras la cuenta esta en el broker real -- se observo
    en esta maquina: terminal_info().company = "WSFunded Ltd." pero
    account_info().company = "Five Percent Online Ltd").
    """
    cuenta = mt5.account_info()
    if cuenta is not None and getattr(cuenta, "company", None):
        return str(cuenta.company)
    terminal = mt5.terminal_info()
    if terminal is not None and getattr(terminal, "company", None):
        return str(terminal.company)
    raise RuntimeError("No se pudo determinar el broker (account_info/terminal_info vacios).")


def _num_ts(value: float) -> str:
    """Formatea un float para TypeScript sin ceros de mas: 1.0 -> '1', 0.01 se
    mantiene. `repr()` de Python ya no arrastra basura de punto flotante para
    estos valores (0.01, 100.0, etc.)."""
    if value == int(value):
        return str(int(value))
    return repr(value)


def render_ts(records: list[AssetRecord], provenance: str) -> str:
    """Renderiza `asset-registry.generated.ts`: simbolos ORDENADOS, un campo
    por linea, cabecera de procedencia (`mt5:<broker>@<fecha>`) y ningun otro
    timestamp en el archivo -- si no, cada regeneracion es un diff ruidoso
    (RFC-020 Tarea B-1 §5).
    """
    ordenados = sorted(records, key=lambda r: r.symbol)
    lineas = [
        "// GENERATED FILE — do not edit by hand.",
        "// Produced by `py pipeline/export_symbols.py` (RFC-020, D.20.4).",
        f"// Provenance: {provenance}",
        "",
        "/** Raw MT5 `symbol_info()` fields this kernel needs. No `pipSize` here",
        " * on purpose: it is a name-derived convention, not an MT5 field --",
        " * `asset-registry.ts` computes it independently of provenance. */",
        "export interface GeneratedAssetRecord {",
        "  readonly contractSize: number;",
        "  readonly tickSize: number;",
        "  readonly volumeStep: number;",
        "  readonly volumeMin: number;",
        "  readonly digits: number;",
        "  readonly currency: string;",
        "}",
        "",
        # No `: string` annotation: `@typescript-eslint/no-inferrable-types`
        # forbids it, and it is not needed anyway -- `AssetSource` in
        # `asset-registry.ts` is typed as plain `string`, not `typeof
        # GENERATED_SOURCE`, precisely so this constant's own (narrower,
        # per-regeneration) literal type never leaks into a type consumers
        # depend on.
        f"export const GENERATED_SOURCE = '{provenance}';",
        "",
        "export const GENERATED_ASSETS: Readonly<Record<string, GeneratedAssetRecord>> = {",
    ]
    for r in ordenados:
        lineas.append(f"  {r.symbol}: {{")
        lineas.append(f"    contractSize: {_num_ts(r.contract_size)},")
        lineas.append(f"    tickSize: {_num_ts(r.tick_size)},")
        lineas.append(f"    volumeStep: {_num_ts(r.volume_step)},")
        lineas.append(f"    volumeMin: {_num_ts(r.volume_min)},")
        lineas.append(f"    digits: {r.digits},")
        lineas.append(f"    currency: '{r.currency}',")
        lineas.append("  },")
    lineas.append("};")
    lineas.append("")
    return "\n".join(lineas)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Genera el registro TS de activos MT5 (RFC-020, D.20.4)"
    )
    parser.add_argument(
        "--symbols",
        default=None,
        help="Lista de simbolos MT5 separados por coma; por defecto HARVEST_SYMBOLS",
    )
    parser.add_argument(
        "--out", default=RUTA_SALIDA_DEFECTO, help="Ruta del .ts generado (se sobreescribe)"
    )
    args = parser.parse_args()

    symbols = resolve_symbols(args.symbols)
    if not symbols:
        raise SystemExit("Ningun simbolo que exportar (revisa --symbols/HARVEST_SYMBOLS)")

    if not mt5.initialize():
        raise RuntimeError(f"mt5.initialize() fallo: {mt5.last_error()}")
    try:
        registros = fetch_asset_records(symbols)
        broker = broker_name()
    finally:
        # Solo lectura: initialize()/symbol_info()/account_info()/
        # terminal_info()/shutdown(). Ninguna llamada de trading.
        mt5.shutdown()

    fecha = datetime.now(UTC).strftime("%Y-%m-%d")
    provenance = f"mt5:{broker}@{fecha}"
    contenido = render_ts(registros, provenance)

    with open(args.out, "w", encoding="utf-8", newline="\n") as f:
        f.write(contenido)

    print(f"Escrito {args.out} ({len(registros)} simbolos, {provenance})")


if __name__ == "__main__":
    main()
