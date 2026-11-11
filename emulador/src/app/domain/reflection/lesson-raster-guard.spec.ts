import { describe, expect, it } from 'vitest';
import { findRasterViolation } from './lesson-raster-guard';

const base = { whatHappened: 'a', repeat: 'b', avoid: 'c', evidence: [] };

describe('findRasterViolation (J-1)', () => {
  it('returns null for plain prose, including words like base64 or blob:', () => {
    expect(findRasterViolation(base)).toBeNull();
    expect(
      findRasterViolation({ ...base, avoid: 'decodifiqué un base64 y un blob: raro' }),
    ).toBeNull();
    expect(findRasterViolation({ ...base, repeat: 'vi data:image en un tutorial' })).toBeNull();
  });

  it('flags a complete pasted image data URI in any free-text field', () => {
    for (const field of ['whatHappened', 'repeat', 'avoid'] as const) {
      expect(findRasterViolation({ ...base, [field]: 'x data:image/png;base64,AAA' })).toBe(
        'free-text',
      );
    }
  });

  it('flags any raster pattern inside evidence', () => {
    expect(findRasterViolation({ ...base, evidence: [{ note: 'blob:abc' }] as never })).toBe(
      'evidence',
    );
    expect(findRasterViolation({ ...base, evidence: [{ n: 'base64' }] as never })).toBe('evidence');
  });
});
