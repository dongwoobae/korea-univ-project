-- 설계: docs/specs/2026-10-19-activity-log-design.md 3장, 8.3
begin;
select plan(35);

create function pg_temp.request(claims jsonb, headers jsonb default '{}'::jsonb)
returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', coalesce(claims::text, ''), true);
  perform set_config('request.headers', headers::text, true);
end;
$$;

create function pg_temp.last_log() returns public.activity_logs
language sql as $$
  select * from public.activity_logs order by id desc limit 1;
$$;

create function pg_temp.log_count() returns bigint
language sql as $$
  select count(*) from public.activity_logs;
$$;

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000000001', 'admin@example.com'),
  ('00000000-0000-4000-8000-000000000002', 'stranger@example.com');

-- 요청 클레임이 없으면 SQL Editor·Table Editor와 같은 직접 접속이다.
select pg_temp.request(null);
insert into public.admin_users (user_id, display_name)
values ('00000000-0000-4000-8000-000000000001', '관리자');
select is((pg_temp.last_log()).actor_label, 'DB 직접 변경', '클레임이 빈 문자열이면 DB 직접 변경');
select is(
  ((pg_temp.last_log()).target_table, (pg_temp.last_log()).action, (pg_temp.last_log()).target_label),
  ('admin_users'::text, 'insert'::text, '관리자 관리자'::text),
  '관리자 목록 등록을 기록한다');

insert into public.facility_types (code, label) values ('ramp', '경사로'), ('lift', '승강기');
insert into public.colleges (name) values ('공과대학');
insert into public.buildings (id, name, college_id)
values (10, '하나스퀘어', (select id from public.colleges where name = '공과대학'));
insert into public.landmarks (id, name, lat, lng)
values ('10000000-0000-4000-8000-000000000001', '중앙광장', 37.5, 127.0);

-- 행위자
select pg_temp.request('{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000001"}');
update public.landmarks set name = '중앙 광장' where name = '중앙광장';
select is(
  ((pg_temp.last_log()).actor_kind, (pg_temp.last_log()).actor_id, (pg_temp.last_log()).actor_label),
  ('admin'::text, '00000000-0000-4000-8000-000000000001'::uuid, '관리자'::text),
  'authenticated 요청은 그 계정의 표시 이름');

select pg_temp.request(
  '{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000001"}',
  '{"x-actor-id":"00000000-0000-4000-8000-000000000002"}');
update public.landmarks set name = '중앙광장' where name = '중앙 광장';
select is((pg_temp.last_log()).actor_label, '관리자', 'authenticated 요청에 위조한 x-actor-id는 무시한다');

select pg_temp.request('{"role":"service_role"}', '{"x-actor-id":"00000000-0000-4000-8000-000000000001"}');
update public.landmarks set name = '중앙 광장' where name = '중앙광장';
select is((pg_temp.last_log()).actor_label, '관리자', 'service_role + x-actor-id는 그 관리자');

select pg_temp.request('{"role":"service_role"}', '{"x-actor-system":"translation"}');
update public.landmarks set name = '중앙광장' where name = '중앙 광장';
select is(
  ((pg_temp.last_log()).actor_kind, (pg_temp.last_log()).actor_label),
  ('system'::text, '자동 번역'::text),
  'service_role + x-actor-system은 시스템 이름');

select pg_temp.request('{"role":"service_role"}');
update public.landmarks set name = '중앙 광장' where name = '중앙광장';
select is((pg_temp.last_log()).actor_label, '시스템(미상)', '헤더 없는 service_role은 시스템(미상)');

select pg_temp.request('{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000002"}');
update public.landmarks set name = '중앙광장' where name = '중앙 광장';
select is((pg_temp.last_log()).actor_label, '미등록 계정(stranger@example.com)',
  '목록에 없는 계정은 미등록 계정(이메일)');

-- 기록 내용
select pg_temp.request('{"role":"service_role"}', '{"x-actor-id":"00000000-0000-4000-8000-000000000001"}');
update public.landmarks set name = '분수대', lat = 37.6 where name = '중앙광장';
select is((pg_temp.last_log()).changes,
  '{"name":["중앙광장","분수대"],"lat":[37.5,37.6]}'::jsonb,
  '수정은 바뀐 칸만 [이전, 이후]로 남긴다');

create temp table baseline as select pg_temp.log_count() as n;
update public.landmarks set name = '분수대' where name = '분수대';
select is(pg_temp.log_count(), (select n from baseline), '값이 같은 수정은 행을 남기지 않는다');
update public.landmarks set updated_at = now() + interval '1 minute' where name = '분수대';
select is(pg_temp.log_count(), (select n from baseline), '자동 칸만 바뀐 수정은 행을 남기지 않는다');

insert into public.building_facilities (id, building_id, facility_code, name)
values ('20000000-0000-4000-8000-000000000001', 10, 'ramp', null);
select ok(not ((pg_temp.last_log()).changes ? 'name'), '등록은 null 칸을 뺀다');
select is((pg_temp.last_log()).changes -> 'facility_code',
  '{"value":"ramp","label":"경사로"}'::jsonb, '참조 칸은 { value, label }');
select is((pg_temp.last_log()).changes -> 'building_id',
  '{"value":10,"label":"하나스퀘어"}'::jsonb, '건물 참조도 { value, label }');
select is((pg_temp.last_log()).target_label, '하나스퀘어 · 경사로',
  '시설 이름이 없으면 시설 종류 이름');

update public.facility_types set label = '경사 진입로' where code = 'ramp';
select is(
  (select changes -> 'facility_code' ->> 'label' from public.activity_logs
   where target_id = '20000000-0000-4000-8000-000000000001' and action = 'insert'),
  '경사로', '종류 이름을 바꿔도 기록된 label은 그대로');

insert into public.building_facilities (id, facility_code, name)
values ('20000000-0000-4000-8000-000000000002', 'lift', '정문 승강기');
select is((pg_temp.last_log()).target_label, '정문 승강기', '독립 시설은 건물명 없이');

insert into public.facility_photos (facility_id, storage_path, sort_order)
values ('20000000-0000-4000-8000-000000000001', 'f/1.webp', 0);
select is((pg_temp.last_log()).target_label, '하나스퀘어 · 경사 진입로 사진', '시설 사진 대상 이름');

insert into public.building_photos (building_id, url) values (10, 'https://cdn.test/b.webp');
select is((pg_temp.last_log()).target_label, '하나스퀘어 사진', '건물 사진 대상 이름');

update public.buildings
set geojson = '{"type":"Polygon","coordinates":[[[127,37],[127.1,37],[127.1,37.1],[127,37]]]}'
where id = 10;
select is((pg_temp.last_log()).changes -> 'geojson' -> 1,
  '{"changed":true,"points":4}'::jsonb, '형상 칸은 꼭짓점 수로 요약');

insert into public.slope_segments (name, segments)
values ('정문 오르막', '[{"lat":37.58,"lng":127.02},{"lat":37.581,"lng":127.021,"slope":7.2}]');
select is((pg_temp.last_log()).changes -> 'segments',
  '{"changed":true,"points":2}'::jsonb, '경사도 경로도 꼭짓점 수로 요약');

delete from public.slope_segments where name = '정문 오르막';
select is((pg_temp.last_log()).changes -> 'segments' -> 0 ->> 'lat', '37.58',
  '삭제는 형상 칸도 값을 그대로 남긴다');
select ok((pg_temp.last_log()).changes ? 'name', '삭제는 행 전체를 남긴다');

-- 방문자 입력
select pg_temp.request(null);
insert into public.feedback_submissions (id, feedback_type, content)
values ('30000000-0000-4000-8000-000000000001', 'error', '연락처 010-0000-0000');
insert into public.facility_requests (id, building_id, facility_code, description, client_hash)
values ('40000000-0000-4000-8000-000000000001', 10, 'ramp', '전화 주세요', 'hash');
select is(
  (select count(*) from public.activity_logs
   where target_table in ('feedback_submissions', 'facility_requests')),
  0::bigint, '방문자 접수(등록)는 기록하지 않는다');

select pg_temp.request('{"role":"service_role"}', '{"x-actor-id":"00000000-0000-4000-8000-000000000001"}');
update public.feedback_submissions set content = '내용 수정', status = 'resolved'
where id = '30000000-0000-4000-8000-000000000001';
select is((pg_temp.last_log()).changes -> 'content',
  '[{"redacted":true,"length":17},{"redacted":true,"length":5}]'::jsonb,
  '의견 본문은 수정 기록에서 가린다');
select is((pg_temp.last_log()).target_label, '의견 제보 #30000000', '의견 대상 이름에 본문이 없다');

delete from public.feedback_submissions where id = '30000000-0000-4000-8000-000000000001';
select is((pg_temp.last_log()).changes -> 'content',
  '{"redacted":true,"length":5}'::jsonb, '의견 본문은 삭제 기록에서도 가린다');

update public.facility_requests set status = 'approved'
where id = '40000000-0000-4000-8000-000000000001';
select is(
  ((pg_temp.last_log()).changes, (pg_temp.last_log()).target_label),
  ('{"status":["new","approved"]}'::jsonb, '경사 진입로 등록 요청'::text),
  '등록 요청 상태 변경을 남기고 client_hash는 빼며 대상은 종류 이름');
delete from public.facility_requests where id = '40000000-0000-4000-8000-000000000001';
select ok(not ((pg_temp.last_log()).changes ? 'client_hash')
  and (pg_temp.last_log()).changes -> 'description' = '{"redacted":true,"length":6}'::jsonb,
  '등록 요청 삭제 기록도 설명을 가리고 client_hash를 뺀다');

delete from public.admin_users where user_id = '00000000-0000-4000-8000-000000000001';
select is(((pg_temp.last_log()).target_table, (pg_temp.last_log()).action),
  ('admin_users'::text, 'delete'::text), '관리자 목록 삭제를 기록한다');

-- 안전장치(설계 3.7)
alter table public.facility_types rename column label to label_renamed;
select lives_ok(
  $$update public.building_facilities set floor_info = '1층'
    where id = '20000000-0000-4000-8000-000000000001'$$,
  '내용을 만들다 실패해도 저장은 성공한다');
select is(
  ((pg_temp.last_log()).level, (pg_temp.last_log()).reason_code, (pg_temp.last_log()).action),
  ('error'::text, 'audit_write_failed'::text, 'building_facilities.update'::text),
  '그 실패를 audit_write_failed로 남긴다');
alter table public.facility_types rename column label_renamed to label;

alter table public.activity_logs add constraint block_all check (false) not valid;
truncate baseline;
insert into baseline select pg_temp.log_count();
select lives_ok(
  $$update public.building_facilities set floor_info = '2층'
    where id = '20000000-0000-4000-8000-000000000001'$$,
  '기록 테이블 쓰기가 실패해도 저장은 성공한다');
select is(
  (select floor_info from public.building_facilities where id = '20000000-0000-4000-8000-000000000001'),
  '2층', '저장된 값이 남는다');
select is(pg_temp.log_count(), (select n from baseline), '기록하지 못한 행은 남지 않는다');

select * from finish();
rollback;
