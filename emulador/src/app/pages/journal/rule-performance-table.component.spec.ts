import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { RulePerformanceTableComponent } from './rule-performance-table.component';
import type { RulePerformanceRow } from '../../state/journal/journal-read.models';

function row(p: Partial<RulePerformanceRow> = {}): RulePerformanceRow {
  return {
    ruleId: 'r1',
    title: 'Ruptura de rango',
    colorToken: 'var(--rule-1)',
    trades: 3,
    winRate: 0.667,
    totalR: 2.4,
    ...p,
  };
}

describe('RulePerformanceTableComponent', () => {
  afterEach(() => TestBed.resetTestingModule());

  function create(rows: RulePerformanceRow[]) {
    TestBed.configureTestingModule({ imports: [RulePerformanceTableComponent] });
    const fixture = TestBed.createComponent(RulePerformanceTableComponent);
    fixture.componentRef.setInput('rows', rows);
    fixture.detectChanges();
    return fixture;
  }

  it('caption + th scope=col present (accessibility §4)', () => {
    const fixture = create([row()]);
    expect(fixture.nativeElement.querySelector('caption')).toBeTruthy();
    const headers = fixture.nativeElement.querySelectorAll('th');
    headers.forEach((th: HTMLElement) => expect(th.getAttribute('scope')).toBe('col'));
  });

  it('carries the rules zone via data-zone', () => {
    const fixture = create([row()]);
    expect(fixture.nativeElement.querySelector('.section').getAttribute('data-zone')).toBe('rules');
  });

  it('renders one row per declared rule + the Sin declarar row', () => {
    const fixture = create([
      row({ ruleId: 'r1', title: 'A' }),
      row({ ruleId: null, title: 'Sin declarar' }),
    ]);
    const cells = Array.from(fixture.nativeElement.querySelectorAll('tbody tr td:first-child')).map(
      (el) => (el as HTMLElement).textContent!.trim(),
    );
    expect(cells).toEqual(['A', 'Sin declarar']);
  });

  it('clicking a rule row emits ruleFilterToggled with its id, clicking it again emits null (toggle)', () => {
    const fixture = create([row({ ruleId: 'r1' })]);
    const emitted: (string | null)[] = [];
    fixture.componentInstance.ruleFilterToggled.subscribe((v) => emitted.push(v));
    const tr = fixture.nativeElement.querySelector('tbody tr.clickable') as HTMLElement;
    tr.click();
    fixture.detectChanges();
    expect(emitted).toEqual(['r1']);
    expect(tr.classList.contains('active')).toBe(true);
    tr.click();
    fixture.detectChanges();
    expect(emitted).toEqual(['r1', null]);
    expect(tr.classList.contains('active')).toBe(false);
  });

  it('the Sin declarar row is NOT clickable (no toggle affordance)', () => {
    const fixture = create([row({ ruleId: null, title: 'Sin declarar' })]);
    const tr = fixture.nativeElement.querySelector('tbody tr') as HTMLElement;
    expect(tr.classList.contains('clickable')).toBe(false);
    const emitted: (string | null)[] = [];
    fixture.componentInstance.ruleFilterToggled.subscribe((v) => emitted.push(v));
    tr.click();
    fixture.detectChanges();
    expect(emitted).toEqual([]);
  });

  it('rule-without-trades: an empty rows array renders no data rows', () => {
    const fixture = create([]);
    expect(fixture.nativeElement.querySelectorAll('tbody tr')).toHaveLength(0);
  });

  it('clickable rows are keyboard-operable: tabindex=0, role=button, Enter and Space both toggle', () => {
    const fixture = create([row({ ruleId: 'r1' })]);
    const emitted: (string | null)[] = [];
    fixture.componentInstance.ruleFilterToggled.subscribe((v) => emitted.push(v));
    const tr = fixture.nativeElement.querySelector('tbody tr.clickable') as HTMLElement;
    expect(tr.getAttribute('tabindex')).toBe('0');
    expect(tr.getAttribute('role')).toBe('button');
    expect(tr.getAttribute('aria-pressed')).toBe('false');

    tr.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    fixture.detectChanges();
    expect(emitted).toEqual(['r1']);
    expect(tr.getAttribute('aria-pressed')).toBe('true');

    tr.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    fixture.detectChanges();
    expect(emitted).toEqual(['r1', null]);
  });
});
