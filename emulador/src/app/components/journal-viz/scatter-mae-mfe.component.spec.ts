import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ScatterMaeMfeComponent } from './scatter-mae-mfe.component';
import type { ScatterPointView } from '../../state/journal/journal-read.models';

describe('ScatterMaeMfeComponent', () => {
  let component: ScatterMaeMfeComponent;
  let fixture: ComponentFixture<ScatterMaeMfeComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ScatterMaeMfeComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(ScatterMaeMfeComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    fixture.destroy();
  });

  describe('DOM structure', () => {
    it('should render an SVG element', () => {
      fixture.componentRef.setInput('points', []);
      fixture.detectChanges();
      const svg = fixture.nativeElement.querySelector('svg');
      expect(svg).toBeTruthy();
    });

    it('should have aria-label describing the visualization', () => {
      fixture.componentRef.setInput('points', []);
      fixture.detectChanges();
      const svg = fixture.nativeElement.querySelector('svg');
      expect(svg?.getAttribute('aria-label')).toBeTruthy();
    });

    it('should render one circle per input point', () => {
      const points: ScatterPointView[] = [
        {
          tradeId: 'trade-1',
          seq: 1,
          maeR: 0.5,
          mfeR: 1.0,
          rMultiple: 1.5,
          openTime: 1000000,
          ruleTitle: 'Rule A',
          colorToken: 'var(--rule-1)',
        },
        {
          tradeId: 'trade-2',
          seq: 2,
          maeR: -0.3,
          mfeR: 2.5,
          rMultiple: 2.0,
          openTime: 2000000,
          ruleTitle: 'Rule B',
          colorToken: 'var(--rule-2)',
        },
      ];
      fixture.componentRef.setInput('points', points);
      fixture.detectChanges();
      const circles = fixture.nativeElement.querySelectorAll('circle[data-point]');
      expect(circles.length).toBe(2);
    });

    it('should render no circles when points array is empty', () => {
      fixture.componentRef.setInput('points', []);
      fixture.detectChanges();
      const circles = fixture.nativeElement.querySelectorAll('circle[data-point]');
      expect(circles.length).toBe(0);
    });

    it('should render identity line (x=y dashed reference)', () => {
      const points: ScatterPointView[] = [
        {
          tradeId: 'trade-1',
          seq: 1,
          maeR: 0.5,
          mfeR: 1.0,
          rMultiple: 1.5,
          openTime: 1000000,
          ruleTitle: '',
          colorToken: 'var(--text-muted)',
        },
      ];
      fixture.componentRef.setInput('points', points);
      fixture.detectChanges();
      const identityLine = fixture.nativeElement.querySelector('line[data-line="identity"]');
      expect(identityLine).toBeTruthy();
      expect(identityLine?.getAttribute('stroke-dasharray')).toBeTruthy();
    });

    it('should render origin axes (x=0 and y=0 lines)', () => {
      const points: ScatterPointView[] = [
        {
          tradeId: 'trade-1',
          seq: 1,
          maeR: 0.5,
          mfeR: 1.0,
          rMultiple: 1.5,
          openTime: 1000000,
          ruleTitle: '',
          colorToken: 'var(--text-muted)',
        },
      ];
      fixture.componentRef.setInput('points', points);
      fixture.detectChanges();
      const xAxis = fixture.nativeElement.querySelector('line[data-axis="x"]');
      const yAxis = fixture.nativeElement.querySelector('line[data-axis="y"]');
      expect(xAxis).toBeTruthy();
      expect(yAxis).toBeTruthy();
    });
  });

  describe('point styling', () => {
    it('should apply colorToken to circle fill as CSS variable', () => {
      const points: ScatterPointView[] = [
        {
          tradeId: 'trade-1',
          seq: 1,
          maeR: 0.5,
          mfeR: 1.0,
          rMultiple: 1.5,
          openTime: 1000000,
          ruleTitle: 'Rule A',
          colorToken: 'var(--rule-1)',
        },
      ];
      fixture.componentRef.setInput('points', points);
      fixture.detectChanges();
      const circle = fixture.nativeElement.querySelector('circle[data-point]');
      const fill = circle?.getAttribute('fill');
      // Should use the colorToken directly (CSS variable will be resolved at render time)
      expect(fill).toContain('--rule-1');
    });

    it('should set radius to 6px and opacity to 0.85', () => {
      const points: ScatterPointView[] = [
        {
          tradeId: 'trade-1',
          seq: 1,
          maeR: 0.5,
          mfeR: 1.0,
          rMultiple: 1.5,
          openTime: 1000000,
          ruleTitle: '',
          colorToken: 'var(--text-muted)',
        },
      ];
      fixture.componentRef.setInput('points', points);
      fixture.detectChanges();
      const circle = fixture.nativeElement.querySelector('circle[data-point]');
      expect(circle?.getAttribute('r')).toBe('6');
      expect(circle?.getAttribute('opacity')).toBe('0.85');
    });
  });

  describe('interactivity', () => {
    it('should emit tradeSelected with tradeId when a point is clicked', () => {
      const tradeSelected = vi.fn();
      component.tradeSelected.subscribe(tradeSelected);

      const points: ScatterPointView[] = [
        {
          tradeId: 'trade-1',
          seq: 1,
          maeR: 0.5,
          mfeR: 1.0,
          rMultiple: 1.5,
          openTime: 1000000,
          ruleTitle: 'Rule A',
          colorToken: 'var(--rule-1)',
        },
      ];
      fixture.componentRef.setInput('points', points);
      fixture.detectChanges();

      const circle = fixture.nativeElement.querySelector('circle[data-point]');
      circle?.dispatchEvent(new MouseEvent('click'));

      expect(tradeSelected).toHaveBeenCalledWith('trade-1');
    });

    it('should emit tradeSelected when point is focused and Enter is pressed', () => {
      const tradeSelected = vi.fn();
      component.tradeSelected.subscribe(tradeSelected);

      const points: ScatterPointView[] = [
        {
          tradeId: 'trade-2',
          seq: 2,
          maeR: 0.3,
          mfeR: 0.8,
          rMultiple: 1.0,
          openTime: 2000000,
          ruleTitle: 'Rule B',
          colorToken: 'var(--rule-2)',
        },
      ];
      fixture.componentRef.setInput('points', points);
      fixture.detectChanges();

      const circle = fixture.nativeElement.querySelector('circle[data-point]');
      circle?.focus();
      circle?.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'Enter',
          bubbles: true,
        }),
      );

      expect(tradeSelected).toHaveBeenCalledWith('trade-2');
    });

    it('should make points focusable (tabindex=0)', () => {
      const points: ScatterPointView[] = [
        {
          tradeId: 'trade-1',
          seq: 1,
          maeR: 0.5,
          mfeR: 1.0,
          rMultiple: 1.5,
          openTime: 1000000,
          ruleTitle: '',
          colorToken: 'var(--text-muted)',
        },
      ];
      fixture.componentRef.setInput('points', points);
      fixture.detectChanges();

      const circle = fixture.nativeElement.querySelector('circle[data-point]');
      expect(circle?.getAttribute('tabindex')).toBe('0');
    });
  });

  describe('tooltip', () => {
    it('should show tooltip on point hover', () => {
      const points: ScatterPointView[] = [
        {
          tradeId: 'trade-1',
          seq: 1,
          maeR: 0.5,
          mfeR: 1.0,
          rMultiple: 1.5,
          openTime: 1704067200, // 2024-01-01T00:00:00Z
          ruleTitle: 'Rule A',
          colorToken: 'var(--rule-1)',
        },
      ];
      fixture.componentRef.setInput('points', points);
      fixture.detectChanges();

      const circle = fixture.nativeElement.querySelector('circle[data-point]');
      circle?.dispatchEvent(new MouseEvent('mouseenter'));
      fixture.detectChanges();

      const tooltip = fixture.nativeElement.querySelector('[data-tooltip]');
      expect(tooltip).toBeTruthy();
    });

    it('should format tooltip as "#seq · date · ±R · ruleTitle"', () => {
      const points: ScatterPointView[] = [
        {
          tradeId: 'trade-1',
          seq: 12,
          maeR: 0.5,
          mfeR: 1.0,
          rMultiple: 1.5,
          openTime: 1704067200, // 2024-01-01T00:00:00Z
          ruleTitle: 'Ruptura de rango',
          colorToken: 'var(--rule-1)',
        },
      ];
      fixture.componentRef.setInput('points', points);
      fixture.detectChanges();

      const circle = fixture.nativeElement.querySelector('circle[data-point]');
      circle?.dispatchEvent(new MouseEvent('mouseenter'));
      fixture.detectChanges();

      const tooltip = fixture.nativeElement.querySelector('[data-tooltip]');
      const text = tooltip?.textContent || '';
      expect(text).toContain('#12');
      expect(text).toContain('2024-01-01'); // or ISO date format
      expect(text).toContain('1.5'); // rMultiple
      expect(text).toContain('Ruptura de rango');
    });

    it('should omit rule part when ruleTitle is empty', () => {
      const points: ScatterPointView[] = [
        {
          tradeId: 'trade-1',
          seq: 5,
          maeR: 0.2,
          mfeR: 0.8,
          rMultiple: 0.5,
          openTime: 1704067200,
          ruleTitle: '',
          colorToken: 'var(--text-muted)',
        },
      ];
      fixture.componentRef.setInput('points', points);
      fixture.detectChanges();

      const circle = fixture.nativeElement.querySelector('circle[data-point]');
      circle?.dispatchEvent(new MouseEvent('mouseenter'));
      fixture.detectChanges();

      const tooltip = fixture.nativeElement.querySelector('[data-tooltip]');
      const text = tooltip?.textContent || '';
      expect(text).toContain('#5');
      // Should not have a trailing separator
      expect(text).not.toMatch(/·\s*$/);
    });

    it('should hide tooltip on mouseleave', () => {
      const points: ScatterPointView[] = [
        {
          tradeId: 'trade-1',
          seq: 1,
          maeR: 0.5,
          mfeR: 1.0,
          rMultiple: 1.5,
          openTime: 1704067200,
          ruleTitle: 'Rule A',
          colorToken: 'var(--rule-1)',
        },
      ];
      fixture.componentRef.setInput('points', points);
      fixture.detectChanges();

      const circle = fixture.nativeElement.querySelector('circle[data-point]');
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
    it('should render empty canvas when points array is empty', () => {
      fixture.componentRef.setInput('points', []);
      fixture.detectChanges();
      const svg = fixture.nativeElement.querySelector('svg');
      expect(svg).toBeTruthy();
      const circles = fixture.nativeElement.querySelectorAll('circle[data-point]');
      expect(circles.length).toBe(0);
    });
  });

  // T6 review fix wave (Finding 1 + Finding 4): MAE_R/MFE_R are always >= 0
  // (fill-engine clamps excursions to >=0 over a positive risk distance), so
  // the scale must use a non-negative, data-fit domain per axis with the
  // origin pinned at the bottom-left corner — pinning cx/cy for known inputs
  // makes a future domain regression fail a test instead of passing silently.
  describe('coordinate mapping (non-negative data-fit domain)', () => {
    it('places a (0,0) point exactly at the visible origin (bottom-left corner)', () => {
      const points: ScatterPointView[] = [
        {
          tradeId: 'trade-origin',
          seq: 1,
          maeR: 0,
          mfeR: 0,
          rMultiple: 0,
          openTime: 1000000,
          ruleTitle: '',
          colorToken: 'var(--text-muted)',
        },
      ];
      fixture.componentRef.setInput('points', points);
      fixture.detectChanges();

      const circle = fixture.nativeElement.querySelector('circle[data-point]');
      expect(circle?.getAttribute('cx')).toBe('100');
      expect(circle?.getAttribute('cy')).toBe('550');
    });

    it('maps mid-domain and max-domain points to computable coordinates (asymmetric MAE/MFE domains)', () => {
      // domainMaxX = max(MIN_AXIS_DOMAIN=1, 0.5, 1.0) = 1.0
      // domainMaxY = max(MIN_AXIS_DOMAIN=1, 1.0, 2.0) = 2.0
      const points: ScatterPointView[] = [
        {
          tradeId: 'trade-mid',
          seq: 1,
          maeR: 0.5,
          mfeR: 1.0,
          rMultiple: 1.0,
          openTime: 1000000,
          ruleTitle: '',
          colorToken: 'var(--text-muted)',
        },
        {
          tradeId: 'trade-max',
          seq: 2,
          maeR: 1.0,
          mfeR: 2.0,
          rMultiple: 2.0,
          openTime: 1000000,
          ruleTitle: '',
          colorToken: 'var(--text-muted)',
        },
      ];
      fixture.componentRef.setInput('points', points);
      fixture.detectChanges();

      const circles = fixture.nativeElement.querySelectorAll('circle[data-point]');
      // trade-mid: cx = 100 + (0.5/1.0)*650 = 425; cy = 550 - (1.0/2.0)*500 = 300
      expect(circles[0].getAttribute('cx')).toBe('425');
      expect(circles[0].getAttribute('cy')).toBe('300');
      // trade-max: cx = 100 + (1.0/1.0)*650 = 750; cy = 550 - (2.0/2.0)*500 = 50
      expect(circles[1].getAttribute('cx')).toBe('750');
      expect(circles[1].getAttribute('cy')).toBe('50');
    });

    it('draws the MFE=0 (x) axis at the bottom edge, spanning the full plot width', () => {
      const points: ScatterPointView[] = [
        {
          tradeId: 'trade-1',
          seq: 1,
          maeR: 0.5,
          mfeR: 1.0,
          rMultiple: 1.0,
          openTime: 1000000,
          ruleTitle: '',
          colorToken: 'var(--text-muted)',
        },
      ];
      fixture.componentRef.setInput('points', points);
      fixture.detectChanges();

      const xAxis = fixture.nativeElement.querySelector('line[data-axis="x"]');
      expect(xAxis?.getAttribute('x1')).toBe('100');
      expect(xAxis?.getAttribute('y1')).toBe('550');
      expect(xAxis?.getAttribute('x2')).toBe('750');
      expect(xAxis?.getAttribute('y2')).toBe('550');
    });

    it('draws the MAE=0 (y) axis at the left edge, spanning the full plot height', () => {
      const points: ScatterPointView[] = [
        {
          tradeId: 'trade-1',
          seq: 1,
          maeR: 0.5,
          mfeR: 1.0,
          rMultiple: 1.0,
          openTime: 1000000,
          ruleTitle: '',
          colorToken: 'var(--text-muted)',
        },
      ];
      fixture.componentRef.setInput('points', points);
      fixture.detectChanges();

      const yAxis = fixture.nativeElement.querySelector('line[data-axis="y"]');
      expect(yAxis?.getAttribute('x1')).toBe('100');
      expect(yAxis?.getAttribute('y1')).toBe('50');
      expect(yAxis?.getAttribute('x2')).toBe('100');
      expect(yAxis?.getAttribute('y2')).toBe('550');
    });

    it('draws the identity line from the origin to the smaller of the two axis domains', () => {
      // domainMaxX = 1.0, domainMaxY = 2.0 -> identityDomain = min = 1.0
      // end point: cx = scaleX(1.0) = 750, cy = scaleY(1.0) = 550 - (1/2)*500 = 300
      const points: ScatterPointView[] = [
        {
          tradeId: 'trade-mid',
          seq: 1,
          maeR: 0.5,
          mfeR: 1.0,
          rMultiple: 1.0,
          openTime: 1000000,
          ruleTitle: '',
          colorToken: 'var(--text-muted)',
        },
        {
          tradeId: 'trade-max',
          seq: 2,
          maeR: 1.0,
          mfeR: 2.0,
          rMultiple: 2.0,
          openTime: 1000000,
          ruleTitle: '',
          colorToken: 'var(--text-muted)',
        },
      ];
      fixture.componentRef.setInput('points', points);
      fixture.detectChanges();

      const identityLine = fixture.nativeElement.querySelector('line[data-line="identity"]');
      expect(identityLine?.getAttribute('x1')).toBe('100');
      expect(identityLine?.getAttribute('y1')).toBe('550');
      expect(identityLine?.getAttribute('x2')).toBe('750');
      expect(identityLine?.getAttribute('y2')).toBe('300');
    });

    it('clamps negative or out-of-domain values on-canvas instead of drawing off-canvas', () => {
      const points: ScatterPointView[] = [
        {
          tradeId: 'trade-neg',
          seq: 1,
          maeR: -5, // defensive: should never occur per fill-engine invariant, but must not crash/clip
          mfeR: -5,
          rMultiple: -1,
          openTime: 1000000,
          ruleTitle: '',
          colorToken: 'var(--text-muted)',
        },
      ];
      fixture.componentRef.setInput('points', points);
      fixture.detectChanges();

      const circle = fixture.nativeElement.querySelector('circle[data-point]');
      const cx = parseFloat(circle?.getAttribute('cx') || '0');
      const cy = parseFloat(circle?.getAttribute('cy') || '0');
      expect(cx).toBeGreaterThanOrEqual(100);
      expect(cx).toBeLessThanOrEqual(750);
      expect(cy).toBeGreaterThanOrEqual(50);
      expect(cy).toBeLessThanOrEqual(550);
    });
  });

  // T6 review fix wave (Finding 2): tooltip must appear on keyboard focus too,
  // not only mouse hover ("mouse never required" per brief).
  describe('focus tooltip (Finding 2)', () => {
    it('should show tooltip on point focus', () => {
      const points: ScatterPointView[] = [
        {
          tradeId: 'trade-1',
          seq: 1,
          maeR: 0.5,
          mfeR: 1.0,
          rMultiple: 1.5,
          openTime: 1704067200,
          ruleTitle: 'Rule A',
          colorToken: 'var(--rule-1)',
        },
      ];
      fixture.componentRef.setInput('points', points);
      fixture.detectChanges();

      const circle = fixture.nativeElement.querySelector('circle[data-point]');
      circle?.dispatchEvent(new FocusEvent('focus'));
      fixture.detectChanges();

      const tooltip = fixture.nativeElement.querySelector('[data-tooltip]');
      expect(tooltip).toBeTruthy();
    });

    it('should hide tooltip on point blur', () => {
      const points: ScatterPointView[] = [
        {
          tradeId: 'trade-1',
          seq: 1,
          maeR: 0.5,
          mfeR: 1.0,
          rMultiple: 1.5,
          openTime: 1704067200,
          ruleTitle: 'Rule A',
          colorToken: 'var(--rule-1)',
        },
      ];
      fixture.componentRef.setInput('points', points);
      fixture.detectChanges();

      const circle = fixture.nativeElement.querySelector('circle[data-point]');
      circle?.dispatchEvent(new FocusEvent('focus'));
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('[data-tooltip]')).toBeTruthy();

      circle?.dispatchEvent(new FocusEvent('blur'));
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('[data-tooltip]')).toBeFalsy();
    });
  });

  // T6 review fix wave (Finding 2): per-point aria-label enriched from bare
  // "Trade N" to the same physical facts the tooltip shows, in Spanish.
  describe('per-point aria-label enrichment (Finding 2)', () => {
    it('includes seq, date, R-multiple, and rule title in the accessible name', () => {
      const points: ScatterPointView[] = [
        {
          tradeId: 'trade-1',
          seq: 12,
          maeR: 0.5,
          mfeR: 1.0,
          rMultiple: 1.5,
          openTime: 1704067200, // 2024-01-01T00:00:00Z
          ruleTitle: 'Ruptura de rango',
          colorToken: 'var(--rule-1)',
        },
      ];
      fixture.componentRef.setInput('points', points);
      fixture.detectChanges();

      const circle = fixture.nativeElement.querySelector('circle[data-point]');
      expect(circle?.getAttribute('aria-label')).toBe(
        'Trade #12 · 2024-01-01 · +1.50R · Ruptura de rango',
      );
    });

    it('omits the rule segment when ruleTitle is empty', () => {
      const points: ScatterPointView[] = [
        {
          tradeId: 'trade-1',
          seq: 5,
          maeR: 0.2,
          mfeR: 0.8,
          rMultiple: -0.5,
          openTime: 1704067200,
          ruleTitle: '',
          colorToken: 'var(--text-muted)',
        },
      ];
      fixture.componentRef.setInput('points', points);
      fixture.detectChanges();

      const circle = fixture.nativeElement.querySelector('circle[data-point]');
      expect(circle?.getAttribute('aria-label')).toBe('Trade #5 · 2024-01-01 · -0.50R');
    });
  });
});
