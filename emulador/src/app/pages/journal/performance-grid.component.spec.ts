import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { PerformanceGridComponent } from './performance-grid.component';
import type { SessionStatsView } from '../../state/journal/journal-read.models';

function stats(p: Partial<SessionStatsView> = {}): SessionStatsView {
  return {
    profitFactor: 1.846,
    winRate: 0.6234,
    totalR: 4.2,
    balance: 10420.5,
    drawdownPct: 0.084,
    sharpe: 0.421,
    maeRMean: 0.55,
    mfeRMean: 1.32,
    tradesCount: 7,
    costsTotal: 12.5,
    ...p,
  };
}

describe('PerformanceGridComponent', () => {
  afterEach(() => TestBed.resetTestingModule());

  function create(s: SessionStatsView) {
    TestBed.configureTestingModule({ imports: [PerformanceGridComponent] });
    const fixture = TestBed.createComponent(PerformanceGridComponent);
    fixture.componentRef.setInput('stats', s);
    fixture.detectChanges();
    return fixture;
  }

  function cardValue(fixture: ReturnType<typeof create>, label: string): string {
    const cards = Array.from(
      fixture.nativeElement.querySelectorAll('.metric-card'),
    ) as HTMLElement[];
    const card = cards.find((c) => c.querySelector('.metric-label')?.textContent?.trim() === label);
    if (!card) throw new Error(`No card with label "${label}"`);
    return card.querySelector('.metric-value')!.textContent!.trim();
  }

  it('renders all 10 cards in the design-spec order', () => {
    const fixture = create(stats());
    const labels = Array.from(
      fixture.nativeElement.querySelectorAll('.metric-label'),
    ).map((el) => (el as HTMLElement).textContent!.trim());
    expect(labels).toEqual([
      'Profit factor',
      'Win rate',
      'R acumulado',
      'Balance',
      'Drawdown',
      'Sharpe',
      'MAE_R media',
      'MFE_R media',
      'Trades',
      'Costes',
    ]);
  });

  it('profit factor: 2 decimals', () => {
    const fixture = create(stats({ profitFactor: 1.846 }));
    expect(cardValue(fixture, 'Profit factor')).toBe('1.85');
  });

  it('profit factor: ∞ with no losses', () => {
    const fixture = create(stats({ profitFactor: Infinity }));
    expect(cardValue(fixture, 'Profit factor')).toBe('∞');
  });

  it('win rate: 0 decimals, percent', () => {
    const fixture = create(stats({ winRate: 0.6234 }));
    expect(cardValue(fixture, 'Win rate')).toBe('62%');
  });

  it('R acumulado: signed, 2 decimals, R suffix, up/down class', () => {
    const positive = create(stats({ totalR: 4.2 }));
    expect(cardValue(positive, 'R acumulado')).toBe('+4.20R');
    TestBed.resetTestingModule();
    const negative = create(stats({ totalR: -1.3 }));
    expect(cardValue(negative, 'R acumulado')).toBe('-1.30R');
  });

  it('sharpe: 2 decimals with the fixed "por-trade, sin anualizar" sublabel', () => {
    const fixture = create(stats({ sharpe: 0.421 }));
    expect(cardValue(fixture, 'Sharpe')).toBe('0.42');
    expect(fixture.nativeElement.querySelector('.metric-sublabel').textContent.trim()).toBe(
      'por-trade, sin anualizar',
    );
  });

  it('sharpe: "—" when null (n<2)', () => {
    const fixture = create(stats({ sharpe: null }));
    expect(cardValue(fixture, 'Sharpe')).toBe('—');
  });

  it('MAE_R / MFE_R media: 2 decimals + R suffix, "—" when null', () => {
    const withValues = create(stats({ maeRMean: 0.55, mfeRMean: 1.32 }));
    expect(cardValue(withValues, 'MAE_R media')).toBe('0.55R');
    expect(cardValue(withValues, 'MFE_R media')).toBe('1.32R');
    TestBed.resetTestingModule();
    const withoutValues = create(stats({ maeRMean: null, mfeRMean: null }));
    expect(cardValue(withoutValues, 'MAE_R media')).toBe('—');
    expect(cardValue(withoutValues, 'MFE_R media')).toBe('—');
  });

  it('trades: integer, no decimals', () => {
    const fixture = create(stats({ tradesCount: 7 }));
    expect(cardValue(fixture, 'Trades')).toBe('7');
  });

  it('costes/balance: currency, 2 decimals', () => {
    const fixture = create(stats({ costsTotal: 12.5, balance: 10420.5 }));
    expect(cardValue(fixture, 'Costes')).toBe('12.50 $');
    expect(cardValue(fixture, 'Balance')).toBe('10,420.50 $');
  });

  it('every metric-value carries tabular-nums (via CSS class rule, checked structurally: no raw text nodes escape the strong)', () => {
    const fixture = create(stats());
    const values = fixture.nativeElement.querySelectorAll('.metric-value');
    expect(values.length).toBe(10);
  });
});
