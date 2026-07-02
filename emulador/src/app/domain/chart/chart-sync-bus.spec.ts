import { describe, it, expect } from 'vitest';
import { MouseEventParams, Time } from 'lightweight-charts';
import { ChartSyncBus, PanelSyncEvent } from './chart-sync-bus';

const crosshair = { point: { x: 10, y: 20 } } as unknown as MouseEventParams<Time>;

describe('ChartSyncBus (RFC-008 skeleton)', () => {
  it('emits events tagged with the source panelId', () => {
    const bus = new ChartSyncBus();
    const seen: PanelSyncEvent[] = [];
    bus.events$.subscribe((e) => seen.push(e));
    bus.emit('panel-1', 'CrosshairMoved', crosshair);
    expect(seen).toEqual([{ panelId: 'panel-1', type: 'CrosshairMoved', payload: crosshair }]);
  });

  it('multiplexes events from several panels over one stream, in order', () => {
    const bus = new ChartSyncBus();
    const seen: string[] = [];
    bus.events$.subscribe((e) => seen.push(`${e.panelId}:${e.type}`));
    bus.emit('panel-1', 'VisibleRangeChanged', { from: 0, to: 100 } as never);
    bus.emit('panel-2', 'CrosshairMoved', crosshair);
    bus.emit('panel-1', 'CrosshairMoved', crosshair);
    expect(seen).toEqual([
      'panel-1:VisibleRangeChanged',
      'panel-2:CrosshairMoved',
      'panel-1:CrosshairMoved',
    ]);
  });

  it('delivers each event to every subscriber', () => {
    const bus = new ChartSyncBus();
    let a = 0;
    let b = 0;
    bus.events$.subscribe(() => a++);
    bus.events$.subscribe(() => b++);
    bus.emit('panel-1', 'VisibleRangeChanged', null);
    expect(a).toBe(1);
    expect(b).toBe(1);
  });

  it('does not replay past events to late subscribers', () => {
    const bus = new ChartSyncBus();
    bus.emit('panel-1', 'CrosshairMoved', crosshair);
    let late = 0;
    bus.events$.subscribe(() => late++);
    expect(late).toBe(0);
  });

  it('destroy() completes the stream', () => {
    const bus = new ChartSyncBus();
    let completed = false;
    bus.events$.subscribe({ complete: () => (completed = true) });
    bus.destroy();
    expect(completed).toBe(true);
  });
});
