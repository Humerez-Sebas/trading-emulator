import { Component, inject } from '@angular/core';
import { Store } from '@ngrx/store';
import { SettingsActions } from '../../state/settings/settings.actions';
import { SidePanelTab } from '../../state/settings/settings.models';
import { selectSidePanel } from '../../state/selectors';
import { TradePanelComponent } from '../trade-panel/trade-panel.component';
import { SettingsPanelComponent } from '../settings-panel/settings-panel.component';
import { TooltipDirective } from '../ui/tooltip.directive';

/**
 * Right-side icon rail + docked panel with tabs (Operativa / Ajustes).
 * Clicking the active tab collapses the dock; the state persists with the
 * rest of the settings (localStorage). Sessions live in /sesiones (V2.6).
 */
@Component({
  selector: 'app-side-dock',
  standalone: true,
  imports: [TradePanelComponent, SettingsPanelComponent, TooltipDirective],
  templateUrl: './side-dock.component.html',
  styleUrl: './side-dock.component.css',
})
export class SideDockComponent {
  private store = inject(Store);

  panel = this.store.selectSignal(selectSidePanel);

  readonly tabs: { id: SidePanelTab; label: string }[] = [
    { id: 'trade', label: 'Operativa' },
    { id: 'settings', label: 'Ajustes' },
  ];

  setTab(tab: SidePanelTab): void {
    this.store.dispatch(SettingsActions.setSidePanelTab({ tab }));
  }

  isActive(tab: SidePanelTab): boolean {
    const p = this.panel();
    return p.open && p.tab === tab;
  }
}
