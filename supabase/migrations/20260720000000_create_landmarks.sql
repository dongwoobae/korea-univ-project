create table if not exists public.landmarks (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  name_en text,
  name_zh text,
  description text,
  description_en text,
  description_zh text,
  lat double precision not null,
  lng double precision not null,
  icon text not null,
  image_url text,
  photo_url text,
  created_at timestamptz default now()
);

alter table public.landmarks enable row level security;

drop policy if exists "anon read" on public.landmarks;
drop policy if exists "authenticated write" on public.landmarks;

create policy "anon read"
on public.landmarks
for select
to anon, authenticated
using (true);

create policy "authenticated write"
on public.landmarks
for all
to authenticated
using (true)
with check (true);
