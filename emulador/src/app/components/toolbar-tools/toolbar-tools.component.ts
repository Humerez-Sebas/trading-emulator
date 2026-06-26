import { Component, ElementRef, HostListener, inject, input, signal } from '@angular/core';
import { Store } from '@ngrx/store';
import { DrawingsActions } from '../../state/drawings/drawings.actions';
import { drawingsFeature } from '../../state/drawings/drawings.reducer';
import { DrawingTool } from '../../state/drawings/drawings.models';
import { SettingsActions } from '../../state/settings/settings.actions';
import { TradingActions } from '../../state/trading/trading.actions';
import {
  selectClosedTradeBoxes,
  selectTradeBoxesVisible,
  selectUtcOffset,
} from '../../state/selectors';
import { TooltipDirective } from '../ui';

/**
 * The single source of truth for the drawing/trade tool buttons, shared by
 * the fixed sidebar toolbar and the floating toolbar (they only differ in
 * container layout). Includes the trade-boxes eye: click toggles ALL boxes,
 * and its dropdown (caret or right click) lists the closed trades so a
 * hidden box can be re-shown individually.
 */
@Component({
  selector: 'app-toolbar-tools',
  standalone: true,
  imports: [TooltipDirective],
  templateUrl: './toolbar-tools.component.html',
  styleUrl: './toolbar-tools.component.css',
  host: { '[class.vertical]': 'vertical()' },
})
export class ToolbarToolsComponent {
  private store = inject(Store);
  private host = inject(ElementRef<HTMLElement>);

  /** true = sidebar layout (dropdown opens to the right, not below). */
  vertical = input(false);

  activeTool = this.store.selectSignal(drawingsFeature.selectActiveTool);
  selectedId = this.store.selectSignal(drawingsFeature.selectSelectedId);
  items = this.store.selectSignal(drawingsFeature.selectItems);
  boxesVisible = this.store.selectSignal(selectTradeBoxesVisible);
  closedTrades = this.store.selectSignal(selectClosedTradeBoxes);
  private utcOffset = this.store.selectSignal(selectUtcOffset);

  menuOpen = signal(false);

  pick(tool: DrawingTool): void {
    // pressing the active tool again deactivates it
    const next = this.activeTool() === tool ? 'none' : tool;
    this.store.dispatch(DrawingsActions.pickTool({ tool: next }));
  }

  deleteSelected(): void {
    this.store.dispatch(DrawingsActions.deleteSelected());
  }

  clearAll(): void {
    this.store.dispatch(DrawingsActions.clearDrawings());
  }

  toggleBoxes(): void {
    this.store.dispatch(SettingsActions.setTradeBoxesVisible({ visible: !this.boxesVisible() }));
  }

  toggleMenu(): void {
    this.menuOpen.update((open) => !open);
  }

  /** Right click on the eye also opens the per-trade dropdown. */
  onEyeContextMenu(event: MouseEvent): void {
    event.preventDefault();
    this.toggleMenu();
  }

  toggleBox(id: string, hidden: boolean): void {
    this.store.dispatch(TradingActions.setTradeBoxHidden({ id, hidden: !hidden }));
  }

  /** Closed trades, latest first (the one you just hid is on top). */
  tradesNewestFirst(): {
    id: string;
    side: string;
    closeTime: number;
    profit: number;
    hidden: boolean;
  }[] {
    return this.closedTrades().slice().reverse();
  }

  /** dd/MM HH:mm in the user's display time zone (data stays UTC). */
  formatTime(utcSeconds: number): string {
    const d = new Date((utcSeconds + this.utcOffset() * 3600) * 1000);
    const p = (n: number) => String(n).padStart(2, '0');
    return `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
  }

  formatProfit(profit: number): string {
    return `${profit >= 0 ? '+' : '−'}$${Math.abs(profit).toFixed(2)}`;
  }

  @HostListener('document:mousedown', ['$event'])
  onDocumentMouseDown(event: MouseEvent): void {
    if (!this.menuOpen()) return;
    if (!this.host.nativeElement.contains(event.target as Node)) this.menuOpen.set(false);
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.menuOpen.set(false);
  }
}
