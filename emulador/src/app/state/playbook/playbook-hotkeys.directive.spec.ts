import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideMockStore, MockStore } from '@ngrx/store/testing';
import { PlaybookHotkeysDirective } from './playbook-hotkeys.directive';
import { selectPlaybookLoaded, selectRuleBySlot } from './playbook.selectors';
import { TradingActions } from '../trading/trading.actions';

@Component({
  template: `<input id="txt" />
    <div appPlaybookHotkeys id="host"></div>`,
  standalone: true,
  imports: [PlaybookHotkeysDirective],
})
class TestHostComponent {}

describe('PlaybookHotkeysDirective', () => {
  let store: MockStore;

  const rule3 = {
    id: 'r3',
    title: 'Rule 3',
    statement: '',
    createdAt: 0,
    status: 'active' as const,
    shortcutSlot: 3,
    sortOrder: 0,
    amendments: [],
  };
  const rule5 = {
    id: 'r5',
    title: 'Rule 5',
    statement: '',
    createdAt: 0,
    status: 'active' as const,
    shortcutSlot: 5,
    sortOrder: 1,
    amendments: [],
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [TestHostComponent],
      providers: [provideMockStore()],
    });
    store = TestBed.inject(MockStore);
    store.overrideSelector(selectPlaybookLoaded, true);
    store.overrideSelector(selectRuleBySlot, { 3: rule3, 5: rule5 });
    store.refreshState();
    TestBed.createComponent(TestHostComponent).detectChanges();
  });

  afterEach(() => store.resetSelectors());

  function fire(ev: KeyboardEvent): void {
    document.dispatchEvent(ev);
  }

  it('Alt+3 with rule in slot 3 dispatches tagTrade', () => {
    const spy = vi.spyOn(store, 'dispatch');
    fire(new KeyboardEvent('keydown', { key: '3', altKey: true, bubbles: true }));
    expect(spy).toHaveBeenCalledWith(TradingActions.tagTrade({ ruleId: 'r3' }));
  });

  it('Alt+5 with rule in slot 5 dispatches tagTrade', () => {
    const spy = vi.spyOn(store, 'dispatch');
    fire(new KeyboardEvent('keydown', { key: '5', altKey: true, bubbles: true }));
    expect(spy).toHaveBeenCalledWith(TradingActions.tagTrade({ ruleId: 'r5' }));
  });

  it('Alt+1 with empty slot does NOT dispatch', () => {
    const spy = vi.spyOn(store, 'dispatch');
    fire(new KeyboardEvent('keydown', { key: '1', altKey: true, bubbles: true }));
    expect(spy).not.toHaveBeenCalled();
  });

  it('any Alt+digit with loaded=false does NOT dispatch', () => {
    store.overrideSelector(selectPlaybookLoaded, false);
    store.refreshState();
    const spy = vi.spyOn(store, 'dispatch');
    fire(new KeyboardEvent('keydown', { key: '3', altKey: true, bubbles: true }));
    expect(spy).not.toHaveBeenCalled();
  });

  it('ctrlKey held does NOT dispatch', () => {
    const spy = vi.spyOn(store, 'dispatch');
    fire(new KeyboardEvent('keydown', { key: '3', altKey: true, ctrlKey: true, bubbles: true }));
    expect(spy).not.toHaveBeenCalled();
  });

  it('metaKey held does NOT dispatch', () => {
    const spy = vi.spyOn(store, 'dispatch');
    fire(new KeyboardEvent('keydown', { key: '3', altKey: true, metaKey: true, bubbles: true }));
    expect(spy).not.toHaveBeenCalled();
  });

  it('event.repeat does NOT dispatch', () => {
    const spy = vi.spyOn(store, 'dispatch');
    fire(new KeyboardEvent('keydown', { key: '3', altKey: true, repeat: true, bubbles: true }));
    expect(spy).not.toHaveBeenCalled();
  });

  it('focus inside an <input> does NOT dispatch', () => {
    const spy = vi.spyOn(store, 'dispatch');
    const input = document.querySelector('#txt') as HTMLInputElement;
    const ev = new KeyboardEvent('keydown', { key: '3', altKey: true, bubbles: true });
    Object.defineProperty(ev, 'target', { value: input });
    fire(ev);
    expect(spy).not.toHaveBeenCalled();
  });

  it('non-digit key "a" does NOT dispatch', () => {
    const spy = vi.spyOn(store, 'dispatch');
    fire(new KeyboardEvent('keydown', { key: 'a', altKey: true, bubbles: true }));
    expect(spy).not.toHaveBeenCalled();
  });

  it('bare "3" (NO alt) does NOT dispatch (D15.G)', () => {
    const spy = vi.spyOn(store, 'dispatch');
    fire(new KeyboardEvent('keydown', { key: '3', altKey: false, bubbles: true }));
    expect(spy).not.toHaveBeenCalled();
  });
});
