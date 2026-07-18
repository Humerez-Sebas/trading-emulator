import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { TimeOfDayTableComponent } from './time-of-day-table.component';
import type { TimeOfDayRow } from '../../state/journal/journal-read.models';

function row(p: Partial<TimeOfDayRow> = {}): TimeOfDayRow {
  return { hourUtc: 14, trades: 3, winRate: 0.5, totalR: 1.2, ...p };
}

describe('TimeOfDayTableComponent', () => {
  afterEach(() => TestBed.resetTestingModule());

  function create(rows: TimeOfDayRow[]) {
    TestBed.configureTestingModule({ imports: [TimeOfDayTableComponent] });
    const fixture = TestBed.createComponent(TimeOfDayTableComponent);
    fixture.componentRef.setInput('rows', rows);
    fixture.detectChanges();
    return fixture;
  }

  it('caption + th scope=col present, temporal zone via data-zone', () => {
    const fixture = create([row()]);
    expect(fixture.nativeElement.querySelector('caption')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.section').getAttribute('data-zone')).toBe(
      'temporal',
    );
    fixture.nativeElement
      .querySelectorAll('th')
      .forEach((th: HTMLElement) => expect(th.getAttribute('scope')).toBe('col'));
  });

  it('formats the hour as zero-padded HH:00 UTC', () => {
    const fixture = create([row({ hourUtc: 9 }), row({ hourUtc: 14 })]);
    const hours = Array.from(fixture.nativeElement.querySelectorAll('tbody td:first-child')).map(
      (el) => (el as HTMLElement).textContent!.trim(),
    );
    expect(hours).toEqual(['09:00', '14:00']);
  });

  it('renders exactly the given (already non-empty-bucket-filtered) rows', () => {
    const fixture = create([row({ hourUtc: 9 })]);
    expect(fixture.nativeElement.querySelectorAll('tbody tr')).toHaveLength(1);
  });
});
