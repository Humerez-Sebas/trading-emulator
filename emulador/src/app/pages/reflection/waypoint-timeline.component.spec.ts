import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { WaypointTimelineComponent } from './waypoint-timeline.component';
import type { Waypoint } from '../../domain/reflection/waypoints';

const entry: Waypoint = { slot: 1, time: 1000, facts: { entryPrice: 1.085 } };
const management2: Waypoint = {
  slot: 2,
  time: 1100,
  facts: {
    subEvents: [
      { seq: 1, kind: 'OrderModified', marketTime: 1100, payload: { field: 'sl', from: 1.08, to: 1.081 } },
      { seq: 2, kind: 'OrderModified', marketTime: 1200, payload: { field: 'tp', from: 1.09, to: 1.095 } },
    ],
  },
};
const management1: Waypoint = {
  slot: 2,
  time: 1100,
  facts: {
    subEvents: [
      { seq: 1, kind: 'OrderModified', marketTime: 1100, payload: { field: 'sl', from: 1.08, to: 1.081 } },
    ],
  },
};
const mae: Waypoint = { slot: 3, time: 1300, facts: { excursion: 0.001, excursionR: 0.5 } };
const exit: Waypoint = { slot: 5, time: 2000, facts: { profit: 200, rMultiple: 2 } };

describe('WaypointTimelineComponent', () => {
  function mount(waypoints: Waypoint[], activeIndex = 0) {
    TestBed.configureTestingModule({ imports: [WaypointTimelineComponent] });
    const fixture = TestBed.createComponent(WaypointTimelineComponent);
    fixture.componentRef.setInput('waypoints', waypoints);
    fixture.componentRef.setInput('activeIndex', activeIndex);
    fixture.detectChanges();
    return fixture;
  }

  it('renders one tab per PRESENT waypoint, absent slots produce no node (node-without-data = absent, not grayed)', () => {
    const fixture = mount([entry, mae, exit]); // no Management
    const tabs = fixture.nativeElement.querySelectorAll('[role="tab"]');
    expect(tabs).toHaveLength(3);
    expect([...tabs].map((t: HTMLElement) => t.textContent?.trim())).toEqual(['Entry', 'MAE', 'Exit']);
  });

  it('uses role=tablist/tab/aria-selected (DESIGN_SYSTEM §5.4)', () => {
    const fixture = mount([entry, exit], 1);
    expect(fixture.nativeElement.querySelector('[role="tablist"]')).toBeTruthy();
    const tabs: HTMLElement[] = fixture.nativeElement.querySelectorAll('[role="tab"]');
    expect(tabs[0].getAttribute('aria-selected')).toBe('false');
    expect(tabs[1].getAttribute('aria-selected')).toBe('true');
  });

  it('marks the active node (matching activeIndex, an ARRAY index) with the "active" class', () => {
    const fixture = mount([entry, mae, exit], 1);
    const tabs: HTMLElement[] = fixture.nativeElement.querySelectorAll('.node');
    expect(tabs[0].classList.contains('active')).toBe(false);
    expect(tabs[1].classList.contains('active')).toBe(true);
    expect(tabs[2].classList.contains('active')).toBe(false);
  });

  it('emits waypointSelected with the clicked ARRAY index', () => {
    const fixture = mount([entry, mae, exit]);
    let selected: number | null = null;
    fixture.componentInstance.waypointSelected.subscribe((i: number) => (selected = i));
    const tabs: HTMLButtonElement[] = fixture.nativeElement.querySelectorAll('.node');
    tabs[2].click();
    expect(selected).toBe(2);
  });

  it('shows NO expand toggle when Management has < 2 sub-events', () => {
    const fixture = mount([entry, management1, exit]);
    expect(fixture.nativeElement.querySelector('.expand-toggle')).toBeNull();
  });

  it('shows an expand toggle when Management has >= 2 sub-events; clicking expands the sub-timeline and emits managementExpanded(true)', () => {
    const fixture = mount([entry, management2, exit]);
    let expandedEmitted: boolean | null = null;
    fixture.componentInstance.managementExpanded.subscribe((v: boolean) => (expandedEmitted = v));
    const toggle: HTMLButtonElement = fixture.nativeElement.querySelector('.expand-toggle');
    expect(toggle).toBeTruthy();
    toggle.click();
    fixture.detectChanges();
    expect(expandedEmitted).toBe(true);
    const subNodes = fixture.nativeElement.querySelectorAll('.sub-node');
    expect(subNodes).toHaveLength(2);
  });

  it('sub-node labels show field/from→to geometry, never a tighten/widen judgment word (N-1)', () => {
    const fixture = mount([entry, management2, exit]);
    fixture.nativeElement.querySelector('.expand-toggle').click();
    fixture.detectChanges();
    const subNodes: HTMLElement[] = fixture.nativeElement.querySelectorAll('.sub-node');
    expect(subNodes[0].textContent).toContain('SL');
    expect(subNodes[0].textContent).toContain('→');
    expect(subNodes[0].textContent).not.toMatch(/tighten|widen|apretar|ensanchar/i);
  });

  it('collapse() (called externally, e.g. by the page on Escape) hides the sub-timeline and emits managementExpanded(false)', () => {
    const fixture = mount([entry, management2, exit]);
    fixture.nativeElement.querySelector('.expand-toggle').click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.sub-timeline')).toBeTruthy();

    let expandedEmitted: boolean | null = null;
    fixture.componentInstance.managementExpanded.subscribe((v: boolean) => (expandedEmitted = v));
    fixture.componentInstance.collapse();
    fixture.detectChanges();

    expect(expandedEmitted).toBe(false);
    expect(fixture.nativeElement.querySelector('.sub-timeline')).toBeNull();
  });

  it('ArrowRight/ArrowLeft move the active sub-node within the expansion, stopping propagation', () => {
    const fixture = mount([entry, management2, exit]);
    fixture.nativeElement.querySelector('.expand-toggle').click();
    fixture.detectChanges();
    expect(fixture.componentInstance.activeSubIndex()).toBe(0);

    const subTimeline: HTMLElement = fixture.nativeElement.querySelector('.sub-timeline');
    const rightEvent = new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true });
    const stopSpy = { called: false };
    rightEvent.stopPropagation = () => (stopSpy.called = true);
    subTimeline.dispatchEvent(rightEvent);
    fixture.detectChanges();
    expect(fixture.componentInstance.activeSubIndex()).toBe(1);
    expect(stopSpy.called).toBe(true);
  });

  it('Escape inside the expansion collapses it (and stops propagation, so the page listener does not also fire)', () => {
    const fixture = mount([entry, management2, exit]);
    fixture.nativeElement.querySelector('.expand-toggle').click();
    fixture.detectChanges();

    const subTimeline: HTMLElement = fixture.nativeElement.querySelector('.sub-timeline');
    const escEvent = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    const stopSpy = { called: false };
    escEvent.stopPropagation = () => (stopSpy.called = true);
    subTimeline.dispatchEvent(escEvent);
    fixture.detectChanges();

    expect(fixture.componentInstance.expanded()).toBe(false);
    expect(stopSpy.called).toBe(true);
  });

  it('fused MAE-into-Exit: Exit waypoint carries mergedMae facts (rendering is WaypointFactsComponent\'s concern; timeline just shows the single fused Exit node)', () => {
    const fusedExit: Waypoint = {
      slot: 5,
      time: 2000,
      facts: { profit: 200, rMultiple: 2, mergedMae: { excursion: 0.001, excursionR: 0.5, time: 1990 } },
    };
    const fixture = mount([entry, fusedExit]);
    const tabs = fixture.nativeElement.querySelectorAll('[role="tab"]');
    expect(tabs).toHaveLength(2); // Entry + fused Exit — no separate MAE node
  });
});
