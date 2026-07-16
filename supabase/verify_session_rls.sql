-- RLS cross-user isolation check for the Phase-2 session-sync tables.
--
-- Verifies that Row-Level Security (`owner_id = auth.uid()`, FOR ALL) on
-- public.sessions and public.folders prevents one user from reading or
-- mutating another user's rows.
--
-- HOW IT WORKS
-- Instead of provisioning two real auth users + two real login sessions, it
-- impersonates two users by switching to the `authenticated` role and setting
-- `request.jwt.claims.sub` (which is what Supabase's `auth.uid()` reads). User A
-- is an existing auth user; user B is a random uuid that owns nothing. Each DO
-- block inserts a row as A, then confirms B can neither SELECT, UPDATE, nor
-- DELETE it, then confirms A is unaffected, then cleans up. Any breach RAISEs
-- (aborting with a clear message); a clean run prints "RLS PASS".
--
-- HOW TO RUN
--   - Supabase MCP: paste each DO block into `execute_sql` (connects with
--     enough privilege to SET ROLE authenticated), or
--   - psql as the postgres/service role:  psql "$DATABASE_URL" -f verify_session_rls.sql
--
-- It is self-cleaning (deletes its test rows) and non-destructive to real data.
-- LAST VERIFIED 2026-06-22 against project nfcgfrsxvdvuasbgrxdy:
--   RLS_SESSIONS_PASS + RLS_FOLDERS_PASS (sessions_rows=0, folders_rows=0 after).

-- ===== sessions =====
do $$
declare a uuid; b uuid := gen_random_uuid(); sid uuid; cnt int; nm text;
begin
  select id into a from auth.users limit 1;
  if a is null then raise exception 'no auth user to test with'; end if;

  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', a::text)::text, true);

  insert into public.sessions (owner_id, symbol, name, schema_version, initial_balance, balance, payload)
    values (a, 'RLSTEST', 'rls-isolation', 1, 1000, 1000, '{"schemaVersion":1}'::jsonb)
    returning id into sid;
  select count(*) into cnt from public.sessions where id = sid;
  if cnt <> 1 then raise exception 'SETUP FAIL: A cannot see its own row (cnt=%)', cnt; end if;

  -- user B
  perform set_config('request.jwt.claims', json_build_object('sub', b::text)::text, true);
  select count(*) into cnt from public.sessions where id = sid;
  if cnt <> 0 then raise exception 'RLS FAIL: B can SELECT A row (cnt=%)', cnt; end if;
  update public.sessions set name = 'hacked-by-B' where id = sid;
  get diagnostics cnt = row_count;
  if cnt <> 0 then raise exception 'RLS FAIL: B can UPDATE A row (rows=%)', cnt; end if;
  delete from public.sessions where id = sid;
  get diagnostics cnt = row_count;
  if cnt <> 0 then raise exception 'RLS FAIL: B can DELETE A row (rows=%)', cnt; end if;

  -- back to A: positive control + unmutated
  perform set_config('request.jwt.claims', json_build_object('sub', a::text)::text, true);
  select count(*) into cnt from public.sessions where id = sid;
  if cnt <> 1 then raise exception 'RLS FAIL: A lost access to own row (cnt=%)', cnt; end if;
  select name into nm from public.sessions where id = sid;
  if nm <> 'rls-isolation' then raise exception 'RLS FAIL: A row mutated by B (name=%)', nm; end if;

  delete from public.sessions where id = sid;  -- cleanup
  raise notice 'RLS PASS (sessions): cross-user isolation holds';
end $$;

-- ===== folders =====
do $$
declare a uuid; b uuid := gen_random_uuid(); fid uuid; cnt int; nm text;
begin
  select id into a from auth.users limit 1;
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', a::text)::text, true);

  insert into public.folders (owner_id, name, sort) values (a, 'rls-folder', 0) returning id into fid;
  select count(*) into cnt from public.folders where id = fid;
  if cnt <> 1 then raise exception 'SETUP FAIL: A cannot see own folder'; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', b::text)::text, true);
  select count(*) into cnt from public.folders where id = fid;
  if cnt <> 0 then raise exception 'RLS FAIL: B can SELECT A folder (cnt=%)', cnt; end if;
  update public.folders set name = 'hacked' where id = fid;
  get diagnostics cnt = row_count;
  if cnt <> 0 then raise exception 'RLS FAIL: B can UPDATE A folder'; end if;
  delete from public.folders where id = fid;
  get diagnostics cnt = row_count;
  if cnt <> 0 then raise exception 'RLS FAIL: B can DELETE A folder'; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', a::text)::text, true);
  select name into nm from public.folders where id = fid;
  if nm <> 'rls-folder' then raise exception 'RLS FAIL: A folder mutated by B'; end if;
  delete from public.folders where id = fid;  -- cleanup
  raise notice 'RLS PASS (folders): cross-user isolation holds';
end $$;

-- ===== playbook_rules (RFC-015 Task 4 + D15.F review hardening) =====
-- Requires supabase/playbook_rules.sql applied first (id/client_updated_at have
-- no server-side defaults, so both are supplied explicitly in the insert below,
-- unlike sessions/folders above). Also asserts the review-added UPDATE
-- `with check (auth.uid() = user_id)` rejects A reassigning its own row's
-- user_id to B (a deviation from the design spec's verbatim SQL — see the
-- comment in playbook_rules.sql).
do $$
declare
  a uuid; b uuid := gen_random_uuid(); rid uuid; cnt int; tt text;
  reassigned boolean := false; ownerid uuid;
begin
  select id into a from auth.users limit 1;
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', a::text)::text, true);

  insert into public.playbook_rules (id, user_id, title, statement, client_updated_at)
    values (gen_random_uuid(), a, 'rls-rule', 'texto opaco', now())
    returning id into rid;
  select count(*) into cnt from public.playbook_rules where id = rid;
  if cnt <> 1 then raise exception 'SETUP FAIL: A cannot see own playbook rule (cnt=%)', cnt; end if;

  -- user B
  perform set_config('request.jwt.claims', json_build_object('sub', b::text)::text, true);
  select count(*) into cnt from public.playbook_rules where id = rid;
  if cnt <> 0 then raise exception 'RLS FAIL: B can SELECT A playbook rule (cnt=%)', cnt; end if;
  update public.playbook_rules set title = 'hacked-by-B', client_updated_at = now() where id = rid;
  get diagnostics cnt = row_count;
  if cnt <> 0 then raise exception 'RLS FAIL: B can UPDATE A playbook rule (rows=%)', cnt; end if;
  delete from public.playbook_rules where id = rid;
  get diagnostics cnt = row_count;
  if cnt <> 0 then raise exception 'RLS FAIL: B can DELETE A playbook rule (rows=%)', cnt; end if;

  -- back to A: positive control + unmutated
  perform set_config('request.jwt.claims', json_build_object('sub', a::text)::text, true);
  select count(*) into cnt from public.playbook_rules where id = rid;
  if cnt <> 1 then raise exception 'RLS FAIL: A lost access to own playbook rule (cnt=%)', cnt; end if;
  select title into tt from public.playbook_rules where id = rid;
  if tt <> 'rls-rule' then raise exception 'RLS FAIL: A playbook rule mutated by B (title=%)', tt; end if;

  -- A cannot reassign its own row's user_id to B (UPDATE with check hardening).
  -- Postgres raises a hard error when a WITH CHECK fails on UPDATE (unlike a
  -- bare USING filter, which just silently affects 0 rows), so the attempt is
  -- wrapped in its own sub-block; the actual assertion is raised OUTSIDE that
  -- sub-block so it is never accidentally swallowed by its own handler.
  begin
    update public.playbook_rules set user_id = b, client_updated_at = now() where id = rid;
    reassigned := true; -- only reached if the update did NOT raise
  exception
    when others then
      reassigned := false; -- expected: WITH CHECK violation
  end;
  if reassigned then
    raise exception 'RLS FAIL: A could reassign a playbook rule''s user_id to B';
  end if;
  select user_id into ownerid from public.playbook_rules where id = rid;
  if ownerid <> a then
    raise exception 'RLS FAIL: playbook rule user_id changed despite rejection (owner=%)', ownerid;
  end if;

  delete from public.playbook_rules where id = rid;  -- cleanup
  raise notice 'RLS PASS (playbook_rules): cross-user isolation holds, including update-reassignment rejection';
end $$;

-- ===== lessons (RFC-016 Task 3) =====
-- Requires supabase/lessons.sql applied first (id/session_ref/authored_at/
-- client_updated_at have no server-side defaults, so all four are supplied
-- explicitly in the insert below, mirroring the playbook_rules block above).
-- Also asserts the UPDATE `with check (auth.uid() = user_id)` rejects A
-- reassigning its own row's user_id to B (same hardening as playbook_rules,
-- see the comment in lessons.sql).
--
-- TIMESTAMP SUBTLETY (discovered on the first live run, 2026-07-15): every
-- UPDATE in this block must send a client_updated_at STRICTLY NEWER than the
-- inserted row's. `now()` is transaction-stable, and the `lww_guard` BEFORE
-- trigger silently skips non-newer writes (`new.client_updated_at <=
-- old.client_updated_at` → return null) BEFORE the RLS WITH CHECK is ever
-- evaluated — with an equal timestamp the reassignment attempt below is
-- no-opped by the trigger, no error raises, and the block false-fails with
-- "A could reassign" even though RLS is sound. Hence `now() + interval '1
-- second'` on the updates. (The playbook_rules block above shares this
-- latent false-fail on its reassignment sub-test; flagged in the RFC-016
-- run ledger, left untouched here — it belongs to RFC-015.)
-- LAST VERIFIED 2026-07-15 against project nfcgfrsxvdvuasbgrxdy:
--   RLS PASS (lessons), lessons_rows=0 after (self-cleaned).
do $$
declare
  a uuid; b uuid := gen_random_uuid(); lid uuid; cnt int; sref text;
  reassigned boolean := false; ownerid uuid;
begin
  select id into a from auth.users limit 1;
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', a::text)::text, true);

  insert into public.lessons (id, user_id, session_ref, authored_at, client_updated_at)
    values (gen_random_uuid(), a, 'rls-session', now(), now())
    returning id into lid;
  select count(*) into cnt from public.lessons where id = lid;
  if cnt <> 1 then raise exception 'SETUP FAIL: A cannot see own lesson (cnt=%)', cnt; end if;

  -- user B
  perform set_config('request.jwt.claims', json_build_object('sub', b::text)::text, true);
  select count(*) into cnt from public.lessons where id = lid;
  if cnt <> 0 then raise exception 'RLS FAIL: B can SELECT A lesson (cnt=%)', cnt; end if;
  update public.lessons set session_ref = 'hacked-by-B', client_updated_at = now() + interval '1 second' where id = lid;
  get diagnostics cnt = row_count;
  if cnt <> 0 then raise exception 'RLS FAIL: B can UPDATE A lesson (rows=%)', cnt; end if;
  delete from public.lessons where id = lid;
  get diagnostics cnt = row_count;
  if cnt <> 0 then raise exception 'RLS FAIL: B can DELETE A lesson (rows=%)', cnt; end if;

  -- back to A: positive control + unmutated
  perform set_config('request.jwt.claims', json_build_object('sub', a::text)::text, true);
  select count(*) into cnt from public.lessons where id = lid;
  if cnt <> 1 then raise exception 'RLS FAIL: A lost access to own lesson (cnt=%)', cnt; end if;
  select session_ref into sref from public.lessons where id = lid;
  if sref <> 'rls-session' then raise exception 'RLS FAIL: A lesson mutated by B (session_ref=%)', sref; end if;

  -- A cannot reassign its own row's user_id to B (UPDATE with check hardening).
  -- Postgres raises a hard error when a WITH CHECK fails on UPDATE (unlike a
  -- bare USING filter, which just silently affects 0 rows), so the attempt is
  -- wrapped in its own sub-block; the actual assertion is raised OUTSIDE that
  -- sub-block so it is never accidentally swallowed by its own handler.
  begin
    update public.lessons set user_id = b, client_updated_at = now() + interval '1 second' where id = lid;
    reassigned := true; -- only reached if the update did NOT raise
  exception
    when others then
      reassigned := false; -- expected: WITH CHECK violation
  end;
  if reassigned then
    raise exception 'RLS FAIL: A could reassign a lesson''s user_id to B';
  end if;
  select user_id into ownerid from public.lessons where id = lid;
  if ownerid <> a then
    raise exception 'RLS FAIL: lesson user_id changed despite rejection (owner=%)', ownerid;
  end if;

  delete from public.lessons where id = lid;  -- cleanup
  raise notice 'RLS PASS (lessons): cross-user isolation holds, including update-reassignment rejection';
end $$;
