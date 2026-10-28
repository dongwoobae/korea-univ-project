# 다크 모드 설계

2026-10-28

## 이 문서의 목적

멘토링 설계(`docs/specs/2026-10-25-mentoring-feedback-design.md`) 7장이 PR ⑤의 요구다 — 기기 설정을 따르지 않고 버튼으로만 다크에
들어가며, 저장 값은 `ku_theme`, 관리자 화면의 지도는 늘 밝다. 이 문서는 그것을 코드로 옮길 때 정할 것(버튼 모양·자리, 상태를 두는 곳,
관리자 지도를 밝게 두는 방법, 시험)을 적는다. 7장에 있는 것은 되풀이하지 않고 절 번호로 가리킨다.

결정 표기: **[사용자]**는 사용자가 정한 것, **[판단]**은 Claude가 정하고 사용자에게 알린 것이다.

## 결정 요약

| 항목           | 결정                                                                                                            |
| -------------- | --------------------------------------------------------------------------------------------------------------- |
| 버튼           | **[사용자]** 토글 하나. 밝을 때 "다크모드", 누르면 화면 전체가 어두워지고 버튼은 "라이트모드"가 된다(1.1)       |
| 버튼 자리      | 웹 접힌 줄 맨 아래, 웹 펼침은 오른쪽 아래 지도 버튼 열의 위성 다음(**[사용자]**), 모바일 아래 줄 오른쪽 끝(1.2) |
| 관리자         | 헤더의 설정 앞에 같은 토글. 768px 미만은 ⋮ 메뉴 항목(1.3)                                                       |
| 상태           | `<html data-theme>` 속성이 기준이다. 모듈 저장소 하나와 `useSyncExternalStore` 훅(2.1)                          |
| 첫 그리기      | `<head>`의 인라인 스크립트가 저장 값이 `"dark"`일 때만 속성을 건다(2.2)                                         |
| 색             | 다크 토큰을 `@media` 대신 `:root[data-theme="dark"]`에 건다(3.1)                                                |
| 관리자 지도    | Leaflet 컨테이너에 `ku-light-scope`를 달아 그 안에 밝은 토큰을 다시 선언한다(3.2)                               |
| 등록 요청 지도 | `FacilityMap`의 `followTheme`. 기본은 밝음이고 공개 등록 요청 모달만 켠다(4장)                                  |

---

## 1. 버튼

### 1.1 모양과 이름

- **[사용자]** 2026-10-28 보기 패널 없이 토글 버튼 하나로 한다. 버튼은 누르면 갈 모드를 보인다.

  | 지금 모드 | 아이콘 | 이름(접근 이름·`title`)            | 보이는 글자(영어만 짧다)      |
  | --------- | ------ | ---------------------------------- | ----------------------------- |
  | 밝음      | `Moon` | 다크모드 · Dark mode · 深色模式    | 다크모드 · Dark · 深色模式    |
  | 다크      | `Sun`  | 라이트모드 · Light mode · 浅色模式 | 라이트모드 · Light · 浅色模式 |

- **[판단]** `aria-pressed`는 달지 않는다. 이름이 상태에 따라 바뀌는 버튼에 눌림 상태까지 달면 "라이트모드, 눌림"처럼 두 신호가
  겹친다(WAI-ARIA APG Button 패턴: 눌림 상태를 쓰는 토글은 이름을 바꾸지 않는다).
- **[판단]** 영어의 보이는 글자만 "Dark"·"Light"로 줄인다. 모바일 360px 아래 줄 한 칸(72px, 안쪽 64px)에 12px로 "Light mode"를
  넣으면 넘쳐 말줄임이 된다. 접근 이름은 "Light mode"로 두어 보이는 글자를 앞에 품는다(WCAG 2.5.3 이름 안의 글자).
- 번역 키: `themeToDark`·`themeToLight`(이름), `themeToDarkLabel`·`themeToLightLabel`(보이는 글자).
- 누르면 모드만 바뀐다. 열린 메뉴 패널·건물 상세·초점은 그대로다. 버튼은 같은 요소로 남아 초점을 잃지 않는다.

### 1.2 공개 지도 자리

멘토링 설계 1장이 ④의 줄에 '보기'를 더하기로 한 자리에 토글을 둔다.

- **접힌 줄(rail):** 목록 아래에 가름줄을 두고 맨 끝에 둔다 — `[펼치기] — [검색][필터][즐겨찾기][목록] — [다크모드]`. 버튼 모양은
  다른 줄 버튼과 같다(64×56px, 아이콘 20px, 11px 이름). 패널을 열지 않으므로 `aria-expanded`·`aria-controls`가 없다.
- **아래 줄(bar):** 오른쪽 끝 다섯째 칸. 칸 나눔을 4에서 5로 바꾼다(360px이면 72px). 상세가 열려 줄이 숨는 동안에는 토글도 없다.
- **펼침(expanded):** **[사용자]** 2026-10-28 오른쪽 아래 지도 버튼 열(`.ku-map-actions`)의 위성 버튼 다음, 피드백 앞에 둔다. 모양은
  위성 버튼과 같은 `ku-map-action--labeled`. 이 열은 모든 모드에 있지만 토글은 펼침 모드에서만 이 열에 그린다 — 한 화면에 토글은
  하나다.
- 이름이 잘리면 안 된다. 시험이 세 언어·세 자리에서 글자가 말줄임 없이 들어가는지 본다(5.2).

### 1.3 관리자 화면

- `src/app/admin/dashboard/layout.tsx` 헤더의 `.ku-admin-account`에서 "설정" 앞에 `ku-admin-button` 토글을 둔다(아이콘 + 글자, 이름은
  한국어만).
- 767px 이하에서는 계정 칸의 다른 버튼처럼 숨고, ⋮ 메뉴에 같은 이름의 `menuitem`을 첫 항목으로 더한다. 누르면 모드를 바꾸고 메뉴를
  닫는다(다른 항목과 같다).
- 건물 상세·새 건물(`/admin/buildings/*`)과 로그인(`/admin`)은 자기 헤더를 쓰고 대시보드 헤더가 없다. 이 화면들에는 버튼을 두지 않고
  저장 값만 따른다. 다크는 대시보드 헤더의 버튼으로만 들어가므로 7.2의 "버튼으로만"은 지켜진다. **[판단]**

---

## 2. 상태

### 2.1 저장소와 훅 (`src/lib/theme.ts`)

- 기준은 `<html>`의 `data-theme` 속성이다. `"dark"`면 다크, 없으면 밝음이다. 밝음일 때는 속성을 지운다.
- 내보내는 것:
  - `THEME_STORAGE_KEY = "ku_theme"`, `type Theme = "light" | "dark"`.
  - `parseStoredTheme(value)` — 정확히 `"dark"`일 때만 다크, 그 밖(없음·`"light"`·모르는 값)은 밝음(멘토링 설계 2장).
  - `THEME_INIT_SCRIPT` — 2.2의 인라인 스크립트 문자열.
  - `setTheme(theme)` — 속성을 바꾸고, `localStorage`에 쓰고(예외는 삼킨다 — 화면만 바뀐다), 구독자에게 알린다.
  - `useTheme()` — `useSyncExternalStore(subscribe, 속성 읽기, () => "light")`.
- **[판단]** 멘토링 설계 7.2의 "상태 공급자(Context) 하나"를 모듈 저장소로 바꾼다. 같은 값 하나를 모두가 읽고 바꾸면 모두 다시
  그린다는 뜻은 그대로다. 바꾸는 이유:
  - 관리자 화면은 서버에서 먼저 그려진다. 서버는 저장 값을 모르므로 서버의 첫 값은 밝음이어야 한다. Context에 `useState`를 쓰면 처음
    값을 `<html>`에서 읽을 때 서버 결과와 달라 hydration이 어긋나고, 효과에서 고치면 다크인 사람에게 밝은 값으로 한 번 그린다(공개
    지도는 밝은 타일을 받았다가 버린다). `useSyncExternalStore`는 hydration 동안 서버 값을 쓰고 끝나자마자 실제 값으로 다시 그린다.
    hydration 뒤에 처음 그려지는 공개 지도(`ssr: false`)는 처음부터 실제 값을 읽는다.
  - 속성을 거는 일은 어차피 React 밖(2.2)에서 먼저 일어난다. 속성을 기준으로 두면 값이 한 곳에만 있다.
- 다른 탭의 변경은 지금 탭에 바로 반영하지 않는다. 멘토링 설계 7.3은 "다른 쪽도 그 모드로 **열린다**"이고, 다음에 열 때 저장 값을
  읽는다.

### 2.2 첫 그리기 전 (`src/app/layout.tsx`)

- `<html lang="ko" suppressHydrationWarning>`. `<head>`의 첫 자식으로 `<script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />`.
- 스크립트: `try { if (localStorage.getItem("ku_theme") === "dark") document.documentElement.setAttribute("data-theme", "dark") } catch (e) {}`
  꼴. ES5 문법만 쓴다. ⑥이 같은 스크립트에 `ku_font_scale`을 더한다.
- `<head>`의 동기 인라인 스크립트는 브라우저가 문서를 읽는 중 그 자리에서 실행하고, 화면은 `<head>`를 다 읽은 뒤에 그린다. 그래서
  첫 그리기 전에 속성이 걸린다. 지금 같은 `<head>`에 JSON-LD 스크립트를 같은 방식으로 넣고 있다.
- `suppressHydrationWarning`은 `<html>` 요소 자신의 속성 차이만 덮는다. 자식의 hydration 검사는 그대로다.

---

## 3. 색

### 3.1 다크 토큰

- `src/app/globals.css`의 `@media (prefers-color-scheme: dark)` 두 곳을 바꾼다.
  - 토큰 블록: `:root[data-theme="dark"] { color-scheme: dark; … }`. 값은 그대로다.
  - 타일 어둡게(`.leaflet-tile-pane`의 `filter`): `:root[data-theme="dark"] .leaflet-container:not(.ku-light-scope) .leaflet-tile-pane`.
- 화면의 다른 색은 모두 토큰을 읽는다(색 토큰 선언은 `globals.css`에만 있다). `document.body`로 띄우는 공개 모달도 `:root` 토큰을
  읽어 함께 바뀐다.
- `src/components/MapWrapper.tsx` 로딩 자리의 `#f5f5f0`을 `var(--ku-bg)`로 바꾼다. 멘토링 설계 7.1대로 쓰이지 않는
  `src/app/page.module.css`를 지운다.

### 3.2 관리자 지도는 밝게

- **[사용자]** 관리자 화면의 지도는 늘 밝다 — 타일과 지도 위 색 모두(멘토링 설계 7.3).
- 지도 위 UI 중 토큰을 읽는 것이 있다. 예: 관리자 지도의 건물 이름표(`.leaflet-tooltip.bldg-label`)는 `--ku-text-2` 글자에
  `--ku-surface` 테두리다. 다크 토큰이 닿으면 밝은 타일 위에 밝은 글자가 된다.
- 그래서 밝은 토큰 블록의 선택자를 `:root, .ku-light-scope`로 하고, 밝게 둘 지도의 Leaflet 컨테이너 요소에 `ku-light-scope`를 단다.
  그 요소가 밝은 값을 직접 선언하므로 `<html>`에서 물려받는 다크 값을 이긴다. 안의 타일·이름표·팝업·Leaflet 컨트롤·geoman 도구가
  모두 밝게 남는다. `color-scheme: light`도 같은 블록에 있다.
  - 밝은 토큰을 한 벌 더 적지 않고 선택자만 더한다. 값이 한 곳에 있다.
  - 토큰 블록의 `--ku-primary-text: var(--ku-crimson-600)` 같은 참조는 선언된 요소에서 풀리므로 `.ku-light-scope` 안에서도 밝은
    크림슨을 가리킨다.
- 지도 둘레(카드·툴바·패널)는 테마를 따른다 — 멘토링 설계 7.3의 "지도 밖".

---

## 4. 지도별 처리

| 파일                                    | 쓰는 곳                                                                                                   | 처리                                                                                 |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `map/Map.tsx`                           | 공개 지도                                                                                                 | `useTheme()`. 타일·건물·캠퍼스 경계 색·경사도 외곽선(`SlopeLayer`)이 따른다          |
| `FacilityMap.tsx`                       | `FacilityFields` 안(공개 등록 요청 모달, 관리자 시설 폼·독립 시설 상세·제보함 드로어), 제보함 드로어 직접 | `followTheme` prop. 거짓(기본)이면 밝은 타일 + `ku-light-scope`, 참이면 `useTheme()` |
| `facility/FacilityFields.tsx`           | 위와 같다                                                                                                 | `mapFollowsTheme` prop을 `FacilityMap`에 넘긴다. 기본 거짓                           |
| `sidepanel/FacilityRequestModal.tsx`    | 공개 등록 요청 모달                                                                                       | `FacilityFields`에 `mapFollowsTheme` 참                                              |
| `admin/workspace/AdminWorkspaceMap.tsx` | 관리자 독립 시설·명소·경사도 작업 지도                                                                    | 밝은 타일 + `ku-light-scope`                                                         |
| `admin/slopes/SlopeWorkspaceMap.tsx`    | 관리자 경사도 목록 지도                                                                                   | 경로 외곽선을 밝은 지도 값으로                                                       |
| `PolygonEditor.tsx`                     | 관리자 건물 폴리곤 편집                                                                                   | 밝은 타일 + `ku-light-scope`                                                         |
| `BuildingPolygonPreview.tsx`            | 관리자 건물 상세 미리보기                                                                                 | 밝은 타일 + `ku-light-scope`                                                         |
| `slope/SlopeRouteMap.tsx`               | 관리자 경사도 경로 그리기·수정                                                                            | 밝은 타일 + `ku-light-scope`, 외곽선 밝은 지도 값                                    |

- 밝게 고정하는 지도에서는 타일 주소를 바꾸던 효과(`setUrl`)와 `key`로 타일을 갈던 처리를 지운다.
- `getCartoTileUrl`의 인자 이름 `prefersDarkMode`를 `dark`로 바꾼다. 기기 설정이 아니라 쓰는 쪽이 정한 값이다.
- 다 바꾸면 `src/lib/usePrefersDarkMode.ts`를 쓰는 곳이 없어 지운다(멘토링 설계 7.3).

---

## 5. 시험

### 5.1 단위 (vitest, `src/lib/theme.test.ts`)

- `parseStoredTheme`: `"dark"` → 다크, `"light"`·`null`·`"DARK"`·`"1"` → 밝음.
- `THEME_INIT_SCRIPT`: 가짜 `localStorage`·`document`를 인자로 받는 함수로 감싸 돌린다(vitest 환경이 `node`다). 저장 값 `"dark"`면
  속성이 걸리고, 그 밖의 값이나 `getItem` 예외면 걸리지 않으며 예외가 밖으로 나오지 않는다.
- `setTheme`: 속성·저장 값을 바꾸고 구독자를 부른다. `setItem`이 예외를 던져도 속성은 바뀌고 예외가 나오지 않는다. 밝음으로 바꾸면
  속성을 지운다.

### 5.2 E2E 새 파일 `e2e/theme.spec.ts`

- 처음 방문: 기기 다크(`colorScheme: "dark"`)여도 저장 값이 없으면 `<html>`에 속성이 없고, 밝은 타일(`light_all`)이며, 토글 이름은
  "다크모드"다.
- 세 자리에서 토글: 접힌 줄(`expandMapMenu: false`), 펼침(`.ku-map-actions`), 모바일 390×844 아래 줄. 누르면 `data-theme="dark"`,
  `dark_all` 타일, 건물 채움 `#FF4D3D`, `body` 바탕이 다크 `--ku-bg`, 저장 값 `"dark"`, 이름 "라이트모드". 다시 누르면 되돌아온다.
  열린 메뉴 패널은 토글 뒤에도 열려 있다(접힌 줄에서 필터를 열어 둔 채).
- 새로 고침: 저장 값 `"dark"`로 열면 `DOMContentLoaded` 때 이미 `data-theme="dark"`다(`addInitScript`로 그 시점 값을 남겨 읽는다).
  hydration 경고가 콘솔에 없다.
- 저장소 예외: `localStorage.getItem`·`setItem`이 `ku_theme`에 예외를 던지게 하면 밝게 열리고, 토글하면 화면은 다크가 되며
  `pageerror`가 없다.
- 이름 잘림: ko·en·zh 각각에서 접힌 줄·아래 줄(360×780)·펼침의 토글 글자가 `scrollWidth ≤ clientWidth`다.
- 공개 등록 요청 모달: 다크에서 모달 안 지도가 `dark_all`이다.
- 관리자:
  - 웹 헤더 토글과 390px의 ⋮ 메뉴 항목이 모드를 바꾼다.
  - 다크에서 관리자 지도(작업 지도, 건물 상세 미리보기, 시설 폼 모달)는 `light_all`만 받고 `dark_all`이 없다. 지도 위 건물 이름표
    글자색이 밝은 `--ku-text-2`(`rgb(92, 86, 82)`)다.

### 5.3 고치는 기존 E2E

| 파일                         | 시험                              | 바뀌는 것                                                                                  |
| ---------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------ |
| `e2e/support/mockBackend.ts` | `installMockBackend` 옵션         | `theme?: "dark"` — 저장 값이 없으면 `ku_theme`를 넣는다(`expandMapMenu`와 같은 방식)       |
| `e2e/admin-dark.spec.ts`     | 대비 검사 전부                    | 기기 다크에 더해 `theme: "dark"`로 연다. 다크 판정(`colorScheme`)은 그대로 단언한다        |
| 같은 파일                    | 새 시험                           | 기기 다크 + 저장 값 없음이면 관리자 화면이 밝다(`color-scheme` light, 밝은 `--ku-bg`)      |
| 같은 파일                    | 크림슨 채움                       | `emulateMedia({ colorScheme: "light" })` 대신 헤더 토글 "라이트모드"를 눌러 밝은 값을 본다 |
| `e2e/public-map.spec.ts`     | 시스템 색상 모드에 맞춰 타일 교체 | 기기 다크로 바꿔도 타일이 `light_all`로 남는지로 바꾼다(토글 동작은 5.2)                   |
| 같은 파일                    | 경사도 외곽선(다크에서 흰 외곽선) | `emulateMedia` 대신 펼침 모드 토글을 눌러 다크로 바꾼다                                    |
| `e2e/map-menu.spec.ts`       | 접힌 줄·아래 줄 버튼 이름 목록    | 끝에 "다크모드"를 더한다                                                                   |

---

## 6. 하지 않는 것

- 기기 설정 따르기(멘토링 설계 7.2 **[사용자]**).
- 보기 패널. ⑥ 글자 크기 버튼의 자리는 ⑥에서 정한다.
- 다른 탭의 변경을 지금 탭에 바로 반영하기(2.1).
- 관리자 건물 상세·새 건물·로그인 화면의 토글(1.3).
- 위성 타일의 다크 처리. 지금처럼 어둡게 필터만 받는다.
