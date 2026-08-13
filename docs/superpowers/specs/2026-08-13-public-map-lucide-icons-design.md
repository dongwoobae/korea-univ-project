# 공개 지도 lucide 아이콘 전환 + 데스크톱 텍스트 라벨 설계

2026-08-13

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

## 2단계 (후속 PR)

1단계 프론트가 배포되어 icon 컬럼을 아무도 읽지 않게 된 뒤:

- 관리자 명소 폼의 이모지 입력란·필수 검증·저장 로직 제거.
- 관리자 화면의 `facility_types.icon` 표시 지점을 lucide 매핑 재사용으로 교체.
- `landmarks.icon`·`facility_types.icon` 컬럼 drop 마이그레이션 추가
  (`supabase/migrations/`, main 머지 시 CI 자동 적용).
- `supabase/database.types.ts` 재생성.

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
