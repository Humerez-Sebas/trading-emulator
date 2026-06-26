import { Directive, ElementRef, OnDestroy, inject, input } from '@angular/core';

type TooltipPos = 'top' | 'bottom' | 'left' | 'right';

/**
 * Lightweight themed tooltip for icon-only controls (replaces native `title=`,
 * which is delayed, unstyled and invisible on touch). Appends a positioned
 * element to `document.body` on hover/focus after a short delay; dismisses on
 * leave/blur/Esc. Styles: `.ui-tooltip` in `styles/ui-primitives.css`.
 */
@Directive({
  selector: '[appTooltip]',
  standalone: true,
  host: {
    '(mouseenter)': 'show()',
    '(mouseleave)': 'hide()',
    '(focusin)': 'show()',
    '(focusout)': 'hide()',
    '(keydown.escape)': 'hide()',
    '(click)': 'hide()',
  },
})
export class TooltipDirective implements OnDestroy {
  /** Tooltip text (empty disables it). */
  appTooltip = input('');
  /**
   * Optional keyboard shortcut shown as elegant <kbd> chips after the label,
   * e.g. "Alt+T" → "Alt" "T". Tokens are split on "+".
   */
  tooltipShortcut = input('');
  tooltipPosition = input<TooltipPos>('top');
  tooltipDelay = input(400);

  private host = inject<ElementRef<HTMLElement>>(ElementRef);
  private tip: HTMLElement | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;

  show(): void {
    const text = this.appTooltip().trim();
    if (!text || this.tip) return;
    this.timer = setTimeout(() => this.render(text), this.tooltipDelay());
  }

  hide(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.tip?.remove();
    this.tip = null;
  }

  ngOnDestroy(): void {
    this.hide();
  }

  private render(text: string): void {
    const tip = document.createElement('div');
    tip.className = 'ui-tooltip';
    tip.setAttribute('role', 'tooltip');

    const shortcut = this.tooltipShortcut().trim();
    if (shortcut) {
      tip.classList.add('ui-tooltip--with-kbd');
      const label = document.createElement('span');
      label.textContent = text;
      tip.appendChild(label);
      const keys = document.createElement('span');
      keys.className = 'ui-kbd-group';
      for (const key of shortcut
        .split('+')
        .map((k) => k.trim())
        .filter(Boolean)) {
        const kbd = document.createElement('kbd');
        kbd.className = 'ui-kbd';
        kbd.textContent = key;
        keys.appendChild(kbd);
      }
      tip.appendChild(keys);
    } else {
      tip.textContent = text;
    }

    document.body.appendChild(tip);
    this.tip = tip;

    const r = this.host.nativeElement.getBoundingClientRect();
    const t = tip.getBoundingClientRect();
    const gap = 6;
    let top: number;
    let left: number;
    switch (this.tooltipPosition()) {
      case 'bottom':
        top = r.bottom + gap;
        left = r.left + r.width / 2 - t.width / 2;
        break;
      case 'left':
        top = r.top + r.height / 2 - t.height / 2;
        left = r.left - t.width - gap;
        break;
      case 'right':
        top = r.top + r.height / 2 - t.height / 2;
        left = r.right + gap;
        break;
      default:
        top = r.top - t.height - gap;
        left = r.left + r.width / 2 - t.width / 2;
    }
    // clamp into the viewport
    const pad = 4;
    left = Math.max(pad, Math.min(left, window.innerWidth - t.width - pad));
    top = Math.max(pad, Math.min(top, window.innerHeight - t.height - pad));
    tip.style.top = `${Math.round(top)}px`;
    tip.style.left = `${Math.round(left)}px`;
    tip.classList.add('is-visible');
  }
}
