-- 설계: docs/specs/2026-11-06-stairs-layer-design.md 4.1
alter table public.slope_segments
  add column kind text not null default 'slope',
  add column osm_way_id bigint,
  add column note text;

alter table public.slope_segments
  add constraint slope_segments_kind_check
    check (kind in ('slope', 'stairs')),
  add constraint slope_segments_osm_way_id_stairs_only
    check (osm_way_id is null or kind = 'stairs');

create unique index slope_segments_osm_way_id_key
  on public.slope_segments (osm_way_id)
  where osm_way_id is not null;
