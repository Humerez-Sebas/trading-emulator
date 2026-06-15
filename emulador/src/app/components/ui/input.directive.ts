import { Directive, input } from '@angular/core';

/**
 * Themed native input/select/textarea. Styles: `.ui-input` in
 * `styles/ui-primitives.css`. Apply to a native control to get consistent
 * surface/border/focus-ring and disabled affordance.
 */
@Directive({
  selector: 'input[appInput], select[appInput], textarea[appInput]',
  standalone: true,
  host: {
    class: 'ui-input',
    '[class.ui-input--invalid]': 'invalid()',
  },
})
export class InputDirective {
  invalid = input(false);
}
