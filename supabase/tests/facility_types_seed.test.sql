-- 설계: docs/specs/2026-10-25-mentoring-feedback-design.md 4.2
-- DB 테스트의 DB는 마이그레이션 때 비어 있어 빈 DB 결과만 본다. 운영 행의 순서 채우기, 이미 있던 이름 지키기, 시설 이름 바꾸기는 병합 뒤 운영에서 확인한다.
begin;
select plan(7);

select has_column('public', 'facility_types', 'sort_order', '시설 종류에 순서 칸이 있다');
select col_not_null('public', 'facility_types', 'sort_order', '순서 칸은 비지 않는다');

select is(
  (select (label, label_en, label_zh) from public.facility_types where code = 'restroom'),
  ('장애인용 화장실'::text, 'Accessible Restroom'::text, '无障碍卫生间'::text),
  '빈 DB에는 장애인용 화장실을 운영과 같은 영어·중국어 이름으로 넣는다');

select is(
  (select (label, label_en, label_zh) from public.facility_types where code = 'student_lounge'),
  ('장애학생 휴게실'::text, 'Lounge for Students with Disabilities'::text, '残障学生休息室'::text),
  '장애학생 휴게실 종류가 세 언어 이름으로 있다');

select ok(
  (select sort_order from public.facility_types where code = 'student_lounge')
    > (select sort_order from public.facility_types where code = 'restroom'),
  '장애학생 휴게실은 화장실보다 뒤다');

insert into public.facility_types (code, label) values ('test_type', '시험 종류');
select ok(
  (select sort_order from public.facility_types where code = 'test_type')
    > (select max(sort_order) from public.facility_types where code <> 'test_type'),
  '번호 없이 넣은 종류는 맨 뒤 번호를 받는다');

select is(
  (select count(*) from public.facility_types where label = '장애인 화장실'),
  0::bigint,
  '옛 이름의 종류가 남지 않는다');

select * from finish();
rollback;
