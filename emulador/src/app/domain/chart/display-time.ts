/**
 * Display time: turning a stored candle timestamp into the clock the user reads.
 *
 * Candle timestamps are stored in the server clock of the broker
 * (FivePercentOnline-Real), which runs at **New York + 7 h all year**. Because it
 * follows US daylight saving, that clock is UTC+2 while New York is on EST and
 * UTC+3 while New York is on EDT — so a stored timestamp is NOT a UTC instant,
 * and recovering the true instant needs the US DST rule.
 *
 * They are stored that way deliberately: the pipeline resamples D1 buckets on the
 * server clock, so a daily candle runs 17:00 → 17:00 New York — the FX/CFD trading
 * day MT5 and TradingView show. Converting at rest would cut every daily at 20:00
 * ET and break the R2 parquet contract (docs/engineering/domain/data-pipeline.md).
 *
 * Two families of display zone follow from that:
 *
 * - **server-relative** (`ny`, `server`): a constant shift over the stored clock.
 *   These track US DST for free, because the stored clock already does. `ny` is a
 *   constant −7 h and is exact all year.
 * - **utc-fixed** (`utc-4`, `utc+9`, …): a real UTC offset, which by definition
 *   does not move. Exact all year for zones without DST (Tokyo, La Paz); for a
 *   zone that does observe DST the clock stays put while the zone shifts, which
 *   is precisely what picking a fixed offset means.
 *
 * Pure module: no Angular, no NgRx (the chart engine imports it).
 */

/** The stored server clock minus this many hours gives New York wall time. */
export const SERVER_MINUS_NEW_YORK_HOURS = 7;

/** UTC offset of the server clock while New York is on standard time. */
const SERVER_UTC_OFFSET_STANDARD = 2;

/** UTC offset of the server clock while New York is on daylight time. */
const SERVER_UTC_OFFSET_DAYLIGHT = 3;

export const NEW_YORK_ZONE_ID = 'ny';
export const SERVER_ZONE_ID = 'server';

/** Bounds of the fixed UTC offsets the picker exposes. */
export const MIN_UTC_OFFSET_HOURS = -12;
export const MAX_UTC_OFFSET_HOURS = 14;

export type DisplayZone =
  | { id: string; kind: 'server-relative'; shiftHours: number }
  | { id: string; kind: 'utc-fixed'; offsetHours: number };

/** Canonical id of a fixed UTC offset, e.g. `utc-4`, `utc+0`, `utc+9`. */
export function utcZoneId(offsetHours: number): string {
  return `utc${offsetHours < 0 ? '-' : '+'}${Math.abs(offsetHours)}`;
}

/**
 * US DST boundaries for a year, as New York wall-clock epoch seconds: daylight
 * time runs from 02:00 on the second Sunday of March to 02:00 on the first Sunday
 * of November. Cached per year — the hot path calls this once per candle.
 */
const dstBoundsCache = new Map<number, { start: number; end: number }>();

function dstBounds(year: number): { start: number; end: number } {
  const cached = dstBoundsCache.get(year);
  if (cached) return cached;

  /** Epoch seconds of 02:00 on the `nth` Sunday of `month` (0-based month). */
  const nthSundayAt2 = (month: number, nth: number): number => {
    const firstDow = new Date(Date.UTC(year, month, 1)).getUTCDay();
    const firstSunday = 1 + ((7 - firstDow) % 7);
    return Date.UTC(year, month, firstSunday + (nth - 1) * 7, 2) / 1000;
  };

  const bounds = { start: nthSundayAt2(2, 2), end: nthSundayAt2(10, 1) };
  dstBoundsCache.set(year, bounds);
  return bounds;
}

/**
 * Whether a New York wall-clock instant falls in US daylight time. The argument
 * is a wall clock encoded as an epoch (read as UTC), not a true instant — which
 * is exactly the form the DST rule is written in ("02:00 local").
 */
export function isUsDst(newYorkWallEpoch: number): boolean {
  const year = new Date(newYorkWallEpoch * 1000).getUTCFullYear();
  const { start, end } = dstBounds(year);
  return newYorkWallEpoch >= start && newYorkWallEpoch < end;
}

/** UTC offset of the server clock at a stored instant: +2 or +3. */
export function serverUtcOffsetHours(storedEpoch: number): number {
  // The server is New York + 7 h by definition, in either season, so the New York
  // wall clock is recoverable without knowing the DST state first.
  const newYorkWall = storedEpoch - SERVER_MINUS_NEW_YORK_HOURS * 3600;
  return isUsDst(newYorkWall) ? SERVER_UTC_OFFSET_DAYLIGHT : SERVER_UTC_OFFSET_STANDARD;
}

/** Stored (server-clock) epoch -> the true UTC instant. */
export function storedToUtc(storedEpoch: number): number {
  return storedEpoch - serverUtcOffsetHours(storedEpoch) * 3600;
}

/**
 * True UTC instant -> the stored (server-clock) epoch.
 *
 * Resolved by trying daylight time first and falling back to standard: the DST
 * state cannot be read off a UTC instant directly. The one hour that repeats at
 * the November switch is genuinely ambiguous and resolves to standard time; no
 * candle lives there, because both switches happen inside the weekend close.
 */
export function utcToStored(utcEpoch: number): number {
  const asDaylight = utcEpoch + SERVER_UTC_OFFSET_DAYLIGHT * 3600;
  if (serverUtcOffsetHours(asDaylight) === SERVER_UTC_OFFSET_DAYLIGHT) return asDaylight;
  return utcEpoch + SERVER_UTC_OFFSET_STANDARD * 3600;
}

const zoneCache = new Map<string, DisplayZone>();

function cache(zone: DisplayZone): DisplayZone {
  const frozen = Object.freeze(zone);
  zoneCache.set(zone.id, frozen);
  return frozen;
}

/**
 * Resolves a persisted zone id. Returns the SAME frozen object for a given id, so
 * render models carrying a zone stay comparable by reference.
 *
 * Anything unrecognised — including the numeric values written by the previous
 * `utcOffset` setting — falls back to New York rather than being reinterpreted,
 * because the old numbers meant a shift over server time, not a UTC offset.
 */
export function resolveDisplayZone(id: string): DisplayZone {
  const cached = zoneCache.get(id);
  if (cached) return cached;

  if (id === SERVER_ZONE_ID) {
    return cache({ id: SERVER_ZONE_ID, kind: 'server-relative', shiftHours: 0 });
  }
  if (id.startsWith('utc')) {
    const offsetHours = Number(id.slice(3));
    if (
      Number.isInteger(offsetHours) &&
      offsetHours >= MIN_UTC_OFFSET_HOURS &&
      offsetHours <= MAX_UTC_OFFSET_HOURS &&
      utcZoneId(offsetHours) === id
    ) {
      return cache({ id, kind: 'utc-fixed', offsetHours });
    }
  }
  return (
    zoneCache.get(NEW_YORK_ZONE_ID) ??
    cache({
      id: NEW_YORK_ZONE_ID,
      kind: 'server-relative',
      shiftHours: -SERVER_MINUS_NEW_YORK_HOURS,
    })
  );
}

/** Stored epoch -> the epoch to render (a wall clock the chart reads as UTC). */
export function toDisplayTime(storedEpoch: number, zone: DisplayZone): number {
  return zone.kind === 'server-relative'
    ? storedEpoch + zone.shiftHours * 3600
    : storedToUtc(storedEpoch) + zone.offsetHours * 3600;
}

/** Inverse of `toDisplayTime`: a rendered wall clock -> the stored epoch. */
export function fromDisplayTime(displayEpoch: number, zone: DisplayZone): number {
  return zone.kind === 'server-relative'
    ? displayEpoch - zone.shiftHours * 3600
    : utcToStored(displayEpoch - zone.offsetHours * 3600);
}
