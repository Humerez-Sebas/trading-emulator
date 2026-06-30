import { Component, ChangeDetectionStrategy, input, output } from '@angular/core';

@Component({
  selector: 'app-custom-switch',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    role: 'switch',
    '[attr.aria-checked]': 'checked()',
    tabindex: '0',
    '(click)': 'toggle()',
    '(keydown.enter)': 'toggle()',
    '(keydown.space)': 'toggle(); $event.preventDefault()',
  },
  template: `
    <span class="switch-track" [class.checked]="checked()">
      <span class="switch-thumb" [class.checked]="checked()"></span>
    </span>
  `,
  styles: `
    :host {
      display: inline-block;
      cursor: pointer;
      outline: none;
    }
    .switch-track {
      position: relative;
      display: inline-flex;
      height: 18px;
      width: 32px;
      border-radius: 9999px;
      background-color: var(--surface-3, #1f2229);
      transition: background-color 0.2s ease-in-out;
      border: 1px solid rgba(255, 255, 255, 0.05);
    }
    .switch-track.checked {
      background-color: var(--accent, #2962ff);
    }
    .switch-thumb {
      pointer-events: none;
      display: inline-block;
      height: 14px;
      width: 14px;
      border-radius: 9999px;
      background-color: #ffffff;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
      transition: transform 0.2s ease-in-out;
      transform: translate(1px, 1px);
    }
    .switch-thumb.checked {
      transform: translate(15px, 1px);
    }
    :host:focus-visible .switch-track {
      box-shadow: 0 0 0 2px rgba(41, 98, 255, 0.4);
      border-color: var(--accent, #2962ff);
    }
  `,
})
export class CustomSwitchComponent {
  checked = input<boolean>(false);
  checkedChange = output<boolean>();

  toggle() {
    this.checkedChange.emit(!this.checked());
  }
}
