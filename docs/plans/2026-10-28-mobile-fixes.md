# 모바일 점검 수정(⑦) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 모바일 점검 목록(`docs/audits/2026-10-28-mobile-audit.md`) 7장의 결정대로 MOB-05·06·09~16을 고치고, 경사도 켜기를 지도
버튼으로 옮긴다.

**Architecture:** 좁은 화면 기준을 "폭 767px 이하 또는 가로이면서 높이 500px 이하"로 넓혀 휴대폰 가로를 모두 모바일 레이아웃으로
만든다. CSS는 두 모바일 블록의 조건을, JS는 `src/lib`의 `COMPACT_MEDIA_QUERY` 하나를 쓴다. 그 위에 가로 좁은 화면 배치(옆 패널,
가로 버튼 줄)를 얹고, 나머지는 각자의 컴포넌트·CSS에서 작게 고친다.

**Tech Stack:** Next 16.2.4(App Router), React 19.2.4(React Compiler), react-leaflet 5, Leaflet 1.9.4, lucide-react, vitest(node 환경),
Playwright(목 백엔드 `e2e/support/mockBackend.ts`, `next dev`).

**Spec:** `docs/specs/2026-10-28-mobile-fixes-design.md`(세부 — 이 계획의 근거), `docs/audits/2026-10-28-mobile-audit.md`(문제 실측).

## Global Constraints

- 좁은 화면 조건: CSS `@media (max-width: 767px), (orientation: landscape) and (max-height: 500px)`, JS 같은 문자열의
  `window.matchMedia(...).matches`. 가로 좁은 화면 배치는 그 안에서 `(orientation: landscape) and (max-height: 500px)`.
- 가로 좁은 화면 옆 패널 폭 `min(360px, 50vw)`. 웹 상세 패널 폭 340px. 세로 시트 높이는 `mobileSheetHeight(innerHeight)`
  (`src/components/map/buildingLabel.ts`, `min(62vh, 620px)`).
- 경사도 버튼: 위성 다음, `ku-map-action ku-map-action--labeled`, 아이콘 `Mountain`, 이름 `t("slopeToggle")`(경사도·Slope·坡度),
  `aria-pressed`. 이름은 켜고 꺼도 그대로. 필터 패널과 `activeFilterCount`에서 뺀다.
- 터치 대상 기준 24×24(WCAG 2.5.8).
- 웹 레이아웃 확대 묶음 숨김 조건 `(min-width: 768px) and (max-height: 560px)`(PR #66의 470px을 올린다).
- 커밋·주석·문서에 날짜만 적고 과정 이름을 적지 않는다. `Co-Authored-By` 없음. 주석은 WHY만, 같은 사실은 한 곳(설계 절을 가리킨다).
- 로컬에서 npm ci·vitest·tsc·eslint·Playwright를 돌리지 않는다 — PR CI로 본다. `gh workflow run` 금지. 포맷은
  `npx --yes prettier@3.9.4 --write <파일>`.

---

### Task 1: 설계 (끝남)

- [x] 점검 목록 `docs/audits/2026-10-28-mobile-audit.md`(`61e44f2`, 결정 `29b0167`), 설계 `docs/specs/2026-10-28-mobile-fixes-design.md`
      (`6edf49a`). PR #66(⑥ 회귀)이 병합되면 main을 이 브랜치에 합친다.

### Task 2: 시험 먼저 (push → CI 실패 확인)

**Files:** `e2e/mobile-fixes.spec.ts`(새로), `e2e/public-map.spec.ts`, `e2e/font-scale.spec.ts`, `e2e/theme.spec.ts`,
`e2e/admin-slopes-workspace.spec.ts`, `src/components/map/mapMenu.test.ts`

- [ ] **Step 1: 새 E2E `e2e/mobile-fixes.spec.ts`** — 설계 7.1의 항목마다 시험 하나 이상. 목 백엔드(`installMockBackend`)를 쓰고,
      지도를 잴 때는 로딩 막이 걷힌 뒤에 잰다(`await expect(page.locator(".ku-map-loading")).toHaveCount(0)`).
  - 가로 좁은 화면 740×360·844×390: `.ku-menu-nav--bar`가 보이고 `.ku-menu-nav--rail`이 없다. 보이는 `.ku-map-actions` 버튼들의 위
    끝이 같다(가로 한 줄, 1px 안), 모두 `.ku-language-trigger` 아래 끝보다 아래다. 검색으로 "중앙도서관"을 열면 `.ku-side-panel`의
    오른쪽 끝이 화면 오른쪽(1px 안), 높이가 화면 높이(1px 안), 폭이 `min(360, 화면 폭/2)`이고 `.ku-side-handle`이 보이지 않는다.
  - 가로 좁은 화면에서 경사도를 켜면 `.ku-slope-legend`가 버튼 줄 위에 있어 겹치지 않고, 667×375에서 눈금(`.ku-slope-bands-ticks`
    두 줄)끼리 겹치지 않는다(`public-map.spec.ts`의 눈금 시험과 같은 비교).
  - 웹 1280×800·세로 390×844는 지금 레이아웃이다: 웹은 접힌 줄 또는 펼친 패널, 세로는 아래 시트(`.ku-side-panel` 아래 끝이 화면
    아래, 폭이 화면 폭).
  - 경사도 버튼: 웹 접힌 줄·웹 펼침·세로 좁은 화면에서 `.ku-map-actions`의 보이는 버튼 이름 차례가 "위성 지도로 전환" 바로 다음
    "경사도"다. 누르면 `aria-pressed="true"`, `.ku-slope-legend`가 보이고 경사도 선(`.leaflet-overlay-pane path[stroke="#8BC34A"]`
    등 목 데이터의 경사도 선)이 그려진다. 다시 누르면 `aria-pressed="false"`, 범례가 사라진다. 필터 패널에 경사도 체크가 없다.
    경사도를 켜도 필터 버튼 이름에 숫자가 붙지 않는다.
  - MOB-09: 세로 360·390·430에서 검색과 즐겨찾기로 고른 건물의 `.ku-building-label--selected` 가운데가 `.ku-side-panel` 위 끝보다
    위다. 가로 740×360에서는 옆 패널 왼쪽 끝보다 왼쪽이다. 웹 1280×800에서는 상세 패널 왼쪽 끝보다 왼쪽이다. 지도가 움직임을 멈춘
    뒤에 잰다(`expect.poll`로 두 번 연속 같은 값).
  - MOB-10: 390×844에서 검색 결과 수(`.ku-search-count`)의 글자와 그 밑 바탕의 대비가 4.5:1 이상이다. 대비 셈은
    `e2e/theme.spec.ts`의 `lowContrast`와 같은 방식(화면 쌓임에서 처음 만나는 불투명 바탕).
  - MOB-11: `.ku-search-input`의 `::-webkit-search-cancel-button` 가상 요소의 계산된 `appearance`가 `none`이거나 `display`가 `none`이다.
  - MOB-12: 등록 요청 모달 제목 줄의 버튼("닫기")을 누르면 모달이 닫힌다. Tab으로 그 버튼에 닿는다.
  - MOB-13: 다크(`theme: "dark"`)에서 `.ku-attribution img`의 계산된 배경색이 흰색이다.
  - MOB-14: 844×390·932×430에서 `.ku-menu-nav--rail`이 없다.
  - MOB-16: 영어(`ku_map_lang = "en"`) 360×780 크게(`fontScale: "large"`)에서 목록 패널의 긴 이름 하나의 높이가 한 줄 높이보다 크고
    세 줄 높이보다 작다(목 데이터에 긴 영어 이름이 없으면 `MockState`를 고쳐 넣는다).
  - MOB-05: 세로 390에서 사진 넘김 점 버튼(사진 2장 이상인 건물), `.ku-slope-bands-cell`, `.ku-side-handle`의 상자가 24×24 이상이다.
- [ ] **Step 2: 기존 E2E 고치기** — 설계 7.2.
  - 경사도 체크박스(`getByRole("checkbox", { name: /경사도/ })`·`{ name: "경사도" }`)를 쓰는 곳(`public-map.spec.ts`·`font-scale.spec.ts`·
    `theme.spec.ts`·`admin-slopes-workspace.spec.ts`)을
    지도 버튼 "경사도" 누르기로 바꾼다. 모바일은 필터 패널이 열린 동안 버튼 열이 숨으므로 패널을 닫고 누른다.
  - 열 이름 차례 시험(`theme.spec.ts` 펼침 끝 다섯 개, `font-scale.spec.ts`의 세 자리 `PLACES.names`)에 "경사도"를 넣는다.
  - `font-scale.spec.ts`의 낮은 웹 화면 시험(844×390·1024×460): 844×390은 좁은 화면이 되므로 이름과 단언을 고친다. 1024×460은
    가로이면서 높이 500 이하라 역시 좁은 화면이다 — 1024×540(펼침, 웹 레이아웃, 확대 묶음 숨김)으로 바꾼다. 1024×600 시험은
    1024×600에서 확대 묶음이 있는지로 둔다(560 초과).
  - `mapMenu.test.ts`의 `activeFilterCount`: `showSlope` 인자를 지우고 경사도 관련 단언을 지운다.
- [ ] **Step 3: 포맷·커밋·push** — `test: 모바일 점검 수정 시험을 먼저 두고 경사도 버튼으로 바뀌는 기존 시험을 고친다`. CI에서 새 시험과
      바꾼 시험이 실패하고 vitest는 `activeFilterCount` 타입 때문에 Typecheck가 실패할 수 있다(기대). 실패 목록을 보고 둔다.

### Task 3: 좁은 화면 기준

**Files:** `src/lib/viewport.ts`(새로), `src/components/map/Map.tsx`, `src/components/SidePanel.tsx`, `src/components/map/map-ui.css`

- [ ] `src/lib/viewport.ts`: `export const COMPACT_MEDIA_QUERY = "(max-width: 767px), (orientation: landscape) and (max-height: 500px)"`,
      `export const COMPACT_LANDSCAPE_MEDIA_QUERY = "(orientation: landscape) and (max-height: 500px)"`,
      `export function isCompactViewport(): boolean`(`window.matchMedia(COMPACT_MEDIA_QUERY).matches`),
      `export function isCompactLandscape(): boolean`(좁은 화면이면서 가로 조건). 주석: CSS 두 블록과 같은 조건이라는 것과 설계 1.1.
- [ ] `Map.tsx`의 `window.innerWidth < 768` 두 곳(처음 값, resize 검사)과 `SidePanel.tsx`의 두 곳을 `isCompactViewport()`로 바꾼다.
      resize 외에 `orientationchange`도 듣지 않아도 된다(회전하면 resize가 온다). 변수 이름 `isMobile`은 그대로 둔다.
- [ ] `map-ui.css`의 `@media (max-width: 767px)` 두 블록 조건을 `COMPACT_MEDIA_QUERY`와 같게 바꾸고 각 블록 위 주석에
      `src/lib/viewport.ts`의 `COMPACT_MEDIA_QUERY`와 맞춘다고 적는다.
- [ ] PR #66의 확대 묶음 숨김 조건을 `(min-width: 768px) and (max-height: 560px)`로 올리고 주석의 이유를 "경사도 버튼까지 더한 펼친
      열"로 고친다(설계 1.1).
- [ ] 커밋 `feat: 휴대폰 가로를 모두 모바일 레이아웃으로 본다`.

### Task 4: 가로 좁은 화면 배치

**Files:** `src/components/map/map-ui.css`, `src/components/SidePanel.tsx`, `src/components/map/Map.tsx`(필요하면)

- [ ] 좁은 화면 블록 안에 `@media (orientation: landscape) and (max-height: 500px)` 규칙을 둔다(설계 1.2).
  - `.ku-side-panel`: `top: 0; bottom: 0; left: auto; right: 0; width: min(360px, 50vw); height: 100%;` 왼쪽 테두리, 반경 없음,
    `transform: translateX(100%)` → 보일 때 `translateX(0)`. `.ku-side-handle { display: none }`.
  - `.ku-map-actions`: `flex-direction: row; align-items: flex-end;` 차례는 DOM 그대로(세로 좁은 화면에서 맨 위였던 글자 크기 줄이 왼쪽
    끝). 위치는 오른쪽 16px, 아래 줄 위 12px 그대로.
  - `.ku-slope-legend`: 버튼 줄 위 10px(`bottom: calc(var(--ku-menu-bar-height) + 12px + 48px + 10px)`), `right: 16px`, 폭은 버튼 줄과
    같게(`width`를 계산식으로 두거나 `left: auto`로 두고 버튼 줄 폭을 CSS 변수로). 출처 표기 위의 세로 규칙은 이 조건에서 덮는다.
- [ ] `SidePanel.tsx`: 세로로 끌어 닫기(`dragOffset`·`dragStartY`)는 `isMobile && !isCompactLandscape()`일 때만 켠다. 손잡이 버튼은 CSS로
      숨으므로 그대로 둔다.
- [ ] 커밋 `feat: 가로 휴대폰에서 상세를 오른쪽 옆 패널로, 지도 버튼을 가로 한 줄로 둔다`.

### Task 5: 경사도 버튼

**Files:** `src/components/map/Map.tsx`, `src/components/map/FilterPanel.tsx`, `src/components/map/mapMenu.ts`, `src/components/map/map-ui.css`

- [ ] `Map.tsx`: 위성 버튼 바로 다음에 경사도 버튼(설계 2장). `onClick={() => setShowSlope((show) => !show)}`, `aria-pressed={showSlope}`,
      `aria-label`·`title` `t("slopeToggle")`, 아이콘 `Mountain` 19px, 이름 `<span className="ku-map-action-label">`.
      `FilterPanel`에 넘기던 `showSlope`·`setShowSlope`를 지운다.
- [ ] `FilterPanel.tsx`: 경사도 `<label className="ku-filter-check">`를 지우고 props에서 `showSlope`·`setShowSlope`를 지운다.
- [ ] `mapMenu.ts` `activeFilterCount`: `showSlope` 인자와 `Number(filters.showSlope)`를 지운다. `Map.tsx` 호출부를 맞춘다.
- [ ] `map-ui.css`: `.ku-map-action[aria-pressed="true"]`에
      `color: var(--ku-crimson-600); background: var(--ku-crimson-100); border-color: var(--ku-crimson-600)`(언어 버튼 선택과 같은 색).
- [ ] 커밋 `feat: 경사도 켜기를 필터 패널에서 지도 버튼 열의 위성 다음으로 옮긴다`.

### Task 6: 고른 건물이 상세에 가리지 않게 (MOB-09)

**Files:** `src/components/map/buildingLabel.ts`, `src/components/map/buildingLabel.test.ts`, `src/components/map/Map.tsx`

- [ ] `buildingLabel.ts`에
      `detailPadding(kind: "portrait" | "landscape" | "web", viewport: { width: number; height: number }): [number, number]`
      — portrait `[0, mobileSheetHeight(height)]`, landscape `[min(360, width / 2), 0]`, web `[340, 0]`. 주석은 CSS의
      해당 규칙(세로 시트 높이·옆 패널 폭·웹 패널 폭)을 가리킨다. vitest로 세 경우를 본다.
- [ ] `Map.tsx`의 `handleSearchBuilding`·`handleSelectById` `fitBounds`에 `paddingBottomRight: detailPadding(...)`. 화면 종류는
      `isCompactViewport()`·`isCompactLandscape()`로 정한다.
- [ ] 지도 탭 선택의 `revealLabelAboveSheet`는 세로 좁은 화면에서만 부른다. 가로 좁은 화면은 `labelRevealOffset`과 같은 셈을 가로로
      하는 함수(`labelRevealOffsetX`, 보이는 영역은 왼쪽 0 ~ 화면 폭 − 옆 패널 폭)를 더해 `panBy([offset, 0])`. vitest로 본다.
- [ ] 커밋 `fix: 검색·즐겨찾기로 고른 건물을 상세가 덮을 자리만큼 비켜 맞춘다`.

### Task 7: 작은 것들 (MOB-10·11·12·13·16)

**Files:** `src/components/map/map-ui.css`, `src/components/sidepanel/FacilityRequestModal.tsx`

- [ ] MOB-10: 좁은 화면 검색 패널(`.ku-menu-panel[data-panel="search"]`)에서 `.ku-search-count:not(:empty)`와 `.ku-search-note`에 결과
      상자(`.ku-search-results`)와 같은 바탕·테두리·그림자를 주고 목록 바로 아래 붙인다(위 테두리 없이, 아래 반경). 웹 배치는 그대로.
      두 글자색은 웹을 포함해 `var(--ku-text-3)` → `var(--ku-text-2)`(설계 4.1 — 바탕만으로는 4.5:1에 닿지 않는다).
- [ ] MOB-11: `.ku-search-input::-webkit-search-cancel-button { -webkit-appearance: none; appearance: none; }`.
- [ ] MOB-12: `FacilityRequestModal.tsx` 제목을 `<div className="ku-request-modal-header">`로 묶고 오른쪽에 `X` 17px 버튼
      (`className="ku-feedback-close"`를 같이 쓰거나 같은 규칙의 `.ku-request-modal-close`, `aria-label={t("closeLabel")}`, 보내는 중
      `disabled`, `onClick`은 아래 "닫기"와 같은 닫기). CSS는 `.ku-feedback-header`와 같은 배치.
- [ ] MOB-13: `:root[data-theme="dark"] .ku-attribution img { background: #fff; border-radius: var(--ku-radius); padding: 2px 4px; }`.
      모바일 블록의 `.ku-attribution img` 크기 규칙과 부딪히지 않는지 본다.
- [ ] MOB-16: `.ku-map-browse-copy strong`의 `white-space: nowrap; text-overflow: ellipsis`를
      `display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; overflow-wrap: anywhere`로.
- [ ] 커밋 `fix: 검색 결과 수·기본 지우기 버튼·등록 요청 닫기·다크 로고·영어 목록 이름을 고친다`.

### Task 8: 터치 대상 24px·safe-area (MOB-05·06)

**Files:** `src/components/sidepanel/PhotoCarousel.tsx`, `src/components/map/map-ui.css`, `src/components/map/slope-bands-legend.css`,
`src/app/admin/admin-ui.css`, `src/lib/translations.ts`

- [ ] 사진 넘김 점: 인라인 스타일을 `.ku-photo-dot` 클래스로 옮긴다. 버튼은 24×24 투명(`padding: 0; border: 0; background: none`),
      보이는 점은 `::before`(6×6, 현재 사진 `[aria-current="true"]`이면 16×6, 흰색/반투명 흰색, 폭 전환 0.2s). 점 사이 간격은 버튼 크기가
      맡는다(`gap: 0`). 이름은 번역 키 `photoNumber`(ko "{n}번째 사진", en "Photo {n}", zh "第{n}张照片")로, 현재 사진에 `aria-current="true"`.
- [ ] `.ku-slope-bands-cell` 높이 24px, `::before`의 `top`을 8px로(막대 8px가 가운데).
- [ ] `.ku-side-handle` 위아래 안쪽 여백을 늘려 높이 24px 이상.
- [ ] `env(safe-area-inset-*)` 호출을 지운다: `calc(X + env(...))` → `X`(괄호 안이 하나면 `calc`도 지운다), `padding-bottom: env(...)`처럼
      그것만 있는 선언은 선언째. 대상은 `rg -n "safe-area-inset" src`가 찾는 줄 전부. 지운 뒤 같은 명령의 결과가 0줄이다.
- [ ] 커밋 `fix: 사진 넘김 점·범례 칸·시트 손잡이를 24px 이상으로 하고, 쓰이지 않던 safe-area 계산을 지운다`.

### Task 9: push·CI·마무리

- [ ] 바꾼 파일을 prettier로 맞추고 push. `gh pr checks 65 --watch`.
- [ ] 실패 처리: 새 시험이 잡은 것은 해당 Task 범위에서 고친다. 알려진 흔들림(`admin-landmarks-workspace.spec.ts` 모바일 위치 고르기)은
      실패 잡만 재실행.
- [ ] 미리보기 배포로 점검 다시 재기: 세션 임시 폴더의 점검 스크립트를 PR의 Vercel 미리보기 주소로 돌려 MOB-07~16의 실측이 바뀌었는지
      본다. 결과를 점검 목록 각 항목의 "상태"에 적는다(날짜와 수치).
- [ ] 참조 역추적: `rg -n "max-width: 767px|innerWidth < 768|safe-area-inset|showSlope|slopeToggle" src e2e docs` 결과를 PR 본문에 싣고,
      남는 것이 의도한 것(이미지 `sizes` 힌트, 날짜가 박힌 옛 문서)뿐인지 본다.
- [ ] PR #65 본문: 요약, 바뀐 것(항목별), 정한 것(설계 근거), 시험(시험만 올린 run의 실패 목록과 최종 수치), 참조 역추적, 사용자 확인
      (실제 휴대폰 가로·세로, 영어 이름 없는 명소 목록 — 관리자 화면에서 채울 것). 끝에 `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- [ ] 병합은 사용자 지시를 기다린다. 병합 직전에 이 계획 문서를 `git rm`하고 멘토링 설계 진행 상황의 계획 경로를 지운다(같은 커밋).
