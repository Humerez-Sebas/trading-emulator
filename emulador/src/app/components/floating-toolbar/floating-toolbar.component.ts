import { Component, ElementRef, inject, signal } from '@angular/core';
import { ToolbarToolsComponent } from '../toolbar-tools/toolbar-tools.component';

/** Where the floating toolbar sits, relative to its positioned parent. */
const POSITION_KEY = 'emulador.toolbarPos';

/**
 * TradingView-style floating quick-access bar for the shared tools: a
 * horizontal strip that can be dragged anywhere over the chart area by its
 * ⋮⋮ handle. Mirrors the fixed sidebar toolbar.
 */
@Component({
  selector: 'app-floating-toolbar',
  standalone: true,
  imports: [ToolbarToolsComponent],
  templateUrl: './floating-toolbar.component.html',
  styleUrl: './floating-toolbar.component.css',
})
export class FloatingToolbarComponent {
  private host = inject(ElementRef<HTMLElement>);

  /** Top-left corner in px, relative to the chart area. */
  pos = signal(this.loadPosition());

  private drag: { startX: number; startY: number; baseX: number; baseY: number } | null = null;
  private onMove = (e: MouseEvent) => this.handleMove(e);
  private onUp = () => this.endDrag();

  startDrag(e: MouseEvent): void {
    const p = this.pos();
    this.drag = { startX: e.clientX, startY: e.clientY, baseX: p.x, baseY: p.y };
    window.addEventListener('mousemove', this.onMove);
    window.addEventListener('mouseup', this.onUp);
    e.preventDefault();
  }

  private handleMove(e: MouseEvent): void {
    if (!this.drag) return;
    const parent = (this.host.nativeElement as HTMLElement).parentElement;
    const el = (this.host.nativeElement as HTMLElement).firstElementChild as HTMLElement | null;
    const maxX = parent && el ? parent.clientWidth - el.offsetWidth : Infinity;
    const maxY = parent && el ? parent.clientHeight - el.offsetHeight : Infinity;
    const x = Math.max(0, Math.min(maxX, this.drag.baseX + e.clientX - this.drag.startX));
    const y = Math.max(0, Math.min(maxY, this.drag.baseY + e.clientY - this.drag.startY));
    this.pos.set({ x, y });
  }

  private endDrag(): void {
    if (!this.drag) return;
    this.drag = null;
    window.removeEventListener('mousemove', this.onMove);
    window.removeEventListener('mouseup', this.onUp);
    try {
      localStorage.setItem(POSITION_KEY, JSON.stringify(this.pos()));
    } catch {
      /* storage unavailable: ignore */
    }
  }

  private loadPosition(): { x: number; y: number } {
    try {
      const raw = localStorage.getItem(POSITION_KEY);
      if (raw) {
        const p = JSON.parse(raw) as { x?: number; y?: number };
        if (typeof p.x === 'number' && typeof p.y === 'number' && p.x >= 0 && p.y >= 0) {
          return { x: p.x, y: p.y };
        }
      }
    } catch {
      /* fall through to the default */
    }
    return { x: 16, y: 12 };
  }
}
