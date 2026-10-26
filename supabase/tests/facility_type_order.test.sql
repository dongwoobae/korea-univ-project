-- 설계: docs/specs/2026-10-26-facility-type-management-design.md 3.2·4.2
-- 동시 맞바꾸기는 한 세션인 pgTAP으로 볼 수 없다. 잠금 순서(잠금 → for update 읽기 → 판정)는 함수 본문으로 본다.
begin;
select plan(18);

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000000001', 'admin@example.com'),
  ('00000000-0000-4000-8000-000000000002', 'stranger@example.com');
insert into public.admin_users (user_id, display_name)
values ('00000000-0000-4000-8000-000000000001', '관리자');

create function pg_temp.act_as(person uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', person, 'role', 'authenticated')::text, true);
end;
$$;

-- 번호를 직접 준 행(아래 9xx)을 넣기 전에 본다. 화면은 번호를 주지 않는다.
insert into public.facility_types (code, label) values ('zz_next', '다음 번호');
select ok(
  (select sort_order from public.facility_types where code = 'zz_next')
    > (select max(sort_order) from public.facility_types where code <> 'zz_next'),
  '번호 없이 넣은 종류는 가장 큰 번호보다 뒤다');

select throws_ok(
  format($$insert into public.facility_types (code, label, sort_order) values ('zz_dup', '겹침', %s)$$,
    (select sort_order from public.facility_types where code = 'zz_next')),
  '23505', null, '같은 번호를 두 종류에 둘 수 없다');

select has_function('public', 'swap_facility_type_order', array['text', 'text'], '맞바꾸기 함수가 있다');
select is(
  (select prosecdef from pg_proc where oid = 'public.swap_facility_type_order(text, text)'::regprocedure),
  false, '맞바꾸기 함수는 호출자 권한으로 돈다');

-- 순서: zz_a(901) zz_b(902) zz_c(904). 903은 비어 있다
insert into public.facility_types (code, label, sort_order) values
  ('zz_a', '가', 901), ('zz_b', '나', 902), ('zz_c', '다', 904);

set local role authenticated;
select pg_temp.act_as('00000000-0000-4000-8000-000000000001');
select lives_ok($$select public.swap_facility_type_order('zz_a', 'zz_b')$$, '관리자는 이웃한 두 종류의 자리를 바꾼다');
select results_eq(
  $$select code from public.facility_types where code in ('zz_a', 'zz_b', 'zz_c') order by sort_order$$,
  $$values ('zz_b'::text), ('zz_a'), ('zz_c')$$,
  '맞바꾼 두 종류만 자리가 바뀐다');
reset role;
select is(
  (select count(*)::int from public.activity_logs
   where target_table = 'facility_types' and action = 'update' and changes ? 'sort_order'),
  2, '맞바꾸기 한 번에 순서 변경 기록이 두 줄 남는다');

-- 순서: zz_b(901) zz_a(902) zz_c(904)
set local role authenticated;
select pg_temp.act_as('00000000-0000-4000-8000-000000000001');
select lives_ok($$select public.swap_facility_type_order('zz_a', 'zz_c')$$, '번호 사이가 비어도 사이에 종류가 없으면 이웃이다');
-- 순서: zz_b(901) zz_c(902) zz_a(904)
select throws_ok($$select public.swap_facility_type_order('zz_b', 'zz_a')$$,
  'PT409', null, '사이에 다른 종류가 있으면 바꾸지 않는다');
-- 오래된 화면에서 같은 쌍을 다시 누르면 앞뒤가 뒤집혀 들어온다. 그대로 바꾸면 앞서 바꾼 것을 몰래 되돌린다.
select throws_ok($$select public.swap_facility_type_order('zz_c', 'zz_b')$$,
  'PT409', null, '앞 종류가 지금 뒤에 있으면 바꾸지 않는다');
select throws_ok($$select public.swap_facility_type_order('zz_b', 'zz_b')$$,
  '22023', null, '같은 종류끼리는 바꾸지 않는다');
select throws_ok($$select public.swap_facility_type_order('zz_b', 'zz_missing')$$,
  'P0002', null, '없는 종류와는 바꾸지 않는다');
select throws_ok($$select public.swap_facility_type_order('zz_missing', 'zz_b')$$,
  'P0002', null, '앞 종류가 없어도 바꾸지 않는다');

select pg_temp.act_as('00000000-0000-4000-8000-000000000002');
select throws_ok($$select public.swap_facility_type_order('zz_b', 'zz_c')$$,
  '42501', null, '목록에 없는 계정은 자리를 바꾸지 못한다');
select results_eq(
  $$select code from public.facility_types where code in ('zz_a', 'zz_b', 'zz_c') order by sort_order$$,
  $$values ('zz_b'::text), ('zz_c'), ('zz_a')$$,
  '거부된 맞바꾸기는 순서를 바꾸지 않는다');

-- authenticated에서 anon으로 바로 바꿀 수 없어 먼저 되돌린다
reset role;
set local role anon;
select throws_ok($$select public.swap_facility_type_order('zz_b', 'zz_c')$$,
  '42501', null, '방문자는 맞바꾸기 함수를 부를 수 없다');

-- Supabase 기본 권한이 새 함수에 준 실행 권한을 회수했다
reset role;
set local role service_role;
select throws_ok($$select public.swap_facility_type_order('zz_b', 'zz_c')$$,
  '42501', null, '서비스 키로도 맞바꾸기 함수를 부르지 않는다');

reset role;
select ok(
  (select condeferrable from pg_constraint where conname = 'facility_types_sort_order_key'),
  '순서 유일 제약은 맞바꾸기 한 문장이 끝날 때 검사한다');

select * from finish();
rollback;
