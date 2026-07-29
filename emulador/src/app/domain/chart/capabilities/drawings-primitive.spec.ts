import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DrawingsPrimitive, distToSegment, fibLevelY, FIB_LEVELS } from './drawings-primitive';
import type { IChartApi, ISeriesApi } from 'lightweight-charts';
import type { Drawing, DrawingPoint } from '../render-model';
import type { DrawingsSource } from './drawings-primitive';

function point(time: number, price: number): DrawingPoint {
  return { time, price };
}

function drawing(id: string, kind: Drawing['kind'], p1: DrawingPoint, p2: DrawingPoint): Drawing {
  return { id, kind, p1, p2 };
}

function baseSource(items: Drawing[]): DrawingsSource {
  return {
    items,
    draft: null,
    selectedId: null,
    shift: 0,
    times: [],
    barSpacing: 0,
    pointSize: 0.01,
    accent: '#2962FF',
    up: '#26A69A',
    down: '#EF5350',
  };
}

describe('distToSegment (module-level, RFC-019 D19.B extraction)', () => {
  it('returns 0 for a point on the segment', () => {
    expect(distToSegment(50, 0, 0, 0, 100, 0)).toBe(0);
  });

  it('returns the perpendicular distance for a point off the segment', () => {
    expect(distToSegment(50, 10, 0, 0, 100, 0)).toBe(10);
  });

  it('clamps to the nearest endpoint beyond the segment', () => {
    expect(distToSegment(150, 0, 0, 0, 100, 0)).toBe(50);
  });

  it('handles degenerate (zero-length) segments as a point distance', () => {
    expect(distToSegment(3, 4, 0, 0, 0, 0)).toBe(5);
  });
});

describe('fibLevelY (shared by drawFib and hitTestDrawing, N19-5)', () => {
  it('returns y1 at level 0', () => {
    expect(fibLevelY(10, 110, 0)).toBe(10);
  });

  it('returns y2 at level 1', () => {
    expect(fibLevelY(10, 110, 1)).toBe(110);
  });

  it('interpolates linearly at intermediate levels', () => {
    expect(fibLevelY(0, 100, 0.5)).toBe(50);
    expect(fibLevelY(0, 100, 0.236)).toBeCloseTo(23.6);
  });
});

describe('DrawingsPrimitive.hitTestDrawing — painted-geometry hit-test (RFC-019 D19.B)', () => {
  let primitive: DrawingsPrimitive;
  let series: ISeriesApi<'Candlestick'>;

  beforeEach(() => {
    primitive = new DrawingsPrimitive();
    primitive.chart = {} as IChartApi;
    // Identity mapping: x === time, y === price. Lets fixtures pick screen
    // coordinates directly through p1/p2 without mocking lightweight-charts'
    // timeScale internals (xForTime/timeForX delegate to it).
    primitive.xForTime = (t: number) => t;
    primitive.timeForX = (x: number) => x;
    series = {
      priceToCoordinate: vi.fn((p: number) => p),
    } as unknown as ISeriesApi<'Candlestick'>;
    primitive.series = series;
  });

  function setItems(items: Drawing[]): void {
    primitive.source = baseSource(items);
  }

  it('1. click at the geometric centre of a large rect -> null (interior no longer selects)', () => {
    setItems([drawing('r1', 'rect', point(0, 0), point(100, 100))]);
    expect(primitive.hitTestDrawing(50, 50)).toBeNull();
  });

  it('2. click within 6px of the rect top edge -> the rect id', () => {
    setItems([drawing('r1', 'rect', point(0, 0), point(100, 100))]);
    expect(primitive.hitTestDrawing(50, 3)).toBe('r1');
  });

  it('3. click within 6px of the rect left edge -> the rect id', () => {
    setItems([drawing('r1', 'rect', point(0, 0), point(100, 100))]);
    expect(primitive.hitTestDrawing(3, 50)).toBe('r1');
  });

  it('4. click on a fib level line -> the fib id', () => {
    setItems([drawing('f1', 'fib', point(0, 0), point(100, 100))]);
    // level 0.5 -> y = 50 (fibLevelY(0, 100, 0.5))
    expect(primitive.hitTestDrawing(50, 50)).toBe('f1');
  });

  it('5. click midway between two fib levels -> null', () => {
    setItems([drawing('f1', 'fib', point(0, 0), point(100, 100))]);
    // levels 0 and 0.236 -> y = 0 and y = 23.6; midpoint y = 11.8 is > 6px
    // from either, so no level line is hit.
    expect(FIB_LEVELS[0]).toBe(0);
    expect(FIB_LEVELS[1]).toBe(0.236);
    expect(primitive.hitTestDrawing(50, 11.8)).toBeNull();
  });

  it('6. 2px-tall rect, click anywhere on it -> still selectable (thin-shape guard)', () => {
    setItems([drawing('r1', 'rect', point(0, 0), point(100, 2))]);
    // Centre point, 1px from both the top and bottom edge (both within tol).
    expect(primitive.hitTestDrawing(50, 1)).toBe('r1');
  });

  it('7a. line: unchanged full-segment behavior (hit near the segment)', () => {
    setItems([drawing('l1', 'line', point(0, 0), point(100, 100))]);
    expect(primitive.hitTestDrawing(50, 50)).toBe('l1');
  });

  it('7b. line: unchanged full-segment behavior (miss far from the segment)', () => {
    setItems([drawing('l1', 'line', point(0, 0), point(100, 100))]);
    expect(primitive.hitTestDrawing(50, 80)).toBeNull();
  });

  it('7c. ruler: unchanged full-segment behavior (hit near the segment)', () => {
    setItems([drawing('u1', 'ruler', point(0, 0), point(100, 100))]);
    expect(primitive.hitTestDrawing(50, 50)).toBe('u1');
  });

  it('7d. ruler: unchanged full-segment behavior (miss far from the segment)', () => {
    setItems([drawing('u1', 'ruler', point(0, 0), point(100, 100))]);
    expect(primitive.hitTestDrawing(50, 80)).toBeNull();
  });

  it("8. overlapping rects, click the lower one's exposed edge -> the lower one's id", () => {
    // rectA (bottom, drawn first): x 0..200, y 0..100.
    // rectB (top, drawn last): x 150..250, y 10..90 — its bounding box
    // covers a point on rectA's right edge, but none of rectB's own strokes
    // pass near that point. Old area hit-testing would have claimed rectB
    // (point inside its bbox); the new stroke-only hit-test must fall
    // through to rectA, whose right edge (x=200) is actually there.
    const rectA = drawing('rectA', 'rect', point(0, 0), point(200, 100));
    const rectB = drawing('rectB', 'rect', point(150, 10), point(250, 90));
    setItems([rectA, rectB]);
    expect(primitive.hitTestDrawing(200, 50)).toBe('rectA');
  });
});
