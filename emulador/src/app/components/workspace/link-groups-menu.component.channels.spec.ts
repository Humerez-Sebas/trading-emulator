import { describe, it, expect, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideMockStore, MockStore } from '@ngrx/store/testing';
import { LinkGroupsMenuComponent } from './link-groups-menu.component';
import { LinkGroupsActions } from '../../state/link-groups/link-groups.actions';
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

describe('LinkGroupsMenuComponent — composition channel toggles (Dibujos / Trades)', () => {
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

  it('renders a Spanish "Dibujos" toggle reflecting group.syncDrawings', () => {
    const fixture = create({
      groups: {
        g1: {
          id: 'g1',
          color: '#2962FF',
          syncCrosshair: true,
          syncTimeRange: true,
          syncDrawings: false,
          syncTrades: true,
        },
      },
    });
    const label: HTMLLabelElement = fixture.nativeElement.querySelector(
      '.group-row .sync-drawings',
    ).parentElement;
    expect(label.textContent?.trim()).toBe('Dibujos');
    const checkbox: HTMLInputElement = fixture.nativeElement.querySelector(
      '.group-row .sync-drawings',
    );
    expect(checkbox.checked).toBe(false);
  });

  it('renders a Spanish "Trades" toggle reflecting group.syncTrades', () => {
    const fixture = create({
      groups: {
        g1: {
          id: 'g1',
          color: '#2962FF',
          syncCrosshair: true,
          syncTimeRange: true,
          syncDrawings: true,
          syncTrades: false,
        },
      },
    });
    const label: HTMLLabelElement = fixture.nativeElement.querySelector(
      '.group-row .sync-trades',
    ).parentElement;
    expect(label.textContent?.trim()).toBe('Trades');
    const checkbox: HTMLInputElement = fixture.nativeElement.querySelector(
      '.group-row .sync-trades',
    );
    expect(checkbox.checked).toBe(false);
  });

  it('the Dibujos checkbox dispatches setSyncDrawings with the row groupId and the new enabled value', () => {
    const fixture = create({
      groups: {
        g1: {
          id: 'g1',
          color: '#2962FF',
          syncCrosshair: true,
          syncTimeRange: true,
          syncDrawings: false,
          syncTrades: true,
        },
      },
    });
    const dispatch = vi.spyOn(store, 'dispatch');
    const checkbox: HTMLInputElement = fixture.nativeElement.querySelector(
      '.group-row .sync-drawings',
    );
    checkbox.click();
    expect(dispatch).toHaveBeenCalledWith(
      LinkGroupsActions.setSyncDrawings({ groupId: 'g1', enabled: true }),
    );
  });

  it('the Trades checkbox dispatches setSyncTrades with the row groupId and the new enabled value', () => {
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
      '.group-row .sync-trades',
    );
    checkbox.click();
    expect(dispatch).toHaveBeenCalledWith(
      LinkGroupsActions.setSyncTrades({ groupId: 'g1', enabled: false }),
    );
  });

  it('"Nuevo grupo" dispatches createGroup with both new composition flags true', () => {
    const fixture = create({ groups: {} });
    const dispatch = vi.spyOn(store, 'dispatch');
    const addBtn: HTMLButtonElement = fixture.nativeElement.querySelector('.link-groups-add');
    addBtn.click();
    expect(dispatch).toHaveBeenCalledTimes(1);
    const dispatched = dispatch.mock.calls[0][0] as unknown as ReturnType<
      typeof LinkGroupsActions.createGroup
    >;
    expect(dispatched.group.syncDrawings).toBe(true);
    expect(dispatched.group.syncTrades).toBe(true);
  });
});
