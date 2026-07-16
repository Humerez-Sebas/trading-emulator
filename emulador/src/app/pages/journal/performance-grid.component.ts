import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { DecimalPipe, PercentPipe } from '@angular/common';
import type { SessionStatsView } from '../../state/journal/journal-read.models';

/**
 * Performance section: 10-card metrics grid (design spec §1.2). Pure
 * presentation — all formatting lives here (the builder ships raw numbers).
 * D16.C guardrail: no card compares across sessions, shows a trend, or a
 * benchmark — every value is a fact of THIS session alone.
 */
@Component({
  selector: 'app-performance-grid',
  standalone: true,
  imports: [DecimalPipe, PercentPipe],
  templateUrl: './performance-grid.component.html',
  styleUrl: './performance-grid.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PerformanceGridComponent {
  stats = input.required<SessionStatsView>();

  /** "1.85" (2 dec), or "∞" with no losing trades (design spec §1.2). */
  profitFactorLabel(): string {
    const pf = this.stats().profitFactor;
    return pf === Infinity ? '∞' : pf.toFixed(2);
  }

  /** "0.42" (2 dec), or "—" when n<2 / stddev 0 (D16.C.3). */
  sharpeLabel(): string {
    const sharpe = this.stats().sharpe;
    return sharpe === null ? '—' : sharpe.toFixed(2);
  }

  /** "0.55R" / "—" when the session has no trade with a resolvable excursion. */
  excursionLabel(value: number | null): string {
    return value === null ? '—' : `${value.toFixed(2)}R`;
  }
}
