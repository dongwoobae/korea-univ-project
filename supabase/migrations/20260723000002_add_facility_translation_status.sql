alter table public.building_facilities
  add column translation_status text not null default 'translated'
  check (translation_status in ('pending', 'translated', 'failed'));

update public.building_facilities
set translation_status = 'pending'
where
  (nullif(trim(name), '') is not null and (
    nullif(trim(name_en), '') is null
    or nullif(trim(name_zh), '') is null
  ))
  or (nullif(trim(description), '') is not null and (
    nullif(trim(description_en), '') is null
    or nullif(trim(description_zh), '') is null
  ))
  or (nullif(trim(floor_info), '') is not null and (
    nullif(trim(floor_info_en), '') is null
    or nullif(trim(floor_info_zh), '') is null
  ));
