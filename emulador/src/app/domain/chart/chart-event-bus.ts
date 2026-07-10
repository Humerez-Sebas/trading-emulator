import { LogicalRange, MouseEventParams, Time } from 'lightweight-charts';

/** Payload por tipo de evento. Sin `any`: usa los tipos de la librería. */
export interface ChartEventMap {
  ChartClicked: MouseEventParams<Time>;
  CrosshairMoved: MouseEventParams<Time>;
  VisibleRangeChanged: LogicalRange | null;
}

export type ChartEventType = keyof ChartEventMap;
export type Unsubscribe = () => void;

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
