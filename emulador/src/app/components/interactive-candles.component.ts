import { Component, ChangeDetectionStrategy, input, output, signal } from '@angular/core';

export interface ColorPartEditEvent {
  key: string;
  label: string;
  element: SVGElement;
  event: MouseEvent;
}

@Component({
  selector: 'app-interactive-candles',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="interactive-canvas">
      <svg viewBox="0 0 200 140" width="100%" height="100%" class="svg-canvas">
        <defs>
          <filter id="glow-up" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="2.5" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
          <filter id="glow-down" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="2.5" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

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
          [attr.stroke]="hoveredPart() === 'wickUp' ? '#4dffd2' : wickUp()"
          [attr.stroke-width]="hoveredPart() === 'wickUp' ? 4 : 2"
          [attr.filter]="hoveredPart() === 'wickUp' ? 'url(#glow-up)' : null"
          class="interactive-element wick"
          (mouseenter)="setHover('wickUp')"
          (mouseleave)="setHover(null)"
          (click)="onPartClick('wickUp', 'Mecha Alcista', $event)"
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
          [style.filter]="
            hoveredPart() === 'upColor'
              ? 'brightness(1.15) drop-shadow(0 0 6px ' + upColor() + ')'
              : null
          "
          class="interactive-element body"
          (mouseenter)="setHover('upColor')"
          (mouseleave)="setHover(null)"
          (click)="onPartClick('upColor', 'Cuerpo Alcista', $event)"
        />

        <!-- Left Border Hotspot -->
        <rect
          x="41.5"
          y="52"
          width="8"
          height="45"
          fill="transparent"
          class="interactive-element border-hotspot"
          (mouseenter)="setHover('borderUpColor')"
          (mouseleave)="setHover(null)"
          (click)="onPartClick('borderUpColor', 'Borde Alcista', $event)"
        />

        <!-- Right Border Hotspot -->
        <rect
          x="70.5"
          y="52"
          width="8"
          height="45"
          fill="transparent"
          class="interactive-element border-hotspot"
          (mouseenter)="setHover('borderUpColor')"
          (mouseleave)="setHover(null)"
          (click)="onPartClick('borderUpColor', 'Borde Alcista', $event)"
        />

        <!-- ==================== BEARISH CANDLE ==================== -->
        <!-- Wick Down -->
        <line
          x1="140"
          y1="36"
          x2="140"
          y2="120"
          [attr.stroke]="hoveredPart() === 'wickDown' ? '#ff8a88' : wickDown()"
          [attr.stroke-width]="hoveredPart() === 'wickDown' ? 4 : 2"
          [attr.filter]="hoveredPart() === 'wickDown' ? 'url(#glow-down)' : null"
          class="interactive-element wick"
          (mouseenter)="setHover('wickDown')"
          (mouseleave)="setHover(null)"
          (click)="onPartClick('wickDown', 'Mecha Bajista', $event)"
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
          [style.filter]="
            hoveredPart() === 'downColor'
              ? 'brightness(1.15) drop-shadow(0 0 6px ' + downColor() + ')'
              : null
          "
          class="interactive-element body"
          (mouseenter)="setHover('downColor')"
          (mouseleave)="setHover(null)"
          (click)="onPartClick('downColor', 'Cuerpo Bajista', $event)"
        />

        <!-- Left Border Hotspot -->
        <rect
          x="121.5"
          y="52"
          width="8"
          height="45"
          fill="transparent"
          class="interactive-element border-hotspot"
          (mouseenter)="setHover('borderDownColor')"
          (mouseleave)="setHover(null)"
          (click)="onPartClick('borderDownColor', 'Borde Bajista', $event)"
        />

        <!-- Right Border Hotspot -->
        <rect
          x="150.5"
          y="52"
          width="8"
          height="45"
          fill="transparent"
          class="interactive-element border-hotspot"
          (mouseenter)="setHover('borderDownColor')"
          (mouseleave)="setHover(null)"
          (click)="onPartClick('borderDownColor', 'Borde Bajista', $event)"
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
      background-color: #121417;
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
    .border-hotspot {
      cursor: pointer;
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

  onPartClick(key: string, label: string, event: MouseEvent): void {
    const element = event.target as SVGElement;
    this.editPart.emit({ key, label, element, event });
  }
}
