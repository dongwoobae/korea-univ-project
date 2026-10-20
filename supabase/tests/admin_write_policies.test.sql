-- 설계: docs/specs/2026-10-19-activity-log-design.md 6장
begin;
select plan(16);

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000000001', 'admin@example.com'),
  ('00000000-0000-4000-8000-000000000002', 'stranger@example.com');
insert into public.admin_users (user_id, display_name)
values ('00000000-0000-4000-8000-000000000001', '관리자');
insert into public.landmarks (id, name, lat, lng)
values ('10000000-0000-4000-8000-000000000001', '중앙광장', 37.5, 127.0);
insert into public.buildings (id, name) values (900001, '시험 건물');

create function pg_temp.act_as(person uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', person, 'role', 'authenticated')::text, true);
end;
$$;

set local role authenticated;

select pg_temp.act_as('00000000-0000-4000-8000-000000000002');
select throws_ok(
  $$insert into public.landmarks (name, lat, lng) values ('새 명소', 37.5, 127.0)$$,
  '42501', null, '목록에 없는 계정은 명소를 넣지 못한다');
update public.landmarks set name = '바뀐 이름';
select is(
  (select name from public.landmarks where id = '10000000-0000-4000-8000-000000000001'),
  '중앙광장', '목록에 없는 계정의 수정은 한 행도 바꾸지 못한다');
select throws_ok(
  $$insert into public.slope_segments (name, segments) values ('새 경로', '[]')$$,
  '42501', null, '목록에 없는 계정은 경사도 경로를 넣지 못한다');
select throws_ok(
  $$insert into public.buildings (id, name) values (900002, '새 건물')$$,
  '42501', null, '목록에 없는 계정은 건물을 넣지 못한다');
select throws_ok(
  $$insert into public.building_facilities (building_id, name) values (900001, '새 시설')$$,
  '42501', null, '목록에 없는 계정은 시설을 넣지 못한다');
select throws_ok(
  $$insert into public.building_photos (building_id, url) values (900001, 'https://cdn.test/new.webp')$$,
  '42501', null, '목록에 없는 계정은 건물 사진을 넣지 못한다');
select throws_ok(
  $$insert into public.colleges (name) values ('새 단과대학')$$,
  '42501', null, '목록에 없는 계정은 단과대학을 넣지 못한다');
select throws_ok(
  $$insert into public.facility_types (code, label) values ('new_type', '새 종류')$$,
  '42501', null, '목록에 없는 계정은 시설 종류를 넣지 못한다');

select pg_temp.act_as('00000000-0000-4000-8000-000000000001');
select lives_ok(
  $$insert into public.landmarks (name, lat, lng) values ('새 명소', 37.5, 127.0)$$,
  '관리자는 명소를 넣는다');
update public.landmarks set name = '바뀐 이름'
where id = '10000000-0000-4000-8000-000000000001';
select is(
  (select name from public.landmarks where id = '10000000-0000-4000-8000-000000000001'),
  '바뀐 이름', '관리자는 명소를 고친다');
select lives_ok(
  $$insert into public.slope_segments (name, segments) values ('새 경로', '[]')$$,
  '관리자는 경사도 경로를 넣는다');
select lives_ok(
  $$insert into public.buildings (id, name) values (900002, '새 건물')$$,
  '관리자는 건물을 넣는다');
select lives_ok(
  $$insert into public.building_facilities (building_id, name) values (900001, '새 시설')$$,
  '관리자는 시설을 넣는다');
select lives_ok(
  $$insert into public.building_photos (building_id, url) values (900001, 'https://cdn.test/new.webp')$$,
  '관리자는 건물 사진을 넣는다');
select lives_ok(
  $$insert into public.colleges (name) values ('새 단과대학')$$,
  '관리자는 단과대학을 넣는다');
select lives_ok(
  $$insert into public.facility_types (code, label) values ('new_type', '새 종류')$$,
  '관리자는 시설 종류를 넣는다');

reset role;
select * from finish();
rollback;
