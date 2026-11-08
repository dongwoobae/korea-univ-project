-- 설계: docs/specs/2026-11-06-stairs-layer-design.md 4.1
begin;
select plan(6);

insert into public.slope_segments (name, segments) values ('경사로 기본값', '[]');
select is(
  (select kind from public.slope_segments where name = '경사로 기본값'),
  'slope'::text,
  '종류를 주지 않으면 경사로다');

select throws_ok(
  $$insert into public.slope_segments (name, segments, kind) values ('엘리베이터', '[]', 'elevator')$$,
  '23514', null, '경사로·계단 밖의 종류는 거부한다');

select throws_ok(
  $$insert into public.slope_segments (name, segments, osm_way_id) values ('OSM 경사로', '[]', 1)$$,
  '23514', null, '경사로에는 OSM 번호를 넣지 못한다');

insert into public.slope_segments (name, segments, kind, osm_way_id)
values ('계단 1', '[]', 'stairs', 394382780);
select throws_ok(
  $$insert into public.slope_segments (name, segments, kind, osm_way_id) values ('계단 2', '[]', 'stairs', 394382780)$$,
  '23505', null, '같은 OSM 계단은 한 번만 확정한다');

insert into public.slope_segments (name, segments, kind)
values ('손 계단 1', '[]', 'stairs'), ('손 계단 2', '[]', 'stairs');
select is(
  (select count(*) from public.slope_segments where kind = 'stairs' and osm_way_id is null),
  2::bigint,
  'OSM 번호가 없는 계단은 여럿일 수 있다');

select is(
  (select note from public.slope_segments where name = '계단 1'),
  null::text,
  '설명은 비어도 된다');

select * from finish();
rollback;
