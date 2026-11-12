# RFC-021: Extracción del kernel de dimensionado a un paquete compartido

| Campo | Valor |
| :--- | :--- |
| **Estado** | **EN CURSO (2026-11-11)** — rama `feature/rfc-021-sizing-kernel-extraction` → `develop`. Bitácora del run: `.superpowers/rfc-021/dev-log.md`. |
| **Fecha** | 2026-11-11 |
| **Bloque** | Producto (infraestructura compartida) — fuera de la secuencia Mastery Block |
| **Documentos Rectores** | [PHILOSOPHY.md](../../engineering/PHILOSOPHY.md), [RFC-020](./020-lotaje-position-sizer.md) §4 y §7.1, [Study 10](../../superpowers/specs/2026-08-02-position-sizer-reusability-validation.md) (disparadores T1–T4) |
| **Modifica** | RFC-020 §4 (ubicación física del kernel y del generador del registro). No reabre ninguna decisión de producto P1–P8 ni ningún congelado de §7.1. |
| **Decisiones** | D.21.1 – D.21.6 |
| **Rama / base** | `feature/rfc-021-sizing-kernel-extraction` (desde `origin/develop` @ `5b400e0`) |
| **Baseline de tests** | 203 archivos / **2699 tests** (`ng test` en `5b400e0`); pipeline 128 tests |

---

## 1. Veredicto

`emulador/src/app/domain/sizing/` deja este repositorio. Pasa a vivir en el repo privado
`Humerez-Sebas/sizing-kernel` y se consume como el paquete npm privado
`@humerez-sebas/sizing-kernel` (GitHub Packages), con versión fijada exacta. El emulador borra su
copia. El comportamiento del emulador **no cambia**: las mismas funciones, los mismos datos de
registro, los mismos resultados.

El Study 10 rechazó esta extracción en agosto y dejó escrito cuándo dejaría de ser un error:
*«la extracción se paga sola cuando se dispara cualquiera de»* T1–T4, y *«una propuesta de
extracción sin un disparador activado es un hallazgo automático»*. Este RFC existe porque se
dispararon dos.

## 2. Motivación: se dispararon T1 y T2

El owner está construyendo **PropMirror**, un copiador local de operaciones entre sus cuentas MT5
de fondeo. PropMirror necesita exactamente la matemática de este kernel (lote por riesgo, tamaño de
contrato, redondeo) para escalar el lote de cada cuenta esclava.

| Disparador (Study 10) | Hecho que lo activa |
| :--- | :--- |
| **T1** — un segundo artefacto debe publicarse de forma independiente del emulador | PropMirror tiene su propio repositorio y su propio ritmo de publicación. Un arreglo del copiador no puede esperar al tren `develop → main` del emulador, ni al revés. |
| **T2** — un host que no puede importar código TypeScript | El ejecutor de PropMirror es un Expert Advisor en **MQL5**. No puede importar `position-sizing.ts`. Hace falta un contrato que dos lenguajes cumplan: vectores dorados en JSON y un port MQL5 verificado contra ellos. |

T3 (segundo mantenedor) y T4 (consumidor externo) siguen sin dispararse. El paquete es privado.

**Por qué no dos copias.** Copiar las ~240 líneas a PropMirror habría sido más barato hoy y habría
violado el congelado 5 de RFC-020 §7.1 (*«un solo registro, compartido»*) y PHILOSOPHY §2.5
(*reutilizar maquinaria auditada, nunca duplicar sistemas*): dos fórmulas de dinero que pueden
divergir en silencio.

## 3. Lo que NO cambia

- Las firmas y los cuerpos de `lotsForRisk`, `lotsForRiskDistance`, `riskForLots`, `riskUsdFor`,
  `priceDistance`, `contractSizeFor`, `pipSizeFor` y `resolveAsset`. En el repo del kernel,
  `git diff <commit de extracción> -- src/position-sizing.ts src/asset-registry.ts` muestra
  únicamente los especificadores de import (`.js`, exigidos por `NodeNext`).
- Los datos del registro: los cuatro símbolos (`US30`, `NAS100`, `SP500`, `XAUUSD`) con procedencia
  `mt5:Five Percent Online Ltd@2026-08-05`. El archivo regenerado difiere del anterior solo en su
  comentario de cabecera.
- `state/trading/trading.models.ts` sigue siendo un **re-export puro** (RFC-020 §4.1): reducer,
  selectores, gráfico y panel de operativa no se tocan.
- La búsqueda de instrumento sigue siendo síncrona, pura y disponible en carga (RFC-020 §4.3): el
  registro es un módulo estático dentro del paquete.
- Los cuatro gates de verificación y sus comandos.
- Ninguna interfaz de usuario.

## 4. Decisiones

### D.21.1 — Repositorio propio y paquete privado con versión exacta

El kernel vive en `Humerez-Sebas/sizing-kernel` y se publica en GitHub Packages como
`@humerez-sebas/sizing-kernel`. `emulador/package.json` lo fija con versión **exacta** (`1.0.0`,
sin `^`): un cambio en una fórmula de dinero entra por un bump deliberado y revisado, nunca por un
rango flotante.

El historial git de `domain/sizing/`, `pipeline/export_symbols.py` y su test se conserva en el repo
nuevo (`git filter-repo`). Aquí queda el historial previo intacto; no se reescribe nada.

### D.21.2 — Los consumidores importan del paquete; `trading.models` sigue siendo el punto de paridad

Los imports de `domain/sizing/*` pasan a `@humerez-sebas/sizing-kernel` (raíz del paquete, sin rutas
profundas). El re-export de `trading.models.ts` cambia solo su origen. El contrato del emulador con
el paquete queda en `state/trading/sizing-kernel.contract.spec.ts`:

- el re-export es **la misma función** que la del paquete (identidad, no igualdad de resultados);
- pines de valor literal de lo que el replay da por hecho (tamaño de contrato de los cuatro curados,
  `pipSize` nulo, caso de aceptación, piso de 0,01, guardas de signo);
- los símbolos cosechados resuelven desde el registro MT5, nunca desde la heurística.

Los 34 tests de `position-sizing.spec.ts` y `asset-registry.spec.ts` se van con el código: corren en
el repo del kernel, junto a 180 vectores dorados. No se pierden; cambian de dueño.

### D.21.3 — `export_symbols.py` se muda con los datos; las dos listas se atan por detector

El generador del registro pasa al repo del kernel (`tools/export_symbols.py`), porque el dato que
produce ahora pertenece allí. Exporta por bróker, en JSON, y añade `trade_tick_value`,
`trade_calc_mode` y `volume_max`.

RFC-020 C2 exigía que el registro y las velas de R2 no pudieran divergir **por construcción**: ambos
leían `HARVEST_SYMBOLS`. Con dos repositorios esa construcción ya no es posible. La sustituye una
cadena de detectores, completa en este repo:

```
valor por defecto de HARVEST_SYMBOLS en fill_r2.py y update_r2.py
   ==  línea marcada HARVEST_SYMBOLS_CONTRACT del spec de contrato   (pytest, job de pipeline)
   ==  claves de GENERATED_ASSETS del paquete                        (vitest, job de frontend)
```

Cambiar una lista sin la otra rompe CI. Es una garantía más débil que la anterior (por detector, no
por construcción) y se acepta como coste de T1.

### D.21.4 — El token del registro entra por una variable de entorno

GitHub Packages exige un token incluso para leer. `emulador/.npmrc` contiene el registro del scope y
`_authToken=${NPM_GITHUB_TOKEN}`; el valor nunca se commitea. La variable se define en tres sitios:

| Dónde | Cómo |
| :--- | :--- |
| Local | `export NPM_GITHUB_TOKEN=…` en `~/.zshenv` |
| GitHub Actions | secreto `NPM_GITHUB_TOKEN`, pasado al `npm ci` del job `frontend` y al job `deploy` |
| Vercel | variable de entorno `NPM_GITHUB_TOKEN` (Production, Preview, Development) |

El token es un PAT *classic* con **solo** `read:packages`. Crearlo y cargarlo en Vercel son tareas
humanas (§8). Un PR desde un fork no recibe el secreto y su job `frontend` fallará al instalar: se
acepta, el repo es de uso personal.

### D.21.5 — Excepción justificada al invariante 8 (sin dependencias runtime nuevas)

`@humerez-sebas/sizing-kernel` es una dependencia runtime nueva. Justificación
(`decision-frameworks.md`): no añade código de terceros — es el mismo código propio, auditado en
RFC-020, que ya estaba en el bundle; tiene cero dependencias propias; declara `sideEffects: false`.
El presupuesto de bundle se re-mide en la finalización de rama (bitácora §4).

### D.21.6 — Costes del Study 10 que ahora se pagan, y su mitigación

El Study 10 enumeró lo que la extracción rompería. Siguen siendo ciertos; T1 y T2 los justifican.

| Coste (Study 5 y 9) | Mitigación |
| :--- | :--- |
| Deriva de versión: emulador y kernel pueden discrepar | Versión exacta + spec de contrato en este repo |
| Coreografía de release: publicar → subir versión → redeploy | Aceptado. `docs/releasing.md` del kernel lo documenta |
| La cobertura deja de contar el kernel (`coverageInclude` cubre `src/app/domain/**`) | El kernel se prueba en su repo (229 tests). El umbral del 80 % del emulador se mide sobre el código que queda |
| CI necesita autenticación de registro | D.21.4 |
| «Un Shared Kernel con paquete tiende a crecer» (P1) | Invariante 1 del `CLAUDE.md` del kernel: solo matemática y datos de instrumento, con detectores ejecutables |

## 5. Relación con los congelados de RFC-020 §7.1

| # | Congelado | Efecto de este RFC |
| :--- | :--- | :--- |
| 2 | El cálculo jamás se ramifica por prop firm, tipo de cuenta ni plataforma | **Preservado y endurecido**: es el invariante 2 del kernel, con detector (`repo-invariants.spec.ts`, I4). Toda la lógica por firma de PropMirror vive en PropMirror. |
| 3 | Modelo de riesgo: cuenta + riesgo % | Preservado. PropMirror pasa como «cuenta» el tamaño base nominal; el kernel no distingue. |
| 4 | Búsqueda síncrona, pura, disponible en carga | Preservado (§3). |
| 5 | Un solo registro, compartido; procedencia siempre declarada | Preservado: el registro único es ahora el del paquete. |
| 6 | La herramienta no depende de `state/*` ni de `domain/chart` | Preservado; el kernel ya no puede importarlos ni por error (otro repositorio). |
| 7 | El dimensionado en replay no se toca | Preservado (re-export puro). |
| 8 | No-objetivos, entre ellos «paquetes de copiado» y «cuentas fuera de USD» | Sin cambio. «Paquetes de copiado» se refiere, por su contexto (Tarea D-3, *payload* de copiado al portapapeles), a lo que la herramienta copia al portapapeles; este RFC no añade nada a la herramienta. El copiado de operaciones es un producto distinto, en otro repo. «Solo USD» sigue vigente y el kernel lo verifica en sus datos. |

El kernel añade funciones nuevas para PropMirror (`scaleLots`, `impliedSlDistance`, mapa de símbolos
canónicos). El emulador **no las importa**; con `sideEffects: false` no entran en su bundle.

## 6. Plan y verificación

Un solo commit atómico de cutover (borrar la copia y cambiar los imports están acoplados por tipos:
PHILOSOPHY §5.3), precedido por la documentación y seguido por el cableado de CI.

Verificación exigida antes del merge, toda con salida fresca:

1. Los cuatro gates de `CLAUDE.md` desde `emulador/`, más `npm run format:check`.
2. `npm run build` y `npm ci --dry-run`.
3. Gates del pipeline (`pytest`, `ruff check`, `ruff format --check`).
4. Aritmética de tests: 2699 − 34 (specs que se mudan) + 7 (contrato) = **2672**; 203 − 2 + 1 = **202** archivos.
5. Un deploy de preview de Vercel que cargue `/calculadora` y calcule un lote.
6. Auditoría final por un revisor que no escribió el cambio.

## 7. Riesgos

| Riesgo | Prob. | Impacto | Mitigación |
| :--- | :--- | :--- | :--- |
| El token caduca o se revoca | Media | CI y Vercel dejan de instalar; producción ya desplegada no se ve afectada | Fallo ruidoso en `npm ci`. Renovar el PAT y actualizar los tres sitios de D.21.4 |
| El paquete se borra de GitHub Packages | Baja | No se puede reconstruir el emulador | El repo del kernel reproduce el paquete desde el tag `v1.0.0` |
| Un bump del kernel cambia el dimensionado del replay | Baja | P&L simulado cambia sin intención | Versión exacta; spec de contrato; política SemVer del kernel (cambio de vector = *major*) |
| El registro del paquete gana un símbolo sin velas en R2, o al revés | Media a lo largo del tiempo | Catálogo y datos desalineados | Cadena de detectores de D.21.3 |

## 8. Tareas humanas (sin ruta MCP/CLI)

- Crear el PAT *classic* con `read:packages` y definirlo en el shell local.
- Añadir `NPM_GITHUB_TOKEN` en Vercel (Settings → Environment Variables, tres entornos).
- La protección de rama no cambia: los nombres de los checks de CI son los mismos.
