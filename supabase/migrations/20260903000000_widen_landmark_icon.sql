-- 관리자 이모지 입력이 피커로 바뀌면서 목록의 모든 이모지를 고를 수 있어야 한다.
-- 8로 두면 95건이 고를 수 없는 상태가 되는데 그 이유가 화면에 드러나지 않는다.
-- 현재 데이터의 최댓값은 10코드포인트다.
--
-- 이 제약은 길이만 본다. 이모지가 아닌 값은 렌더 시점의 landmarkEmoji가 막는다 --
-- docs/specs/2026-09-03-landmark-emoji-picker-design.md의 "렌더 가드" 절.
alter table landmarks drop constraint if exists landmarks_icon_length;
alter table landmarks
  add constraint landmarks_icon_length check (char_length(icon) <= 16);
