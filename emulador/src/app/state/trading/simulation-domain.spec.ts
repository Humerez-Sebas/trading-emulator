import { describe, expect, it } from 'vitest';
import { validateOrderGeometry, validateSlModification } from './simulation-domain';

// ---- RFC-014 Task 4a: SimulationDomain (I-14 order geometry, I-15 SL
// non-widening) — V-10 truth tables. Pure functions, no store/engine
// involved; the reducer-integration coverage lives in
// `trading.reducer.domain.spec.ts`. ----

describe('validateOrderGeometry (I-14 Order Geometry Coherence)', () => {
  describe('buy', () => {
    it('valid: sl below entry, tp above entry', () => {
      expect(validateOrderGeometry('buy', 4000, 3990, 4020)).toBe(true);
    });

    it('valid: sl below entry, tp = null (no take profit)', () => {
      expect(validateOrderGeometry('buy', 4000, 3990, null)).toBe(true);
    });

    it('invalid: sl === entry (boundary equality)', () => {
      expect(validateOrderGeometry('buy', 4000, 4000, 4020)).toBe(false);
    });

    it('invalid: sl above entry (wrong side)', () => {
      expect(validateOrderGeometry('buy', 4000, 4010, 4020)).toBe(false);
    });

    it('invalid: tp === entry (boundary equality)', () => {
      expect(validateOrderGeometry('buy', 4000, 3990, 4000)).toBe(false);
    });

    it('invalid: tp below entry (wrong side)', () => {
      expect(validateOrderGeometry('buy', 4000, 3990, 3995)).toBe(false);
    });

    it('invalid: both sl and tp on the wrong side', () => {
      expect(validateOrderGeometry('buy', 4000, 4010, 3990)).toBe(false);
    });
  });

  describe('sell (symmetric)', () => {
    it('valid: sl above entry, tp below entry', () => {
      expect(validateOrderGeometry('sell', 4000, 4010, 3980)).toBe(true);
    });

    it('valid: sl above entry, tp = null (no take profit)', () => {
      expect(validateOrderGeometry('sell', 4000, 4010, null)).toBe(true);
    });

    it('invalid: sl === entry (boundary equality)', () => {
      expect(validateOrderGeometry('sell', 4000, 4000, 3980)).toBe(false);
    });

    it('invalid: sl below entry (wrong side)', () => {
      expect(validateOrderGeometry('sell', 4000, 3990, 3980)).toBe(false);
    });

    it('invalid: tp === entry (boundary equality)', () => {
      expect(validateOrderGeometry('sell', 4000, 4010, 4000)).toBe(false);
    });

    it('invalid: tp above entry (wrong side)', () => {
      expect(validateOrderGeometry('sell', 4000, 4010, 4005)).toBe(false);
    });

    it('invalid: both sl and tp on the wrong side', () => {
      expect(validateOrderGeometry('sell', 4000, 3990, 4010)).toBe(false);
    });
  });
});

describe('validateSlModification (I-15 SL Non-Widening)', () => {
  describe('long (buy): tighten = move toward/past entry (increase)', () => {
    it('accepts a tighten (nextSl > currentSl)', () => {
      expect(validateSlModification('buy', 3990, 3995)).toBe(true);
    });

    it('accepts an equal SL (no-op move)', () => {
      expect(validateSlModification('buy', 3990, 3990)).toBe(true);
    });

    it('rejects a widen (nextSl < currentSl)', () => {
      expect(validateSlModification('buy', 3990, 3950)).toBe(false);
    });
  });

  describe('short (sell): tighten = move toward/past entry (decrease)', () => {
    it('accepts a tighten (nextSl < currentSl)', () => {
      expect(validateSlModification('sell', 4010, 4005)).toBe(true);
    });

    it('accepts an equal SL (no-op move)', () => {
      expect(validateSlModification('sell', 4010, 4010)).toBe(true);
    });

    it('rejects a widen (nextSl > currentSl)', () => {
      expect(validateSlModification('sell', 4010, 4050)).toBe(false);
    });
  });
});
