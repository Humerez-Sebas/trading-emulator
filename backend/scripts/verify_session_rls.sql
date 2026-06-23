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
