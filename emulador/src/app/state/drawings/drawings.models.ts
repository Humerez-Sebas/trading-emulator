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

/** One recorded drawing lifecycle mutation, invertible for undo/redo. */
export interface DrawingCommand {
  kind: 'add' | 'move' | 'delete';
  drawingId: string;
  before: Drawing | null; // null for add
  after: Drawing | null; // null for delete
  resultRev: number; // revisions[drawingId] AFTER this command applied
}

/** A single panel's undo/redo command stacks. */
export interface PanelHistory {
  undo: DrawingCommand[];
  redo: DrawingCommand[];
}

/**
 * Per-panel undo stack depth. A bounded stack keeps memory flat across a long
 * session while staying far deeper than any realistic correction run.
 */
export const HISTORY_LIMIT = 50;

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
  /** Runtime-only, monotonic per-drawing revision counter; never persisted. */
  revisions: Record<string, number>;
  /** Runtime-only, panelId -> that panel's undo/redo stacks; never persisted. */
  history: Record<string, PanelHistory>;
}

/** Standard Fibonacci retracement levels. */
export const FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
