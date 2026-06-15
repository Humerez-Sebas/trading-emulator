export type DrawingTool = 'none' | 'rect' | 'line' | 'fib' | 'ruler';
export type DrawingType = Exclude<DrawingTool, 'none'>;

/** Data-anchored point: time in UTC seconds (without the display offset). */
export interface DrawingPoint {
  time: number;
  price: number;
}

export interface Drawing {
  id: string;
  kind: DrawingType;
  p1: DrawingPoint;
  p2: DrawingPoint;
}

export interface DrawingsState {
  items: Drawing[];
  activeTool: DrawingTool;
  selectedId: string | null;
}

/** Standard Fibonacci retracement levels. */
export const FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
