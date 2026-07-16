import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { ExecutionSectionComponent } from './execution-section.component';
import type { ScatterPointView } from '../../state/journal/journal-read.models';

function point(p: Partial<ScatterPointView> = {}): ScatterPointView {
  return {
    tradeId: 't1',
    seq: 1,
    maeR: 0.5,
    mfeR: 1.5,
    rMultiple: 1,
    openTime: 0,
    ruleTitle: '',
    colorToken: 'var(--text-muted)',
    ...p,
  };
}

describe('ExecutionSectionComponent', () => {
  afterEach(() => TestBed.resetTestingModule());

  function create(points: ScatterPointView[]) {
    TestBed.configureTestingModule({ imports: [ExecutionSectionComponent] });
    const fixture = TestBed.createComponent(ExecutionSectionComponent);
    fixture.componentRef.setInput('points', points);
    fixture.detectChanges();
    return fixture;
  }

  it('carries the execution zone via data-zone', () => {
    const fixture = create([point(), point({ tradeId: 't2' }), point({ tradeId: 't3' })]);
    expect(fixture.nativeElement.querySelector('.section').getAttribute('data-zone')).toBe(
      'execution',
    );
  });

  it('shows the insufficient-data message with <3 points (exact copy)', () => {
    const fixture = create([point()]);
    const msg = fixture.nativeElement.querySelector('.insufficient-data');
    expect(msg.textContent.trim()).toBe('Se necesitan al menos 3 trades para esta visualización.');
    expect(fixture.nativeElement.querySelector('.viz-mount')).toBeNull();
  });

  it('renders the mount slot with >=3 points, no insufficient-data message', () => {
    const fixture = create([point(), point({ tradeId: 't2' }), point({ tradeId: 't3' })]);
    expect(fixture.nativeElement.querySelector('.viz-mount')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.insufficient-data')).toBeNull();
  });

  it('section header reads "Execution"', () => {
    const fixture = create([point(), point({ tradeId: 't2' }), point({ tradeId: 't3' })]);
    expect(fixture.nativeElement.querySelector('h2').textContent.trim()).toBe('Execution');
  });
});
