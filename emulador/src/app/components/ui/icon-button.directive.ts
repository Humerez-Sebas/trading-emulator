import { Directive, input } from '@angular/core';

export type IconButtonSize = 'sm' | 'md' | 'lg';

/**
 * Square icon-only button (28px default). Used for toolbar/menu/affordance
 * actions. Styles: `.ui-icon-btn` in `styles/ui-primitives.css`.
 */
@Directive({
  selector: '[appIconButton]',
  standalone: true,
  host: {
    class: 'ui-icon-btn',
    '[class.ui-icon-btn--sm]': "size() === 'sm'",
    '[class.ui-icon-btn--lg]': "size() === 'lg'",
    '[class.ui-icon-btn--ghost]': 'borderless()',
    '[class.ui-icon-btn--danger]': 'danger()',
    '[class.ui-icon-btn--muted]': 'muted()',
  },
})
export class IconButtonDirective {
  size = input<IconButtonSize>('md');
  /** No border (toolbars, menus). */
  borderless = input(false);
  danger = input(false);
  /** Dimmed (e.g. a hidden/disabled-looking toggle that's still clickable). */
  muted = input(false);
}
