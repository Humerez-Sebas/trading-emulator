import { Component, ChangeDetectionStrategy, input, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import type { ScatterPointView } from '../../state/journal/journal-read.models';

/**
 * Scatter MAE vs MFE (RFC-016 Task 6, DESIGN_SYSTEM §4.2).
 * Standalone inline-SVG component: X=MAE_R, Y=MFE_R, origin visible,
 * dashed identity line, 6px radius points, opacity 0.85, color from colorToken.
 * Tooltip on hover/focus, click/Enter → tradeSelected output (D16.F).
 * No Store injection, no dispatches (J-6).
 */
@Component({
  selector: 'app-scatter-mae-mfe',
  standalone: true,
  imports: [CommonModule],
  template: `
    <svg
      viewBox="0 0 800 600"
      preserveAspectRatio="xMidYMid meet"
      [attr.aria-label]="ariaLabel()"
      class="scatter-chart"
    >
      <!-- Canvas background -->
      <rect width="800" height="600" fill="var(--viz-grid)" />

      <!-- Grid lines and axes -->
      <g class="grid-and-axes">
        <!-- X axis (y=0) -->
        <line
          data-axis="x"
          x1="100"
          y1="300"
          x2="750"
          y2="300"
          stroke="var(--viz-axis)"
          stroke-width="1"
        />
        <!-- Y axis (x=0) -->
        <line
          data-axis="y"
          x1="100"
          y1="50"
          x2="100"
          y2="550"
          stroke="var(--viz-axis)"
          stroke-width="1"
        />

        <!-- Identity line (x=y, dashed) -->
        <line
          data-line="identity"
          x1="100"
          y1="550"
          x2="750"
          y2="50"
          stroke="var(--viz-axis)"
          stroke-width="1"
          stroke-dasharray="5,5"
          opacity="0.5"
        />
      </g>

      <!-- Data points -->
      <g class="points">
        @for (point of points(); track point.tradeId) {
          <circle
            data-point
            [attr.cx]="scaleX(point.maeR)"
            [attr.cy]="scaleY(point.mfeR)"
            r="6"
            opacity="0.85"
            [attr.fill]="point.colorToken"
            [attr.data-trade-id]="point.tradeId"
            tabindex="0"
            role="button"
            [attr.aria-label]="'Trade ' + point.seq"
            (click)="onPointClick(point.tradeId)"
            (keydown.enter)="onPointClick(point.tradeId)"
            (mouseenter)="showTooltip(point)"
            (mouseleave)="hideTooltip()"
          />
        }
      </g>

      <!-- Tooltip -->
      @if (activeTooltip()) {
        <g data-tooltip [attr.transform]="tooltipTransform()">
          <!-- Tooltip panel -->
          <rect
            x="-60"
            y="-50"
            width="120"
            height="40"
            rx="4"
            fill="var(--surface-3)"
            stroke="var(--border)"
            stroke-width="1"
          />
          <text
            x="0"
            y="-20"
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
            y="-5"
            text-anchor="middle"
            fill="var(--text-muted)"
            font-size="10"
            class="tooltip-subtitle"
          >
            {{ tooltipSubtitle() }}
          </text>
        </g>
      }

      <!-- Axes labels -->
      <text
        x="750"
        y="580"
        text-anchor="end"
        fill="var(--text-muted)"
        font-size="11"
        font-weight="500"
        font-variant-numeric="tabular-nums"
        class="axis-label"
      >
        MAE (R)
      </text>
      <text
        x="50"
        y="20"
        text-anchor="middle"
        fill="var(--text-muted)"
        font-size="11"
        font-weight="500"
        font-variant-numeric="tabular-nums"
        class="axis-label"
      >
        MFE (R)
      </text>
    </svg>
  `,
  styles: `
    :host {
      display: block;
      width: 100%;
      height: auto;
      aspect-ratio: 4 / 3;
    }

    .scatter-chart {
      width: 100%;
      height: 100%;
      max-width: 100%;
      display: block;
    }

    circle[data-point] {
      cursor: pointer;
      transition: opacity 150ms cubic-bezier(0.2, 0, 0, 1);
    }

    circle[data-point]:hover,
    circle[data-point]:focus-visible {
      opacity: 1 !important;
      outline: 2px solid var(--accent);
      outline-offset: 2px;
    }

    @media (prefers-reduced-motion: reduce) {
      circle[data-point] {
        transition-duration: 0.01ms !important;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScatterMaeMfeComponent {
  points = input.required<ScatterPointView[]>();
  tradeSelected = output<string>();

  activeTooltip = signal<ScatterPointView | null>(null);

  // Computed SVG coordinates: scale MAE_R and MFE_R to canvas area
  // Canvas area: 100px margin, 650px wide/high, center at origin (0,0) = (400px, 300px)
  // Range: typically -2 to +2 R, but we scale dynamically to fit all points
  scaleX(value: number): number {
    // X: MAE_R from left to right
    // Map -3..+3 to 100..750
    const scaled = ((value + 3) / 6) * 650 + 100;
    return Math.max(100, Math.min(750, scaled));
  }

  scaleY(value: number): number {
    // Y: MFE_R from bottom to top (SVG y increases downward)
    // Map -3..+3 to 550..50 (inverted)
    const scaled = 550 - ((value + 3) / 6) * 500;
    return Math.max(50, Math.min(550, scaled));
  }

  ariaLabel(): string {
    const n = this.points().length;
    return `Gráfico de dispersión: MAE contra MFE de ${n} trades. Cada punto es un trade. Selecciona un punto para abrir su repetición detallada.`;
  }

  showTooltip(point: ScatterPointView): void {
    this.activeTooltip.set(point);
  }

  hideTooltip(): void {
    this.activeTooltip.set(null);
  }

  onPointClick(tradeId: string): void {
    this.tradeSelected.emit(tradeId);
  }

  tooltipTitle(): string {
    const t = this.activeTooltip();
    if (!t) return '';
    const date = new Date(t.openTime * 1000).toISOString().split('T')[0];
    const sign = t.rMultiple >= 0 ? '+' : '';
    return `#${t.seq} · ${date} · ${sign}${t.rMultiple.toFixed(2)}R`;
  }

  tooltipSubtitle(): string {
    const t = this.activeTooltip();
    if (!t || !t.ruleTitle) return '';
    return t.ruleTitle;
  }

  tooltipTransform(): string {
    const t = this.activeTooltip();
    if (!t) return '';
    const x = this.scaleX(t.maeR);
    const y = this.scaleY(t.mfeR);
    return `translate(${x},${y - 60})`;
  }
}
