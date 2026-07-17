import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { LessonFormComponent, type LessonDraft } from './lesson-form.component';
import type { Lesson } from '../../state/lessons/lessons.models';
import type { PlaybookRule } from '../../state/playbook/playbook.models';

function rule(p: Partial<PlaybookRule> = {}): PlaybookRule {
  return {
    id: 'r1',
    title: 'Ruptura de rango',
    statement: 'Entrar en ruptura confirmada con volumen.',
    createdAt: 0,
    status: 'active',
    shortcutSlot: null,
    sortOrder: 0,
    amendments: [],
    ...p,
  };
}

function lesson(p: Partial<Lesson> = {}): Lesson {
  return {
    id: 'l1',
    authoredAt: 0,
    whatHappened: 'Entré antes de la confirmación.',
    repeat: 'Esperar el cierre de la vela.',
    avoid: 'Entrar por FOMO.',
    linkedRuleIds: ['r1'],
    evidence: [],
    tradeRefs: ['t1'],
    sessionRef: 's1',
    ...p,
  };
}

describe('LessonFormComponent', () => {
  function mount(existing: Lesson | null = null, activeRules: PlaybookRule[] = [], saving = false) {
    TestBed.configureTestingModule({ imports: [LessonFormComponent] });
    const fixture = TestBed.createComponent(LessonFormComponent);
    fixture.componentRef.setInput('existing', existing);
    fixture.componentRef.setInput('activeRules', activeRules);
    fixture.componentRef.setInput('saving', saving);
    fixture.detectChanges();
    return fixture;
  }

  it('renders the 3 fields with VISIBLE labels (never placeholder-only)', () => {
    const fixture = mount();
    const labels = [...fixture.nativeElement.querySelectorAll('.field-label')].map((e: HTMLElement) =>
      e.textContent?.trim(),
    );
    expect(labels).toEqual(['¿Qué ocurrió?', '¿Qué debería repetir?', '¿Qué debería evitar?']);
  });

  it('save button is DISABLED when all three fields are empty AND zero rules linked', () => {
    const fixture = mount();
    const button: HTMLButtonElement = fixture.nativeElement.querySelector('button[type="submit"]');
    expect(button.disabled).toBe(true);
  });

  it('save button ENABLES when any single field has text', () => {
    const fixture = mount();
    const textarea: HTMLTextAreaElement = fixture.nativeElement.querySelectorAll('textarea')[0];
    textarea.value = 'Algo ocurrió';
    textarea.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    const button: HTMLButtonElement = fixture.nativeElement.querySelector('button[type="submit"]');
    expect(button.disabled).toBe(false);
  });

  it('save button ENABLES when a rule is linked, even with all text fields empty', () => {
    const fixture = mount(null, [rule()]);
    const chip: HTMLButtonElement = fixture.nativeElement.querySelector('.rule-chips button');
    chip.click();
    fixture.detectChanges();
    const button: HTMLButtonElement = fixture.nativeElement.querySelector('button[type="submit"]');
    expect(button.disabled).toBe(false);
  });

  it('emits the draft (three fields + linkedRuleIds) on submit', () => {
    const fixture = mount(null, [rule()]);
    const [whatHappened] = fixture.nativeElement.querySelectorAll('textarea');
    whatHappened.value = 'Entré tarde';
    whatHappened.dispatchEvent(new Event('input'));
    fixture.nativeElement.querySelector('.rule-chips button').click();
    fixture.detectChanges();

    let draft: LessonDraft | null = null;
    fixture.componentInstance.save.subscribe((d: LessonDraft) => (draft = d));
    fixture.nativeElement
      .querySelector('form')
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    expect(draft).toEqual({
      whatHappened: 'Entré tarde',
      repeat: '',
      avoid: '',
      linkedRuleIds: ['r1'],
    });
  });

  it('does NOT emit save when disabled (defensive; native disabled attribute already blocks submit)', () => {
    const fixture = mount();
    let called = false;
    fixture.componentInstance.save.subscribe(() => (called = true));
    fixture.componentInstance.onSubmit(new Event('submit'));
    expect(called).toBe(false);
  });

  it('prefills from `existing` (reflection-existing state)', () => {
    const fixture = mount(lesson(), [rule()]);
    const textareas: HTMLTextAreaElement[] = fixture.nativeElement.querySelectorAll('textarea');
    expect(textareas[0].value).toBe('Entré antes de la confirmación.');
    expect(textareas[1].value).toBe('Esperar el cierre de la vela.');
    expect(textareas[2].value).toBe('Entrar por FOMO.');
    const chip: HTMLElement = fixture.nativeElement.querySelector('.rule-chips button');
    expect(chip.classList.contains('ui-badge--accent')).toBe(true);
  });

  it('button label switches to "Actualizar..." when `existing` is set', () => {
    const fixture = mount(lesson());
    const button: HTMLButtonElement = fixture.nativeElement.querySelector('button[type="submit"]');
    expect(button.textContent?.trim()).toBe('Actualizar y volver al Journal');
  });

  it('button label is "Guardar..." when `existing` is null', () => {
    const fixture = mount(null);
    const button: HTMLButtonElement = fixture.nativeElement.querySelector('button[type="submit"]');
    expect(button.textContent?.trim()).toContain('Guardar y volver al Journal');
  });

  it('button shows "Guardando…" and stays disabled while saving()', () => {
    const fixture = mount(null, [rule()], true);
    fixture.nativeElement.querySelector('.rule-chips button').click();
    fixture.detectChanges();
    const button: HTMLButtonElement = fixture.nativeElement.querySelector('button[type="submit"]');
    expect(button.textContent?.trim()).toBe('Guardando…');
    expect(button.disabled).toBe(true);
  });

  it('toggling a chip twice deselects it', () => {
    const fixture = mount(null, [rule()]);
    const chip: HTMLButtonElement = fixture.nativeElement.querySelector('.rule-chips button');
    chip.click();
    fixture.detectChanges();
    expect(fixture.componentInstance.isSelected('r1')).toBe(true);
    chip.click();
    fixture.detectChanges();
    expect(fixture.componentInstance.isSelected('r1')).toBe(false);
  });

  it('switching `existing` resets the draft to the new lesson (or blank)', () => {
    const fixture = mount(lesson());
    fixture.componentRef.setInput('existing', null);
    fixture.detectChanges();
    const textareas: HTMLTextAreaElement[] = fixture.nativeElement.querySelectorAll('textarea');
    expect(textareas[0].value).toBe('');
  });

  it('a slotted rule shows its R{slot} badge; an unslotted rule does not', () => {
    const fixture = mount(null, [rule({ id: 'r1', shortcutSlot: 3 }), rule({ id: 'r2', shortcutSlot: null })]);
    const chips: HTMLElement[] = fixture.nativeElement.querySelectorAll('.rule-chips button');
    expect(chips[0].querySelector('.slot')?.textContent).toBe('R3');
    expect(chips[1].querySelector('.slot')).toBeNull();
  });
});
