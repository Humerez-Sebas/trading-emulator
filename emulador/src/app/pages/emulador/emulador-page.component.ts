import { Component, inject } from '@angular/core';
import { Store } from '@ngrx/store';
import { ChartComponent } from '../../components/chart/chart.component';
import { ControlsComponent } from '../../components/controls/controls.component';
import { DrawingToolbarComponent } from '../../components/drawing-toolbar/drawing-toolbar.component';
import { SideDockComponent } from '../../components/side-dock/side-dock.component';
import { SessionSummaryComponent } from '../../components/session-summary/session-summary.component';
import { FloatingToolbarComponent } from '../../components/floating-toolbar/floating-toolbar.component';
import { CsvStartDialogComponent } from '../../components/csv-start-dialog/csv-start-dialog.component';
import { IntervalDialogComponent } from '../../components/interval-dialog/interval-dialog.component';
import { PlaybackControllerComponent } from '../../components/playback-controller/playback-controller.component';
import { FloatingPnlComponent } from '../../components/floating-pnl/floating-pnl.component';
import { tradingFeature } from '../../state/trading/trading.reducer';
import { settingsFeature } from '../../state/settings/settings.reducer';

@Component({
  selector: 'app-emulador-page',
  standalone: true,
  imports: [
    ChartComponent,
    ControlsComponent,
    DrawingToolbarComponent,
    SideDockComponent,
    SessionSummaryComponent,
    FloatingToolbarComponent,
    CsvStartDialogComponent,
    IntervalDialogComponent,
    PlaybackControllerComponent,
    FloatingPnlComponent,
  ],
  template: `
    <div class="layout">
      <app-controls></app-controls>
      <div class="workspace">
        <app-drawing-toolbar></app-drawing-toolbar>
        <main class="chart-area">
          <app-chart></app-chart>
          <app-floating-pnl></app-floating-pnl>
          <app-playback-controller></app-playback-controller>
          @if (floatingToolbar()) {
            <app-floating-toolbar></app-floating-toolbar>
          }
        </main>
        <app-side-dock></app-side-dock>
      </div>
      @if (summaryOpen()) {
        <app-session-summary></app-session-summary>
      }
      <app-csv-start-dialog></app-csv-start-dialog>
      <app-interval-dialog></app-interval-dialog>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        height: 100%;
      }
      .layout {
        display: flex;
        flex-direction: column;
        height: 100%;
      }
      .workspace {
        display: flex;
        flex: 1;
        min-height: 0;
      }
      .chart-area {
        flex: 1;
        min-width: 0;
        position: relative;
      }
    `,
  ],
})
export class EmuladorPageComponent {
  private store = inject(Store);

  summaryOpen = this.store.selectSignal(tradingFeature.selectSummaryOpen);
  floatingToolbar = this.store.selectSignal(settingsFeature.selectFloatingToolbar);
}
