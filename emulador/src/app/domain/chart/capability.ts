// emulador/src/app/domain/chart/capability.ts
import { IChartApi, ISeriesApi } from 'lightweight-charts';
import { ChartEventBus } from './chart-event-bus';
import { RenderModel } from './render-model';

/**
 * Plugin del ChartEngine. El motor permanece cerrado a modificación: nueva
 * lógica visual = nueva Capability registrada al inicio.
 */
export interface Capability {
  /** Identificador único; clave en el registro del engine. */
  readonly id: string;

  /** Optional handle-free facade available to hosts through `ChartEngine.getCapability`. */
  readonly publicApi?: CapabilityApiMap[keyof CapabilityApiMap];

  /**
   * Se invoca una vez al registrar la capability. Recibe el chart y el bus de
   * eventos para suscribirse / adjuntar primitivas. La serie principal NO viaja
   * por aquí: llega por el constructor, que el propio engine invoca (ver
   * `MainSeriesCapability` y `ChartEngine.registerCapability`).
   */
  init(chart: IChartApi, bus: ChartEventBus): void;

  /**
   * Se invoca en cada `engine.render(model)`. Recibe el MISMO `Partial<RenderModel>`
   * que el engine — la firma es `Partial` a propósito, porque los callers envían
   * modelos parciales (p. ej. `engine.render({ config })`). Cada capability lee solo
   * su sub-estado y debería hacer shallow-compare antes de tocar la API de
   * lightweight-charts (ver Mitigaciones del RFC).
   */
  render(model: Partial<RenderModel>): void;

  /** Limpieza: desuscribir del bus, quitar primitivas, liberar recursos. */
  destroy(): void;
}

export interface DrawingsCapabilityApi {
  timeForX(x: number): number | null;
  xForTime(timeUtc: number): number | null;
  hitTestDrawing(x: number, y: number): string | null;
  hitTestHandle(x: number, y: number): 'p1' | 'p2' | null;
}

export type PlacementSlot = 'entry' | 'sl' | 'tp';

export interface PlacementLineSpec {
  price: number;
  color: string;
  title: string;
}

export interface TradeLineHit {
  id: string;
  target: 'position' | 'order';
  field: 'entry' | 'sl' | 'tp';
  price: number;
  draggable: boolean;
}

export interface TradingCapabilityApi {
  hitTestBox(x: number, y: number): { id: string } | null;
  hitTestEdge(
    x: number,
    y: number,
  ): { id: string; status: 'open' | 'pending'; field: 'sl' | 'tp' } | null;
  hitTestDelete(
    x: number,
    y: number,
  ): { id: string; target: 'order' | 'position'; price: number } | null;
  addPlacementLine(slot: PlacementSlot, spec: PlacementLineSpec): void;
  movePlacementLine(slot: PlacementSlot, price: number, title: string): void;
  clearPlacementLines(): void;
  hitTestTradeLine(x: number, y: number): TradeLineHit | null;
}

/** The only capability behavior that may cross from the chart domain to a host. */
export interface CapabilityApiMap {
  drawings: DrawingsCapabilityApi;
  trading: TradingCapabilityApi;
}

/**
 * Clase de `Capability` que el engine puede construir por sí mismo: su único
 * argumento de constructor es la serie principal.
 *
 * RFC-004/RFC-005 (cierre del puente de migración): antes, quien registraba una
 * capability tenía que leer `engine.seriesApi` para poder construirla, y ese
 * getter exponía la `ISeriesApi` completa a la capa Angular. Ahora el engine
 * recibe la CLASE y la instancia con su propia serie, de modo que la serie nunca
 * cruza el límite del dominio. Consecuencia buscada: no queda ninguna vía por la
 * que `ChartComponent` obtenga un handle de `lightweight-charts`.
 */
export type MainSeriesCapability<T extends Capability = Capability> = new (
  series: ISeriesApi<'Candlestick'>,
) => T;
