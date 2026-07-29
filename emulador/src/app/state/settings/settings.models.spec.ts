import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DISPLAY_SHIFT_HOURS,
  DISPLAY_SHIFTS,
  DISPLAY_SHIFT_PRESETS,
  NEW_YORK_SHIFT_HOURS,
  SERVER_SHIFT_HOURS,
} from './settings.models';

/**
 * The display-shift model, pinned against MEASURED facts about the broker clock.
 *
 * Candle timestamps are stored in the broker's server clock (FivePercentOnline-Real),
 * which runs at **New York + 7 h all year** — it follows US DST, so it is UTC+2 in
 * NY winter and UTC+3 in NY summer. They are deliberately NOT converted to true UTC
 * (D1 buckets are resampled on the server clock so a daily candle runs 17:00 → 17:00
 * ET, the FX/CFD trading day; see docs/engineering/domain/data-pipeline.md).
 *
 * So the number the dock stores is a SHIFT applied to server time, not a UTC offset,
 * and only a zone that switches DST on the same day as New York can be exact with a
 * constant integer.
 */

/** Epoch seconds of a server-clock wall time (stored timestamps read as if UTC). */
const stored = (serverWallTime: string) => Date.parse(`${serverWallTime}Z`) / 1000;

/** What the chart paints for a stored timestamp under a given shift. */
const displayed = (epoch: number, shiftHours: number) =>
  new Date((epoch + shiftHours * 3600) * 1000).toISOString().slice(0, 16).replace('T', ' ');

describe('display shift — the New York anchor', () => {
  it('puts the 09:30 ET cash open at 09:30 in NY summer', () => {
    // NY 09:30 on a July day is 16:30 on the server clock (NY + 7).
    expect(displayed(stored('2026-07-15T16:30:00'), NEW_YORK_SHIFT_HOURS)).toBe('2026-07-15 09:30');
  });

  it('puts the 09:30 ET cash open at 09:30 in NY winter too — one integer, all year', () => {
    // The server follows US DST, so the SAME stored wall time means the same NY hour
    // on both sides of the switch. That is what makes −7 exact rather than seasonal.
    expect(displayed(stored('2026-01-15T16:30:00'), NEW_YORK_SHIFT_HOURS)).toBe('2026-01-15 09:30');
  });

  it('puts the stored 23:49 daily close at 16:49 ET, just before the 17:00 roll', () => {
    expect(displayed(stored('2026-07-15T23:49:00'), NEW_YORK_SHIFT_HOURS)).toBe('2026-07-15 16:49');
  });

  it('leaves the stored clock untouched at the MT5 preset — the data is already server time', () => {
    expect(displayed(stored('2026-07-15T23:49:00'), SERVER_SHIFT_HOURS)).toBe('2026-07-15 23:49');
  });
});

describe('DISPLAY_SHIFT_PRESETS', () => {
  const byCode = (code: string) => DISPLAY_SHIFT_PRESETS.find((p) => p.code === code);

  it('shifts New York by −7, not the −5 a UTC reading would suggest', () => {
    expect(byCode('NY')?.value).toBe(-7);
  });

  it('shifts MT5 server time by 0, not the +3 a UTC reading would suggest', () => {
    expect(byCode('MT5')?.value).toBe(0);
  });

  it('marks New York and MT5 as the only exact presets', () => {
    expect(DISPLAY_SHIFT_PRESETS.filter((p) => p.exact).map((p) => p.code)).toEqual(['NY', 'MT5']);
  });

  it('marks every other preset approximate — a constant integer cannot track them', () => {
    // London/Madrid drift for the ~3 weeks the EU and US DST windows disagree;
    // Tokyo is never constant (+6 in NY summer, +7 in NY winter).
    for (const code of ['LDN', 'MAD', 'TYO']) {
      expect(byCode(code)?.exact, code).toBe(false);
    }
  });

  it('says so in the tooltip of every approximate preset', () => {
    for (const preset of DISPLAY_SHIFT_PRESETS.filter((p) => !p.exact)) {
      expect(preset.title.toLowerCase(), preset.code).toContain('aproximada');
    }
  });

  it('offers every preset value in the dropdown, so the active preset stays selectable', () => {
    const values = new Set(DISPLAY_SHIFTS.map((o) => o.value));
    for (const preset of DISPLAY_SHIFT_PRESETS) {
      expect(values.has(preset.value), preset.code).toBe(true);
    }
  });
});

describe('DISPLAY_SHIFTS (the dropdown)', () => {
  it('never labels a shift as a UTC offset — it is not one', () => {
    const lying = DISPLAY_SHIFTS.filter((o) => /utc/i.test(o.label));
    expect(lying).toEqual([]);
  });

  it('names a zone only where the model can back the claim', () => {
    // A named option carries " · <zone>"; it must be exact or marked approximate.
    const named = DISPLAY_SHIFTS.filter((o) => o.label.includes('·'));
    expect(named.length).toBeGreaterThan(0);
    for (const option of named) {
      const exact = option.value === NEW_YORK_SHIFT_HOURS || option.value === SERVER_SHIFT_HOURS;
      expect(exact || option.label.includes('aprox.'), option.label).toBe(true);
    }
  });

  it('keeps every integer in −12..+14 selectable, so no saved value becomes orphaned', () => {
    expect(DISPLAY_SHIFTS.map((o) => o.value)).toEqual(
      Array.from({ length: 27 }, (_, i) => i - 12),
    );
  });
});

describe('DEFAULT_DISPLAY_SHIFT_HOURS', () => {
  it('is the New York shift', () => {
    expect(DEFAULT_DISPLAY_SHIFT_HOURS).toBe(NEW_YORK_SHIFT_HOURS);
    expect(DEFAULT_DISPLAY_SHIFT_HOURS).toBe(-7);
  });
});
