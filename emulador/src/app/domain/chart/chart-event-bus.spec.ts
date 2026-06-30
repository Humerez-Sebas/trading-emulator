import { describe, it, expect, vi } from 'vitest';
import type { LogicalRange, MouseEventParams, Time } from 'lightweight-charts';
import { ChartEventBus } from './chart-event-bus';

describe('ChartEventBus', () => {
  it('delivers the exact payload reference to a listener registered with on()', () => {
    const bus = new ChartEventBus();
    const payload = {} as MouseEventParams<Time>;
    const listener = vi.fn();

    bus.on('ChartClicked', listener);
    bus.emit('ChartClicked', payload);

    expect(listener).toHaveBeenCalledTimes(1);
    const received = listener.mock.calls[0][0];
    expect(received).toBe(payload);
  });

  it('notifies all listeners registered on the same event type', () => {
    const bus = new ChartEventBus();
    const payload = {} as MouseEventParams<Time>;
    const listenerA = vi.fn();
    const listenerB = vi.fn();

    bus.on('CrosshairMoved', listenerA);
    bus.on('CrosshairMoved', listenerB);
    bus.emit('CrosshairMoved', payload);

    expect(listenerA).toHaveBeenCalledTimes(1);
    expect(listenerB).toHaveBeenCalledTimes(1);
    expect(listenerA.mock.calls[0][0]).toBe(payload);
    expect(listenerB.mock.calls[0][0]).toBe(payload);
  });

  it('stops invoking a listener after its returned unsubscribe function is called', () => {
    const bus = new ChartEventBus();
    const payload = {} as MouseEventParams<Time>;
    const listener = vi.fn();

    const unsubscribe = bus.on('ChartClicked', listener);
    unsubscribe();
    bus.emit('ChartClicked', payload);

    expect(listener).not.toHaveBeenCalled();
  });

  it('does not throw when emitting a type with no registered listeners', () => {
    const bus = new ChartEventBus();
    const range = null as LogicalRange | null;

    expect(() => bus.emit('VisibleRangeChanged', range)).not.toThrow();
  });

  it('clears all listeners on destroy(), so a later emit invokes nothing', () => {
    const bus = new ChartEventBus();
    const payload = {} as MouseEventParams<Time>;
    const listener = vi.fn();

    bus.on('ChartClicked', listener);
    bus.destroy();
    bus.emit('ChartClicked', payload);

    expect(listener).not.toHaveBeenCalled();
  });

  it('keys listeners by event type, so emitting one type does not invoke a listener on another', () => {
    const bus = new ChartEventBus();
    const clickPayload = {} as MouseEventParams<Time>;
    const crosshairListener = vi.fn();

    bus.on('CrosshairMoved', crosshairListener);
    bus.emit('ChartClicked', clickPayload);

    expect(crosshairListener).not.toHaveBeenCalled();
  });
});
