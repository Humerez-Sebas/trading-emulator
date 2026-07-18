import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { CabinTradeListComponent, type CabinTradeRow } from './cabin-trade-list.component';

function row(p: Partial<CabinTradeRow> = {}): CabinTradeRow {
  return {
    tradeId: 't1',
    seq: 1,
    openTime: 0,
    side: 'C',
    rMultiple: 1.5,
    ruleBadge: '',
    colorToken: 'var(--text-muted)',
    hasReflection: false,
    ...p,
  };
}

describe('CabinTradeListComponent', () => {
  function mount(trades: CabinTradeRow[], activeTradeId: string | null = null) {
    TestBed.configureTestingModule({ imports: [CabinTradeListComponent] });
    const fixture = TestBed.createComponent(CabinTradeListComponent);
    fixture.componentRef.setInput('trades', trades);
    fixture.componentRef.setInput('activeTradeId', activeTradeId);
    fixture.detectChanges();
    return fixture;
  }

  it('renders one row per trade', () => {
    const fixture = mount([row({ tradeId: 't1' }), row({ tradeId: 't2', seq: 2 })]);
    expect(fixture.nativeElement.querySelectorAll('.row')).toHaveLength(2);
  });

  it('marks the active trade row with the "active" class', () => {
    const fixture = mount([row({ tradeId: 't1' }), row({ tradeId: 't2', seq: 2 })], 't2');
    const rows: HTMLElement[] = fixture.nativeElement.querySelectorAll('.row');
    expect(rows[0].classList.contains('active')).toBe(false);
    expect(rows[1].classList.contains('active')).toBe(true);
  });

  it('shows the ✎ mark only for rows with hasReflection', () => {
    const fixture = mount([
      row({ tradeId: 't1', hasReflection: true }),
      row({ tradeId: 't2', seq: 2 }),
    ]);
    const rows: HTMLElement[] = fixture.nativeElement.querySelectorAll('.row');
    expect(rows[0].querySelector('.reflection-mark')).toBeTruthy();
    expect(rows[1].querySelector('.reflection-mark')).toBeNull();
  });

  it('shows the rule badge only when ruleBadge is non-empty', () => {
    const fixture = mount([
      row({ tradeId: 't1', ruleBadge: 'R1' }),
      row({ tradeId: 't2', seq: 2, ruleBadge: '' }),
    ]);
    const rows: HTMLElement[] = fixture.nativeElement.querySelectorAll('.row');
    expect(rows[0].querySelector('.rule-badge')?.textContent).toContain('R1');
    expect(rows[1].querySelector('.rule-badge')).toBeNull();
  });

  it('emits tradeSelected with the tradeId on row click', () => {
    const fixture = mount([row({ tradeId: 't1' }), row({ tradeId: 't2', seq: 2 })]);
    let selected: string | null = null;
    fixture.componentInstance.tradeSelected.subscribe((id: string) => (selected = id));
    const rows: HTMLElement[] = fixture.nativeElement.querySelectorAll('.row');
    (rows[1] as HTMLButtonElement).click();
    expect(selected).toBe('t2');
  });

  it('colors R by result: up for >=0, down for <0', () => {
    const fixture = mount([
      row({ tradeId: 't1', rMultiple: 1 }),
      row({ tradeId: 't2', seq: 2, rMultiple: -1 }),
    ]);
    const rows: HTMLElement[] = fixture.nativeElement.querySelectorAll('.row');
    expect(rows[0].querySelector('.r')?.classList.contains('up')).toBe(true);
    expect(rows[1].querySelector('.r')?.classList.contains('down')).toBe(true);
  });
});
