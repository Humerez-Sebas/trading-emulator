import { describe, expect, it } from 'vitest';
import {
  fromDisplayTime,
  isUsDst,
  NEW_YORK_ZONE_ID,
  resolveDisplayZone,
  serverUtcOffsetHours,
  SERVER_ZONE_ID,
  storedToUtc,
  toDisplayTime,
  utcToStored,
} from './display-time';

/**
 * Display time, from measured facts about the broker clock.
 *
 * Candle timestamps are stored in the server clock of FivePercentOnline-Real,
 * which runs at **New York + 7 h all year**. Because it follows US DST it is
 * UTC+2 while New York is on EST and UTC+3 while New York is on EDT — so the
 * stored clock is NOT UTC, and recovering the true instant needs the US rule.
 *
 * Two families of zone come out of that:
 *  - server-relative (`ny`, `server`): a constant shift over the stored clock,
 *    which tracks US DST for free because the server does.
 *  - utc-fixed (`utc-4`, `utc+9`, …): a real, DST-less UTC offset. Exact for
 *    zones without DST (Tokyo, La Paz); for zones with DST it stays put while
 *    the zone moves — which is the whole point of picking a fixed offset.
 */

/** Epoch seconds of a server-clock wall time (stored timestamps read as if UTC). */
const stored = (serverWallTime: string) => Date.parse(`${serverWallTime}Z`) / 1000;

/** Renders an epoch as a wall clock (the chart reads display epochs as UTC). */
const wall = (epoch: number) => new Date(epoch * 1000).toISOString().slice(0, 16).replace('T', ' ');

/**
 * The stored timestamp of the 09:30 ET cash open: New York + 7 h = 16:30 on the
 * server clock, in either season (the server follows the same DST New York does).
 */
const NY_OPEN_SUMMER = stored('2026-07-15T16:30:00');
const NY_OPEN_WINTER = stored('2026-01-15T16:30:00');

describe('isUsDst — the 2026 boundaries', () => {
  // 2026-03-01 and 2026-11-01 both fall on a Sunday, so DST runs Mar 8 → Nov 1.
  it('is off the instant before the March switch', () => {
    expect(isUsDst(Date.parse('2026-03-08T01:59:00Z') / 1000)).toBe(false);
  });

  it('is on from 02:00 New York wall time on the second Sunday of March', () => {
    expect(isUsDst(Date.parse('2026-03-08T02:00:00Z') / 1000)).toBe(true);
  });

  it('is still on the instant before the November switch', () => {
    expect(isUsDst(Date.parse('2026-11-01T01:59:00Z') / 1000)).toBe(true);
  });

  it('is off from 02:00 on the first Sunday of November', () => {
    expect(isUsDst(Date.parse('2026-11-01T02:00:00Z') / 1000)).toBe(false);
  });

  it('is off in deep winter and on in midsummer', () => {
    expect(isUsDst(Date.parse('2026-01-15T12:00:00Z') / 1000)).toBe(false);
    expect(isUsDst(Date.parse('2026-07-15T12:00:00Z') / 1000)).toBe(true);
  });
});

describe('serverUtcOffsetHours', () => {
  it('is +3 while New York is on daylight time', () => {
    expect(serverUtcOffsetHours(NY_OPEN_SUMMER)).toBe(3);
  });

  it('is +2 while New York is on standard time', () => {
    expect(serverUtcOffsetHours(NY_OPEN_WINTER)).toBe(2);
  });
});

describe('storedToUtc — the measured live tick', () => {
  it('reads a July stored 19:07 back as 16:07 true UTC (+3)', () => {
    expect(wall(storedToUtc(stored('2026-07-29T19:07:00')))).toBe('2026-07-29 16:07');
  });

  it('reads a January stored 19:07 back as 17:07 true UTC (+2)', () => {
    expect(wall(storedToUtc(stored('2026-01-29T19:07:00')))).toBe('2026-01-29 17:07');
  });

  it('round-trips through utcToStored in both seasons', () => {
    for (const t of [NY_OPEN_SUMMER, NY_OPEN_WINTER]) {
      expect(utcToStored(storedToUtc(t))).toBe(t);
    }
  });

  it('stays monotonic across the spring-forward gap', () => {
    // The server wall clock jumps +1 h with New York, and the offset goes +2 → +3,
    // so the recovered instant is continuous rather than jumping back.
    const before = storedToUtc(stored('2026-03-08T01:59:00') + 7 * 3600);
    const after = storedToUtc(stored('2026-03-08T03:00:00') + 7 * 3600);
    expect(after).toBeGreaterThan(before);
  });
});

describe('the "Nueva York" zone (server-relative, DST automatic)', () => {
  const ny = resolveDisplayZone(NEW_YORK_ZONE_ID);

  it('shows the cash open at 09:30 in summer', () => {
    expect(wall(toDisplayTime(NY_OPEN_SUMMER, ny))).toBe('2026-07-15 09:30');
  });

  it('shows the cash open at 09:30 in winter too — it moves with the zone', () => {
    expect(wall(toDisplayTime(NY_OPEN_WINTER, ny))).toBe('2026-01-15 09:30');
  });

  it('cuts the daily candle at 17:00 ET in both seasons', () => {
    // A D1 bucket opens at 00:00 on the server clock.
    expect(wall(toDisplayTime(stored('2026-07-16T00:00:00'), ny))).toBe('2026-07-15 17:00');
    expect(wall(toDisplayTime(stored('2026-01-16T00:00:00'), ny))).toBe('2026-01-15 17:00');
  });

  it('is exactly the constant −7 h shift the previous model applied', () => {
    for (const t of [NY_OPEN_SUMMER, NY_OPEN_WINTER]) {
      expect(toDisplayTime(t, ny)).toBe(t - 7 * 3600);
    }
  });
});

describe('the "Servidor MT5" zone (server-relative, no shift)', () => {
  const server = resolveDisplayZone(SERVER_ZONE_ID);

  it('shows the stored clock verbatim', () => {
    expect(wall(toDisplayTime(NY_OPEN_SUMMER, server))).toBe('2026-07-15 16:30');
    expect(wall(toDisplayTime(NY_OPEN_WINTER, server))).toBe('2026-01-15 16:30');
  });
});

describe('a fixed UTC offset does NOT follow the zone', () => {
  const utcMinus4 = resolveDisplayZone('utc-4');
  const utcMinus5 = resolveDisplayZone('utc-5');

  it('UTC−4 shows the New York open at 09:30 from March to November', () => {
    expect(wall(toDisplayTime(NY_OPEN_SUMMER, utcMinus4))).toBe('2026-07-15 09:30');
  });

  it('UTC−4 shows the same open at 10:30 in winter — the clock stayed, the zone moved', () => {
    expect(wall(toDisplayTime(NY_OPEN_WINTER, utcMinus4))).toBe('2026-01-15 10:30');
  });

  it('UTC−5 is the winter choice that puts it back at 09:30', () => {
    expect(wall(toDisplayTime(NY_OPEN_WINTER, utcMinus5))).toBe('2026-01-15 09:30');
  });

  it('UTC+0 is true UTC', () => {
    expect(wall(toDisplayTime(stored('2026-07-15T23:49:00'), resolveDisplayZone('utc+0')))).toBe(
      '2026-07-15 20:49',
    );
  });

  it('is exact all year for a zone without DST (Tokyo = UTC+9)', () => {
    const tokyo = resolveDisplayZone('utc+9');
    // 09:00 Tokyo is 00:00 UTC; stored is that instant on the server clock.
    expect(wall(toDisplayTime(utcToStored(Date.parse('2026-07-15T00:00:00Z') / 1000), tokyo))).toBe(
      '2026-07-15 09:00',
    );
    expect(wall(toDisplayTime(utcToStored(Date.parse('2026-01-15T00:00:00Z') / 1000), tokyo))).toBe(
      '2026-01-15 09:00',
    );
  });
});

describe('fromDisplayTime is the inverse of toDisplayTime', () => {
  for (const id of [NEW_YORK_ZONE_ID, SERVER_ZONE_ID, 'utc-4', 'utc+0', 'utc+9']) {
    it(`round-trips both seasons for ${id}`, () => {
      const zone = resolveDisplayZone(id);
      for (const t of [NY_OPEN_SUMMER, NY_OPEN_WINTER]) {
        expect(fromDisplayTime(toDisplayTime(t, zone), zone)).toBe(t);
      }
    });
  }
});

describe('resolveDisplayZone', () => {
  it('returns the SAME object for the same id, so render models stay memo-friendly', () => {
    expect(resolveDisplayZone('utc-4')).toBe(resolveDisplayZone('utc-4'));
  });

  it('falls back to New York for an unknown or legacy stored value', () => {
    // Pre-existing installs hold a NUMBER under the old `utcOffset` key; anything
    // that is not a known zone id must land on the default rather than guess.
    expect(resolveDisplayZone('-7').id).toBe(NEW_YORK_ZONE_ID);
    expect(resolveDisplayZone('').id).toBe(NEW_YORK_ZONE_ID);
    expect(resolveDisplayZone('utc+99').id).toBe(NEW_YORK_ZONE_ID);
  });
});
