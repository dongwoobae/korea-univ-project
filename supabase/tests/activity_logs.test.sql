-- 설계: docs/specs/2026-10-19-activity-log-design.md 2장, 8.3
begin;
select plan(16);

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000000001', 'admin@example.com'),
  ('00000000-0000-4000-8000-000000000002', 'stranger@example.com');
insert into public.admin_users (user_id, display_name)
values ('00000000-0000-4000-8000-000000000001', '관리자');
insert into public.activity_logs (level, kind, actor_kind, actor_label, action)
values ('error', 'failure', 'system', '시험', 'facility_photo.upload');

create function pg_temp.act_as(person uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', person, 'role', 'authenticated')::text, true);
end;
$$;

select pg_temp.act_as('00000000-0000-4000-8000-000000000001');
select ok(public.is_admin(), '목록에 있는 계정은 is_admin()이 참');
select pg_temp.act_as('00000000-0000-4000-8000-000000000002');
select ok(not public.is_admin(), '목록에 없는 계정은 is_admin()이 거짓');

set local role authenticated;
select pg_temp.act_as('00000000-0000-4000-8000-000000000001');
select ok((select count(*) from public.activity_logs) > 0, '관리자는 로그를 읽는다');
select throws_ok(
  $$insert into public.activity_logs (level, kind, actor_kind, actor_label, action)
    values ('info', 'change', 'admin', 'x', 'insert')$$,
  '42501', null, '관리자도 로그를 넣지 못한다');
select throws_ok($$update public.activity_logs set level = 'info'$$,
  '42501', null, '관리자도 로그를 고치지 못한다');
select throws_ok($$delete from public.activity_logs$$,
  '42501', null, '관리자도 로그를 지우지 못한다');
select throws_ok($$select * from public.admin_users$$,
  '42501', null, 'authenticated는 admin_users를 직접 읽지 못한다');
select pg_temp.act_as('00000000-0000-4000-8000-000000000002');
select is((select count(*) from public.activity_logs), 0::bigint,
  '목록에 없는 계정은 로그를 하나도 읽지 못한다');
reset role;

set local role anon;
select throws_ok($$select * from public.activity_logs$$,
  '42501', null, 'anon은 로그를 읽지 못한다');
select throws_ok($$select public.is_admin()$$,
  '42501', null, 'anon은 is_admin()을 부르지 못한다');
reset role;

set local role service_role;
select lives_ok(
  $$insert into public.activity_logs (level, kind, actor_kind, actor_label, action)
    values ('error', 'failure', 'visitor', '방문자', 'feedback.submit')$$,
  'service_role은 로그를 넣는다');
select throws_ok($$update public.activity_logs set level = 'info'$$,
  'P0001', 'activity_logs is append-only', 'service_role도 로그를 고치지 못한다');
select throws_ok($$delete from public.activity_logs$$,
  'P0001', 'activity_logs is append-only', 'service_role도 로그를 지우지 못한다');
select throws_ok($$truncate public.activity_logs$$,
  'P0001', 'activity_logs is append-only', 'service_role도 로그를 비우지 못한다');
reset role;

select throws_ok(
  $$insert into public.admin_users (user_id, display_name)
    values ('00000000-0000-4000-8000-000000000002', '   ')$$,
  '23514', null, '공백만 있는 표시 이름은 거부한다');
select throws_ok(
  $$insert into public.admin_users (user_id, display_name)
    values ('00000000-0000-4000-8000-000000000002', repeat('가', 21))$$,
  '23514', null, '21자 표시 이름은 거부한다');

select * from finish();
rollback;
