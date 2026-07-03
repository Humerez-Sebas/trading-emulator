import { describe, it, expect, vi } from 'vitest';
import { ChartSyncBus } from '../../domain/chart/chart-sync-bus';
import { ChartRegistry, PanelChartHandle } from './chart-registry.service';
import { ChartSyncRouter } from './chart-sync-router';
import { PanelDescriptor } from '../../state/layout/layout.models';
import { LinkGroup } from '../../state/link-groups/link-groups.models';
import { LogicalRange } from 'lightweight-charts';

const panel = (id: string, linkGroupId: string | null): PanelDescriptor => ({
  id, symbol: 'SP500', timeframe: 'M1', linkGroupId,
});
const group = (id: string, overrides: Partial<LinkGroup> = {}): LinkGroup => ({
  id, color: '#fff', syncCrosshair: true, syncTimeRange: true, ...overrides,
});
const handle = (): PanelChartHandle & { applyCrosshair: ReturnType<typeof vi.fn>; applyVisibleRange: ReturnType<typeof vi.fn> } => ({
  setUpdatesEnabled: vi.fn(),
  applyCrosshair: vi.fn<(time: number | null) => void>(),
  applyVisibleRange: vi.fn<(range: LogicalRange | null) => void>(),
});

function wire() {
  const bus = new ChartSyncBus();
  const registry = new ChartRegistry();
  const router = new ChartSyncRouter(bus, registry);
  return { bus, registry, router };
}

describe('ChartSyncRouter (RFC-010)', () => {
  it('fans a CrosshairMoved event out to every OTHER panel in the same linkGroup, never to the origin', () => {
    const { bus, registry, router } = wire();
    const hA = handle(), hB = handle(), hC = handle();
    registry.register('A', hA); registry.register('B', hB); registry.register('C', hC);
    router.setState({
      panels: { A: panel('A', 'g1'), B: panel('B', 'g1'), C: panel('C', null) },
      linkGroups: { g1: group('g1') },
    });
    bus.emit('A', 'CrosshairMoved', { point: { x: 0, y: 0 }, time: 1000 } as never); // A is the origin (a user interaction on panel A)
    expect(hA.applyCrosshair).not.toHaveBeenCalled();
    expect(hB.applyCrosshair).toHaveBeenCalledTimes(1);
    expect(hC.applyCrosshair).not.toHaveBeenCalled(); // unlinked: never participates
  });

  it('does not route when the group has the relevant sync flag off', () => {
    const { bus, registry, router } = wire();
    const hA = handle(), hB = handle();
    registry.register('A', hA); registry.register('B', hB);
    router.setState({
      panels: { A: panel('A', 'g1'), B: panel('B', 'g1') },
      linkGroups: { g1: group('g1', { syncCrosshair: false }) },
    });
    bus.emit('A', 'CrosshairMoved', { point: { x: 0, y: 0 }, time: 1000 } as never);
    expect(hB.applyCrosshair).not.toHaveBeenCalled();
  });

  it('routes VisibleRangeChanged only when syncTimeRange is on, independent of syncCrosshair', () => {
    const { bus, registry, router } = wire();
    const hA = handle(), hB = handle();
    registry.register('A', hA); registry.register('B', hB);
    router.setState({
      panels: { A: panel('A', 'g1'), B: panel('B', 'g1') },
      linkGroups: { g1: group('g1', { syncCrosshair: false, syncTimeRange: true }) },
    });
    bus.emit('A', 'VisibleRangeChanged', { from: 10, to: 20 } as never);
    expect(hB.applyVisibleRange).toHaveBeenCalledWith({ from: 10, to: 20 });
    expect(hB.applyCrosshair).not.toHaveBeenCalled();
  });

  it('a panel with linkGroupId null never triggers routing as an origin', () => {
    const { bus, registry, router } = wire();
    const hB = handle();
    registry.register('A', handle()); registry.register('B', hB);
    router.setState({
      panels: { A: panel('A', null), B: panel('B', null) },
      linkGroups: {},
    });
    bus.emit('A', 'CrosshairMoved', { point: { x: 0, y: 0 }, time: 1000 } as never);
    expect(hB.applyCrosshair).not.toHaveBeenCalled();
  });

  it('3+ panel group: one origin event applies to exactly N-1 siblings, no cascade', () => {
    const { bus, registry, router } = wire();
    const hA = handle(), hB = handle(), hC = handle(), hD = handle();
    registry.register('A', hA); registry.register('B', hB); registry.register('C', hC); registry.register('D', hD);
    router.setState({
      panels: { A: panel('A', 'g1'), B: panel('B', 'g1'), C: panel('C', 'g1'), D: panel('D', null) },
      linkGroups: { g1: group('g1') },
    });
    bus.emit('A', 'CrosshairMoved', { point: { x: 0, y: 0 }, time: 1000 } as never);
    expect(hB.applyCrosshair).toHaveBeenCalledTimes(1);
    expect(hC.applyCrosshair).toHaveBeenCalledTimes(1);
    expect(hA.applyCrosshair).not.toHaveBeenCalled();
    expect(hD.applyCrosshair).not.toHaveBeenCalled();
  });

  it('idempotent apply: an identical incoming value applied twice calls the handle only once', () => {
    const { bus, registry, router } = wire();
    const hB = handle();
    registry.register('A', handle()); registry.register('B', hB);
    router.setState({ panels: { A: panel('A', 'g1'), B: panel('B', 'g1') }, linkGroups: { g1: group('g1') } });
    bus.emit('A', 'VisibleRangeChanged', { from: 10, to: 20 } as never);
    bus.emit('A', 'VisibleRangeChanged', { from: 10, to: 20 } as never); // structurally identical, new reference
    expect(hB.applyVisibleRange).toHaveBeenCalledTimes(1);
  });

  it('destroy() unsubscribes from the bus', () => {
    const { bus, registry, router } = wire();
    const hB = handle();
    registry.register('A', handle()); registry.register('B', hB);
    router.setState({ panels: { A: panel('A', 'g1'), B: panel('B', 'g1') }, linkGroups: { g1: group('g1') } });
    router.destroy();
    bus.emit('A', 'CrosshairMoved', { point: { x: 0, y: 0 }, time: 1000 } as never);
    expect(hB.applyCrosshair).not.toHaveBeenCalled();
  });
});
