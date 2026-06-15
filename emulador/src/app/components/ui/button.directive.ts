import { Directive, input } from '@angular/core';

export type ButtonVariant = 'primary' | 'ghost' | 'subtle' | 'danger' | 'danger-solid';
export type ButtonSize = 'sm' | 'md';

/**
 * Shared button styling, applied to a native `<button>` or `<a>` so anchors
 * (routerLink) and buttons look identical. Replaces the `.primary`/`.ghost`
 * blocks that were copy-pasted across ~6 stylesheets. Styles live in
 * `styles/ui-primitives.css` (`.ui-btn`).
 */
@Directive({
  selector: '[appButton]',
  standalone: true,
  host: {
    class: 'ui-btn',
    '[class.ui-btn--primary]': "variant() === 'primary'",
    '[class.ui-btn--ghost]': "variant() === 'ghost'",
    '[class.ui-btn--subtle]': "variant() === 'subtle'",
    '[class.ui-btn--danger]': "variant() === 'danger'",
    '[class.ui-btn--danger-solid]': "variant() === 'danger-solid'",
    '[class.ui-btn--sm]': "size() === 'sm'",
    '[class.ui-btn--md]': "size() === 'md'",
    '[class.ui-btn--block]': 'block()',
  },
})
export class ButtonDirective {
  variant = input<ButtonVariant>('primary');
  size = input<ButtonSize>('md');
  block = input(false);
}
