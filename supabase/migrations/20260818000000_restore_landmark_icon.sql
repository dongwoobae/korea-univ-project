-- 명소 아이콘을 lucide 단일화에서 이모지로 되돌리면서 컬럼을 되살린다.
-- 20260813000000_drop_icon_columns.sql이 지운 것을 앞으로 되돌리는 것이라
-- 그 파일은 수정하지 않는다.
alter table landmarks add column if not exists icon text;
alter table landmarks alter column icon set default '✨';

update landmarks set icon = '🐿️' where name = '다람쥐길';
update landmarks set icon = '🌳' where name = '애기능';
update landmarks set icon = '🌸' where name = '참살이길';
update landmarks set icon = '🕊️' where name = '민주광장';

update landmarks set icon = '✨' where icon is null;

alter table landmarks alter column icon set not null;

-- 폼의 maxLength는 클라이언트 전용이고 RLS가 with check (true)라 REST로 긴
-- 문자열이 들어올 수 있다. 그 값은 공개 지도의 divIcon innerHTML로 간다.
alter table landmarks drop constraint if exists landmarks_icon_length;
alter table landmarks
  add constraint landmarks_icon_length check (char_length(icon) <= 8);
