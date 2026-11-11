-- RFC-016 Task 3: lessons table, RLS, and per-row LWW guard.
-- Table shape, RLS policies, and trigger mirror supabase/playbook_rules.sql
-- (RFC-015 Task 4) verbatim in structure, including the D15.F UPDATE
-- `with check` hardening. Application to the live Supabase project is done
-- via the Supabase MCP (apply_migration) or the owner's dashboard — never
-- assumed applied by CI (see task-3-report.md). Applying this SQL is the
-- ORCHESTRATOR's job, never the implementer's.
--
-- Column naming decision (pre-adjudicated in the implementation plan):
-- the domain field `Lesson.repeat` maps to SQL column `repeat_field`.
-- `repeat` is not on the Postgres 17 RESERVED keyword list (it is a builtin
-- function name, technically usable unquoted as a column), but `repeat_field`
-- is used anyway to keep every consumer (PostgREST select strings, this
-- trigger, ad-hoc scripts) trivially unambiguous without relying on
-- quoting/context. The mapping `repeat <-> repeat_field` is applied in
-- `lessonToDbRow`/`dbRowToLesson` (emulador/src/app/services/session-sync.service.ts).
--
-- `session_ref` is a dangling-tolerant pointer (TKM §5.2): NO foreign key to
-- `public.sessions`. Deleting a session must not cascade into lessons — a
-- trader's authored knowledge (P-3/N-4) survives the loss of the session
-- that produced it, exactly like `playbook_rules` survives sessions being
-- deleted.

create table if not exists public.lessons (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  what_happened text not null default '',
  repeat_field text not null default '',
  avoid text not null default '',
  linked_rule_ids jsonb not null default '[]'::jsonb,
  evidence jsonb not null default '[]'::jsonb,        -- SceneSpec[], candle-free (app-enforced N-5)
  trade_refs jsonb not null default '[]'::jsonb,
  session_ref text not null,                          -- dangling-tolerant pointer: NO foreign key (TKM §5.2)
  authored_at timestamptz not null,
  client_updated_at timestamptz not null
);

alter table public.lessons enable row level security;

create policy "lessons_owner_select" on public.lessons
  for select using (auth.uid() = user_id);
create policy "lessons_owner_insert" on public.lessons
  for insert with check (auth.uid() = user_id);
create policy "lessons_owner_update" on public.lessons
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "lessons_owner_delete" on public.lessons
  for delete using (auth.uid() = user_id);

-- Reuse the existing audited LWW guard (same trigger function as
-- sessions/folders/playbook_rules) — do NOT redefine it here.
create trigger lessons_lww before update on public.lessons
  for each row execute function public.lww_guard();
