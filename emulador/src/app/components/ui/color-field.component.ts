import { Component, input, output } from '@angular/core';

/**
 * Themed color swatch + hex label that opens the OS color picker (a native
 * `<input type="color">` kept for its picker, but visually replaced by a
 * styled swatch so it fits the dark theme).
 */
@Component({
  selector: 'ui-color-field',
  standalone: true,
  template: `
    <label class="cf">
      <span class="cf-swatch" [style.background]="value()" aria-hidden="true"></span>
      <span class="cf-hex">{{ value().toUpperCase() }}</span>
      <input
        type="color"
        class="cf-native"
        [value]="value()"
        (input)="onInput($event)"
        [attr.aria-label]="ariaLabel() || null"
      />
    </label>
  `,
  styles: [
    `
      .cf {
        position: relative;
        display: inline-flex;
        align-items: center;
        gap: var(--space-2);
        padding: var(--space-1) var(--space-2);
        background: var(--surface-2);
        border: 1px solid var(--border);
        border-radius: var(--radius-sm);
        cursor: pointer;
        transition: border-color var(--duration-fast) var(--ease-out);
      }
      .cf:hover {
        border-color: var(--border-strong);
      }
      .cf:focus-within {
        border-color: var(--accent);
        box-shadow: var(--ring);
      }
      .cf-swatch {
        width: 18px;
        height: 18px;
        flex-shrink: 0;
        border-radius: var(--radius-xs);
        border: 1px solid var(--border-strong);
      }
      .cf-hex {
        font-size: var(--text-xs);
        font-variant-numeric: tabular-nums;
        color: var(--text-muted);
      }
      /* native picker stays interactive but invisible (its swatch is replaced) */
      .cf-native {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        opacity: 0;
        cursor: pointer;
      }
    `,
  ],
})
export class ColorFieldComponent {
  value = input('#000000');
  ariaLabel = input('');
  valueChange = output<string>();

  onInput(event: Event): void {
    this.valueChange.emit((event.target as HTMLInputElement).value);
  }
}
