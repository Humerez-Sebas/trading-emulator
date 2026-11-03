import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';
import { DecimalPipe, PercentPipe } from '@angular/common';
import type { RulePerformanceRow } from '../../state/journal/journal-read.models';

/**
 * Rule Performance table (design spec §1.5, P-1). Owns the toggle state for
 * its OWN row highlight (click a rule row to filter the Trades table; click
 * the SAME row again to deactivate — `ruleFilterToggled` emits the new
 * value, `null` on deactivation). Local ownership means the clicked row
 * highlights immediately without a round trip through the page.
 *
 * The "Sin declarar" row (ruleId `null`) is DISPLAY-ONLY, not filter-
 * toggleable: `ruleFilterToggled`'s `string | null` signature (component-
 * architecture §1.1) cannot distinguish "no filter" from "filter =
 * undeclared" — both would have to emit `null`. Making it clickable would
 * either collide with clearing the filter or require widening the output
 * type beyond what the architecture doc specifies; documented decision,
 * task-5-report.md. P-1 (undeclared trades are first-class) is satisfied by
 * the row always being PRESENT and counted — clickability is a separate,
 * narrower claim this phase doesn't make.
 */
@Component({
  selector: 'app-rule-performance-table',
  standalone: true,
  imports: [DecimalPipe, PercentPipe],
  templateUrl: './rule-performance-table.component.html',
  styleUrl: './rule-performance-table.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RulePerformanceTableComponent {
  rows = input.required<RulePerformanceRow[]>();
  ruleFilterToggled = output<string | null>();

  private active = signal<string | null>(null);

  isActive(ruleId: string): boolean {
    return this.active() === ruleId;
  }

  toggle(ruleId: string): void {
    if (this.isActive(ruleId)) {
      this.active.set(null);
      this.ruleFilterToggled.emit(null);
    } else {
      this.active.set(ruleId);
      this.ruleFilterToggled.emit(ruleId);
    }
  }
}
