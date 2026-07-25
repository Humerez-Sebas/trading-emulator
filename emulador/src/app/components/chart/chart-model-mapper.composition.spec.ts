import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideMockStore, MockStore } from '@ngrx/store/testing';
import { ChartModelMapper, PanelDrawingsView } from './chart-model-mapper.service';
import { drawingsFeature } from '../../state/drawings/drawings.reducer';
import { linkGroupsFeature } from '../../state/link-groups/link-groups.reducer';
import { selectActiveTfShortfall, selectCurrentAsset } from '../../state/selectors';
import { MAX_PANELS_PER_TAB, PanelDescriptor } from '../../state/layout/layout.models';
import { Drawing } from '../../state/drawings/drawings.models';
import { LinkGroup } from '../../state/link-groups/link-groups.models';

function drawing(overrides: Partial<Drawing> = {}): Drawing {
  return {
    id: 'd1',
    symbol: 'EURUSD',
    owner: { type: 'panel', id: 'p1' },
    kind: 'line',
    p1: { time: 0, price: 1 },
    p2: { time: 1, price: 2 },
    zIndex: 0,
    locked: false,
    visible: true,
    ...overrides,
  };
}

function descriptor(overrides: Partial<PanelDescriptor> = {}): PanelDescriptor {
  return { id: 'p1', symbol: 'EURUSD', timeframe: 'M1', linkGroupId: null, ...overrides };
}

function group(overrides: Partial<LinkGroup> = {}): LinkGroup {
  return {
    id: 'g1',
    color: '#f00',
    syncCrosshair: true,
    syncTimeRange: true,
    syncDrawings: true,
    syncTrades: true,
    ...overrides,
  };
}

describe('ChartModelMapper.panelDrawings$ composition (RFC-017 pipeline)', () => {
  let store: MockStore;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideMockStore()] });
    store = TestBed.inject(MockStore);
  });

  afterEach(() => store.resetSelectors());

  /** Seeds the five raw composition selectors and returns the configured mapper. */
  function mapperFor(
    desc: PanelDescriptor,
    entities: Record<string, Drawing>,
    ownerIndex: Record<string, readonly string[]>,
    selection: Record<string, string | null>,
    groups: Record<string, LinkGroup>,
    currentAsset: string | null = null,
  ): ChartModelMapper {
    store.overrideSelector(drawingsFeature.selectEntities, entities);
    store.overrideSelector(drawingsFeature.selectOwnerIndex, ownerIndex);
    store.overrideSelector(drawingsFeature.selectSelection, selection);
    store.overrideSelector(linkGroupsFeature.selectGroups, groups);
    store.overrideSelector(selectCurrentAsset, currentAsset);
    store.refreshState();
    const mapper = TestBed.runInInjectionContext(() => new ChartModelMapper());
    mapper.configurePanel(desc);
    return mapper;
  }

  function latest(mapper: ChartModelMapper): PanelDrawingsView {
    let view: PanelDrawingsView | undefined;
    mapper.panelDrawings$.subscribe((v) => (view = v));
    return view!;
  }

  it('local-only: a panel composes its own drawings', () => {
    const own = drawing({ id: 'd1', owner: { type: 'panel', id: 'p1' } });
    const mapper = mapperFor(
      descriptor({ id: 'p1' }),
      { d1: own },
      { 'panel:p1': ['d1'] },
      {},
      {},
    );
    expect(latest(mapper).items).toEqual([own]);
  });

  it('shared via group: a linked panel with syncDrawings true composes local union group', () => {
    const local = drawing({ id: 'd1', owner: { type: 'panel', id: 'p1' } });
    const shared = drawing({ id: 'd2', owner: { type: 'group', id: 'g1' } });
    const mapper = mapperFor(
      descriptor({ id: 'p1', linkGroupId: 'g1' }),
      { d1: local, d2: shared },
      { 'panel:p1': ['d1'], 'group:g1': ['d2'] },
      {},
      { g1: group({ syncDrawings: true }) },
    );
    const ids = latest(mapper).items.map((d) => d.id);
    expect(ids.sort()).toEqual(['d1', 'd2']);
  });

  it('flag off: a linked panel with syncDrawings false composes local only', () => {
    const local = drawing({ id: 'd1', owner: { type: 'panel', id: 'p1' } });
    const shared = drawing({ id: 'd2', owner: { type: 'group', id: 'g1' } });
    const mapper = mapperFor(
      descriptor({ id: 'p1', linkGroupId: 'g1' }),
      { d1: local, d2: shared },
      { 'panel:p1': ['d1'], 'group:g1': ['d2'] },
      {},
      { g1: group({ syncDrawings: false }) },
    );
    expect(latest(mapper).items).toEqual([local]);
  });

  it('dangling group id: the shared layer is empty, no throw', () => {
    const local = drawing({ id: 'd1', owner: { type: 'panel', id: 'p1' } });
    const mapper = mapperFor(
      descriptor({ id: 'p1', linkGroupId: 'gone' }),
      { d1: local },
      { 'panel:p1': ['d1'] },
      {},
      {},
    );
    expect(() => latest(mapper)).not.toThrow();
    expect(latest(mapper).items).toEqual([local]);
  });

  it('sentinel symbol: a panel with symbol \'\' composes the active asset\'s drawings', () => {
    const eurusd = drawing({ id: 'd1', symbol: 'EURUSD', owner: { type: 'panel', id: 'p1' } });
    const mapper = mapperFor(
      descriptor({ id: 'p1', symbol: '' }),
      { d1: eurusd },
      { 'panel:p1': ['d1'] },
      {},
      {},
      'EURUSD',
    );
    expect(latest(mapper).items).toEqual([eurusd]);
  });

  it('an explicit panel symbol still wins over the active asset (no regression)', () => {
    const eurusd = drawing({ id: 'd1', symbol: 'EURUSD', owner: { type: 'panel', id: 'p1' } });
    const gbpusd = drawing({ id: 'd2', symbol: 'GBPUSD', owner: { type: 'panel', id: 'p1' } });
    const mapper = mapperFor(
      descriptor({ id: 'p1', symbol: 'GBPUSD' }),
      { d1: eurusd, d2: gbpusd },
      { 'panel:p1': ['d1', 'd2'] },
      {},
      {},
      'EURUSD', // active asset differs from this panel's own explicit symbol
    );
    expect(latest(mapper).items).toEqual([gbpusd]);
  });

  it('the shared group layer reaches a sentinel-symbol panel when syncDrawings is on', () => {
    const shared = drawing({ id: 'd1', symbol: 'EURUSD', owner: { type: 'group', id: 'g1' } });
    const mapper = mapperFor(
      descriptor({ id: 'p1', symbol: '', linkGroupId: 'g1' }),
      { d1: shared },
      { 'group:g1': ['d1'] },
      {},
      { g1: group({ syncDrawings: true }) },
      'EURUSD',
    );
    expect(latest(mapper).items).toEqual([shared]);
  });

  it('the composed items track a change in the active asset for a sentinel-symbol panel (the sixth memo reference is real)', () => {
    const eurusd = drawing({ id: 'd1', symbol: 'EURUSD', owner: { type: 'panel', id: 'p1' } });
    const gbpusd = drawing({ id: 'd2', symbol: 'GBPUSD', owner: { type: 'panel', id: 'p1' } });
    const mapper = mapperFor(
      descriptor({ id: 'p1', symbol: '' }),
      { d1: eurusd, d2: gbpusd },
      { 'panel:p1': ['d1', 'd2'] },
      {},
      {},
      'EURUSD',
    );
    expect(latest(mapper).items).toEqual([eurusd]);

    store.overrideSelector(selectCurrentAsset, 'GBPUSD');
    store.refreshState();

    expect(latest(mapper).items).toEqual([gbpusd]);
  });

  it('symbol filter: a drawing of another symbol is excluded', () => {
    const here = drawing({ id: 'd1', symbol: 'EURUSD', owner: { type: 'panel', id: 'p1' } });
    const elsewhere = drawing({ id: 'd2', symbol: 'GBPUSD', owner: { type: 'panel', id: 'p1' } });
    const mapper = mapperFor(
      descriptor({ id: 'p1', symbol: 'EURUSD' }),
      { d1: here, d2: elsewhere },
      { 'panel:p1': ['d1', 'd2'] },
      {},
      {},
    );
    expect(latest(mapper).items).toEqual([here]);
  });

  it('visible filter: a drawing with visible false is excluded', () => {
    const shown = drawing({ id: 'd1', visible: true, owner: { type: 'panel', id: 'p1' } });
    const hidden = drawing({ id: 'd2', visible: false, owner: { type: 'panel', id: 'p1' } });
    const mapper = mapperFor(
      descriptor({ id: 'p1' }),
      { d1: shown, d2: hidden },
      { 'panel:p1': ['d1', 'd2'] },
      {},
      {},
    );
    expect(latest(mapper).items).toEqual([shown]);
  });

  it('orders ascending by zIndex, tiebreaking equal zIndex by id', () => {
    const high = drawing({ id: 'z-high', zIndex: 5, owner: { type: 'panel', id: 'p1' } });
    const tieB = drawing({ id: 'tie-b', zIndex: 1, owner: { type: 'panel', id: 'p1' } });
    const tieA = drawing({ id: 'tie-a', zIndex: 1, owner: { type: 'panel', id: 'p1' } });
    const mapper = mapperFor(
      descriptor({ id: 'p1' }),
      { 'z-high': high, 'tie-b': tieB, 'tie-a': tieA },
      { 'panel:p1': ['z-high', 'tie-b', 'tie-a'] },
      {},
      {},
    );
    expect(latest(mapper).items.map((d) => d.id)).toEqual(['tie-a', 'tie-b', 'z-high']);
  });

  it('selectedId resolves against the composed set: a selection that fell out of composition renders as null', () => {
    const composed = drawing({ id: 'd1', owner: { type: 'panel', id: 'p1' } });
    const mapper = mapperFor(
      descriptor({ id: 'p1' }),
      { d1: composed },
      { 'panel:p1': ['d1'] },
      { p1: 'gone' },
      {},
    );
    expect(latest(mapper).selectedId).toBeNull();
  });

  it('selectedId resolves to the id when it IS part of the composed set', () => {
    const composed = drawing({ id: 'd1', owner: { type: 'panel', id: 'p1' } });
    const mapper = mapperFor(
      descriptor({ id: 'p1' }),
      { d1: composed },
      { 'panel:p1': ['d1'] },
      { p1: 'd1' },
      {},
    );
    expect(latest(mapper).selectedId).toBe('d1');
  });

  it('reference stability: an unrelated store emission leaves the composed items array the SAME instance', () => {
    const own = drawing({ id: 'd1', owner: { type: 'panel', id: 'p1' } });
    const entities = { d1: own };
    const ownerIndex = { 'panel:p1': ['d1'] };
    const mapper = mapperFor(descriptor({ id: 'p1' }), entities, ownerIndex, {}, {});
    const first = latest(mapper);

    // an emission on a selector this mapper does NOT compose from — the five
    // composition inputs (entities/ownerIndex/selection/groups/descriptor)
    // keep their exact references.
    store.overrideSelector(selectActiveTfShortfall, 123);
    store.refreshState();

    const second = latest(mapper);
    expect(second.items).toBe(first.items); // same array instance, not a re-allocated equal one
  });

  describe('hideSharedDrawings composition filter', () => {
    it('a linked panel with hideSharedDrawings composes local drawings only, while a sibling panel in the same group still composes the shared ones', () => {
      const local = drawing({ id: 'd1', owner: { type: 'panel', id: 'p1' } });
      const shared = drawing({ id: 'd2', owner: { type: 'group', id: 'g1' } });
      const entities = { d1: local, d2: shared };
      const ownerIndex = { 'panel:p1': ['d1'], 'group:g1': ['d2'] };
      const groups = { g1: group({ syncDrawings: true }) };

      const hidingMapper = mapperFor(
        descriptor({ id: 'p1', linkGroupId: 'g1', hideSharedDrawings: true }),
        entities,
        ownerIndex,
        {},
        groups,
      );
      expect(latest(hidingMapper).items).toEqual([local]);

      const siblingMapper = mapperFor(
        descriptor({ id: 'p2', linkGroupId: 'g1' }),
        entities,
        ownerIndex,
        {},
        groups,
      );
      expect(latest(siblingMapper).items).toEqual([shared]); // the sibling still sees the shared layer
    });

    it('the toggle does not delete or alter any entity — the shared drawing still exists, untouched', () => {
      const shared = drawing({ id: 'd1', owner: { type: 'group', id: 'g1' } });
      const entities = { d1: shared };
      const ownerIndex = { 'group:g1': ['d1'] };
      const groups = { g1: group({ syncDrawings: true }) };
      const mapper = mapperFor(
        descriptor({ id: 'p1', linkGroupId: 'g1', hideSharedDrawings: true }),
        entities,
        ownerIndex,
        {},
        groups,
      );

      expect(latest(mapper).items).toEqual([]); // composed away for THIS panel...
      expect(entities['d1']).toBe(shared); // ...but the entity itself is untouched
    });

    it('reference stability still holds across an unrelated emission when hideSharedDrawings is set', () => {
      const local = drawing({ id: 'd1', owner: { type: 'panel', id: 'p1' } });
      const entities = { d1: local };
      const ownerIndex = { 'panel:p1': ['d1'] };
      const mapper = mapperFor(
        descriptor({ id: 'p1', hideSharedDrawings: true }),
        entities,
        ownerIndex,
        {},
        {},
      );
      const first = latest(mapper);

      store.overrideSelector(selectActiveTfShortfall, 456);
      store.refreshState();

      const second = latest(mapper);
      expect(second.items).toBe(first.items); // same array instance, not a re-allocated equal one
    });
  });

  it('8 mapper instances each compose only their own panel drawings set (no cross-panel memo thrash)', () => {
    const entities: Record<string, Drawing> = {};
    const ownerIndex: Record<string, readonly string[]> = {};
    for (let i = 0; i < MAX_PANELS_PER_TAB; i++) {
      const id = `d${i}`;
      entities[id] = drawing({ id, owner: { type: 'panel', id: `p${i}` } });
      ownerIndex[`panel:p${i}`] = [id];
    }
    store.overrideSelector(drawingsFeature.selectEntities, entities);
    store.overrideSelector(drawingsFeature.selectOwnerIndex, ownerIndex);
    store.overrideSelector(drawingsFeature.selectSelection, {});
    store.overrideSelector(linkGroupsFeature.selectGroups, {});
    store.refreshState();

    const mappers = Array.from({ length: MAX_PANELS_PER_TAB }, (_, i) => {
      const m = TestBed.runInInjectionContext(() => new ChartModelMapper());
      m.configurePanel(descriptor({ id: `p${i}` }));
      return m;
    });

    mappers.forEach((m, i) => {
      const view = latest(m);
      expect(view.items.map((d) => d.id)).toEqual([`d${i}`]);
    });
  });
});
