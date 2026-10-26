-- 설계: docs/specs/2026-10-26-facility-type-management-design.md 1.1·1.2
-- 아이콘 키는 목록을 코드(facilityStyleCatalog.ts)에 두어 DB가 검사하지 않는다. 모르는 키는 화면이 대체 아이콘으로 그린다.
alter table public.facility_types
  add column icon text not null default 'accessibility',
  add column color text not null default '#666666',
  add constraint facility_types_color_check check (color ~ '^#[0-9A-F]{6}$');

-- 화면이 바뀌지 않게 2026-10-26 코드 매핑(mapIcons.ts·theme.ts) 값 그대로 옮긴다. 아이콘·색이 정해진 기록은 남긴다.
update public.facility_types as ft
set icon = style.icon, color = style.color
from (values
  ('restroom', 'toilet', '#2F7A4F'),
  ('ramp', 'trending-up', '#B25617'),
  ('parking', 'square-parking', '#6D4AB0'),
  ('elevator', 'elevator', '#2D5FB0'),
  ('student_lounge', 'sofa', '#0F766E'),
  ('braille', 'grip-vertical', '#8A6A00')
) as style (code, icon, color)
where ft.code = style.code;
