import {
  Component,
  ChangeDetectionStrategy,
  input,
  output,
  computed,
  linkedSignal,
} from '@angular/core';

// Helper functions for color conversions
function hsvToHex(h: number, s: number, v: number): string {
  s = s / 100;
  v = v / 100;
  const i = Math.floor((h / 60) % 6);
  const f = h / 60 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  let r = 0,
    g = 0,
    b = 0;
  switch (i) {
    case 0:
      r = v;
      g = t;
      b = p;
      break;
    case 1:
      r = q;
      g = v;
      b = p;
      break;
    case 2:
      r = p;
      g = v;
      b = t;
      break;
    case 3:
      r = p;
      g = q;
      b = v;
      break;
    case 4:
      r = t;
      g = p;
      b = v;
      break;
    case 5:
      r = v;
      g = p;
      b = q;
      break;
  }
  const toHex = (x: number) => {
    const hex = Math.round(x * 255).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  };
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

function hexToHsv(hex: string): { h: number; s: number; v: number } {
  hex = hex.replace('#', '');
  if (hex.length === 3) {
    hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
  }
  const r = parseInt(hex.substring(0, 2), 16) / 255 || 0;
  const g = parseInt(hex.substring(2, 4), 16) / 255 || 0;
  const b = parseInt(hex.substring(4, 6), 16) / 255 || 0;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  const v = max;

  const d = max - min;
  const s = max === 0 ? 0 : d / max;

  if (max !== min) {
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h /= 6;
  }
  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    v: Math.round(v * 100),
  };
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  hex = hex.replace('#', '');
  if (hex.length === 3) {
    hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
  }
  const r = parseInt(hex.substring(0, 2), 16) || 0;
  const g = parseInt(hex.substring(2, 4), 16) || 0;
  const b = parseInt(hex.substring(4, 6), 16) || 0;
  return { r, g, b };
}

function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (x: number) => {
    const hex = Math.max(0, Math.min(255, x)).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  };
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

@Component({
  selector: 'app-custom-color-picker',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="color-picker-container">
      <!-- 1. Sat/Val Canvas -->
      <div
        (mousedown)="handleCanvasMouseDown($event)"
        class="canvas-area"
        [style.background-color]="canvasBgColor()"
      >
        <div class="canvas-white-grad"></div>
        <div class="canvas-black-grad"></div>
        <div class="canvas-pointer" [style.left.%]="hsv().s" [style.top.%]="100 - hsv().v"></div>
      </div>

      <!-- 2. Hue Slider -->
      <div (mousedown)="handleHueMouseDown($event)" class="hue-slider">
        <div class="hue-pointer" [style.left.%]="(hsv().h / 360) * 100"></div>
      </div>

      <!-- 3. Text inputs (HEX & RGB) -->
      <div class="inputs-section">
        <!-- Hex input -->
        <div class="hex-row">
          <span class="label-mono">HEX</span>
          <input
            type="text"
            [value]="color()"
            (input)="handleHexChange($event)"
            class="hex-input"
          />
        </div>

        <!-- RGB inputs -->
        <div class="rgb-grid">
          <div class="rgb-col">
            <span class="label-mono">R</span>
            <input
              type="number"
              [value]="rgb().r"
              (input)="handleRgbChange('r', $event)"
              class="rgb-input"
            />
          </div>
          <div class="rgb-col">
            <span class="label-mono">G</span>
            <input
              type="number"
              [value]="rgb().g"
              (input)="handleRgbChange('g', $event)"
              class="rgb-input"
            />
          </div>
          <div class="rgb-col">
            <span class="label-mono">B</span>
            <input
              type="number"
              [value]="rgb().b"
              (input)="handleRgbChange('b', $event)"
              class="rgb-input"
            />
          </div>
        </div>
      </div>
    </div>
  `,
  styles: `
    .color-picker-container {
      display: flex;
      flex-direction: column;
      gap: 12px;
      width: 100%;
      box-sizing: border-box;
    }
    .canvas-area {
      width: 100%;
      height: 96px;
      border-radius: 8px;
      position: relative;
      overflow: hidden;
      cursor: crosshair;
      border: 1px solid rgba(255, 255, 255, 0.05);
    }
    .canvas-white-grad {
      position: absolute;
      inset: 0;
      background: linear-gradient(to right, #ffffff, transparent);
    }
    .canvas-black-grad {
      position: absolute;
      inset: 0;
      background: linear-gradient(to top, #000000, transparent);
    }
    .canvas-pointer {
      position: absolute;
      width: 10px;
      height: 10px;
      border-radius: 50%;
      border: 1.5px solid #ffffff;
      box-shadow: 0 0 3px rgba(0, 0, 0, 0.8);
      pointer-events: none;
      transform: translate(-5px, -5px);
    }
    .hue-slider {
      width: 100%;
      height: 7px;
      border-radius: 9999px;
      position: relative;
      cursor: pointer;
      background: linear-gradient(
        to right,
        #ff0000 0%,
        #ffff00 17%,
        #00ff00 33%,
        #00ffff 50%,
        #0000ff 67%,
        #ff00ff 83%,
        #ff0000 100%
      );
    }
    .hue-pointer {
      position: absolute;
      width: 3px;
      height: 11px;
      background-color: #ffffff;
      border-radius: 2px;
      box-shadow: 0 0 2px rgba(0, 0, 0, 0.8);
      pointer-events: none;
      top: 50%;
      transform: translate(-1.5px, -50%);
    }
    .inputs-section {
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding-top: 8px;
      border-top: 1px solid rgba(255, 255, 255, 0.04);
    }
    .hex-row {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .label-mono {
      font-size: 10px;
      color: #71717a; /* zinc-500 */
      font-family: var(--font-mono, monospace);
      width: 24px;
      user-select: none;
    }
    .hex-input {
      flex: 1;
      background-color: #121417;
      border: 1px solid rgba(255, 255, 255, 0.06);
      border-radius: 4px;
      padding: 4px 6px;
      font-size: 11px;
      color: #d4d4d8;
      font-family: var(--font-mono, monospace);
      text-transform: uppercase;
      text-align: center;
      outline: none;
    }
    .hex-input:focus {
      border-color: rgba(41, 98, 255, 0.5);
    }
    .rgb-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 6px;
    }
    .rgb-col {
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .rgb-col .label-mono {
      width: auto;
      font-size: 9px;
      color: #52525b; /* zinc-600 */
    }
    .rgb-input {
      width: 100%;
      background-color: #121417;
      border: 1px solid rgba(255, 255, 255, 0.06);
      border-radius: 4px;
      padding: 2px 4px;
      font-size: 10px;
      color: #d4d4d8;
      font-family: var(--font-mono, monospace);
      text-align: center;
      outline: none;
      -moz-appearance: textfield;
    }
    .rgb-input::-webkit-inner-spin-button,
    .rgb-input::-webkit-outer-spin-button {
      -webkit-appearance: none;
      margin: 0;
    }
    .rgb-input:focus {
      border-color: rgba(41, 98, 255, 0.5);
    }
  `,
})
export class CustomColorPickerComponent {
  color = input.required<string>();
  colorChange = output<string>();

  hsv = linkedSignal(() => hexToHsv(this.color()));
  rgb = computed(() => hexToRgb(this.color()));

  canvasBgColor = computed(() => `hsl(${this.hsv().h}, 100%, 50%)`);

  handleCanvasMouseDown(e: MouseEvent): void {
    const el = e.currentTarget as HTMLElement;
    const rect = el.getBoundingClientRect();

    const updateColor = (clientX: number, clientY: number) => {
      const x = Math.max(0, Math.min(rect.width, clientX - rect.left));
      const y = Math.max(0, Math.min(rect.height, clientY - rect.top));
      const s = Math.round((x / rect.width) * 100);
      const v = Math.round((1 - y / rect.height) * 100);

      this.hsv.update((prev) => ({ ...prev, s, v }));
      const hex = hsvToHex(this.hsv().h, s, v);
      this.colorChange.emit(hex);
    };

    updateColor(e.clientX, e.clientY);

    const handleMouseMove = (moveEvent: MouseEvent) => {
      updateColor(moveEvent.clientX, moveEvent.clientY);
    };

    const handleMouseUp = () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  }

  handleHueMouseDown(e: MouseEvent): void {
    const el = e.currentTarget as HTMLElement;
    const rect = el.getBoundingClientRect();

    const updateHue = (clientX: number) => {
      const x = Math.max(0, Math.min(rect.width, clientX - rect.left));
      const h = Math.round((x / rect.width) * 360);

      this.hsv.update((prev) => ({ ...prev, h }));
      const hex = hsvToHex(h, this.hsv().s, this.hsv().v);
      this.colorChange.emit(hex);
    };

    updateHue(e.clientX);

    const handleMouseMove = (moveEvent: MouseEvent) => {
      updateHue(moveEvent.clientX);
    };

    const handleMouseUp = () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  }

  handleHexChange(event: Event): void {
    const inputEl = event.target as HTMLInputElement;
    let val = inputEl.value.toUpperCase();
    if (!val.startsWith('#')) {
      val = '#' + val;
    }
    val = val.substring(0, 7);
    this.colorChange.emit(val);

    if (val.length === 7 && /^#[0-9A-F]{6}$/i.test(val)) {
      this.hsv.set(hexToHsv(val));
    }
  }

  handleRgbChange(channel: 'r' | 'g' | 'b', event: Event): void {
    const inputEl = event.target as HTMLInputElement;
    const val = parseInt(inputEl.value, 10);
    const clamped = Math.max(0, Math.min(255, isNaN(val) ? 0 : val));

    const currentRgb = this.rgb();
    const newRgb = { ...currentRgb, [channel]: clamped };
    const newHex = rgbToHex(newRgb.r, newRgb.g, newRgb.b);

    this.colorChange.emit(newHex);
    this.hsv.set(hexToHsv(newHex));
  }
}
