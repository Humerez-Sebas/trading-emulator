/* eslint-disable @angular-eslint/prefer-inject -- constructor inject()-defaults keep this service unit-testable via direct construction (new Service(deps)) without TestBed; see services design note. */
import { inject, Injectable } from '@angular/core';
import { SupabaseService } from '../auth/supabase.service';
import { assertNoCandles, assertPayloadSize } from './session-sync.mapping';
import type {
  CloudFolderRow,
  CloudSessionRow,
  SessionPayloadV1,
  SessionSummary,
} from './session-sync.models';

/**
 * Supabase CRUD boundary for session sync (Task 8). Pure I/O — no merge/LWW
 * logic lives here (that's Task 9's `WorkspaceDbService`/sync orchestrator).
 * Last-Write-Wins is enforced by a BEFORE UPDATE trigger in Postgres, so
 * `upsertSession`/`upsertFolder` are plain `upsert(row, { onConflict: 'id' })`
 * calls — no RPC, no WHERE clause needed; the trigger silently keeps the
 * newer row when a stale write loses the race.
 */
@Injectable({ providedIn: 'root' })
export class SessionSyncService {
  constructor(private readonly supabase: SupabaseService = inject(SupabaseService)) {}

  private get client() {
    return this.supabase.client;
  }

  /** The authenticated user's id, required as `owner_id` on every upsert (no DB default; RLS rejects otherwise). */
  private async currentUserId(): Promise<string> {
    const { data } = await this.client.auth.getSession();
    const id = data.session?.user?.id;
    if (!id) throw new Error('No hay sesión activa.');
    return id;
  }

  /** Lightweight session list for the Sessions UI — selects every column except `payload`. */
  async listSummaries(): Promise<SessionSummary[]> {
    const { data, error } = await this.client
      .from('sessions')
      .select(
        'id,name,symbol,folder_id,client_updated_at,last_opened_at,required_datasets,trades_count,initial_balance,balance,cursor,schema_version,summary',
      );
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as Record<string, unknown>[];
    return rows.map((r) => {
      const summary = r['summary'] as { winRate?: number; sparkline?: number[] } | null | undefined;
      return {
        id: r['id'] as string,
        name: r['name'] as string,
        symbol: r['symbol'] as string,
        folderId: r['folder_id'] as string | null,
        schemaVersion: r['schema_version'] as number,
        updatedAt: r['client_updated_at'] as string,
        lastOpenedAt: r['last_opened_at'] as string | null,
        requiredDatasets: (r['required_datasets'] as SessionSummary['requiredDatasets']) ?? [],
        tradeCount: r['trades_count'] as number,
        initialBalance: Number(r['initial_balance']),
        balance: Number(r['balance']),
        cursor: Number(r['cursor']),
        winRate: summary?.winRate,
        sparkline: summary?.sparkline,
      };
    });
  }

  /** Fetches the full lossless payload for one session (the column `listSummaries` deliberately omits). */
  async fetchPayload(id: string): Promise<SessionPayloadV1> {
    const { data, error } = await this.client
      .from('sessions')
      .select('payload')
      .eq('id', id)
      .single();
    if (error) throw new Error(error.message);
    return (data as { payload: SessionPayloadV1 }).payload;
  }

  /**
   * Upserts a session row. Validates the payload (no candles, under the 2 MB
   * cap) BEFORE any network call, then sets `owner_id` from the authenticated
   * session and writes snake_case columns. `updated_at` is intentionally
   * omitted — the server trigger owns it.
   */
  async upsertSession(row: CloudSessionRow): Promise<void> {
    assertNoCandles(row.payload);
    assertPayloadSize(row.payload);

    const owner_id = await this.currentUserId();
    const dbRow = {
      id: row.id,
      owner_id,
      symbol: row.symbol,
      name: row.name,
      folder_id: row.folderId,
      schema_version: row.schemaVersion,
      trades_count: row.tradeCount,
      initial_balance: row.initialBalance,
      balance: row.balance,
      cursor: row.cursor,
      created_at: new Date(row.createdAt).toISOString(),
      client_updated_at: new Date(row.clientUpdatedAt).toISOString(),
      last_opened_at: row.lastOpenedAt == null ? null : new Date(row.lastOpenedAt).toISOString(),
      required_datasets: row.requiredDatasets,
      summary: { winRate: row.winRate, sparkline: row.sparkline },
      payload: row.payload,
    };

    const { error } = await this.client.from('sessions').upsert(dbRow, { onConflict: 'id' });
    if (error) throw new Error(error.message);
  }

  async deleteSession(id: string): Promise<void> {
    const { error } = await this.client.from('sessions').delete().eq('id', id);
    if (error) throw new Error(error.message);
  }

  /** Lists all folders for the current user (RLS-scoped server-side). */
  async listFolders(): Promise<CloudFolderRow[]> {
    const { data, error } = await this.client
      .from('folders')
      .select('id,name,sort,client_updated_at');
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as Record<string, unknown>[];
    return rows.map((r) => ({
      id: r['id'] as string,
      name: r['name'] as string,
      sort: r['sort'] as number,
      clientUpdatedAt: new Date(r['client_updated_at'] as string).getTime(),
    }));
  }

  async upsertFolder(row: CloudFolderRow): Promise<void> {
    const owner_id = await this.currentUserId();
    const dbRow = {
      id: row.id,
      owner_id,
      name: row.name,
      sort: row.sort,
      client_updated_at: new Date(row.clientUpdatedAt).toISOString(),
    };
    const { error } = await this.client.from('folders').upsert(dbRow, { onConflict: 'id' });
    if (error) throw new Error(error.message);
  }

  async deleteFolder(id: string): Promise<void> {
    const { error } = await this.client.from('folders').delete().eq('id', id);
    if (error) throw new Error(error.message);
  }
}
