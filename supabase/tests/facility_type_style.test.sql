-- 설계: docs/specs/2026-10-26-facility-type-management-design.md 1.1·1.2
-- 빈 DB에도 멘토링 ② 마이그레이션이 넣은 restroom·student_lounge가 있다.
begin;
select plan(7);

select is(
  (select (icon, color) from public.facility_types where code = 'restroom'),
  ('toilet'::text, '#2F7A4F'::text),
  '화장실은 지금 코드와 같은 아이콘·색을 받는다');

select is(
  (select (icon, color) from public.facility_types where code = 'student_lounge'),
  ('sofa'::text, '#0F766E'::text),
  '장애학생 휴게실은 소파·청록을 받는다');

insert into public.facility_types (code, label) values ('test_style', '시험 종류');
select is(
  (select (icon, color) from public.facility_types where code = 'test_style'),
  ('accessibility'::text, '#666666'::text),
  '아이콘·색 없이 넣은 종류는 대체값을 받는다');

select throws_ok(
  $$insert into public.facility_types (code, label, color) values ('bad_name', '나쁨', 'red')$$,
  '23514', null, '색 이름은 거부한다');
select throws_ok(
  $$insert into public.facility_types (code, label, color) values ('bad_short', '나쁨', '#fff')$$,
  '23514', null, '세 자리 색은 거부한다');
select throws_ok(
  $$insert into public.facility_types (code, label, color) values ('bad_lower', '나쁨', '#0f766e')$$,
  '23514', null, '소문자 색은 거부한다');

select col_not_null('public', 'facility_types', 'icon', '아이콘 칸은 비지 않는다');

select * from finish();
rollback;
