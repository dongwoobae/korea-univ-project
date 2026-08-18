# 공개 지도 lucide 아이콘 전환 + 데스크톱 텍스트 라벨 설계

2026-08-13

> **번복 (2026-08-18)** — 아래 "명소 아이콘 = 전부 `Sparkles` 단일화" 결정을
> 뒤집기로 정했다. 명소는 이모지로 되돌리고 `landmarks.icon` 컬럼도 되살린다.
> 카테고리 아이콘(명소 클러스터·명소 필터 토글)만 `Sparkles`로 남는다.
> `2026-08-18-restore-landmark-emoji-design.md`를 본다. 시설 유형 아이콘과 UI
> 컨트롤 아이콘은 이 문서대로 유지된다.

## 작업 재개 안내 (2026-08-13 기준)

1단계와 2-A는 main에 들어갔다. 남은 것은 이 문서 끝의 `FeedbackButton` 다국어화
하나다.

### 진행 상태

| 단계                        | 상태                                 |
| --------------------------- | ------------------------------------ |
| 1단계 (공개 지도)           | **PR #10** 머지 완료                 |
| 2-A (관리자 읽기 제거)      | **PR #11** 머지 완료                 |
| 2-B (쓰기 제거 + 컬럼 drop) | `drop-icon-columns` 브랜치에서 진행  |
| `FeedbackButton` 다국어화   | 미착수. 배포 순서와 무관한 독립 항목 |

머지된 브랜치는 로컬·원격 모두 지웠다. 계획서
`docs/superpowers/plans/2026-08-13-public-map-lucide-icons.md`도 규칙대로 회수했다
(PR #11에 포함).

### 이어받을 때 시간 낭비를 막아 줄 것들

- **디스크를 확인하고 시작한다.** 한때 C: 여유가 1.2GB까지 떨어져 전체 e2e 한 번이면 바닥날 상황이었다(2026-08-13에 50GB로 회복). `.next`·`.next-e2e`는 지워도 되는 캐시다.
- **`node_modules`가 뒤처져 있을 수 있다.** 이 브랜치에서 `lucide-react`·`lucide-static`이 새로 들어왔다. 설치가 밀리면 typecheck가 `TS2307 Cannot find module`로 12건 무너지고 단위 테스트 2파일이 collect 단계에서 실패한다 — 코드 문제로 오해하기 쉽다. `npm install`이 답이다.
- **`npm run format:check`를 전체로 돌리지 말 것.** Windows `core.autocrlf`가 작업 복사본을 CRLF로 바꿔 놓아 손대지 않은 파일 ~50개가 함께 실패한다. 커밋되는 내용은 LF이고 CI는 ubuntu라 실제로는 통과한다. 변경 파일만 `npx prettier --check --end-of-line auto <files>`로 본다.
- **Playwright `-g`는 테스트 제목 전체가 필요하다.** 부분 제목은 `No tests found`가 난다. 또 `npm run test:e2e -- … -g "여러 단어"`는 npm이 따옴표를 벗겨 인자를 쪼개므로 `npx playwright test`를 직접 쓴다.
- **`e2e/support/mockBackend.ts`는 PostgREST `select`의 임베드 투영을 흉내낸다**(`projectEmbeds`). GET/HEAD 경로에만 걸리고 POST 응답에는 걸리지 않으며, 배열 임베드와 최상위 컬럼은 투영하지 않는다. 이 덕분에 "select에서 컬럼을 빼먹은" 회귀가 e2e에 보인다 — 실제로 이 부류 버그를 두 번 잡았다.
- **접근성 트리를 CDP로 측정할 때 SVG를 `role === "img"`로 거르면 0건이 나와 오판한다.** Chromium은 `SvgRoot`·`graphics-symbol`·`image`로 보고한다.
- `PowerShell` 툴이 다른 리포에서 시작할 수 있다. 항상 `korea-univ-project`에서 실행한다.

## 배경

데스크톱 공개 지도에서 아이콘만 떠 있는 버튼(현위치·지도전환·피드백 등)이 무슨
기능인지 알 수 없다는 피드백을 받았다. 원인 분석 과정에서 아이콘이 전부 OS
의존적 이모지라는 문제도 확인했다: 플랫폼마다 모양이 다르고, 색을 테마에 맞출
수 없고, 기능 전달력이 낮다.

## 범위

- 공개 지도 페이지(`/`)의 모든 이모지 아이콘을 `lucide-react`로 교체한다.
  코드에 하드코딩된 UI 이모지와 DB에서 오는 데이터 이모지(시설 유형·명소)를
  모두 포함한다.
- 데스크톱 플로팅 버튼 3개(현위치·지도전환·피드백)에 항상 보이는 텍스트
  라벨을 추가한다.
- 관리자 페이지는 이번 PR에서 건드리지 않는다. DB 정리는 후속 PR(아래
  "2단계" 절)로 분리한다. 예외는 `Toast` 한 곳으로, 공개 지도의 위치 오류
  안내에 쓰이면서 관리자와 공용이다. 아이콘만 바뀌고 문구·역할·타이밍은
  그대로다.
- `SlopeLegend`의 `▶`와 사진 캐러셀의 점 인디케이터는 아이콘이 아니라
  타이포그래피·도형이라 손대지 않는다.

## 결정 사항

| 결정                  | 채택                                   | 기각한 대안과 이유                                                                                                                                            |
| --------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 아이콘 라이브러리     | `lucide-react` (ISC)                   | 타사 지도 앱 아이콘 복제(저작권 침해), Astryx(아이콘 세트가 아닌 디자인 시스템 전체 도입이라 과함)                                                            |
| 시설 유형 아이콘 소스 | 프론트 `code → lucide` 매핑, DB 무변경 | DB에 lucide 이름 저장 — 유형이 5종 고정 유니온이라 스키마·관리자 개편 비용 대비 이득 없음                                                                     |
| 명소 아이콘           | 전부 `Sparkles` 단일화                 | 이모지→lucide 매핑+폴백 — 미매핑 이모지가 남아 일관성이 깨짐. 명소는 이름·사진으로 식별 가능                                                                  |
| 라벨 형태             | 아이콘 아래 세로 라벨(데스크톱만)      | 가로 필 — 지도 가림 면적 증가. 호버 툴팁 — 보이는 텍스트를 달라는 피드백을 절반만 해결                                                                        |
| DB 정리 시점          | 후속 PR로 분리                         | 같은 PR에서 컬럼 drop — 마이그레이션은 CI가 main 머지 시 적용되는데 프론트 배포와 순서 보장이 없어, 옛 프론트가 drop된 컬럼을 `select`하면 공개 지도가 깨진다 |

## 아이콘 매핑

### UI 컨트롤 (하드코딩 이모지 → lucide)

| 현재        | 위치                                               | 대체                                                   |
| ----------- | -------------------------------------------------- | ------------------------------------------------------ |
| 📍          | 현위치 버튼                                        | `LocateFixed`                                          |
| 🛰️ / 🗺️     | 지도전환 버튼                                      | `Satellite` / `Map`                                    |
| 💬          | 피드백 버튼                                        | `MessageSquare`                                        |
| ＋ / −      | 줌                                                 | `Plus` / `Minus`                                       |
| 🔍 / × / 🎤 | 검색바                                             | `Search` / `X` / `Mic`                                 |
| ★ / ☆       | 즐겨찾기(검색바·즐겨찾기 목록·검색결과·사이드패널) | `Star` — 활성은 `fill="currentColor"`, 비활성은 외곽선 |
| 🔊          | 음성 안내                                          | `Volume2`                                              |
| ✕ / ×       | 닫기(사이드패널·피드백 모달·목록 패널)             | `X`                                                    |
| ☷          | 목록 트리거                                        | `List`                                                 |
| 📐 / ✨     | 필터 토글(경사도·명소)                             | `Mountain` / `Sparkles`                                |
| ▲ / ▼       | 필터 섹션 접기                                     | `ChevronUp` / `ChevronDown`                            |
| ⚠️          | 오류 배너                                          | `TriangleAlert`                                        |
| ✅ ❌ ⚠️    | 토스트 상태(공개 지도 위치 오류에 뜬다)            | `CircleCheck` / `CircleX` / `TriangleAlert`            |
| ‹ / ›       | 사진 캐러셀                                        | `ChevronLeft` / `ChevronRight`                         |
| 🚇          | 지하철 마커                                        | `TrainFront`                                           |
| ♿          | 시설 클러스터·폴백                                 | `Accessibility`                                        |

### 데이터 이모지 (DB 값 → 렌더링 시 매핑)

| 시설 유형 code | 대체                                        |
| -------------- | ------------------------------------------- |
| `elevator`     | `ArrowUpDown`                               |
| `restroom`     | `Toilet`                                    |
| `ramp`         | `TrendingUp`                                |
| `parking`      | `SquareParking`                             |
| `braille`      | `GripVertical` (2×3 점 배열이 점자 셀 형상) |
| 미지의 code    | `Accessibility` 폴백                        |

명소(`landmarks.icon`)는 값과 무관하게 `Sparkles`로 렌더링한다.

lucide에 elevator·ramp·braille 전용 아이콘이 없어 은유로 대체했다.
`GripVertical`은 2×3 원 배열이라 점자 셀 형상과 일치한다. 위 이름은 모두
lucide 1.31.0에 존재함을 확인했다.

## 구현 구조

매핑은 두 모듈로 나눈다. vitest가 node 환경이고 단위 테스트가 `src/lib/`에
모여 있어, 순수 로직을 `lib`에 두어야 JSX 없이 테스트할 수 있다.

- **`src/lib/mapIcons.ts`** — 단일 출처. `FacilityIconKey` union, `시설 코드 →
키` 매핑, Leaflet `divIcon`용 SVG 문자열(`lucide-static`), 크기 치환
  `sizedIconSvg()`.
- **`src/components/map/iconography.tsx`** — JSX용 `<FacilityTypeIcon code />`
  (`lucide-react`). 같은 `FacilityIconKey`를 `Record` 키로 쓰므로 한쪽만
  고치면 타입 오류가 난다.

lucide SVG는 `stroke="currentColor"`라 기존 `FACILITY_COLORS`·`ku-*` 색 체계를
그대로 상속한다. 크기는 JSX는 `size` prop, 마커는 `sizedIconSvg()`가 정한다.

- 이모지 문자열을 실어 나르던 데이터 흐름(`browseItems`, 검색결과 등)은
  `kind`(facility/landmark)와 `code`를 넘기도록 바꾸고 렌더링 지점에서
  매핑한다.
- `useMapData`의 `facility_types`·`landmarks` select 목록에서 `icon` 컬럼
  참조를 제거한다(2단계 drop의 선행 조건).

## 데스크톱 텍스트 라벨

- 대상: 플로팅 스택의 현위치·지도전환·피드백 3개. 줌 ＋/−는 보편 관례라 제외.
- 형태: 아이콘 아래 세로 라벨, 버튼 안에 포함. 지도전환 라벨은 상태에 따라
  "위성"/"지도"로 토글.
- 다국어: `t()` 키 추가(ko/en/zh). 기존 `aria-label`·`title`은 유지하되
  보이는 라벨과 문구를 일치시킨다.
- 모바일(<768px)은 기존처럼 아이콘만 표시한다.

## 2단계 (후속 PR) — 읽기와 쓰기로 다시 쪼갰다

초안은 후속을 PR 하나로 봤지만, `landmarks.icon`이
`not null`이고 **기본값이 없다**(`supabase/migrations/20260720000000_create_landmarks.sql:11`).
그래서 관리자 명소 폼에서 이모지 입력만 먼저 빼면 명소 생성이 곧바로 깨진다.
읽기를 멈추는 일과 쓰기를 멈추는 일의 안전한 시점이 다르므로 둘로 나눈다.

### 2-A: 관리자 읽기 제거 — `admin-lucide-icons` 브랜치 (완료)

관리자 화면 6곳이 `icon` 컬럼을 읽지 않게 하고 lucide로 교체했다. DB 무변경이라
1단계가 머지되면 바로 머지할 수 있다.

이 과정에서 확정한 것 둘:

- 쿼리 두 곳이 `facility_types(label, icon)`이라 **`code`를 아예 선택하지 않고
  있었다**. `FacilityTypeIcon`은 `code`로 아이콘을 고르므로 그대로 두면 모든
  행이 폴백 아이콘이 된다 — 1단계의 `SidePanel`에서 실제로 났던 버그다. 두
  쿼리에 `code`를 넣고, 회귀를 잡는 e2e 단언을 붙였다(쿼리에서 `code`를 빼면
  실제로 실패하는 것을 확인했다).
- `<option>` 안에는 SVG를 넣을 수 없다(브라우저가 텍스트만 렌더링한다). 시설
  유형 드롭다운 두 곳은 아이콘을 버리고 라벨만 남겼다.

`src/types/domain.ts`의 `FacilityWithType`에서도 `icon`을 걷었다. 이제
`facility_types.icon`을 읽는 코드는 없다.

### 2-B: 쓰기 제거와 컬럼 drop

- 관리자 명소 폼(`LandmarkFormModal.tsx`)의 이모지 입력란·필수 검증·저장 제거.
  `form.icon`을 읽던 네 곳이 전부 이 파일에 있었다.
- `landmarks.icon`·`facility_types.icon` drop 마이그레이션
  (`supabase/migrations/`, main 머지 시 CI 자동 적용).
- `supabase/database.types.ts`에서 두 컬럼 제거.

**순서 위험을 어떻게 처리했나.** 마이그레이션은 main 머지 시점에 적용되는데 프론트
배포와 원자적이지 않다. 폼 변경과 drop을 한 PR에 담으면, 머지 직후부터 새 프론트가
배포되기 전까지 관리자가 명소를 만들면 실패하는 창이 생긴다(옛 프론트가 없는
컬럼에 `icon`을 보낸다). 창을 없애려면 `alter column icon drop not null`을 먼저
배포하고 → 폼 변경을 배포하고 → 마지막에 drop하는 3단계로 가야 한다.
**한 PR로 묶고 창을 감수하기로 정했다(2026-08-13)** — 명소가 4건뿐인 내부 도구이고,
창은 배포 한 번 걸리는 몇 분이다.

착수하며 확인한 것 둘:

- **`facility_types`는 `supabase/migrations/`에 만든 파일이 없다.** 이 리포의
  마이그레이션 이력은 `20260514`부터 시작하고 그 이전 스키마는 베이스라인이라
  파일이 없을 뿐이다. 기존 마이그레이션도 이미 그런 테이블에 `alter table`을
  건다(`20260525000000_add_facility_video.sql`이 `building_facilities`에). 특별한
  처리는 필요 없고, 재적용에 대비해 `drop column if exists`만 붙였다.
- **`scripts/check-migrations.sh`는 파괴적 연산을 막지 않는다.** 검사하는 것은
  ①기존 파일 수정·삭제·이름변경 금지(신규 추가만) ②파일명
  `YYYYMMDDHHMMSS_lower_snake_case.sql` ③빈 파일 금지 셋뿐이다.

로컬에 supabase CLI가 없어 `database.types.ts`는 수기로 걷고 typecheck로 검증했다.
이 파일은 생성물이므로, CLI가 있는 환경에서 다시 만들면 이 편집과 같은 결과여야 한다.

배포 순서와 무관한 후속 항목이 하나 더 있다. `FeedbackButton`의 한국어 고정
문구 다국어화다. 보이는 라벨은 `t("feedback")`으로 옮겼고, 남은 것은 버튼의
`title`·`aria-label`("피드백 보내기")과 모달 내부 문구 전부다 — 제목·안내문·
유형 칩 라벨(`FEEDBACK_TYPES`)·입력 라벨·placeholder·개인정보 안내·제출 상태
메시지, 그리고 `mailto` 제목과 본문. 그래서 영어·중국어에서는 보이는 라벨
("Feedback"/"反馈")이 접근 이름("피드백 보내기")에 들어 있지 않아 WCAG
2.5.3(Label in Name)이 한국어에서만 성립한다. 접근 이름을 라벨과 같은 키로
옮기는 것이 이 항목의 핵심이고, 모달 문구는 그다음이다.

## 테스트 영향

- e2e `mockBackend`의 이모지 픽스처와 이모지 텍스트를 단언하는 스펙을 함께
  갱신한다(계획 단계에서 전수 조사). `data-testid` 기반 단언은 영향 없다.
- 라벨 추가에 대한 e2e: 데스크톱 뷰포트에서 세 버튼의 보이는 텍스트를
  단언한다.

## 참고

- 현재 DB 실측(2026-08-13): `landmarks.icon` = 🐿️ 🌸 🌳 🕊️ (4건),
  `facility_types` = restroom·ramp·parking·elevator (braille 행은 아직 없음).
- 이 설계의 초안은 main 갱신(PR #9 머지 반영) 전 코드를 기준으로 조사했고,
  계획 단계에서 갱신된 `Map.tsx`·`map-ui.css` 기준으로 위치를 재확인했다.
