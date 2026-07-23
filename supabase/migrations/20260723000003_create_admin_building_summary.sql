create function public.get_admin_building_summary()
returns table (
  registered_facility_count bigint,
  missing_facility_count bigint,
  missing_photo_count bigint,
  missing_location_count bigint,
  stale_update_count bigint,
  translation_needed_count bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  with active_buildings as (
    select id, geojson, last_updated
    from public.buildings
    where not coalesce(is_deleted, false)
  )
  select
    (
      select count(*)
      from public.building_facilities facility
      join active_buildings building on building.id = facility.building_id
    ) as registered_facility_count,
    (
      select count(*)
      from active_buildings building
      where not exists (
        select 1
        from public.building_facilities facility
        where facility.building_id = building.id
      )
    ) as missing_facility_count,
    (
      select count(*)
      from active_buildings building
      where not exists (
        select 1
        from public.building_photos photo
        where photo.building_id = building.id
      )
    ) as missing_photo_count,
    (
      select count(*)
      from active_buildings building
      where building.geojson is null
    ) as missing_location_count,
    (
      select count(*)
      from active_buildings building
      where
        building.last_updated is null
        or building.last_updated < current_date - 365
    ) as stale_update_count,
    (
      select count(*)
      from public.building_facilities facility
      join active_buildings building on building.id = facility.building_id
      where facility.translation_status <> 'translated'
    ) as translation_needed_count;
$$;

revoke execute on function public.get_admin_building_summary() from public;
grant execute on function public.get_admin_building_summary() to authenticated;
