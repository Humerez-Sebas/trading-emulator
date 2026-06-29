import {
  Directive,
  ElementRef,
  HostListener,
  Input,
  OnDestroy,
  OnInit,
  Renderer2,
  inject,
} from '@angular/core';

@Directive({
  selector: '[appDraggable]',
  standalone: true,
})
export class DraggableDirective implements OnInit, OnDestroy {
  /** Selector for the handle element that initiates the drag. If not provided, the whole element is draggable. */
  @Input('appDraggable') handleSelector?: string;
  /** Key to save and load the position from localStorage. */
  @Input() dragStorageKey?: string;
  /** Default position if no position is found in localStorage. If not provided, it relies on CSS. */
  @Input() defaultPosition?: { x: number; y: number };

  private el = inject(ElementRef<HTMLElement>);
  private renderer = inject(Renderer2);

  private drag: { startX: number; startY: number; baseX: number; baseY: number } | null = null;
  private onMove = (e: MouseEvent) => this.handleMove(e);
  private onUp = () => this.endDrag();

  private pos: { x: number; y: number } | null = null;

  ngOnInit(): void {
    this.loadPosition();
    this.applyPosition();
  }

  @HostListener('mousedown', ['$event'])
  onMouseDown(e: MouseEvent): void {
    if (this.handleSelector) {
      const handle = this.el.nativeElement.querySelector(this.handleSelector);
      if (!handle || !handle.contains(e.target as Node)) {
        return; // Click was not on the handle
      }
    }

    this.startDrag(e);
  }

  private startDrag(e: MouseEvent): void {
    const container =
      (this.el.nativeElement.offsetParent as HTMLElement) || document.documentElement;

    if (!this.pos) {
      const r = this.el.nativeElement.getBoundingClientRect();
      const pr = container.getBoundingClientRect();
      this.pos = {
        x: r.left - pr.left - container.clientLeft,
        y: r.top - pr.top - container.clientTop,
      };
    }

    this.drag = { startX: e.clientX, startY: e.clientY, baseX: this.pos.x, baseY: this.pos.y };
    window.addEventListener('mousemove', this.onMove);
    window.addEventListener('mouseup', this.onUp);
    e.preventDefault();
  }

  private handleMove(e: MouseEvent): void {
    if (!this.drag) return;
    const container =
      (this.el.nativeElement.offsetParent as HTMLElement) || document.documentElement;
    const el = this.el.nativeElement;

    const maxX = Math.max(0, container.clientWidth - el.offsetWidth);
    const maxY = Math.max(0, container.clientHeight - el.offsetHeight);

    const x = Math.max(0, Math.min(maxX, this.drag.baseX + e.clientX - this.drag.startX));
    const y = Math.max(0, Math.min(maxY, this.drag.baseY + e.clientY - this.drag.startY));

    this.pos = { x, y };
    this.applyPosition();
  }

  private endDrag(): void {
    if (!this.drag) return;
    this.drag = null;
    window.removeEventListener('mousemove', this.onMove);
    window.removeEventListener('mouseup', this.onUp);
    this.savePosition();
  }

  private applyPosition(): void {
    if (this.pos) {
      this.renderer.addClass(this.el.nativeElement, 'positioned');
      this.renderer.setStyle(this.el.nativeElement, 'left', `${this.pos.x}px`);
      this.renderer.setStyle(this.el.nativeElement, 'top', `${this.pos.y}px`);
    }
  }

  private loadPosition(): void {
    if (!this.dragStorageKey) {
      if (this.defaultPosition) this.pos = this.defaultPosition;
      return;
    }
    try {
      const raw = localStorage.getItem(this.dragStorageKey);
      if (raw) {
        const p = JSON.parse(raw) as { x?: number; y?: number };
        if (typeof p.x === 'number' && typeof p.y === 'number' && p.x >= 0 && p.y >= 0) {
          this.pos = { x: p.x, y: p.y };
          return;
        }
      }
    } catch {
      /* storage unavailable: ignore */
    }
    if (this.defaultPosition) {
      this.pos = this.defaultPosition;
    }
  }

  private savePosition(): void {
    if (!this.dragStorageKey || !this.pos) return;
    try {
      localStorage.setItem(this.dragStorageKey, JSON.stringify(this.pos));
    } catch {
      /* storage unavailable: ignore */
    }
  }

  ngOnDestroy(): void {
    window.removeEventListener('mousemove', this.onMove);
    window.removeEventListener('mouseup', this.onUp);
  }
}
