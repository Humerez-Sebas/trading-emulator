import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { TradesTableComponent } from './trades-table.component';
import type { TradeRowView } from '../../state/journal/journal-read.models';

function row(p: Partial<TradeRowView> = {}): TradeRowView {
  return {
    tradeId: 't1',
    seq: 1,
    openTime: 3600 * 14,
    side: 'C',
    profit: 100,
    rMultiple: 1,
    maeR: 0.5,
    mfeR: 1.2,
    ruleId: null,
    ruleBadge: '',
    colorToken: 'var(--text-muted)',
    hasReflection: false,
    ...p,
  };
}

describe('TradesTableComponent', () => {
  afterEach(() => TestBed.resetTestingModule());

  function create(inputs: {
    rows: TradeRowView[];
    ruleFilter?: string | null;
    selectedTradeId?: string | null;
  }) {
    TestBed.configureTestingModule({ imports: [TradesTableComponent] });
    const fixture = TestBed.createComponent(TradesTableComponent);
    fixture.componentRef.setInput('rows', inputs.rows);
    fixture.componentRef.setInput('ruleFilter', inputs.ruleFilter ?? null);
    fixture.componentRef.setInput('selectedTradeId', inputs.selectedTradeId ?? null);
    fixture.detectChanges();
    return fixture;
  }

  it('caption + th scope=col present', () => {
    const fixture = create({ rows: [row()] });
    expect(fixture.nativeElement.querySelector('caption')).toBeTruthy();
    fixture.nativeElement
      .querySelectorAll('th')
      .forEach((th: HTMLElement) => expect(th.getAttribute('scope')).toBe('col'));
  });

  it('renders from a single trade (no minimum, unlike visualizations)', () => {
    const fixture = create({ rows: [row()] });
    expect(fixture.nativeElement.querySelectorAll('tbody tr')).toHaveLength(1);
  });

  it('Side renders C/V as-is from the row (already mapped by the builder)', () => {
    const fixture = create({ rows: [row({ side: 'C' }), row({ tradeId: 't2', side: 'V' })] });
    const sides = Array.from(fixture.nativeElement.querySelectorAll('tbody tr td:nth-child(3)')).map(
      (el) => (el as HTMLElement).textContent!.trim(),
    );
    expect(sides).toEqual(['C', 'V']);
  });

  it('MAE_R/MFE_R render "—" when null, "N.NNR" otherwise', () => {
    const fixture = create({
      rows: [row({ tradeId: 't1', maeR: null, mfeR: null }), row({ tradeId: 't2', maeR: 0.5, mfeR: 1.2 })],
    });
    const rowsEl = fixture.nativeElement.querySelectorAll('tbody tr');
    expect(rowsEl[0].querySelector('td:nth-child(6)').textContent.trim()).toBe('—');
    expect(rowsEl[0].querySelector('td:nth-child(7)').textContent.trim()).toBe('—');
    expect(rowsEl[1].querySelector('td:nth-child(6)').textContent.trim()).toBe('0.50R');
    expect(rowsEl[1].querySelector('td:nth-child(7)').textContent.trim()).toBe('1.20R');
  });

  it('clicking a row emits tradeSelected with the tradeId', () => {
    const fixture = create({ rows: [row({ tradeId: 'abc' })] });
    const emitted: string[] = [];
    fixture.componentInstance.tradeSelected.subscribe((id) => emitted.push(id));
    (fixture.nativeElement.querySelector('tbody tr') as HTMLElement).click();
    expect(emitted).toEqual(['abc']);
  });

  it('the row matching selectedTradeId gets the "selected" class (keyboard-selected row style)', () => {
    const fixture = create({
      rows: [row({ tradeId: 't1' }), row({ tradeId: 't2' })],
      selectedTradeId: 't2',
    });
    const rowsEl = Array.from(fixture.nativeElement.querySelectorAll('tbody tr')) as HTMLElement[];
    expect(rowsEl[0].classList.contains('selected')).toBe(false);
    expect(rowsEl[1].classList.contains('selected')).toBe(true);
  });

  it('shows ✎ only for trades with hasReflection (trade-with-reflection state)', () => {
    const fixture = create({
      rows: [row({ tradeId: 't1', hasReflection: false }), row({ tradeId: 't2', hasReflection: true })],
    });
    const rowsEl = Array.from(fixture.nativeElement.querySelectorAll('tbody tr')) as HTMLElement[];
    expect(rowsEl[0].querySelector('.reflection-mark')).toBeNull();
    expect(rowsEl[0].classList.contains('trade-with-reflection')).toBe(false);
    expect(rowsEl[1].querySelector('.reflection-mark')?.textContent).toBe('✎');
    expect(rowsEl[1].classList.contains('trade-with-reflection')).toBe(true);
  });

  it('ruleFilter narrows the rendered rows to that rule id', () => {
    const fixture = create({
      rows: [
        row({ tradeId: 't1', ruleId: 'r1' }),
        row({ tradeId: 't2', ruleId: 'r2' }),
        row({ tradeId: 't3', ruleId: null }),
      ],
      ruleFilter: 'r1',
    });
    const ids = Array.from(fixture.nativeElement.querySelectorAll('tbody tr')).length;
    expect(ids).toBe(1);
    expect(fixture.nativeElement.querySelector('.filter-note')).toBeTruthy();
  });

  it('ruleFilter null (default) shows every row, no filter-note', () => {
    const fixture = create({
      rows: [row({ tradeId: 't1', ruleId: 'r1' }), row({ tradeId: 't2', ruleId: null })],
    });
    expect(fixture.nativeElement.querySelectorAll('tbody tr')).toHaveLength(2);
    expect(fixture.nativeElement.querySelector('.filter-note')).toBeNull();
  });

  it('renders the rule badge when present, with the rule color on a swatch dot (not the text — contrast safety)', () => {
    const fixture = create({ rows: [row({ ruleBadge: 'R4', colorToken: 'var(--rule-4)' })] });
    const badge = fixture.nativeElement.querySelector('.rule-badge');
    expect(badge.textContent.trim()).toBe('R4');
    const swatch = badge.querySelector('.rule-swatch');
    expect(swatch).toBeTruthy();
    expect(swatch.style.background).toBe('var(--rule-4)');
    expect(badge.style.color).toBe('');
  });
});
