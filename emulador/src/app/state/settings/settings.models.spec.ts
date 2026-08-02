import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DISPLAY_ZONE_ID,
  DISPLAY_ZONE_OPTIONS,
  DISPLAY_ZONE_PRESETS,
} from './settings.models';
import {
  MAX_UTC_OFFSET_HOURS,
  MIN_UTC_OFFSET_HOURS,
  NEW_YORK_ZONE_ID,
  resolveDisplayZone,
  SERVER_ZONE_ID,
  toDisplayTime,
  utcZoneId,
} from '../../domain/chart/display-time';

/**
 * The picker's contract. The arithmetic itself lives in
 * `domain/chart/display-time.spec.ts`; what is pinned here is that every option
 * the user can click resolves to a real zone and that no label overclaims.
 */

/** Epoch seconds of a server-clock wall time (stored timestamps read as if UTC). */
const stored = (serverWallTime: string) => Date.parse(`${serverWallTime}Z`) / 1000;
const wall = (epoch: number) => new Date(epoch * 1000).toISOString().slice(11, 16);

describe('DEFAULT_DISPLAY_ZONE_ID', () => {
  it('is New York with automatic DST', () => {
    expect(DEFAULT_DISPLAY_ZONE_ID).toBe(NEW_YORK_ZONE_ID);
  });

  it('paints the 09:30 ET open at 09:30 in both seasons', () => {
    const zone = resolveDisplayZone(DEFAULT_DISPLAY_ZONE_ID);
    expect(wall(toDisplayTime(stored('2026-07-15T16:30:00'), zone))).toBe('09:30');
    expect(wall(toDisplayTime(stored('2026-01-15T16:30:00'), zone))).toBe('09:30');
  });
});

describe('DISPLAY_ZONE_PRESETS', () => {
  const byCode = (code: string) => DISPLAY_ZONE_PRESETS.find((p) => p.code === code);

  it('points NY and MT5 at the two automatic zones', () => {
    expect(byCode('NY')?.id).toBe(NEW_YORK_ZONE_ID);
    expect(byCode('MT5')?.id).toBe(SERVER_ZONE_ID);
  });

  it('points the rest at real fixed UTC offsets', () => {
    expect(byCode('LDN')?.id).toBe(utcZoneId(0));
    expect(byCode('MAD')?.id).toBe(utcZoneId(1));
    expect(byCode('TYO')?.id).toBe(utcZoneId(9));
  });

  it('marks Tokyo exact — Japan has no DST, so a fixed offset tracks it all year', () => {
    expect(byCode('TYO')?.exact).toBe(true);
  });

  it('marks London and Madrid approximate — a fixed offset loses them in summer', () => {
    expect(byCode('LDN')?.exact).toBe(false);
    expect(byCode('MAD')?.exact).toBe(false);
  });

  it('says so in the tooltip of every approximate preset', () => {
    for (const preset of DISPLAY_ZONE_PRESETS.filter((p) => !p.exact)) {
      expect(preset.title.toLowerCase(), preset.code).toContain('verano');
    }
  });

  it('resolves every preset id to the zone it names, never to the fallback', () => {
    for (const preset of DISPLAY_ZONE_PRESETS) {
      expect(resolveDisplayZone(preset.id).id, preset.code).toBe(preset.id);
    }
  });

  it('offers every preset in the dropdown, so the active preset stays selectable', () => {
    const values = new Set(DISPLAY_ZONE_OPTIONS.map((o) => o.value));
    for (const preset of DISPLAY_ZONE_PRESETS) {
      expect(values.has(preset.id), preset.code).toBe(true);
    }
  });
});

describe('DISPLAY_ZONE_OPTIONS', () => {
  it('leads with the two automatic zones and says they are automatic', () => {
    expect(DISPLAY_ZONE_OPTIONS[0].value).toBe(NEW_YORK_ZONE_ID);
    expect(DISPLAY_ZONE_OPTIONS[0].label).toMatch(/autom/i);
    expect(DISPLAY_ZONE_OPTIONS[1].value).toBe(SERVER_ZONE_ID);
    expect(DISPLAY_ZONE_OPTIONS[1].label).toMatch(/autom/i);
  });

  it('then offers every whole-hour UTC offset from −12 to +14', () => {
    const fixed = DISPLAY_ZONE_OPTIONS.slice(2).map((o) => o.value);
    const expected = Array.from(
      { length: MAX_UTC_OFFSET_HOURS - MIN_UTC_OFFSET_HOURS + 1 },
      (_, i) => utcZoneId(MIN_UTC_OFFSET_HOURS + i),
    );
    expect(fixed).toEqual(expected);
  });

  it('labels every fixed option as the UTC offset it actually is', () => {
    for (const option of DISPLAY_ZONE_OPTIONS.slice(2)) {
      const zone = resolveDisplayZone(option.value);
      expect(zone.kind, option.value).toBe('utc-fixed');
      const signed = zone.kind === 'utc-fixed' ? zone.offsetHours : NaN;
      const sign = signed < 0 ? '−' : '+';
      expect(option.label.startsWith(`UTC${sign}${Math.abs(signed)}`), option.label).toBe(true);
    }
  });

  it('every option resolves to itself — no entry silently falls back to New York', () => {
    for (const option of DISPLAY_ZONE_OPTIONS) {
      expect(resolveDisplayZone(option.value).id, option.value).toBe(option.value);
    }
  });
});
