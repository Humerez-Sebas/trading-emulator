import { Logical, LogicalRange, Time } from 'lightweight-charts';

/** Handle-free pointer data allowed to cross from ChartEngine to its hosts. */
export interface ChartPointerEvent {
  readonly time?: Time;
  readonly logical?: Logical;
  readonly point?: { readonly x: number; readonly y: number };
}

/** Payload por tipo de evento. Sin `any`: usa los tipos de la librería. */
export interface ChartEventMap {
  ChartClicked: ChartPointerEvent;
  CrosshairMoved: ChartPointerEvent;
  VisibleRangeChanged: LogicalRange | null;
}

export type ChartEventType = keyof ChartEventMap;
export type Unsubscribe = () => void;

export interface ChartEventSource {
  on<K extends ChartEventType>(
    type: K,
    callback: (payload: ChartEventMap[K]) => void,
  ): Unsubscribe;
}

/** Pub/sub local, agnóstico de framework. */
export class ChartEventBus {
  private listeners: {
    [K in ChartEventType]?: Set<(payload: ChartEventMap[K]) => void>;
  } = {};

  public on<K extends ChartEventType>(
    type: K,
    callback: (payload: ChartEventMap[K]) => void,
  ): Unsubscribe {
    type Listeners = typeof this.listeners;
    type Bucket = Set<(payload: ChartEventMap[K]) => void>;
    const bucket: Bucket = (this.listeners[type] as Bucket | undefined) ?? new Set();
    bucket.add(callback);
    this.listeners[type] = bucket as Listeners[K];
    return () => this.listeners[type]?.delete(callback);
  }

  public emit<K extends ChartEventType>(type: K, payload: ChartEventMap[K]): void {
    this.listeners[type]?.forEach((cb) => cb(payload));
  }

  public destroy(): void {
    this.listeners = {};
  }
}
