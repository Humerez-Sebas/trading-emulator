import { Component, ChangeDetectionStrategy, input, output, signal } from '@angular/core';

export interface ColorPartEditEvent {
  key: string;
  label: string;
  element: SVGElement;
  /** Original DOM event — mouse click or Enter/Space keyboard activation. */
  event: Event;
}

@Component({
  selector: 'app-interactive-candles',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="interactive-canvas">
      <svg viewBox="0 0 200 140" width="100%" height="100%" class="svg-canvas">
        <!-- Labels -->
        <text x="60" y="24" class="candle-label">Alcista</text>
        <text x="140" y="24" class="candle-label">Bajista</text>

        <!-- ==================== BULLISH CANDLE ==================== -->
        <!-- Wick Up -->
        <line
          x1="60"
          y1="36"
          x2="60"
          y2="120"
          [attr.stroke]="wickUp()"
          [attr.stroke-width]="hoveredPart() === 'wickUp' ? 4 : 2"
          [style.filter]="hoveredPart() === 'wickUp' ? hoverGlow : null"
          class="interactive-element wick"
          tabindex="0"
          role="button"
          aria-label="Editar Mecha Alcista"
          (mouseenter)="setHover('wickUp')"
          (mouseleave)="setHover(null)"
          (focus)="setHover('wickUp')"
          (blur)="setHover(null)"
          (click)="onPartActivate('wickUp', 'Mecha Alcista', $event)"
          (keydown.enter)="onPartActivate('wickUp', 'Mecha Alcista', $event)"
          (keydown.space)="
            onPartActivate('wickUp', 'Mecha Alcista', $event); $event.preventDefault()
          "
        />

        <!-- Body Up -->
        <rect
          x="46"
          y="52"
          width="28"
          height="45"
          rx="3"
          [attr.fill]="upColor()"
          [attr.stroke]="bodyStrokeColor('up')"
          [attr.stroke-width]="bodyStrokeWidth('up')"
          [style.filter]="hoveredPart() === 'upColor' ? hoverBodyFilter : null"
          class="interactive-element body"
          tabindex="0"
          role="button"
          aria-label="Editar Cuerpo Alcista"
          (mouseenter)="setHover('upColor')"
          (mouseleave)="setHover(null)"
          (focus)="setHover('upColor')"
          (blur)="setHover(null)"
          (click)="onPartActivate('upColor', 'Cuerpo Alcista', $event)"
          (keydown.enter)="onPartActivate('upColor', 'Cuerpo Alcista', $event)"
          (keydown.space)="
            onPartActivate('upColor', 'Cuerpo Alcista', $event); $event.preventDefault()
          "
        />

        <!-- Left Border Hotspot -->
        <rect
          x="41.5"
          y="52"
          width="8"
          height="45"
          fill="transparent"
          class="interactive-element border-hotspot"
          tabindex="0"
          role="button"
          aria-label="Editar Borde Alcista"
          (mouseenter)="setHover('borderUpColor')"
          (mouseleave)="setHover(null)"
          (focus)="setHover('borderUpColor')"
          (blur)="setHover(null)"
          (click)="onPartActivate('borderUpColor', 'Borde Alcista', $event)"
          (keydown.enter)="onPartActivate('borderUpColor', 'Borde Alcista', $event)"
          (keydown.space)="
            onPartActivate('borderUpColor', 'Borde Alcista', $event); $event.preventDefault()
          "
        />

        <!-- Right Border Hotspot -->
        <rect
          x="70.5"
          y="52"
          width="8"
          height="45"
          fill="transparent"
          class="interactive-element border-hotspot"
          tabindex="0"
          role="button"
          aria-label="Editar Borde Alcista"
          (mouseenter)="setHover('borderUpColor')"
          (mouseleave)="setHover(null)"
          (focus)="setHover('borderUpColor')"
          (blur)="setHover(null)"
          (click)="onPartActivate('borderUpColor', 'Borde Alcista', $event)"
          (keydown.enter)="onPartActivate('borderUpColor', 'Borde Alcista', $event)"
          (keydown.space)="
            onPartActivate('borderUpColor', 'Borde Alcista', $event); $event.preventDefault()
          "
        />

        <!-- ==================== BEARISH CANDLE ==================== -->
        <!-- Wick Down -->
        <line
          x1="140"
          y1="36"
          x2="140"
          y2="120"
          [attr.stroke]="wickDown()"
          [attr.stroke-width]="hoveredPart() === 'wickDown' ? 4 : 2"
          [style.filter]="hoveredPart() === 'wickDown' ? hoverGlow : null"
          class="interactive-element wick"
          tabindex="0"
          role="button"
          aria-label="Editar Mecha Bajista"
          (mouseenter)="setHover('wickDown')"
          (mouseleave)="setHover(null)"
          (focus)="setHover('wickDown')"
          (blur)="setHover(null)"
          (click)="onPartActivate('wickDown', 'Mecha Bajista', $event)"
          (keydown.enter)="onPartActivate('wickDown', 'Mecha Bajista', $event)"
          (keydown.space)="
            onPartActivate('wickDown', 'Mecha Bajista', $event); $event.preventDefault()
          "
        />

        <!-- Body Down -->
        <rect
          x="126"
          y="52"
          width="28"
          height="45"
          rx="3"
          [attr.fill]="downColor()"
          [attr.stroke]="bodyStrokeColor('down')"
          [attr.stroke-width]="bodyStrokeWidth('down')"
          [style.filter]="hoveredPart() === 'downColor' ? hoverBodyFilter : null"
          class="interactive-element body"
          tabindex="0"
          role="button"
          aria-label="Editar Cuerpo Bajista"
          (mouseenter)="setHover('downColor')"
          (mouseleave)="setHover(null)"
          (focus)="setHover('downColor')"
          (blur)="setHover(null)"
          (click)="onPartActivate('downColor', 'Cuerpo Bajista', $event)"
          (keydown.enter)="onPartActivate('downColor', 'Cuerpo Bajista', $event)"
          (keydown.space)="
            onPartActivate('downColor', 'Cuerpo Bajista', $event); $event.preventDefault()
          "
        />

        <!-- Left Border Hotspot -->
        <rect
          x="121.5"
          y="52"
          width="8"
          height="45"
          fill="transparent"
          class="interactive-element border-hotspot"
          tabindex="0"
          role="button"
          aria-label="Editar Borde Bajista"
          (mouseenter)="setHover('borderDownColor')"
          (mouseleave)="setHover(null)"
          (focus)="setHover('borderDownColor')"
          (blur)="setHover(null)"
          (click)="onPartActivate('borderDownColor', 'Borde Bajista', $event)"
          (keydown.enter)="onPartActivate('borderDownColor', 'Borde Bajista', $event)"
          (keydown.space)="
            onPartActivate('borderDownColor', 'Borde Bajista', $event); $event.preventDefault()
          "
        />

        <!-- Right Border Hotspot -->
        <rect
          x="150.5"
          y="52"
          width="8"
          height="45"
          fill="transparent"
          class="interactive-element border-hotspot"
          tabindex="0"
          role="button"
          aria-label="Editar Borde Bajista"
          (mouseenter)="setHover('borderDownColor')"
          (mouseleave)="setHover(null)"
          (focus)="setHover('borderDownColor')"
          (blur)="setHover(null)"
          (click)="onPartActivate('borderDownColor', 'Borde Bajista', $event)"
          (keydown.enter)="onPartActivate('borderDownColor', 'Borde Bajista', $event)"
          (keydown.space)="
            onPartActivate('borderDownColor', 'Borde Bajista', $event); $event.preventDefault()
          "
        />
      </svg>
    </div>
  `,
  styles: `
    .interactive-canvas {
      width: 100%;
      height: 180px;
      border-radius: 12px;
      border: 1px solid rgba(255, 255, 255, 0.04);
      /* Mid-gray base + faint checker pattern so candles of any chosen color
         (including pure black or pure white) stay visible. Mirrors the
         transparency-grid pattern color pickers use. */
      background-color: #2a2d33;
      background-image:
        linear-gradient(45deg, rgba(255, 255, 255, 0.04) 25%, transparent 25%),
        linear-gradient(-45deg, rgba(255, 255, 255, 0.04) 25%, transparent 25%),
        linear-gradient(45deg, transparent 75%, rgba(255, 255, 255, 0.04) 75%),
        linear-gradient(-45deg, transparent 75%, rgba(255, 255, 255, 0.04) 75%);
      background-size: 12px 12px;
      background-position:
        0 0,
        0 6px,
        6px -6px,
        -6px 0;
      display: flex;
      justify-content: center;
      align-items: center;
      box-shadow: inset 0 1px rgba(255, 255, 255, 0.02);
    }
    .svg-canvas {
      user-select: none;
    }
    .candle-label {
      font-size: 10px;
      fill: #71717a; /* zinc-500 */
      font-weight: 600;
      text-anchor: middle;
    }
    .interactive-element {
      cursor: pointer;
      outline: none;
      transition:
        stroke-width 0.15s ease,
        stroke 0.15s ease,
        filter 0.15s ease;
    }
    /* Keyboard focus ring (SVG supports outline in modern browsers; the
       drop-shadow provides a fallback that's visible against any candle color). */
    .interactive-element:focus-visible {
      outline: 2px solid #2962ff;
      outline-offset: 2px;
      filter: drop-shadow(0 0 4px #2962ff);
    }
    .border-hotspot {
      cursor: pointer;
    }
    /* Make the transparent border hotspots visible when focused so keyboard
       users can see which border they're about to edit. */
    .border-hotspot:focus-visible {
      fill: rgba(41, 98, 255, 0.15);
    }
  `,
})
export class InteractiveCandlesComponent {
  upColor = input.required<string>();
  downColor = input.required<string>();
  wickUp = input.required<string>();
  wickDown = input.required<string>();
  borderUpColor = input.required<string>();
  borderDownColor = input.required<string>();

  editPart = output<ColorPartEditEvent>();

  hoveredPart = signal<string | null>(null);

  /**
   * Hover-state filters use a neutral white halo + brightness boost so the
   * feedback is visible regardless of the candle color the user picked.
   * Previously the wick swapped to a hardcoded mint/pink (causing a red
   * flash on dark candles) and the body drop-shadow inherited the body
   * color (invisible on black candles). Keeping the user's chosen color
   * and overlaying a neutral glow respects their palette.
   */
  readonly hoverGlow = 'drop-shadow(0 0 5px rgba(255, 255, 255, 0.85))';
  readonly hoverBodyFilter = 'brightness(1.18) drop-shadow(0 0 6px rgba(255, 255, 255, 0.6))';

  setHover(part: string | null): void {
    this.hoveredPart.set(part);
  }

  bodyStrokeColor(type: 'up' | 'down'): string {
    const isUp = type === 'up';
    const hover = this.hoveredPart();

    if (isUp) {
      if (hover === 'borderUpColor') return '#2962FF'; // border hover glow
      if (hover === 'upColor') return '#ffffff'; // body hover border
      return this.borderUpColor();
    } else {
      if (hover === 'borderDownColor') return '#2962FF';
      if (hover === 'downColor') return '#ffffff';
      return this.borderDownColor();
    }
  }

  bodyStrokeWidth(type: 'up' | 'down'): number {
    const isUp = type === 'up';
    const hover = this.hoveredPart();

    if (isUp) {
      if (hover === 'borderUpColor') return 2.5;
      return 1.5;
    } else {
      if (hover === 'borderDownColor') return 2.5;
      return 1.5;
    }
  }

  /**
   * Unified activation handler — fires for mouse clicks AND keyboard
   * Enter/Space. currentTarget is used (not target) so the SVG element
   * passed to the popover is the bound interactive element itself, not a
   * descendant that might have been clicked.
   */
  onPartActivate(key: string, label: string, event: Event): void {
    const element = (event.currentTarget ?? event.target) as SVGElement;
    this.editPart.emit({ key, label, element, event });
  }
}
