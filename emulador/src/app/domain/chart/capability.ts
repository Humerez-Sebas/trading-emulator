// emulador/src/app/domain/chart/capability.ts
import { IChartApi } from 'lightweight-charts';
import { ChartEventBus } from './chart-event-bus';
import { RenderModel } from './render-model';

/**
 * Plugin del ChartEngine. El motor permanece cerrado a modificación: nueva
 * lógica visual = nueva Capability registrada al inicio.
 */
export interface Capability {
  /** Identificador único; clave en el registro del engine. */
  readonly id: string;

  /**
   * Se invoca una vez al registrar la capability. Recibe el chart y el bus de
   * eventos para suscribirse / adjuntar primitivas.
   * NOTA (RFC-004/005): es probable que `init` se extienda para recibir también
   * la serie principal (`ISeriesApi<'Candlestick'>`) cuando Trading/Drawings la
   * necesiten; hasta entonces los getters puente `seriesApi` cubren ese acceso.
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
