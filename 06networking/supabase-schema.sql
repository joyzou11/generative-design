create table if not exists public.visitor_records (
  client_id text primary key,
  current_depth integer not null default 0,
  max_depth integer not null default 0,
  total_seconds integer not null default 0,
  visible boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.visitor_records enable row level security;

drop policy if exists "visitor_records_select_public" on public.visitor_records;
create policy "visitor_records_select_public"
on public.visitor_records
for select
to anon
using (true);

drop policy if exists "visitor_records_insert_public" on public.visitor_records;
create policy "visitor_records_insert_public"
on public.visitor_records
for insert
to anon
with check (true);

drop policy if exists "visitor_records_update_public" on public.visitor_records;
create policy "visitor_records_update_public"
on public.visitor_records
for update
to anon
using (true)
with check (true);

create table if not exists public.exit_cursor_records (
  id bigint generated always as identity primary key,
  client_id text not null,
  depth_pt integer not null default 0,
  max_depth_pt integer not null default 0,
  total_seconds integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.exit_cursor_records enable row level security;

drop policy if exists "exit_cursor_records_select_public" on public.exit_cursor_records;
create policy "exit_cursor_records_select_public"
on public.exit_cursor_records
for select
to anon
using (true);

drop policy if exists "exit_cursor_records_insert_public" on public.exit_cursor_records;
create policy "exit_cursor_records_insert_public"
on public.exit_cursor_records
for insert
to anon
with check (true);
