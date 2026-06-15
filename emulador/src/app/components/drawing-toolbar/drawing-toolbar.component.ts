import { Component } from '@angular/core';
import { ToolbarToolsComponent } from '../toolbar-tools/toolbar-tools.component';

/** Fixed vertical sidebar with the shared drawing/trade tools. */
@Component({
  selector: 'app-drawing-toolbar',
  standalone: true,
  imports: [ToolbarToolsComponent],
  templateUrl: './drawing-toolbar.component.html',
  styleUrl: './drawing-toolbar.component.css',
})
export class DrawingToolbarComponent {}
