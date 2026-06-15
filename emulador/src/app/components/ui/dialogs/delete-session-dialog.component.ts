import { Component, computed, input, output } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { ModalComponent } from '../modal.component';
import { ButtonDirective } from '../button.directive';
import { BadgeDirective } from '../badge.directive';

export interface DeleteSessionData {
  name: string;
  symbol: string;
  trades: number;
  /** Net realized P/L. */
  pnl: number;
  balance: number;
  /** ms epoch. */
  createdAt: number;
  /** Cumulative balance series for the preview sparkline. */
  equity: number[];
}

/**
 * Destructive-delete confirmation that shows a mini session summary
 * (name · symbol · trades · net P/L · balance · created · equity sparkline)
 * above a red Delete button — so the user sees exactly what they're losing.
 */
@Component({
  selector: 'app-delete-session-dialog',
  standalone: true,
  imports: [DatePipe, DecimalPipe, ModalComponent, ButtonDirective, BadgeDirective],
  template: `
    <app-modal title="Eliminar sesión" size="sm" (closed)="resolve(false)">
      <div class="modal-pad body">
        <p class="lead">
          Vas a eliminar esta sesión de forma permanente. Esta acción no se puede deshacer.
        </p>

        <div class="summary">
          <div class="summary-head">
            <span class="name">{{ data().name }}</span>
            <span appBadge tone="neutral" [chip]="true">{{ data().symbol }}</span>
          </div>

          @if (points()) {
            <svg
              class="spark"
              viewBox="0 0 240 56"
              preserveAspectRatio="none"
              [class.up]="data().pnl >= 0"
              [class.down]="data().pnl < 0"
              aria-hidden="true"
            >
              <polyline
                [attr.points]="points()"
                fill="none"
                stroke-width="1.5"
                vector-effect="non-scaling-stroke"
              />
            </svg>
          }

          <dl class="stats">
            <div>
              <dt>Trades</dt>
              <dd>{{ data().trades }}</dd>
            </div>
            <div>
              <dt>P/L neto</dt>
              <dd [class.up]="data().pnl >= 0" [class.down]="data().pnl < 0">
                {{ data().pnl >= 0 ? '+' : '' }}{{ data().pnl | number: '1.2-2' }} $
              </dd>
            </div>
            <div>
              <dt>Balance</dt>
              <dd>{{ data().balance | number: '1.2-2' }} $</dd>
            </div>
          </dl>

          <p class="created">Creada el {{ data().createdAt | date: 'dd MMM yyyy, HH:mm' }}</p>
        </div>
      </div>

      <div footer class="modal-foot">
        <button appButton variant="ghost" (click)="resolve(false)">Cancelar</button>
        <button appButton variant="danger-solid" (click)="resolve(true)">Eliminar sesión</button>
      </div>
    </app-modal>
  `,
  styles: [
    `
      .body {
        display: flex;
        flex-direction: column;
        gap: var(--space-4);
      }
      .lead {
        margin: 0;
        color: var(--text-muted);
        line-height: var(--leading-normal);
      }
      .summary {
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
        padding: var(--space-3);
        background: var(--surface-2);
        border: 1px solid var(--border);
        border-radius: var(--radius-md);
      }
      .summary-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--space-2);
      }
      .name {
        font-weight: var(--weight-semibold);
        overflow-wrap: anywhere;
      }
      .spark {
        width: 100%;
        height: 48px;
        color: var(--text-muted);
      }
      .spark.up {
        color: var(--up);
      }
      .spark.down {
        color: var(--down);
      }
      .spark polyline {
        stroke: currentColor;
      }
      .stats {
        margin: 0;
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: var(--space-2);
      }
      .stats dt {
        font-size: var(--text-2xs);
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: var(--text-muted);
      }
      .stats dd {
        margin: 2px 0 0;
        font-size: var(--text-sm);
        font-weight: var(--weight-semibold);
      }
      .created {
        margin: 0;
        font-size: var(--text-xs);
        color: var(--text-muted);
      }
      .up {
        color: var(--up);
      }
      .down {
        color: var(--down);
      }
    `,
  ],
})
export class DeleteSessionDialogComponent {
  data = input.required<DeleteSessionData>();
  result = output<boolean>();

  /** Equity sparkline as an SVG polyline `points` string in a 240x56 box. */
  points = computed(() => {
    const equity = this.data().equity;
    if (equity.length < 2) return '';
    const w = 240;
    const h = 56;
    const pad = 3;
    const min = Math.min(...equity);
    const max = Math.max(...equity);
    const span = max - min || 1;
    const stepX = (w - pad * 2) / (equity.length - 1);
    return equity
      .map((v, i) => {
        const x = pad + i * stepX;
        const y = pad + (h - pad * 2) * (1 - (v - min) / span);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  });

  resolve(value: boolean): void {
    this.result.emit(value);
  }
}
