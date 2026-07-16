import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import type { ScatterPointView } from '../../state/journal/journal-read.models';
import { ScatterMaeMfeComponent } from '../../components/journal-viz/scatter-mae-mfe.component';

/** Below this many plottable points, the scatter shows the insufficient-data
 * message instead of a mount slot (design spec §1.8, threshold of 3). */
const INSUFFICIENT_DATA_THRESHOLD = 3;

/**
 * Execution section shell (design spec §1.3): hosts the MAE-vs-MFE scatter.
 * Task 5 renders the section shell + states only; the actual
 * `ScatterMaeMfeComponent` (SVG rendering, Task 6) mounts into `.viz-mount`.
 * `tradeSelected` is wired through for Task 6 to emit on point click.
 */
@Component({
  selector: 'app-execution-section',
  standalone: true,
  imports: [ScatterMaeMfeComponent],
  templateUrl: './execution-section.component.html',
  styleUrl: './execution-section.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExecutionSectionComponent {
  points = input.required<ScatterPointView[]>();
  tradeSelected = output<string>();

  insufficientData = computed(() => this.points().length < INSUFFICIENT_DATA_THRESHOLD);
}
