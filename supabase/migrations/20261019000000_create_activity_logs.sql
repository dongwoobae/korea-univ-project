-- 관리자 허용 목록과 감사 로그. 설계: docs/specs/2026-10-19-activity-log-design.md 2장

create table public.admin_users (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null
    check (char_length(btrim(display_name)) between 1 and 20),
  created_at timestamptz not null default now()
);

alter table public.admin_users enable row level security;
revoke all on table public.admin_users from anon, authenticated;

create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.admin_users where user_id = auth.uid()
  );
$$;

revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated, service_role;

create table public.activity_logs (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  recorded_at timestamptz not null default now(),
  level text not null check (level in ('info', 'warning', 'error')),
  kind text not null check (kind in ('change', 'failure')),
  actor_kind text not null check (actor_kind in ('admin', 'system', 'visitor')),
  actor_id uuid,
  actor_label text not null,
  action text not null,
  target_table text,
  target_id text,
  target_label text,
  changes jsonb,
  reason_code text,
  message text,
  detail jsonb,
  client_event_id uuid unique
);

create index activity_logs_occurred_idx
  on public.activity_logs (occurred_at desc, id desc);
create index activity_logs_level_occurred_idx
  on public.activity_logs (level, occurred_at desc, id desc);

alter table public.activity_logs enable row level security;
revoke all on table public.activity_logs from anon, authenticated;
grant select on table public.activity_logs to authenticated;

create policy activity_logs_admin_read
  on public.activity_logs for select
  to authenticated
  using (public.is_admin());

create function public.reject_activity_log_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'activity_logs is append-only';
end;
$$;

revoke all on function public.reject_activity_log_change() from public, anon, authenticated;

create trigger activity_logs_append_only
  before update or delete on public.activity_logs
  for each row execute function public.reject_activity_log_change();

create trigger activity_logs_no_truncate
  before truncate on public.activity_logs
  for each statement execute function public.reject_activity_log_change();
