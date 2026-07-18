import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { BubbleDurationRComponent } from './bubble-duration-r.component';
import type { BubbleView } from '../../state/journal/journal-read.models';

describe('BubbleDurationRComponent', () => {
  let component: BubbleDurationRComponent;
  let fixture: ComponentFixture<BubbleDurationRComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BubbleDurationRComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(BubbleDurationRComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    fixture.destroy();
  });

  describe('DOM structure', () => {
    it('should render an SVG element', () => {
      fixture.componentRef.setInput('bubbles', []);
      fixture.detectChanges();
      const svg = fixture.nativeElement.querySelector('svg');
      expect(svg).toBeTruthy();
    });

    it('should have aria-label describing the visualization', () => {
      fixture.componentRef.setInput('bubbles', []);
      fixture.detectChanges();
      const svg = fixture.nativeElement.querySelector('svg');
      expect(svg?.getAttribute('aria-label')).toBeTruthy();
    });

    it('should render one circle per bubble', () => {
      const bubbles: BubbleView[] = [
        {
          tradeId: 'bubble-1',
          seq: 1,
          durationBaseCandles: 50,
          rMultiple: 1.5,
          managementEventCount: 2,
          ruleTitle: 'Rule A',
          colorToken: 'var(--rule-1)',
        },
        {
          tradeId: 'bubble-2',
          seq: 2,
          durationBaseCandles: 100,
          rMultiple: 2.0,
          managementEventCount: 5,
          ruleTitle: 'Rule B',
          colorToken: 'var(--rule-2)',
        },
      ];
      fixture.componentRef.setInput('bubbles', bubbles);
      fixture.detectChanges();
      const circles = fixture.nativeElement.querySelectorAll('circle[data-bubble]');
      expect(circles.length).toBe(2);
    });

    it('should render no circles when bubbles array is empty', () => {
      fixture.componentRef.setInput('bubbles', []);
      fixture.detectChanges();
      const circles = fixture.nativeElement.querySelectorAll('circle[data-bubble]');
      expect(circles.length).toBe(0);
    });
  });

  describe('radius scaling', () => {
    it('should apply sqrt scale to managementEventCount for radius', () => {
      // Radius min=4px, max=20px, sqrt scale
      const bubbles: BubbleView[] = [
        {
          tradeId: 'b1',
          seq: 1,
          durationBaseCandles: 50,
          rMultiple: 1.0,
          managementEventCount: 0,
          ruleTitle: '',
          colorToken: 'var(--text-muted)',
        },
        {
          tradeId: 'b2',
          seq: 2,
          durationBaseCandles: 50,
          rMultiple: 1.0,
          managementEventCount: 4,
          ruleTitle: '',
          colorToken: 'var(--text-muted)',
        },
      ];
      fixture.componentRef.setInput('bubbles', bubbles);
      fixture.detectChanges();

      const circles = fixture.nativeElement.querySelectorAll('circle[data-bubble]');
      const r1 = parseFloat((circles[0] as SVGCircleElement).getAttribute('r') || '0');
      const r2 = parseFloat((circles[1] as SVGCircleElement).getAttribute('r') || '0');

      // Both should have radius between 4 and 20
      expect(r1).toBeGreaterThanOrEqual(4);
      expect(r1).toBeLessThanOrEqual(20);
      expect(r2).toBeGreaterThanOrEqual(4);
      expect(r2).toBeLessThanOrEqual(20);

      // r2 should be larger (sqrt(4) = 2 is larger)
      expect(r2).toBeGreaterThan(r1);
    });

    it('should clamp min radius to 4px', () => {
      const bubbles: BubbleView[] = [
        {
          tradeId: 'b1',
          seq: 1,
          durationBaseCandles: 10,
          rMultiple: 0.5,
          managementEventCount: 0,
          ruleTitle: '',
          colorToken: 'var(--text-muted)',
        },
      ];
      fixture.componentRef.setInput('bubbles', bubbles);
      fixture.detectChanges();

      const circle = fixture.nativeElement.querySelector('circle[data-bubble]');
      const r = parseFloat((circle as SVGCircleElement)?.getAttribute('r') || '0');
      expect(r).toBe(4);
    });

    it('should clamp max radius to 20px', () => {
      const bubbles: BubbleView[] = [
        {
          tradeId: 'b1',
          seq: 1,
          durationBaseCandles: 200,
          rMultiple: 3.0,
          managementEventCount: 100, // Very large
          ruleTitle: '',
          colorToken: 'var(--text-muted)',
        },
      ];
      fixture.componentRef.setInput('bubbles', bubbles);
      fixture.detectChanges();

      const circle = fixture.nativeElement.querySelector('circle[data-bubble]');
      const r = parseFloat(circle?.getAttribute('r'));
      expect(r).toBeLessThanOrEqual(20);
    });

    it('should maintain sqrt monotonicity for event count', () => {
      // Verify that radius increases monotonically with sqrt(events)
      const bubbles: BubbleView[] = [
        {
          tradeId: 'b1',
          seq: 1,
          durationBaseCandles: 50,
          rMultiple: 1.0,
          managementEventCount: 1,
          ruleTitle: '',
          colorToken: 'var(--text-muted)',
        },
        {
          tradeId: 'b2',
          seq: 2,
          durationBaseCandles: 50,
          rMultiple: 1.0,
          managementEventCount: 4,
          ruleTitle: '',
          colorToken: 'var(--text-muted)',
        },
        {
          tradeId: 'b3',
          seq: 3,
          durationBaseCandles: 50,
          rMultiple: 1.0,
          managementEventCount: 9,
          ruleTitle: '',
          colorToken: 'var(--text-muted)',
        },
      ];
      fixture.componentRef.setInput('bubbles', bubbles);
      fixture.detectChanges();

      const circles = fixture.nativeElement.querySelectorAll('circle[data-bubble]');
      const radii = Array.from(circles as unknown[]).map((c) =>
        parseFloat((c as SVGCircleElement).getAttribute('r') || '0'),
      );

      expect(radii[0]).toBeLessThan(radii[1]);
      expect(radii[1]).toBeLessThan(radii[2]);
    });
  });

  describe('color', () => {
    it('should apply colorToken to circle fill', () => {
      const bubbles: BubbleView[] = [
        {
          tradeId: 'b1',
          seq: 1,
          durationBaseCandles: 50,
          rMultiple: 1.0,
          managementEventCount: 2,
          ruleTitle: 'Rule A',
          colorToken: 'var(--rule-3)',
        },
      ];
      fixture.componentRef.setInput('bubbles', bubbles);
      fixture.detectChanges();

      const circle = fixture.nativeElement.querySelector('circle[data-bubble]');
      const fill = circle?.getAttribute('fill');
      expect(fill).toContain('--rule-3');
    });
  });

  describe('interactivity', () => {
    it('should emit tradeSelected when a bubble is clicked', () => {
      const tradeSelected = vi.fn();
      component.tradeSelected.subscribe(tradeSelected);

      const bubbles: BubbleView[] = [
        {
          tradeId: 'bubble-1',
          seq: 1,
          durationBaseCandles: 50,
          rMultiple: 1.5,
          managementEventCount: 2,
          ruleTitle: 'Rule A',
          colorToken: 'var(--rule-1)',
        },
      ];
      fixture.componentRef.setInput('bubbles', bubbles);
      fixture.detectChanges();

      const circle = fixture.nativeElement.querySelector('circle[data-bubble]');
      circle?.dispatchEvent(new MouseEvent('click'));

      expect(tradeSelected).toHaveBeenCalledWith('bubble-1');
    });

    it('should emit tradeSelected when Enter is pressed on focused bubble', () => {
      const tradeSelected = vi.fn();
      component.tradeSelected.subscribe(tradeSelected);

      const bubbles: BubbleView[] = [
        {
          tradeId: 'bubble-2',
          seq: 2,
          durationBaseCandles: 100,
          rMultiple: 2.0,
          managementEventCount: 5,
          ruleTitle: 'Rule B',
          colorToken: 'var(--rule-2)',
        },
      ];
      fixture.componentRef.setInput('bubbles', bubbles);
      fixture.detectChanges();

      const circle = fixture.nativeElement.querySelector('circle[data-bubble]');
      circle?.focus();
      circle?.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'Enter',
          bubbles: true,
        }),
      );

      expect(tradeSelected).toHaveBeenCalledWith('bubble-2');
    });

    it('should make bubbles focusable (tabindex=0)', () => {
      const bubbles: BubbleView[] = [
        {
          tradeId: 'b1',
          seq: 1,
          durationBaseCandles: 50,
          rMultiple: 1.0,
          managementEventCount: 2,
          ruleTitle: '',
          colorToken: 'var(--text-muted)',
        },
      ];
      fixture.componentRef.setInput('bubbles', bubbles);
      fixture.detectChanges();

      const circle = fixture.nativeElement.querySelector('circle[data-bubble]');
      expect(circle?.getAttribute('tabindex')).toBe('0');
    });
  });

  describe('tooltip', () => {
    it('should show tooltip on bubble hover', () => {
      const bubbles: BubbleView[] = [
        {
          tradeId: 'bubble-1',
          seq: 1,
          durationBaseCandles: 50,
          rMultiple: 1.5,
          managementEventCount: 2,
          ruleTitle: 'Rule A',
          colorToken: 'var(--rule-1)',
        },
      ];
      fixture.componentRef.setInput('bubbles', bubbles);
      fixture.detectChanges();

      const circle = fixture.nativeElement.querySelector('circle[data-bubble]');
      circle?.dispatchEvent(new MouseEvent('mouseenter'));
      fixture.detectChanges();

      const tooltip = fixture.nativeElement.querySelector('[data-tooltip]');
      expect(tooltip).toBeTruthy();
    });

    it('should format tooltip with duration, R, and event count', () => {
      const bubbles: BubbleView[] = [
        {
          tradeId: 'bubble-1',
          seq: 7,
          durationBaseCandles: 50,
          rMultiple: 1.5,
          managementEventCount: 3,
          ruleTitle: 'Breakout',
          colorToken: 'var(--rule-1)',
        },
      ];
      fixture.componentRef.setInput('bubbles', bubbles);
      fixture.detectChanges();

      const circle = fixture.nativeElement.querySelector('circle[data-bubble]');
      circle?.dispatchEvent(new MouseEvent('mouseenter'));
      fixture.detectChanges();

      const tooltip = fixture.nativeElement.querySelector('[data-tooltip]');
      const text = tooltip?.textContent || '';
      expect(text).toContain('#7');
      expect(text).toContain('50'); // duration
      expect(text).toContain('1.5'); // R
      expect(text).toContain('3'); // event count
      expect(text).toContain('Breakout');
    });

    it('should hide tooltip on mouseleave', () => {
      const bubbles: BubbleView[] = [
        {
          tradeId: 'bubble-1',
          seq: 1,
          durationBaseCandles: 50,
          rMultiple: 1.5,
          managementEventCount: 2,
          ruleTitle: 'Rule A',
          colorToken: 'var(--rule-1)',
        },
      ];
      fixture.componentRef.setInput('bubbles', bubbles);
      fixture.detectChanges();

      const circle = fixture.nativeElement.querySelector('circle[data-bubble]');
      circle?.dispatchEvent(new MouseEvent('mouseenter'));
      fixture.detectChanges();

      let tooltip = fixture.nativeElement.querySelector('[data-tooltip]');
      expect(tooltip).toBeTruthy();

      circle?.dispatchEvent(new MouseEvent('mouseleave'));
      fixture.detectChanges();

      tooltip = fixture.nativeElement.querySelector('[data-tooltip]');
      expect(tooltip).toBeFalsy();
    });
  });

  describe('empty state', () => {
    it('should render empty canvas when bubbles array is empty', () => {
      fixture.componentRef.setInput('bubbles', []);
      fixture.detectChanges();
      const svg = fixture.nativeElement.querySelector('svg');
      expect(svg).toBeTruthy();
      const circles = fixture.nativeElement.querySelectorAll('circle[data-bubble]');
      expect(circles.length).toBe(0);
    });
  });

  // T6 review fix wave (Finding 4): pin the bubble's cx for a known
  // durationBaseCandles so a future domain regression fails a test instead
  // of passing silently (the bubble's X domain was already correct per the
  // review, but it lacked a coordinate pin like the scatter now has).
  describe('coordinate mapping (Finding 4 pin)', () => {
    it('maps a known duration to a computable cx (single-bubble domain = max(duration, 500))', () => {
      // domainMaxX = max(250, 500) = 500 -> cx = 100 + (250/500)*650 = 425
      const bubbles: BubbleView[] = [
        {
          tradeId: 'b1',
          seq: 1,
          durationBaseCandles: 250,
          rMultiple: 0,
          managementEventCount: 0,
          ruleTitle: '',
          colorToken: 'var(--text-muted)',
        },
      ];
      fixture.componentRef.setInput('bubbles', bubbles);
      fixture.detectChanges();

      const circle = fixture.nativeElement.querySelector('circle[data-bubble]');
      expect(circle?.getAttribute('cx')).toBe('425');
    });

    it('maps a duration exceeding the 500 floor to a domain-fit cx', () => {
      // domainMaxX = max(1000) = 1000 -> cx = 100 + (1000/1000)*650 = 750
      const bubbles: BubbleView[] = [
        {
          tradeId: 'b1',
          seq: 1,
          durationBaseCandles: 1000,
          rMultiple: 0,
          managementEventCount: 0,
          ruleTitle: '',
          colorToken: 'var(--text-muted)',
        },
      ];
      fixture.componentRef.setInput('bubbles', bubbles);
      fixture.detectChanges();

      const circle = fixture.nativeElement.querySelector('circle[data-bubble]');
      expect(circle?.getAttribute('cx')).toBe('750');
    });
  });

  // T6 review fix wave (Finding 2): tooltip must appear on keyboard focus too.
  describe('focus tooltip (Finding 2)', () => {
    it('should show tooltip on bubble focus', () => {
      const bubbles: BubbleView[] = [
        {
          tradeId: 'bubble-1',
          seq: 1,
          durationBaseCandles: 50,
          rMultiple: 1.5,
          managementEventCount: 2,
          ruleTitle: 'Rule A',
          colorToken: 'var(--rule-1)',
        },
      ];
      fixture.componentRef.setInput('bubbles', bubbles);
      fixture.detectChanges();

      const circle = fixture.nativeElement.querySelector('circle[data-bubble]');
      circle?.dispatchEvent(new FocusEvent('focus'));
      fixture.detectChanges();

      const tooltip = fixture.nativeElement.querySelector('[data-tooltip]');
      expect(tooltip).toBeTruthy();
    });

    it('should hide tooltip on bubble blur', () => {
      const bubbles: BubbleView[] = [
        {
          tradeId: 'bubble-1',
          seq: 1,
          durationBaseCandles: 50,
          rMultiple: 1.5,
          managementEventCount: 2,
          ruleTitle: 'Rule A',
          colorToken: 'var(--rule-1)',
        },
      ];
      fixture.componentRef.setInput('bubbles', bubbles);
      fixture.detectChanges();

      const circle = fixture.nativeElement.querySelector('circle[data-bubble]');
      circle?.dispatchEvent(new FocusEvent('focus'));
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('[data-tooltip]')).toBeTruthy();

      circle?.dispatchEvent(new FocusEvent('blur'));
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('[data-tooltip]')).toBeFalsy();
    });
  });

  // T6 review fix wave (Finding 2): per-bubble aria-label enriched with the
  // same physical facts the tooltip shows, in Spanish.
  describe('per-bubble aria-label enrichment (Finding 2)', () => {
    it('includes seq, duration, R-multiple, event count, and rule title', () => {
      const bubbles: BubbleView[] = [
        {
          tradeId: 'bubble-1',
          seq: 7,
          durationBaseCandles: 50,
          rMultiple: 1.5,
          managementEventCount: 3,
          ruleTitle: 'Breakout',
          colorToken: 'var(--rule-1)',
        },
      ];
      fixture.componentRef.setInput('bubbles', bubbles);
      fixture.detectChanges();

      const circle = fixture.nativeElement.querySelector('circle[data-bubble]');
      expect(circle?.getAttribute('aria-label')).toBe(
        'Trade #7 · 50 velas · +1.50R · 3 eventos · Breakout',
      );
    });

    it('omits the rule segment when ruleTitle is empty', () => {
      const bubbles: BubbleView[] = [
        {
          tradeId: 'bubble-2',
          seq: 3,
          durationBaseCandles: 10,
          rMultiple: 0,
          managementEventCount: 0,
          ruleTitle: '',
          colorToken: 'var(--text-muted)',
        },
      ];
      fixture.componentRef.setInput('bubbles', bubbles);
      fixture.detectChanges();

      const circle = fixture.nativeElement.querySelector('circle[data-bubble]');
      expect(circle?.getAttribute('aria-label')).toBe('Trade #3 · 10 velas · +0.00R · 0 eventos');
    });
  });
});
