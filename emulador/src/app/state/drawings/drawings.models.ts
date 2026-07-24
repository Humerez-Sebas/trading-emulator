export type DrawingTool = 'none' | 'rect' | 'line' | 'fib' | 'ruler';
export type DrawingType = Exclude<DrawingTool, 'none'>;

/** Data-anchored point: time in UTC seconds (without the display offset). */
export interface DrawingPoint {
  time: number;
  price: number;
}

/** The composition namespace a drawing belongs to: a single panel, or a whole link group. */
export interface DrawingOwner {
  type: 'panel' | 'group';
  id: string; // panelId | linkGroupId
}

export interface Drawing {
  id: string;
  symbol: string;
  owner: DrawingOwner;
  kind: DrawingType;
  p1: DrawingPoint;
  p2: DrawingPoint;
  zIndex: number;
  locked: boolean;
  visible: boolean;
}

export interface DrawingsState {
  /** All session drawings, every symbol and owner, keyed by id. */
  entities: Record<string, Drawing>;
  /** `ownerKeyOf()` ('panel:<id>' | 'group:<id>') -> the ids it owns, maintained incrementally. */
  ownerIndex: Record<string, readonly string[]>;
  /** panelId -> the id that panel currently has selected (or null). */
  selection: Record<string, string | null>;
  activeTool: DrawingTool;
  /** Monotonic z-order counter; every new drawing takes `nextZ` and bumps it. */
  nextZ: number;
}

/** Standard Fibonacci retracement levels. */
export const FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
