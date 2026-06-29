import { Component, inject } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { Store } from '@ngrx/store';
import { selectFloatingPnl } from '../../state/selectors';

@Component({
  selector: 'app-floating-pnl',
  standalone: true,
  imports: [DecimalPipe],
  template: `
    @if (pnl() !== null) {
      <span
        class="fpnl"
        [class.up]="pnl()! >= 0"
        [class.down]="pnl()! < 0"
        title="P/L flotante de las posiciones abiertas"
      >
        P/L {{ pnl() | number: '1.2-2' }} $
      </span>
    }
  `,
  styles: [
    `
      .fpnl {
        position: absolute;
        top: 10px;
        right: 12px;
        z-index: 30;
        padding: 4px 10px;
        border-radius: var(--radius-sm, 6px);
        font-weight: 600;
        font-variant-numeric: tabular-nums;
        background: var(--surface-2, #181818);
        border: 1px solid var(--border, #222);
        pointer-events: none;
      }
      .fpnl.up {
        color: var(--up, #26a69a);
      }
      .fpnl.down {
        color: var(--down, #ef5350);
      }
    `,
  ],
})
export class FloatingPnlComponent {
  private store = inject(Store);
  pnl = this.store.selectSignal(selectFloatingPnl);
}
