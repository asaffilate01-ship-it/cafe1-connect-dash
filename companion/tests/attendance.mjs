import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
const db = new PGlite();
await db.exec(
  `create schema auth; create role anon; create role authenticated; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$; create table public.sites(id uuid primary key,code text,name text,legal_name text,trading_name text); create table public.user_roles(user_id uuid,role text); create function public.has_role(u uuid,r text) returns boolean language sql stable as $$select exists(select 1 from public.user_roles where user_id=u and role=r)$$; create table public.profiles(id uuid primary key,full_name text,email text); create table public.audit_events(actor_id uuid,action text,entity_type text,entity_id uuid,detail jsonb); create table public.staff_time_entries(id uuid primary key default gen_random_uuid(),site_id uuid,staff_id uuid,clocked_in_at timestamptz default now(),clocked_out_at timestamptz,break_minutes integer default 0,note text,approved_by uuid,approved_at timestamptz); create unique index staff_one_open_time_entry on public.staff_time_entries(staff_id) where clocked_out_at is null;`,
);
await db.exec(
  readFileSync(
    new URL(
      "../../supabase/migrations/20261029071724_staff_attendance_companion.sql",
      import.meta.url,
    ),
    "utf8",
  ),
);
console.log("Migration parsed and executed");
await db.exec(
  `create function public.cafe1_assert_operator(boolean) returns uuid language plpgsql as $$ begin if current_setting('request.jwt.claims',true)::jsonb->>'aal' is distinct from 'aal2' then raise exception 'Manager multi-factor authentication is required'; end if; return auth.uid(); end $$;`,
);
await db.exec(
  readFileSync(
    new URL(
      "../../supabase/migrations/20261029080352_staff_attendance_completion.sql",
      import.meta.url,
    ),
    "utf8",
  ),
);
await db.exec(readFileSync(new URL("./scenarios.sql", import.meta.url), "utf8"));
await db.exec(
  readFileSync(
    new URL(
      "../../supabase/migrations/20261029081748_staff_attendance_site_access.sql",
      import.meta.url,
    ),
    "utf8",
  ),
);
await db.exec(
  `begin; update public.user_roles set role='driver' where user_id='10000000-0000-4000-8000-000000000003' and role='staff'; select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000003',true); do $$ begin if jsonb_array_length(public.cafe1_list_sites())<>1 then raise exception 'Driver site access failed'; end if; end $$; rollback;`,
);
console.log("Attendance scenarios passed");
await db.close();
