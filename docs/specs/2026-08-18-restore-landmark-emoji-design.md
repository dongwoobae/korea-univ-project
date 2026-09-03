# 명소 아이콘 이모지 복원 설계

2026-08-18

> **일부 갱신 (2026-09-03)** — 아래 본문은 2026-08-18 시점의 기록이다.
> 관리자 이모지 입력을 피커로 바꾸면서 다음 값이 바뀌었다.
> `2026-09-03-landmark-emoji-picker-design.md`를 본다.
>
> | 항목                    | 이 문서     | 현재                         |
> | ----------------------- | ----------- | ---------------------------- |
> | `landmarks_icon_length` | 8           | 16                           |
> | 관리자 이모지 입력      | 자유 텍스트 | 피커에서 선택                |
> | 폼 `maxLength`          | 4           | 없음 (입력 칸 자체가 없어짐) |
>
> 저장 형식(이모지 문자 그대로)·컬럼 제약의 `not null default`·개별 명소
> 5개 지점이라는 범위는 이 문서대로 유지된다.

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

| 결정              | 채택                                      | 기각한 대안과 이유                                                                                                                                   |
| ----------------- | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| 아이콘 형태       | 이모지 복원                               | 명소별 lucide 매핑 — 15px 마커에서 `squirrel`은 선이 많아 뭉개지고, 요청은 원래 모양 자체였다                                                        |
| 저장 형식         | 이모지 문자열 그대로                      | 의미 키(`icon_key`) 저장 + 프론트 매핑 — 관리자를 고정 목록에 가둬 자유 입력이라는 원래 기능을 축소한다. 명소 4건짜리 내부 도구에 매핑 계층은 과하다 |
| 컬럼 제약         | `not null default` + 길이 `check`         | `not null` + default 없음(원래 스키마) — 2-B에서 명소 생성이 깨지는 원인이었다. nullable — DB가 값을 보장하지 않아 빈 아이콘 상태가 조용히 생긴다    |
| 잃어버린 4건 복구 | 마이그레이션에서 이름 기준 backfill       | 관리자 수기 재입력 — 4건뿐이라 가능하지만 배포와 분리되어 누락되기 쉽다                                                                              |
| 카테고리 아이콘   | lucide `Sparkles` 유지                    | 이모지로 통일 — 특정 명소가 아니라 이모지를 고를 근거가 없고, 테마 색(#C08A2D) 상속을 잃는다                                                         |
| 마커 아이콘 운반  | `MapBrowseItem`에 `icon` 필드 추가        | 기존 `code` 재사용 — `code`는 시설 코드 전용이라 의미가 섞인다                                                                                       |
| 배포 창 처리      | 읽기는 폴백으로 방어, 쓰기 실패 창은 감수 | 3단계 배포 — 명소 4건짜리 내부 도구에 배포를 셋으로 쪼갤 이득이 없다. PR #12도 같은 판단을 했다                                                      |

## 스키마

`supabase/migrations/20260818000000_restore_landmark_icon.sql`

```sql
alter table landmarks add column if not exists icon text;
alter table landmarks alter column icon set default '✨';

update landmarks set icon = '🐿️' where name = '다람쥐길';
update landmarks set icon = '🌳' where name = '애기능';
update landmarks set icon = '🌸' where name = '참살이길';
update landmarks set icon = '🕊️' where name = '민주광장';

update landmarks set icon = '✨' where icon is null;

alter table landmarks alter column icon set not null;

alter table landmarks drop constraint if exists landmarks_icon_length;
alter table landmarks
  add constraint landmarks_icon_length check (char_length(icon) <= 8);
```

`add column if not exists` 하나로 끝내지 않는 이유는, 그 구문이 컬럼이 이미
있으면 **아무것도 하지 않아** default·not null·check 보강을 건너뛰기 때문이다.
drop 마이그레이션을 적용하지 않은 환경에는 default 없는 `icon text not null`이
남아 있어 스키마가 갈린다(`20260720000000_create_landmarks.sql`). 단계를 나눠
어느 상태에서 시작해도 같은 곳으로 수렴하게 한다.

길이 `check`를 두는 이유는 `maxLength`가 폼에만 있고 RLS는 `with check (true)`라
REST로 직접 긴 문자열을 넣을 수 있기 때문이다. 그 값은 공개 지도의 divIcon
`innerHTML`로 들어간다. `escapeHtml`이 꺾쇠·따옴표·앰퍼샌드를 막아 스크립트
주입은 성립하지 않지만, 거대한 텍스트 노드가 지도를 가릴 수 있다. ZWJ로 이어진
이모지가 4코드포인트를 넘길 수 있어 폼의 `maxLength`보다 여유를 둔다.

`drop_icon_columns` 마이그레이션은 수정하지 않는다. `check-migrations.sh`가
기존 파일 수정을 막고, 이력은 그대로 두고 앞으로 되돌리는 것이 맞다.

### 배포 순서

**두 방향 모두 창이 생기며, 프론트가 먼저 뜨는 쪽이 유력하다.** 마이그레이션은
`ci.yml`의 적용 job이 `migration-safety`·`lint`·`format`·`typecheck`·`test`·`e2e`를
전부 기다린 뒤 실행하는데, Vercel 배포는 그 체인을 기다리지 않는다.

| 순서              | 무엇이 깨지나                                                                             |
| ----------------- | ----------------------------------------------------------------------------------------- |
| 마이그레이션 먼저 | 아무것도. default가 있어 옛 프론트의 insert가 산다                                        |
| **프론트 먼저**   | (1) 새 폼이 `icon`을 보내 명소 저장 실패 (2) `/api/landmarks`에 `icon`이 없어 렌더가 위험 |

(2)를 막기 위해 **읽는 쪽은 값이 없을 때 기본 이모지로 떨어진다.** 컬럼이
`not null`이라 타입은 `string`이지만, 이 창에서는 런타임에 필드 자체가 오지
않는다 — 타입을 믿고 `escapeHtml(landmark.icon)`을 그대로 부르면
`undefined.replaceAll`로 공개 지도 마커가 통째로 깨진다. 폴백은 이 창을 위한
것이지 방어적 습관이 아니다.

(1)은 감수한다. 명소 4건짜리 내부 도구이고 창은 배포 한 번 걸리는 몇 분이다.

**backfill은 이름 완전일치로 걸린다.** 저장된 이름이 위와 다르면 그 행만
기본값으로 남고, 관리자 폼에서 고칠 수 있다. 로컬에 DB 접근 수단이 없어 배포
전 실측은 하지 못했다. `name`에 unique 제약이 없어 동명 행이 있으면 둘 다 같은
이모지로 덮인다.

## 타입

`supabase/database.types.ts`의 `landmarks` Row/Insert/Update에 `icon`을
되살린다(Row `string`, Insert/Update `string?`). `Landmark`는 Row 별칭이라
이 편집만으로 모든 소비 지점에 타입이 돌아온다. 로컬에 supabase CLI가 없어
수기 편집 후 typecheck로 검증한다 — PR #12에서 걷어낼 때와 같은 방식이다.

조회는 두 곳 모두 `select("*")`라 쿼리 변경이 필요 없다
(`src/app/api/landmarks/route.ts`, `src/app/admin/dashboard/landmarks/page.tsx`).

## 렌더링

개별 명소 5개 지점이 `landmark.icon`을 출력한다. 값이 없으면 기본 이모지로
떨어진다(위 "배포 순서" 참조).

| 지점                                      | 변경                                           |
| ----------------------------------------- | ---------------------------------------------- |
| `LandmarkMarkers.tsx` 마커 divIcon        | `sizedIconSvg(...)` → 이모지, `font-size` 지정 |
| `LandmarkMarkers.tsx` 팝업                | `<LandmarkIcon>` → 이모지                      |
| `MapBrowseList.tsx`                       | `MapBrowseItem.icon`을 출력                    |
| `SearchControl.tsx` 검색 결과             | `result.landmark.icon`                         |
| `admin/dashboard/landmarks/page.tsx` 목록 | 행의 `landmark.icon`                           |

`MapBrowseItem`은 생산자도 함께 바꾼다 — `Map.tsx`의 `landmarkBrowseItem()`이
지금 `code: null`만 넣고 있어, 타입에 `icon`을 더하는 것만으로는 값이 흐르지
않는다.

`SearchControl.tsx`에서 `result.kind === "landmark"` 분기는 둘이지만 아이콘을
그리는 것은 앞의 하나뿐이다. 뒤의 분기는 `landmarkToggle` 텍스트 태그라 손대지
않는다.

**divIcon 캐시 키에 `icon`을 넣어야 한다.** 지금 키가 id·이름·라벨 표시 여부로
만들어져, 이름을 그대로 두고 이모지만 바꾸면 캐시된 옛 마커가 그대로 나온다
(`LandmarkMarkers.tsx`의 `cachedIcon`).

divIcon은 HTML 문자열이라 `escapeHtml`을 거쳐야 한다. 기존 이름 처리와 같다.

lucide SVG는 `stroke="currentColor"`로 색을 상속했지만 이모지는 자체 색이라
마커의 `color: #C08A2D`가 더 이상 아이콘에 걸리지 않는다. 마커 테두리·라벨
색은 그대로 두고 아이콘만 이모지 색으로 뜬다.

`LANDMARK_ICON_SVG`(`mapIcons.ts`)와 `LANDMARK_ICON`(`iconography.tsx`)은
**명소 카테고리 아이콘**만 뜻하게 되므로 `LANDMARK_CATEGORY_ICON_SVG`·
`LANDMARK_CATEGORY_ICON`으로 이름을 바꾼다. 소비자는 클러스터와 필터 토글
둘뿐이다. 이름을 두면 개별 명소용 `landmarkEmoji`와 구분이 안 돼, 다섯 렌더
지점에서 잘못 고르기 쉽다. 소비자가 필터 토글 하나만 남으면 `LandmarkIcon`을
`LandmarkCategoryIcon`으로 이름을 바꾼다. 같은 파일에 네 JSX 렌더 지점이 공유할
`LandmarkEmoji`를 새로 둔다. `divIcon`은 HTML 문자열을 요구해 그 경로만
`landmarkEmoji()`를 직접 부른다.

## 관리자 폼

`LandmarkFormModal.tsx`에 이모지 입력란·필수 검증·저장 페이로드를 되살린다.
초기값과 `maxLength`는 걷어내기 전과 같다. 길이의 진짜 상한은 DB `check`가 쥔다.

## 캐시

공개 API는 `revalidate = 3600`이지만 관리자 저장·생성·삭제가
`/api/revalidate-landmarks`를 호출해 `revalidatePath("/api/landmarks")`를
실행한다. 백필된 값은 배포 직후부터 나가고, 빗나간 행을 폼에서 고치면 보통
바로 반영된다.

다만 **무효화 실패는 관리자에게 보이지 않는다.** 호출부가 결과를 버리는 데다
401·500은 fetch가 reject하지 않아 애초에 그 catch에도 걸리지 않는다. 무효화가
실패하면 관리자는 성공 토스트를 보지만 공개 지도는 최대 1시간 옛 값을 계속
보여준다. 실패를 드러내는 일은 이 작업 범위 밖의 후속 항목으로 남긴다.

사용자 브라우저에 남은 응답은 새로고침 한 번이 필요할 수 있다.

## 테스트 영향

- **`e2e/admin-content.spec.ts`가 이모지 입력란이 없다고 단언한다** — 폼을
  되살리면 반드시 깨진다. 입력란이 0개라는 단언과 그 이유를 적은 주석을 함께
  뒤집고, 입력값이 저장되는지를 단언한다.
- **`e2e/public-map.spec.ts`가 명소 마커 안의 `svg.lucide-sparkles`를 단언한다** —
  개별 마커가 이모지로 바뀌면 깨진다. 이모지 텍스트 단언으로 바꾼다. 이것이
  저장소 전체에서 lucide 명소 아이콘을 보던 유일한 e2e 단언이라, 뒤집고 나면
  클러스터가 여전히 `Sparkles`를 그리는지 확인하는 단언이 하나도 남지 않는다.
  그 자리를 메우는 것은 별건으로 둔다 — 클러스터가 뜨는 줌 상태를 만들어야 한다.
- `mapIcons.test.ts`·`iconography.test.ts`의 `LANDMARK_CATEGORY_ICON_SVG` = sparkles
  단언은 유지한다. 대상이 카테고리 아이콘으로 좁아진 것을 이름·문구에 반영한다.
- e2e `mockBackend`의 명소 픽스처에 `icon`을 되살리고, 명소 마커에 이모지가
  보이는지 단언을 더한다.
- 값이 없을 때 기본 이모지로 떨어지는지 단위 테스트로 고정한다. 배포 창에서만
  나는 상태라 e2e로 재현하기 어렵다.
- 백필 결과는 배포 후 관리자 목록에서 4건을 눈으로 확인한다. SQL이 조용히
  0행을 갱신해도 마이그레이션은 성공하므로 자동 검증 수단이 없다.

`mockBackend`의 `projectEmbeds`는 이 작업에서 아무것도 잡아주지 않는다. 단건
임베드 객체만 좁히고 최상위 컬럼은 그대로 내보내며, `/api/landmarks` 목은
픽스처를 통째로 돌려준다. 애초에 두 조회가 `select("*")`라 누락될 select 목록도
없다.

## 참고

- 명소 ↔ 이모지 대응: 다람쥐길 🐿️ · 애기능 🌳 · 참살이길 🌸 · 민주광장 🕊️
- 되돌리는 커밋: `ea50959`(관리자 읽기 제거), `9760976`(쓰기 제거 + drop)
