import { Component, ChangeDetectionStrategy, input, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import type { ScatterPointView } from '../../state/journal/journal-read.models';

/** Small floor (in R) for each axis's data-fit domain — avoids a degenerate
 * (division-by-zero) domain when every point clusters at/near 0 (T6 review
 * Finding 1 fix wave). MAE_R and MFE_R are ALWAYS >= 0 (fill-engine clamps
 * excursions to >=0 over a positive risk distance — `fill-engine.ts`,
 * `excursion-stats.ts`), so a symmetric [-3,+3] domain wastes 3/4 of the
 * canvas and misplaces the MAE=0/MFE=0 reference axes. Domains are now
 * `[0, max(data max, MIN_AXIS_DOMAIN_R)]` per axis, independently. */
const MIN_AXIS_DOMAIN_R = 1;

/**
 * Scatter MAE vs MFE (RFC-016 Task 6, DESIGN_SYSTEM §4.2).
 * Standalone inline-SVG component: X=MAE_R, Y=MFE_R, non-negative data-fit
 * domain per axis, origin visible at the bottom-left corner, dashed identity
 * line, 6px radius points, opacity 0.85, color from colorToken.
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

      <!-- Grid lines and axes: MFE=0 (x) and MAE=0 (y) reference lines drawn
           at scaleX(0)/scaleY(0) — always the plot's bottom-left corner,
           since both domains start at 0 (T6 review Finding 1 fix wave). -->
      <g class="grid-and-axes">
        <!-- MFE=0 axis (horizontal) -->
        <line
          data-axis="x"
          [attr.x1]="scaleX(0)"
          [attr.y1]="scaleY(0)"
          x2="750"
          [attr.y2]="scaleY(0)"
          stroke="var(--viz-axis)"
          stroke-width="1"
        />
        <!-- MAE=0 axis (vertical) -->
        <line
          data-axis="y"
          [attr.x1]="scaleX(0)"
          y1="50"
          [attr.x2]="scaleX(0)"
          y2="550"
          stroke="var(--viz-axis)"
          stroke-width="1"
        />

        <!-- Identity line (MAE=MFE, dashed): from the origin to the smaller
             of the two axis domains, so every plotted point on the line is
             a true (v,v) identity pair, never a clamped bend. -->
        <line
          data-line="identity"
          [attr.x1]="scaleX(0)"
          [attr.y1]="scaleY(0)"
          [attr.x2]="scaleX(identityDomain())"
          [attr.y2]="scaleY(identityDomain())"
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
            [attr.aria-label]="pointAriaLabel(point)"
            (click)="onPointClick(point.tradeId)"
            (keydown.enter)="onPointClick(point.tradeId)"
            (mouseenter)="showTooltip(point)"
            (mouseleave)="hideTooltip()"
            (focus)="showTooltip(point)"
            (blur)="hideTooltip()"
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
    }

    /* Stroke-based focus ring (T6 review Finding 3): CSS outline paints
       unreliably on SVG geometry elements (circle/rect) across engines;
       a stroke change is the robust SVG focus-indicator pattern. */
    circle[data-point]:focus-visible {
      stroke: var(--accent);
      stroke-width: 3;
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

  // Non-negative, data-fit domain per axis (T6 review Finding 1): MAE_R and
  // MFE_R are always >= 0, so each axis's domain is [0, max(data max, floor)],
  // independently — the two domains are NOT assumed equal (asymmetric MAE
  // vs MFE ranges are the common case).
  private domainMaxX(): number {
    return Math.max(MIN_AXIS_DOMAIN_R, ...this.points().map((p) => p.maeR));
  }

  private domainMaxY(): number {
    return Math.max(MIN_AXIS_DOMAIN_R, ...this.points().map((p) => p.mfeR));
  }

  /** The data value up to which BOTH axes' domains agree — the identity
   * line (MAE=MFE) is drawn only up to this value so every point on the
   * drawn line is a true (v,v) pair, not a clamped bend past one domain. */
  identityDomain(): number {
    return Math.min(this.domainMaxX(), this.domainMaxY());
  }

  // Computed SVG coordinates: scale MAE_R/MFE_R to canvas area.
  // Canvas plot area: x in [100,750], y in [50,550] (100px margins).
  scaleX(value: number): number {
    // X: MAE_R from left (0) to right (domainMaxX)
    const maxX = this.domainMaxX();
    const scaled = 100 + (value / maxX) * 650;
    return Math.max(100, Math.min(750, scaled));
  }

  scaleY(value: number): number {
    // Y: MFE_R from bottom (0) to top (domainMaxY) — SVG y increases
    // downward, so 0 maps to the LARGER y (550, bottom) and the max maps
    // to the smaller y (50, top).
    const maxY = this.domainMaxY();
    const scaled = 550 - (value / maxY) * 500;
    return Math.max(50, Math.min(550, scaled));
  }

  ariaLabel(): string {
    const n = this.points().length;
    return `Gráfico de dispersión: MAE contra MFE de ${n} trades. Cada punto es un trade. Selecciona un punto para abrir su repetición detallada.`;
  }

  /** Per-point accessible name (T6 review Finding 2): same physical facts
   * the hover tooltip shows, so a keyboard/AT user tabbing between points
   * gets the date/R/rule without needing the pointer. */
  pointAriaLabel(point: ScatterPointView): string {
    const date = new Date(point.openTime * 1000).toISOString().split('T')[0];
    const sign = point.rMultiple >= 0 ? '+' : '';
    const rule = point.ruleTitle ? ` · ${point.ruleTitle}` : '';
    return `Trade #${point.seq} · ${date} · ${sign}${point.rMultiple.toFixed(2)}R${rule}`;
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
