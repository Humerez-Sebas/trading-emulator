import { describe, it, expect, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideMockStore, MockStore } from '@ngrx/store/testing';
import { LinkGroupsMenuComponent, LINK_GROUP_PALETTE } from './link-groups-menu.component';
import { LinkGroupsActions } from '../../state/link-groups/link-groups.actions';
import { LayoutActions } from '../../state/layout/layout.actions';
import { LinkGroupsState } from '../../state/link-groups/link-groups.models';
import { LayoutState } from '../../state/layout/layout.models';

const emptyLayout: LayoutState = {
  workspace: {
    tabs: [
      {
        id: 'tab-a',
        name: 'Principal',
        template: '1',
        cells: [{ panelIds: [], activePanelId: '' }],
      },
    ],
    activeTabId: 'tab-a',
  },
  panels: {},
  focusedPanelId: null,
};

describe('LinkGroupsMenuComponent', () => {
  let store: MockStore;

  function create(linkGroupsState: LinkGroupsState, layoutState: LayoutState = emptyLayout) {
    TestBed.configureTestingModule({
      imports: [LinkGroupsMenuComponent],
      providers: [
        provideMockStore({ initialState: { linkGroups: linkGroupsState, layout: layoutState } }),
      ],
    });
    store = TestBed.inject(MockStore);
    const fixture = TestBed.createComponent(LinkGroupsMenuComponent);
    fixture.detectChanges();
    return fixture;
  }

  it('renders one row per existing group with a color swatch', () => {
    const fixture = create({
      groups: {
        g1: {
          id: 'g1',
          color: '#2962FF',
          syncCrosshair: true,
          syncTimeRange: true,
          syncDrawings: true,
          syncTrades: true,
        },
        g2: {
          id: 'g2',
          color: '#F23645',
          syncCrosshair: false,
          syncTimeRange: true,
          syncDrawings: true,
          syncTrades: true,
        },
      },
    });
    const rows = fixture.nativeElement.querySelectorAll('.group-row');
    expect(rows).toHaveLength(2);
    const swatches = fixture.nativeElement.querySelectorAll('.group-swatch');
    expect((swatches[0] as HTMLElement).style.backgroundColor).toBeTruthy();
  });

  it('"Nuevo grupo" dispatches createGroup with the first UNUSED palette color and both sync flags true', () => {
    const fixture = create({
      groups: {
        g1: {
          id: 'g1',
          color: LINK_GROUP_PALETTE[0],
          syncCrosshair: true,
          syncTimeRange: true,
          syncDrawings: true,
          syncTrades: true,
        },
      },
    });
    const dispatch = vi.spyOn(store, 'dispatch');
    const addBtn: HTMLButtonElement = fixture.nativeElement.querySelector('.link-groups-add');
    addBtn.click();
    expect(dispatch).toHaveBeenCalledTimes(1);
    const dispatched = dispatch.mock.calls[0][0] as unknown as ReturnType<
      typeof LinkGroupsActions.createGroup
    >;
    expect(dispatched.type).toBe(LinkGroupsActions.createGroup.type);
    expect(dispatched.group.id).toEqual(expect.any(String));
    expect(dispatched.group.color).toBe(LINK_GROUP_PALETTE[1]);
    expect(dispatched.group.syncCrosshair).toBe(true);
    expect(dispatched.group.syncTimeRange).toBe(true);
  });

  it('"Nuevo grupo" wraps around to the first color when all palette colors are used', () => {
    const groups = Object.fromEntries(
      LINK_GROUP_PALETTE.map((color, i) => [
        `g${i}`,
        {
          id: `g${i}`,
          color,
          syncCrosshair: true,
          syncTimeRange: true,
          syncDrawings: true,
          syncTrades: true,
        },
      ]),
    );
    const fixture = create({ groups });
    const dispatch = vi.spyOn(store, 'dispatch');
    const addBtn: HTMLButtonElement = fixture.nativeElement.querySelector('.link-groups-add');
    addBtn.click();
    const dispatched = dispatch.mock.calls[0][0] as unknown as ReturnType<
      typeof LinkGroupsActions.createGroup
    >;
    expect(dispatched.group.color).toBe(LINK_GROUP_PALETTE[0]);
  });

  it('the Crosshair checkbox dispatches setSyncCrosshair with the row groupId and the new enabled value', () => {
    const fixture = create({
      groups: {
        g1: {
          id: 'g1',
          color: '#2962FF',
          syncCrosshair: false,
          syncTimeRange: true,
          syncDrawings: true,
          syncTrades: true,
        },
      },
    });
    const dispatch = vi.spyOn(store, 'dispatch');
    const checkbox: HTMLInputElement = fixture.nativeElement.querySelector(
      '.group-row .sync-crosshair',
    );
    checkbox.click();
    expect(dispatch).toHaveBeenCalledWith(
      LinkGroupsActions.setSyncCrosshair({ groupId: 'g1', enabled: true }),
    );
  });

  it('the Rango checkbox dispatches setSyncTimeRange with the row groupId and the new enabled value', () => {
    const fixture = create({
      groups: {
        g1: {
          id: 'g1',
          color: '#2962FF',
          syncCrosshair: true,
          syncTimeRange: true,
          syncDrawings: true,
          syncTrades: true,
        },
      },
    });
    const dispatch = vi.spyOn(store, 'dispatch');
    const checkbox: HTMLInputElement = fixture.nativeElement.querySelector(
      '.group-row .sync-time-range',
    );
    checkbox.click();
    expect(dispatch).toHaveBeenCalledWith(
      LinkGroupsActions.setSyncTimeRange({ groupId: 'g1', enabled: false }),
    );
  });

  it('delete dispatches removeGroup AND setPanelLinkGroup(null) for each panel currently in that group', () => {
    const layoutWithMembers: LayoutState = {
      workspace: emptyLayout.workspace,
      panels: {
        p1: { id: 'p1', symbol: '', timeframe: 'M1', linkGroupId: 'g1' },
        p2: { id: 'p2', symbol: '', timeframe: 'M1', linkGroupId: 'g1' },
        p3: { id: 'p3', symbol: '', timeframe: 'M1', linkGroupId: 'g2' },
      },
      focusedPanelId: null,
    };
    const fixture = create(
      {
        groups: {
          g1: {
            id: 'g1',
            color: '#2962FF',
            syncCrosshair: true,
            syncTimeRange: true,
            syncDrawings: true,
            syncTrades: true,
          },
          g2: {
            id: 'g2',
            color: '#F23645',
            syncCrosshair: true,
            syncTimeRange: true,
            syncDrawings: true,
            syncTrades: true,
          },
        },
      },
      layoutWithMembers,
    );
    const dispatch = vi.spyOn(store, 'dispatch');
    const deleteButtons = fixture.nativeElement.querySelectorAll('.group-row .group-delete');
    (deleteButtons[0] as HTMLButtonElement).click(); // g1's delete
    expect(dispatch).toHaveBeenCalledWith(LinkGroupsActions.removeGroup({ groupId: 'g1' }));
    expect(dispatch).toHaveBeenCalledWith(
      LayoutActions.setPanelLinkGroup({ panelId: 'p1', linkGroupId: null }),
    );
    expect(dispatch).toHaveBeenCalledWith(
      LayoutActions.setPanelLinkGroup({ panelId: 'p2', linkGroupId: null }),
    );
    expect(dispatch).not.toHaveBeenCalledWith(
      LayoutActions.setPanelLinkGroup({ panelId: 'p3', linkGroupId: null }),
    );
    expect(dispatch).toHaveBeenCalledTimes(3); // removeGroup + 2 setPanelLinkGroup(null)
  });

  it('delete with no member panels dispatches only removeGroup', () => {
    const fixture = create({
      groups: {
        g1: {
          id: 'g1',
          color: '#2962FF',
          syncCrosshair: true,
          syncTimeRange: true,
          syncDrawings: true,
          syncTrades: true,
        },
      },
    });
    const dispatch = vi.spyOn(store, 'dispatch');
    const deleteBtn: HTMLButtonElement = fixture.nativeElement.querySelector(
      '.group-row .group-delete',
    );
    deleteBtn.click();
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith(LinkGroupsActions.removeGroup({ groupId: 'g1' }));
  });
});
