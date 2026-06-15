import { Directive, input } from '@angular/core';

export type BadgeTone = 'accent' | 'neutral' | 'up' | 'down' | 'outline';

/**
 * Pill/chip badge. `chip` makes it a squared tag (e.g. an asset symbol).
 * Styles: `.ui-badge` in `styles/ui-primitives.css`.
 */
@Directive({
  selector: '[appBadge]',
  standalone: true,
  host: {
    class: 'ui-badge',
    '[class.ui-badge--accent]': "tone() === 'accent'",
    '[class.ui-badge--neutral]': "tone() === 'neutral'",
    '[class.ui-badge--up]': "tone() === 'up'",
    '[class.ui-badge--down]': "tone() === 'down'",
    '[class.ui-badge--outline]': "tone() === 'outline'",
    '[class.ui-badge--chip]': 'chip()',
  },
})
export class BadgeDirective {
  tone = input<BadgeTone>('neutral');
  chip = input(false);
}
