import { Component, ChangeDetectionStrategy, input, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import type { HeatmapCellView } from '../../state/journal/journal-read.models';

/**
 * Heatmap Trade Calendar (RFC-016 Task 6, DESIGN_SYSTEM §4.4).
 * Standalone inline-SVG component: X=trade sequence, Y=single row (session),
 * cell intensity diverging scale (--up for R>0, --down for R<0, --border-strong neutral).
 * No Store injection, no dispatches (J-6).
 */
@Component({
  selector: 'app-heatmap-trade-calendar',
  standalone: true,
  imports: [CommonModule],
  template: `
    <svg
      viewBox="0 0 800 150"
      preserveAspectRatio="xMidYMid meet"
      [attr.aria-label]="ariaLabel()"
      class="heatmap-chart"
    >
      <!-- Canvas background -->
      <rect width="800" height="150" fill="var(--viz-grid)" />

      <!-- Grid: X axis at bottom -->
      <g class="grid">
        <line x1="100" y1="120" x2="750" y2="120" stroke="var(--viz-axis)" stroke-width="1" />
      </g>

      <!-- Cells -->
      <g class="cells">
        @for (cell of cells(); track cell.tradeId) {
          <rect
            data-cell
            [attr.x]="cellX(cell.seq)"
            y="40"
            [attr.width]="cellWidth()"
            height="70"
            [attr.fill]="cellColor(cell.rMultiple)"
            [attr.data-trade-id]="cell.tradeId"
            tabindex="0"
            role="button"
            [attr.aria-label]="'Trade ' + cell.seq"
            (click)="onCellClick(cell.tradeId)"
            (keydown.enter)="onCellClick(cell.tradeId)"
            (mouseenter)="showTooltip(cell)"
            (mouseleave)="hideTooltip()"
          />
        }
      </g>

      <!-- Tooltip -->
      @if (activeTooltip()) {
        <g data-tooltip [attr.transform]="tooltipTransform()">
          <!-- Tooltip panel -->
          <rect
            x="-50"
            y="-35"
            width="100"
            height="30"
            rx="4"
            fill="var(--surface-3)"
            stroke="var(--border)"
            stroke-width="1"
          />
          <text
            x="0"
            y="-15"
            text-anchor="middle"
            fill="var(--text)"
            font-size="11"
            font-weight="500"
            class="tooltip-title"
          >
            {{ tooltipTitle() }}
          </text>
          <text
            x="0"
            y="0"
            text-anchor="middle"
            fill="var(--text-muted)"
            font-size="10"
            class="tooltip-value"
          >
            {{ tooltipValue() }}
          </text>
        </g>
      }

      <!-- X axis label -->
      <text
        x="400"
        y="145"
        text-anchor="middle"
        fill="var(--text-muted)"
        font-size="11"
        font-weight="500"
        class="axis-label"
      >
        Secuencia del trade
      </text>
    </svg>
  `,
  styles: `
    :host {
      display: block;
      width: 100%;
      height: auto;
      aspect-ratio: 6 / 1;
    }

    .heatmap-chart {
      width: 100%;
      height: 100%;
      max-width: 100%;
      display: block;
    }

    rect[data-cell] {
      cursor: pointer;
      transition: opacity 150ms cubic-bezier(0.2, 0, 0, 1);
    }

    rect[data-cell]:hover,
    rect[data-cell]:focus-visible {
      opacity: 0.8 !important;
      outline: 2px solid var(--accent);
      outline-offset: 2px;
    }

    @media (prefers-reduced-motion: reduce) {
      rect[data-cell] {
        transition-duration: 0.01ms !important;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HeatmapTradeCalendarComponent {
  cells = input.required<HeatmapCellView[]>();
  tradeSelected = output<string>();

  activeTooltip = signal<HeatmapCellView | null>(null);

  cellWidth(): number {
    // Available width: 650px (750 - 100), divided by number of cells
    if (!this.cells().length) return 0;
    return 650 / this.cells().length;
  }

  cellX(seq: number): number {
    // X position for cell at sequence (1-based)
    const width = this.cellWidth();
    return 100 + (seq - 1) * width;
  }

  cellColor(rMultiple: number): string {
    if (Math.abs(rMultiple) < 0.05) {
      // Neutral for |R| < 0.05
      return 'var(--border-strong)';
    }

    const maxAbsR = Math.max(...this.cells().map((c) => Math.abs(c.rMultiple)), 1);
    const intensity = Math.abs(rMultiple) / maxAbsR; // 0 to 1

    if (rMultiple > 0) {
      // Up-toned: use --up with varying intensity via color-mix
      // Mix --up with background to create intensity gradient
      return `color-mix(in srgb, var(--up) ${intensity * 100}%, var(--viz-grid))`;
    } else {
      // Down-toned: use --down with varying intensity
      return `color-mix(in srgb, var(--down) ${intensity * 100}%, var(--viz-grid))`;
    }
  }

  ariaLabel(): string {
    const n = this.cells().length;
    return `Mapa de calor: calendario de trades de ${n} trades en una sesión. Cada celda es un trade codificado por ganancia (verde) o pérdida (rojo), con intensidad proporcional a R. Selecciona una celda para abrir su repetición detallada.`;
  }

  showTooltip(cell: HeatmapCellView): void {
    this.activeTooltip.set(cell);
  }

  hideTooltip(): void {
    this.activeTooltip.set(null);
  }

  onCellClick(tradeId: string): void {
    this.tradeSelected.emit(tradeId);
  }

  tooltipTitle(): string {
    const c = this.activeTooltip();
    if (!c) return '';
    return `#${c.seq}`;
  }

  tooltipValue(): string {
    const c = this.activeTooltip();
    if (!c) return '';
    const sign = c.rMultiple >= 0 ? '+' : '';
    return `${sign}${c.rMultiple.toFixed(2)}R`;
  }

  tooltipTransform(): string {
    const c = this.activeTooltip();
    if (!c) return '';
    const x = this.cellX(c.seq) + this.cellWidth() / 2;
    const y = 40 - 20; // Cell top y minus padding
    return `translate(${x},${y})`;
  }
}
