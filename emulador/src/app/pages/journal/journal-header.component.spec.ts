import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, describe, expect, it } from 'vitest';
import { JournalHeaderComponent } from './journal-header.component';

describe('JournalHeaderComponent', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
  });

  function create(inputs: {
    sessionName: string;
    symbol: string;
    dateFrom?: number | null;
    dateTo?: number | null;
  }) {
    TestBed.configureTestingModule({
      imports: [JournalHeaderComponent],
      providers: [provideRouter([])],
    });
    const fixture = TestBed.createComponent(JournalHeaderComponent);
    fixture.componentRef.setInput('sessionName', inputs.sessionName);
    fixture.componentRef.setInput('symbol', inputs.symbol);
    if (inputs.dateFrom !== undefined) fixture.componentRef.setInput('dateFrom', inputs.dateFrom);
    if (inputs.dateTo !== undefined) fixture.componentRef.setInput('dateTo', inputs.dateTo);
    fixture.detectChanges();
    return fixture;
  }

  it('renders "Journal — {name}" as the h1 and the symbol', () => {
    const fixture = create({ sessionName: 'Ruptura EURUSD', symbol: 'EURUSD' });
    const h1 = fixture.nativeElement.querySelector('h1');
    expect(h1.textContent.trim()).toBe('Journal — Ruptura EURUSD');
    expect(fixture.nativeElement.querySelector('.meta').textContent).toContain('EURUSD');
  });

  it('renders the date range when both dateFrom/dateTo are present', () => {
    const fixture = create({
      sessionName: 'S',
      symbol: 'XAUUSD',
      dateFrom: Date.UTC(2024, 2, 1) / 1000,
      dateTo: Date.UTC(2024, 2, 5) / 1000,
    });
    const meta = fixture.nativeElement.querySelector('.meta').textContent;
    expect(meta).toContain('2024');
  });

  it('omits the date range when dateFrom/dateTo are null (session without trades)', () => {
    const fixture = create({ sessionName: 'S', symbol: 'XAUUSD', dateFrom: null, dateTo: null });
    const meta = fixture.nativeElement.querySelector('.meta').textContent.trim();
    expect(meta).toBe('XAUUSD');
  });

  it('the breadcrumb links back to /sesiones', () => {
    const fixture = create({ sessionName: 'S', symbol: 'XAUUSD' });
    const link = fixture.nativeElement.querySelector('.breadcrumb') as HTMLAnchorElement;
    expect(link.getAttribute('routerLink')).toBe('/sesiones');
  });

  it('focus lands on the h1 after view init (§5.3)', async () => {
    const fixture = create({ sessionName: 'S', symbol: 'XAUUSD' });
    await Promise.resolve(); // let the queueMicrotask focus() call settle
    const h1 = fixture.nativeElement.querySelector('h1');
    expect(document.activeElement).toBe(h1);
  });
});
