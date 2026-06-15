import { Component, input, output } from '@angular/core';

export interface SegmentedOption {
  value: string;
  label: string;
  /** Optional count badge rendered after the label when > 0. */
  count?: number;
}

/**
 * Segmented control (TradingView-style toggle). De-duplicates the `.seg`/
 * `.seg-btn` blocks that lived separately in mercados and sesiones.
 */
@Component({
  selector: 'ui-segmented',
  standalone: true,
  host: { class: 'ui-seg', role: 'tablist', '[attr.aria-label]': 'ariaLabel() || null' },
  template: `
    @if (label()) {
      <span class="seg-label">{{ label() }}</span>
    }
    @for (opt of options(); track opt.value) {
      <button
        type="button"
        class="seg-btn"
        role="tab"
        [class.active]="opt.value === value()"
        [attr.aria-selected]="opt.value === value()"
        (click)="select(opt.value)"
      >
        {{ opt.label }}
        @if (opt.count) {
          <span class="seg-count">{{ opt.count }}</span>
        }
      </button>
    }
  `,
  styles: [
    `
      :host {
        display: inline-flex;
        align-items: center;
        gap: 2px;
        padding: 3px;
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: var(--radius-sm);
      }
      .seg-label {
        padding: 0 var(--space-2);
        font-size: var(--text-xs);
        color: var(--text-muted);
      }
      .seg-btn {
        padding: var(--space-1) var(--space-3);
        background: none;
        border: none;
        border-radius: var(--radius-xs);
        color: var(--text-muted);
        font: inherit;
        font-size: var(--text-sm);
        font-weight: var(--weight-medium);
        cursor: pointer;
        transition:
          background var(--duration-fast) var(--ease-out),
          color var(--duration-fast) var(--ease-out);
      }
      .seg-btn:hover {
        color: var(--text);
      }
      .seg-btn.active {
        background: var(--surface-2);
        color: var(--text);
      }
      .seg-btn:focus-visible {
        outline: 2px solid var(--accent);
        outline-offset: 2px;
      }
      .seg-count {
        min-width: 18px;
        padding: 0 5px;
        text-align: center;
        background: var(--accent);
        color: var(--on-accent);
        border-radius: var(--radius-pill);
        font-size: var(--text-2xs);
        font-weight: var(--weight-semibold);
      }
    `,
  ],
})
export class SegmentedControlComponent {
  options = input.required<SegmentedOption[]>();
  value = input<string>('');
  label = input('');
  ariaLabel = input('');
  valueChange = output<string>();

  select(value: string): void {
    if (value !== this.value()) this.valueChange.emit(value);
  }
}
