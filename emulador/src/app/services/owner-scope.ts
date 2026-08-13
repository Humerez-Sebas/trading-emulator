/**
 * Owner scoping of the LOCAL user-workspace storage (Session Sovereignty V2).
 *
 * WHY THIS EXISTS. IndexedDB is origin-scoped; Supabase RLS is owner-scoped.
 * Before this module the two never met: `emulador-workspaces` held one user's
 * sessions/folders under a constant database name, logout cleared nothing, and
 * a second account signing in on the same browser profile received a COMPLETE,
 * CORRECT, EMPTY pull. `mergeByLww` gives absence a destructive meaning (D1),
 * so every session the first account had synced was deleted locally — and the
 * `flushDirty` that runs right after uploaded whatever survived under the
 * SECOND account's `owner_id`. See `SESSION_SOVEREIGNTY_RFC.md`.
 *
 * THE SPLIT. The fix is NOT to rename `emulador-workspaces`: three of its six
 * stores (`candles`, `datasets`, `series`) are Market-Data domain (invariant 3)
 * — a shared, re-downloadable cache whose M1 ingestion costs ~700 s per
 * symbol-year, and which the Angular-free ingestion worker and
 * `IndexedDbMarketDataRepository` open by that exact name with no version.
 * Instead the USER-owned stores move to a per-owner database, so the physical
 * layout finally matches the domain boundary the architecture always claimed:
 *
 *   emulador-workspaces            (unchanged, v6) → market data, shared cache
 *     └─ meta / folders / sync     → QUARANTINE: legacy rows, never read as
 *                                    live state, never written, never deleted
 *   emulador-workspace-<ownerId>   (v1)            → this user's workspace
 *
 * The quarantine is not an extra mechanism — it is what "stop reading those
 * stores" leaves behind, byte for byte. That is why legacy data survives O-7's
 * "never auto-discard" without a copy step.
 *
 * Angular-free on purpose (mirrors `market-data-db.ts`): pure names and pure
 * decisions, so the adoption rule can be unit-tested without DI or IndexedDB.
 */

/** Schema version of a per-owner workspace database. */
export const USER_DB_VERSION = 1;

/**
 * Name of the per-owner workspace database. The owner id is a Supabase user
 * UUID; it is not a secret (it is already in the JWT this origin stores) and it
 * is used verbatim so the mapping is inspectable in devtools during support.
 */
export function ownerWorkspaceDbName(ownerId: string): string {
  return `emulador-workspace-${ownerId}`;
}

/** Name of the per-owner playbook database (RFC-015's DB, owner-scoped). */
export function ownerPlaybookDbName(ownerId: string): string {
  return `emulador-playbook-${ownerId}`;
}

/** Name of the per-owner lessons database (RFC-016's DB, owner-scoped). */
export function ownerLessonsDbName(ownerId: string): string {
  return `emulador-lessons-${ownerId}`;
}

/**
 * Key of the adoption marker inside the OWNER partition's `sync` store.
 *
 * It lives in the owner partition, never in the quarantine: adoption must not
 * write a single byte into the legacy stores, or "recoverable" would depend on
 * the correctness of the very code that claims records out of it.
 */
export const ADOPTION_MARKER_KEY = 'legacyAdoption';

/** Records which quarantined keys this owner has already claimed. */
export interface AdoptionMarker {
  key: typeof ADOPTION_MARKER_KEY;
  /** `meta` store keys (symbols) already adopted by this owner. */
  metaKeys: string[];
  /** `folders` store keys (folder ids) already adopted by this owner. */
  folderKeys: string[];
  updatedAt: number;
}

/** Thrown by every user-owned storage operation when no owner can be resolved. */
export const NO_OWNER_MESSAGE =
  'Sin sesión de usuario: el espacio de trabajo local no está disponible.';

/**
 * Decides which quarantined records the current owner may claim.
 *
 * OWNER POLICY O-7, encoded literally:
 *  - never auto-adopt on ambiguity → a record is claimed ONLY when it carries
 *    only ids that the RLS-scoped cloud answer proves belong to this owner
 *    (remote-ID correlation). Every meaningful id must be proven; no ids or
 *    any unproven id means the whole record remains ambiguous.
 *  - never auto-discard → callers only ADD to the owner partition; nothing in
 *    this decision can delete anything.
 *  - never let B overwrite A → a key the owner partition already holds is
 *    excluded, so a claim can only fill a hole, never replace live state.
 *  - retryable → `alreadyAdopted` (not "attempted") is what suppresses a
 *    second claim, so a record that could not be proven today is reconsidered
 *    on the next login, when the pull may finally contain its cloud row. An
 *    offline first login therefore delays adoption instead of losing it.
 *
 * Deliberately per-record, not per-partition: one browser profile may have
 * hosted two accounts, so proving that ONE record belongs to this owner proves
 * nothing about its neighbours.
 *
 * Pure. `provenIds` must be the complete RLS-scoped id set — the caller is
 * responsible for having refused a truncated page (`assertCompletePull`)
 * before calling, otherwise "not proven" could mean "not sent".
 */
export function decideAdoption<T>(
  quarantined: readonly T[],
  keyOf: (record: T) => string,
  idsOf: (record: T) => readonly (string | null | undefined)[],
  provenIds: ReadonlySet<string>,
  ownedKeys: ReadonlySet<string>,
  alreadyAdopted: ReadonlySet<string>,
): T[] {
  if (!provenIds.size) return [];
  const claimed: T[] = [];
  for (const record of quarantined) {
    const key = keyOf(record);
    if (ownedKeys.has(key) || alreadyAdopted.has(key)) continue;
    const ids = idsOf(record).filter((id): id is string => id != null);
    if (ids.length > 0 && ids.every((id) => provenIds.has(id))) claimed.push(record);
  }
  return claimed;
}
