import { Component, ChangeDetectionStrategy, input, output, computed } from '@angular/core';

@Component({
  selector: 'app-custom-opacity-slider',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="slider-container">
      <div class="track-bg"></div>
      <div class="track-active" [style.width.%]="percent()"></div>
      <div class="thumb" [style.left.%]="percent()"></div>
      <input
        type="range"
        [min]="min()"
        [max]="max()"
        [step]="step()"
        [value]="value()"
        (input)="onInput($event)"
        class="native-slider"
      />
    </div>
  `,
  styles: `
    :host {
      display: block;
      width: 100%;
    }
    .slider-container {
      position: relative;
      width: 100%;
      height: 24px;
      display: flex;
      align-items: center;
      cursor: pointer;
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
    .thumb {
      position: absolute;
      width: 10px;
      height: 10px;
      margin-left: -5px;
      border-radius: 50%;
      background-color: var(--accent, #2962ff);
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
      pointer-events: none;
      transition:
        transform 0.1s ease-out,
        background-color 0.1s ease-out;
    }
    .slider-container:hover .thumb {
      background-color: #3d72ff;
      transform: scale(1.1);
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
  `,
})
export class CustomOpacitySliderComponent {
  value = input.required<number>();
  min = input<number>(0);
  max = input<number>(100);
  step = input<number>(1);
  valueChange = output<number>();

  percent = computed(() => {
    const val = this.value();
    const mn = this.min();
    const mx = this.max();
    if (mx === mn) return 0;
    return ((val - mn) / (mx - mn)) * 100;
  });

  onInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.valueChange.emit(parseFloat(target.value));
  }
}
