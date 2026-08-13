-- 이모지 아이콘을 lucide 렌더링으로 대체하면서 두 컬럼을 읽는 코드가 사라졌다.
-- 읽기 제거는 PR #11에서 배포됐고, 여기서 쓰기와 컬럼을 함께 걷는다.
alter table landmarks
  drop column if exists icon;

alter table facility_types
  drop column if exists icon;
