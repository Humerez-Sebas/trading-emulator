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
import { Store } from '@ngrx/store';
import { ButtonDirective } from '../../components/ui/button.directive';
import { JournalDataService } from '../../services/journal-data.service';
import type { JournalSessionModel } from '../../state/journal/journal-read.models';
import { buildTradeRows } from '../../state/journal/journal-read.models';
import { computeWaypoints, type Waypoint, type WaypointSlot } from '../../domain/reflection/waypoints';
import { buildSceneSpec } from '../../domain/reflection/build-scene-spec';
import { MAX_EVIDENCE_SCENES, type SceneSpec } from '../../domain/reflection/scene-spec';
import { LessonsActions } from '../../state/lessons/lessons.actions';
import type { Lesson } from '../../state/lessons/lessons.models';
import { PlaybookActions } from '../../state/playbook/playbook.actions';
import { selectActiveRules } from '../../state/playbook/playbook.selectors';
import type { ClosedTrade } from '../../state/trading/trading.models';
import { CabinBreadcrumbComponent } from './cabin-breadcrumb.component';
import { CabinTradeListComponent } from './cabin-trade-list.component';
import { WaypointTimelineComponent } from './waypoint-timeline.component';
import { FrozenSceneHostComponent } from './frozen-scene-host.component';
import { WaypointFactsComponent } from './waypoint-facts.component';
import { LessonFormComponent, type LessonDraft } from './lesson-form.component';

type PageState = 'loading' | 'no-trades' | 'error' | 'ready';

/**
 * Reflection Cabin page (RFC-016 D16.D/F/G) — the ONLY smart component of
 * this surface (component-architecture §2.1): loads the SAME
 * `JournalSessionModel` as the Journal via `JournalDataService` ("one
 * loader, two surfaces" — never re-derives stats), runs the scene pipeline
 * (`computeWaypoints` → `buildSceneSpec`), owns the page-level keyboard map,
 * and is the ONLY place in `pages/reflection/**` that dispatches to the
 * Store — `LessonsActions.*` + `PlaybookActions.amendRule` ONLY (J-6).
 *
 * Route params: `:sessionId` (required) + optional `:tradeId` — absent or
 * unresolvable (stale link) both fall back to the first trade (RFC §6),
 * never a dead end.
 */
@Component({
  selector: 'app-reflection-cabin-page',
  standalone: true,
  imports: [
    RouterLink,
    ButtonDirective,
    CabinBreadcrumbComponent,
    CabinTradeListComponent,
    WaypointTimelineComponent,
    FrozenSceneHostComponent,
    WaypointFactsComponent,
    LessonFormComponent,
  ],
  templateUrl: './reflection-cabin-page.component.html',
  styleUrl: './reflection-cabin-page.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReflectionCabinPageComponent {
  private journalData = inject(JournalDataService);
  private store = inject(Store);
  private router = inject(Router);

  /** Bound from the `:sessionId` route param (`withComponentInputBinding`). */
  sessionId = input.required<string>();
  /** Bound from the optional `:tradeId` route param; absent on the no-tradeId route. */
  tradeId = input<string | undefined>(undefined);

  state = signal<PageState>('loading');
  /** `protected` (not `private`): the template reads it directly. */
  protected model = signal<JournalSessionModel | null>(null);

  /** Array index into `waypoints()` (NOT a slot number — see WaypointTimelineComponent's doc). */
  activeWaypointIndex = signal(0);
  managementExpandedSignal = signal(false);
  saving = signal(false);
  toastMessage = signal<string | null>(null);

  private timeline = viewChild(WaypointTimelineComponent);
  private heading = viewChild<ElementRef<HTMLHeadingElement>>('pageHeading');

  activeRules = this.store.selectSignal(selectActiveRules);

  /** Same view rows the Journal's Trades table renders (incl. `hasReflection`) —
   * `CabinTradeRow` is a structural subset of `TradeRowView`, so no re-mapping. */
  tradeRows = computed(() => (this.model() ? buildTradeRows(this.model()!) : []));

  /** The active trade id: the requested `:tradeId` when it resolves within
   * THIS session's rows, else the first trade (covers both "absent" and a
   * stale/invalid id — never a dead end, RFC §6). */
  resolvedTradeId = computed<string | null>(() => {
    const rows = this.tradeRows();
    if (!rows.length) return null;
    const requested = this.tradeId();
    if (requested && rows.some((r) => r.tradeId === requested)) return requested;
    return rows[0].tradeId;
  });

  activeTradeIndex1based = computed(() => {
    const rows = this.tradeRows();
    const idx = rows.findIndex((r) => r.tradeId === this.resolvedTradeId());
    return idx === -1 ? 1 : idx + 1;
  });

  activeTrade = computed<ClosedTrade | null>(() => {
    const id = this.resolvedTradeId();
    if (!id) return null;
    return this.model()?.trades.find((t) => t.id === id) ?? null;
  });

  waypoints = computed<Waypoint[]>(() => {
    const trade = this.activeTrade();
    const m = this.model();
    if (!trade || !m) return [];
    return computeWaypoints(trade, m.telemetry, m.baseTfSeconds);
  });

  activeWaypoint = computed<Waypoint | null>(() => this.waypoints()[this.activeWaypointIndex()] ?? null);

  scene = computed<SceneSpec | null>(() => {
    const trade = this.activeTrade();
    const wp = this.activeWaypoint();
    const m = this.model();
    if (!trade || !wp || !m) return null;
    return buildSceneSpec(
      trade,
      wp,
      { symbol: m.symbol, datasetRefs: m.datasetRefs, baseTfSeconds: m.baseTfSeconds },
      m.telemetry,
    );
  });

  existingLesson = computed<Lesson | null>(() => {
    const id = this.resolvedTradeId();
    const m = this.model();
    if (!id || !m) return null;
    return m.lessonByTradeRef[id] ?? null;
  });

  constructor() {
    effect(() => {
      const id = this.sessionId();
      void this.loadSession(id);
    });

    // The active trade changed (route nav or trade-list click) — reset the
    // waypoint selection to Entry and collapse any open management expansion.
    effect(() => {
      this.resolvedTradeId();
      this.activeWaypointIndex.set(0);
      this.managementExpandedSignal.set(false);
    });

    // DESIGN_SYSTEM §5.3: page navigation sets focus to the main heading.
    effect(() => {
      if (this.state() !== 'loading') {
        const el = this.heading()?.nativeElement;
        if (el) queueMicrotask(() => el.focus());
      }
    });
  }

  private async loadSession(id: string): Promise<void> {
    this.state.set('loading');
    this.model.set(null);
    this.activeWaypointIndex.set(0);
    this.managementExpandedSignal.set(false);
    try {
      const model = await this.journalData.loadSessionReadModel(id);
      this.model.set(model);
      this.state.set(model.trades.length === 0 ? 'no-trades' : 'ready');
    } catch {
      this.state.set('error');
    }
  }

  onTradeSelected(tradeId: string): void {
    void this.navigateToTrade(tradeId);
  }

  onWaypointSelected(index: number): void {
    this.activeWaypointIndex.set(index);
  }

  onManagementExpanded(expanded: boolean): void {
    this.managementExpandedSignal.set(expanded);
  }

  onBack(): void {
    void this.router.navigate(['/journal', this.sessionId()]);
  }

  onPrev(): void {
    this.moveTrade(-1);
  }

  onNext(): void {
    this.moveTrade(1);
  }

  /**
   * Save flow (design spec §2.5): mints `id`/`authoredAt`/`clientUpdatedAt`
   * HERE (purity — reducers stay clock-free), freezes evidence via deep copy
   * (J-3), dispatches `createLesson`/`updateLesson` + ONE `amendRule` PER
   * linked rule (J-6: the only dispatches this whole surface makes), then
   * toasts + redirects to the Journal.
   */
  onSave(draft: LessonDraft): void {
    const trade = this.activeTrade();
    const m = this.model();
    if (!trade || !m) return;

    this.saving.set(true);
    const now = Date.now();
    const existing = this.existingLesson();

    const lesson: Lesson = existing
      ? {
          ...existing,
          whatHappened: draft.whatHappened,
          repeat: draft.repeat,
          avoid: draft.avoid,
          linkedRuleIds: draft.linkedRuleIds,
          clientUpdatedAt: now,
        }
      : {
          id: crypto.randomUUID(),
          authoredAt: now,
          whatHappened: draft.whatHappened,
          repeat: draft.repeat,
          avoid: draft.avoid,
          linkedRuleIds: draft.linkedRuleIds,
          evidence: this.freezeEvidence(trade, m),
          tradeRefs: [trade.id],
          sessionRef: this.sessionId(),
          clientUpdatedAt: now,
        };

    if (existing) {
      this.store.dispatch(
        LessonsActions.updateLesson({
          id: existing.id,
          whatHappened: draft.whatHappened,
          repeat: draft.repeat,
          avoid: draft.avoid,
          linkedRuleIds: draft.linkedRuleIds,
          clientUpdatedAt: now,
        }),
      );
    } else {
      this.store.dispatch(LessonsActions.createLesson({ lesson }));
    }

    for (const ruleId of draft.linkedRuleIds) {
      this.store.dispatch(PlaybookActions.amendRule({ ruleId, lessonId: lesson.id, clientUpdatedAt: now }));
    }

    // Local optimistic patch: the ✎ mark / `reflection-existing` prefill show
    // up immediately without a re-fetch. `JournalDataService`'s cache is
    // dropped so the NEXT Journal load re-reads fresh data (incl. amended
    // Playbook rule titles/amendments) instead of this stale-by-construction
    // snapshot.
    this.model.update((cur) =>
      cur ? { ...cur, lessonByTradeRef: { ...cur.lessonByTradeRef, [trade.id]: lesson } } : cur,
    );
    this.journalData.clear();

    this.saving.set(false);
    this.toastMessage.set('Reflexión guardada');
    setTimeout(() => void this.router.navigate(['/journal', this.sessionId()]), 600);
  }

  /** Deep-copies the trade's CURRENT waypoint scenes (cap `MAX_EVIDENCE_SCENES`)
   * so later session/telemetry state changes can never mutate a saved lesson (J-3). */
  private freezeEvidence(trade: ClosedTrade, m: JournalSessionModel): SceneSpec[] {
    const wps = computeWaypoints(trade, m.telemetry, m.baseTfSeconds);
    const sessionMeta = { symbol: m.symbol, datasetRefs: m.datasetRefs, baseTfSeconds: m.baseTfSeconds };
    const scenes = wps.slice(0, MAX_EVIDENCE_SCENES).map((wp) => buildSceneSpec(trade, wp, sessionMeta, m.telemetry));
    return structuredClone(scenes);
  }

  private navigateToTrade(tradeId: string): void {
    void this.router.navigate(['/journal', this.sessionId(), 'reflect', tradeId]);
  }

  /** ↑↓/←→ trade navigation (design spec §2.2/§2.6), no wrap at either end. */
  private moveTrade(delta: number): void {
    const rows = this.tradeRows();
    const idx = rows.findIndex((r) => r.tradeId === this.resolvedTradeId());
    if (idx === -1) return;
    const next = idx + delta;
    if (next < 0 || next >= rows.length) return;
    this.navigateToTrade(rows[next].tradeId);
  }

  /** Fixed slot map (design spec §2.3): absent slot = no-op — keys never recompact. */
  private selectWaypointBySlot(slot: WaypointSlot): void {
    const idx = this.waypoints().findIndex((w) => w.slot === slot);
    if (idx === -1) return;
    this.activeWaypointIndex.set(idx);
  }

  /**
   * ONE page keyboard map (design spec §2.6, component-architecture §2.2):
   * `↑↓`/`←→` trade nav (no wrap) · `1`-`5` waypoint by FIXED slot · `Escape`
   * → Journal, UNLESS the management sub-timeline is expanded, in which case
   * it collapses first (design spec §2.3) · `Tab` is native (untouched).
   * `Enter`-saves comes for free from `LessonFormComponent`'s native
   * `<form>`/submit-button semantics — no digit/arrow interception is needed
   * there since `isTypingTarget` below excludes textareas from this switch
   * entirely (digits type text, obviously). R4: digits 1-5 are listened ONLY
   * here — the Playbook's hotkeys directive lives solely on the emulador page.
   */
  @HostListener('window:keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.handleEscape();
      return;
    }
    if (this.isTypingTarget(event.target)) return;
    switch (event.key) {
      case 'ArrowUp':
      case 'ArrowLeft':
        event.preventDefault();
        this.moveTrade(-1);
        break;
      case 'ArrowDown':
      case 'ArrowRight':
        event.preventDefault();
        this.moveTrade(1);
        break;
      case '1':
      case '2':
      case '3':
      case '4':
      case '5':
        event.preventDefault();
        this.selectWaypointBySlot(Number(event.key) as WaypointSlot);
        break;
      default:
        break;
    }
  }

  private handleEscape(): void {
    if (this.managementExpandedSignal()) {
      this.timeline()?.collapse();
      this.managementExpandedSignal.set(false);
      return;
    }
    void this.router.navigate(['/journal', this.sessionId()]);
  }

  private isTypingTarget(target: EventTarget | null): boolean {
    return target instanceof HTMLElement && !!target.closest('input, textarea, select, [contenteditable]');
  }
}
