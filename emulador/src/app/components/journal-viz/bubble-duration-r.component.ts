import { Component, ChangeDetectionStrategy, input, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import type { BubbleView } from '../../state/journal/journal-read.models';

/**
 * Bubble Duration vs R (RFC-016 Task 6, DESIGN_SYSTEM §4.3).
 * Standalone inline-SVG component: X=durationBaseCandles, Y=rMultiple,
 * radius ∝ sqrt(managementEventCount), min 4px max 20px.
 * Color from colorToken. Tooltip on hover/focus, click/Enter → tradeSelected output.
 * No Store injection, no dispatches (J-6).
 */
@Component({
  selector: 'app-bubble-duration-r',
  standalone: true,
  imports: [CommonModule],
  template: `
    <svg
      viewBox="0 0 800 600"
      preserveAspectRatio="xMidYMid meet"
      [attr.aria-label]="ariaLabel()"
      class="bubble-chart"
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
      </g>

      <!-- Data bubbles -->
      <g class="bubbles">
        @for (bubble of bubbles(); track bubble.tradeId) {
          <circle
            data-bubble
            [attr.cx]="scaleX(bubble.durationBaseCandles)"
            [attr.cy]="scaleY(bubble.rMultiple)"
            [attr.r]="bubbleRadius(bubble.managementEventCount)"
            opacity="0.85"
            [attr.fill]="bubble.colorToken"
            [attr.data-trade-id]="bubble.tradeId"
            tabindex="0"
            role="button"
            [attr.aria-label]="pointAriaLabel(bubble)"
            (click)="onBubbleClick(bubble.tradeId)"
            (keydown.enter)="onBubbleClick(bubble.tradeId)"
            (mouseenter)="showTooltip(bubble)"
            (mouseleave)="hideTooltip()"
            (focus)="showTooltip(bubble)"
            (blur)="hideTooltip()"
          />
        }
      </g>

      <!-- Tooltip -->
      @if (activeTooltip()) {
        <g data-tooltip [attr.transform]="tooltipTransform()">
          <!-- Tooltip panel -->
          <rect
            x="-75"
            y="-50"
            width="150"
            height="50"
            rx="4"
            fill="var(--surface-3)"
            stroke="var(--border)"
            stroke-width="1"
          />
          <text
            x="0"
            y="-25"
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
            y="-10"
            text-anchor="middle"
            fill="var(--text-muted)"
            font-size="10"
            class="tooltip-data"
          >
            {{ tooltipData() }}
          </text>
          <text
            x="0"
            y="5"
            text-anchor="middle"
            fill="var(--text-muted)"
            font-size="10"
            class="tooltip-rule"
          >
            {{ tooltipRule() }}
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
        Duración (velas base)
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
        R
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

    .bubble-chart {
      width: 100%;
      height: 100%;
      max-width: 100%;
      display: block;
    }

    circle[data-bubble] {
      cursor: pointer;
      transition: opacity 150ms cubic-bezier(0.2, 0, 0, 1);
    }

    circle[data-bubble]:hover,
    circle[data-bubble]:focus-visible {
      opacity: 1 !important;
    }

    /* Stroke-based focus ring (T6 review Finding 3): CSS outline paints
       unreliably on SVG geometry elements (circle/rect) across engines;
       a stroke change is the robust SVG focus-indicator pattern. */
    circle[data-bubble]:focus-visible {
      stroke: var(--accent);
      stroke-width: 3;
    }

    @media (prefers-reduced-motion: reduce) {
      circle[data-bubble] {
        transition-duration: 0.01ms !important;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BubbleDurationRComponent {
  bubbles = input.required<BubbleView[]>();
  tradeSelected = output<string>();

  activeTooltip = signal<BubbleView | null>(null);

  // Scale duration to X axis (0..max duration, left to right)
  scaleX(duration: number): number {
    // X: duration from left to right
    // Estimate max duration as 500 candles (typical range)
    const maxDuration = Math.max(...this.bubbles().map((b) => b.durationBaseCandles), 500);
    const scaled = (duration / maxDuration) * 650 + 100;
    return Math.max(100, Math.min(750, scaled));
  }

  // Scale R-multiple to Y axis (bottom to top)
  scaleY(rMultiple: number): number {
    // Y: R from bottom to top (inverted)
    // Estimate range -3..+3 R
    const scaled = 550 - ((rMultiple + 3) / 6) * 500;
    return Math.max(50, Math.min(550, scaled));
  }

  // Calculate bubble radius from management event count using sqrt scale
  bubbleRadius(eventCount: number): number {
    const MIN_RADIUS = 4;
    const MAX_RADIUS = 20;
    // sqrt scale: area proportional to event count
    const sqrtEvents = Math.sqrt(eventCount);
    // Normalize to reasonable max (sqrt(25) = 5)
    const normalized = (sqrtEvents / 5) * (MAX_RADIUS - MIN_RADIUS) + MIN_RADIUS;
    return Math.max(MIN_RADIUS, Math.min(MAX_RADIUS, normalized));
  }

  ariaLabel(): string {
    const n = this.bubbles().length;
    return `Gráfico de burbujas: duración contra R múltiple de ${n} trades. Cada burbuja es un trade; el radio indica eventos de gestión. Selecciona una burbuja para abrir su repetición detallada.`;
  }

  /** Per-bubble accessible name (T6 review Finding 2): same physical facts
   * the hover tooltip shows, so a keyboard/AT user tabbing between bubbles
   * gets duration/R/events/rule without needing the pointer. */
  pointAriaLabel(bubble: BubbleView): string {
    const sign = bubble.rMultiple >= 0 ? '+' : '';
    const eventsStr =
      bubble.managementEventCount === 1 ? '1 evento' : `${bubble.managementEventCount} eventos`;
    const rule = bubble.ruleTitle ? ` · ${bubble.ruleTitle}` : '';
    return `Trade #${bubble.seq} · ${bubble.durationBaseCandles} velas · ${sign}${bubble.rMultiple.toFixed(2)}R · ${eventsStr}${rule}`;
  }

  showTooltip(bubble: BubbleView): void {
    this.activeTooltip.set(bubble);
  }

  hideTooltip(): void {
    this.activeTooltip.set(null);
  }

  onBubbleClick(tradeId: string): void {
    this.tradeSelected.emit(tradeId);
  }

  tooltipTitle(): string {
    const b = this.activeTooltip();
    if (!b) return '';
    const sign = b.rMultiple >= 0 ? '+' : '';
    return `#${b.seq} · ${sign}${b.rMultiple.toFixed(2)}R`;
  }

  tooltipData(): string {
    const b = this.activeTooltip();
    if (!b) return '';
    return `Duración: ${b.durationBaseCandles} velas`;
  }

  tooltipRule(): string {
    const b = this.activeTooltip();
    if (!b) return '';
    const eventsStr =
      b.managementEventCount === 1 ? '1 evento' : `${b.managementEventCount} eventos`;
    const rule = b.ruleTitle ? ` · ${b.ruleTitle}` : '';
    return `${eventsStr}${rule}`;
  }

  tooltipTransform(): string {
    const b = this.activeTooltip();
    if (!b) return '';
    const x = this.scaleX(b.durationBaseCandles);
    const y = this.scaleY(b.rMultiple);
    return `translate(${x},${y - 70})`;
  }
}
