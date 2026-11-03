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
});
