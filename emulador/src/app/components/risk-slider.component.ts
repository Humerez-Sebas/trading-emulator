import { Component, ChangeDetectionStrategy, input, output, computed } from '@angular/core';
import { DecimalPipe } from '@angular/common';

@Component({
  selector: 'app-risk-slider',
  standalone: true,
  imports: [DecimalPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="risk-container">
      <!-- Slider Area -->
      <div class="slider-wrappergroup">
        <!-- Background Track -->
        <div class="track-bg"></div>

        <!-- Active Track -->
        <div class="track-active" [style.width.%]="percent()"></div>

        <!-- Anchor Points -->
        <div class="anchor" style="left: 8.16%" title="0.5%"></div>
        <div class="anchor" style="left: 18.36%" title="1.0%"></div>
        <div class="anchor" style="left: 38.77%" title="2.0%"></div>

        <!-- Tooltip -->
        <div class="tooltip" [style.left.%]="percent()">
          <span class="tooltip-pct">{{ value() | number: '1.1-1' }}%</span>
          <span class="tooltip-usd">\${{ riskUsd() | number: '1.2-2' }}</span>
        </div>

        <!-- Thumb -->
        <div class="thumb" [style.left.%]="percent()"></div>

        <!-- Native Input Overlay -->
        <input
          type="range"
          [min]="min"
          [max]="max"
          step="0.1"
          [value]="value()"
          (input)="onSliderInput($event)"
          class="native-slider"
        />
      </div>

      <!-- Numeric Input -->
      <div class="numeric-input-container">
        <input
          type="number"
          step="0.1"
          [min]="min"
          [max]="max"
          [value]="value()"
          (change)="onNumericChange($event)"
          (input)="onNumericInput($event)"
          class="numeric-input"
        />
        <span class="pct-sign">%</span>
      </div>
    </div>
  `,
  styles: `
    :host {
      display: block;
      width: 100%;
    }
    .risk-container {
      display: flex;
      align-items: center;
      gap: 12px;
      width: 100%;
    }
    .slider-wrappergroup {
      position: relative;
      flex: 1;
      height: 24px;
      display: flex;
      align-items: center;
      cursor: pointer;
    }
    .slider-wrappergroup:hover .tooltip {
      opacity: 1;
    }
    .track-bg {
      position: absolute;
      left: 0;
      right: 0;
      height: 1.5px;
      background-color: var(--surface-3, #1f2229);
      border-radius: 9999px;
      pointer-events: none;
    }
    .track-active {
      position: absolute;
      left: 0;
      height: 1.5px;
      background-color: var(--accent, #2962ff);
      border-radius: 9999px;
      pointer-events: none;
    }
    .anchor {
      position: absolute;
      width: 6px;
      height: 6px;
      margin-left: -3px;
      border-radius: 50%;
      background-color: #3f3f46; /* zinc-700 */
      pointer-events: none;
    }
    .tooltip {
      position: absolute;
      top: -32px;
      transform: translateX(-50%);
      background-color: #1f2229;
      border: 1px solid rgba(255, 255, 255, 0.08);
      color: #ffffff;
      font-size: 10px;
      font-weight: 600;
      padding: 2px 8px;
      border-radius: 4px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
      pointer-events: none;
      white-space: nowrap;
      opacity: 0;
      transition: opacity 0.15s ease-in-out;
      display: flex;
      flex-direction: column;
      align-items: center;
      z-index: 30;
    }
    .tooltip-pct {
      line-height: 1.2;
    }
    .tooltip-usd {
      font-size: 8px;
      color: #787b86;
      font-family: var(--font-mono, monospace);
      line-height: 1.2;
    }
    .thumb {
      position: absolute;
      width: 3px;
      height: 12px;
      margin-left: -1.5px;
      background-color: var(--accent, #2962ff);
      border-radius: 9999px;
      pointer-events: none;
      box-shadow: 0 0 4px rgba(41, 98, 255, 0.8);
      transition:
        transform 0.15s ease,
        width 0.15s ease,
        margin-left 0.15s ease;
    }
    .slider-wrappergroup:hover .thumb {
      transform: scaleX(1.5);
    }
    .native-slider {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      opacity: 0;
      cursor: pointer;
      margin: 0;
    }
    .numeric-input-container {
      display: flex;
      align-items: center;
      background-color: var(--surface-2, #121417);
      border: 1px solid rgba(255, 255, 255, 0.06);
      border-radius: var(--radius-md, 8px);
      padding: 6px 10px;
      width: 72px;
      transition: border-color 0.15s ease;
    }
    .numeric-input-container:focus-within {
      border-color: rgba(41, 98, 255, 0.5);
    }
    .numeric-input {
      width: 100%;
      background: transparent;
      border: none;
      color: #e4e4e7;
      font-size: 12px;
      text-align: right;
      font-family: var(--font-mono, monospace);
      outline: none;
      margin: 0;
      padding: 0;
      -moz-appearance: textfield;
    }
    .numeric-input::-webkit-inner-spin-button,
    .numeric-input::-webkit-outer-spin-button {
      -webkit-appearance: none;
      margin: 0;
    }
    .pct-sign {
      font-size: 10px;
      color: #787b86;
      margin-left: 2px;
      user-select: none;
    }
  `,
})
export class RiskSliderComponent {
  balance = input.required<number>();
  value = input.required<number>();
  valueChange = output<number>();

  readonly min = 0.1;
  readonly max = 5.0;

  percent = computed(() => {
    const val = Math.max(this.min, Math.min(this.max, this.value()));
    return ((val - this.min) / (this.max - this.min)) * 100;
  });

  riskUsd = computed(() => {
    return this.value() * this.balance() * 0.01;
  });

  onSliderInput(event: Event): void {
    const val = parseFloat((event.target as HTMLInputElement).value);
    this.valueChange.emit(val);
  }

  onNumericInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    const val = parseFloat(target.value);
    if (!isNaN(val)) {
      const clamped = Math.max(0, Math.min(this.max, val));
      this.valueChange.emit(clamped);
    }
  }

  onNumericChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    let val = parseFloat(target.value);
    if (isNaN(val)) {
      val = this.min;
    }
    const clamped = Math.max(this.min, Math.min(this.max, val));
    this.valueChange.emit(clamped);
  }
}
