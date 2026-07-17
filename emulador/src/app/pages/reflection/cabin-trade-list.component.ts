import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';

/**
 * One row of the Cabin's 30%-column trade list (design spec §2.2): #, hora,
 * side, R (result color), rule badge, `✎`. Identical FIELD SET to
 * `TradeRowView` (`state/journal/journal-read.models.ts`) — "one loader, two
 * surfaces" (component-architecture §3.1): the Journal already built this
 * exact view row (including `hasReflection`), so the page passes
 * `buildTradeRows(model)`'s output straight through rather than re-deriving
 * a parallel shape. `CabinTradeRow` is a structural alias, not a new builder.
 */
export interface CabinTradeRow {
  tradeId: string;
  seq: number;
  /** UTC seconds; the row formats `HH:mm` UTC. */
  openTime: number;
  side: 'C' | 'V';
  rMultiple: number;
  ruleBadge: string;
  colorToken: string;
  hasReflection: boolean;
}

/**
 * 30% trade list (design spec §2.2). Active row: `--surface-2` bg + 2px
 * `--accent` left border. Pure presentation — selection/navigation state is
 * owned by the page (`activeTradeId`, driven by the route's `:tradeId`).
 */
@Component({
  selector: 'app-cabin-trade-list',
  standalone: true,
  imports: [DatePipe, DecimalPipe],
  template: `
    <ul class="cabin-trade-list" role="list">
      @for (row of trades(); track row.tradeId) {
        <li>
          <button
            type="button"
            class="row"
            [class.active]="row.tradeId === activeTradeId()"
            (click)="tradeSelected.emit(row.tradeId)"
          >
            <span class="seq">{{ row.seq }}</span>
            <span class="time">{{ row.openTime * 1000 | date: 'HH:mm' : 'UTC' }}</span>
            <span class="side">{{ row.side }}</span>
            <span class="r" [class.up]="row.rMultiple >= 0" [class.down]="row.rMultiple < 0">
              {{ row.rMultiple >= 0 ? '+' : '' }}{{ row.rMultiple | number: '1.2-2' }}R
            </span>
            @if (row.ruleBadge) {
              <span class="rule-badge">
                <span class="rule-swatch" [style.background]="row.colorToken" aria-hidden="true"></span>
                {{ row.ruleBadge }}
              </span>
            }
            @if (row.hasReflection) {
              <span class="reflection-mark" aria-label="Tiene reflexión">✎</span>
            }
          </button>
        </li>
      }
    </ul>
  `,
  styles: `
    .cabin-trade-list {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .row {
      width: 100%;
      display: flex;
      align-items: center;
      gap: var(--space-2);
      padding: var(--density-pad);
      border: none;
      border-inline-start: 2px solid transparent;
      background: transparent;
      color: var(--text);
      font-size: var(--density-font);
      font-variant-numeric: tabular-nums;
      text-align: left;
      cursor: pointer;
      border-radius: var(--density-radius);
    }
    .row:hover {
      background: var(--surface);
    }
    .row.active {
      background: var(--surface-2);
      border-inline-start-color: var(--accent);
    }
    .seq {
      color: var(--text-muted);
      min-width: 2ch;
    }
    .r.up {
      color: var(--up);
    }
    .r.down {
      color: var(--down);
    }
    .r {
      margin-inline-start: auto;
    }
    .rule-badge {
      display: inline-flex;
      align-items: center;
      gap: var(--space-1);
      font-size: var(--text-2xs);
      color: var(--text-muted);
    }
    .rule-swatch {
      display: inline-block;
      width: 8px;
      height: 8px;
      border-radius: var(--radius-full);
      flex-shrink: 0;
    }
    .reflection-mark {
      color: var(--accent);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CabinTradeListComponent {
  trades = input.required<CabinTradeRow[]>();
  activeTradeId = input<string | null>(null);
  tradeSelected = output<string>();
}
