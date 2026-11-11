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

  it('Alt+Shift+digit does not tag', () => {
    const spy = vi.spyOn(store, 'dispatch');
    fire(
      new KeyboardEvent('keydown', {
        code: 'Digit3',
        key: '#',
        altKey: true,
        shiftKey: true,
        bubbles: true,
      }),
    );
    expect(spy).not.toHaveBeenCalled();
  });

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

  it('macOS-shaped Alt+1 (code Digit1, key "¡") dispatches tagTrade', () => {
    store.overrideSelector(selectRuleBySlot, {
      1: { ...rule3, id: 'r1', shortcutSlot: 1 },
      3: rule3,
    });
    store.refreshState();
    const spy = vi.spyOn(store, 'dispatch');
    fire(new KeyboardEvent('keydown', { code: 'Digit1', key: '¡', altKey: true, bubbles: true }));
    expect(spy).toHaveBeenCalledWith(TradingActions.tagTrade({ ruleId: 'r1' }));
  });

  it('Windows-shaped Alt+3 (code Digit3, key "3") dispatches tagTrade', () => {
    const spy = vi.spyOn(store, 'dispatch');
    fire(new KeyboardEvent('keydown', { code: 'Digit3', key: '3', altKey: true, bubbles: true }));
    expect(spy).toHaveBeenCalledWith(TradingActions.tagTrade({ ruleId: 'r3' }));
  });

  it('a non-digit code does NOT dispatch even when key is a digit', () => {
    const spy = vi.spyOn(store, 'dispatch');
    fire(new KeyboardEvent('keydown', { code: 'KeyA', key: '3', altKey: true, bubbles: true }));
    expect(spy).not.toHaveBeenCalled();
  });

  it('an open role="dialog" element suppresses the hotkey', () => {
    const dlg = document.createElement('div');
    dlg.setAttribute('role', 'dialog');
    document.body.appendChild(dlg);
    try {
      const spy = vi.spyOn(store, 'dispatch');
      const host = document.querySelector('#host') as HTMLElement;
      const ev = new KeyboardEvent('keydown', {
        code: 'Digit3',
        key: '3',
        altKey: true,
        bubbles: true,
      });
      Object.defineProperty(ev, 'target', { value: host });
      fire(ev);
      expect(spy).not.toHaveBeenCalled();
    } finally {
      dlg.remove();
    }
  });
});
