import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { WaypointFactsComponent } from './waypoint-facts.component';

describe('WaypointFactsComponent — no SL at entry (MEDIUM-4)', () => {
  it('Entry: "Riesgo inicial" shows "—", never 0 and never 1.00R', () => {
    TestBed.configureTestingModule({ imports: [WaypointFactsComponent] });
    const fixture = TestBed.createComponent(WaypointFactsComponent);
    fixture.componentRef.setInput('waypoint', {
      slot: 1,
      time: 1000,
      facts: { entryPrice: 1.085, riskDistancePrice: null, riskDistanceR: null },
    });
    fixture.detectChanges();
    const rows: HTMLElement[] = Array.from(fixture.nativeElement.querySelectorAll('.fact-row'));
    const risk = rows.find((r) => r.textContent?.includes('Riesgo inicial'));
    expect(risk).toBeDefined();
    expect(risk!.textContent).toContain('—');
    expect(risk!.textContent).not.toMatch(/0\.00|1\.00R|0\.0000/);
  });
});
