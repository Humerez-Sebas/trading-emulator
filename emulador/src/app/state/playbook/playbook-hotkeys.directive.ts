import { DestroyRef, Directive, HostListener, inject } from '@angular/core';
import { Store } from '@ngrx/store';
import { TradingActions } from '../trading/trading.actions';
import { selectPlaybookLoaded, selectRuleBySlot } from './playbook.selectors';
import { PlaybookRule } from './playbook.models';

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
    if (!this.loaded || ev.repeat || ev.ctrlKey || ev.metaKey || !ev.altKey) return;
    if (ev.key < '1' || ev.key > '9') return;
    const t = ev.target;
    if (
      t instanceof HTMLElement &&
      (t.closest('input, textarea, select, [contenteditable]') ||
        document.querySelector('dialog[open]'))
    )
      return;
    const rule = this.bySlot[Number(ev.key)];
    if (!rule) return;
    ev.preventDefault();
    this.store.dispatch(TradingActions.tagTrade({ ruleId: rule.id }));
  }
}
