import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  computed,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ButtonDirective } from '../../components/ui/button.directive';
import { JournalDataService } from '../../services/journal-data.service';
import type { JournalSessionModel } from '../../state/journal/journal-read.models';
import {
  buildBehaviorFacts,
  buildBubbles,
  buildHeatmapCells,
  buildRulePerformanceRows,
  buildScatterPoints,
  buildSessionStatsView,
  buildTimeOfDayRows,
  buildTradeRows,
} from '../../state/journal/journal-read.models';
import { JournalHeaderComponent } from './journal-header.component';
import { PerformanceGridComponent } from './performance-grid.component';
import { ExecutionSectionComponent } from './execution-section.component';
import { BehaviorSectionComponent } from './behavior-section.component';
import { RulePerformanceTableComponent } from './rule-performance-table.component';
import { TimeOfDayTableComponent } from './time-of-day-table.component';
import { TradesTableComponent } from './trades-table.component';

type PageState = 'loading' | 'ready' | 'error';

/**
 * Journal page (RFC-016 D16.E) — the ONLY smart component of the surface
 * (component-architecture §1.1): loads the session read-model, computes
 * every builder's view rows, owns local UI state (rule filter, keyboard-
 * selected trade row) and the page-level keyboard map (design spec §1.9).
 *
 * J-6: reads `JournalDataService` (itself dispatch-free) and dispatches
 * NOTHING of its own — no `Store` injected here at all.
 *
 * Section order is INVIOLABLE (D16.E): Performance → Execution → Behavior →
 * Rule Performance → Time of Day → Trades — the template below preserves it
 * literally.
 */
@Component({
  selector: 'app-journal-page',
  standalone: true,
  imports: [
    RouterLink,
    ButtonDirective,
    JournalHeaderComponent,
    PerformanceGridComponent,
    ExecutionSectionComponent,
    BehaviorSectionComponent,
    RulePerformanceTableComponent,
    TimeOfDayTableComponent,
    TradesTableComponent,
  ],
  templateUrl: './journal-page.component.html',
  styleUrl: './journal-page.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class JournalPageComponent {
  private journalData = inject(JournalDataService);
  private router = inject(Router);

  /** Bound from the `:sessionId` route param (`withComponentInputBinding`, app.routes.ts). */
  sessionId = input.required<string>();

  state = signal<PageState>('loading');
  /** `protected` (not `private`): the template reads it directly (`model(); as m`). */
  protected model = signal<JournalSessionModel | null>(null);

  /** Rule id filtering the Trades table; `null` = no filter. Mirrors the
   * toggle owned locally by `RulePerformanceTableComponent`. */
  ruleFilter = signal<string | null>(null);
  /** Keyboard-selected trade row (↑↓); `null` = nothing selected yet. */
  selectedTradeId = signal<string | null>(null);

  private errorHeading = viewChild<ElementRef<HTMLHeadingElement>>('errorHeading');

  // ---- builder outputs (each a pure fn of the loaded model) ----
  statsView = computed(() => (this.model() ? buildSessionStatsView(this.model()!) : null));
  scatterPoints = computed(() => (this.model() ? buildScatterPoints(this.model()!) : []));
  bubbles = computed(() => (this.model() ? buildBubbles(this.model()!) : []));
  heatmapCells = computed(() => (this.model() ? buildHeatmapCells(this.model()!) : []));
  ruleRows = computed(() => (this.model() ? buildRulePerformanceRows(this.model()!) : []));
  timeOfDayRows = computed(() => (this.model() ? buildTimeOfDayRows(this.model()!) : []));
  tradeRows = computed(() => (this.model() ? buildTradeRows(this.model()!) : []));
  behaviorFacts = computed(() =>
    this.model() ? buildBehaviorFacts(this.model()!) : { replayJumps: 0, pauses: 0 },
  );

  /** Trades table rows AFTER the active rule filter — the same set the
   * keyboard's ↑↓ walks, kept in lockstep with what `TradesTableComponent`
   * actually renders (it applies the identical filter internally). */
  private visibleTradeRows = computed(() => {
    const filter = this.ruleFilter();
    const rows = this.tradeRows();
    return filter === null ? rows : rows.filter((r) => r.ruleId === filter);
  });

  sessionWithoutTrades = computed(() => (this.model()?.trades.length ?? 0) === 0);

  /** [from, to] UTC seconds of the session's trades, or null with zero trades. */
  dateRange = computed<{ from: number; to: number } | null>(() => {
    const trades = this.model()?.trades ?? [];
    if (!trades.length) return null;
    let from = trades[0].openTime;
    let to = trades[0].closeTime;
    for (const t of trades) {
      if (t.openTime < from) from = t.openTime;
      if (t.closeTime > to) to = t.closeTime;
    }
    return { from, to };
  });

  constructor() {
    effect(() => {
      const id = this.sessionId();
      void this.loadSession(id);
    });

    effect(() => {
      if (this.state() === 'error') {
        const el = this.errorHeading()?.nativeElement;
        if (el) queueMicrotask(() => el.focus());
      }
    });
  }

  private async loadSession(id: string): Promise<void> {
    this.state.set('loading');
    this.model.set(null);
    this.ruleFilter.set(null);
    this.selectedTradeId.set(null);
    try {
      const model = await this.journalData.loadSessionReadModel(id);
      this.model.set(model);
      this.state.set('ready');
    } catch {
      this.state.set('error');
    }
  }

  onRuleFilterToggled(ruleId: string | null): void {
    this.ruleFilter.set(ruleId);
  }

  onTradeSelected(tradeId: string): void {
    this.navigateToReflect(tradeId);
  }

  private navigateToReflect(tradeId: string): void {
    void this.router.navigate(['/journal', this.sessionId(), 'reflect', tradeId]);
  }

  /**
   * Page keyboard map (design spec §1.9): `↑↓` moves the keyboard-selected
   * Trades row (the only Journal table with row-level keyboard selection —
   * design spec §1.7's selected-row style is scoped to Trades, not Rule
   * Performance/Time of Day), `Enter` opens the Cabin for it, `Escape`
   * returns to the catalog. `Tab` is left untouched (native focus order
   * already satisfies "Tab between sections" — DESIGN_SYSTEM §5.3). NO
   * digit key is read here (Playbook hotkeys live only on the emulador page
   * host — R4).
   */
  @HostListener('window:keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    if (this.isTypingTarget(event.target)) return;
    switch (event.key) {
      case 'Escape':
        event.preventDefault();
        void this.router.navigate(['/sesiones']);
        break;
      case 'ArrowDown':
        event.preventDefault();
        this.moveSelection(1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.moveSelection(-1);
        break;
      case 'Enter': {
        const id = this.selectedTradeId();
        if (id !== null) {
          event.preventDefault();
          this.navigateToReflect(id);
        }
        break;
      }
      default:
        break;
    }
  }

  private isTypingTarget(target: EventTarget | null): boolean {
    return (
      target instanceof HTMLElement &&
      !!target.closest('input, textarea, select, [contenteditable]')
    );
  }

  /** Moves `selectedTradeId` by `delta` rows within the currently VISIBLE
   * (filtered) trade rows. Clamps at the ends (no wrap — no Journal-specific
   * spec for wrap; matches the Cabin's stated "sin wrap" trade-list behavior,
   * the closest documented analog). */
  private moveSelection(delta: number): void {
    const rows = this.visibleTradeRows();
    if (!rows.length) return;
    const currentId = this.selectedTradeId();
    const currentIndex = rows.findIndex((r) => r.tradeId === currentId);
    const nextIndex =
      currentIndex === -1
        ? delta > 0
          ? 0
          : rows.length - 1
        : Math.min(rows.length - 1, Math.max(0, currentIndex + delta));
    this.selectedTradeId.set(rows[nextIndex].tradeId);
  }
}
