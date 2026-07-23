alter table public.building_facilities
  add column updated_at timestamptz;

alter table public.landmarks
  add column updated_at timestamptz;

alter table public.slope_segments
  add column updated_at timestamptz;

update public.building_facilities
set updated_at = coalesce(created_at, now());

update public.landmarks
set updated_at = coalesce(created_at, now());

update public.slope_segments
set updated_at = coalesce(created_at, now());

alter table public.building_facilities
  alter column updated_at set default now(),
  alter column updated_at set not null;

alter table public.landmarks
  alter column updated_at set default now(),
  alter column updated_at set not null;

alter table public.slope_segments
  alter column updated_at set default now(),
  alter column updated_at set not null;

create function public.set_admin_content_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_building_facilities_updated_at
before update on public.building_facilities
for each row execute function public.set_admin_content_updated_at();

create trigger set_landmarks_updated_at
before update on public.landmarks
for each row execute function public.set_admin_content_updated_at();

create trigger set_slope_segments_updated_at
before update on public.slope_segments
for each row execute function public.set_admin_content_updated_at();
