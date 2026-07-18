import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import type { Waypoint, WaypointSlot } from '../../domain/reflection/waypoints';

/** Fixed Spanish/English-loanword labels per node slot (RFC §4/design spec §2.3
 * verbatim — "Entry · Management · MAE · MFE · Exit" is the literal wording
 * used by both the RFC and the design spec, kept as-is rather than inventing
 * a translation that could drift into judgment vocabulary). */
const SLOT_LABELS: Record<WaypointSlot, string> = {
  1: 'Entry',
  2: 'Management',
  3: 'MAE',
  4: 'MFE',
  5: 'Exit',
};

interface ManagementSubEvent {
  seq: number;
  kind: 'OrderModified' | 'PositionModified';
  marketTime: number | null;
  payload: { field: 'sl' | 'tp' | 'entry'; from: number | null; to: number | null };
}

/** `field` code shown uppercase per the design spec's literal example ("SL
 * 1.0842 → 1.0851 · 14:32") — geometry only, never a tighten/widen judgment
 * label (N-1). */
function fieldCode(field: string): string {
  return field.toUpperCase();
}

/**
 * Waypoint timeline (design spec §2.3, DESIGN_SYSTEM §4.5 verbatim). Horizontal
 * row of PRESENT waypoints (absent slots are simply missing from the input
 * array — no gray placeholder, §3.2 `node-without-data`). `activeIndex` is an
 * ARRAY index into `waypoints()` (not a slot number) — the page resolves
 * digit-key presses to an array index by looking up `.slot` (fixed map,
 * absent slot = no-op) before setting it.
 *
 * `role="tablist"`/`role="tab"`/`aria-selected` per DESIGN_SYSTEM §5.4.
 * Management sub-timeline keyboard (←→ sub-nodes, Escape collapses) is
 * handled LOCALLY via `(keydown)` + `stopPropagation()` on the expansion —
 * "internal template, not a separate component" (component-architecture
 * §2.1) — so it never reaches the page's single global `window:keydown`
 * listener for those three keys. The page's own Escape handling ("collapses
 * first" — design spec §2.3) instead calls `collapse()` directly (a public
 * method, via `viewChild`) BEFORE falling back to navigating to the Journal,
 * covering the case where Escape is pressed while focus is NOT on a sub-node.
 */
@Component({
  selector: 'app-waypoint-timeline',
  standalone: true,
  template: `
    <div class="waypoint-timeline">
      <div class="nodes" role="tablist" aria-label="Línea de tiempo del trade">
        <div class="connector-line" aria-hidden="true"></div>
        @for (wp of waypoints(); track wp.slot; let i = $index) {
          <button
            type="button"
            role="tab"
            [id]="'wp-tab-' + wp.slot"
            [attr.aria-selected]="i === activeIndex()"
            [attr.aria-controls]="'wp-panel-' + wp.slot"
            class="node"
            [class.active]="i === activeIndex()"
            (click)="select(i)"
          >
            <span class="dot" aria-hidden="true"></span>
            <span class="label">{{ labelFor(wp.slot) }}</span>
          </button>
          @if (wp.slot === 2 && subEventsOf(wp).length >= 2) {
            <button
              type="button"
              class="expand-toggle"
              [attr.aria-expanded]="expanded()"
              [attr.aria-label]="
                expanded() ? 'Colapsar eventos de gestión' : 'Expandir eventos de gestión'
              "
              (click)="toggleExpanded(wp)"
            >
              {{ expanded() ? '▾' : '▸' }}
            </button>
          }
        }
      </div>

      @if (expanded() && managementWaypoint(); as mgmt) {
        <div
          class="sub-timeline"
          role="group"
          aria-label="Eventos de gestión"
          (keydown)="onSubKeydown($event)"
        >
          @for (sub of subEventsOf(mgmt); track sub.seq; let si = $index) {
            <button
              type="button"
              class="sub-node"
              [class.active]="si === activeSubIndex()"
              [tabindex]="si === activeSubIndex() ? 0 : -1"
              (click)="selectSub(si)"
            >
              {{ subLabel(sub) }}
            </button>
          }
        </div>
      }
    </div>
  `,
  styles: `
    .waypoint-timeline {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
    }
    .nodes {
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: var(--space-6);
      padding: var(--space-2) 0;
    }
    .connector-line {
      position: absolute;
      left: 5%;
      right: 5%;
      top: 50%;
      height: 2px;
      background: var(--timeline-connector);
      z-index: 0;
    }
    .node {
      position: relative;
      z-index: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--space-1);
      background: transparent;
      border: none;
      cursor: pointer;
      color: var(--text-muted);
      font-size: var(--density-font);
    }
    .dot {
      width: 10px;
      height: 10px;
      border-radius: var(--radius-full);
      background: var(--timeline-connector);
    }
    .node.active .dot {
      background: var(--accent);
      box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 40%, transparent);
    }
    .node.active {
      color: var(--text);
    }
    /* dotted vertical connector down toward the frozen scene (design spec §2.3) */
    .node.active .dot::after {
      content: '';
      position: absolute;
      top: 16px;
      left: 3px;
      width: 0;
      height: 14px;
      border-left: 2px dotted var(--timeline-connector);
    }
    .expand-toggle {
      background: transparent;
      border: none;
      color: var(--text-muted);
      cursor: pointer;
      font-size: var(--text-xs);
    }
    .sub-timeline {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
      padding-inline-start: var(--space-4);
    }
    .sub-node {
      font-size: var(--text-2xs);
      color: var(--text-muted);
      background: var(--surface-2);
      border: 1px solid var(--border);
      border-radius: var(--radius-xs);
      padding: 2px var(--space-2);
      cursor: pointer;
      font-variant-numeric: tabular-nums;
    }
    .sub-node.active {
      color: var(--text);
      border-color: var(--accent);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WaypointTimelineComponent {
  waypoints = input.required<Waypoint[]>();
  /** Array index into `waypoints()`. */
  activeIndex = input.required<number>();

  waypointSelected = output<number>();
  managementExpanded = output<boolean>();

  expanded = signal(false);
  activeSubIndex = signal(0);

  managementWaypoint = computed(() => this.waypoints().find((w) => w.slot === 2) ?? null);

  labelFor(slot: WaypointSlot): string {
    return SLOT_LABELS[slot];
  }

  subEventsOf(wp: Waypoint): ManagementSubEvent[] {
    return ((wp.facts as { subEvents?: ManagementSubEvent[] }).subEvents ??
      []) as ManagementSubEvent[];
  }

  subLabel(sub: ManagementSubEvent): string {
    const time = sub.marketTime !== null ? formatHHmm(sub.marketTime) : '—';
    const from = formatPrice(sub.payload.from);
    const to = formatPrice(sub.payload.to);
    return `${fieldCode(sub.payload.field)} ${from} → ${to} · ${time}`;
  }

  select(index: number): void {
    this.waypointSelected.emit(index);
  }

  toggleExpanded(managementWp: Waypoint): void {
    if (this.subEventsOf(managementWp).length < 2) return;
    const next = !this.expanded();
    this.expanded.set(next);
    this.activeSubIndex.set(0);
    this.managementExpanded.emit(next);
  }

  /** Called by the PAGE (via `viewChild`) for the "Escape collapses management
   * first" rule (design spec §2.3) — a no-op when not expanded. */
  collapse(): void {
    if (!this.expanded()) return;
    this.expanded.set(false);
    this.managementExpanded.emit(false);
  }

  selectSub(index: number): void {
    this.activeSubIndex.set(index);
  }

  onSubKeydown(event: KeyboardEvent): void {
    const mgmt = this.managementWaypoint();
    if (!mgmt) return;
    const count = this.subEventsOf(mgmt).length;
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      event.stopPropagation();
      this.activeSubIndex.set(Math.min(count - 1, this.activeSubIndex() + 1));
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      event.stopPropagation();
      this.activeSubIndex.set(Math.max(0, this.activeSubIndex() - 1));
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.collapse();
    }
  }
}

function formatHHmm(unixSeconds: number): string {
  const d = new Date(unixSeconds * 1000);
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

function formatPrice(value: number | null): string {
  if (value === null) return '—';
  return value
    .toFixed(Math.abs(value) < 100 ? 5 : 2)
    .replace(/0+$/, '')
    .replace(/\.$/, '');
}
