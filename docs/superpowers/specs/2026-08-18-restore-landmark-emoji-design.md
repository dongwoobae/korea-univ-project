# 명소 아이콘 이모지 복원 설계

2026-08-18

## 배경

PR #10~#12에서 공개 지도와 관리자 화면의 이모지를 lucide로 바꾸면서 명소
아이콘은 전부 `Sparkles` 하나로 단일화하고 `landmarks.icon` 컬럼을 drop했다
(`2026-08-13-public-map-lucide-icons-design.md`). 그 뒤 명소마다 다르던
이모지를 되돌려 달라는 요청이 들어왔다.

lucide 1.31.0에 `squirrel`·`flower`·`tree-deciduous`·`bird`가 모두 있어 명소별
구분만 되살리는 선택지도 있었으나, 15px 마커에서의 판독성과 원래 모양을
근거로 이모지 자체를 복원하기로 정했다.

## 범위

- `landmarks.icon` 컬럼과 관리자 명소 폼의 이모지 입력을 되살린다.
- 개별 명소를 그리는 5개 지점만 이모지로 바꾼다.
- `facility_types.icon`은 되살리지 않는다. 시설 유형은 5종 고정 유니온이고
  `code → lucide` 매핑이 정상 동작 중이라 요청 범위 밖이다.
- 카테고리를 뜻하는 2개 지점(명소 클러스터, 명소 필터 토글)은 lucide를
  유지한다.

## 결정 사항

| 결정              | 채택                                | 기각한 대안과 이유                                                                                                                                |
| ----------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| 아이콘 형태       | 이모지 복원                         | 명소별 lucide 매핑 — 15px 마커에서 `squirrel`은 선이 많아 뭉개지고, 요청은 원래 모양 자체였다                                                     |
| 컬럼 제약         | `text not null default '✨'`        | `not null` + default 없음(원래 스키마) — 2-B에서 명소 생성이 깨지는 원인이었다. nullable — DB가 값을 보장하지 않아 빈 아이콘 상태가 조용히 생긴다 |
| 잃어버린 4건 복구 | 마이그레이션에서 이름 기준 backfill | 관리자 수기 재입력 — 4건뿐이라 가능하지만 배포와 분리되어 누락되기 쉽다                                                                           |
| 카테고리 아이콘   | lucide `Sparkles` 유지              | ✨ 이모지로 통일 — 특정 명소가 아니라 이모지를 고를 근거가 없고, 테마 색(#C08A2D) 상속을 잃는다                                                   |
| 마커 아이콘 운반  | `MapBrowseItem`에 `icon` 필드 추가  | 기존 `code` 재사용 — `code`는 시설 코드 전용이라 의미가 섞인다                                                                                    |

## 스키마

`supabase/migrations/20260818000000_restore_landmark_icon.sql`

```sql
alter table landmarks
  add column if not exists icon text not null default '✨';

update landmarks set icon = '🐿️' where name = '다람쥐길';
update landmarks set icon = '🌳' where name = '애기능';
update landmarks set icon = '🌸' where name = '참살이길';
update landmarks set icon = '🕊️' where name = '민주광장';
```

`drop_icon_columns` 마이그레이션은 수정하지 않는다. `check-migrations.sh`가
기존 파일 수정을 막고, 이력은 그대로 두고 앞으로 되돌리는 것이 맞다.

**배포 순서 위험이 없다.** default가 있어 마이그레이션이 프론트 배포보다 먼저
적용돼도 옛 프론트의 명소 생성이 깨지지 않는다. 컬럼을 읽는 코드는 새 프론트가
배포된 뒤에 생긴다. PR #12가 감수했던 창의 반대 방향이다.

**backfill은 이름 완전일치로 걸린다.** 저장된 이름이 위와 다르면 그 행만
`✨`로 남고, 관리자 폼에서 고칠 수 있다. 로컬에 DB 접근 수단이 없어 배포 전
실측은 하지 못했다.

## 타입

`supabase/database.types.ts`의 `landmarks` Row/Insert/Update에 `icon`을
되살린다(Row `string`, Insert/Update `string?`). `Landmark`는 Row 별칭이라
이 편집만으로 모든 소비 지점에 타입이 돌아온다. 로컬에 supabase CLI가 없어
수기 편집 후 typecheck로 검증한다 — PR #12에서 걷어낼 때와 같은 방식이다.

조회는 두 곳 모두 `select("*")`라 쿼리 변경이 필요 없다
(`src/app/api/landmarks/route.ts`, `src/app/admin/dashboard/landmarks/page.tsx`).

## 렌더링

개별 명소 5개 지점이 `landmark.icon`을 출력한다.

| 지점                                      | 변경                                           |
| ----------------------------------------- | ---------------------------------------------- |
| `LandmarkMarkers.tsx` 마커 divIcon        | `sizedIconSvg(...)` → 이모지, `font-size` 지정 |
| `LandmarkMarkers.tsx` 팝업                | `<LandmarkIcon>` → 이모지                      |
| `MapBrowseList.tsx`                       | `MapBrowseItem.icon`을 출력                    |
| `SearchControl.tsx` 검색 결과 2곳         | `result.landmark.icon`                         |
| `admin/dashboard/landmarks/page.tsx` 목록 | 행의 `landmark.icon`                           |

divIcon은 HTML 문자열이라 `escapeHtml`을 거쳐야 한다. 기존 `name` 처리와 같다.

lucide SVG는 `stroke="currentColor"`로 색을 상속했지만 이모지는 자체 색이라
마커의 `color: #C08A2D`가 더 이상 아이콘에 걸리지 않는다. 마커 테두리·라벨
색은 그대로 두고 아이콘만 이모지 색으로 뜬다.

`LANDMARK_ICON`(`iconography.tsx`)과 `LANDMARK_ICON_SVG`(`mapIcons.ts`)는
남기되 의미가 **명소 카테고리 아이콘**으로 좁아진다. 클러스터와 필터 토글이
소비자다.

## 관리자 폼

`LandmarkFormModal.tsx`에 이모지 입력란·필수 검증·저장 페이로드를 되살린다.
초기값 `✨`, `maxLength=4`.

## 캐시

공개 API는 `revalidate = 3600`이지만 관리자 저장·생성·삭제가
`/api/revalidate-landmarks`를 호출해 `revalidatePath("/api/landmarks")`를
실행한다. 백필된 값은 배포 직후부터 나가고, 빗나간 행을 폼에서 고치면 즉시
반영된다. 사용자 브라우저에 남은 응답은 새로고침 한 번이 필요할 수 있다.

## 테스트 영향

- `mapIcons.test.ts`·`iconography.test.ts`의 `LANDMARK_ICON_SVG` = sparkles
  단언은 유지한다. 대상이 카테고리 아이콘으로 좁아진 것을 이름·문구에 반영한다.
- e2e `mockBackend`의 명소 픽스처에 `icon`을 되살리고, 명소 마커에 이모지가
  보이는지 단언을 더한다. `projectEmbeds`가 select 누락 회귀를 잡는다.
- 백필 결과는 배포 후 관리자 목록에서 4건을 눈으로 확인한다. SQL이 조용히
  0행을 갱신해도 마이그레이션은 성공하므로 자동 검증 수단이 없다.

## 참고

- 명소 ↔ 이모지 대응: 다람쥐길 🐿️ · 애기능 🌳 · 참살이길 🌸 · 민주광장 🕊️
- 되돌리는 커밋: `ea50959`(관리자 읽기 제거), `9760976`(쓰기 제거 + drop)
