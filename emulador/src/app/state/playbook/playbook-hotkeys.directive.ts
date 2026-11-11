import { DestroyRef, Directive, HostListener, inject } from '@angular/core';
import { Store } from '@ngrx/store';
import { TradingActions } from '../trading/trading.actions';
import { selectPlaybookLoaded, selectRuleBySlot } from './playbook.selectors';
import { PlaybookRule } from './playbook.models';

/**
 * Slot 1-9 from the physical key (`ev.code`, `Digit1`..`Digit9`): on macOS,
 * Option+digit reports a symbol in `ev.key` ('¡', '™', ...), so `key` alone
 * never matches. `key` is only the fallback when the event carries no `code`
 * (synthetic events). Numpad codes are deliberately out of scope.
 */
function slotFromEvent(ev: KeyboardEvent): number | null {
  if (ev.code) {
    const m = /^Digit([1-9])$/.exec(ev.code);
    return m ? Number(m[1]) : null;
  }
  return ev.key >= '1' && ev.key <= '9' && ev.key.length === 1 ? Number(ev.key) : null;
}

@Directive({ selector: '[appPlaybookHotkeys]', standalone: true })
export class PlaybookHotkeysDirective {
  private store = inject(Store);
  private destroyRef = inject(DestroyRef);
  private bySlot: Record<number, PlaybookRule> = {};
  private loaded = false;

  private subBySlot = this.store.select(selectRuleBySlot).subscribe((m) => (this.bySlot = m));
  private subLoaded = this.store.select(selectPlaybookLoaded).subscribe((l) => (this.loaded = l));

  constructor() {
    this.destroyRef.onDestroy(() => {
      this.subBySlot.unsubscribe();
      this.subLoaded.unsubscribe();
    });
  }

  @HostListener('document:keydown', ['$event'])
  onKeydown(ev: KeyboardEvent): void {
    if (!this.loaded || ev.repeat || ev.ctrlKey || ev.metaKey || ev.shiftKey || !ev.altKey) return;
    const slot = slotFromEvent(ev);
    if (slot === null) return;
    const t = ev.target;
    if (
      t instanceof HTMLElement &&
      (t.closest('input, textarea, select, [contenteditable]') ||
        document.querySelector('[role="dialog"]'))
    )
      return;
    const rule = this.bySlot[slot];
    if (!rule) return;
    ev.preventDefault();
    this.store.dispatch(TradingActions.tagTrade({ ruleId: rule.id }));
  }
}
