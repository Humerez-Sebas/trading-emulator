import { Component, ElementRef, inject, input, signal } from '@angular/core';
import { IconButtonDirective } from './icon-button.directive';

/**
 * Overflow / kebab menu: an icon-button trigger + a popover that projects the
 * menu items. Closes on outside-click, Esc, or after an item is clicked.
 * Project `<button class="ui-menu-item">` rows (styles in ui-primitives.css);
 * use `[trigger]` to override the default kebab icon.
 */
@Component({
  selector: 'ui-menu',
  standalone: true,
  imports: [IconButtonDirective],
  host: {
    class: 'ui-menu-root',
    '(click)': 'onHostClick($event)',
    '(document:click)': 'onDocClick($event)',
    '(document:keydown.escape)': 'close()',
  },
  template: `
    <button
      appIconButton
      [borderless]="borderless()"
      [size]="size()"
      type="button"
      aria-haspopup="menu"
      [attr.aria-expanded]="open()"
      [attr.aria-label]="ariaLabel()"
      (click)="toggle($event)"
    >
      <svg
        viewBox="0 0 24 24"
        width="18"
        height="18"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        aria-hidden="true"
      >
        <circle cx="12" cy="5" r="1.4" />
        <circle cx="12" cy="12" r="1.4" />
        <circle cx="12" cy="19" r="1.4" />
      </svg>
    </button>
    @if (open()) {
      <div class="menu" [class.menu--start]="align() === 'start'" role="menu">
        <ng-content />
      </div>
    }
  `,
  styles: [
    `
      :host {
        position: relative;
        display: inline-flex;
      }
      .menu {
        position: absolute;
        top: calc(100% + 4px);
        right: 0;
        z-index: 90;
        min-width: 180px;
        max-height: 320px;
        overflow: auto;
        padding: var(--space-1);
        background: var(--surface-3);
        border: 1px solid var(--border);
        border-radius: var(--radius-md);
        box-shadow: var(--elevation-2);
        animation: menu-in var(--duration-fast) var(--ease-out);
      }
      .menu--start {
        right: auto;
        left: 0;
      }
      @keyframes menu-in {
        from {
          opacity: 0;
          transform: translateY(-4px);
        }
      }
    `,
  ],
})
export class MenuComponent {
  ariaLabel = input('Más acciones');
  align = input<'start' | 'end'>('end');
  borderless = input(true);
  size = input<'sm' | 'md' | 'lg'>('md');

  open = signal(false);
  private host = inject<ElementRef<HTMLElement>>(ElementRef);

  toggle(event: Event): void {
    event.stopPropagation();
    this.open.update((v) => !v);
  }

  close(): void {
    this.open.set(false);
  }

  /** A click on a projected menu item (inside `.menu`) closes the menu. */
  onHostClick(event: MouseEvent): void {
    if (this.open() && (event.target as HTMLElement).closest('.menu')) this.close();
  }

  onDocClick(event: MouseEvent): void {
    if (this.open() && !this.host.nativeElement.contains(event.target as Node)) this.close();
  }
}
