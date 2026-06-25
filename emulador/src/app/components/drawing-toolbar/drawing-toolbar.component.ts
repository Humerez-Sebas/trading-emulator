import { Component, HostListener, inject } from '@angular/core';
import { Store } from '@ngrx/store';
import { ToolbarToolsComponent } from '../toolbar-tools/toolbar-tools.component';
import { DrawingsActions } from '../../state/drawings/drawings.actions';
import { drawingsFeature } from '../../state/drawings/drawings.reducer';
import { DrawingTool } from '../../state/drawings/drawings.models';

/**
 * Physical-key (event.code) → drawing tool, triggered with Alt held.
 * event.code is keyboard-layout independent, so Alt+T fires even when the OS
 * would otherwise emit a dead key / special glyph for the Alt combo.
 */
const ALT_TOOL_SHORTCUTS: Record<string, DrawingTool> = {
  KeyR: 'rect', // Alt+R — Rectángulo
  KeyT: 'line', // Alt+T — Tendencia (trendline)
  KeyF: 'fib', // Alt+F — Fibonacci
  KeyM: 'ruler', // Alt+M — Regla (measure)
};

/**
 * Fixed vertical sidebar with the shared drawing/trade tools.
 *
 * Owns the GLOBAL keyboard shortcuts for tool selection. This component is the
 * single always-mounted host (the floating toolbar shares ToolbarTools but is
 * conditional), so dispatching from here — instead of from the potentially
 * doubly-instantiated ToolbarTools — keeps the pickTool toggle from firing
 * twice and cancelling itself out. It reuses the existing pickTool action, so
 * the NgRx flow is unchanged.
 */
@Component({
  selector: 'app-drawing-toolbar',
  standalone: true,
  imports: [ToolbarToolsComponent],
  templateUrl: './drawing-toolbar.component.html',
  styleUrl: './drawing-toolbar.component.css',
})
export class DrawingToolbarComponent {
  private store = inject(Store);
  private activeTool = this.store.selectSignal(drawingsFeature.selectActiveTool);

  @HostListener('document:keydown', ['$event'])
  onKeydown(e: KeyboardEvent): void {
    // Never hijack keys while the user is typing into a field.
    const el = e.target as HTMLElement | null;
    if (el && (el.isContentEditable || /^(input|textarea|select)$/i.test(el.tagName))) {
      return;
    }

    // Alt + <key>: pick (or toggle off) the matching drawing tool.
    if (e.altKey && !e.ctrlKey && !e.metaKey) {
      const tool = ALT_TOOL_SHORTCUTS[e.code];
      if (tool) {
        e.preventDefault();
        const next = this.activeTool() === tool ? 'none' : tool;
        this.store.dispatch(DrawingsActions.pickTool({ tool: next }));
      }
      return;
    }

    // Esc: drop the active tool. The chart separately cancels an in-progress
    // draw / open menus on Esc, so the two handlers compose into "cancel".
    if (e.key === 'Escape' && this.activeTool() !== 'none') {
      this.store.dispatch(DrawingsActions.pickTool({ tool: 'none' }));
    }
  }
}
