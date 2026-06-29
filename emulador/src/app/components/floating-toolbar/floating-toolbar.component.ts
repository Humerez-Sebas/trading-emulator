import { Component } from '@angular/core';
import { ToolbarToolsComponent } from '../toolbar-tools/toolbar-tools.component';
import { DraggableDirective } from '../ui/draggable.directive';

/**
 * TradingView-style floating quick-access bar for the shared tools: a
 * horizontal strip that can be dragged anywhere over the chart area by its
 * ⋮⋮ handle. Mirrors the fixed sidebar toolbar.
 */
@Component({
  selector: 'app-floating-toolbar',
  standalone: true,
  imports: [ToolbarToolsComponent, DraggableDirective],
  templateUrl: './floating-toolbar.component.html',
  styleUrl: './floating-toolbar.component.css',
})
export class FloatingToolbarComponent {}
