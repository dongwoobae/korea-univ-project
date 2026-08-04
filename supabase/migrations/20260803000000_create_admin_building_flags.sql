-- 건물별 보완 플래그 뷰.
-- 요약 카드 숫자와 목록 필터가 둘 다 이 뷰를 보게 해서 정의가 갈라지지 않게 한다.
-- 조건식은 기존 get_admin_building_summary()의 SQL을 그대로 옮긴 것이다.
-- 특히 stale_update는 interval '1 year'가 아니라 current_date - 365다 —
-- 바꾸면 윤년 구간에서 기존 stale_update_count가 조용히 달라진다.
create view public.admin_building_flags
with (security_invoker = on)
as
  select
    building.id as building_id,
    not exists (
      select 1
      from public.building_facilities facility
      where facility.building_id = building.id
    ) as missing_facility,
    not exists (
      select 1
      from public.building_photos photo
      where photo.building_id = building.id
    ) as missing_photo,
    building.geojson is null as missing_location,
    (
      building.last_updated is null
      or building.last_updated < current_date - 365
    ) as stale_update,
    exists (
      select 1
      from public.building_facilities facility
      where facility.building_id = building.id
        and facility.translation_status <> 'translated'
    ) as translation_needed
  from public.buildings building
  where not coalesce(building.is_deleted, false);

-- 함수와 같은 posture. Supabase 기본 권한이 anon에도 grant를 주므로
-- public revoke만으로는 부족해 anon을 명시적으로 회수한다.
revoke all on public.admin_building_flags from public;
revoke all on public.admin_building_flags from anon;
grant select on public.admin_building_flags to authenticated;

-- RETURNS TABLE 컬럼이 반환 타입이라 create or replace로는 컬럼을 늘릴 수 없다.
drop function if exists public.get_admin_building_summary();

create function public.get_admin_building_summary()
returns table (
  registered_facility_count bigint,
  missing_facility_count bigint,
  missing_photo_count bigint,
  missing_location_count bigint,
  stale_update_count bigint,
  translation_needed_count bigint,
  translation_needed_building_count bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    (
      select count(*)
      from public.building_facilities facility
      join public.admin_building_flags flag
        on flag.building_id = facility.building_id
    ) as registered_facility_count,
    (
      select count(*)
      from public.admin_building_flags flag
      where flag.missing_facility
    ) as missing_facility_count,
    (
      select count(*)
      from public.admin_building_flags flag
      where flag.missing_photo
    ) as missing_photo_count,
    (
      select count(*)
      from public.admin_building_flags flag
      where flag.missing_location
    ) as missing_location_count,
    (
      select count(*)
      from public.admin_building_flags flag
      where flag.stale_update
    ) as stale_update_count,
    (
      select count(*)
      from public.building_facilities facility
      join public.admin_building_flags flag
        on flag.building_id = facility.building_id
      where facility.translation_status <> 'translated'
    ) as translation_needed_count,
    (
      select count(*)
      from public.admin_building_flags flag
      where flag.translation_needed
    ) as translation_needed_building_count;
$$;

-- drop이 권한도 지웠으므로 그대로 다시 부여한다.
revoke execute on function public.get_admin_building_summary() from public;
grant execute on function public.get_admin_building_summary() to authenticated;
