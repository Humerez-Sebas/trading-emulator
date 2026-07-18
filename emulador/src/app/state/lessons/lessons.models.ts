import type { SceneSpec } from '../../domain/reflection/scene-spec';

/**
 * A trader-authored heuristic linking physical evidence to Playbook amendments
 * (RFC-016 §2, D16.G). The three text fields are OPAQUE to the system (D16.G):
 * trader-authored categories with zero system interpretation (N-6, S1).
 * Empty strings are valid (partial lessons are valid, S2).
 *
 * LWW per-row sync (RFC-016 §3): clientUpdatedAt is minted at dispatch site
 * (never in reducer), syncedAt advanced only by sync handler.
 */
export interface Lesson {
  /** Unique identifier, typically UUID. */
  id: string;
  /** Moment the lesson was created (UTC milliseconds, dispatch site clock). */
  authoredAt: number;
  /** Free-form trader text: "What happened?" field (may be empty string). */
  whatHappened: string;
  /** Free-form trader text: "What should I repeat?" field (may be empty string). */
  repeat: string;
  /** Free-form trader text: "What should I avoid?" field (may be empty string). */
  avoid: string;
  /** IDs of PlaybookRules this lesson amends (first writers to amendments field, P-7). */
  linkedRuleIds: string[];
  /** Frozen scene evidence: SceneSpecs captured at lesson creation (max 5, J-2). */
  evidence: SceneSpec[];
  /** Best-effort references to closed trades (may become stale if trades deleted). */
  tradeRefs: string[];
  /** Session this lesson belongs to (used for Journal read models, J-5/J-6). */
  sessionRef: string;
  /** LWW: local edit timestamp (minted at dispatch, stamp-only in reducer). D15.F parity. */
  clientUpdatedAt?: number;
  /** LWW: pushed-to-cloud timestamp (advanced only by sync handler, D15.F). */
  syncedAt?: number;
}

/**
 * Feature state for lessons (RFC-016 Task 2, J-1..J-5). REQUIRED fields
 * (createFeature rejects optionals here; optionals only inside Lesson row).
 */
export interface LessonsState {
  /** All persisted lessons. */
  lessons: Lesson[];
  /** Whether the lessons have been hydrated from local DB (bootstrap guard). */
  loaded: boolean;
}
