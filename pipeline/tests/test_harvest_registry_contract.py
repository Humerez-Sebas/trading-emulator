"""Contrato entre la lista de simbolos cosechados y el registro de activos (RFC-021).

Hasta RFC-020 `export_symbols.py` vivia en este pipeline y leia la MISMA
variable `HARVEST_SYMBOLS` que `fill_r2.py` / `update_r2.py`, asi que el
registro y las velas de R2 no podian divergir por construccion. Desde RFC-021
el registro lo publica el paquete `@humerez-sebas/sizing-kernel` (otro repo),
y esa garantia por construccion ya no existe: la sustituye este detector.

Cadena completa (cambiar una lista sin la otra rompe CI):

    HARVEST_SYMBOLS por defecto (fill_r2.py, update_r2.py)
        == linea marcada `HARVEST_SYMBOLS_CONTRACT` del spec de contrato   <- este archivo
        == claves de GENERATED_ASSETS del paquete                          <- el spec (vitest)

El spec vive en `emulador/src/app/state/trading/sizing-kernel.contract.spec.ts`.
Aqui solo se lee como texto: el job de pipeline de CI no instala Node.
"""

from __future__ import annotations

import os
import re

RAIZ = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
SPEC_CONTRATO = os.path.join(
    RAIZ, "emulador", "src", "app", "state", "trading", "sizing-kernel.contract.spec.ts"
)
PATRON_DEFECTO = re.compile(r'os\.environ\.get\("HARVEST_SYMBOLS",\s*"([^"]*)"\)')
PATRON_MARCA = re.compile(r"^// HARVEST_SYMBOLS_CONTRACT: (\S+)$", re.MULTILINE)


def _leer(*partes: str) -> str:
    with open(os.path.join(RAIZ, *partes), encoding="utf-8") as f:
        return f.read()


def _defecto_de(script: str) -> str:
    coincidencias = PATRON_DEFECTO.findall(_leer("pipeline", script))
    assert len(coincidencias) == 1, (
        f"{script}: se esperaba exactamente un valor por defecto de HARVEST_SYMBOLS, "
        f"hay {len(coincidencias)}"
    )
    return coincidencias[0]


def _marca_del_spec() -> str:
    with open(SPEC_CONTRATO, encoding="utf-8") as f:
        coincidencias = PATRON_MARCA.findall(f.read())
    assert len(coincidencias) == 1, (
        "sizing-kernel.contract.spec.ts debe tener exactamente una linea "
        "`// HARVEST_SYMBOLS_CONTRACT: ...`"
    )
    return coincidencias[0]


def test_fill_y_update_comparten_el_mismo_valor_por_defecto():
    assert _defecto_de("fill_r2.py") == _defecto_de("update_r2.py")


def test_el_valor_por_defecto_coincide_con_el_contrato_del_registro():
    assert _defecto_de("fill_r2.py") == _marca_del_spec()


def test_la_marca_y_la_constante_del_spec_son_la_misma_lista():
    with open(SPEC_CONTRATO, encoding="utf-8") as f:
        texto = f.read()
    constante = re.search(r"const HARVEST_SYMBOLS_CONTRACT = '([^']*)';", texto)
    assert constante is not None
    assert constante.group(1) == _marca_del_spec()
