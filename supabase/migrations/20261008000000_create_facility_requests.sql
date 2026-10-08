-- 시설 등록 요청·요청 사진·시설 사진, 확인과 쓰기를 묶는 함수, 사진 버킷.
-- docs/specs/2026-10-08-facility-request-design.md 2장

create table public.facility_requests (
  id uuid primary key default gen_random_uuid(),
  building_id bigint not null references public.buildings(id),
  facility_code text not null,
  name text check (name is null or char_length(name) <= 100),
  description text check (description is null or char_length(description) <= 1000),
  floor_info text check (floor_info is null or char_length(floor_info) <= 100),
  lat double precision check (lat is null or lat between -90 and 90),
  lng double precision check (lng is null or lng between -180 and 180),
  status text not null default 'new'
    check (status in ('new', 'reviewing', 'approved', 'rejected')),
  client_hash text not null,
  facility_id uuid references public.building_facilities(id) on delete set null,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create index facility_requests_status_created_idx
  on public.facility_requests (status, created_at desc);
create index facility_requests_client_hash_created_idx
  on public.facility_requests (client_hash, created_at);
create index facility_requests_building_idx
  on public.facility_requests (building_id);

create table public.facility_request_photos (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.facility_requests(id) on delete cascade,
  storage_path text not null,
  sort_order smallint not null check (sort_order between 0 and 2),
  unique (request_id, sort_order)
);

create table public.facility_photos (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references public.building_facilities(id) on delete cascade,
  storage_path text not null,
  sort_order smallint not null check (sort_order between 0 and 2),
  created_at timestamptz not null default now(),
  unique (facility_id, sort_order)
);

alter table public.facility_requests enable row level security;
alter table public.facility_request_photos enable row level security;
alter table public.facility_photos enable row level security;

-- 요청 두 테이블은 서버 API(서비스 키)만 다룬다. Supabase 기본 권한이 anon에도
-- grant를 주므로 명시적으로 회수한다.
revoke all on table public.facility_requests from anon, authenticated;
revoke all on table public.facility_request_photos from anon, authenticated;
revoke all on table public.facility_photos from anon, authenticated;

grant select on table public.facility_photos to anon, authenticated;
create policy facility_photos_public_read
  on public.facility_photos for select
  to anon, authenticated
  using (true);

create function public.create_facility_request(p_fields jsonb, p_client_hash text)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
begin
  -- 같은 해시의 동시 요청이 둘 다 9건을 보고 통과하지 않게 세기 전에 잠근다.
  perform pg_advisory_xact_lock(hashtext(p_client_hash));
  if (
    select count(*)
    from public.facility_requests
    where client_hash = p_client_hash
      and created_at > now() - interval '1 hour'
  ) >= 10 then
    return 'rate_limited';
  end if;

  insert into public.facility_requests (
    building_id, facility_code, name, description, floor_info, lat, lng, client_hash
  ) values (
    (p_fields->>'building_id')::bigint,
    p_fields->>'facility_code',
    nullif(p_fields->>'name', ''),
    nullif(p_fields->>'description', ''),
    nullif(p_fields->>'floor_info', ''),
    (p_fields->>'lat')::double precision,
    (p_fields->>'lng')::double precision,
    p_client_hash
  )
  returning id into v_id;

  return v_id::text;
end;
$$;

create function public.add_facility_request_photo(p_request_id uuid, p_storage_path text)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_status text;
  v_slot integer;
  v_id uuid;
begin
  -- approve_facility_request와 같은 행을 잠가 승인·거절과 차례로만 실행된다(설계 3.5).
  select status into v_status
  from public.facility_requests
  where id = p_request_id
  for update;

  if not found then
    return 'not_found';
  end if;
  if v_status <> 'new' then
    return 'not_new';
  end if;

  select slot into v_slot
  from generate_series(0, 2) as slot
  where not exists (
    select 1
    from public.facility_request_photos photo
    where photo.request_id = p_request_id
      and photo.sort_order = slot
  )
  order by slot
  limit 1;

  if v_slot is null then
    return 'full';
  end if;

  insert into public.facility_request_photos (request_id, storage_path, sort_order)
  values (p_request_id, p_storage_path, v_slot)
  returning id into v_id;

  return v_id::text;
end;
$$;

create function public.approve_facility_request(
  p_request_id uuid,
  p_facility_id uuid,
  p_fields jsonb,
  p_photos jsonb
)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_request public.facility_requests%rowtype;
begin
  select * into v_request
  from public.facility_requests
  where id = p_request_id
  for update;

  if not found then
    return 'not_found';
  end if;
  if v_request.status not in ('new', 'reviewing') then
    return 'already_processed';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_photos) as photo
    where not exists (
      select 1
      from public.facility_request_photos request_photo
      where request_photo.id = (photo->>'request_photo_id')::uuid
        and request_photo.request_id = p_request_id
    )
  ) then
    return 'photo_mismatch';
  end if;

  insert into public.building_facilities (
    id, building_id, facility_code, name, description, floor_info,
    is_installed, lat, lng, translation_status
  ) values (
    p_facility_id,
    v_request.building_id,
    p_fields->>'facility_code',
    nullif(p_fields->>'name', ''),
    nullif(p_fields->>'description', ''),
    nullif(p_fields->>'floor_info', ''),
    coalesce((p_fields->>'is_installed')::boolean, true),
    (p_fields->>'lat')::double precision,
    (p_fields->>'lng')::double precision,
    'pending'
  );

  insert into public.facility_photos (facility_id, storage_path, sort_order)
  select
    p_facility_id,
    photo->>'storage_path',
    (photo->>'sort_order')::smallint
  from jsonb_array_elements(p_photos) as photo;

  update public.facility_requests
  set status = 'approved',
      facility_id = p_facility_id,
      reviewed_at = now()
  where id = p_request_id;

  return 'approved';
end;
$$;

-- public 스키마 함수는 PostgREST가 /rest/v1/rpc로 노출한다. 서버 API만 부르게 한다(설계 2.5).
revoke all on function public.create_facility_request(jsonb, text) from public, anon, authenticated;
revoke all on function public.add_facility_request_photo(uuid, text) from public, anon, authenticated;
revoke all on function public.approve_facility_request(uuid, uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.create_facility_request(jsonb, text) to service_role;
grant execute on function public.add_facility_request_photo(uuid, text) to service_role;
grant execute on function public.approve_facility_request(uuid, uuid, jsonb, jsonb) to service_role;

-- 크기·형식 상한을 버킷에도 걸어 서버 검사가 빠져도 저장소가 거른다(설계 2.4).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('facility-request-photos', 'facility-request-photos', false, 4194304, array['image/webp']),
  ('facility-photos', 'facility-photos', true, 4194304, array['image/webp'])
on conflict (id) do nothing;
