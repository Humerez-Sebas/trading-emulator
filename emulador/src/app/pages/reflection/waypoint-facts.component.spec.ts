import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { WaypointFactsComponent } from './waypoint-facts.component';
import type { Waypoint } from '../../domain/reflection/waypoints';

describe('WaypointFactsComponent', () => {
  function mount(wp: Waypoint | null) {
    TestBed.configureTestingModule({ imports: [WaypointFactsComponent] });
    const fixture = TestBed.createComponent(WaypointFactsComponent);
    fixture.componentRef.setInput('waypoint', wp);
    fixture.detectChanges();
    return fixture;
  }

  it('renders nothing when waypoint is null', () => {
    const fixture = mount(null);
    expect(fixture.nativeElement.querySelectorAll('.fact-row')).toHaveLength(0);
  });

  it('Entry: shows entry price, initial risk, elapsed time — never future facts (result/R absent)', () => {
    const wp: Waypoint = {
      slot: 1,
      time: 1000,
      facts: {
        entryPrice: 1.085,
        riskDistancePrice: 0.005,
        riskDistanceR: 1,
        elapsedBeforeOrder: {
          orderRef: 'o1',
          anchorKind: 'sessionStart',
          pausedMs: 2000,
          playingMs: 5000,
          candlesRevealed: 12,
        },
      },
    };
    const fixture = mount(wp);
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Precio de entrada');
    expect(text).toContain('1.085');
    expect(text).toContain('Riesgo inicial');
    expect(text).toContain('Tiempo antes de la orden');
    expect(text).not.toMatch(/Resultado neto|Excursión/);
  });

  it('Entry: elapsed row is absent when no TimeElapsedBeforeOrder fact exists', () => {
    const wp: Waypoint = {
      slot: 1,
      time: 1000,
      facts: { entryPrice: 1.085, riskDistancePrice: 0.005, riskDistanceR: 1 },
    };
    const fixture = mount(wp);
    expect(fixture.nativeElement.textContent).not.toContain('Tiempo antes de la orden');
  });

  it('Management: renders one row per sub-event with field/from→to/hora geometry, never a tighten/widen word (N-1)', () => {
    const wp: Waypoint = {
      slot: 2,
      time: 1100,
      facts: {
        subEvents: [
          {
            seq: 1,
            kind: 'OrderModified',
            marketTime: 1100,
            payload: { field: 'sl', from: 1.08, to: 1.081 },
          },
          {
            seq: 2,
            kind: 'OrderModified',
            marketTime: 1200,
            payload: { field: 'tp', from: 1.09, to: 1.095 },
          },
        ],
      },
    };
    const fixture = mount(wp);
    const rows = fixture.nativeElement.querySelectorAll('.fact-row');
    expect(rows).toHaveLength(2);
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('SL');
    expect(text).toContain('TP');
    expect(text).toContain('→');
    expect(text).not.toMatch(/tighten|widen/i);
  });

  it('MAE: shows excursion in R and hora', () => {
    const wp: Waypoint = { slot: 3, time: 1300, facts: { excursion: 0.001, excursionR: 0.5 } };
    const fixture = mount(wp);
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Excursión adversa');
    expect(text).toContain('+0.50R');
  });

  it('MFE: shows excursion in R and hora', () => {
    const wp: Waypoint = { slot: 4, time: 1400, facts: { excursion: 0.002, excursionR: 1.2 } };
    const fixture = mount(wp);
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Excursión favorable');
    expect(text).toContain('+1.20R');
  });

  it('Exit: shows net result, R, costs, hora', () => {
    const wp: Waypoint = {
      slot: 5,
      time: 2000,
      facts: { profit: 200, rMultiple: 2, commission: 5 },
    };
    const fixture = mount(wp);
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Resultado neto');
    expect(text).toContain('+200.00');
    expect(text).toContain('+2.00R');
    expect(text).toContain('5.00');
  });

  it('Exit fused with MAE/MFE: shows both merged fact panels (mergedMae/mergedMfe already computed upstream)', () => {
    const wp: Waypoint = {
      slot: 5,
      time: 2000,
      facts: {
        profit: 200,
        rMultiple: 2,
        mergedMae: { excursion: 0.001, excursionR: 0.5, time: 1990 },
        mergedMfe: { excursion: 0.002, excursionR: 1.1, time: 1995 },
      },
    };
    const fixture = mount(wp);
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Excursión adversa (MAE)');
    expect(text).toContain('Excursión favorable (MFE)');
  });
});
