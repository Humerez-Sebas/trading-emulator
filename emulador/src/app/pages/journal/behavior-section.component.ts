import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import type {
  BehaviorFactsView,
  BubbleView,
  HeatmapCellView,
} from '../../state/journal/journal-read.models';
import { BubbleDurationRComponent } from '../../components/journal-viz/bubble-duration-r.component';
import { HeatmapTradeCalendarComponent } from '../../components/journal-viz/heatmap-trade-calendar.component';

const INSUFFICIENT_DATA_THRESHOLD = 3;

/**
 * Behavior section shell (design spec §1.4): hosts the Duration-vs-R bubble,
 * the trade-calendar heatmap, and the navigation-facts row (plain template,
 * no child component — component-architecture §1.1). Task 5 renders shells +
 * the facts row now; Task 6 mounts `BubbleDurationRComponent`/`HeatmapTradeCalendarComponent`
 * (SVG rendering) into the `.viz-mount` slots.
 */
@Component({
  selector: 'app-behavior-section',
  standalone: true,
  imports: [BubbleDurationRComponent, HeatmapTradeCalendarComponent],
  templateUrl: './behavior-section.component.html',
  styleUrl: './behavior-section.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BehaviorSectionComponent {
  bubbles = input.required<BubbleView[]>();
  cells = input.required<HeatmapCellView[]>();
  facts = input.required<BehaviorFactsView>();
  tradeSelected = output<string>();

  insufficientData = computed(() => this.bubbles().length < INSUFFICIENT_DATA_THRESHOLD);
}
