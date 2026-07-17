import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { Waypoint } from '../../domain/reflection/waypoints';
import type { TimeElapsedBeforeOrderPayload } from '../../state/telemetry/telemetry.models';

interface ManagementSubEvent {
  seq: number;
  marketTime: number | null;
  payload: { field: 'sl' | 'tp' | 'entry'; from: number | null; to: number | null };
}

interface ExcursionFacts {
  excursion: number;
  excursionR: number | null;
  time?: number;
}

/** One row rendered by the facts panel: label + value, always `tabular-nums`. */
interface FactRow {
  label: string;
  value: string;
}

function fmtPrice(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return String(Math.round(value * 100000) / 100000);
}

function fmtR(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}R`;
}

function fmtHHmm(unixSeconds: number | undefined): string {
  if (unixSeconds === undefined) return '—';
  const d = new Date(unixSeconds * 1000);
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

function fmtMs(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

/**
 * Facts panel under the timeline (design spec §2.3): per-node physical facts,
 * `tabular-nums`, ONLY what would have been visible at that moment (Entry
 * shows no result, no future data — already enforced upstream by
 * `computeWaypoints`, this component just renders whatever `facts` shape it's
 * given for the active waypoint's slot).
 */
@Component({
  selector: 'app-waypoint-facts',
  standalone: true,
  template: `
    <dl class="waypoint-facts" [attr.id]="waypoint() ? 'wp-panel-' + waypoint()!.slot : null">
      @for (row of rows(); track row.label) {
        <div class="fact-row">
          <dt>{{ row.label }}</dt>
          <dd>{{ row.value }}</dd>
        </div>
      }
    </dl>
  `,
  styles: `
    .waypoint-facts {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-4);
      margin: 0;
      padding: var(--density-pad) 0;
    }
    .fact-row {
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 10ch;
    }
    dt {
      font-size: var(--text-2xs);
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.03em;
    }
    dd {
      margin: 0;
      font-size: var(--density-metric);
      color: var(--text);
      font-variant-numeric: tabular-nums;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WaypointFactsComponent {
  waypoint = input<Waypoint | null>(null);

  rows = computed<FactRow[]>(() => {
    const wp = this.waypoint();
    if (!wp) return [];
    switch (wp.slot) {
      case 1:
        return this.entryRows(wp);
      case 2:
        return this.managementRows(wp);
      case 3:
        return this.excursionRows(wp.facts as ExcursionFacts, wp.time, 'Excursión adversa');
      case 4:
        return this.excursionRows(wp.facts as ExcursionFacts, wp.time, 'Excursión favorable');
      case 5:
        return this.exitRows(wp);
      default:
        return [];
    }
  });

  private entryRows(wp: Waypoint): FactRow[] {
    const f = wp.facts as {
      entryPrice: number;
      riskDistancePrice: number;
      riskDistanceR: number;
      elapsedBeforeOrder?: TimeElapsedBeforeOrderPayload;
    };
    const rows: FactRow[] = [
      { label: 'Precio de entrada', value: fmtPrice(f.entryPrice) },
      { label: 'Riesgo inicial', value: `${fmtPrice(f.riskDistancePrice)} (${f.riskDistanceR.toFixed(2)}R)` },
      { label: 'Hora', value: fmtHHmm(wp.time) },
    ];
    if (f.elapsedBeforeOrder) {
      rows.push({
        label: 'Tiempo antes de la orden',
        value: `${fmtMs(f.elapsedBeforeOrder.playingMs)} activo · ${fmtMs(f.elapsedBeforeOrder.pausedMs)} en pausa · ${f.elapsedBeforeOrder.candlesRevealed} velas`,
      });
    }
    return rows;
  }

  private managementRows(wp: Waypoint): FactRow[] {
    const subEvents = ((wp.facts as { subEvents?: ManagementSubEvent[] }).subEvents ?? []) as ManagementSubEvent[];
    return subEvents.map((sub, i) => ({
      label: subEvents.length > 1 ? `Evento ${i + 1}` : 'Evento',
      value: `${sub.payload.field.toUpperCase()} ${fmtPrice(sub.payload.from)} → ${fmtPrice(sub.payload.to)} · ${fmtHHmm(sub.marketTime ?? undefined)}`,
    }));
  }

  private excursionRows(facts: ExcursionFacts, time: number, label: string): FactRow[] {
    return [
      { label, value: fmtR(facts.excursionR) },
      { label: 'Hora', value: fmtHHmm(time) },
    ];
  }

  private exitRows(wp: Waypoint): FactRow[] {
    const f = wp.facts as {
      profit: number;
      rMultiple: number;
      grossProfit?: number;
      commission?: number;
      mergedMae?: ExcursionFacts;
      mergedMfe?: ExcursionFacts;
    };
    const rows: FactRow[] = [
      { label: 'Resultado neto', value: `${f.profit >= 0 ? '+' : ''}${f.profit.toFixed(2)}` },
      { label: 'R', value: fmtR(f.rMultiple) },
      { label: 'Costes', value: f.commission !== undefined ? f.commission.toFixed(2) : '—' },
      { label: 'Hora', value: fmtHHmm(wp.time) },
    ];
    if (f.mergedMae) {
      rows.push({ label: 'Excursión adversa (MAE)', value: fmtR(f.mergedMae.excursionR) });
    }
    if (f.mergedMfe) {
      rows.push({ label: 'Excursión favorable (MFE)', value: fmtR(f.mergedMfe.excursionR) });
    }
    return rows;
  }
}
