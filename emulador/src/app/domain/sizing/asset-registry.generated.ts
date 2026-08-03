// GENERATED FILE — do not edit by hand.
// Produced by `py pipeline/export_symbols.py` (RFC-020, D.20.4).
// Provenance: mt5:Five Percent Online Ltd@2026-08-03

/** Raw MT5 `symbol_info()` fields this kernel needs. No `pipSize` here
 * on purpose: it is a name-derived convention, not an MT5 field --
 * `asset-registry.ts` computes it independently of provenance. */
export interface GeneratedAssetRecord {
  readonly contractSize: number;
  readonly tickSize: number;
  readonly volumeStep: number;
  readonly volumeMin: number;
  readonly digits: number;
  readonly currency: string;
}

export const GENERATED_SOURCE = 'mt5:Five Percent Online Ltd@2026-08-03';

export const GENERATED_ASSETS: Readonly<Record<string, GeneratedAssetRecord>> = {
  NAS100: {
    contractSize: 1,
    tickSize: 0.01,
    volumeStep: 0.01,
    volumeMin: 0.01,
    digits: 2,
    currency: 'USD',
  },
  SP500: {
    contractSize: 1,
    tickSize: 0.01,
    volumeStep: 0.01,
    volumeMin: 0.01,
    digits: 2,
    currency: 'USD',
  },
  US30: {
    contractSize: 1,
    tickSize: 0.01,
    volumeStep: 0.01,
    volumeMin: 0.01,
    digits: 2,
    currency: 'USD',
  },
  XAUUSD: {
    contractSize: 100,
    tickSize: 0.01,
    volumeStep: 0.01,
    volumeMin: 0.01,
    digits: 2,
    currency: 'USD',
  },
};
