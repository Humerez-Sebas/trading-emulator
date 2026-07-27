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

  it('the Dibujos checkbox dispatches setSyncDrawings with the row groupId and the new enabled value', () => {
    const fixture = create({
      groups: {
        g1: {
          id: 'g1',
          color: '#2962FF',
          syncCrosshair: true,
          syncTimeRange: true,
          syncDrawings: false,
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

  it('renders no "Trades" toggle — retired as a LinkGroup channel (D18.A)', () => {
    const fixture = create({
      groups: {
        g1: {
          id: 'g1',
          color: '#2962FF',
          syncCrosshair: true,
          syncTimeRange: true,
          syncDrawings: true,
        },
      },
    });
    expect(fixture.nativeElement.querySelector('.group-row .sync-trades')).toBeNull();
  });

  it('"Nuevo grupo" dispatches createGroup with syncDrawings true and no syncTrades key', () => {
    const fixture = create({ groups: {} });
    const dispatch = vi.spyOn(store, 'dispatch');
    const addBtn: HTMLButtonElement = fixture.nativeElement.querySelector('.link-groups-add');
    addBtn.click();
    expect(dispatch).toHaveBeenCalledTimes(1);
    const dispatched = dispatch.mock.calls[0][0] as unknown as ReturnType<
      typeof LinkGroupsActions.createGroup
    >;
    expect(dispatched.group.syncDrawings).toBe(true);
    expect('syncTrades' in dispatched.group).toBe(false);
  });
});
