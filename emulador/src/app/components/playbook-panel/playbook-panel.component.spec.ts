import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideMockStore, MockStore } from '@ngrx/store/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PlaybookPanelComponent } from './playbook-panel.component';
import { selectPlaybookRules } from '../../state/playbook/playbook.selectors';
import { PlaybookActions } from '../../state/playbook/playbook.actions';
import { PlaybookRule } from '../../state/playbook/playbook.models';

function makeRule(overrides: Partial<PlaybookRule> = {}): PlaybookRule {
  return {
    id: 'r1',
    title: 'Regla de prueba',
    statement: 'No operar sin confirmación',
    createdAt: 1000,
    status: 'active',
    shortcutSlot: null,
    sortOrder: 0,
    amendments: [],
    ...overrides,
  };
}

describe('PlaybookPanelComponent', () => {
  let fixture: ComponentFixture<PlaybookPanelComponent>;
  let store: MockStore;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [PlaybookPanelComponent],
      providers: [provideMockStore()],
    });
    store = TestBed.inject(MockStore);
  });

  afterEach(() => {
    store.resetSelectors();
  });

  function create(rules: PlaybookRule[] = []): void {
    store.overrideSelector(selectPlaybookRules, rules);
    fixture = TestBed.createComponent(PlaybookPanelComponent);
    fixture.detectChanges();
  }

  it('renders empty state when no rules exist', () => {
    create([]);
    expect(fixture.nativeElement.querySelector('ui-empty-state')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.rules-list')).toBeNull();
  });

  it('renders active rules with slot badge', () => {
    create([makeRule({ shortcutSlot: 1 })]);
    const badge = fixture.nativeElement.querySelector('.slot-badge');
    expect(badge).not.toBeNull();
    expect(badge.textContent.trim()).toBe('R1');
  });

  it('renders rule title and statement', () => {
    create([makeRule({ title: 'Mi regla', statement: 'Descripción de la regla' })]);
    const title = fixture.nativeElement.querySelector('.rule-title');
    const statement = fixture.nativeElement.querySelector('.rule-statement');
    expect(title.textContent.trim()).toBe('Mi regla');
    expect(statement.textContent.trim()).toBe('Descripción de la regla');
  });

  it('dispatches createRule when title is non-empty', () => {
    create([]);
    const dispatchSpy = vi.spyOn(store, 'dispatch');

    const titleInput: HTMLInputElement = fixture.nativeElement.querySelector('input[type="text"]');
    titleInput.value = 'Nueva regla';
    titleInput.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    const btn: HTMLButtonElement = fixture.nativeElement.querySelector('.submit');
    btn.click();

    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: PlaybookActions.createRule.type,
        title: 'Nueva regla',
      }),
    );
  });

  it('does not dispatch createRule when title is empty', () => {
    create([]);
    const dispatchSpy = vi.spyOn(store, 'dispatch');

    const btn: HTMLButtonElement = fixture.nativeElement.querySelector('.submit');
    btn.click();

    expect(dispatchSpy).not.toHaveBeenCalled();
  });

  it('dispatches assignSlot when slot select changes', () => {
    create([makeRule({ id: 'r1' })]);
    const dispatchSpy = vi.spyOn(store, 'dispatch');

    const select: HTMLSelectElement = fixture.nativeElement.querySelector('.slot-select select');
    select.value = '3';
    select.dispatchEvent(new Event('change'));

    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: PlaybookActions.assignSlot.type,
        id: 'r1',
        slot: 3,
      }),
    );
  });

  it('dispatches setRuleStatus with retired when retiring an active rule', () => {
    create([makeRule({ id: 'r1', status: 'active' })]);
    const dispatchSpy = vi.spyOn(store, 'dispatch');

    const buttons: HTMLButtonElement[] =
      fixture.nativeElement.querySelectorAll('.rule-actions button');
    const retireBtn = buttons[buttons.length - 1];
    retireBtn.click();

    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: PlaybookActions.setRuleStatus.type,
        id: 'r1',
        status: 'retired',
      }),
    );
  });

  it('export button calls downloadJson with correct filename pattern and all rules', () => {
    const rules = [
      makeRule({ id: 'r1', status: 'active' }),
      makeRule({ id: 'r2', status: 'retired', title: 'Retirada' }),
    ];
    create(rules);

    const comp = fixture.componentInstance;
    const spy = vi.spyOn(comp, 'downloadJson').mockImplementation(() => {});

    const exportBtn: HTMLButtonElement = fixture.nativeElement.querySelector('.head button');
    exportBtn.click();

    expect(spy).toHaveBeenCalledOnce();
    const [filename, payload] = spy.mock.calls[0];
    expect(filename).toMatch(/^playbook-\d{4}-\d{2}-\d{2}\.playbook\.json$/);
    const body = payload as { version: number; exportedAt: number; rules: PlaybookRule[] };
    expect(body.version).toBe(1);
    expect(typeof body.exportedAt).toBe('number');
    expect(body.rules).toHaveLength(2);
  });

  describe('inline edit', () => {
    function clickEdit(): void {
      const btn: HTMLButtonElement = fixture.nativeElement.querySelector('.edit-btn');
      btn.click();
      fixture.detectChanges();
    }
    function setValue(sel: string, value: string): void {
      const el: HTMLInputElement = fixture.nativeElement.querySelector(sel);
      el.value = value;
      el.dispatchEvent(new Event('input'));
      fixture.detectChanges();
    }

    it('dispatches updateRule with the edited title and statement', () => {
      create([makeRule({ id: 'r1' })]);
      const spy = vi.spyOn(store, 'dispatch');
      clickEdit();
      setValue('.edit-title', '  Nuevo título ');
      setValue('.edit-statement', 'Nueva regla');
      (fixture.nativeElement.querySelector('.edit-save') as HTMLButtonElement).click();
      fixture.detectChanges();

      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: PlaybookActions.updateRule.type,
          id: 'r1',
          title: 'Nuevo título',
          statement: 'Nueva regla',
          clientUpdatedAt: expect.any(Number),
        }),
      );
      expect(fixture.nativeElement.querySelector('.edit-title')).toBeNull();
    });

    it('rejects an empty title: save is disabled and nothing is dispatched', () => {
      create([makeRule({ id: 'r1' })]);
      const spy = vi.spyOn(store, 'dispatch');
      clickEdit();
      setValue('.edit-title', '   ');
      const save: HTMLButtonElement = fixture.nativeElement.querySelector('.edit-save');
      expect(save.disabled).toBe(true);
      save.click();
      expect(spy).not.toHaveBeenCalled();
    });

    it('cancel discards the draft without dispatching', () => {
      create([makeRule({ id: 'r1' })]);
      const spy = vi.spyOn(store, 'dispatch');
      clickEdit();
      setValue('.edit-title', 'Otro');
      (fixture.nativeElement.querySelector('.edit-cancel') as HTMLButtonElement).click();
      fixture.detectChanges();
      expect(spy).not.toHaveBeenCalled();
      expect(fixture.nativeElement.querySelector('.edit-title')).toBeNull();
      expect(fixture.nativeElement.querySelector('.rule-title').textContent).toContain(
        'Regla de prueba',
      );
    });

    it('does not dispatch when nothing changed', () => {
      create([makeRule({ id: 'r1' })]);
      const spy = vi.spyOn(store, 'dispatch');
      clickEdit();
      (fixture.nativeElement.querySelector('.edit-save') as HTMLButtonElement).click();
      expect(spy).not.toHaveBeenCalled();
    });
  });

  it('does not offer the slot select on a retired rule', () => {
    create([makeRule({ id: 'r1', status: 'retired' })]);
    expect(fixture.nativeElement.querySelector('.slot-select')).toBeNull();
  });

  it('still offers the slot select on an active rule', () => {
    create([makeRule({ id: 'r1' })]);
    expect(fixture.nativeElement.querySelector('.slot-select')).not.toBeNull();
  });
  describe('slot select reflects the assigned slot', () => {
    const select = (): HTMLSelectElement =>
      fixture.nativeElement.querySelector('.slot-select select');

    it('shows the assigned slot on first render', () => {
      create([makeRule({ shortcutSlot: 3 })]);
      expect(select().value).toBe('3');
    });

    it('shows the empty option when the rule has no slot', () => {
      create([makeRule({ shortcutSlot: null })]);
      expect(select().value).toBe('');
    });

    it('keeps the assigned slot after an Editar -> Cancelar round trip', () => {
      create([makeRule({ shortcutSlot: 3 })]);
      fixture.nativeElement.querySelector('.edit-btn').click();
      fixture.detectChanges();
      const cancel = Array.from<HTMLButtonElement>(
        fixture.nativeElement.querySelectorAll('button'),
      ).find((b) => b.textContent?.trim() === 'Cancelar');
      cancel?.click();
      fixture.detectChanges();
      expect(select().value).toBe('3');
    });

    it('dispatches assignSlot with null when choosing the empty option on a slotted rule', () => {
      create([makeRule({ id: 'r1', shortcutSlot: 3 })]);
      const dispatchSpy = vi.spyOn(store, 'dispatch');
      select().value = '';
      select().dispatchEvent(new Event('change'));
      expect(dispatchSpy).toHaveBeenCalledWith(
        expect.objectContaining({ type: PlaybookActions.assignSlot.type, id: 'r1', slot: null }),
      );
    });

    it('exposes aria-keyshortcuts Alt+N for a slotted rule and none otherwise', () => {
      create([makeRule({ shortcutSlot: 3 })]);
      expect(select().getAttribute('aria-keyshortcuts')).toBe('Alt+3');
      fixture.destroy();
      create([makeRule({ shortcutSlot: null })]);
      expect(select().hasAttribute('aria-keyshortcuts')).toBe(false);
    });

    it('tells the trader the shortcut is Alt/Option + digit', () => {
      create([makeRule()]);
      const label: HTMLElement = fixture.nativeElement.querySelector('.slot-select');
      expect(label.textContent).toContain('Atajo (Alt/⌥ + dígito)');
      expect(select().getAttribute('title')).toBe('Alt + dígito (⌥ Option en Mac)');
    });
  });
});
