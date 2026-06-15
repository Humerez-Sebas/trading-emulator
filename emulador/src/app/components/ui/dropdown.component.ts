import { Component, ElementRef, computed, inject, input, output, signal, viewChild } from '@angular/core';

export interface DropdownOption {
  value: string;
  label: string;
}

let ddSeq = 0;

/**
 * Accessible single-select dropdown (themed replacement for native `<select>`,
 * whose chrome clashes with the dark theme). Button trigger + listbox popover
 * with full keyboard support (↑/↓/Home/End/Enter/Esc) and `aria-activedescendant`.
 */
@Component({
  selector: 'ui-dropdown',
  standalone: true,
  host: {
    class: 'ui-dd',
    '(document:click)': 'onDocClick($event)',
  },
  template: `
    <button
      #trigger
      type="button"
      class="dd-trigger"
      [class.dd-trigger--block]="block()"
      aria-haspopup="listbox"
      [attr.aria-expanded]="open()"
      [attr.aria-label]="ariaLabel() || null"
      (click)="toggle()"
      (keydown)="onTriggerKey($event)"
    >
      <span class="dd-value" [class.dd-placeholder]="!selectedLabel()">
        {{ selectedLabel() || placeholder() }}
      </span>
      <svg class="dd-caret" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <polyline points="6 9 12 15 18 9" />
      </svg>
    </button>
    @if (open()) {
      <div
        #list
        class="dd-list"
        role="listbox"
        tabindex="-1"
        [attr.aria-activedescendant]="activeId()"
        (keydown)="onListKey($event)"
      >
        @for (opt of options(); track opt.value; let i = $index) {
          <button
            type="button"
            class="dd-option"
            role="option"
            tabindex="-1"
            [id]="optionId(i)"
            [class.active]="i === activeIndex()"
            [attr.aria-selected]="opt.value === value()"
            (click)="select(opt.value)"
            (mouseenter)="activeIndex.set(i)"
          >
            {{ opt.label }}
            @if (opt.value === value()) {
              <svg class="dd-check" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            }
          </button>
        }
      </div>
    }
  `,
  styles: [
    `
      :host {
        position: relative;
        display: inline-flex;
      }
      .dd-trigger {
        display: inline-flex;
        align-items: center;
        gap: var(--space-2);
        min-width: 0;
        padding: var(--space-2) var(--space-2) var(--space-2) var(--space-3);
        background: var(--surface-2);
        border: 1px solid var(--border);
        border-radius: var(--radius-sm);
        color: var(--text);
        font: inherit;
        font-size: var(--text-sm);
        cursor: pointer;
        transition: border-color var(--duration-fast) var(--ease-out);
      }
      .dd-trigger--block {
        width: 100%;
        justify-content: space-between;
      }
      .dd-trigger:hover {
        border-color: var(--border-strong);
      }
      .dd-trigger:focus-visible {
        outline: none;
        border-color: var(--accent);
        box-shadow: var(--ring);
      }
      .dd-value {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .dd-placeholder {
        color: var(--text-muted);
      }
      .dd-caret {
        flex-shrink: 0;
        color: var(--text-muted);
      }
      .dd-list {
        position: absolute;
        top: calc(100% + 4px);
        left: 0;
        z-index: 95;
        margin: 0;
        padding: var(--space-1);
        min-width: 100%;
        max-height: 280px;
        overflow: auto;
        background: var(--surface-3);
        border: 1px solid var(--border);
        border-radius: var(--radius-md);
        box-shadow: var(--elevation-2);
        animation: dd-in var(--duration-fast) var(--ease-out);
      }
      .dd-list:focus {
        outline: none;
      }
      .dd-option {
        display: flex;
        align-items: center;
        gap: var(--space-2);
        width: 100%;
        padding: var(--space-2) var(--space-3);
        background: none;
        border: none;
        border-radius: var(--radius-xs);
        color: var(--text);
        font: inherit;
        font-size: var(--text-sm);
        text-align: left;
        white-space: nowrap;
        cursor: pointer;
      }
      .dd-option.active {
        background: var(--surface-2);
      }
      .dd-option[aria-selected='true'] {
        color: var(--accent);
      }
      .dd-check {
        margin-left: auto;
      }
      @keyframes dd-in {
        from {
          opacity: 0;
          transform: translateY(-4px);
        }
      }
    `,
  ],
})
export class DropdownComponent {
  options = input.required<DropdownOption[]>();
  value = input<string>('');
  placeholder = input('Seleccionar…');
  ariaLabel = input('');
  block = input(false);
  valueChange = output<string>();

  open = signal(false);
  activeIndex = signal(0);
  private readonly id = ddSeq++;

  private hostEl = inject<ElementRef<HTMLElement>>(ElementRef);
  private trigger = viewChild<ElementRef<HTMLButtonElement>>('trigger');
  private list = viewChild<ElementRef<HTMLElement>>('list');

  selectedLabel = computed(() => this.options().find((o) => o.value === this.value())?.label ?? '');
  activeId = computed(() => (this.open() ? this.optionId(this.activeIndex()) : null));

  optionId(i: number): string {
    return `dd-${this.id}-opt-${i}`;
  }

  toggle(): void {
    if (this.open()) this.close();
    else this.openMenu();
  }

  private openMenu(): void {
    const idx = this.options().findIndex((o) => o.value === this.value());
    this.activeIndex.set(idx >= 0 ? idx : 0);
    this.open.set(true);
    queueMicrotask(() => this.list()?.nativeElement.focus());
  }

  close(): void {
    this.open.set(false);
  }

  select(value: string): void {
    if (value !== this.value()) this.valueChange.emit(value);
    this.close();
    this.trigger()?.nativeElement.focus();
  }

  onTriggerKey(event: KeyboardEvent): void {
    if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
      event.preventDefault();
      this.openMenu();
    }
  }

  onListKey(event: KeyboardEvent): void {
    const last = this.options().length - 1;
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.activeIndex.update((i) => Math.min(i + 1, last));
        this.scrollActive();
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.activeIndex.update((i) => Math.max(i - 1, 0));
        this.scrollActive();
        break;
      case 'Home':
        event.preventDefault();
        this.activeIndex.set(0);
        this.scrollActive();
        break;
      case 'End':
        event.preventDefault();
        this.activeIndex.set(last);
        this.scrollActive();
        break;
      case 'Enter':
      case ' ':
        event.preventDefault();
        this.select(this.options()[this.activeIndex()].value);
        break;
      case 'Escape':
        event.preventDefault();
        this.close();
        this.trigger()?.nativeElement.focus();
        break;
      case 'Tab':
        this.close();
        break;
    }
  }

  private scrollActive(): void {
    queueMicrotask(() => {
      const el = this.list()?.nativeElement.querySelector('.dd-option.active');
      el?.scrollIntoView({ block: 'nearest' });
    });
  }

  onDocClick(event: MouseEvent): void {
    if (this.open() && !this.hostEl.nativeElement.contains(event.target as Node)) this.close();
  }
}
