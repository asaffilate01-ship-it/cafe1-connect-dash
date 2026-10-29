import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
const db = new PGlite();
await db.exec(
  `create schema auth; create role anon; create role authenticated; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$; create table public.sites(id uuid primary key); create table public.user_roles(user_id uuid,role text); create function public.has_role(u uuid,r text) returns boolean language sql stable as $$select exists(select 1 from public.user_roles where user_id=u and role=r)$$; create table public.profiles(id uuid,full_name text,email text); create table public.audit_events(actor_id uuid,action text,entity_type text,entity_id uuid,detail jsonb); create table public.staff_time_entries(id uuid primary key default gen_random_uuid(),site_id uuid,staff_id uuid,clocked_in_at timestamptz default now(),clocked_out_at timestamptz,break_minutes integer default 0,note text,approved_by uuid,approved_at timestamptz); create unique index staff_one_open_time_entry on public.staff_time_entries(staff_id) where clocked_out_at is null;`,
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
const shape = [
  { lat: 51.75, lng: -0.335 },
  { lat: 51.75, lng: -0.334 },
  { lat: 51.751, lng: -0.334 },
  { lat: 51.751, lng: -0.335 },
];
await db.exec(readFileSync(new URL("./scenarios.sql", import.meta.url), "utf8"));
console.log("Attendance scenarios passed");
await db.close();
