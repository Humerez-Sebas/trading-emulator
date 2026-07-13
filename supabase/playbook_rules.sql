-- RFC-015 Task 4: playbook_rules table, RLS, and per-row LWW guard.
-- Verbatim from docs/superpowers/specs/2026-07-12-rfc-015-playbook-rules-design.md
-- section 3 ("Nube: tabla playbook_rules + RLS + LWW"). Application to the live
-- Supabase project is done via the Supabase MCP (apply_migration) or the
-- owner's dashboard — never assumed applied by CI (see task-4-report.md).

create table if not exists public.playbook_rules (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null,
  statement text not null default '',
  status text not null default 'active' check (status in ('active', 'retired')),
  shortcut_slot smallint check (shortcut_slot between 1 and 9),
  sort_order integer not null default 0,
  amendments jsonb not null default '[]'::jsonb,   -- RESERVED (P-7)
  created_at timestamptz not null default now(),
  client_updated_at timestamptz not null
);

alter table public.playbook_rules enable row level security;

create policy "playbook_rules_owner_select" on public.playbook_rules
  for select using (auth.uid() = user_id);
create policy "playbook_rules_owner_insert" on public.playbook_rules
  for insert with check (auth.uid() = user_id);
create policy "playbook_rules_owner_update" on public.playbook_rules
  for update using (auth.uid() = user_id);
create policy "playbook_rules_owner_delete" on public.playbook_rules
  for delete using (auth.uid() = user_id);

-- Reuse the audited LWW guard (same trigger function as sessions/folders):
create trigger playbook_rules_lww before update on public.playbook_rules
  for each row execute function public.lww_guard();
