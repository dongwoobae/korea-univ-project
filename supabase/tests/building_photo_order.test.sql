-- 설계: docs/specs/2026-10-25-mentoring-feedback-design.md 3.3
begin;
select plan(22);

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000000001', 'admin@example.com'),
  ('00000000-0000-4000-8000-000000000002', 'stranger@example.com');
insert into public.admin_users (user_id, display_name)
values ('00000000-0000-4000-8000-000000000001', '관리자');
insert into public.buildings (id, name) values (900001, '시험 건물'), (900002, '옆 건물');

create function pg_temp.act_as(person uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', person, 'role', 'authenticated')::text, true);
end;
$$;

select has_column('public', 'building_photos', 'sort_order', '건물 사진에 순서 칸이 있다');
select col_not_null('public', 'building_photos', 'sort_order', '순서 칸은 비지 않는다');

-- 업로드 라우트처럼 sort_order 없이 넣는다
insert into public.building_photos (id, building_id, url) values (800001, 900001, 'https://cdn.test/a.webp');
select is((select sort_order from public.building_photos where id = 800001), 0, '건물의 첫 사진은 0번이다');
insert into public.building_photos (id, building_id, url) values
  (800002, 900001, 'https://cdn.test/b.webp'),
  (800003, 900001, 'https://cdn.test/c.webp');
select results_eq(
  $$select sort_order from public.building_photos where building_id = 900001 order by sort_order$$,
  $$values (0), (1), (2)$$,
  '한 문장에 여러 장을 넣어도 마지막 번호 다음부터 겹치지 않게 붙는다');

insert into public.building_photos (id, building_id, url) values (800011, 900002, 'https://cdn.test/x.webp');
select is((select sort_order from public.building_photos where id = 800011), 0, '건물마다 0번부터 센다');

-- 업로드 라우트는 RLS를 건너뛰는 서비스 키로 넣는다
set local role service_role;
insert into public.building_photos (id, building_id, url) values (800004, 900001, 'https://cdn.test/d.webp');
reset role;
select is((select sort_order from public.building_photos where id = 800004), 3, '서비스 키 업로드도 마지막 번호 다음에 붙는다');

-- 900001의 순서: A(0) C(2) D(3) E(4)
delete from public.building_photos where id = 800002;
insert into public.building_photos (id, building_id, url) values (800005, 900001, 'https://cdn.test/e.webp');
select is((select sort_order from public.building_photos where id = 800005), 4, '사진을 지워도 새 사진은 마지막 번호 다음에 붙는다');

select throws_ok(
  $$insert into public.building_photos (building_id, url, sort_order) values (900001, 'https://cdn.test/dup.webp', 0)$$,
  '23505', null, '같은 건물에 같은 번호를 두 번 둘 수 없다');
select throws_ok(
  $$insert into public.building_photos (building_id, url, sort_order) values (900001, 'https://cdn.test/neg.webp', -1)$$,
  '23514', null, '번호는 0 이상이다');

select has_function('public', 'swap_building_photo_order', array['integer', 'integer'], '맞바꾸기 함수가 있다');
select is(
  (select prosecdef from pg_proc where oid = 'public.swap_building_photo_order(integer, integer)'::regprocedure),
  false, '맞바꾸기 함수는 호출자 권한으로 돈다');

-- A(0)와 C(2)는 사이의 1번이 지워져 이웃이다
set local role authenticated;
select pg_temp.act_as('00000000-0000-4000-8000-000000000001');
select lives_ok($$select public.swap_building_photo_order(800001, 800003)$$, '관리자는 이웃한 두 사진의 자리를 바꾼다');
select results_eq(
  $$select id from public.building_photos where building_id = 900001 order by sort_order$$,
  $$values (800003), (800001), (800004), (800005)$$,
  '맞바꾼 두 사진만 자리가 바뀐다');
reset role;
select is(
  (select count(*)::int from public.activity_logs
   where target_table = 'building_photos' and action = 'update' and changes ? 'sort_order'),
  2, '맞바꾸기 한 번에 순서 변경 기록이 두 줄 남는다');

-- 순서: C(0) A(2) D(3) E(4)
set local role authenticated;
select pg_temp.act_as('00000000-0000-4000-8000-000000000001');
select throws_ok($$select public.swap_building_photo_order(800003, 800004)$$,
  'PT409', null, '사이에 다른 사진이 있으면 바꾸지 않는다');
select throws_ok($$select public.swap_building_photo_order(800001, 800011)$$,
  '22023', null, '다른 건물의 사진과는 바꾸지 않는다');
select throws_ok($$select public.swap_building_photo_order(800001, 800001)$$,
  '22023', null, '같은 사진끼리는 바꾸지 않는다');
select throws_ok($$select public.swap_building_photo_order(800001, 899999)$$,
  'P0002', null, '없는 사진과는 바꾸지 않는다');

select pg_temp.act_as('00000000-0000-4000-8000-000000000002');
select throws_ok($$select public.swap_building_photo_order(800003, 800001)$$,
  '42501', null, '목록에 없는 계정은 자리를 바꾸지 못한다');
select results_eq(
  $$select id from public.building_photos where building_id = 900001 order by sort_order$$,
  $$values (800003), (800001), (800004), (800005)$$,
  '거부된 맞바꾸기는 순서를 바꾸지 않는다');

-- authenticated에서 anon으로 바로 바꿀 수 없어 먼저 되돌린다
reset role;
set local role anon;
select throws_ok($$select public.swap_building_photo_order(800003, 800001)$$,
  '42501', null, '방문자는 맞바꾸기 함수를 부를 수 없다');

-- Supabase 기본 권한이 새 함수에 준 실행 권한을 회수했다
reset role;
set local role service_role;
select throws_ok($$select public.swap_building_photo_order(800003, 800001)$$,
  '42501', null, '서비스 키로도 맞바꾸기 함수를 부르지 않는다');

reset role;
select * from finish();
rollback;
