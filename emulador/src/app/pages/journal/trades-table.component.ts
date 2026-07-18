import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import type { TradeRowView } from '../../state/journal/journal-read.models';

/**
 * Trades table (design spec §1.7). The only Journal table with row-level
 * keyboard selection (`--surface-2` bg + `--accent` left border) and a click-
 * to-navigate row — both driven from the PAGE's global keydown handler
 * (component-architecture §2.2 idiom, mirrored from the Cabin): this
 * component only renders the CURRENT `selectedTradeId` and emits on click.
 *
 * `selectedTradeId` is an ADDITIVE input beyond the component-architecture
 * ASCII tree's literal `[input] rows / [input] ruleFilter / [output]
 * tradeSelected` list — needed to satisfy design spec §1.7's keyboard-
 * selected row style, which has no other channel to reach this leaf.
 * Documented decision, task-5-report.md.
 */
@Component({
  selector: 'app-trades-table',
  standalone: true,
  imports: [DatePipe, DecimalPipe],
  templateUrl: './trades-table.component.html',
  styleUrl: './trades-table.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TradesTableComponent {
  rows = input.required<TradeRowView[]>();
  ruleFilter = input<string | null>(null);
  selectedTradeId = input<string | null>(null);
  tradeSelected = output<string>();

  filteredRows = computed(() => {
    const filter = this.ruleFilter();
    const rows = this.rows();
    return filter === null ? rows : rows.filter((r) => r.ruleId === filter);
  });

  select(tradeId: string): void {
    this.tradeSelected.emit(tradeId);
  }
}
