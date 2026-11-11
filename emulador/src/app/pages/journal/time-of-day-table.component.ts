import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { DecimalPipe, PercentPipe } from '@angular/common';
import type { TimeOfDayRow } from '../../state/journal/journal-read.models';

/** Time of Day table (design spec §1.6): read-only, no click interaction. */
@Component({
  selector: 'app-time-of-day-table',
  standalone: true,
  imports: [DecimalPipe, PercentPipe],
  templateUrl: './time-of-day-table.component.html',
  styleUrl: './time-of-day-table.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TimeOfDayTableComponent {
  rows = input.required<TimeOfDayRow[]>();

  /** "00" .. "23" zero-padded hour label for the "Franja (UTC)" column. */
  hourLabel(hourUtc: number): string {
    return `${String(hourUtc).padStart(2, '0')}:00`;
  }
}
