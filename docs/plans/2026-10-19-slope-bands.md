# 경사도 구간 범례 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 공개 지도의 경사 색을 연속 그라데이션에서 구간마다 한 색으로 바꾸고, 구간의 개수·경계·색·이름·설명을 관리자 경사도 화면의 모달에서 고치게 하며, 관리자 판정 3색·칩·배지를 같은 구간 색으로 통일한다.

**Architecture:** 구간 설정은 `app_settings`의 `slope_bands` 한 행(JSON)이다. 순수 함수 모듈 `slopeBands.ts`가 형·기본값·검증·판정을 맡고, 모듈 수준 저장소 `slopeBandsStore.ts`가 한 번 읽어 `useSyncExternalStore`로 공개 지도와 관리자 화면에 나눈다. 쓰기는 `POST /api/settings/slope-bands`(관리자 인증 + 같은 검증 + service role upsert)다. 지도 선마다 밑에 외곽선을 깐다.

**Tech Stack:** Next 16.2.4(App Router), React 19.2(React Compiler 켜짐), react-leaflet 5 / Leaflet 1.9.4, geoman 2.19.3, Supabase JS 2, vitest 3(node 환경, 컴포넌트 테스트 없음), Playwright.

**Spec:** `docs/specs/2026-10-19-slope-bands-design.md` — 실행자는 계획과 스펙을 같이 읽는다. 아래 "§n"은 그 스펙의 절이다.

## Global Constraints

- 저장 키 `slope_bands`, 마이그레이션 없음. 행이 없거나 깨지면 코드 기본값 `DEFAULT_SLOPE_BANDS`로 그린다(§2.1).
- 기본 상한은 `WALKWAY_RATIO * 100` · `RELAXED_RATIO * 100` · `RAMP_EXCEPTION_RATIO * 100` · `null`. `5.56` 같은 리터럴을 쓰지 않는다(§2.2).
- 기본 색 `#8BC34A` · `#FFD600` · `#FF9800` · `#E53935`, 기본 이름 `보도 기준 이내` · `완화 범위` · `특례 범위` · `초과`, 기본 설명 `보도 기준 1/18 이하` · `완화 한도 1/12 이하` · `경사로 특례 한도 1/8 이하` · `""`(§2.1).
- 검증(§2.4): 개수 2~~6, 이름 앞뒤 공백 떼고 1~~20자, 설명 0~200자, 색 `#RRGGBB`(대문자로 정규화), 상한은 마지막을 뺀 모두 유한수 `0 < 상한 ≤ 100`, `상한 − 앞 상한 ≥ 0.01 − 1e-9`, 마지막은 `null`.
- 판정(§2.5): `degToPercent(|deg|) ≤ upperPercent + 1e-9`인 첫 구간, 없으면 마지막. 허용오차는 `slopeScale.ts`의 `BOUNDARY_TOLERANCE` 하나.
- 외곽선(§4.1): 굵기 = 그 선 굵기 + 3, 어두운 거리 지도 위 `#FFFFFF` 불투명도 0.6, 그 밖(밝은 거리 지도·위성) `#1C1917` 0.5, `interactive: false`, 클래스 `ku-slope-casing`, 선이 흐려지면 같은 비율로 흐린다. 외곽선을 전부 선보다 아래에 둔다.
- 공개 지도 선은 굵기 5, 불투명도 0.85, 팝업 그대로(§4.1).
- 문구(그대로 쓴다): `경사도 범례`(범례 묶음 이름), `범례 편집`, `구간 추가`, `기본값으로`, `그 위 전부`, `도(°)` / `퍼센트(%)`, 토스트 `범례를 저장했어요`, 비활성 사유 `범례 설정을 읽지 못해 편집할 수 없어요. 새로 고친 뒤 다시 시도해 주세요`.
- 범례는 한국어만이다(§4.4).
- 입력 경고(`1/12 완화 한도 초과`, 30%)는 그대로다(§7).
- **검증 환경 (2026-10-19 확인):** 저장소와 워크트리 모두 `node_modules`가 없고 C 드라이브 여유가 2GB다. `npm ci`·`npm install`을 하지 않는다. lint·format·typecheck·unit·e2e는 draft PR의 CI(`gh pr checks <n> --watch`, 한 번에 약 9분)로 본다. 테스트를 구현보다 먼저 쓰는 순서는 지키되, 로컬에서 "실패를 확인하는" 실행은 하지 않는다. push 전에는 `npx --yes prettier@3.9.4 --write <바꾼 파일>`만 돌린다(lock의 prettier 버전).
- `AGENTS.md`의 Next 문서는 로컬에 없다. 라우트 핸들러 문서는 `https://unpkg.com/next@16.2.4/dist/docs/01-app/03-api-reference/03-file-conventions/route.md`에서 읽는다(2026-10-19 확인 — `export async function POST(request: Request)`와 `Response.json` 그대로 된다).
- 진행 기록은 커밋으로 남긴다. SDD 원장(`progress.md`)은 만들지 않는다.
- 커밋 메시지는 이 저장소 꼴(`feat: …한다` + 한국어 본문). `Co-Authored-By` 줄을 넣지 않는다. 주석·문서에 출처를 적을 때는 날짜만 쓴다(리뷰·점검 같은 과정 이름을 쓰지 않는다).
- 주석은 코드에서 읽히지 않는 이유·제약·위험만 쓴다. 다른 파일의 줄 번호·상수 값을 주석에 옮기지 않는다.
- 다른 문서의 대체 표시(머리 배너와 표)는 **그 절의 코드를 바꾸는 커밋**에서 단다(§"대체하는 기존 문서"). 문서 본문은 고치지 않고 머리 배너만 더한다.
- 이름·경로·주석의 주장을 바꾼 커밋마다 `rg -n "<옛 이름>" docs/ src/ e2e/` 결과를 확인하고, 모든 결과가 (a) 같은 커밋에서 고침, (b) 날짜가 붙은 당시 기록, (c) 무관 중 하나인지 본다.

## 범위 밖

- `feat/activity-log`의 감사 로그 설계 5.5 키 이름 표에 `slope_bands → 경사도 범례`를 더하는 일 — 그 브랜치가 병합된 뒤 따로 한다(§6.3).
- §10의 항목 전부.

## 계획에서 정한 것 (스펙이 열어 둔 곳)

| 곳                                  | 정한 것                                                                                                                                                                                                                                                                                  | 스펙 반영                      |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| 외곽선 순서(§11)                    | 공개 지도(`SlopeLayer`)는 마운트 순서로 둔다 — 선이 다시 붙는 경우가 없다. 작업 화면 지도(`SlopeWorkspaceMap`)는 고른 경로를 key를 바꿔 다시 붙이므로 외곽선이 `add` 때 `bringToBack()`한다. 편집 지도(`SlopeRouteMap`)는 묶음을 비우고 외곽선부터 넣는다. 별도 pane은 쓰지 않는다(아래) | Task 5·6에서 §11에 결과를 적음 |
| 별도 pane을 쓰지 않는 이유          | 사용자 pane의 SVG는 `globals.css`의 `will-change: auto` 규칙(`.leaflet-overlay-pane`만 대상) 밖이라 드래그 끝 한 프레임 밀림(`d9e0a20`)이 돌아온다. 또 Leaflet CSS가 SVG 루트의 포인터 이벤트를 끄지 않아, 위 pane의 SVG가 아래 pane의 클릭을 가린다                                     | Task 6에서 §11에 적음          |
| `className`·`interactive` 넘기는 곳 | react-leaflet 5는 `pathOptions`를 선을 지도에 붙인 **뒤** `setStyle`로 넘긴다(`@react-leaflet/core` `usePathOptions`). Leaflet은 `className`을 `_initPath`에서만 붙이므로 둘 다 `Polyline`의 최상위 prop으로 넘긴다                                                                      | 코드 주석                      |
| 범례 CSS 위치                       | 막대·눈금·툴팁은 `SlopeBandsLegend.tsx`가 불러오는 `slope-bands-legend.css`. `map-ui.css`는 공개 지도(`Map.tsx`)만 불러와 관리자 모달에 닿지 않는다. 지도 위 위치 규칙만 `map-ui.css`                                                                                                    | Task 5에서 §4.2·§8             |
| 데스크톱 막대 폭                    | 240px. 6구간 눈금 글자(`16.67%`·`18.43°`)가 10px 글꼴에서 200px의 칸 간격(약 33px)과 거의 같다. e2e가 겹침을 잰다                                                                                                                                                                        | Task 5에서 §2.4·§4.2           |
| 툴팁 위치                           | 범례 폭 전체에 걸친 상자. 공개 지도는 막대 위, 모달 미리보기는 아래(`tooltipPlacement`) — 모달 본문이 스크롤 상자라 위가 잘린다. 칸 가운데에 붙이면 끝 칸 툴팁이 화면 밖으로 나간다                                                                                                      | Task 5에서 §4.2                |
| 툴팁 열림 규칙                      | 마우스(`pointerType === "mouse"`)로 올리면 열고 떠나면 닫는다. 누르면(클릭·탭) 고정, 같은 칸을 다시 누르거나 바깥을 누르면 닫는다. 포커스로 열고 블러로 닫는다. Esc는 document 리스너로 닫는다                                                                                           | 스펙과 같음                    |
| 공개 지도의 첫 읽기                 | 경사도를 켤 때 처음 구독한다(범례·선이 그때 마운트). 지도를 열 때마다 읽지 않는다 — §2.6이 "레이어는 기본으로 꺼져 있다"를 근거로 든 것과 같다                                                                                                                                           | 스펙과 같음                    |
| 다른 경로 행(§5)                    | 받은 구간을 ref가 아니라 **상태**에 둔다. 행이 도착하면 그리기 effect가 돌아야 한다                                                                                                                                                                                                      | Task 7에서 §5                  |
| 다른 경로 외곽선 불투명도           | 다른 경로는 늘 흐린 선(0.55)이라 그 비율을 곱한다(0.5 × 0.55). 미리보기(0.85)·공개 지도(0.85)는 기본 불투명도라 곱하지 않는다                                                                                                                                                            | Task 7에서 §4.1                |
| 단위를 바꿀 때 범위 밖 입력         | 버리고 마지막으로 받아들인 숫자로 다시 쓴다(숫자는 그대로, §6.2). 문구가 옛 단위를 말하는 상태가 남지 않는다                                                                                                                                                                             | Task 4에서 §6.2                |
| 모달 미리보기가 검증을 못 통과할 때 | 범례 대신 `입력을 고치면 미리보기가 다시 보여요`. 상한이 없는 행은 눈금·범위를 쓸 수 없다                                                                                                                                                                                                | Task 8에서 §6.1                |
| 모달 최대 폭                        | 720px(스펙은 560px). 한 줄 배치(색 고르기·hex 116 + 이름 + 상한·환산값 약 121 + 설명 + 삭제 36 + 간격 32 + 안쪽 여백 40)에 이름·설명 칸까지 쓸 만하게 주면 약 625px가 든다. 560px에서는 이름 칸이 약 80px로 줄어 기본 이름도 잘린다. 760px보다 좁은 화면에서 두 줄로 접는다              | Task 8에서 §6.1                |
| 모달 바깥 닫기                      | 배경의 `mousedown` 대상이 배경일 때만 닫는다(`FeedbackButton`과 같음). `click`으로 받으면 안에서 끌다 밖에서 놓아도 초안째 닫힌다                                                                                                                                                        | 코드                           |
| 단위 선택지                         | `SlopeEditPanel`의 `UNIT_OPTIONS`를 `useSlopeRouteDraft.ts`로 옮겨(`SLOPE_UNIT_OPTIONS`) 단위 기억값과 같이 내보낸다                                                                                                                                                                     | Task 8에서 §8                  |
| 모달 초안 함수                      | `src/lib/slopeBandsDraft.ts`(신규). vitest가 node 환경이라 컴포넌트를 테스트하지 못해 순수 함수로 뺀다(`slopeDraft.ts`와 같은 꼴)                                                                                                                                                        | Task 4에서 §8                  |
| README                              | 고칠 것이 없다 — `rg -n "범례\|그라데이션\|판정\|1/12" README.md` 0건(2026-10-19). §8 표의 README 행을 지운다                                                                                                                                                                            | Task 0                         |

## 파일 구성

| 파일                                                                                           | 태스크      | 책임                                                               |
| ---------------------------------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------ |
| `src/lib/slopeBands.ts` (+ `.test.ts`)                                                         | 1           | 형, 기본값, 검증, DB 값 읽기, 판정, 글자색, 범위 표기, 외곽선 모양 |
| `src/lib/slopeScale.ts` (+ `.test.ts`)                                                         | 1·5·7       | `BOUNDARY_TOLERANCE` 내보내기 → 연속 색 삭제 → 판정 3색 삭제       |
| `src/lib/slopeBandsStore.ts` (+ `.test.ts`)                                                    | 2           | 한 번 읽고 나누는 저장소, `useSlopeBands`, `setSlopeBands`         |
| `src/app/api/settings/slope-bands/route.ts` (+ `.test.ts`)                                     | 3           | 관리자 저장 API                                                    |
| `src/lib/slopeBandsDraft.ts` (+ `.test.ts`)                                                    | 4           | 모달 초안 행과 그 변환                                             |
| `src/components/map/SlopeBandsLegend.tsx`, `slope-bands-legend.css`                            | 5           | 막대·눈금·툴팁(공개 지도와 모달이 같이 씀)                         |
| `src/components/map/SlopeLegend.tsx`                                                           | 5           | 지도 위 범례 — 저장소에서 읽어 넘김                                |
| `src/components/map/SlopeLayer.tsx`                                                            | 5           | 구간 색 선 + 외곽선                                                |
| `src/components/map/FilterPanel.tsx`, `Map.tsx`, `map-ui.css`, `FeedbackButton.tsx`            | 5           | 범례 자리 옮김, 지도 모서리 컨테이너                               |
| `src/lib/slopeWorkspace.ts` (+ `.test.ts`)                                                     | 6           | 판정·칩·배지 정리                                                  |
| `src/components/admin/slopes/SlopeListRow.tsx`, `SlopeViewPanel.tsx`, `SlopeWorkspaceMap.tsx`  | 6           | 구간 색                                                            |
| `src/components/admin/workspace/WorkspaceListPanel.tsx`                                        | 6·8         | 칩 없으면 칩 줄 생략 → `legendAction`                              |
| `src/app/admin/dashboard/slopes/page.tsx`                                                      | 6·8         | 범례를 구간에서, 칩 제거 → 범례 편집 버튼과 모달                   |
| `src/components/slope/SlopeRouteMap.tsx`, `SlopeSegmentList.tsx`                               | 7           | 편집 지도 구간 색·외곽선, 번호 원                                  |
| `src/types/domain.ts`                                                                          | 7           | `slope` 주석의 판정 위치                                           |
| `src/components/admin/slopes/SlopeBandsModal.tsx`                                              | 8           | 범례 편집 모달                                                     |
| `src/components/slope/useSlopeRouteDraft.ts`, `src/components/admin/slopes/SlopeEditPanel.tsx` | 8           | 단위 선택지·기억값 내보내기                                        |
| `src/app/admin/admin-ui.css`                                                                   | 8           | 모달·범례 줄·바텀시트 아랫줄                                       |
| `e2e/support/mockBackend.ts`                                                                   | 5·8         | `app_settings` key 필터·`slope_bands` 주입·조회 실패 → POST 기록   |
| `e2e/public-map.spec.ts`                                                                       | 5           | 범례 테스트 교체·추가                                              |
| `e2e/admin-slopes-workspace.spec.ts`                                                           | 5·6·7·8     | §9.2 표의 단언 교체, §9.3 관리자 테스트                            |
| `e2e/admin-dark.spec.ts`                                                                       | 8           | 모달 대비 스캔                                                     |
| `docs/specs/2026-10-06-…`, `docs/specs/2026-10-14-…`                                           | 5·6·7       | 머리 대체 표시                                                     |
| `docs/specs/2026-10-19-slope-bands-design.md`                                                  | 0·4·5·6·7·8 | 구현에서 정한 것 반영                                              |

---

### Task 0: 스펙·계획 커밋과 draft PR

워크트리 `korea-univ-project/.claude/worktrees/slope-bands`(브랜치 `feat/slope-bands`, upstream 없음)에서 한다. 스펙에는 2026-10-19 보강분이 커밋되지 않은 채 있다.

**Files:**

- Modify: `docs/specs/2026-10-19-slope-bands-design.md` (§8 표의 README 행)
- Create: `docs/plans/2026-10-19-slope-bands.md` (이 문서)

- [ ] **Step 1: 작업 트리 확인**

Run: `git status --short`
Expected: ` M docs/specs/2026-10-19-slope-bands-design.md`와 `?? docs/plans/`만.

- [ ] **Step 2: README 행 정리**

Run: `rg -n "범례|그라데이션|판정|1/12" README.md`
Expected: 0건. 그러면 스펙 §8 표에서 `| \`README.md\` | 경사도 범례·색 서술 |` 행을 지운다.

- [ ] **Step 3: 포맷**

Run: `npx --yes prettier@3.9.4 --write docs/specs/2026-10-19-slope-bands-design.md docs/plans/2026-10-19-slope-bands.md`

- [ ] **Step 4: 커밋**

```bash
git add docs/specs/2026-10-19-slope-bands-design.md docs/plans/2026-10-19-slope-bands.md
git commit -m "docs: 경사도 범례 설계를 보강하고 구현 계획을 둔다" -m "API 인증·검증 간격·저장소 경합·툴팁 Esc·외곽선 굵기 같은 빈칸을 설계에 채우고, README에는 범례 서술이 없어 파일 표에서 뺀다. 구현 계획은 docs/plans에 둔다."
```

- [ ] **Step 5: push와 draft PR**

```bash
git push -u origin feat/slope-bands
```

PR 본문을 scratchpad 파일로 쓰고 연다(마지막 태스크에서 다시 쓴다):

```markdown
경사도 범례를 4구간 단색으로 나누고, 구간 개수·경계·색·이름·설명을 관리자 경사도 화면에서 고치게 한다.

- 설계: `docs/specs/2026-10-19-slope-bands-design.md`
- 계획: `docs/plans/2026-10-19-slope-bands.md`

진행 중. 로컬 `node_modules`가 없어 lint·typecheck·test·e2e는 이 PR의 CI로 확인한다.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

Run: `gh pr create --draft --base main --title "feat: 경사도 범례를 구간 색으로 나누고 관리자가 고치게 한다" --body-file <scratchpad>/pr-body.md`
Expected: PR URL. 번호를 이후 태스크의 `<n>`으로 쓴다.

---

### Task 1: 구간 형·기본값·검증·판정 — `slopeBands.ts`

**Files:**

- Create: `src/lib/slopeBands.ts`
- Create: `src/lib/slopeBands.test.ts`
- Modify: `src/lib/slopeScale.ts` (`BOUNDARY_TOLERANCE`를 내보낸다)

**Interfaces:**

- Consumes: `slopeScale.ts`의 `WALKWAY_RATIO`·`RELAXED_RATIO`·`RAMP_EXCEPTION_RATIO`·`degToPercent`·`percentToDeg`·`formatSlopeInput`·`BOUNDARY_TOLERANCE`
- Produces:
  - `type SlopeBand = { name: string; upperPercent: number | null; color: string; description: string }`
  - `type SlopeBandsSetting = { bands: SlopeBand[] }`
  - `type SlopeBandsValidation = { ok: true; value: SlopeBandsSetting } | { ok: false; errors: string[] }`
  - 상수 `SLOPE_BANDS_SETTING_KEY = "slope_bands"`, `MIN_SLOPE_BANDS = 2`, `MAX_SLOPE_BANDS = 6`, `MAX_UPPER_PERCENT = 100`, `DEFAULT_SLOPE_BANDS: readonly SlopeBand[]`, `SLOPE_CASING_CLASS = "ku-slope-casing"`
  - `isHexColor(value: string): boolean`
  - `validateSlopeBands(value: unknown): SlopeBandsValidation`
  - `readSlopeBands(value: unknown): readonly SlopeBand[]`
  - `slopeBandIndexFromDeg(bands: readonly SlopeBand[], deg: number): number`
  - `slopeBandFromDeg(bands: readonly SlopeBand[], deg: number): SlopeBand`
  - `readableTextOn(hex: string): "#1C1917" | "#FFFFFF"`
  - `slopeBandRangeLabel(bands: readonly SlopeBand[], index: number): string`
  - `slopeCasingStyle(lineWeight: number, darkMap: boolean, fade?: number): { color: string; weight: number; opacity: number }`

- [ ] **Step 1: 테스트 작성** — `src/lib/slopeBands.test.ts`

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_SLOPE_BANDS,
  MAX_SLOPE_BANDS,
  MIN_SLOPE_BANDS,
  readSlopeBands,
  readableTextOn,
  slopeBandFromDeg,
  slopeBandIndexFromDeg,
  slopeBandRangeLabel,
  slopeCasingStyle,
  validateSlopeBands,
  type SlopeBand,
} from "./slopeBands";
import {
  RAMP_EXCEPTION_RATIO,
  RELAXED_RATIO,
  WALKWAY_RATIO,
  percentToDeg,
} from "./slopeScale";

function band(
  upperPercent: number | null,
  overrides: Partial<SlopeBand> = {},
): SlopeBand {
  return {
    name: "구간",
    upperPercent,
    color: "#8BC34A",
    description: "",
    ...overrides,
  };
}

function setting(...uppers: (number | null)[]) {
  return { bands: uppers.map((upper) => band(upper)) };
}

function errorsOf(value: unknown): string[] {
  const result = validateSlopeBands(value);
  return result.ok ? [] : result.errors;
}

const GAP_ERROR = "구간 2의 상한은 앞 구간보다 0.01%p 이상 커야 해요";
const RANGE_ERROR_1 = "구간 1의 상한을 0%보다 크고 100% 이하로 적어 주세요";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("DEFAULT_SLOPE_BANDS", () => {
  it("상한은 비율 상수를 반올림하지 않은 값이고 마지막은 null이다", () => {
    expect(DEFAULT_SLOPE_BANDS.map((entry) => entry.upperPercent)).toEqual([
      WALKWAY_RATIO * 100,
      RELAXED_RATIO * 100,
      RAMP_EXCEPTION_RATIO * 100,
      null,
    ]);
  });

  it("색은 연두·노랑·주황·빨강이다", () => {
    expect(DEFAULT_SLOPE_BANDS.map((entry) => entry.color)).toEqual([
      "#8BC34A",
      "#FFD600",
      "#FF9800",
      "#E53935",
    ]);
  });

  it("검증을 그대로 통과한다", () => {
    expect(validateSlopeBands({ bands: DEFAULT_SLOPE_BANDS })).toEqual({
      ok: true,
      value: { bands: DEFAULT_SLOPE_BANDS },
    });
  });
});

describe("validateSlopeBands — 개수와 형식", () => {
  it(`${MIN_SLOPE_BANDS}~${MAX_SLOPE_BANDS}개만 받는다`, () => {
    expect(errorsOf(setting(null))).toEqual(["구간은 2~6개여야 해요"]);
    expect(errorsOf(setting(1, 2, 3, 4, 5, 6, null))).toEqual([
      "구간은 2~6개여야 해요",
    ]);
    expect(errorsOf(setting(1, null))).toEqual([]);
    expect(errorsOf(setting(1, 2, 3, 4, 5, null))).toEqual([]);
  });

  it("객체가 아니거나 bands가 배열이 아니면 형식 오류다", () => {
    for (const value of [null, "nope", {}, { bands: "nope" }]) {
      expect(errorsOf(value)).toEqual(["범례 설정 형식이 올바르지 않아요"]);
    }
  });
});

describe("validateSlopeBands — 상한", () => {
  it("같거나 역순인 상한을 거부한다", () => {
    expect(errorsOf(setting(5, 5, null))).toEqual([GAP_ERROR]);
    expect(errorsOf(setting(6, 5, null))).toEqual([GAP_ERROR]);
  });

  // 5.01 − 5는 부동소수로 0.009999999999999787이다. 허용오차 없이 비교하면 사람이 친 5.01을 거부한다(설계 2.4)
  it("앞 상한보다 0.01%p 이상 커야 한다", () => {
    expect(errorsOf(setting(5, 5.009, null))).toEqual([GAP_ERROR]);
    expect(errorsOf(setting(5, 5.01, null))).toEqual([]);
  });

  it("0보다 크고 100 이하다", () => {
    expect(errorsOf(setting(0, null))).toEqual([RANGE_ERROR_1]);
    expect(errorsOf(setting(100.01, null))).toEqual([RANGE_ERROR_1]);
    expect(errorsOf(setting(NaN, null))).toEqual([RANGE_ERROR_1]);
    expect(errorsOf(setting(Infinity, null))).toEqual([RANGE_ERROR_1]);
    expect(errorsOf(setting(100, null))).toEqual([]);
  });

  it("마지막 구간만 상한이 없다", () => {
    expect(errorsOf(setting(5, 10))).toEqual([
      "마지막 구간에는 상한을 두지 않아요",
    ]);
    expect(errorsOf(setting(5, null, null))).toEqual([
      "구간 2의 상한을 0%보다 크고 100% 이하로 적어 주세요",
    ]);
  });
});

describe("validateSlopeBands — 이름·설명·색", () => {
  it("이름은 앞뒤 공백을 떼고 1~20자다", () => {
    expect(errorsOf({ bands: [band(5, { name: "   " }), band(null)] })).toEqual(
      ["구간 1의 이름을 1~20자로 적어 주세요"],
    );
    expect(
      errorsOf({ bands: [band(5, { name: "가".repeat(21) }), band(null)] }),
    ).toEqual(["구간 1의 이름을 1~20자로 적어 주세요"]);
    const result = validateSlopeBands({
      bands: [band(5, { name: ` ${"가".repeat(20)} ` }), band(null)],
    });
    expect(result.ok && result.value.bands[0].name).toBe("가".repeat(20));
  });

  it("설명은 비어도 되고 200자까지다", () => {
    expect(
      errorsOf({
        bands: [band(5, { description: "가".repeat(201) }), band(null)],
      }),
    ).toEqual(["구간 1의 설명은 200자까지예요"]);
    expect(
      errorsOf({
        bands: [band(5, { description: "가".repeat(200) }), band(null)],
      }),
    ).toEqual([]);
  });

  it("색은 #RRGGBB이고 대문자로 바꾼다", () => {
    for (const color of ["#FFF", "red", "#GGGGGG"]) {
      expect(errorsOf({ bands: [band(5, { color }), band(null)] })).toEqual([
        "구간 1의 색은 #RRGGBB 꼴로 적어 주세요",
      ]);
    }
    const result = validateSlopeBands({
      bands: [band(5, { color: "#ffd600" }), band(null)],
    });
    expect(result.ok && result.value.bands[0].color).toBe("#FFD600");
  });
});

describe("readSlopeBands", () => {
  it("읽지 못하면 기본값 전체로 그리고 경고를 남긴다", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    for (const value of [null, { bands: "nope" }, setting(5, 10)]) {
      expect(readSlopeBands(value)).toBe(DEFAULT_SLOPE_BANDS);
    }
    expect(warn).toHaveBeenCalledTimes(3);
  });

  it("검증을 통과하면 정규화한 값이다", () => {
    expect(
      readSlopeBands({ bands: [band(5, { color: "#abcdef" }), band(null)] }),
    ).toEqual([band(5, { color: "#ABCDEF" }), band(null)]);
  });
});

describe("slopeBandIndexFromDeg", () => {
  const bands = DEFAULT_SLOPE_BANDS;
  const boundaries = [
    WALKWAY_RATIO * 100,
    RELAXED_RATIO * 100,
    RAMP_EXCEPTION_RATIO * 100,
  ];

  // %로 친 경계를 도로 바꿔 넣어도 그 경계의 구간이다(2026-10-06 설계 8.2와 같은 실패를 고정)
  it("경계값은 그 구간에 들고 바로 위는 다음 구간이다", () => {
    boundaries.forEach((percent, index) => {
      expect(slopeBandIndexFromDeg(bands, percentToDeg(percent))).toBe(index);
      expect(slopeBandIndexFromDeg(bands, percentToDeg(percent + 0.001))).toBe(
        index + 1,
      );
    });
  });

  it("0은 첫 구간, 45°는 마지막 구간, 내리막은 절댓값이다", () => {
    expect(slopeBandIndexFromDeg(bands, 0)).toBe(0);
    expect(slopeBandIndexFromDeg(bands, 45)).toBe(3);
    expect(slopeBandIndexFromDeg(bands, -7.2)).toBe(3);
    expect(slopeBandIndexFromDeg(bands, -3)).toBe(0);
  });

  it("E2E가 쓰는 값의 구간 색", () => {
    expect(
      [1, 3, 4, 6, 7.2, 10].map((deg) => slopeBandFromDeg(bands, deg).color),
    ).toEqual([
      "#8BC34A",
      "#8BC34A",
      "#FFD600",
      "#FF9800",
      "#E53935",
      "#E53935",
    ]);
  });
});

describe("readableTextOn", () => {
  it("WCAG 대비가 높은 쪽 글자색을 고른다", () => {
    expect(
      ["#8BC34A", "#FFD600", "#FF9800", "#E53935"].map(readableTextOn),
    ).toEqual(["#1C1917", "#1C1917", "#1C1917", "#FFFFFF"]);
  });
});

describe("slopeBandRangeLabel", () => {
  it("첫·가운데·마지막 구간의 범위", () => {
    expect(
      DEFAULT_SLOPE_BANDS.map((_, index) =>
        slopeBandRangeLabel(DEFAULT_SLOPE_BANDS, index),
      ),
    ).toEqual([
      "5.56% 이하 (3.18°)",
      "5.56–8.33% (3.18–4.76°)",
      "8.33–12.5% (4.76–7.13°)",
      "12.5% 초과 (7.13°~)",
    ]);
  });
});

describe("slopeCasingStyle", () => {
  it("굵기는 선 + 3, 색·불투명도는 바탕 지도에 따른다", () => {
    expect(slopeCasingStyle(5, false)).toEqual({
      color: "#1C1917",
      weight: 8,
      opacity: 0.5,
    });
    expect(slopeCasingStyle(9, true)).toEqual({
      color: "#FFFFFF",
      weight: 12,
      opacity: 0.6,
    });
  });

  it("선이 흐려진 비율만큼 같이 흐려진다", () => {
    expect(slopeCasingStyle(5, false, 0.28).opacity).toBeCloseTo(0.14, 10);
  });
});
```

- [ ] **Step 2: `BOUNDARY_TOLERANCE` 내보내기** — `src/lib/slopeScale.ts`

```ts
// tan(atan(x)) 왕복의 부동소수 오차가 정확한 경계값을 넘기지 않게 한다(설계 2.2).
export const BOUNDARY_TOLERANCE = 1e-9;
```

(`const` 앞에 `export`만 붙인다. 주석은 그대로.)

- [ ] **Step 3: 구현** — `src/lib/slopeBands.ts`

```ts
/**
 * 경사 색 구간. 관리자가 `app_settings`의 `slope_bands`로 고치고 공개 지도와 관리자 화면이 같은 구간으로 그린다
 * — docs/specs/2026-10-19-slope-bands-design.md 2장.
 */
import {
  BOUNDARY_TOLERANCE,
  RAMP_EXCEPTION_RATIO,
  RELAXED_RATIO,
  WALKWAY_RATIO,
  degToPercent,
  formatSlopeInput,
  percentToDeg,
} from "@/lib/slopeScale";

// interface가 아니라 type이다 — Supabase의 Json 형에 그대로 넣으려면 암묵적 인덱스 시그니처가 필요하다
export type SlopeBand = {
  name: string;
  /** %, 반올림하지 않는다. 마지막 구간만 null(그 위 전부) */
  upperPercent: number | null;
  color: string;
  description: string;
};

export type SlopeBandsSetting = { bands: SlopeBand[] };

export type SlopeBandsValidation =
  { ok: true; value: SlopeBandsSetting } | { ok: false; errors: string[] };

export const SLOPE_BANDS_SETTING_KEY = "slope_bands";
export const MIN_SLOPE_BANDS = 2;
export const MAX_SLOPE_BANDS = 6;
// 45°(MAX_SLOPE_DEG)의 %. degToPercent(45)는 부동소수로 100보다 조금 작아 그 값으로 두면 100을 거부한다
export const MAX_UPPER_PERCENT = 100;
const MAX_NAME_LENGTH = 20;
const MAX_DESCRIPTION_LENGTH = 200;
const MIN_UPPER_GAP = 0.01;

export const DEFAULT_SLOPE_BANDS: readonly SlopeBand[] = [
  {
    name: "보도 기준 이내",
    upperPercent: WALKWAY_RATIO * 100,
    color: "#8BC34A",
    description: "보도 기준 1/18 이하",
  },
  {
    name: "완화 범위",
    upperPercent: RELAXED_RATIO * 100,
    color: "#FFD600",
    description: "완화 한도 1/12 이하",
  },
  {
    name: "특례 범위",
    upperPercent: RAMP_EXCEPTION_RATIO * 100,
    color: "#FF9800",
    description: "경사로 특례 한도 1/8 이하",
  },
  { name: "초과", upperPercent: null, color: "#E53935", description: "" },
];

const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;

export function isHexColor(value: string): boolean {
  return HEX_COLOR.test(value);
}

/** 관리자 폼과 API가 같이 쓴다. 통과하면 정규화한 값을, 아니면 오류 문구 목록을 돌려준다 */
export function validateSlopeBands(value: unknown): SlopeBandsValidation {
  const raw =
    value && typeof value === "object"
      ? (value as { bands?: unknown }).bands
      : undefined;
  if (!Array.isArray(raw))
    return { ok: false, errors: ["범례 설정 형식이 올바르지 않아요"] };
  if (raw.length < MIN_SLOPE_BANDS || raw.length > MAX_SLOPE_BANDS)
    return {
      ok: false,
      errors: [`구간은 ${MIN_SLOPE_BANDS}~${MAX_SLOPE_BANDS}개여야 해요`],
    };

  const errors: string[] = [];
  const bands: SlopeBand[] = [];
  let previousUpper: number | null = null;
  raw.forEach((entry: unknown, index) => {
    const label = `구간 ${index + 1}`;
    const fields =
      entry && typeof entry === "object"
        ? (entry as Record<string, unknown>)
        : {};

    const name = typeof fields.name === "string" ? fields.name.trim() : "";
    if (name.length < 1 || name.length > MAX_NAME_LENGTH)
      errors.push(`${label}의 이름을 1~${MAX_NAME_LENGTH}자로 적어 주세요`);

    const description =
      fields.description === undefined
        ? ""
        : typeof fields.description === "string"
          ? fields.description.trim()
          : null;
    if (description === null || description.length > MAX_DESCRIPTION_LENGTH)
      errors.push(`${label}의 설명은 ${MAX_DESCRIPTION_LENGTH}자까지예요`);

    const color =
      typeof fields.color === "string" && isHexColor(fields.color)
        ? fields.color.toUpperCase()
        : null;
    if (!color) errors.push(`${label}의 색은 #RRGGBB 꼴로 적어 주세요`);

    const upper = fields.upperPercent;
    let upperPercent: number | null = null;
    if (index === raw.length - 1) {
      if (upper !== null) errors.push("마지막 구간에는 상한을 두지 않아요");
    } else if (
      typeof upper !== "number" ||
      !Number.isFinite(upper) ||
      upper <= 0 ||
      upper > MAX_UPPER_PERCENT
    ) {
      errors.push(
        `${label}의 상한을 0%보다 크고 ${MAX_UPPER_PERCENT}% 이하로 적어 주세요`,
      );
    } else {
      // 간격이 판정 허용오차보다 좁으면 뒤 구간의 정확한 상한이 앞 구간으로 판정된다(설계 2.4)
      if (
        previousUpper !== null &&
        upper - previousUpper < MIN_UPPER_GAP - BOUNDARY_TOLERANCE
      )
        errors.push(
          `${label}의 상한은 앞 구간보다 ${MIN_UPPER_GAP}%p 이상 커야 해요`,
        );
      upperPercent = upper;
    }
    previousUpper = upperPercent;

    bands.push({
      name,
      upperPercent,
      color: color ?? "",
      description: description ?? "",
    });
  });

  return errors.length > 0
    ? { ok: false, errors }
    : { ok: true, value: { bands } };
}

/** DB 값을 읽는다. 일부 구간만 살리면 경계가 끊기거나 마지막 구간이 상한을 가져, 실패하면 기본값 전체로 그린다 */
export function readSlopeBands(value: unknown): readonly SlopeBand[] {
  const result = validateSlopeBands(value);
  if (result.ok) return result.value.bands;
  console.warn("[slope-bands] 저장된 범례를 읽지 못해 기본값으로 그린다", {
    errors: result.errors,
  });
  return DEFAULT_SLOPE_BANDS;
}

export function slopeBandIndexFromDeg(
  bands: readonly SlopeBand[],
  deg: number,
): number {
  const percent = degToPercent(Math.abs(deg));
  const last = bands.length - 1;
  for (let index = 0; index < last; index++) {
    const upper = bands[index].upperPercent;
    if (upper !== null && percent <= upper + BOUNDARY_TOLERANCE) return index;
  }
  return last;
}

export function slopeBandFromDeg(
  bands: readonly SlopeBand[],
  deg: number,
): SlopeBand {
  return bands[slopeBandIndexFromDeg(bands, deg)];
}

const DARK_TEXT = "#1C1917";
const LIGHT_TEXT = "#FFFFFF";

function relativeLuminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [n >> 16, (n >> 8) & 255, n & 255].map((channel) => {
    const c = channel / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(a: string, b: string): number {
  const [lighter, darker] = [relativeLuminance(a), relativeLuminance(b)].sort(
    (x, y) => y - x,
  );
  return (lighter + 0.05) / (darker + 0.05);
}

/** 관리자가 아무 색이나 고를 수 있어 글자색을 표로 정할 수 없다(설계 5장) */
export function readableTextOn(
  hex: string,
): typeof DARK_TEXT | typeof LIGHT_TEXT {
  return contrastRatio(hex, DARK_TEXT) >= contrastRatio(hex, LIGHT_TEXT)
    ? DARK_TEXT
    : LIGHT_TEXT;
}

function percentText(percent: number): string {
  return formatSlopeInput(percentToDeg(percent), "percent");
}

function degText(percent: number): string {
  return formatSlopeInput(percentToDeg(percent), "deg");
}

/** 범례 칸의 접근 이름에 붙는 범위(설계 4.4) */
export function slopeBandRangeLabel(
  bands: readonly SlopeBand[],
  index: number,
): string {
  const upper = bands[index].upperPercent;
  const lower = index === 0 ? null : bands[index - 1].upperPercent;
  if (lower === null && upper !== null)
    return `${percentText(upper)}% 이하 (${degText(upper)}°)`;
  if (lower !== null && upper === null)
    return `${percentText(lower)}% 초과 (${degText(lower)}°~)`;
  if (lower !== null && upper !== null)
    return `${percentText(lower)}–${percentText(upper)}% (${degText(lower)}–${degText(upper)}°)`;
  return "";
}

export const SLOPE_CASING_CLASS = "ku-slope-casing";
const CASING_EXTRA_WEIGHT = 3;

/** 선 밑 외곽선. 관리자가 고른 색마다 대비를 맞출 수 없어 색과 무관하게 선을 바탕에서 떼어 낸다(설계 4.1) */
export function slopeCasingStyle(
  lineWeight: number,
  darkMap: boolean,
  fade = 1,
) {
  return {
    color: darkMap ? "#FFFFFF" : "#1C1917",
    weight: lineWeight + CASING_EXTRA_WEIGHT,
    opacity: (darkMap ? 0.6 : 0.5) * fade,
  };
}
```

- [ ] **Step 4: 포맷·커밋·push**

```bash
npx --yes prettier@3.9.4 --write src/lib/slopeBands.ts src/lib/slopeBands.test.ts src/lib/slopeScale.ts
git add src/lib/slopeBands.ts src/lib/slopeBands.test.ts src/lib/slopeScale.ts
git commit -m "feat: 경사 색 구간의 형·기본값·검증·판정을 둔다" -m "관리자가 app_settings의 slope_bands로 고칠 구간 설정의 형과 기본값(1/18·1/12·1/8, 연두·노랑·주황·빨강)을 두고, 폼과 API가 같이 쓸 검증, DB 값 읽기, 도 단위 판정, 번호 원 글자색, 범례 접근 이름의 범위 표기, 선 밑 외곽선 모양을 한 모듈에 모은다. 경계 허용오차는 입력 경고와 같은 BOUNDARY_TOLERANCE를 쓴다."
git push
```

- [ ] **Step 5: CI 확인**

Run: `gh pr checks <n> --watch`
Expected: `Test (unit)` 통과(새 테스트 포함). 나머지 잡도 통과 — 이 태스크는 소비자가 없다. 실패하면 로그(`gh run view --log-failed`)를 읽고 고쳐 다시 push한다.

---

### Task 2: 구간 저장소 — `slopeBandsStore.ts`

**Files:**

- Create: `src/lib/slopeBandsStore.ts`
- Create: `src/lib/slopeBandsStore.test.ts`

**Interfaces:**

- Consumes: Task 1의 `DEFAULT_SLOPE_BANDS`·`SLOPE_BANDS_SETTING_KEY`·`readSlopeBands`·`SlopeBand`, `@/lib/supabaseClient`의 `supabase`
- Produces:
  - `type SlopeBandsStatus = "loading" | "ready" | "error"`
  - `interface SlopeBandsSnapshot { bands: readonly SlopeBand[]; status: SlopeBandsStatus }`
  - `subscribeSlopeBands(listener: () => void): () => void` — 첫 구독이 한 번 읽는다
  - `getSlopeBandsSnapshot(): SlopeBandsSnapshot`, `getSlopeBandsServerSnapshot(): SlopeBandsSnapshot`
  - `setSlopeBands(bands: readonly SlopeBand[]): void`
  - `useSlopeBands(): SlopeBandsSnapshot`

- [ ] **Step 1: 테스트 작성** — `src/lib/slopeBandsStore.test.ts`

모듈 상태는 테스트마다 `vi.resetModules()` 뒤 다시 불러 비운다. `slopeBands`도 다시 불리므로 기본값은 `toEqual`로 비교한다.

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { queryStub } from "@/test/queryStub";
import { DEFAULT_SLOPE_BANDS } from "./slopeBands";

const from = vi.fn();
vi.mock("@/lib/supabaseClient", () => ({ supabase: { from } }));

const THREE_BANDS = [
  { name: "낮음", upperPercent: 5, color: "#2E7D32", description: "" },
  { name: "중간", upperPercent: 10, color: "#F9A825", description: "" },
  { name: "높음", upperPercent: null, color: "#6A1B9A", description: "" },
];

async function loadStore() {
  return import("./slopeBandsStore");
}

describe("slopeBandsStore", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("구독 전에는 읽지 않고, 첫 스냅샷은 서버 스냅샷과 같은 객체다", async () => {
    const store = await loadStore();
    expect(store.getSlopeBandsSnapshot()).toBe(
      store.getSlopeBandsServerSnapshot(),
    );
    expect(store.getSlopeBandsSnapshot().status).toBe("loading");
    expect(store.getSlopeBandsSnapshot().bands).toEqual(DEFAULT_SLOPE_BANDS);
    expect(from).not.toHaveBeenCalled();
  });

  it("행이 없으면 ready·기본값이고 slope_bands 한 행만 묻는다", async () => {
    const stub = queryStub({ data: null, error: null });
    from.mockReturnValue(stub);
    const store = await loadStore();
    const listener = vi.fn();
    store.subscribeSlopeBands(listener);

    await vi.waitFor(() =>
      expect(store.getSlopeBandsSnapshot().status).toBe("ready"),
    );
    expect(store.getSlopeBandsSnapshot().bands).toEqual(DEFAULT_SLOPE_BANDS);
    expect(listener).toHaveBeenCalled();
    expect(from).toHaveBeenCalledWith("app_settings");
    expect(stub.calls).toContainEqual({
      method: "eq",
      args: ["key", "slope_bands"],
    });
    expect(stub.calls.map((call) => call.method)).toContain("maybeSingle");
  });

  it("저장된 값을 읽는다", async () => {
    from.mockReturnValue(
      queryStub({ data: { value: { bands: THREE_BANDS } }, error: null }),
    );
    const store = await loadStore();
    store.subscribeSlopeBands(() => {});
    await vi.waitFor(() =>
      expect(store.getSlopeBandsSnapshot().status).toBe("ready"),
    );
    expect(store.getSlopeBandsSnapshot().bands).toEqual(THREE_BANDS);
  });

  it("값이 깨졌으면 ready·기본값이다", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    from.mockReturnValue(
      queryStub({ data: { value: { bands: "nope" } }, error: null }),
    );
    const store = await loadStore();
    store.subscribeSlopeBands(() => {});
    await vi.waitFor(() =>
      expect(store.getSlopeBandsSnapshot().status).toBe("ready"),
    );
    expect(store.getSlopeBandsSnapshot().bands).toEqual(DEFAULT_SLOPE_BANDS);
  });

  it("조회 오류는 error·기본값이고 콘솔에 남긴다", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    from.mockReturnValue(
      queryStub({ data: null, error: { code: "XX000", message: "boom" } }),
    );
    const store = await loadStore();
    store.subscribeSlopeBands(() => {});
    await vi.waitFor(() =>
      expect(store.getSlopeBandsSnapshot().status).toBe("error"),
    );
    expect(store.getSlopeBandsSnapshot().bands).toEqual(DEFAULT_SLOPE_BANDS);
    expect(error).toHaveBeenCalled();
  });

  it("조회가 예외를 던져도 error·기본값이다", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    from.mockImplementation(() => {
      throw new Error("network");
    });
    const store = await loadStore();
    store.subscribeSlopeBands(() => {});
    await vi.waitFor(() =>
      expect(store.getSlopeBandsSnapshot().status).toBe("error"),
    );
  });

  it("두 번 구독해도 한 번만 읽는다", async () => {
    from.mockReturnValue(queryStub({ data: null, error: null }));
    const store = await loadStore();
    store.subscribeSlopeBands(() => {});
    store.subscribeSlopeBands(() => {});
    await vi.waitFor(() =>
      expect(store.getSlopeBandsSnapshot().status).toBe("ready"),
    );
    expect(from).toHaveBeenCalledTimes(1);
  });

  it("첫 읽기 응답 전에 저장하면 늦게 온 응답이 저장한 값을 되돌리지 않는다", async () => {
    let respond!: (value: unknown) => void;
    const pending = new Promise((resolve) => {
      respond = resolve;
    });
    from.mockReturnValue(queryStub(pending));
    const store = await loadStore();
    store.subscribeSlopeBands(() => {});

    store.setSlopeBands(THREE_BANDS);
    respond({ data: null, error: null });
    await pending;
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(store.getSlopeBandsSnapshot()).toEqual({
      bands: THREE_BANDS,
      status: "ready",
    });
  });
});
```

- [ ] **Step 2: 구현** — `src/lib/slopeBandsStore.ts`

```ts
"use client";

import { useSyncExternalStore } from "react";
import {
  DEFAULT_SLOPE_BANDS,
  SLOPE_BANDS_SETTING_KEY,
  readSlopeBands,
  type SlopeBand,
} from "@/lib/slopeBands";
import { supabase } from "@/lib/supabaseClient";

export type SlopeBandsStatus = "loading" | "ready" | "error";

export interface SlopeBandsSnapshot {
  bands: readonly SlopeBand[];
  status: SlopeBandsStatus;
}

// 서버 스냅샷과 첫 클라이언트 스냅샷이 같은 객체여야 hydration이 어긋나지 않는다
const INITIAL_SNAPSHOT: SlopeBandsSnapshot = {
  bands: DEFAULT_SLOPE_BANDS,
  status: "loading",
};

let snapshot = INITIAL_SNAPSHOT;
let loadStarted = false;
let writeCount = 0;
const listeners = new Set<() => void>();

function publish(next: SlopeBandsSnapshot) {
  snapshot = next;
  for (const listener of listeners) listener();
}

// getSetting은 조회 오류와 행 없음을 같은 fallback으로 돌려줘 둘을 가르지 못한다(설계 3장)
async function load() {
  const writesAtStart = writeCount;
  let next: SlopeBandsSnapshot;
  try {
    const { data, error } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", SLOPE_BANDS_SETTING_KEY)
      .maybeSingle();
    if (error) {
      console.error("[slope-bands] read failed", {
        code: error.code,
        message: error.message,
      });
      next = { bands: DEFAULT_SLOPE_BANDS, status: "error" };
    } else {
      next = {
        bands: data ? readSlopeBands(data.value) : DEFAULT_SLOPE_BANDS,
        status: "ready",
      };
    }
  } catch (error) {
    console.error("[slope-bands] read failed", error);
    next = { bands: DEFAULT_SLOPE_BANDS, status: "error" };
  }
  // 응답을 기다리는 사이 관리자가 저장했으면 그 값이 최신이다
  if (writeCount !== writesAtStart) return;
  publish(next);
}

export function subscribeSlopeBands(listener: () => void): () => void {
  listeners.add(listener);
  if (!loadStarted) {
    loadStarted = true;
    void load();
  }
  return () => {
    listeners.delete(listener);
  };
}

export function getSlopeBandsSnapshot(): SlopeBandsSnapshot {
  return snapshot;
}

export function getSlopeBandsServerSnapshot(): SlopeBandsSnapshot {
  return INITIAL_SNAPSHOT;
}

/** 관리자가 저장한 값으로 열린 화면 전체를 바꾼다 */
export function setSlopeBands(bands: readonly SlopeBand[]) {
  writeCount += 1;
  publish({ bands, status: "ready" });
}

export function useSlopeBands(): SlopeBandsSnapshot {
  return useSyncExternalStore(
    subscribeSlopeBands,
    getSlopeBandsSnapshot,
    getSlopeBandsServerSnapshot,
  );
}
```

- [ ] **Step 3: 포맷·커밋·push**

```bash
npx --yes prettier@3.9.4 --write src/lib/slopeBandsStore.ts src/lib/slopeBandsStore.test.ts
git add src/lib/slopeBandsStore.ts src/lib/slopeBandsStore.test.ts
git commit -m "feat: 경사 구간 설정을 한 번 읽어 화면에 나누는 저장소를 둔다" -m "첫 구독이 app_settings의 slope_bands 행을 한 번 읽는다. 행 없음·깨진 값은 ready와 기본값, 조회 오류는 error와 기본값이라 편집 진입이 둘을 가를 수 있다. 관리자가 저장하면 setSlopeBands로 열린 화면 전체가 바뀌고, 그 전에 떠난 첫 읽기 응답은 버린다."
git push
```

- [ ] **Step 4: CI 확인**

Run: `gh pr checks <n> --watch`
Expected: 전부 통과.

---

### Task 3: 저장 API — `POST /api/settings/slope-bands`

먼저 Next 16.2.4 라우트 핸들러 문서를 읽는다(Global Constraints의 unpkg 주소).

**Files:**

- Create: `src/app/api/settings/slope-bands/route.ts`
- Create: `src/app/api/settings/slope-bands/route.test.ts`

**Interfaces:**

- Consumes: `requireAdmin`(`@/lib/requireAdmin`), `supabaseAdmin`(`@/lib/server/supabaseAdmin`), Task 1의 `validateSlopeBands`·`SLOPE_BANDS_SETTING_KEY`
- Produces: `POST(request: Request): Promise<Response>` — 성공 `200 { ok: true, value: SlopeBandsSetting }`, 검증 실패 `400 { error: <첫 문구> }`, 저장 실패 `500 { error: "범례를 저장하지 못했어요" }`, 미인증은 `requireAdmin`의 응답

- [ ] **Step 1: 테스트 작성** — `src/app/api/settings/slope-bands/route.test.ts`

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SLOPE_BANDS } from "@/lib/slopeBands";
import { queryStub } from "@/test/queryStub";

const requireAdmin = vi.fn();
vi.mock("@/lib/requireAdmin", () => ({ requireAdmin }));
const from = vi.fn();
vi.mock("@/lib/server/supabaseAdmin", () => ({
  supabaseAdmin: () => ({ from }),
}));

function post(body: unknown) {
  return new Request("https://local.test/api/settings/slope-bands", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const TWO_BANDS = {
  bands: [
    { name: " 낮음 ", upperPercent: 5, color: "#00ff00", description: "" },
    { name: "높음", upperPercent: null, color: "#FF0000", description: "" },
  ],
};
const TWO_BANDS_NORMALIZED = {
  bands: [
    { name: "낮음", upperPercent: 5, color: "#00FF00", description: "" },
    { name: "높음", upperPercent: null, color: "#FF0000", description: "" },
  ],
};

describe("POST /api/settings/slope-bands", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAdmin.mockResolvedValue({ user: { id: "admin" } });
    from.mockImplementation(() => queryStub({ error: null }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("검증한 값을 slope_bands 행에 upsert하고 돌려준다", async () => {
    const stub = queryStub({ error: null });
    from.mockReturnValueOnce(stub);
    const { POST } = await import("./route");
    const response = await POST(post(TWO_BANDS));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      value: TWO_BANDS_NORMALIZED,
    });
    expect(from).toHaveBeenCalledWith("app_settings");
    const upsert = stub.calls.find((call) => call.method === "upsert")!;
    expect(upsert.args[0]).toMatchObject({
      key: "slope_bands",
      value: TWO_BANDS_NORMALIZED,
    });
    expect(typeof (upsert.args[0] as { updated_at: unknown }).updated_at).toBe(
      "string",
    );
    expect(upsert.args[1]).toEqual({ onConflict: "key" });
  });

  it("기본값의 상한을 반올림하지 않고 그대로 저장한다", async () => {
    const stub = queryStub({ error: null });
    from.mockReturnValueOnce(stub);
    const { POST } = await import("./route");
    await POST(post({ bands: DEFAULT_SLOPE_BANDS }));
    const upsert = stub.calls.find((call) => call.method === "upsert")!;
    expect(
      (
        upsert.args[0] as {
          value: { bands: { upperPercent: number | null }[] };
        }
      ).value.bands.map((band) => band.upperPercent),
    ).toEqual(DEFAULT_SLOPE_BANDS.map((band) => band.upperPercent));
  });

  it("검증에 실패하면 400과 첫 오류 문구이고 저장하지 않는다", async () => {
    const { POST } = await import("./route");
    const response = await POST(post({ bands: [TWO_BANDS.bands[1]] }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "구간은 2~6개여야 해요" });
    expect(from).not.toHaveBeenCalled();
  });

  it("JSON이 아닌 본문은 400이고 저장하지 않는다", async () => {
    const { POST } = await import("./route");
    const response = await POST(post("nope"));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "범례 설정 형식이 올바르지 않아요",
    });
    expect(from).not.toHaveBeenCalled();
  });

  it("관리자가 아니면 그 응답을 돌려주고 저장하지 않는다", async () => {
    requireAdmin.mockResolvedValue({
      response: Response.json({}, { status: 401 }),
    });
    const { POST } = await import("./route");
    expect((await POST(post(TWO_BANDS))).status).toBe(401);
    expect(from).not.toHaveBeenCalled();
  });

  it("저장이 실패하면 500이고 콘솔에 남긴다", async () => {
    from.mockImplementation(() =>
      queryStub({ error: { code: "XX000", message: "boom" } }),
    );
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { POST } = await import("./route");
    const response = await POST(post(TWO_BANDS));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: "범례를 저장하지 못했어요",
    });
    expect(spy).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 구현** — `src/app/api/settings/slope-bands/route.ts`

```ts
import { requireAdmin } from "@/lib/requireAdmin";
import { supabaseAdmin } from "@/lib/server/supabaseAdmin";
import { SLOPE_BANDS_SETTING_KEY, validateSlopeBands } from "@/lib/slopeBands";

// 공개 지도는 클라이언트에서 설정을 읽어 revalidatePath를 부르지 않는다. 동시 편집은 나중에 저장한 쪽이 이긴다(설계 6.3)
export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if (auth.response) return auth.response;

  const body: unknown = await request.json().catch(() => null);
  const result = validateSlopeBands(body);
  if (!result.ok)
    return Response.json({ error: result.errors[0] }, { status: 400 });

  const { error } = await supabaseAdmin().from("app_settings").upsert(
    {
      key: SLOPE_BANDS_SETTING_KEY,
      value: result.value,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "key" },
  );
  if (error) {
    console.error("[slope-bands] upsert failed", {
      code: error.code,
      message: error.message,
    });
    return Response.json(
      { error: "범례를 저장하지 못했어요" },
      { status: 500 },
    );
  }
  return Response.json({ ok: true, value: result.value });
}
```

`value: result.value`가 `Json`에 맞지 않는다고 typecheck가 실패하면 Task 1의 `SlopeBand`·`SlopeBandsSetting`이 `type` 별칭인지(인터페이스가 아닌지) 먼저 본다 — 별칭이어야 암묵적 인덱스 시그니처로 들어간다.

- [ ] **Step 3: 포맷·커밋·push**

```bash
npx --yes prettier@3.9.4 --write src/app/api/settings/slope-bands/route.ts src/app/api/settings/slope-bands/route.test.ts
git add src/app/api/settings/slope-bands
git commit -m "feat: 경사 구간 설정을 저장하는 관리자 API를 둔다" -m "다른 관리자 라우트와 같은 짝(requireAdmin → 검증 → supabaseAdmin upsert)이다. app_settings에 쓰기 정책이 없어 service role로만 쓸 수 있다. 검증은 관리자 폼과 같은 validateSlopeBands이고, 실패하면 첫 문구를 400으로 돌려준다."
git push
```

- [ ] **Step 4: CI 확인**

Run: `gh pr checks <n> --watch`
Expected: 전부 통과.

---

### Task 4: 모달 초안 함수 — `slopeBandsDraft.ts`

**Files:**

- Create: `src/lib/slopeBandsDraft.ts`
- Create: `src/lib/slopeBandsDraft.test.ts`
- Modify: `docs/specs/2026-10-19-slope-bands-design.md` (§6.2에 단위 전환 규칙 한 줄, §8 표에 두 파일)

**Interfaces:**

- Consumes: Task 1의 `MAX_SLOPE_BANDS`·`MIN_SLOPE_BANDS`·`MAX_UPPER_PERCENT`·`validateSlopeBands`·`SlopeBand`·`SlopeBandsValidation`, `slopeScale.ts`의 `MAX_SLOPE_DEG`·`degToPercent`·`percentToDeg`·`formatSlopeInput`·`SlopeUnit`
- Produces:
  - `interface SlopeBandDraftRow { key: number; name: string; color: string; description: string; upperPercent: number | null; upperInput: string; upperError: string | null }`
  - `draftFromBands(bands: readonly SlopeBand[], unit: SlopeUnit): SlopeBandDraftRow[]`
  - `editUpper(row: SlopeBandDraftRow, raw: string, unit: SlopeUnit): SlopeBandDraftRow`
  - `redraftBandsForUnit(rows: SlopeBandDraftRow[], unit: SlopeUnit): SlopeBandDraftRow[]`
  - `addBand(rows: SlopeBandDraftRow[]): SlopeBandDraftRow[]` (6개면 같은 배열)
  - `removeBand(rows: SlopeBandDraftRow[], index: number): SlopeBandDraftRow[]` (2개면 같은 배열)
  - `validateBandsDraft(rows: SlopeBandDraftRow[]): SlopeBandsValidation`
  - `draftHasInputError(rows: SlopeBandDraftRow[]): boolean`
  - `convertedUpper(row: SlopeBandDraftRow, unit: SlopeUnit): string | null`

- [ ] **Step 1: 테스트 작성** — `src/lib/slopeBandsDraft.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { DEFAULT_SLOPE_BANDS } from "./slopeBands";
import {
  addBand,
  convertedUpper,
  draftFromBands,
  draftHasInputError,
  editUpper,
  redraftBandsForUnit,
  removeBand,
  validateBandsDraft,
} from "./slopeBandsDraft";

function expectDefaultUppers(rows: { upperPercent: number | null }[]) {
  rows.forEach((row, index) =>
    expect(
      Object.is(row.upperPercent, DEFAULT_SLOPE_BANDS[index].upperPercent),
    ).toBe(true),
  );
}

describe("draftFromBands", () => {
  it("상한은 지금 단위의 입력 문자열로 쓰고 숫자는 그대로 든다", () => {
    expect(
      draftFromBands(DEFAULT_SLOPE_BANDS, "deg").map((row) => row.upperInput),
    ).toEqual(["3.18", "4.76", "7.13", ""]);
    const percent = draftFromBands(DEFAULT_SLOPE_BANDS, "percent");
    expect(percent.map((row) => row.upperInput)).toEqual([
      "5.56",
      "8.33",
      "12.5",
      "",
    ]);
    expectDefaultUppers(percent);
    expect(new Set(percent.map((row) => row.key)).size).toBe(4);
  });
});

describe("editUpper", () => {
  const [row] = draftFromBands(DEFAULT_SLOPE_BANDS, "deg");

  // tan은 주기 함수라 190°가 약 17.6%로 바뀌어 % 검사를 통과한다(설계 6.2)
  it("도는 %로 바꾸기 전에 0 초과 45 이하인지 본다", () => {
    for (const raw of ["190", "45.01", "0", "-1"]) {
      const next = editUpper(row, raw, "deg");
      expect(next.upperError).toBe("0°보다 크고 45° 이하로 적어 주세요");
      expect(next.upperInput).toBe(raw);
      expect(Object.is(next.upperPercent, row.upperPercent)).toBe(true);
    }
    const max = editUpper(row, "45", "deg");
    expect(max.upperError).toBeNull();
    expect(max.upperPercent).toBeCloseTo(100, 10);
  });

  it("%는 0 초과 100 이하이고 친 그대로 든다", () => {
    for (const raw of ["100.01", "0"]) {
      expect(editUpper(row, raw, "percent").upperError).toBe(
        "0%보다 크고 100% 이하로 적어 주세요",
      );
    }
    expect(editUpper(row, "100", "percent")).toMatchObject({
      upperPercent: 100,
      upperError: null,
    });
    expect(editUpper(row, "5.01", "percent").upperPercent).toBe(5.01);
  });

  it("비우면 상한이 없는 상태다", () => {
    expect(editUpper(row, "", "deg")).toMatchObject({
      upperInput: "",
      upperPercent: null,
      upperError: null,
    });
  });
});

describe("redraftBandsForUnit", () => {
  it("손대지 않은 행은 단위를 몇 번 바꿔도 숫자가 그대로다", () => {
    let rows = draftFromBands(DEFAULT_SLOPE_BANDS, "deg");
    for (const unit of ["percent", "deg", "percent", "deg"] as const)
      rows = redraftBandsForUnit(rows, unit);
    expectDefaultUppers(rows);
    expect(rows.map((row) => row.upperInput)).toEqual([
      "3.18",
      "4.76",
      "7.13",
      "",
    ]);
  });

  it("범위 밖 입력은 버리고 마지막으로 받아들인 숫자로 다시 쓴다", () => {
    const rows = draftFromBands(DEFAULT_SLOPE_BANDS, "deg");
    rows[0] = editUpper(rows[0], "190", "deg");
    const [first] = redraftBandsForUnit(rows, "percent");
    expect(first).toMatchObject({ upperInput: "5.56", upperError: null });
    expect(
      Object.is(first.upperPercent, DEFAULT_SLOPE_BANDS[0].upperPercent),
    ).toBe(true);
  });
});

describe("addBand / removeBand", () => {
  it("구간 추가는 마지막 바로 앞에 빈 행을 넣고 색은 앞 구간의 색이다", () => {
    const rows = addBand(draftFromBands(DEFAULT_SLOPE_BANDS, "percent"));
    expect(rows).toHaveLength(5);
    expect(rows[3]).toMatchObject({
      name: "",
      color: "#FF9800",
      upperPercent: null,
      upperInput: "",
      upperError: null,
    });
    expect(rows[4].name).toBe("초과");
  });

  it("6개면 더하지 않는다", () => {
    const rows = addBand(
      addBand(draftFromBands(DEFAULT_SLOPE_BANDS, "percent")),
    );
    expect(rows).toHaveLength(6);
    expect(addBand(rows)).toBe(rows);
  });

  it("2개면 지우지 않는다", () => {
    const rows = removeBand(
      removeBand(draftFromBands(DEFAULT_SLOPE_BANDS, "percent"), 0),
      0,
    );
    expect(rows).toHaveLength(2);
    expect(removeBand(rows, 0)).toBe(rows);
  });

  it("마지막 행을 지우면 바로 앞 행이 새 마지막이 되어 상한을 잃는다", () => {
    const rows = removeBand(draftFromBands(DEFAULT_SLOPE_BANDS, "percent"), 3);
    expect(rows).toHaveLength(3);
    expect(rows[2]).toMatchObject({
      name: "특례 범위",
      upperPercent: null,
      upperInput: "",
    });
  });

  it("행을 지워도 다른 행은 그대로다", () => {
    const before = draftFromBands(DEFAULT_SLOPE_BANDS, "percent");
    const after = removeBand(before, 1);
    expect(after[0]).toBe(before[0]);
    expect(after[1]).toBe(before[2]);
  });
});

describe("validateBandsDraft / draftHasInputError / convertedUpper", () => {
  it("손대지 않은 기본값 초안은 기본값 상수 그대로 통과한다", () => {
    expect(
      validateBandsDraft(draftFromBands(DEFAULT_SLOPE_BANDS, "deg")),
    ).toEqual({ ok: true, value: { bands: DEFAULT_SLOPE_BANDS } });
  });

  it("상한을 넣지 않은 새 행이 있으면 통과하지 못한다", () => {
    expect(
      validateBandsDraft(addBand(draftFromBands(DEFAULT_SLOPE_BANDS, "deg")))
        .ok,
    ).toBe(false);
  });

  it("범위 밖 입력이 하나라도 있으면 입력 오류다", () => {
    const rows = draftFromBands(DEFAULT_SLOPE_BANDS, "deg");
    expect(draftHasInputError(rows)).toBe(false);
    rows[1] = editUpper(rows[1], "190", "deg");
    expect(draftHasInputError(rows)).toBe(true);
  });

  it("다른 단위 환산값은 받아들인 숫자가 있을 때만", () => {
    const [row] = draftFromBands(DEFAULT_SLOPE_BANDS, "deg");
    expect(convertedUpper(row, "deg")).toBe("5.56%");
    expect(convertedUpper(row, "percent")).toBe("3.18°");
    expect(convertedUpper(editUpper(row, "190", "deg"), "deg")).toBeNull();
    expect(convertedUpper(editUpper(row, "", "deg"), "deg")).toBeNull();
  });
});
```

- [ ] **Step 2: 구현** — `src/lib/slopeBandsDraft.ts`

```ts
import {
  MAX_SLOPE_BANDS,
  MAX_UPPER_PERCENT,
  MIN_SLOPE_BANDS,
  validateSlopeBands,
  type SlopeBand,
  type SlopeBandsValidation,
} from "@/lib/slopeBands";
import {
  MAX_SLOPE_DEG,
  degToPercent,
  formatSlopeInput,
  percentToDeg,
  type SlopeUnit,
} from "@/lib/slopeScale";

/**
 * 범례 편집 모달의 구간 한 줄. 상한은 숫자와 입력 문자열을 따로 든다 — 화면 문자열(`5.56`)을 다시 읽어 저장하면
 * 경계가 반올림한 쪽으로 움직인다(설계 2026-10-19 6.2).
 */
export interface SlopeBandDraftRow {
  /** React key. 행을 더하거나 지워도 다른 행의 것은 그대로다 */
  key: number;
  name: string;
  color: string;
  description: string;
  /** %. 마지막 행과 상한을 아직 넣지 않은 행은 null */
  upperPercent: number | null;
  upperInput: string;
  /** 범위 밖 입력의 문구. 있는 동안 upperPercent는 그 전 값이다 */
  upperError: string | null;
}

const UPPER_RANGE_ERROR: Record<SlopeUnit, string> = {
  deg: `0°보다 크고 ${MAX_SLOPE_DEG}° 이하로 적어 주세요`,
  percent: `0%보다 크고 ${MAX_UPPER_PERCENT}% 이하로 적어 주세요`,
};

let lastKey = 0;

function nextKey(): number {
  lastKey += 1;
  return lastKey;
}

function formatUpper(upperPercent: number | null, unit: SlopeUnit): string {
  return upperPercent === null
    ? ""
    : formatSlopeInput(percentToDeg(upperPercent), unit);
}

export function draftFromBands(
  bands: readonly SlopeBand[],
  unit: SlopeUnit,
): SlopeBandDraftRow[] {
  return bands.map((band) => ({
    key: nextKey(),
    name: band.name,
    color: band.color,
    description: band.description,
    upperPercent: band.upperPercent,
    upperInput: formatUpper(band.upperPercent, unit),
    upperError: null,
  }));
}

/** 사용자가 상한 칸을 고쳤을 때만 부른다. % 입력은 친 그대로, 도 입력은 바꾼 결과를 반올림하지 않고 든다 */
export function editUpper(
  row: SlopeBandDraftRow,
  raw: string,
  unit: SlopeUnit,
): SlopeBandDraftRow {
  if (raw.trim() === "")
    return { ...row, upperInput: raw, upperPercent: null, upperError: null };
  const value = Number(raw);
  const max = unit === "deg" ? MAX_SLOPE_DEG : MAX_UPPER_PERCENT;
  // 도는 %로 바꾸기 전에 검사한다 — tan은 주기 함수라 190°가 약 17.6%로 통과한다
  if (!Number.isFinite(value) || value <= 0 || value > max)
    return { ...row, upperInput: raw, upperError: UPPER_RANGE_ERROR[unit] };
  return {
    ...row,
    upperInput: raw,
    upperPercent: unit === "percent" ? value : degToPercent(value),
    upperError: null,
  };
}

/** 숫자는 그대로 두고 입력란만 새 단위로 다시 쓴다. 범위 밖 입력은 버리고 마지막으로 받아들인 숫자로 되돌린다 */
export function redraftBandsForUnit(
  rows: SlopeBandDraftRow[],
  unit: SlopeUnit,
): SlopeBandDraftRow[] {
  return rows.map((row) => ({
    ...row,
    upperInput: formatUpper(row.upperPercent, unit),
    upperError: null,
  }));
}

export function addBand(rows: SlopeBandDraftRow[]): SlopeBandDraftRow[] {
  if (rows.length >= MAX_SLOPE_BANDS) return rows;
  const insertAt = rows.length - 1;
  const added: SlopeBandDraftRow = {
    key: nextKey(),
    name: "",
    color: rows[insertAt - 1].color,
    description: "",
    upperPercent: null,
    upperInput: "",
    upperError: null,
  };
  return [...rows.slice(0, insertAt), added, rows[insertAt]];
}

export function removeBand(
  rows: SlopeBandDraftRow[],
  index: number,
): SlopeBandDraftRow[] {
  if (rows.length <= MIN_SLOPE_BANDS) return rows;
  const next = rows.filter((_, i) => i !== index);
  if (index === rows.length - 1) {
    const last = next.length - 1;
    next[last] = {
      ...next[last],
      upperPercent: null,
      upperInput: "",
      upperError: null,
    };
  }
  return next;
}

export function validateBandsDraft(
  rows: SlopeBandDraftRow[],
): SlopeBandsValidation {
  return validateSlopeBands({
    bands: rows.map(({ name, upperPercent, color, description }) => ({
      name,
      upperPercent,
      color,
      description,
    })),
  });
}

export function draftHasInputError(rows: SlopeBandDraftRow[]): boolean {
  return rows.some((row) => row.upperError !== null);
}

/** 상한 입력란 옆에 보이는 다른 단위 환산값 */
export function convertedUpper(
  row: SlopeBandDraftRow,
  unit: SlopeUnit,
): string | null {
  if (row.upperPercent === null || row.upperError !== null) return null;
  const other: SlopeUnit = unit === "deg" ? "percent" : "deg";
  return `${formatUpper(row.upperPercent, other)}${other === "deg" ? "°" : "%"}`;
}
```

`removeBand`는 지운 행이 마지막일 때만 새 마지막 행을 바꾼다 — 가운데 행을 지울 때 마지막 행은 이미 상한이 `null`이라 그대로 둔다(테스트 "행을 지워도 다른 행은 그대로다").

- [ ] **Step 3: 스펙 반영** — `docs/specs/2026-10-19-slope-bands-design.md`

§6.2의 "단위를 바꾸면 숫자는 그대로 두고 문자열만 새 단위로 다시 쓴다" 줄 끝에 이어 쓴다: `범위 밖 입력이 남은 칸은 그 입력을 버리고 마지막으로 받아들인 숫자로 다시 쓴다 — 문구가 옛 단위를 말하는 상태가 남지 않는다.`

§8 표에 두 줄을 더한다: `src/lib/slopeBandsDraft.ts` — `신규. 모달 초안 행과 그 변환(6.2). vitest가 node 환경이라 컴포넌트 대신 순수 함수로 뺀다`, `src/lib/slopeBandsDraft.test.ts` — `신규`.

- [ ] **Step 4: 포맷·커밋·push**

```bash
npx --yes prettier@3.9.4 --write src/lib/slopeBandsDraft.ts src/lib/slopeBandsDraft.test.ts docs/specs/2026-10-19-slope-bands-design.md
git add src/lib/slopeBandsDraft.ts src/lib/slopeBandsDraft.test.ts docs/specs/2026-10-19-slope-bands-design.md
git commit -m "feat: 범례 편집 초안의 상한을 숫자와 입력 문자열로 따로 든다" -m "화면에 보이는 5.56·8.33을 다시 읽어 저장하면 1/18·1/12 경계가 반올림한 쪽으로 움직인다. 초안 행은 상한 숫자와 입력 문자열을 따로 들고, 숫자는 사용자가 그 칸을 고쳤을 때만 바뀐다. 도로 친 값은 %로 바꾸기 전에 0~45로 검사한다. 단위를 바꾸면 범위 밖 입력은 버리고 마지막으로 받아들인 숫자로 다시 쓴다."
git push
```

- [ ] **Step 5: CI 확인**

Run: `gh pr checks <n> --watch`
Expected: 전부 통과.

---

### Task 5: 공개 지도 — 구간 색 선·외곽선·지도 위 범례

이 태스크부터 화면이 바뀐다. 공개 지도의 연속 색을 지우고, 그 색에 기댄 e2e를 같이 고친다.

**Files:**

- Create: `src/components/map/SlopeBandsLegend.tsx`, `src/components/map/slope-bands-legend.css`
- Modify: `src/components/map/SlopeLegend.tsx`, `SlopeLayer.tsx`, `FilterPanel.tsx`, `Map.tsx`, `map-ui.css`, `FeedbackButton.tsx`(주석)
- Modify: `src/lib/slopeScale.ts`, `src/lib/slopeScale.test.ts` (연속 색 삭제)
- Modify: `e2e/support/mockBackend.ts`, `e2e/public-map.spec.ts`, `e2e/admin-slopes-workspace.spec.ts`("편집기에서 저장한 경로가 공개 지도에 그대로 그려진다")
- Modify: `docs/specs/2026-10-06-slope-units-and-editor-design.md`(머리 배너), `docs/specs/2026-10-19-slope-bands-design.md`(§2.4·§4.2·§8·§11)

**Interfaces:**

- Consumes: Task 1의 `slopeBandFromDeg`·`slopeBandRangeLabel`·`slopeCasingStyle`·`SLOPE_CASING_CLASS`·`SlopeBand`, Task 2의 `useSlopeBands`
- Produces:
  - `SlopeBandsLegend` 기본 내보내기 — props `{ bands: readonly SlopeBand[]; tooltipPlacement?: "above" | "below"; onTooltipOpenChange?: (open: boolean) => void }`. 루트는 `div.ku-slope-bands`(`role="group"`·`aria-label="경사도 범례"`), 칸은 `button.ku-slope-bands-cell`, 눈금 줄은 `.ku-slope-bands-ticks`, 툴팁은 `role="tooltip"`
  - 지도 위 범례는 `div.ku-slope-legend`(상자·위치) 안에 `SlopeBandsLegend`를 둔다. 상자와 막대가 다른 요소라 `.ku-slope-legend .ku-slope-bands`로 막대 폭을 바꿀 수 있다
  - `SlopeLayer` props `{ slopes; darkMap: boolean }`
  - `MockState.slopeBands: unknown`(undefined면 행 없음), `MockState.slopeBandsReadFails: boolean`

- [ ] **Step 1: 목 백엔드** — `e2e/support/mockBackend.ts`

`MockState`에 더한다:

```ts
/** `app_settings`의 `slope_bands` 값. undefined면 행이 없다 */
slopeBands: unknown;
/** 켜면 `slope_bands` 조회가 500으로 실패한다 */
slopeBandsReadFails: boolean;
```

`createState`의 반환 객체에 `slopeBands: undefined, slopeBandsReadFails: false,`를 더한다.

`rows()`의 `app_settings` 분기를 바꾼다. 지금은 어떤 조회에도 `feedback_emails` 한 행을 돌려줘, `slope_bands`를 물어도 그 행이 와서 우연히 기본값으로 떨어진다(§8):

```ts
if (name === "app_settings") {
  const settings: Row[] = [
    {
      key: "feedback_emails",
      value: {
        to: "help@example.com",
        cc: "cc@example.com",
        subject: "[테스트] 피드백",
      },
    },
  ];
  if (state.slopeBands !== undefined)
    settings.push({ key: "slope_bands", value: state.slopeBands });
  const key = url.searchParams.get("key");
  return key?.startsWith("eq.")
    ? settings.filter((row) => row.key === key.slice(3))
    : settings;
}
```

`handleRest`에서 `rpc/get_admin_building_summary` 분기 바로 뒤, `const result = projectEmbeds(...)` 앞에 넣는다:

```ts
if (
  name === "app_settings" &&
  state.slopeBandsReadFails &&
  url.searchParams.get("key") === "eq.slope_bands"
)
  return json(route, { code: "XX000", message: "boom" }, 500);
```

`rows()` 위 주석의 "정적 테이블(facility_types/colleges/app_settings)은 즉시 반환"을 "정적 테이블(facility_types/colleges)은 즉시, app_settings는 `?key=eq.`로 거른 행을 반환"으로, 파일 머리 주석의 필터 목록 줄 `` `?id=eq.|in.(…)` / `?building_id=eq.|is.null|in.(…)` 필터, `` 뒤에 `` `app_settings`의 `?key=eq.` 필터, ``를 더한다.

- [ ] **Step 2: 공개 지도 e2e** — `e2e/public-map.spec.ts`

"공개 지도 핵심 사용자 흐름" 안의 `test("경사도 범례는 그라데이션 막대에 세 단계와 경계 눈금(%·°)을 보여준다", …)`를 지운다. 파일 끝에 아래 두 describe를 더한다. 이 테스트들은 목 상태를 고쳐야 해서 describe마다 `installMockBackend`를 직접 부른다.

```ts
test.describe("공개 지도 — 경사도 범례", () => {
  function legendOf(page: Page) {
    return page.getByRole("group", { name: "경사도 범례" });
  }

  test("경사도를 켜면 지도 위에 구간 범례가 뜨고 경계 눈금만 늘 보인다", async ({
    page,
  }) => {
    await installMockBackend(page);
    await page.goto("/");
    const legend = legendOf(page);
    await expect(legend).toHaveCount(0);

    await page.getByRole("checkbox", { name: /경사도/ }).check();
    await expect(legend).toBeVisible();
    for (const label of [
      "5.56%",
      "3.18°",
      "8.33%",
      "4.76°",
      "12.5%",
      "7.13°",
    ]) {
      await expect(legend.getByText(label, { exact: true })).toBeVisible();
    }
    for (const name of ["보도 기준 이내", "완화 범위", "특례 범위", "초과"]) {
      await expect(legend.getByText(name, { exact: true })).toHaveCount(0);
    }
    await expect(legend.getByRole("button")).toHaveCount(4);
    for (const name of [
      "보도 기준 이내, 5.56% 이하 (3.18°)",
      "완화 범위, 5.56–8.33% (3.18–4.76°)",
      "특례 범위, 8.33–12.5% (4.76–7.13°)",
      "초과, 12.5% 초과 (7.13°~)",
    ]) {
      await expect(
        legend.getByRole("button", { name, exact: true }),
      ).toBeVisible();
    }

    await page.getByRole("checkbox", { name: /경사도/ }).uncheck();
    await expect(legend).toHaveCount(0);
  });

  test("칸에 마우스를 올리거나 누르거나 포커스하면 이름·설명 툴팁이 뜬다", async ({
    page,
  }) => {
    await installMockBackend(page);
    await page.goto("/");
    await page.getByRole("checkbox", { name: /경사도/ }).check();
    const legend = legendOf(page);
    const tooltip = page.getByRole("tooltip");
    const first = legend.getByRole("button", { name: /^보도 기준 이내,/ });
    const last = legend.getByRole("button", { name: /^초과,/ });

    await first.hover();
    await expect(tooltip.locator("strong")).toHaveText("보도 기준 이내");
    await expect(tooltip).toContainText("보도 기준 1/18 이하");
    await expect(first).toHaveAccessibleDescription(/보도 기준 1\/18 이하/);
    await page.mouse.move(700, 120);
    await expect(tooltip).toHaveCount(0);

    // 설명이 빈 마지막 칸은 이름만. 눌러 연 툴팁은 마우스가 떠나도 남는다
    await last.click();
    await expect(tooltip).toHaveText("초과");
    await page.mouse.move(700, 120);
    await expect(tooltip).toHaveText("초과");
    await last.click();
    await expect(tooltip).toHaveCount(0);

    await last.click();
    await page.mouse.click(700, 120);
    await expect(tooltip).toHaveCount(0);

    await first.focus();
    await expect(tooltip.locator("strong")).toHaveText("보도 기준 이내");
    await page.keyboard.press("Escape");
    await expect(tooltip).toHaveCount(0);
  });

  test("데스크톱 범례는 지도 버튼 열 왼쪽에 바닥을 맞추고 건물 패널을 열면 같이 비킨다", async ({
    page,
  }) => {
    await installMockBackend(page);
    await page.goto("/");
    await page.getByRole("checkbox", { name: /경사도/ }).check();
    const box = page.locator(".ku-slope-legend");
    const actions = page.locator(".ku-map-actions");
    await expect(box).toBeVisible();

    const legendBox = (await box.boundingBox())!;
    const actionsBox = (await actions.boundingBox())!;
    expect(legendBox.x + legendBox.width).toBeLessThanOrEqual(actionsBox.x);
    expect(
      Math.abs(
        legendBox.y + legendBox.height - (actionsBox.y + actionsBox.height),
      ),
    ).toBeLessThanOrEqual(1);

    await page.getByPlaceholder("건물 검색...").fill("중앙도서관");
    await page.getByText("중앙도서관", { exact: true }).last().click();
    const panel = page.locator(".ku-side-panel");
    await expect(panel).toBeVisible();
    await expect
      .poll(async () => {
        const moved = (await box.boundingBox())!;
        const panelBox = (await panel.boundingBox())!;
        return moved.x + moved.width <= panelBox.x;
      })
      .toBe(true);
  });

  test("저장된 범례가 있으면 선 색과 눈금이 그 값을, 깨졌으면 기본값을 따른다", async ({
    page,
  }) => {
    const state = await installMockBackend(page);
    state.slopeBands = {
      bands: [
        { name: "낮음", upperPercent: 6, color: "#2E7D32", description: "" },
        { name: "중간", upperPercent: 12, color: "#F9A825", description: "" },
        { name: "높음", upperPercent: null, color: "#6A1B9A", description: "" },
      ],
    };
    await page.goto("/");
    await page.getByRole("checkbox", { name: /경사도/ }).check();
    const legend = legendOf(page);
    await expect(legend.getByRole("button")).toHaveCount(3);
    await expect(legend.getByText("6%", { exact: true })).toBeVisible();
    await expect(legend.getByText("12%", { exact: true })).toBeVisible();
    // 목 경로 1은 3°(5.24%), 2는 7.2°(12.63%)다
    await expect(
      page.locator('.leaflet-overlay-pane path[stroke="#2E7D32"]'),
    ).toHaveCount(1);
    await expect(
      page.locator('.leaflet-overlay-pane path[stroke="#6A1B9A"]'),
    ).toHaveCount(1);

    state.slopeBands = { bands: "broken" };
    await page.goto("/");
    await page.getByRole("checkbox", { name: /경사도/ }).check();
    await expect(legend.getByRole("button")).toHaveCount(4);
    await expect(
      page.locator('.leaflet-overlay-pane path[stroke="#8BC34A"]'),
    ).toHaveCount(1);
    await expect(
      page.locator('.leaflet-overlay-pane path[stroke="#E53935"]'),
    ).toHaveCount(1);
  });

  test("선마다 밑에 외곽선을 먼저 깔고 클릭은 선이 받는다", async ({
    page,
  }) => {
    await installMockBackend(page);
    await page.goto("/");
    await page.getByRole("checkbox", { name: /경사도/ }).check();
    const casings = page.locator(".leaflet-overlay-pane path.ku-slope-casing");
    await expect(casings).toHaveCount(2);
    await expect(casings.first()).toHaveAttribute("stroke", "#1C1917");
    await expect(casings.first()).toHaveAttribute("stroke-width", "8");
    await expect(casings.first()).toHaveAttribute("stroke-opacity", "0.5");
    await expect(casings.and(page.locator(".leaflet-interactive"))).toHaveCount(
      0,
    );

    const order = await page
      .locator(".leaflet-overlay-pane path")
      .evaluateAll((paths) =>
        paths.map((path) =>
          path.classList.contains("ku-slope-casing")
            ? "casing"
            : (path.getAttribute("stroke") ?? ""),
        ),
      );
    expect(order.lastIndexOf("casing")).toBeLessThan(
      order.findIndex((stroke) => stroke === "#8BC34A" || stroke === "#E53935"),
    );

    await page.locator('.leaflet-overlay-pane path[stroke="#8BC34A"]').click();
    await expect(page.locator(".leaflet-popup")).toContainText("정문-중앙광장");

    await page.emulateMedia({ colorScheme: "dark" });
    await expect(casings.first()).toHaveAttribute("stroke", "#FFFFFF");
    await expect(casings.first()).toHaveAttribute("stroke-opacity", "0.6");
  });

  test("6구간에서도 경계 눈금 글자가 겹치지 않는다", async ({ page }) => {
    const state = await installMockBackend(page);
    state.slopeBands = {
      bands: [16.67, 33.33, 41.67, 58.33, 83.33, null].map(
        (upperPercent, index) => ({
          name: `구간 ${index + 1}`,
          upperPercent,
          color: "#8BC34A",
          description: "",
        }),
      ),
    };
    for (const viewport of [
      { width: 1280, height: 720 },
      { width: 375, height: 800 },
    ]) {
      const mobile = viewport.width < 768;
      await page.setViewportSize(viewport);
      await page.goto("/");
      if (mobile) await page.getByRole("button", { name: /시설 필터/ }).click();
      await page.getByRole("checkbox", { name: /경사도/ }).check();
      if (mobile) await page.getByRole("button", { name: /시설 필터/ }).click();
      const legend = legendOf(page);
      await expect(legend.getByRole("button")).toHaveCount(6);

      const rows = await legend
        .locator(".ku-slope-bands-ticks")
        .evaluateAll((elements) =>
          elements.map((row) =>
            Array.from(row.children).map((tick) => {
              const box = tick.getBoundingClientRect();
              return [box.left, box.right];
            }),
          ),
        );
      expect(rows).toHaveLength(2);
      for (const ticks of rows) {
        expect(ticks).toHaveLength(5);
        for (let i = 1; i < ticks.length; i++)
          expect(ticks[i - 1][1]).toBeLessThanOrEqual(ticks[i][0]);
      }
    }
  });
});

test.describe("공개 지도 — 경사도 범례 (모바일)", () => {
  test.use({ viewport: { width: 375, height: 800 }, hasTouch: true });

  test("필터를 접어도 남고, 탭으로 툴팁을 열고 닫으며, 둘러보기와 버튼 열을 비키고 건물을 열면 숨는다", async ({
    page,
  }) => {
    await installMockBackend(page);
    await page.goto("/");
    const filter = page.getByRole("button", { name: /시설 필터/ });
    await filter.click();
    await page.getByRole("checkbox", { name: /경사도/ }).check();
    const legend = page.getByRole("group", { name: "경사도 범례" });
    // 필터가 열린 동안은 버튼 열과 같은 규칙으로 숨는다
    await expect(legend).toBeHidden();
    await filter.click();
    await expect(legend).toBeVisible();

    const cell = legend.getByRole("button", { name: /^완화 범위,/ });
    await cell.tap();
    await expect(page.getByRole("tooltip")).toContainText(
      "완화 한도 1/12 이하",
    );
    await cell.tap();
    await expect(page.getByRole("tooltip")).toHaveCount(0);

    const legendBox = (await page.locator(".ku-slope-legend").boundingBox())!;
    const browseBox = (await page
      .locator(".ku-map-browse-trigger")
      .boundingBox())!;
    const actionsBox = (await page.locator(".ku-map-actions").boundingBox())!;
    expect(legendBox.y + legendBox.height).toBeLessThanOrEqual(browseBox.y);
    expect(legendBox.x + legendBox.width).toBeLessThanOrEqual(actionsBox.x);

    await page.getByPlaceholder("건물 검색...").fill("중앙도서관");
    await page.getByText("중앙도서관", { exact: true }).last().click();
    await expect(legend).toBeHidden();
  });
});
```

`Page` 형은 파일 첫 줄 import에 이미 있다.

- [ ] **Step 3: 관리자 끝단 e2e** — `e2e/admin-slopes-workspace.spec.ts`의 "편집기에서 저장한 경로가 공개 지도에 그대로 그려진다"

10°(17.63%)는 기본 구간에서 픽스처 경로 2와 같은 마지막 빨강이라 선을 가려 잡지 못한다(§9.2). 아래처럼 바꾼다.

```ts
await detail.getByLabel("경로 이름").fill("끝단 시험 경사로");
await detail.getByLabel("구간 1 경사도").fill("4");
await detail.getByRole("button", { name: "저장", exact: true }).click();
await expect(page).toHaveURL(/\?id=3$/);

await page.goto("/");
await page.getByRole("checkbox", { name: "경사도" }).check();

// 4°(6.99%)는 기본 구간의 둘째 노랑이다. 픽스처의 두 행(3°, 7.2°)은 다른 구간이라 방금 저장한 경로만 잡힌다
const saved = page.locator('path[stroke="#FFD600"]').first();
await expect(saved).toBeVisible();

await saved.dispatchEvent("click");
const popup = page.locator(".leaflet-popup");
await expect(popup).toContainText("끝단 시험 경사로");
await expect(popup).toContainText("7.0%");
await expect(popup).toContainText("4.0°");
```

- [ ] **Step 4: 범례 컴포넌트** — `src/components/map/SlopeBandsLegend.tsx`

```tsx
"use client";

import {
  useEffect,
  useEffectEvent,
  useId,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { slopeBandRangeLabel, type SlopeBand } from "@/lib/slopeBands";
import { formatSlopeInput, percentToDeg } from "@/lib/slopeScale";
import "./slope-bands-legend.css";

type TooltipSource = "hover" | "pin" | "focus";

interface SlopeBandsLegendProps {
  bands: readonly SlopeBand[];
  /** 모달처럼 위가 스크롤 상자에 잘리는 곳에서는 아래 */
  tooltipPlacement?: "above" | "below";
  /** 모달이 툴팁이 열린 동안 자기 Esc 닫기를 끈다(설계 6.1) */
  onTooltipOpenChange?: (open: boolean) => void;
}

/** 공개 지도와 범례 편집 모달의 미리보기가 같이 쓴다. 저장소를 직접 읽지 않고 구간을 props로 받는다 */
export default function SlopeBandsLegend({
  bands,
  tooltipPlacement = "above",
  onTooltipOpenChange,
}: SlopeBandsLegendProps) {
  const [tooltip, setTooltip] = useState<{
    index: number;
    source: TooltipSource;
  } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const tooltipId = useId();
  const openIndex =
    tooltip && tooltip.index < bands.length ? tooltip.index : null;
  const isOpen = openIndex !== null;
  const notifyOpenChange = useEffectEvent((open: boolean) =>
    onTooltipOpenChange?.(open),
  );

  useEffect(() => {
    if (!isOpen) return;
    notifyOpenChange(true);
    function handlePointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setTooltip(null);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setTooltip(null);
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      notifyOpenChange(false);
    };
  }, [isOpen]);

  const last = bands.length - 1;
  const boundaryLeft = (index: number) =>
    `${((index + 1) / bands.length) * 100}%`;
  const ticks = (unit: "percent" | "deg") =>
    bands.slice(0, last).map((band, index) =>
      band.upperPercent === null ? null : (
        <span key={index} style={{ left: boundaryLeft(index) }}>
          {formatSlopeInput(percentToDeg(band.upperPercent), unit)}
          {unit === "percent" ? "%" : "°"}
        </span>
      ),
    );

  return (
    <div
      ref={rootRef}
      className="ku-slope-bands"
      role="group"
      aria-label="경사도 범례"
      data-tooltip={tooltipPlacement}
    >
      <div className="ku-slope-bands-ticks" aria-hidden="true">
        {ticks("percent")}
      </div>
      <div className="ku-slope-bands-bar">
        {bands.map((band, index) => (
          <button
            key={index}
            type="button"
            className="ku-slope-bands-cell"
            style={{ "--band-color": band.color } as CSSProperties}
            aria-label={`${band.name}, ${slopeBandRangeLabel(bands, index)}`}
            aria-describedby={openIndex === index ? tooltipId : undefined}
            onPointerEnter={(event) => {
              if (event.pointerType !== "mouse") return;
              setTooltip((current) =>
                current?.index === index && current.source === "pin"
                  ? current
                  : { index, source: "hover" },
              );
            }}
            onPointerLeave={(event) => {
              if (event.pointerType !== "mouse") return;
              setTooltip((current) =>
                current?.index === index && current.source === "hover"
                  ? null
                  : current,
              );
            }}
            onFocus={() =>
              setTooltip((current) =>
                current?.index === index ? current : { index, source: "focus" },
              )
            }
            onBlur={() =>
              setTooltip((current) =>
                current?.index === index && current.source === "focus"
                  ? null
                  : current,
              )
            }
            onClick={() =>
              setTooltip((current) =>
                current?.index === index && current.source === "pin"
                  ? null
                  : { index, source: "pin" },
              )
            }
          />
        ))}
      </div>
      <div className="ku-slope-bands-ticks" aria-hidden="true">
        {ticks("deg")}
      </div>
      {openIndex !== null && (
        <div id={tooltipId} role="tooltip" className="ku-slope-bands-tooltip">
          <strong>{bands[openIndex].name}</strong>
          {bands[openIndex].description && (
            <span>{bands[openIndex].description}</span>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 5: 범례 CSS** — `src/components/map/slope-bands-legend.css`

```css
/* 관리자 모달 미리보기도 이 컴포넌트를 쓴다. map-ui.css는 공개 지도(Map.tsx)만 불러와 여기 둔다 */
.ku-slope-bands {
  position: relative;
  /* 6구간 눈금 글자(예: 16.67%)가 200px에서는 칸 간격과 거의 같아 겹친다 */
  width: 240px;
  color: var(--ku-text-2);
  font-size: 10px;
  line-height: 1.2;
}
.ku-slope-bands-ticks {
  position: relative;
  height: 12px;
}
.ku-slope-bands-ticks span {
  position: absolute;
  top: 0;
  transform: translateX(-50%);
  white-space: nowrap;
}
.ku-slope-bands-bar {
  display: flex;
}
/* 보이는 막대는 8px이고 버튼은 위아래로 더 넓게 눌린다 */
.ku-slope-bands-cell {
  position: relative;
  flex: 1;
  height: 20px;
  padding: 0;
  border: 0;
  background: none;
  cursor: pointer;
}
.ku-slope-bands-cell::before {
  position: absolute;
  top: 6px;
  right: 0;
  left: 0;
  height: 8px;
  background: var(--band-color);
  content: "";
}
.ku-slope-bands-cell:focus-visible {
  outline: 2px solid var(--ku-crimson-700);
  outline-offset: 1px;
}
/* 칸 가운데에 붙이면 끝 칸의 툴팁이 화면 밖으로 나간다. 범례 폭 전체에 건다 */
.ku-slope-bands-tooltip {
  position: absolute;
  z-index: 1;
  right: 0;
  bottom: calc(100% + 6px);
  left: 0;
  display: grid;
  gap: 2px;
  padding: 6px 8px;
  border: 1px solid var(--ku-border);
  border-radius: var(--ku-radius);
  color: var(--ku-text-1);
  background: var(--ku-surface);
  box-shadow: var(--ku-shadow-raised);
  font-size: 12px;
  line-height: 1.4;
}
.ku-slope-bands[data-tooltip="below"] .ku-slope-bands-tooltip {
  top: calc(100% + 6px);
  bottom: auto;
}
.ku-slope-bands-tooltip span {
  color: var(--ku-text-2);
}
```

- [ ] **Step 6: 지도 위 범례** — `src/components/map/SlopeLegend.tsx` (파일 전체를 바꾼다)

```tsx
"use client";

import { useSlopeBands } from "@/lib/slopeBandsStore";
import SlopeBandsLegend from "./SlopeBandsLegend";

// 경사도를 켰을 때만 구독한다. 첫 구독이 범례 설정을 읽는다 — 레이어는 기본으로 꺼져 있다(설계 2.6)
function MapSlopeLegend() {
  const { bands } = useSlopeBands();
  return (
    <div className="ku-slope-legend">
      <SlopeBandsLegend bands={bands} />
    </div>
  );
}

export default function SlopeLegend({ show }: { show: boolean }) {
  return show ? <MapSlopeLegend /> : null;
}
```

- [ ] **Step 7: 선과 외곽선** — `src/components/map/SlopeLayer.tsx` (파일 전체를 바꾼다)

```tsx
"use client";
import { Polyline, Popup } from "react-leaflet";
import {
  SLOPE_CASING_CLASS,
  slopeBandFromDeg,
  slopeCasingStyle,
} from "@/lib/slopeBands";
import { useSlopeBands } from "@/lib/slopeBandsStore";
import { degToPercent, formatDeg, formatPercent } from "@/lib/slopeScale";
import { readRoutePoints } from "@/lib/slopeRoute";
import type { SlopeSegment } from "@/types/domain";

// /api/slopes는 id·name·segments만 select한다. Row 전체를 받는 것처럼 쓰면
// 런타임에 없는 필드를 있는 것으로 보증하게 된다.
type SlopeRoute = Pick<SlopeSegment, "id" | "name" | "segments">;

const LINE_WEIGHT = 5;

export default function SlopeLayer({
  slopes,
  darkMap,
}: {
  slopes: SlopeRoute[];
  /** 어두운 거리 지도면 외곽선이 흰색이다 */
  darkMap: boolean;
}) {
  const { bands } = useSlopeBands();
  const casing = slopeCasingStyle(LINE_WEIGHT, darkMap);
  const lines = slopes.flatMap((route) => {
    const points = readRoutePoints(route.segments);
    if (!points) return [];
    const [, ...measured] = points;
    return measured.map((point, i) => ({
      key: `${route.id}-${i}`,
      route,
      point,
      positions: [
        [points[i].lat, points[i].lng],
        [point.lat, point.lng],
      ] as [number, number][],
    }));
  });

  // 외곽선을 전부 먼저 마운트한다. SVG는 붙인 순서대로 쌓여, 구간마다 번갈아 그리면 다음 외곽선이 앞 선의 끝을 덮는다.
  // className·interactive는 최상위 prop이다 — react-leaflet은 pathOptions를 선을 붙인 뒤 setStyle로 넘기고,
  // Leaflet은 둘을 선을 만들 때만 읽는다
  return (
    <>
      {lines.map(({ key, positions }) => (
        <Polyline
          key={`casing-${key}`}
          positions={positions}
          className={SLOPE_CASING_CLASS}
          interactive={false}
          pathOptions={casing}
        />
      ))}
      {lines.map(({ key, route, point, positions }) => (
        <Polyline
          key={key}
          positions={positions}
          pathOptions={{
            color: slopeBandFromDeg(bands, point.slope).color,
            weight: LINE_WEIGHT,
            opacity: 0.85,
          }}
        >
          <Popup>
            <div style={{ fontSize: 13, lineHeight: 1.6 }}>
              <div style={{ fontWeight: 600, marginBottom: 2 }}>
                {route.name}
              </div>
              <div>
                경사 <strong>{formatPercent(degToPercent(point.slope))}</strong>{" "}
                ({formatDeg(point.slope)})
              </div>
              <div style={{ color: "#888", fontSize: 11 }}>
                구간 거리 {point.distance}m
              </div>
            </div>
          </Popup>
        </Polyline>
      ))}
    </>
  );
}
```

- [ ] **Step 8: 필터 패널에서 범례 빼기** — `src/components/map/FilterPanel.tsx`

`import SlopeLegend from "./SlopeLegend";` 줄과 `<SlopeLegend show={showSlope} />` 줄을 지운다. `showSlope`는 체크박스와 배지 계산이 계속 쓴다.

- [ ] **Step 9: 지도 모서리 컨테이너** — `src/components/map/Map.tsx`

import 목록의 `import SlopeLayer from "./SlopeLayer";` 아래에 `import SlopeLegend from "./SlopeLegend";`를 더한다.

선 레이어에 바탕 지도를 넘긴다:

```tsx
{
  showSlope && slopes.length > 0 && (
    <SlopeLayer
      slopes={slopes}
      darkMap={tileMode === "street" && prefersDarkMode}
    />
  );
}
```

버튼 열을 가로 컨테이너로 감싸고 `data-*`를 컨테이너로 옮긴다. `ku-map-actions` 안의 자식(확대·축소, 내 위치, 지도 종류, `FeedbackButton`)은 그대로다:

```tsx
<div
  className="ku-map-corner"
  data-panel-open={Boolean(selectedBuilding)}
  data-overlay-open={mobileFilterOpen || browseOpen}
>
  <SlopeLegend show={showSlope} />
  <div className="ku-map-actions">
    {/* 지금의 .ku-map-actions 자식 그대로 */}
  </div>
</div>
```

(위 JSX 주석 줄은 자리 표시다. 실제로는 지금 자식들을 옮기고 그 주석은 넣지 않는다.)

- [ ] **Step 10: CSS** — `src/components/map/map-ui.css`

옛 범례 규칙(`.ku-slope-legend`부터 `.ku-slope-threshold + .ku-slope-threshold`까지 — `.ku-slope-legend-title`, `.ku-slope-scale`, `-levels`, `-level`, `-bar`, `-ticks`, `-tick`, `-tick::before`, `.ku-slope-threshold`)을 지우고 그 자리에 둔다:

```css
.ku-slope-legend {
  padding: 2px 10px 4px;
  border: 1px solid color-mix(in srgb, var(--ku-border) 78%, transparent);
  border-radius: var(--ku-radius);
  background: var(--ku-map-control);
  box-shadow: var(--ku-shadow-raised);
}
```

데스크톱 `.ku-map-actions`와 `.ku-map-actions[data-panel-open="true"]` 두 규칙을 아래로 바꾼다:

```css
.ku-map-corner {
  position: absolute;
  z-index: 1000;
  right: 20px;
  bottom: 20px;
  display: flex;
  align-items: flex-end;
  gap: 10px;
  transition: right 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}
.ku-map-corner[data-panel-open="true"] {
  right: 360px;
}
.ku-map-actions {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 10px;
}
```

`@media (max-width: 767px)` 안의 `.ku-map-actions { right…; bottom…; gap… }`와 `.ku-map-actions[data-panel-open="true"], .ku-map-actions[data-overlay-open="true"] { display: none; }`를 아래로 바꾼다:

```css
/* 모바일은 범례가 버튼 열 옆이 아니라 둘러보기 위에 선다. 컨테이너를 풀어 둘을 지도 셸 기준으로 놓는다 */
.ku-map-corner {
  display: contents;
}
.ku-map-actions {
  position: absolute;
  z-index: 1000;
  right: 16px;
  bottom: calc(16px + env(safe-area-inset-bottom, 0px));
  gap: 10px;
}
.ku-map-corner[data-panel-open="true"] > *,
.ku-map-corner[data-overlay-open="true"] > * {
  display: none;
}
/* 바닥은 둘러보기 트리거(.ku-map-browse의 bottom 44px + 높이 44px) 위 8px, 오른쪽은 버튼 열(16px + 48px)과 10px 띄운다 */
.ku-slope-legend {
  position: absolute;
  z-index: 1000;
  right: 74px;
  bottom: calc(96px + env(safe-area-inset-bottom, 0px));
  left: 16px;
}
.ku-slope-legend .ku-slope-bands {
  width: auto;
}
```

같은 미디어 쿼리 안 `.ku-map-browse { bottom: calc(44px + …) }` 위 주석 끝에 한 줄 더한다: `bottom을 바꾸면 .ku-slope-legend의 bottom도 같이 바꾼다.`

- [ ] **Step 11: 쌓임 맥락 주석** — `src/components/map/FeedbackButton.tsx`

`{/* 실행 버튼이 있는 .ku-map-actions는 z-index로 쌓임 맥락을 만들어` → `{/* 실행 버튼을 감싼 지도 모서리(.ku-map-corner, 모바일은 .ku-map-actions)는 z-index로 쌓임 맥락을 만들어`. 뒤 줄은 그대로.

- [ ] **Step 12: 연속 색 지우기** — `src/lib/slopeScale.ts`, `src/lib/slopeScale.test.ts`

`slopeScale.ts`에서 지운다: `SlopeGradientStop`, `SLOPE_GRADIENT_STOPS`(위 주석 포함), `SlopeLevel`, `SLOPE_LEVELS`, `SlopeReferenceLine`, `SLOPE_REFERENCE_LINES`, `type Oklab`, `srgbToLinear`, `linearToSrgb`, `hexToOklab`, `oklabToHex`, `colorAtPercent`, `slopeColorFromDeg`. `SLOPE_GRADE_COLORS` 위 주석 "관리자 화면 전용 판정 3색. 공개 지도는 연속 색(slopeColorFromDeg)을 쓴다(설계 2026-10-14 2.1)."은 "관리자 화면 전용 판정 3색(설계 2026-10-14 2.1)."로 줄인다(Task 7에서 통째로 지운다).

`slopeScale.test.ts`에서 `slopeColorFromDeg` import와 `// 기대값은 slopeScale.ts를 거치지 않고…` 주석이 붙은 `describe("slopeColorFromDeg", …)` 전체를 지운다.

Run: `rg -n "SLOPE_GRADIENT_STOPS|SLOPE_LEVELS|SLOPE_REFERENCE_LINES|slopeColorFromDeg|SlopeGradientStop|SlopeLevel|SlopeReferenceLine|ku-slope-scale|ku-slope-threshold|ku-slope-legend-title" src e2e docs`
Expected: `docs/specs/2026-10-06-…`(날짜가 붙은 당시 기록), `docs/specs/2026-10-14-…`(당시 기록), `docs/specs/2026-10-19-…`(대체 대상을 말하는 문장)만. `src`·`e2e`에는 0건.

- [ ] **Step 13: 대체 표시** — `docs/specs/2026-10-06-slope-units-and-editor-design.md`

머리(첫 40줄)를 먼저 읽는다. `> **2026-10-15 — 일부 대체.** …` 배너와 그 표 다음, `---` 앞에 새 배너를 둔다. 본문은 고치지 않는다.

```markdown
> **2026-10-19 — 일부 대체.** 아래 절은 [`2026-10-19-slope-bands-design.md`](./2026-10-19-slope-bands-design.md)가 대체한다. 본문은 당시 기록으로 둔다.
>
> | 이 문서                                          | 당시                                            | 현재                                                                                                                        |
> | ------------------------------------------------ | ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
> | 11.1 연속 색(`SLOPE_GRADIENT_STOPS`, OKLab 보간) | 값에 따른 연속 색                               | 구간마다 한 색. 구간 개수·경계·색은 관리자가 고친다(`app_settings`의 `slope_bands`) — 새 문서 2장·4.1                       |
> | 11.2 범례 3단계·기준선 세 줄                     | 필터 패널 안 그라데이션 막대, 단계 이름, 기준선 | 지도 위 같은 폭 칸 막대. 경계 눈금(%·°)만 늘 보이고 이름·설명은 툴팁. 데스크톱 오른쪽 아래·모바일 둘러보기 위 — 새 문서 4장 |
```

- [ ] **Step 14: 스펙 반영** — `docs/specs/2026-10-19-slope-bands-design.md`

- §2.4 "6은 데스크톱 막대 폭 약 200px(4.2)에서 경계 눈금이 약 33px 간격이 되는 수다. …" 단락을: `6은 데스크톱 막대 폭 240px(4.2)에서 경계 눈금이 40px 간격이 되는 수다. 2026-10-19 구현 — 200px에서는 6구간 눈금 글자(예: 16.67%·18.43°)가 칸 간격(약 33px)과 거의 같아 240px로 넓혔고, 겹치지 않는지는 e2e가 잰다(9.3).`
- §4.2 크기 줄의 "데스크톱 폭 약 200px … 정확한 값은 구현에서 `map-ui.css`에 둔다"를: `데스크톱 폭 240px(2.4), 눈금 글자 10px. 막대·눈금·툴팁 규칙은 컴포넌트가 불러오는 slope-bands-legend.css에 둔다 — 관리자 모달도 같은 컴포넌트를 쓰는데 map-ui.css는 공개 지도(Map.tsx)만 불러온다. 지도 위 위치 규칙만 map-ui.css다.`
- §4.2 툴팁 꼭지에 한 줄 더한다: `툴팁은 범례 폭 전체에 걸린다 — 칸 가운데에 붙이면 끝 칸 툴팁이 화면 밖으로 나간다. 공개 지도는 막대 위, 모달 미리보기는 아래(tooltipPlacement)다.`
- §8 표의 `map-ui.css` 행을 `옛 범례 규칙 제거, 범례 상자·지도 모서리 컨테이너·모바일 위치`로, `SlopeBandsLegend.tsx` 행 뒤에 `src/components/map/slope-bands-legend.css` — `신규. 막대·눈금·툴팁`을 더한다.
- §11 첫째·둘째 꼭지 아래에 `2026-10-19 — 공개 지도(SlopeLayer)는 선이 다시 붙는 경우가 없어 외곽선을 먼저 마운트하는 것으로 순서가 지켜진다. className·interactive는 Polyline의 최상위 prop으로 넘긴다 — react-leaflet 5는 pathOptions를 선을 붙인 뒤 setStyle로 넘겨 Leaflet이 읽지 않는다. 작업 화면·편집 지도는 Task 6·7.`

- [ ] **Step 15: 포맷·커밋·push**

```bash
npx --yes prettier@3.9.4 --write src/components/map/SlopeBandsLegend.tsx src/components/map/slope-bands-legend.css src/components/map/SlopeLegend.tsx src/components/map/SlopeLayer.tsx src/components/map/FilterPanel.tsx src/components/map/Map.tsx src/components/map/map-ui.css src/components/map/FeedbackButton.tsx src/lib/slopeScale.ts src/lib/slopeScale.test.ts e2e/support/mockBackend.ts e2e/public-map.spec.ts e2e/admin-slopes-workspace.spec.ts docs/specs/2026-10-06-slope-units-and-editor-design.md docs/specs/2026-10-19-slope-bands-design.md
git add -A src/components/map src/lib/slopeScale.ts src/lib/slopeScale.test.ts e2e docs/specs
git commit -m "feat: 공개 지도의 경사 색을 구간 색으로 바꾸고 범례를 지도 위에 띄운다" -m "선은 구간 색 한 가지이고 밑에 외곽선을 깐다. 관리자가 고르는 색마다 대비를 맞출 수 없어 외곽선이 색과 무관하게 선을 바탕에서 떼어 낸다. 범례는 필터 패널에서 빼 지도 버튼 열 왼쪽(모바일은 둘러보기 위)에 띄운다. 경계 눈금만 늘 보이고 구간 이름·설명은 툴팁이다. 연속 색(OKLab 보간)과 3단계 범례 상수는 지운다." -m "범례 CSS는 관리자 모달도 쓰므로 컴포넌트 전용 파일에 둔다. 6구간 눈금이 200px에서 겹쳐 막대를 240px로 넓힌다. 목 백엔드는 app_settings를 key로 거르고 slope_bands 값·조회 실패를 주입할 수 있다."
git push
```

- [ ] **Step 16: CI 확인**

Run: `gh pr checks <n> --watch`
Expected: 전부 통과. e2e 실패면 `test-results` 아티팩트의 trace로 본다. 눈금 겹침 테스트가 실패하면 `slope-bands-legend.css`의 폭을 넓히고(스펙 §2.4·§4.2 숫자도 같이), 그래도 겹치면 스펙 §2.4대로 `MAX_SLOPE_BANDS`를 줄이는 결정을 사용자에게 묻는다.

---

### Task 6: 관리자 목록·보기 패널·작업 화면 지도 — 판정 3색을 구간 색으로

**Files:**

- Modify: `src/lib/slopeWorkspace.ts`, `src/lib/slopeWorkspace.test.ts`
- Modify: `src/components/admin/slopes/SlopeListRow.tsx`, `SlopeViewPanel.tsx`, `SlopeWorkspaceMap.tsx`
- Modify: `src/components/admin/workspace/WorkspaceListPanel.tsx`
- Modify: `src/app/admin/dashboard/slopes/page.tsx`
- Modify: `e2e/admin-slopes-workspace.spec.ts`
- Modify: `docs/specs/2026-10-14-admin-map-first-redesign-design.md`(머리 배너), `docs/specs/2026-10-19-slope-bands-design.md`(§11)

**Interfaces:**

- Consumes: Task 1의 `slopeBandFromDeg`·`slopeCasingStyle`·`SLOPE_CASING_CLASS`·`SlopeBand`, Task 2의 `useSlopeBands`, `usePrefersDarkMode`
- Produces:
  - `SlopeSegmentSummary`에서 `grade`, `SlopeRouteSummary`에서 `gradeCounts`가 빠진다
  - `SLOPE_COLLECTION_POLICY: AdminCollectionPolicy<SlopeListItem, never>` (`chips: {}`)
  - `slopeRouteBadge(summary): { label: "형식 오류"; tone: "missing" } | null`
  - `WorkspaceListPanel`의 `chips`·`activeChip`·`onChipChange`가 선택 props가 된다. `chips`가 비거나 없으면 칩 줄을 그리지 않는다
  - 지운다: `SlopeChip`, `SLOPE_CHIPS`, `SlopeBadgeTone`, `SLOPE_GRADE_TONES`

- [ ] **Step 1: e2e 단언 바꾸기** — `e2e/admin-slopes-workspace.spec.ts`

`addChipRoutes`를 `addMixedRoutes`로 이름을 바꾸고(정의와 모든 호출) 주석을 `/** 여러 구간 색이 섞인 경로와 저장 형식이 깨진 경로를 더한다 */`로 바꾼다.

"칩·검색·정렬로 목록을 좁히고 칩 개수는 전체 기준이다"를 바꾼다. 앞부분만 보이고, `await search.fill("");` 뒤 정렬 단언은 지금 그대로다:

```ts
  test("검색·정렬로 목록을 좁히고 칩 줄은 없으며 범례는 구간 이름이다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    addMixedRoutes(state);
    await page.goto("/admin/dashboard/slopes");
    const list = listPanel(page);
    const names = list.getByTestId("admin-list-item-name");

    await expect(
      list.getByText("구간별 경사를 기록한 보행 경로 · 총 4개"),
    ).toBeVisible();
    await expect(list.getByRole("status")).toHaveText("4개 표시");
    await expect(list.getByRole("group", { name: "목록 필터" })).toHaveCount(0);
    await expect(
      list.getByRole("list", { name: "범례" }).getByRole("listitem"),
    ).toHaveText(["보도 기준 이내", "완화 범위", "특례 범위", "초과"]);

    const search = list.getByRole("searchbox", { name: "경사도 경로 검색" });
    await expect(search).toHaveAttribute("placeholder", "경로명 검색");
    await search.fill("중앙광장");
    await expect(names).toHaveText(["정문-중앙광장"]);

    await search.fill("없는 경로입니다");
    await expect(list.getByText("조건에 맞는 항목이 없어요")).toBeVisible();

    await search.fill("");
    // …정렬 단언은 지금 그대로
```

"행에 판정 배지·메타·구간 거리 비례 프로파일 막대를 보인다"를 바꾼다:

```ts
test("행에 메타·구간 거리 비례 프로파일 막대를 보이고 배지는 형식 오류 행에만 둔다", async ({
  page,
}) => {
  const state = await installMockBackend(page, { authenticated: true });
  addMixedRoutes(state);
  await page.goto("/admin/dashboard/slopes");

  const flat = listRow(page, "정문-중앙광장");
  await expect(flat.locator(".ku-row-badge")).toHaveCount(0);
  await expect(flat.locator(".ku-slope-profile span")).toHaveCSS(
    "background-color",
    "rgb(139, 195, 74)",
  );

  const over = listRow(page, "안암병원 정문 경사로");
  await expect(over.locator(".ku-row-badge")).toHaveCount(0);
  await expect(over).toContainText("1개 구간 · 12.4m · 최대 7.2° · 수정 ");
  const overProfile = over.locator(".ku-slope-profile");
  await expect(overProfile).toHaveAttribute("aria-hidden", "true");
  await expect(overProfile.locator("span")).toHaveCount(1);
  // 7.2°(12.63%)는 기본 구간의 마지막 빨강이다
  await expect(overProfile.locator("span")).toHaveCSS(
    "background-color",
    "rgb(229, 57, 53)",
  );

  const steep = listRow(page, "급경사 계단길");
  await expect(steep).toContainText("2개 구간 · 40.1m · 최대 20.0° · 수정 ");
  const steepProfile = steep.locator(".ku-slope-profile span");
  await expect(steepProfile).toHaveCount(2);
  // 20°는 빨강, 6°(10.51%)는 주황이다
  await expect(steepProfile.nth(0)).toHaveCSS(
    "background-color",
    "rgb(229, 57, 53)",
  );
  await expect(steepProfile.nth(1)).toHaveCSS(
    "background-color",
    "rgb(255, 152, 0)",
  );

  const broken = listRow(page, "깨진 경로");
  await expect(broken.locator(".ku-row-badge")).toHaveText("형식 오류");
  await expect(broken).not.toContainText("구간 ·");
  await expect(broken).toContainText("수정 ");
  await expect(broken.locator(".ku-slope-profile span")).toHaveCount(0);
});
```

"선은 판정 색이고 고르면 나머지가 흐려지며 고른 경로에만 구간 번호가 붙는다"를 바꾼다:

```ts
test("선은 구간 색이고 외곽선 위에 그리며, 고르면 나머지가 흐려지고 고른 경로에만 구간 번호가 붙는다", async ({
  page,
}) => {
  await installMockBackend(page, { authenticated: true });
  await page.goto("/admin/dashboard/slopes");
  const first = routeLine(page, 1);
  const second = routeLine(page, 2);
  const casings = page.locator("path.ku-slope-casing");

  // 픽스처 경로 1(3°)·2(7.2°)의 기본 구간 색(설계 2026-10-19 2.2·2.3)
  await expect(first).toHaveAttribute("stroke", "#8BC34A");
  await expect(second).toHaveAttribute("stroke", "#E53935");
  await expect(first).toHaveAttribute("stroke-linecap", "round");
  await expect(first).toHaveAttribute("stroke-width", "5");
  await expect(first).toHaveAttribute("stroke-opacity", "1");
  await expect(page.locator(".ku-slope-segment-label")).toHaveCount(0);
  await expect(casings).toHaveCount(2);
  await expect(casings.first()).toHaveAttribute("stroke-width", "8");
  await expect(casings.first()).toHaveAttribute("stroke-opacity", "0.5");
  await expect(casings.and(page.locator(".leaflet-interactive"))).toHaveCount(
    0,
  );

  await listRow(page, "안암병원 정문 경사로").click();
  await expect(first).toHaveAttribute("stroke-opacity", "0.28");
  await expect(second).toHaveAttribute("stroke-opacity", "1");
  await expect(second).toHaveAttribute("stroke-width", "7");
  const labels = page.locator(".ku-slope-segment-label");
  await expect(labels).toHaveCount(1);
  await expect(labels).toHaveText("1");
  await expect(labels).toHaveCSS("display", "flex");

  // 흐린 경로의 외곽선은 같은 비율로 흐리고, 다시 붙은 고른 경로의 외곽선도 모든 선보다 아래에 있다
  await expect(
    page.locator("path.ku-slope-casing[stroke-width='10']"),
  ).toHaveAttribute("stroke-opacity", "0.5");
  await expect(
    page.locator("path.ku-slope-casing[stroke-width='8']"),
  ).toHaveAttribute("stroke-opacity", /^0\.14/);
  const order = await page
    .locator(".leaflet-overlay-pane path")
    .evaluateAll((paths) =>
      paths.map((path) =>
        path.classList.contains("ku-slope-casing")
          ? "casing"
          : path.classList.contains("ku-slope-route")
            ? "line"
            : "other",
      ),
    );
  expect(order.lastIndexOf("casing")).toBeLessThan(order.indexOf("line"));
});
```

"제목·메타·경로 편집과 구간 표를 보인다"의 표 단언을 바꾼다:

```ts
await expect(table.getByRole("columnheader")).toHaveText([
  "구간",
  "거리",
  "경사",
  "범례",
]);
const rows = table.locator("tbody").getByRole("row");
await expect(rows).toHaveCount(1);
await expect(rows.first().getByRole("cell")).toHaveText([
  "1",
  "12.4m",
  "7.2° · 12.6%",
  "초과",
]);
```

"값을 고친 채 칩을 바꾸면 묻는다"를 통째로 지운다. 같은 가드를 "값을 고친 채 검색하면 묻는다"가 본다(§9.2).

- [ ] **Step 2: 요약·칩·배지 정리** — `src/lib/slopeWorkspace.ts`

- import에서 `slopeGradeFromDeg`, `type SlopeGrade`를 지운다(`formatDeg`만 남는다).
- `SlopeSegmentSummary`의 `grade: SlopeGrade;`, `SlopeRouteSummary`의 `gradeCounts: Record<SlopeGrade, number>;`를 지운다.
- `summarizeSlopeRoute`에서 `gradeCounts` 선언·증가·반환을 지우고 `segments`의 `grade` 필드를 지운다:

```ts
const segments = slopes.map((slope, index): SlopeSegmentSummary => ({
  index,
  distance: measured[index].distance,
  slope,
  from: [vertices[index].lat, vertices[index].lng],
  to: [vertices[index + 1].lat, vertices[index + 1].lng],
}));
```

- `SlopeChip`, `SLOPE_CHIPS`를 지우고 정책을 바꾼다:

```ts
// 구간 색은 관리자가 고치는 값이라 칩 조건으로 두지 않는다(설계 2026-10-19 5장)
export const SLOPE_COLLECTION_POLICY: AdminCollectionPolicy<
  SlopeListItem,
  never
> = {
  // 목 백엔드는 id를 숫자로 돌려준다
  id: ({ route }) => String(route.id),
  name: ({ route }) => slopeDisplayName(route),
  updatedAt: ({ route }) => route.updated_at,
  searchText: ({ route }) => [route.name],
  chips: {},
};
```

- `SlopeBadgeTone`, `SLOPE_GRADE_TONES`를 지우고 배지를 바꾼다:

```ts
/** 판정 배지는 없다. 형식 오류는 판정이 아니라 읽기 실패 표시라 남긴다(설계 2026-10-19 5장) */
export function slopeRouteBadge(
  summary: SlopeRouteSummary | null,
): { label: "형식 오류"; tone: "missing" } | null {
  return summary ? null : { label: "형식 오류", tone: "missing" };
}
```

- [ ] **Step 3: 단위 테스트 정리** — `src/lib/slopeWorkspace.test.ts`

- import에서 `SLOPE_GRADE_TONES`를 지운다.
- "구간 하나짜리 경로를 요약한다"의 `expect(summary!.gradeCounts)…` 줄을 지운다.
- "세 구간의 합계·최대·판정 수·경계" → 이름을 "세 구간의 합계·최대·경계"로, `gradeCounts` 줄을 지운다.
- `describe("SLOPE_GRADE_TONES", …)` 전체를 지운다.
- `describe("slopeRouteBadge", …)`를 바꾼다:

```ts
describe("slopeRouteBadge", () => {
  it("형식 오류만 배지가 있다", () => {
    expect(slopeRouteBadge(null)).toEqual({
      label: "형식 오류",
      tone: "missing",
    });
    expect(slopeRouteBadge(summarizeSlopeRoute(THREE_SEGMENTS))).toBeNull();
    expect(slopeRouteBadge(summarizeSlopeRoute(MOCK_ROUTE_2))).toBeNull();
  });
});
```

- `describe("SLOPE_COLLECTION_POLICY", …)`의 "칩 개수는 전체 행 기준이고 형식 오류 행은 칩에 들지 않는다"만 지운다. `items`와 네 픽스처는 검색 테스트가 계속 쓴다.

- [ ] **Step 4: 목록 행** — `src/components/admin/slopes/SlopeListRow.tsx`

```tsx
import { slopeBandFromDeg } from "@/lib/slopeBands";
import { useSlopeBands } from "@/lib/slopeBandsStore";
import {
  formatSlopeRouteMeta,
  slopeDisplayName,
  slopeRouteBadge,
  type SlopeListItem,
} from "@/lib/slopeWorkspace";

// …props 그대로

export default function SlopeListRow({
  item,
  selected,
  onSelect,
}: SlopeListRowProps) {
  const { bands } = useSlopeBands();
  const { route, summary } = item;
  const badge = slopeRouteBadge(summary);
  return (
    <button
      type="button"
      className="ku-workspace-row ku-slope-row"
      aria-pressed={selected}
      onClick={onSelect}
    >
      <span className="ku-slope-row-head">
        <span
          className="ku-workspace-row-name"
          data-testid="admin-list-item-name"
        >
          {slopeDisplayName(route)}
        </span>
        {badge && (
          <span className="ku-row-badge" data-tone={badge.tone}>
            {badge.label}
          </span>
        )}
      </span>
      {/* 색 막대는 읽지 않는다. 구간별 경사는 보기 패널의 구간 표가 글자로 말한다 */}
      {summary && (
        <span className="ku-slope-profile" aria-hidden="true">
          {summary.segments.map((segment) => (
            <span
              key={segment.index}
              style={{
                flex: segment.distance,
                background: slopeBandFromDeg(bands, segment.slope).color,
              }}
            />
          ))}
        </span>
      )}
      <span className="ku-workspace-row-meta">
        {formatSlopeRouteMeta(summary, route.updated_at)}
      </span>
    </button>
  );
}
```

`SlopeListRow.tsx` 첫 줄이 `"use client"`가 아니다. 훅을 쓰므로 맨 위에 `"use client";`를 더한다(이 파일을 부르는 page가 클라이언트라 동작은 같지만 훅을 쓰는 파일은 스스로 밝힌다).

- [ ] **Step 5: 보기 패널 구간 표** — `src/components/admin/slopes/SlopeViewPanel.tsx`

import를 바꾼다:

```tsx
import { slopeBandFromDeg } from "@/lib/slopeBands";
import { useSlopeBands } from "@/lib/slopeBandsStore";
import { degToPercent, formatDeg, formatPercent } from "@/lib/slopeScale";
import {
  formatMeters,
  slopeDisplayName,
  type SlopeListItem,
  type SlopeRouteSummary,
} from "@/lib/slopeWorkspace";
```

`SegmentTable`:

```tsx
function SegmentTable({ summary }: { summary: SlopeRouteSummary }) {
  const { bands } = useSlopeBands();
  return (
    <table className="ku-slope-table">
      <thead>
        <tr>
          <th scope="col">구간</th>
          <th scope="col">거리</th>
          <th scope="col">경사</th>
          <th scope="col">범례</th>
        </tr>
      </thead>
      <tbody>
        {summary.segments.map((segment) => {
          const band = slopeBandFromDeg(bands, segment.slope);
          return (
            <tr key={segment.index}>
              <td>
                <span className="ku-slope-table-index">
                  <span aria-hidden="true" style={{ background: band.color }} />
                  {segment.index + 1}
                </span>
              </td>
              <td>{formatMeters(segment.distance)}</td>
              <td>
                {formatDeg(segment.slope)} ·{" "}
                {formatPercent(degToPercent(segment.slope))}
              </td>
              <td>{band.name}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 6: 작업 화면 지도** — `src/components/admin/slopes/SlopeWorkspaceMap.tsx`

import와 `RouteLines`를 바꾸고, 본문에서 `bands`·`darkMap`을 넘긴다:

```tsx
"use client";

import { Fragment } from "react";
import { Marker, Polyline } from "react-leaflet";
import L from "leaflet";
import AdminWorkspaceMap from "@/components/admin/workspace/AdminWorkspaceMap";
import type { WorkspaceMapSlotProps } from "@/components/admin/workspace/types";
import {
  SLOPE_CASING_CLASS,
  slopeBandFromDeg,
  slopeCasingStyle,
  type SlopeBand,
} from "@/lib/slopeBands";
import { useSlopeBands } from "@/lib/slopeBandsStore";
import {
  SLOPE_COLLECTION_POLICY,
  type SlopeListItem,
  type SlopeRouteSummary,
} from "@/lib/slopeWorkspace";
import { usePrefersDarkMode } from "@/lib/usePrefersDarkMode";

const DIMMED_OPACITY = 0.28;

// 고른 경로는 key를 바꿔 다시 붙고(아래), 검색으로 빠졌다 돌아온 경로도 다시 붙어 SVG 맨 뒤로 간다. 외곽선은 붙을 때마다
// 맨 앞(아래)으로 보내 다른 경로의 선을 덮지 않게 한다. 별도 pane은 쓰지 않는다 — 그 SVG는 globals.css의 will-change
// 규칙 밖이라 드래그 끝 밀림이 돌아오고, 위 pane의 SVG가 아래 pane의 클릭을 가린다(설계 2026-10-19 11장)
const SEND_TO_BACK = {
  add: (event: L.LeafletEvent) => {
    (event.target as L.Path).bringToBack();
  },
};

// …labelCache·segmentLabel 그대로

interface RouteLinesProps {
  id: string;
  summary: SlopeRouteSummary;
  bands: readonly SlopeBand[];
  darkMap: boolean;
  selected: boolean;
  dimmed: boolean;
  onSelect: (id: string) => void;
}

function RouteLines({
  id,
  summary,
  bands,
  darkMap,
  selected,
  dimmed,
  onSelect,
}: RouteLinesProps) {
  const weight = selected ? 7 : 5;
  const opacity = dimmed ? DIMMED_OPACITY : 1;
  const casing = slopeCasingStyle(weight, darkMap, opacity);
  return summary.segments.map((segment) => (
    <Fragment key={segment.index}>
      <Polyline
        positions={[segment.from, segment.to]}
        className={SLOPE_CASING_CLASS}
        interactive={false}
        pathOptions={{ ...casing, lineCap: "round" }}
        eventHandlers={SEND_TO_BACK}
      />
      <Polyline
        positions={[segment.from, segment.to]}
        // className은 Leaflet이 선을 만들 때만 읽는다. react-leaflet은 pathOptions를 선을 붙인 뒤 setStyle로 넘겨 거기 두면 빠진다
        className={`ku-slope-route ku-slope-route-${id}`}
        pathOptions={{
          color: slopeBandFromDeg(bands, segment.slope).color,
          weight,
          opacity,
          lineCap: "round",
        }}
        eventHandlers={{ click: () => onSelect(id) }}
      />
    </Fragment>
  ));
}
```

`SlopeWorkspaceMap` 본문 맨 위에:

```tsx
const { bands } = useSlopeBands();
const darkMap = usePrefersDarkMode();
```

두 `<RouteLines … />` 호출에 `bands={bands}`와 `darkMap={darkMap}`를 더한다. 나머지(고른 경로를 따로 된 key로 맨 뒤에 붙이는 것, 구간 번호 마커)는 그대로다.

- [ ] **Step 7: 칩 없는 목록 패널** — `src/components/admin/workspace/WorkspaceListPanel.tsx`

props 형에서 세 칩 props를 선택으로 바꾼다:

```ts
  /** 없거나 비면 칩 줄(`전체` 포함)을 그리지 않는다 */
  chips?: WorkspaceChip[];
  activeChip?: string;
  onChipChange?: (key: string) => void;
```

`chipRow`:

```tsx
const chipRow =
  chips && chips.length > 0 ? (
    <div className="ku-chip-row" role="group" aria-label="목록 필터">
      {chips.map((chip) => (
        <button
          key={chip.key}
          type="button"
          className="ku-chip"
          aria-pressed={chip.key === activeChip}
          aria-label={`${chip.label} ${chip.count}개`}
          onClick={() => onChipChange?.(chip.key)}
        >
          {chip.label}
          <span className="ku-chip-count" aria-hidden="true">
            {chip.count}
          </span>
        </button>
      ))}
    </div>
  ) : null;
```

범례 목록의 key를 `key={item.label}`에서 `key={index}`로 바꾼다(`legend.map((item, index) => …)`) — 구간 이름은 관리자 입력이라 겹칠 수 있다.

- [ ] **Step 8: 페이지** — `src/app/admin/dashboard/slopes/page.tsx`

- import에서 `SLOPE_GRADE_COLORS`(`@/lib/slopeScale`), `SLOPE_CHIPS`·`type SlopeChip`(`@/lib/slopeWorkspace`), `type AdminChip`(`@/lib/adminCollection`)을 지우고 `import { useSlopeBands } from "@/lib/slopeBandsStore";`를 더한다.
- `const LEGEND = [...]`를 지운다.
- 컴포넌트 본문 위쪽(`const mobile = …` 근처)에 `const slopeBands = useSlopeBands();`를 둔다.
- `const chips = [...]`를 지운다.
- `WorkspaceListPanel`에서 `chips={chips}`, `activeChip={collection.chip}`, `onChipChange={…}`를 지우고 `legend={LEGEND}`를 바꾼다:

```tsx
            legend={slopeBands.bands.map((band) => ({
              label: band.name,
              color: band.color,
            }))}
```

- 주석 두 곳을 지금 동작에 맞춘다: `// 저장 중에는 선택을 바꾸지 않는다 — 행·선·칩·닫기를 막는다(설계 2026-10-14 3.4)` → `— 행·선·닫기를 막는다`, `// 칩·검색·정렬은 설계 2026-10-14 3.3대로 선택을 푼다` → `// 검색·정렬은 설계 2026-10-14 3.3대로 선택을 푼다`.

- [ ] **Step 9: 대체 표시** — `docs/specs/2026-10-14-admin-map-first-redesign-design.md`

머리(첫 40줄)를 먼저 읽는다. "### 대체하는 기존 문서" 표 다음, 첫 `---` 앞에 배너를 둔다. 본문은 고치지 않는다.

```markdown
> **2026-10-19 — 일부 대체.** 아래 절은 [`2026-10-19-slope-bands-design.md`](./2026-10-19-slope-bands-design.md) 5장이 대체한다. 본문은 당시 기록으로 둔다.
>
> | 이 문서                                                    | 당시                                                                    | 현재                                                                                          |
> | ---------------------------------------------------------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
> | 6.2 목록 — 칩, 행 배지, `LEGEND`, 프로파일 막대·지도 선 색 | 칩 3개(전체·1/12 초과 포함·확인 필요), 판정 배지, 판정 3색 범례·막대·선 | 칩 줄 없음, 배지는 `형식 오류`만, 범례·막대·선은 관리자가 고치는 구간 색. 지도 선 밑에 외곽선 |
> | 6.3 보기 패널 구간 표 `판정` 열                            | 판정 배지                                                               | `범례` 열(구간 이름), 번호 견본은 구간 색                                                     |
```

- [ ] **Step 10: 스펙 반영** — `docs/specs/2026-10-19-slope-bands-design.md` §11

Task 5에서 더한 꼭지 아래에 이어 쓴다: `2026-10-19 — 작업 화면 지도는 고른 경로를 key를 바꿔 다시 붙여(검색으로 돌아온 경로도 같다) 외곽선이 선 위로 올라간다. 외곽선이 add 때 bringToBack()한다. 별도 pane은 쓰지 않는다 — 사용자 pane의 SVG는 globals.css의 will-change: auto 규칙(.leaflet-overlay-pane 대상) 밖이라 드래그 끝 밀림(d9e0a20)이 돌아오고, Leaflet CSS가 SVG 루트의 포인터 이벤트를 끄지 않아 위 pane이 아래 pane의 클릭을 가린다. 대가로 외곽선이 주변 건물 면보다 아래에 깔릴 수 있다 — 주변 건물이 먼저 붙었을 때다(주변 건물과 경로 선의 순서는 지금도 조회 순서에 달려 있다).`

- [ ] **Step 11: 이름 back-trace**

Run: `rg -n "SLOPE_CHIPS|SlopeChip|SLOPE_GRADE_TONES|SlopeBadgeTone|gradeCounts|addChipRoutes|LEGEND\b" src e2e docs`
Expected: `src`·`e2e` 0건. `docs`는 2026-10-14 설계 본문(당시 기록)과 2026-10-19 설계(대체 대상 서술)만.

- [ ] **Step 12: 포맷·커밋·push**

```bash
npx --yes prettier@3.9.4 --write src/lib/slopeWorkspace.ts src/lib/slopeWorkspace.test.ts src/components/admin/slopes/SlopeListRow.tsx src/components/admin/slopes/SlopeViewPanel.tsx src/components/admin/slopes/SlopeWorkspaceMap.tsx src/components/admin/workspace/WorkspaceListPanel.tsx src/app/admin/dashboard/slopes/page.tsx e2e/admin-slopes-workspace.spec.ts docs/specs/2026-10-14-admin-map-first-redesign-design.md docs/specs/2026-10-19-slope-bands-design.md
git add src/lib/slopeWorkspace.ts src/lib/slopeWorkspace.test.ts src/components/admin/slopes src/components/admin/workspace/WorkspaceListPanel.tsx src/app/admin/dashboard/slopes/page.tsx e2e/admin-slopes-workspace.spec.ts docs/specs
git commit -m "feat: 관리자 경사도 목록·보기 패널·작업 화면 지도를 구간 색으로 바꾼다" -m "판정 3단계와 그 칩·배지를 없애고, 범례·프로파일 막대·구간 표·지도 선을 공개 지도와 같은 구간 색으로 그린다. 형식 오류 배지는 판정이 아니라 읽기 실패 표시라 남긴다. 목록 패널은 칩이 없으면 칩 줄을 그리지 않는다." -m "고른 경로는 key를 바꿔 다시 붙어 외곽선이 다른 선 위로 올라가므로, 외곽선이 붙을 때마다 맨 아래로 보낸다. 선의 className은 Polyline의 최상위 prop으로 옮긴다 — pathOptions에 두면 운영 빌드에서 붙지 않는다."
git push
```

- [ ] **Step 13: CI 확인**

Run: `gh pr checks <n> --watch`
Expected: 전부 통과. `e2e/admin-dark.spec.ts`의 경사도 목록·보기 화면 스캔도 같이 본다.

---

### Task 7: 편집 지도·구간 카드 — 남은 판정 3색 지우기

**Files:**

- Modify: `src/components/slope/SlopeRouteMap.tsx`, `src/components/slope/SlopeSegmentList.tsx`
- Modify: `src/lib/slopeScale.ts`, `src/lib/slopeScale.test.ts` (판정 3색 삭제)
- Modify: `src/types/domain.ts` (주석)
- Modify: `e2e/admin-slopes-workspace.spec.ts`
- Modify: `docs/specs/2026-10-06-…`, `docs/specs/2026-10-14-…`(배너 행 더하기), `docs/specs/2026-10-19-slope-bands-design.md`(§4.1·§5)

**Interfaces:**

- Consumes: Task 1의 `slopeBandFromDeg`·`slopeCasingStyle`·`SLOPE_CASING_CLASS`·`readableTextOn`, Task 2의 `useSlopeBands`
- Produces: 지운다 — `SlopeGrade`, `SLOPE_GRADES`, `slopeGradeFromDeg`, `SLOPE_GRADE_COLORS`, `SLOPE_GRADE_ON_COLORS`, `SLOPE_GRADE_LABELS`

- [ ] **Step 1: e2e 단언 바꾸기** — `e2e/admin-slopes-workspace.spec.ts`

`previewLines`가 외곽선을 세지 않게 한다:

```ts
function previewLines(page: Page) {
  return page.locator(
    ".leaflet-pane.slope-preview-pane path:not(.ku-slope-casing)",
  );
}
```

"수정 화면을 열면 불러온 경사값으로 판정 색 미리보기 선이 그려진다"를 바꾼다:

```ts
test("수정 화면을 열면 불러온 경사값으로 구간 색 미리보기 선을 외곽선 위에 그린다", async ({
  page,
}) => {
  await installMockBackend(page, { authenticated: true });
  await page.goto("/admin/dashboard/slopes?id=2&edit=1");

  // 7.2°(12.63%)는 기본 구간의 마지막 빨강이다
  await expect(previewLines(page).first()).toHaveAttribute("stroke", "#E53935");
  const casing = page.locator(
    ".leaflet-pane.slope-preview-pane path.ku-slope-casing",
  );
  await expect(casing).toHaveCount(1);
  await expect(casing).toHaveAttribute("stroke-width", "12");
});
```

"입력한 경사도에 따라 미리보기 선이 판정 색으로 바뀐다"를 바꾼다:

```ts
test("입력한 경사도에 따라 미리보기 선이 구간 색으로 바뀐다", async ({
  page,
}) => {
  await installMockBackend(page, { authenticated: true });
  await page.goto("/admin/dashboard/slopes?new=1");
  const detail = newPanel(page);
  await drawRoute(page, TWO_POINTS);
  const preview = previewLines(page).first();
  const input = detail.getByLabel("구간 1 경사도");

  // 1°·4°(6.99%)·6°(10.51%)·10°가 기본 네 구간에 하나씩 든다
  for (const [value, color] of [
    ["1", "#8BC34A"],
    ["4", "#FFD600"],
    ["6", "#FF9800"],
    ["10", "#E53935"],
  ] as const) {
    await input.fill(value);
    await expect(preview).toHaveAttribute("stroke", color);
  }
});
```

"새 경로 편집기에 다른 경로를 판정 색으로 깔고 클릭을 가로채지 않는다"를 바꾼다:

```ts
test("새 경로 편집기에 다른 경로를 구간 색과 외곽선으로 깔고 클릭을 가로채지 않는다", async ({
  page,
}) => {
  await installMockBackend(page, { authenticated: true });
  await page.goto("/admin/dashboard/slopes?new=1");

  const pane = page.locator(".leaflet-slopeOthers-pane");
  const others = pane.locator("path:not(.ku-slope-casing)");
  await expect(others).toHaveCount(2);
  // 픽스처 경로 1(3°)·2(7.2°)의 기본 구간 색
  await expect(others.and(page.locator('[stroke="#8BC34A"]'))).toHaveCount(1);
  await expect(others.and(page.locator('[stroke="#E53935"]'))).toHaveCount(1);
  await expect(pane.locator("path.ku-slope-casing")).toHaveCount(2);
  await expect(pane.locator("path.leaflet-interactive")).toHaveCount(0);
});
```

"수정 화면은 편집 중인 경로를 빼고 깔며 다른 경로는 드래그 모드에 잡히지 않는다"의 앞부분을 바꾼다:

```ts
const others = page.locator(
  ".leaflet-slopeOthers-pane path:not(.ku-slope-casing)",
);
await expect(others).toHaveCount(1);
await expect(others).toHaveAttribute("stroke", "#8BC34A");
```

"경사도 작업 화면 — 편집 패널" describe에 더한다:

```ts
test("구간 카드 번호 원은 구간 색이고 글자색은 대비가 높은 쪽이다", async ({
  page,
}) => {
  const state = await installMockBackend(page, { authenticated: true });
  addMixedRoutes(state);
  await page.goto("/admin/dashboard/slopes?id=3&edit=1");
  const indexes = editPanel(page, "급경사 계단길").locator(
    ".ku-slope-card-index",
  );
  await expect(indexes).toHaveCount(2);
  // 20°는 빨강 위 흰 글자, 6°는 주황 위 어두운 글자
  await expect(indexes.nth(0)).toHaveCSS(
    "background-color",
    "rgb(229, 57, 53)",
  );
  await expect(indexes.nth(0)).toHaveCSS("color", "rgb(255, 255, 255)");
  await expect(indexes.nth(1)).toHaveCSS(
    "background-color",
    "rgb(255, 152, 0)",
  );
  await expect(indexes.nth(1)).toHaveCSS("color", "rgb(28, 25, 23)");
});
```

- [ ] **Step 2: 구간 카드 번호 원** — `src/components/slope/SlopeSegmentList.tsx`

import에서 `SLOPE_GRADE_COLORS`, `SLOPE_GRADE_ON_COLORS`, `slopeGradeFromDeg`를 지우고 더한다:

```tsx
import { readableTextOn, slopeBandFromDeg } from "@/lib/slopeBands";
import { useSlopeBands } from "@/lib/slopeBandsStore";
```

컴포넌트 첫 줄(빈 목록 조기 반환보다 위)에 `const { bands } = useSlopeBands();`를 둔다. `const grade = …`를 `const band = measured === null ? null : slopeBandFromDeg(bands, measured);`로 바꾸고 번호 원을 바꾼다:

```tsx
            {/* 번호는 옆 "구간 n"이 읽는다. 값이 없거나 범위 밖이면 구간 색 대신 테두리만 둔다 */}
            <span
              className="ku-slope-card-index"
              aria-hidden="true"
              data-empty={band === null || undefined}
              style={
                band
                  ? {
                      background: band.color,
                      color: readableTextOn(band.color),
                    }
                  : undefined
              }
            >
```

- [ ] **Step 3: 편집 지도** — `src/components/slope/SlopeRouteMap.tsx`

import에서 `SLOPE_GRADE_COLORS`, `slopeGradeFromDeg`를 지우고(`isSlopeDegInRange`는 남는다) 더한다:

```tsx
import {
  SLOPE_CASING_CLASS,
  slopeBandFromDeg,
  slopeCasingStyle,
} from "@/lib/slopeBands";
import { useSlopeBands } from "@/lib/slopeBandsStore";
```

모듈 상수(`EDIT_LINE_OPTIONS` 아래):

```tsx
const PREVIEW_WEIGHT = 9;
const OTHER_WEIGHT = 4;
const OTHER_OPACITY = 0.55;

interface OtherSegment {
  positions: [number, number][];
  /** 도 */
  slope: number;
}
```

컴포넌트 안 ref·상태(`previewRef` 근처):

```tsx
const othersRef = useRef<L.LayerGroup | null>(null);
// 행이 도착하면 그리기 effect가 돌아야 해서 ref가 아니라 상태다
const [otherSegments, setOtherSegments] = useState<OtherSegment[] | null>(null);
const { bands } = useSlopeBands();
```

마운트 effect 안의 다른 경로 블록(`const othersPane = map.createPane("slopeOthers");`부터 그 `.then(...)` 끝까지)을 바꾼다. 행 받기는 그 자리에 두고 선 그리기는 아래 별도 effect로 옮긴다 — 구간 설정을 이 effect의 의존성에 넣으면 정리 단계의 `map.remove()`가 편집 지도를 통째로 다시 만든다(§5):

```tsx
// 이미 그린 곳과 안 그린 곳을 보는 용도라 스냅·드래그 모드 대상(pmIgnore)에서 뺀다.
const othersPane = map.createPane("slopeOthers");
othersPane.style.zIndex = "320";
othersRef.current = L.layerGroup().addTo(map);
void supabase
  .from("slope_segments")
  .select("id, segments")
  .then(({ data, error }) => {
    if (disposed || error) return;
    const segments: OtherSegment[] = [];
    for (const route of data ?? []) {
      if (String(route.id) === skipRouteId) continue;
      const points = readRoutePoints(route.segments);
      if (!points) continue;
      const [, ...measured] = points;
      measured.forEach((point, i) =>
        segments.push({
          positions: [
            [points[i].lat, points[i].lng],
            [point.lat, point.lng],
          ],
          slope: point.slope,
        }),
      );
    }
    setOtherSegments(segments);
  });
```

정리 함수의 `previewRef.current = null;` 옆에 `othersRef.current = null;`을 더한다.

타일 effect(`tileLayerRef.current?.setUrl(...)`) 아래에 다른 경로 그리기 effect를 더한다:

```tsx
useEffect(() => {
  const group = othersRef.current;
  if (!group || !otherSegments) return;
  group.clearLayers();
  // 다른 경로는 늘 흐린 선이라 외곽선도 그 비율로 흐린다
  const casing = slopeCasingStyle(OTHER_WEIGHT, prefersDarkMode, OTHER_OPACITY);
  const common = {
    interactive: false,
    pmIgnore: true,
    pane: "slopeOthers",
  };
  // 외곽선을 전부 먼저 넣는다 — 번갈아 넣으면 다음 외곽선이 앞 선의 끝을 덮는다
  for (const segment of otherSegments)
    L.polyline(segment.positions, {
      ...casing,
      ...common,
      className: SLOPE_CASING_CLASS,
    }).addTo(group);
  for (const segment of otherSegments)
    L.polyline(segment.positions, {
      ...common,
      color: slopeBandFromDeg(bands, segment.slope).color,
      weight: OTHER_WEIGHT,
      opacity: OTHER_OPACITY,
    }).addTo(group);
}, [otherSegments, bands, prefersDarkMode]);
```

미리보기 effect를 바꾼다(번호표 부분은 그대로):

```tsx
useEffect(() => {
  const group = previewRef.current;
  const labels = labelsRef.current;
  if (!group || !labels) return;
  group.clearLayers();
  labels.clearLayers();
  const vertices = verticesRef.current;
  const lines: { positions: [number, number][]; color: string }[] = [];
  for (let i = 0; i < vertices.length - 1; i++) {
    const from = vertices[i];
    const to = vertices[i + 1];
    L.marker([(from.lat + to.lat) / 2, (from.lng + to.lng) / 2], {
      icon: L.divIcon({
        className: "ku-slope-segment-label",
        html: String(i + 1),
        iconSize: [22, 22],
        iconAnchor: [11, 11],
      }),
      interactive: false,
      keyboard: false,
      pmIgnore: true,
    }).addTo(labels);

    // 초안이 아직 없으면(패널이 곧 내놓는다) 미리보기 없이 둔다
    const slope = slopes?.[i];
    if (
      slope === null ||
      slope === undefined ||
      !Number.isFinite(slope) ||
      !isSlopeDegInRange(slope)
    )
      continue;
    lines.push({
      positions: [
        [from.lat, from.lng],
        [to.lat, to.lng],
      ],
      color: slopeBandFromDeg(bands, slope).color,
    });
  }
  const common = {
    // geoman이 편집 대상으로 잡지 않게 한다. 없으면 색칠용 선에
    // 꼭짓점 핸들이 붙는다.
    pmIgnore: true,
    // 편집선으로 가야 할 클릭을 가로채지 않게 한다.
    interactive: false,
    pane: "slopePreview",
  };
  const casing = slopeCasingStyle(PREVIEW_WEIGHT, prefersDarkMode);
  // 외곽선을 전부 먼저 넣는다 — 번갈아 넣으면 다음 외곽선이 앞 선의 끝을 덮는다
  for (const line of lines)
    L.polyline(line.positions, {
      ...casing,
      ...common,
      className: SLOPE_CASING_CLASS,
    }).addTo(group);
  for (const line of lines)
    L.polyline(line.positions, {
      ...common,
      color: line.color,
      weight: PREVIEW_WEIGHT,
      opacity: 0.85,
    }).addTo(group);
}, [slopes, vertexVersion, bands, prefersDarkMode]);
```

(지금 effect 위에 있는 "미리보기는 초안의 slopes와 지도의 좌표로 그린다…" 주석은 `vertexVersion` 상태 선언 위에 있으니 그대로 둔다.)

- [ ] **Step 4: 판정 3색 지우기** — `src/lib/slopeScale.ts`, `src/lib/slopeScale.test.ts`, `src/types/domain.ts`

`slopeScale.ts`에서 `SlopeGrade`, `SLOPE_GRADES`, `slopeGradeFromDeg`, `SLOPE_GRADE_COLORS`(위 주석 포함), `SLOPE_GRADE_ON_COLORS`(위 주석 "데이터 색이라 라이트·다크가 같다." 포함), `SLOPE_GRADE_LABELS`를 지운다. 파일 머리 주석을 바꾼다:

```ts
/**
 * 경사 단위와 입력 경고. 저장값(`SlopeRoutePoint.slope`)은 도(°)다. 법 기준이 비율이라
 * 경고는 %로 계산한다 — docs/specs/2026-10-06-slope-units-and-editor-design.md 2~4장.
 * 색 구간은 slopeBands.ts다.
 */
```

`slopeScale.test.ts`에서 import의 `SLOPE_GRADE_COLORS`·`SLOPE_GRADE_LABELS`·`SLOPE_GRADE_ON_COLORS`·`SLOPE_GRADES`·`slopeGradeFromDeg`와 `describe("slopeGradeFromDeg", …)` 전체를 지운다. `describe("slopeWarningFromDeg", …)`는 그대로다.

`src/types/domain.ts`의 `/** 구간 경사. 단위는 도(°), 0~45. 판정은 src/lib/slopeScale.ts */`를 `/** 구간 경사. 단위는 도(°), 0~45. 색 구간은 src/lib/slopeBands.ts, 입력 경고는 src/lib/slopeScale.ts */`로 바꾼다.

- [ ] **Step 5: 이름 back-trace**

Run: `rg -n "SLOPE_GRADE|slopeGradeFromDeg|SlopeGrade\b|SLOPE_GRADES|판정 색|판정 3색" src e2e docs`
Expected: `src`·`e2e` 0건(테스트 이름 문자열 포함). `docs`는 2026-10-06·2026-10-14 설계 본문(당시 기록)과 2026-10-19 설계(대체 대상 서술)만.

- [ ] **Step 6: 대체 표시 행 더하기**

`docs/specs/2026-10-14-admin-map-first-redesign-design.md` — Task 6에서 단 `2026-10-19` 배너 표에 행을 더한다:

```markdown
> | 2.1 경사 판정 색 | 판정 3색(`#1B9E77`·`#E6AB02`·`#A50F15`) | 판정 3단계를 없애고 관리자가 고치는 구간 색. 기본 색과 그 한계는 새 문서 2.3 |
> | 6.1 판정, 구간 카드 번호 원 글자색 표 | `slopeGradeFromDeg`, 판정별 글자색 | 구간은 `slopeBandIndexFromDeg`, 글자색은 `readableTextOn`(대비가 높은 쪽) — 새 문서 2.5·5장 |
> | 6.4 편집 지도 미리보기·다른 경로 색 | 판정 3색 | 구간 색 + 외곽선. 굵기·불투명도·pane은 그대로. 구간 설정이 바뀌면 다시 그린다 — 새 문서 5장 |
```

`docs/specs/2026-10-06-slope-units-and-editor-design.md` — Task 5에서 단 `2026-10-19` 배너 표에 행을 더한다:

```markdown
> | 12장 다른 경로 색 | 판정 3색(2026-10-15 대체) | 구간 색 + 외곽선. 굵기·불투명도·pane은 그대로 — 새 문서 5장 |
```

- [ ] **Step 7: 스펙 반영** — `docs/specs/2026-10-19-slope-bands-design.md`

- §5 "다른 경로는 … 받은 행을 ref에 남긴다." → `받은 구간을 상태에 남긴다 — 행이 도착하면 그리기 effect가 돌아야 한다.`
- §4.1 "불투명도는 그 선이 흐려질 때 같은 비율로 같이 흐려진다." 뒤에 `편집 지도의 다른 경로는 늘 흐린 선(0.55)이라 그 비율을 곱한다.`

- [ ] **Step 8: 포맷·커밋·push**

```bash
npx --yes prettier@3.9.4 --write src/components/slope/SlopeRouteMap.tsx src/components/slope/SlopeSegmentList.tsx src/lib/slopeScale.ts src/lib/slopeScale.test.ts src/types/domain.ts e2e/admin-slopes-workspace.spec.ts docs/specs/2026-10-06-slope-units-and-editor-design.md docs/specs/2026-10-14-admin-map-first-redesign-design.md docs/specs/2026-10-19-slope-bands-design.md
git add src/components/slope src/lib/slopeScale.ts src/lib/slopeScale.test.ts src/types/domain.ts e2e/admin-slopes-workspace.spec.ts docs/specs
git commit -m "feat: 경사 편집 지도와 구간 카드도 구간 색으로 그리고 판정 3색을 지운다" -m "미리보기와 다른 경로를 구간 색으로 그리고 외곽선을 먼저 넣는다. 다른 경로 선 그리기를 지도 생성 effect에서 떼어 구간 설정·다크 모드가 바뀌면 다시 그린다 — 생성 effect에 의존성을 더하면 map.remove()가 편집 지도를 통째로 다시 만든다. 구간 카드 번호 원의 글자색은 관리자가 고른 색에 대비가 높은 쪽으로 고른다." -m "마지막 소비자가 사라져 slopeScale의 판정 3색과 그 이름·글자색 표를 지운다."
git push
```

- [ ] **Step 9: CI 확인**

Run: `gh pr checks <n> --watch`
Expected: 전부 통과.

---

### Task 8: 범례 편집 — 버튼·모달·저장

**Files:**

- Create: `src/components/admin/slopes/SlopeBandsModal.tsx`
- Modify: `src/components/slope/useSlopeRouteDraft.ts`, `src/components/admin/slopes/SlopeEditPanel.tsx`
- Modify: `src/components/admin/workspace/WorkspaceListPanel.tsx`
- Modify: `src/app/admin/dashboard/slopes/page.tsx`
- Modify: `src/app/admin/admin-ui.css`
- Modify: `e2e/support/mockBackend.ts`, `e2e/admin-slopes-workspace.spec.ts`, `e2e/admin-dark.spec.ts`
- Modify: `docs/specs/2026-10-19-slope-bands-design.md`(§6.1·§8)

**Interfaces:**

- Consumes: Task 1(`DEFAULT_SLOPE_BANDS`·`MAX_SLOPE_BANDS`·`MIN_SLOPE_BANDS`·`isHexColor`·`SlopeBand`), Task 2(`useSlopeBands`·`setSlopeBands`), Task 3(API), Task 4(초안 함수 전부), Task 5(`SlopeBandsLegend`), `useModalFocus`, `authedFetch`, `readErrorMessage`
- Produces:
  - `useSlopeRouteDraft.ts`: `SLOPE_UNIT_OPTIONS: { unit: SlopeUnit; symbol: string; label: string }[]`, `readSlopeUnitPreference(): SlopeUnit`, `writeSlopeUnitPreference(unit: SlopeUnit): void`
  - `SlopeBandsModal` props `{ initialBands: readonly SlopeBand[]; onClose: () => void; onSaved: () => void }` — 다이얼로그 이름 `범례 편집`
  - `WorkspaceListPanel`의 `legendAction?: ReactNode`
  - `MockState.slopeBandsPosts: unknown[]`

- [ ] **Step 1: 목 백엔드 POST** — `e2e/support/mockBackend.ts`

`MockState`에 `/** POST /api/settings/slope-bands가 받은 본문 */ slopeBandsPosts: unknown[];`, `createState`에 `slopeBandsPosts: [],`를 더한다. `handleApi`의 `/api/settings/feedback-emails` 분기 앞에 넣는다:

```ts
if (path === "/api/settings/slope-bands") {
  const body = route.request().postDataJSON() as unknown;
  state.slopeBandsPosts.push(body);
  state.slopeBands = body;
  return json(route, { ok: true, value: body });
}
```

- [ ] **Step 2: e2e** — `e2e/admin-slopes-workspace.spec.ts`

파일 끝(모바일 describe 위든 아래든 상관없다)에 describe를 더한다:

```ts
test.describe("경사도 작업 화면 — 범례 편집", () => {
  function bandsDialog(page: Page) {
    return page.getByRole("dialog", { name: "범례 편집" });
  }

  async function openBands(page: Page) {
    await listPanel(page).getByRole("button", { name: "범례 편집" }).click();
    await expect(bandsDialog(page)).toBeVisible();
    return bandsDialog(page);
  }

  function saveButton(dialog: Locator) {
    return dialog.getByRole("button", { name: "저장", exact: true });
  }

  function sentUppers(state: MockState, index = 0) {
    return (
      state.slopeBandsPosts[index] as {
        bands: { upperPercent: number | null }[];
      }
    ).bands.map((band) => band.upperPercent);
  }

  test("상한 하나를 바꿔 저장하면 본문이 가고 작업 화면 선 색이 다시 조회하지 않고 바뀐다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    let listReads = 0;
    await page.route(slopesRequest, async (route) => {
      if (slopeListGet(route)) listReads += 1;
      await route.fallback();
    });
    await page.goto("/admin/dashboard/slopes");
    await expect(routeLine(page, 1)).toHaveAttribute("stroke", "#8BC34A");
    const readsBefore = listReads;

    const dialog = await openBands(page);
    await dialog.getByRole("button", { name: "퍼센트(%)" }).click();
    // 경로 1은 3°(5.24%)다. 첫 상한을 5%로 내리면 둘째 구간(노랑)이 된다
    await dialog.getByLabel("구간 1 상한").fill("5");
    await saveButton(dialog).click();

    await expect(dialog).toHaveCount(0);
    await expect(
      page.locator(".ku-toast").filter({ hasText: "범례를 저장했어요" }),
    ).toBeVisible();
    expect(state.slopeBandsPosts).toHaveLength(1);
    // 손대지 않은 상한은 비율 상수 그대로다. 100/12로 적지 않는다 — (1/12)*100과 다른 값이다
    expect(sentUppers(state)).toEqual([5, (1 / 12) * 100, (1 / 8) * 100, null]);
    await expect(routeLine(page, 1)).toHaveAttribute("stroke", "#FFD600");
    expect(listReads).toBe(readsBefore);
  });

  test("아무것도 고치지 않고 저장하면 상한이 기본값 상수 그대로 간다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/slopes");
    const dialog = await openBands(page);
    await saveButton(dialog).click();
    await expect(dialog).toHaveCount(0);
    expect(sentUppers(state)).toEqual([
      (1 / 18) * 100,
      (1 / 12) * 100,
      (1 / 8) * 100,
      null,
    ]);
  });

  test("단위를 오가도 손대지 않은 상한이 그대로 가고, ° 단위에서 190을 치면 문구가 뜨고 저장이 비활성이다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/slopes");
    const dialog = await openBands(page);
    await dialog.getByRole("button", { name: "퍼센트(%)" }).click();
    await expect(dialog.getByLabel("구간 2 상한")).toHaveValue("8.33");
    await dialog.getByRole("button", { name: "도(°)" }).click();
    await expect(dialog.getByLabel("구간 2 상한")).toHaveValue("4.76");
    await saveButton(dialog).click();
    await expect(dialog).toHaveCount(0);
    expect(sentUppers(state)).toEqual([
      (1 / 18) * 100,
      (1 / 12) * 100,
      (1 / 8) * 100,
      null,
    ]);

    const again = await openBands(page);
    await again.getByLabel("구간 3 상한").fill("190");
    await expect(
      again.getByText("0°보다 크고 45° 이하로 적어 주세요"),
    ).toBeVisible();
    await expect(saveButton(again)).toBeDisabled();
  });

  test("미리보기 툴팁의 Esc는 툴팁만 닫고, 한 번 더 누르면 모달이 닫힌다", async ({
    page,
  }) => {
    await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/slopes");
    const dialog = await openBands(page);
    await dialog.getByLabel("구간 1 이름").fill("평지");
    const cell = dialog
      .getByRole("group", { name: "경사도 범례" })
      .getByRole("button", { name: /^평지,/ });
    await cell.focus();
    await expect(page.getByRole("tooltip")).toContainText("평지");

    await page.keyboard.press("Escape");
    await expect(page.getByRole("tooltip")).toHaveCount(0);
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel("구간 1 이름")).toHaveValue("평지");

    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
  });

  test("범례 설정을 읽지 못하면 범례 편집이 비활성이고 사유를 알린다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    state.slopeBandsReadFails = true;
    await page.goto("/admin/dashboard/slopes");
    const button = listPanel(page).getByRole("button", { name: "범례 편집" });
    const reason =
      "범례 설정을 읽지 못해 편집할 수 없어요. 새로 고친 뒤 다시 시도해 주세요";
    await expect(button).toBeDisabled();
    await expect(button).toHaveAttribute("title", reason);
    await expect(button).toHaveAccessibleDescription(reason);
  });

  test("상한을 역순으로 넣으면 검증 문구가 뜨고 저장과 미리보기가 멈춘다", async ({
    page,
  }) => {
    await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/slopes");
    const dialog = await openBands(page);
    await dialog.getByRole("button", { name: "퍼센트(%)" }).click();
    await dialog.getByLabel("구간 2 상한").fill("3");
    await expect(
      dialog.getByText("구간 2의 상한은 앞 구간보다 0.01%p 이상 커야 해요"),
    ).toBeVisible();
    await expect(saveButton(dialog)).toBeDisabled();
    await expect(
      dialog.getByText("입력을 고치면 미리보기가 다시 보여요"),
    ).toBeVisible();
  });

  test("2개일 때 삭제, 6개일 때 구간 추가가 비활성이고, 기본값으로는 기본값을 보낸다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/slopes");
    const dialog = await openBands(page);
    const rows = dialog.locator(".ku-bands-modal-row");

    await dialog.getByRole("button", { name: "구간 1 삭제" }).click();
    await dialog.getByRole("button", { name: "구간 1 삭제" }).click();
    await expect(rows).toHaveCount(2);
    await expect(
      dialog.getByRole("button", { name: "구간 1 삭제" }),
    ).toBeDisabled();
    await expect(
      dialog.getByRole("button", { name: "구간 2 삭제" }),
    ).toBeDisabled();

    const add = dialog.getByRole("button", { name: "구간 추가" });
    for (let i = 0; i < 4; i++) await add.click();
    await expect(rows).toHaveCount(6);
    await expect(add).toBeDisabled();
    // 새 행은 마지막 바로 앞에 들어가고 색은 앞 구간(특례 범위)의 색이다
    await expect(dialog.getByLabel("구간 2 색", { exact: true })).toHaveValue(
      "#FF9800",
    );

    await dialog.getByRole("button", { name: "기본값으로" }).click();
    await expect(rows).toHaveCount(4);
    await saveButton(dialog).click();
    await expect(dialog).toHaveCount(0);
    expect(state.slopeBandsPosts[0]).toEqual({
      bands: [
        {
          name: "보도 기준 이내",
          upperPercent: (1 / 18) * 100,
          color: "#8BC34A",
          description: "보도 기준 1/18 이하",
        },
        {
          name: "완화 범위",
          upperPercent: (1 / 12) * 100,
          color: "#FFD600",
          description: "완화 한도 1/12 이하",
        },
        {
          name: "특례 범위",
          upperPercent: (1 / 8) * 100,
          color: "#FF9800",
          description: "경사로 특례 한도 1/8 이하",
        },
        { name: "초과", upperPercent: null, color: "#E53935", description: "" },
      ],
    });
  });
});
```

"경사도 작업 화면 — 모바일" describe에 더한다:

```ts
test("바텀시트 맨 아래 범례 편집으로 같은 모달이 열린다", async ({ page }) => {
  await installMockBackend(page, { authenticated: true });
  await page.goto("/admin/dashboard/slopes");
  await expect(page.getByRole("group", { name: "목록 필터" })).toHaveCount(0);
  await listPanel(page).getByRole("button", { name: "범례 편집" }).click();
  const dialog = page.getByRole("dialog", { name: "범례 편집" });
  await expect(dialog).toBeVisible();
  const box = (await dialog.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width);
});
```

`Locator`·`MockState`는 파일 첫 import에 이미 있다.

- [ ] **Step 3: 다크 모드 스캔** — `e2e/admin-dark.spec.ts`

"시설 폼 모달에 하드코딩 밝은 색이 남지 않는다" 뒤에 더한다:

```ts
test("범례 편집 모달에 하드코딩 밝은 색이 남지 않는다", async ({ page }) => {
  await installMockBackend(page, { authenticated: true });
  await page.goto("/admin/dashboard/slopes");
  await page
    .getByRole("region", { name: "경사도 경로", exact: true })
    .getByRole("button", { name: "범례 편집" })
    .click();
  await expect(page.getByRole("dialog", { name: "범례 편집" })).toBeVisible();

  const result = await scanContrast(page);
  expect(
    result.nearWhiteBg,
    `미이관 흰 배경: ${result.nearWhiteBg.join(", ")}`,
  ).toHaveLength(0);
  expect(
    result.nearBlackText,
    `미이관 근검정 텍스트: ${result.nearBlackText.join(", ")}`,
  ).toHaveLength(0);
});
```

- [ ] **Step 4: 단위 선택지·기억값 내보내기** — `src/components/slope/useSlopeRouteDraft.ts`, `SlopeEditPanel.tsx`

`useSlopeRouteDraft.ts`에서 `readUnitPreference`·`writeUnitPreference`를 `readSlopeUnitPreference`·`writeSlopeUnitPreference`로 이름을 바꿔 내보내고(훅 안 호출 두 곳도 바꾼다), 위 주석을 고친다. 단위 선택지를 여기로 옮긴다:

```ts
export const SLOPE_UNIT_OPTIONS: {
  unit: SlopeUnit;
  symbol: string;
  label: string;
}[] = [
  { unit: "deg", symbol: "°", label: "도(°)" },
  { unit: "percent", symbol: "%", label: "퍼센트(%)" },
];

// 작업 화면의 선택은 서버 스냅숏(useWorkspaceSelection의 빈 주소)에서 닫힘이라 편집 패널은 hydration 뒤에야 처음
// 그려진다. 범례 편집 모달도 버튼을 누른 뒤에야 그려진다. 그래서 첫 렌더에서 localStorage를 읽어도 hydration이 어긋나지 않는다.
export function readSlopeUnitPreference(): SlopeUnit {
```

`SlopeEditPanel.tsx`에서 로컬 `const UNIT_OPTIONS …`를 지우고 `SLOPE_UNIT_OPTIONS`를 `@/components/slope/useSlopeRouteDraft`에서 가져와 `UNIT_OPTIONS.map` 자리에 쓴다(이 파일이 이미 그 모듈에서 `useSlopeRouteDraft`를 가져오면 같은 import에 더한다).

Run: `rg -n "readUnitPreference|writeUnitPreference|UNIT_OPTIONS" src`
Expected: `SLOPE_UNIT_OPTIONS`와 새 이름만.

- [ ] **Step 5: 모달** — `src/components/admin/slopes/SlopeBandsModal.tsx`

```tsx
"use client";

import { useId, useState } from "react";
import SlopeBandsLegend from "@/components/map/SlopeBandsLegend";
import {
  SLOPE_UNIT_OPTIONS,
  readSlopeUnitPreference,
  writeSlopeUnitPreference,
} from "@/components/slope/useSlopeRouteDraft";
import { authedFetch } from "@/lib/authedFetch";
import { readErrorMessage } from "@/lib/responseError";
import {
  DEFAULT_SLOPE_BANDS,
  MAX_SLOPE_BANDS,
  MIN_SLOPE_BANDS,
  isHexColor,
  type SlopeBand,
} from "@/lib/slopeBands";
import {
  addBand,
  convertedUpper,
  draftFromBands,
  draftHasInputError,
  editUpper,
  redraftBandsForUnit,
  removeBand,
  validateBandsDraft,
  type SlopeBandDraftRow,
} from "@/lib/slopeBandsDraft";
import { setSlopeBands } from "@/lib/slopeBandsStore";
import type { SlopeUnit } from "@/lib/slopeScale";
import { useModalFocus } from "@/lib/useModalFocus";

const UNIT_SYMBOL: Record<SlopeUnit, string> = { deg: "°", percent: "%" };
const SAVE_FAILED = "범례를 저장하지 못했어요";

interface SlopeBandsModalProps {
  /** 저장소가 ready일 때의 값. 다른 상태에서는 페이지가 모달을 열지 않는다(설계 3장) */
  initialBands: readonly SlopeBand[];
  onClose: () => void;
  onSaved: () => void;
}

/** 자주 쓰지 않을 기능이라 동시 편집 검사·이력·닫을 때 확인을 두지 않는다(설계 6장) */
export default function SlopeBandsModal({
  initialBands,
  onClose,
  onSaved,
}: SlopeBandsModalProps) {
  const [unit, setUnit] = useState<SlopeUnit>(readSlopeUnitPreference);
  const [rows, setRows] = useState<SlopeBandDraftRow[]>(() =>
    draftFromBands(initialBands, unit),
  );
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [tooltipOpen, setTooltipOpen] = useState(false);
  const titleId = useId();
  const dialogRef = useModalFocus<HTMLDivElement>({
    onClose,
    // 이 훅은 document 캡처 단계에서 Esc를 먼저 받아 모달을 닫는다. 툴팁이 열린 동안의 Esc는 툴팁만 닫게 끈다
    closeOnEscape: !saving && !tooltipOpen,
  });
  const validation = validateBandsDraft(rows);
  const inputError = draftHasInputError(rows);
  const canSave = validation.ok && !inputError && !saving;

  function updateRow(
    index: number,
    change: (row: SlopeBandDraftRow) => SlopeBandDraftRow,
  ) {
    setRows((current) =>
      current.map((row, i) => (i === index ? change(row) : row)),
    );
  }

  function handleUnitChange(next: SlopeUnit) {
    setUnit(next);
    writeSlopeUnitPreference(next);
    setRows((current) => redraftBandsForUnit(current, next));
  }

  async function handleSave() {
    if (!validation.ok || inputError) return;
    const value = validation.value;
    setSaving(true);
    setSaveError(null);
    try {
      const response = await authedFetch("/api/settings/slope-bands", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(value),
      });
      if (!response.ok) {
        setSaveError(await readErrorMessage(response, SAVE_FAILED));
        return;
      }
      setSlopeBands(value.bands);
      onSaved();
    } catch {
      setSaveError(SAVE_FAILED);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="ku-bands-modal-backdrop"
      role="presentation"
      // click으로 받으면 안에서 끌다 밖에서 놓아도 초안째 닫힌다
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className="ku-bands-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <h2 id={titleId}>범례 편집</h2>

        <div className="ku-bands-modal-preview">
          {validation.ok ? (
            <SlopeBandsLegend
              bands={validation.value.bands}
              tooltipPlacement="below"
              onTooltipOpenChange={setTooltipOpen}
            />
          ) : (
            <p>입력을 고치면 미리보기가 다시 보여요</p>
          )}
        </div>

        <div className="ku-bands-modal-unit">
          <span>상한 단위</span>
          <div
            className="ku-detail-segment"
            role="group"
            aria-label="상한 단위"
          >
            {SLOPE_UNIT_OPTIONS.map((option) => (
              <button
                key={option.unit}
                type="button"
                aria-label={option.label}
                aria-pressed={unit === option.unit}
                disabled={saving}
                onClick={() => handleUnitChange(option.unit)}
              >
                {option.symbol}
              </button>
            ))}
          </div>
        </div>

        <ol className="ku-bands-modal-rows">
          {rows.map((row, index) => {
            const number = index + 1;
            const last = index === rows.length - 1;
            const converted = convertedUpper(row, unit);
            const errorId = `${titleId}-upper-${row.key}`;
            return (
              <li key={row.key} className="ku-bands-modal-row">
                <span className="ku-bands-modal-color">
                  <input
                    type="color"
                    aria-label={`구간 ${number} 색 고르기`}
                    value={
                      isHexColor(row.color)
                        ? row.color.toLowerCase()
                        : "#000000"
                    }
                    disabled={saving}
                    onChange={(event) =>
                      updateRow(index, (current) => ({
                        ...current,
                        color: event.target.value.toUpperCase(),
                      }))
                    }
                  />
                  <input
                    type="text"
                    aria-label={`구간 ${number} 색`}
                    value={row.color}
                    spellCheck={false}
                    disabled={saving}
                    onChange={(event) =>
                      updateRow(index, (current) => ({
                        ...current,
                        color: event.target.value,
                      }))
                    }
                  />
                </span>
                <input
                  className="ku-bands-modal-name"
                  type="text"
                  aria-label={`구간 ${number} 이름`}
                  value={row.name}
                  disabled={saving}
                  onChange={(event) =>
                    updateRow(index, (current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                />
                <span className="ku-bands-modal-upper">
                  {last ? (
                    <span>그 위 전부</span>
                  ) : (
                    <>
                      <input
                        type="number"
                        step="any"
                        inputMode="decimal"
                        aria-label={`구간 ${number} 상한`}
                        aria-invalid={row.upperError ? true : undefined}
                        aria-describedby={row.upperError ? errorId : undefined}
                        value={row.upperInput}
                        disabled={saving}
                        onChange={(event) =>
                          updateRow(index, (current) =>
                            editUpper(current, event.target.value, unit),
                          )
                        }
                      />
                      <span>{UNIT_SYMBOL[unit]}</span>
                      {converted && (
                        <span className="ku-bands-modal-converted">
                          = {converted}
                        </span>
                      )}
                    </>
                  )}
                </span>
                <input
                  className="ku-bands-modal-description"
                  type="text"
                  aria-label={`구간 ${number} 설명`}
                  value={row.description}
                  disabled={saving}
                  onChange={(event) =>
                    updateRow(index, (current) => ({
                      ...current,
                      description: event.target.value,
                    }))
                  }
                />
                <button
                  type="button"
                  className="ku-bands-modal-remove"
                  aria-label={`구간 ${number} 삭제`}
                  disabled={saving || rows.length <= MIN_SLOPE_BANDS}
                  onClick={() =>
                    setRows((current) => removeBand(current, index))
                  }
                >
                  ✕
                </button>
                {row.upperError && (
                  <p id={errorId} className="ku-bands-modal-field-error">
                    {row.upperError}
                  </p>
                )}
              </li>
            );
          })}
        </ol>

        <div className="ku-bands-modal-tools">
          <button
            type="button"
            className="ku-workspace-button"
            disabled={saving || rows.length >= MAX_SLOPE_BANDS}
            onClick={() => setRows(addBand)}
          >
            구간 추가
          </button>
          <button
            type="button"
            className="ku-workspace-button"
            disabled={saving}
            onClick={() => setRows(draftFromBands(DEFAULT_SLOPE_BANDS, unit))}
          >
            기본값으로
          </button>
        </div>

        {!validation.ok && (
          <ul className="ku-bands-modal-errors">
            {validation.errors.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        )}
        {saveError && (
          <p className="ku-bands-modal-save-error" role="alert">
            {saveError}
          </p>
        )}

        <div className="ku-bands-modal-actions">
          <button
            type="button"
            className="ku-workspace-button"
            disabled={saving}
            onClick={onClose}
          >
            취소
          </button>
          <button
            type="button"
            className="ku-workspace-primary"
            disabled={!canSave}
            onClick={() => void handleSave()}
          >
            {saving ? "저장 중..." : "저장"}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: 목록 패널의 범례 줄** — `src/components/admin/workspace/WorkspaceListPanel.tsx`

props 형에 더한다:

```ts
  /** 범례 옆(모바일은 바텀시트 맨 아래)에 두는 동작. 경사도 탭만 넘긴다 */
  legendAction?: ReactNode;
```

모바일 분기의 `<div className="ku-bottom-sheet-list">{body}</div>` 다음 줄에:

```tsx
{
  legendAction && <div className="ku-bottom-sheet-foot">{legendAction}</div>;
}
```

데스크톱의 범례 블록을 바꾼다:

```tsx
{
  (legend.length > 0 || legendAction) && (
    <div className="ku-float-panel-legend-bar">
      {legend.length > 0 && (
        <ul className="ku-float-panel-legend" aria-label="범례">
          {legend.map((item, index) => (
            <li key={index}>
              <span aria-hidden="true" style={{ background: item.color }} />
              {item.label}
            </li>
          ))}
        </ul>
      )}
      {legendAction}
    </div>
  );
}
```

- [ ] **Step 7: 페이지 연결** — `src/app/admin/dashboard/slopes/page.tsx`

import를 더한다: `useId`(react), `SlopeBandsModal`(`@/components/admin/slopes/SlopeBandsModal`).

모듈 상수:

```tsx
const LEGEND_READ_FAILED =
  "범례 설정을 읽지 못해 편집할 수 없어요. 새로 고친 뒤 다시 시도해 주세요";
```

컴포넌트 안(`slopeBands` 아래):

```tsx
const [bandsModalOpen, setBandsModalOpen] = useState(false);
const legendBlockedId = useId();
const legendReadFailed = slopeBands.status === "error";
// ready가 아닐 때 열면 초안이 기본값에서 시작해, 저장하는 순간 DB의 실제 설정을 덮어쓴다(설계 3장)
const legendAction = (
  <>
    <button
      type="button"
      className="ku-workspace-button"
      disabled={slopeBands.status !== "ready"}
      title={legendReadFailed ? LEGEND_READ_FAILED : undefined}
      aria-describedby={legendReadFailed ? legendBlockedId : undefined}
      onClick={() => setBandsModalOpen(true)}
    >
      범례 편집
    </button>
    {legendReadFailed && (
      <span id={legendBlockedId} className="ku-sr-only">
        {LEGEND_READ_FAILED}
      </span>
    )}
  </>
);
```

`WorkspaceListPanel`에 `legendAction={legendAction}`을 넘긴다. 반환 JSX의 `{toast && …}` 앞에:

```tsx
{
  bandsModalOpen && (
    <SlopeBandsModal
      initialBands={slopeBands.bands}
      onClose={() => setBandsModalOpen(false)}
      onSaved={() => {
        setBandsModalOpen(false);
        showToast("범례를 저장했어요");
      }}
    />
  );
}
```

- [ ] **Step 8: CSS** — `src/app/admin/admin-ui.css`

`.ku-float-panel-legend li span { … }` 규칙 뒤에:

```css
.ku-float-panel-legend-bar {
  display: flex;
  flex: none;
  align-items: center;
  gap: 10px;
  padding-right: 12px;
  border-top: 1px solid var(--ku-divider);
  background: color-mix(in srgb, var(--ku-surface) 50%, var(--ku-bg));
}
.ku-float-panel-legend-bar .ku-float-panel-legend {
  flex: 1;
  border-top: 0;
  background: transparent;
}
.ku-float-panel-legend-bar > .ku-workspace-button {
  flex: none;
  margin-left: auto;
}
```

모바일 미디어 쿼리 안 `.ku-bottom-sheet-list { … }` 뒤에:

```css
.ku-bottom-sheet-foot {
  display: flex;
  flex: none;
  justify-content: flex-end;
  padding: 8px 16px calc(8px + env(safe-area-inset-bottom, 0px));
  border-top: 1px solid var(--ku-divider);
}
.ku-bottom-sheet-foot .ku-workspace-button {
  min-height: 44px;
}
```

파일 끝(미디어 쿼리 밖)에 모달 규칙:

```css
.ku-bands-modal-backdrop {
  position: fixed;
  z-index: 2000;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--ku-backdrop);
}
.ku-bands-modal {
  box-sizing: border-box;
  width: 90%;
  /* 한 구간을 한 줄(색·이름·상한·설명·삭제)에 놓을 폭. 560px에서는 이름 칸이 기본 이름도 자른다 */
  max-width: 720px;
  max-height: 90vh;
  overflow-y: auto;
  padding: 20px;
  border: 1px solid var(--ku-border);
  border-radius: var(--ku-radius);
  color: var(--ku-text-1);
  background: var(--ku-surface);
  box-shadow: var(--ku-shadow-overlay);
}
.ku-bands-modal h2 {
  margin: 0 0 14px;
  font-size: 16px;
  font-weight: 700;
}
.ku-bands-modal-preview {
  padding: 12px;
  border: 1px solid var(--ku-divider);
  border-radius: var(--ku-radius);
  background: var(--ku-bg);
}
.ku-bands-modal-preview .ku-slope-bands {
  width: 100%;
}
.ku-bands-modal-preview p {
  margin: 0;
  color: var(--ku-text-3);
  font-size: 12.5px;
}
.ku-bands-modal-unit {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 14px;
  color: var(--ku-text-2);
  font-size: 12.5px;
  font-weight: 600;
}
.ku-bands-modal-rows {
  display: grid;
  gap: 12px;
  margin: 14px 0;
  padding: 0;
  list-style: none;
}
.ku-bands-modal-row {
  display: grid;
  grid-template-areas:
    "color name upper description remove"
    "error error error error error";
  grid-template-columns: auto minmax(0, 1fr) auto minmax(0, 1.4fr) auto;
  align-items: center;
  gap: 6px 8px;
}
.ku-bands-modal input[type="text"],
.ku-bands-modal input[type="number"] {
  box-sizing: border-box;
  min-width: 0;
  height: 36px;
  padding: 0 8px;
  border: 1px solid var(--ku-border-input);
  border-radius: var(--ku-radius);
  color: var(--ku-text-1);
  background: var(--ku-surface);
  font-size: 13px;
}
.ku-bands-modal-color {
  display: flex;
  grid-area: color;
  gap: 4px;
}
.ku-bands-modal-color input[type="color"] {
  width: 36px;
  height: 36px;
  padding: 2px;
  border: 1px solid var(--ku-border-input);
  border-radius: var(--ku-radius);
  background: var(--ku-surface);
}
.ku-bands-modal-color input[type="text"] {
  width: 84px;
}
.ku-bands-modal-name {
  grid-area: name;
}
.ku-bands-modal-upper {
  display: flex;
  grid-area: upper;
  align-items: center;
  gap: 4px;
  color: var(--ku-text-2);
  font-size: 12.5px;
  white-space: nowrap;
}
.ku-bands-modal-upper input {
  width: 72px;
}
.ku-bands-modal-converted {
  color: var(--ku-text-3);
}
.ku-bands-modal-description {
  grid-area: description;
}
.ku-bands-modal-remove {
  grid-area: remove;
  width: 36px;
  height: 36px;
  border: 1px solid var(--ku-border-input);
  border-radius: var(--ku-radius);
  color: var(--ku-text-2);
  background: var(--ku-surface);
  cursor: pointer;
}
.ku-bands-modal-remove:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}
.ku-bands-modal-field-error {
  grid-area: error;
  margin: 0;
  color: var(--ku-danger);
  font-size: 12px;
}
.ku-bands-modal-tools {
  display: flex;
  gap: 8px;
}
.ku-bands-modal-errors {
  margin: 12px 0 0;
  padding-left: 18px;
  color: var(--ku-danger);
  font-size: 12px;
}
.ku-bands-modal-save-error {
  margin: 12px 0 0;
  color: var(--ku-danger);
  font-size: 12.5px;
}
.ku-bands-modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
}
/* 이보다 좁으면 모달(폭 90%)에 한 줄이 들지 않아 두 줄(색·이름·삭제 / 상한·설명)로 접는다 */
@media (max-width: 759px) {
  .ku-bands-modal-row {
    grid-template-areas:
      "color name remove"
      "upper description description"
      "error error error";
    grid-template-columns: auto minmax(0, 1fr) auto;
  }
}
```

- [ ] **Step 9: 스펙 반영** — `docs/specs/2026-10-19-slope-bands-design.md`

- §6.1 모달 꼭지의 "폭 90%·최대 560px"를 `폭 90%·최대 720px`로 바꾸고 이어 쓴다: `2026-10-19 구현 — 한 줄 배치에 이름·설명 칸까지 쓸 만하게 주면 약 625px가 들어, 560px에서는 이름 칸이 기본 이름도 자른다. 760px보다 좁은 화면에서 두 줄로 접는다.`
- §6.1 미리보기 꼭지에 한 줄 더한다: `초안이 검증을 통과하지 못하면 범례 대신 "입력을 고치면 미리보기가 다시 보여요"다 — 상한이 없는 행은 눈금과 범위를 쓸 수 없다.`
- §6.1 모달 꼭지에 한 줄 더한다: `배경의 mousedown 대상이 배경일 때만 닫는다(FeedbackButton과 같다). click으로 받으면 안에서 끌다 밖에서 놓아도 초안째 닫힌다.`
- §8 표에 두 줄을 더한다: `src/components/slope/useSlopeRouteDraft.ts` — `단위 선택지(SLOPE_UNIT_OPTIONS)와 기억값 읽기·쓰기를 내보낸다. 모달과 편집 패널이 같이 쓴다`, `src/components/admin/slopes/SlopeEditPanel.tsx` — `단위 선택지를 위에서 가져온다`.

- [ ] **Step 10: 포맷·커밋·push**

```bash
npx --yes prettier@3.9.4 --write src/components/admin/slopes/SlopeBandsModal.tsx src/components/slope/useSlopeRouteDraft.ts src/components/admin/slopes/SlopeEditPanel.tsx src/components/admin/workspace/WorkspaceListPanel.tsx src/app/admin/dashboard/slopes/page.tsx src/app/admin/admin-ui.css e2e/support/mockBackend.ts e2e/admin-slopes-workspace.spec.ts e2e/admin-dark.spec.ts docs/specs/2026-10-19-slope-bands-design.md
git add src/components/admin/slopes src/components/slope/useSlopeRouteDraft.ts src/components/admin/workspace/WorkspaceListPanel.tsx src/app/admin/dashboard/slopes/page.tsx src/app/admin/admin-ui.css e2e docs/specs/2026-10-19-slope-bands-design.md
git commit -m "feat: 경사도 작업 화면에서 범례 구간을 고치는 모달을 둔다" -m "목록 패널의 범례 옆(모바일은 바텀시트 맨 아래)에 범례 편집 버튼을 두고, 구간마다 색·이름·상한·설명을 고치는 모달을 연다. 미리보기는 공개 지도와 같은 범례 컴포넌트다. 저장하면 열린 화면 전체가 다시 조회하지 않고 새 색으로 바뀐다." -m "범례 설정을 읽지 못했거나 아직 읽는 중이면 편집을 열지 않는다 — 초안이 기본값에서 시작해 저장하는 순간 실제 설정을 덮어쓴다. 툴팁이 열린 동안에는 모달의 Esc 닫기를 끈다. 단위 선택지와 기억값은 경로 편집 패널과 같은 것을 쓴다."
git push
```

- [ ] **Step 11: CI 확인**

Run: `gh pr checks <n> --watch`
Expected: 전부 통과. `e2e/accessibility-dialog-toast.spec.ts`처럼 대화상자·토스트를 세는 테스트가 깨지면 그 단언이 경사도 화면의 버튼 수를 고정했는지 본다.

---

### Task 9: 마무리 — 문서 back-trace와 PR 본문

**Files:**

- Modify: `docs/specs/2026-10-19-slope-bands-design.md` (필요할 때만)

- [ ] **Step 1: 전체 back-trace**

Run:

```bash
rg -n "SLOPE_GRADE|slopeGradeFromDeg|SlopeGrade\b|SLOPE_GRADIENT_STOPS|SLOPE_LEVELS|SLOPE_REFERENCE_LINES|slopeColorFromDeg|SLOPE_CHIPS|SlopeChip|SLOPE_GRADE_TONES|gradeCounts|readUnitPreference|writeUnitPreference" src e2e docs
rg -n "ku-slope-scale|ku-slope-threshold|ku-slope-legend-title" src e2e docs
rg -n "연속 색|그라데이션|판정 3색" src e2e
```

Expected: `src`·`e2e` 0건. `docs`는 날짜가 붙은 당시 기록(2026-10-06·2026-10-14 설계 본문, 배너 표의 "당시" 열)과 2026-10-19 설계의 대체 대상 서술뿐. 남은 것이 있으면 그 커밋에서 고친다. 결과를 그대로 PR 본문에 붙인다.

`rg`가 닿지 않는 곳: 이 저장소는 이슈·위키에 계약을 적지 않는다. PR #42 이후 열린 PR 본문에 경사 색을 서술한 것이 있는지 `gh pr list --state open --json number,title`로 보고, 있으면 그 PR 작성자(사용자)에게 알린다.

- [ ] **Step 2: 스펙 §11 점검**

§11의 여섯 꼭지가 모두 결과를 갖는지 본다 — 외곽선 클릭(Task 5 e2e), 마운트 순서(Task 5·6), hydration(서버·첫 스냅샷이 같은 객체 — Task 2 단위 테스트), 칩 줄 생략이 시설·명소에 영향 없음(그 화면 e2e가 CI에서 통과), 6구간 눈금(Task 5 e2e), Next 문서(Task 3). 빠진 꼭지가 있으면 결과를 한 줄로 적는다.

- [ ] **Step 3: PR 본문 다시 쓰기**

scratchpad에 본문을 쓰고 `gh pr edit <n> --body-file <파일>`로 바꾼다. 담을 것:

```markdown
경사도 범례를 구간마다 한 색으로 나누고, 구간 개수·경계·색·이름·설명을 관리자 경사도 화면에서 고치게 한다. 관리자 화면의 판정 3색·칩·배지도 같은 구간 색으로 통일한다.

## 바뀐 것

### 공개 지도

- 선은 구간 색 한 가지, 밑에 외곽선(어두운 거리 지도 흰색, 그 밖 검정).
- 범례는 필터 패널에서 빼 지도 위에 띄운다. 데스크톱 오른쪽 아래 버튼 열 왼쪽, 모바일 둘러보기 위. 경계 눈금(%·°)만 늘 보이고 구간 이름·설명은 툴팁.

### 관리자

- 칩 줄을 없애고 배지는 `형식 오류`만 남긴다. 범례·프로파일 막대·구간 표·지도 선·편집 미리보기·다른 경로·구간 카드 번호 원이 구간 색이다.
- 목록의 `범례 편집`(모바일은 바텀시트 맨 아래) → 모달. 저장하면 열린 화면이 다시 조회하지 않고 바뀐다.

### 저장

- `app_settings`의 `slope_bands` 한 행. 마이그레이션 없음 — 첫 저장이 행을 만든다. 행이 없거나 깨지면 기본값(1/18·1/12·1/8, 연두·노랑·주황·빨강).
- `POST /api/settings/slope-bands`(관리자 인증 + 폼과 같은 검증).

## 설계와 다르게 간 것

(계획 문서 "계획에서 정한 것" 표에서 실제로 간 것만 옮긴다 — 예: 범례 CSS 파일 위치, 막대 폭 240px, 외곽선 순서 방식)

## 테스트

- 단위: `slopeBands`·`slopeBandsStore`·`slopeBandsDraft`·저장 API. 판정 3색·연속 색 테스트는 지웠다.
- e2e: 스펙 9.2 표의 단언 교체, 9.3의 공개 지도·관리자 테스트, 다크 모드 모달 스캔.
- 로컬 `node_modules`가 없어 lint·typecheck·test·e2e는 이 PR의 CI로 확인했다.

## 남은 것

- `feat/activity-log` 병합 뒤 감사 로그 설계 5.5 키 이름 표에 `slope_bands → 경사도 범례`.

## Back-trace

(Step 1 명령과 출력)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

- [ ] **Step 4: 문서 변경이 있으면 커밋·push 후 CI 확인**

```bash
git add docs/specs/2026-10-19-slope-bands-design.md
git commit -m "docs: 경사도 범례 구현에서 확인한 것을 설계에 적는다"
git push
gh pr checks <n> --watch
```

- [ ] **Step 5: 사용자에게 넘긴다**

draft를 풀지(`gh pr ready <n>`), 운영 화면을 어떻게 확인할지는 사용자가 정한다. 병합할 때는 계획 문서를 브랜치에서 `git rm docs/plans/2026-10-19-slope-bands.md`로 지우는 커밋을 먼저 둔다(이 파일은 Task 0에서 추적되므로 git 기록에 남는다).
