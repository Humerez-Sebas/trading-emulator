import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { BehaviorSectionComponent } from './behavior-section.component';
import type { BubbleView, HeatmapCellView } from '../../state/journal/journal-read.models';

function bubble(p: Partial<BubbleView> = {}): BubbleView {
  return {
    tradeId: 't1',
    seq: 1,
    durationBaseCandles: 10,
    rMultiple: 1,
    managementEventCount: 0,
    ruleTitle: '',
    colorToken: 'var(--text-muted)',
    ...p,
  };
}

function cell(p: Partial<HeatmapCellView> = {}): HeatmapCellView {
  return { tradeId: 't1', seq: 1, rMultiple: 1, ...p };
}

describe('BehaviorSectionComponent', () => {
  afterEach(() => TestBed.resetTestingModule());

  function create(
    bubbles: BubbleView[],
    cells: HeatmapCellView[],
    facts = { replayJumps: 3, pauses: 2 },
  ) {
    TestBed.configureTestingModule({ imports: [BehaviorSectionComponent] });
    const fixture = TestBed.createComponent(BehaviorSectionComponent);
    fixture.componentRef.setInput('bubbles', bubbles);
    fixture.componentRef.setInput('cells', cells);
    fixture.componentRef.setInput('facts', facts);
    fixture.detectChanges();
    return fixture;
  }

  it('carries the behavior zone via data-zone', () => {
    const bubbles = [bubble(), bubble({ tradeId: 't2' }), bubble({ tradeId: 't3' })];
    const cells = [cell(), cell({ tradeId: 't2' }), cell({ tradeId: 't3' })];
    const fixture = create(bubbles, cells);
    expect(fixture.nativeElement.querySelector('.section').getAttribute('data-zone')).toBe(
      'behavior',
    );
  });

  it('shows insufficient-data with <3 bubbles, no mount slots', () => {
    const fixture = create([bubble()], [cell()]);
    expect(fixture.nativeElement.querySelector('.insufficient-data').textContent.trim()).toBe(
      'Se necesitan al menos 3 trades para esta visualización.',
    );
    expect(fixture.nativeElement.querySelectorAll('.viz-mount')).toHaveLength(0);
  });

  it('renders TWO mount slots (bubble + heatmap) with >=3 trades', () => {
    const bubbles = [bubble(), bubble({ tradeId: 't2' }), bubble({ tradeId: 't3' })];
    const cells = [cell(), cell({ tradeId: 't2' }), cell({ tradeId: 't3' })];
    const fixture = create(bubbles, cells);
    const mounts = fixture.nativeElement.querySelectorAll('.viz-mount');
    expect(mounts).toHaveLength(2);
  });

  it('the navigation-facts row always renders numbers (never gated by trade count)', () => {
    const fixture = create([bubble()], [cell()], { replayJumps: 5, pauses: 1 });
    const facts = Array.from(fixture.nativeElement.querySelectorAll('.fact dd')).map((el) =>
      (el as HTMLElement).textContent!.trim(),
    );
    expect(facts).toEqual(['5', '1']);
  });
});
