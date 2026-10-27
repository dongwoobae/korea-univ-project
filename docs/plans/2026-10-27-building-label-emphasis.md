# 건물 이름 강조 PR ③ 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans(권장 — 푸시 두 번이 태스크를 걸쳐 묶인다) 또는
> superpowers:subagent-driven-development로 태스크 순서대로 실행한다. 단계는 체크박스(`- [ ]`)로 추적한다. 모든 태스크의 **A 단계**
> (문서·테스트)를 먼저 커밋해 푸시 A로 기대한 이유의 실패를 CI에서 보고, 그다음 **B 단계**(구현)를 커밋해 푸시 B로 초록을 본다.
> 진행은 `git log`로 본다.

**Goal:** 공개 지도에서 마우스를 올린 건물과 상세가 열린 건물의 이름을 진하게·굵게·살짝 크게 강조하고, 상세가 열린 건물 이름은 확대와
상관없이 보이며, 모바일에서 누른 건물 이름이 상세 시트에 가리면 지도를 옮긴다.

**Architecture:** 건물 이름표는 폴리곤에 붙은 Leaflet 영구 툴팁(`.ku-building-label`)이다. 새 모듈 `src/components/map/buildingLabel.ts`가
툴팁 바깥 요소에 강조 클래스 두 개(`--hovered`, `--selected`)를 달고, 클래스가 바뀌면 `tooltip.update()`로 자리를 다시 잡는다. 보임·모양은
CSS가 정한다 — 마우스 올림 강조는 이름이 보이는 확대(`data-building-labels-visible="true"`)에서만, 선택 강조는 늘. 그래서 확대가 바뀔 때
JS가 할 일이 없다. `Map.tsx`는 마우스 올림을 ref로, 선택을 상세 패널 상태(`selectedBuilding`)로 들고 바뀔 때 클래스를 맞춘다.

**Tech Stack:** Next 16.2.4 · React 19.2.4(React Compiler), Leaflet 1.9.4 · react-leaflet, vitest 3(`environment: "node"` — DOM 없음),
Playwright 1.61.

**Spec:** `docs/specs/2026-10-25-mentoring-feedback-design.md` 5장(이하 "설계 5.N"). 계획과 설계가 다르면 설계가 맞다 — 멈추고 보고한다
(아래 "이 계획이 정한 것"은 Task 1이 설계에 먼저 반영한다).

## Global Constraints

- 강조 모양: 불투명 1(흐림 없음), 굵기 800(지금 650), 글자 11px → 12.5px. 색은 지금처럼 `var(--ku-text-1)`.
- 이름표의 가운데가 건물 가운데에서 움직이지 않는다. Leaflet은 툴팁 바깥 요소의 `transform`으로 자리를 잡으므로 거기에 `transform: scale`을
  걸지 않는다(설계 5.2).
- 이름이 보이는 확대: 데스크톱 17 이상, 모바일(창 너비 768 미만) 18 이상 — `Map.tsx`의 `buildingLabelsVisible`. 바꾸지 않는다.
- 모바일 상세 시트 높이는 `map-ui.css` `.ku-side-panel`의 `min(62vh, 620px)`.
- 덜 확대했을 때의 커서 이름표(`.ku-map-tooltip`)와 폴리곤 강조, 이름이 보이는 확대에서 폴리곤 색을 바꾸지 않는 것은 그대로다.
- **로컬에서 `npm ci`·vitest·tsc·eslint·Playwright를 돌리지 않는다**(C 드라이브 여유 부족). 검증은 PR CI. 서식만
  `npx --yes prettier@3.9.4 --write <바꾼 파일>`.
- `gh workflow run` 금지(수동 실행이면 운영 마이그레이션 잡이 돈다). 주석은 이유·외부 제약·위험만. 커밋 메시지 한국어
  `type(scope): 내용`, `Co-Authored-By` 없음, 작업 과정(리뷰·점검)을 적지 않는다. `core.autocrlf=true`, 커밋 전
  `rg -n "\x{FFFD}" <바꾼 파일>`.
- 모든 명령은 저장소 루트(`C:\Users\servi\projects\korea-univ-project`)에서. 브랜치 `feat/building-label-emphasis`(main `8e89c43`에서).

## 이 계획이 정한 것

1. **강조는 클래스 두 개로 나눈다.** `ku-building-label--hovered`는 이름이 보이는 확대에서만 보이게(CSS가 `data-building-labels-visible`로
   거른다), `ku-building-label--selected`는 늘 보이게. 마우스 올림 클래스는 확대와 상관없이 달고 뗀다 — 확대가 바뀌어도 상태가 맞는다.
   **크기·굵기는 클래스만 있으면 확대와 상관없이 바뀌고, 보임·불투명만 확대를 따른다.** 마우스를 올린 채 휠로 확대 경계를 넘을 때 너비가
   바뀌면 자리를 다시 잴 때가 없어 가운데가 밀린다.
2. **클래스가 실제로 바뀔 때만 `tooltip.update()`를 부른다.** 굵기·크기로 너비가 달라져 가운데가 밀리는 것을 다시 잰다. 바뀌지 않았으면
   레이아웃을 다시 하지 않는다.
3. **"선택"은 상세 패널이 열린 건물(`selectedBuilding`)이다.** 지하철역 선택(`SubwayMarkers`)은 폴리곤 이름표가 없다. 상세를 닫으면
   폴리곤 강조와 함께 280ms 뒤에 풀린다(`handleClosePanel`의 지연).
4. **폴리곤을 눌러 선택하면 커서 이름표를 바로 닫는다.** 선택된 건물에는 이름표가 떠 있어 커서 이름표를 띄우지 않는다는 설계 5.2 규칙을
   누른 순간에도 지킨다. Task 1이 설계 5.2에 적는다.
5. **모바일 시트 위로 옮기기는 폴리곤을 눌러 선택할 때만 한다**(설계 5.2 "누른 건물"). 검색·즐겨찾기 선택은 `fitBounds`가 건물을 화면
   가운데에 두는 별도 흐름이라 이 PR에서 다루지 않는다. Task 1이 설계 5.2에 적는다.
6. **옮길 자리는 보이는 영역(지도 위 ~ 시트 위)의 세로 가운데**다. 이름표 위아래가 그 영역 안 여백 12px 안쪽이면 옮기지 않는다. 지도
   경계(`maxBounds`, `src/lib/mapBounds.ts`) 끝에 붙은 건물은 확대를 바꾸지 않고는 더 옮길 수 없어 가린 채 남을 수 있다 — Task 1이 설계
   5.2에 예외로 적는다.
7. **GeoJSON을 다시 만들면(타일·다크·데이터 버전) 새 층의 `tooltipopen`에서 선택 상태를 다시 단다.** 새 층은 마우스 올림 없이 시작한다 —
   지난 층의 `mouseout`은 오지 않는다.
8. **시험 픽스처에 둘째 건물을 테스트 안에서 더한다**(공용 픽스처는 건드리지 않는다). 중앙도서관 폴리곤을 동쪽으로 0.0012도 옮긴 공학관.
9. **지하철역을 고르면 앞서 고른 건물의 폴리곤 강조도 푼다.** 지금은 역 선택(`SubwayMarkers`의 `onSelect={setSelectedBuilding}`)이
   `activeBuildingIdRef`를 남겨, 그 건물 폴리곤이 강조된 채 이름표만 풀리고, 그 건물을 다시 누르면 선택 대신 닫기로 읽힌다. 선택 상태가
   바뀔 때 활성 폴리곤이 그 선택과 다르면 푸는 효과로 고친다 — `SubwayMarkers`의 `onSelect`는 memo 때문에 안정된 참조여야 해(그 파일
   주석) 콜백을 바꾸지 않는다.
10. **상세를 닫는 0.28초 사이에 다른 건물을 고르면 그 선택을 지우지 않는다.** `handleClosePanel`의 타이머가 닫기를 누를 때의 활성 건물과
    지금 활성 건물이 다르면 아무것도 하지 않는다. 지금은 새로 고른 건물의 상세·강조까지 지운다.

## Review Focus

1. **가운데 고정**: 클래스를 바꾼 뒤 `tooltip.update()`가 불리는지, `transform`을 이름표 바깥 요소에 걸지 않았는지, 크기·굵기 규칙에
   `data-building-labels-visible` 조건이 붙지 않았는지.
2. **CSS 우선순위**: 기본 보임 규칙(`opacity: 0.58 !important`, 선택자 우선순위 0,3,0)을 강조 규칙이 이기는지 — 같은 우선순위면 뒤에
   와야 한다.
3. **상태 일치**: 상세 닫기·다른 건물 선택·지하철역 선택·닫는 사이 다시 선택·언어 전환·GeoJSON 다시 만들기·확대 변경 뒤 클래스와 폴리곤
   강조가 지금 상태(올림·선택)와 맞는지.
4. **모바일**: 마우스 올림 처리가 모바일에서 돌지 않는지, 옮기기가 확대를 바꾸지 않는지(`panBy`만).

## 푸시와 CI

| 푸시 | 담는 커밋                                   | 기대                                                                                                                                         |
| ---- | ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| A    | Task 1, Task 2의 A 단계, Task 3(E2E)        | `Typecheck`: `buildingLabel` 모듈이 없어 실패. `Test (unit)`: `buildingLabel.test.ts`만 실패. Playwright: 새 spec만 실패, 기존 테스트는 통과 |
| B    | Task 2의 B 단계, Task 4(화면), Task 5(정리) | 전부 초록                                                                                                                                    |

푸시 A 뒤 draft PR을 연다(`gh pr create --draft`). 실패 목록은 실행이 끝난 뒤
`gh api repos/dongwoobae/korea-univ-project/actions/jobs/<job id>/logs | grep -E "✘|FAIL|error TS|Expected|Received"`.

---

### Task 1: 진행 상황과 설계 문구

**Files:**

- Create: `docs/plans/2026-10-27-building-label-emphasis.md`(이 문서, 이미 있다)
- Modify: `docs/specs/2026-10-25-mentoring-feedback-design.md` "진행 상황"·5.2

- [ ] **Step 1: 설계 문서 머리를 읽는다**

첫 40줄을 읽어 고칠 절이 대체 배너 아래가 아님을 확인한다.

- [ ] **Step 2: 진행 상황을 고친다**

표의 ②-2b 줄과 `③ ~ ⑦` 줄을 바꾼다:

```markdown
| ②-2b 종류 관리 화면 | **완료** — #60 병합(`8e89c43`), 운영 적용 완료 | pgTAP 7개 파일 122개 단언 통과, vitest 786/786, Playwright 431 통과(+명소 화면 flaky 1). 운영 확인은 아래 |
| ③ 건물 이름 강조 | **진행 중** — 계획 `docs/plans/2026-10-27-building-label-emphasis.md` | |
| ④ ~ ⑦ | 대기 | |
```

"②-2a 운영 확인" 절 다음에 절을 더한다:

```markdown
**②-2b 운영 확인 (2026-10-27)**

- `Apply Supabase migrations`가 `20261026020000_add_facility_type_order_swap.sql`을 적용했고 `Verify migration history`가 통과했다(run
  40426509161).
- 방문자 키로 `rpc/swap_facility_type_order`(`ramp`, `parking`)를 부르면 401(`42501` permission denied)이다. 종류 순서는 병합 전과 같다
  (`restroom` 1 · `ramp` 2 · `parking` 3 · `elevator` 4 · `automatic_door` 5 · `student_lounge` 7).
- **아직 안 본 것:** 운영에서 시험 종류 하나를 만들었다가 지울 때 활동 기록에 "시설 종류 등록"·"시설 종류 삭제"가 남는지, ▲▼ 한 번에
  "시설 종류 수정"(바뀐 칸 "순서") 두 줄 — 관리자 로그인이 필요하다.
```

"**다음에 할 일 — ②-2b 시설 종류 관리 화면**" 절(제목과 번호 목록 두 줄)을 바꾼다:

```markdown
**다음에 할 일 — ③ 건물 이름 강조**

1. 계획 `docs/plans/2026-10-27-building-label-emphasis.md`(설계 5장).
2. ③이 병합되면 ④ 메뉴 재배치(6장).
```

"마지막 갱신:" 날짜를 2026-10-27로 둔다(이미 그렇다면 그대로).

- [ ] **Step 3: 설계 5.2에 이 계획이 정한 것을 적는다**

5.2의 "**[판단]** 웹에서 이름이 숨는 확대일 때, …커서 이름표가 뜬다." 항목 끝에 붙인다:

```markdown
폴리곤을 눌러 선택한 순간에도 떠 있던 커서 이름표를 닫는다.
```

5.2의 "**[판단]** 모바일에서 누른 건물의 이름이 …이미 보이면 옮기지 않는다." 항목 끝에 붙인다:

```markdown
옮길 자리는 지도 위에서 시트 위까지의 세로 가운데다. 지도 경계(`src/lib/mapBounds.ts`) 끝에 붙은 건물은 확대를 바꾸지 않고는 더 옮길 수
없어 가린 채 남을 수 있다 — 받아들인다. 검색·즐겨찾기로 고른 건물은 `fitBounds`가 화면 가운데에 두는 다른 흐름이라 이 규칙에 넣지
않았다(2026-10-27).
```

5.2의 "**[판단]** 마우스를 올린 건물과 선택된 건물이 다르면 …남거나 빠지지 않게." 항목 끝에 붙인다:

```markdown
지하철역을 고르면 앞서 고른 건물의 폴리곤 강조도 푼다. 상세를 닫는 0.28초 사이에 다른 건물을 고르면 그 선택을 지우지 않는다. 둘 다
2026-10-27 전에는 어긋나 있었다(역 선택 뒤 건물 강조가 남고, 닫는 사이 고른 건물의 상세가 사라졌다).
```

5.2의 "살짝 커짐" 항목 끝에 붙인다:

```markdown
크기·굵기는 강조 상태만 따르고 확대를 따르지 않는다 — 마우스를 올린 채 확대 경계를 넘을 때 너비가 바뀌면 자리를 다시 잴 때가 없다.
```

- [ ] **Step 4: 서식과 커밋**

```bash
npx --yes prettier@3.9.4 --write docs/plans/2026-10-27-building-label-emphasis.md docs/specs/2026-10-25-mentoring-feedback-design.md
rg -n "\x{FFFD}" docs/plans/2026-10-27-building-label-emphasis.md docs/specs/2026-10-25-mentoring-feedback-design.md
git add docs/plans/2026-10-27-building-label-emphasis.md docs/specs/2026-10-25-mentoring-feedback-design.md
git commit -m "docs: 건물 이름 강조 계획을 두고 ②-2b 완료를 진행 상황에 적는다"
```

---

### Task 2: 이름표 강조·시트 위로 옮기기 모듈

**Files:**

- Create(A): `src/components/map/buildingLabel.test.ts`
- Create(B): `src/components/map/buildingLabel.ts`

**Interfaces:**

- Produces:

  ```ts
  export const LABEL_HOVERED_CLASS = "ku-building-label--hovered";
  export const LABEL_SELECTED_CLASS = "ku-building-label--selected";
  export function setBuildingLabelEmphasis(
    tooltip: Tooltip | undefined,
    state: { hovered: boolean; selected: boolean },
  ): void;
  export const LABEL_REVEAL_MARGIN = 12;
  export function mobileSheetHeight(viewportHeight: number): number;
  export function labelRevealOffset(input: {
    labelCenterY: number;
    labelHeight: number;
    mapHeight: number;
    sheetHeight: number;
  }): number;
  export function revealLabelAboveSheet(
    map: LeafletMap,
    tooltip: Tooltip | undefined,
  ): void;
  ```

  (`Tooltip`·`LeafletMap`은 `import type { Map as LeafletMap, Tooltip } from "leaflet"` — 타입만 가져온다. vitest가 `node` 환경이라
  leaflet 본체를 불러오면 `window`가 없어 깨진다.)

- [ ] **Step A1: 테스트를 쓴다** — `src/components/map/buildingLabel.test.ts`

```ts
import type { Tooltip } from "leaflet";
import { describe, expect, it, vi } from "vitest";
import {
  LABEL_HOVERED_CLASS,
  LABEL_SELECTED_CLASS,
  labelRevealOffset,
  mobileSheetHeight,
  setBuildingLabelEmphasis,
} from "./buildingLabel";

// vitest는 DOM 없이 돈다. 이름표 요소는 classList만 흉내 낸다
function fakeTooltip() {
  const classes = new Set<string>();
  const element = {
    classList: {
      contains: (name: string) => classes.has(name),
      toggle: (name: string, force: boolean) => {
        if (force) classes.add(name);
        else classes.delete(name);
        return force;
      },
    },
  };
  const update = vi.fn();
  const tooltip = { getElement: () => element, update } as unknown as Tooltip;
  return { tooltip, classes, update };
}

describe("setBuildingLabelEmphasis", () => {
  it("올림·선택을 클래스로 달고, 바뀔 때만 자리를 다시 잡는다", () => {
    const { tooltip, classes, update } = fakeTooltip();
    setBuildingLabelEmphasis(tooltip, { hovered: true, selected: false });
    expect([...classes]).toEqual([LABEL_HOVERED_CLASS]);
    expect(update).toHaveBeenCalledTimes(1);

    setBuildingLabelEmphasis(tooltip, { hovered: true, selected: false });
    expect(update).toHaveBeenCalledTimes(1);

    setBuildingLabelEmphasis(tooltip, { hovered: true, selected: true });
    expect(classes).toEqual(
      new Set([LABEL_HOVERED_CLASS, LABEL_SELECTED_CLASS]),
    );
    expect(update).toHaveBeenCalledTimes(2);
  });

  it("하나를 떼도 다른 하나는 남는다", () => {
    const { tooltip, classes } = fakeTooltip();
    setBuildingLabelEmphasis(tooltip, { hovered: true, selected: true });
    setBuildingLabelEmphasis(tooltip, { hovered: false, selected: true });
    expect([...classes]).toEqual([LABEL_SELECTED_CLASS]);
  });

  it("이름표가 없거나 아직 열리지 않았으면 아무것도 하지 않는다", () => {
    expect(() =>
      setBuildingLabelEmphasis(undefined, { hovered: true, selected: true }),
    ).not.toThrow();
    const update = vi.fn();
    const closed = {
      getElement: () => undefined,
      update,
    } as unknown as Tooltip;
    setBuildingLabelEmphasis(closed, { hovered: true, selected: true });
    expect(update).not.toHaveBeenCalled();
  });
});

describe("모바일 시트 위로 옮기기", () => {
  it("시트 높이는 창 높이의 62%이고 620px을 넘지 않는다", () => {
    expect(mobileSheetHeight(844)).toBeCloseTo(523.28);
    expect(mobileSheetHeight(1200)).toBe(620);
  });

  // 지도 844px, 시트 524px → 보이는 영역 0~320px, 가운데 160px. 이름표 높이 16px, 여백 12px
  const base = { labelHeight: 16, mapHeight: 844, sheetHeight: 524 };

  it("이름표가 보이는 영역 안이면 옮기지 않는다", () => {
    expect(labelRevealOffset({ ...base, labelCenterY: 160 })).toBe(0);
    // 아래 끝 308 = 320 - 12
    expect(labelRevealOffset({ ...base, labelCenterY: 300 })).toBe(0);
    // 위 끝 12
    expect(labelRevealOffset({ ...base, labelCenterY: 20 })).toBe(0);
  });

  it("시트에 가리면 보이는 영역 가운데로 오게 지도를 내린다", () => {
    expect(labelRevealOffset({ ...base, labelCenterY: 422 })).toBe(262);
    expect(labelRevealOffset({ ...base, labelCenterY: 302 })).toBe(142);
  });

  it("화면 위로 벗어나도 가운데로 옮긴다", () => {
    expect(labelRevealOffset({ ...base, labelCenterY: 10 })).toBe(-150);
  });
});
```

- [ ] **Step A2: 커밋**

```bash
npx --yes prettier@3.9.4 --write src/components/map/buildingLabel.test.ts
rg -n "\x{FFFD}" src/components/map/buildingLabel.test.ts
git add src/components/map/buildingLabel.test.ts
git commit -m "test: 건물 이름표 강조 클래스와 모바일 시트 위로 옮길 거리를 시험한다"
```

- [ ] **Step B1: 구현한다** — `src/components/map/buildingLabel.ts`

```ts
import type { Map as LeafletMap, Tooltip } from "leaflet";

/** 공개 지도 건물 이름표의 강조. 설계: docs/specs/2026-10-25-mentoring-feedback-design.md 5.2 */

export const LABEL_HOVERED_CLASS = "ku-building-label--hovered";
export const LABEL_SELECTED_CLASS = "ku-building-label--selected";

/** 보임·모양은 CSS(map-ui.css)가 정한다. 마우스 올림 강조는 이름이 보이는 확대에서만 보인다 */
export function setBuildingLabelEmphasis(
  tooltip: Tooltip | undefined,
  state: { hovered: boolean; selected: boolean },
) {
  const element = tooltip?.getElement();
  if (!tooltip || !element) return;
  let changed = false;
  for (const [name, on] of [
    [LABEL_HOVERED_CLASS, state.hovered],
    [LABEL_SELECTED_CLASS, state.selected],
  ] as const) {
    if (element.classList.contains(name) === on) continue;
    element.classList.toggle(name, on);
    changed = true;
  }
  // 굵기·크기가 바뀌면 너비가 달라져 가운데가 밀린다. Leaflet은 바깥 요소의 transform으로 자리를 잡으므로 다시 잰다
  if (changed) tooltip.update();
}

export const LABEL_REVEAL_MARGIN = 12;

/** map-ui.css `.ku-side-panel`(모바일)의 `height: min(62vh, 620px)`과 같은 식이다. 그쪽을 바꾸면 같이 바꾼다 */
export function mobileSheetHeight(viewportHeight: number) {
  return Math.min(viewportHeight * 0.62, 620);
}

/** 이름표가 지도 위 ~ 시트 위 영역 밖이면 그 영역 가운데로 오게 할 `panBy` 세로 거리. 보이면 0 */
export function labelRevealOffset({
  labelCenterY,
  labelHeight,
  mapHeight,
  sheetHeight,
}: {
  labelCenterY: number;
  labelHeight: number;
  mapHeight: number;
  sheetHeight: number;
}) {
  const visibleBottom = mapHeight - sheetHeight;
  const top = labelCenterY - labelHeight / 2;
  const bottom = labelCenterY + labelHeight / 2;
  if (
    top >= LABEL_REVEAL_MARGIN &&
    bottom <= visibleBottom - LABEL_REVEAL_MARGIN
  )
    return 0;
  return Math.round(labelCenterY - visibleBottom / 2);
}

/** 확대는 두고 지도만 옮긴다(설계 5.2). 시트가 열리기 전에 불러도 시트 높이는 식으로 안다 */
export function revealLabelAboveSheet(
  map: LeafletMap,
  tooltip: Tooltip | undefined,
) {
  const latlng = tooltip?.getLatLng();
  const element = tooltip?.getElement();
  if (!latlng || !element) return;
  const offset = labelRevealOffset({
    labelCenterY: map.latLngToContainerPoint(latlng).y,
    labelHeight: element.offsetHeight,
    mapHeight: map.getSize().y,
    sheetHeight: mobileSheetHeight(window.innerHeight),
  });
  if (offset !== 0) map.panBy([0, offset], { animate: true });
}
```

(이름표는 확대가 낮으면 `visibility: hidden`이지만 레이아웃은 있어 `offsetHeight`를 잴 수 있다.)

- [ ] **Step B2: 커밋**

```bash
npx --yes prettier@3.9.4 --write src/components/map/buildingLabel.ts
rg -n "\x{FFFD}" src/components/map/buildingLabel.ts
git add src/components/map/buildingLabel.ts
git commit -m "feat: 건물 이름표 강조 클래스와 모바일 시트 위로 옮기기를 둔다"
```

---

### Task 3: E2E — 이름표 강조

**Files:**

- Create(A): `e2e/building-label-emphasis.spec.ts`

- [ ] **Step A1: spec을 쓴다** — `e2e/building-label-emphasis.spec.ts`

```ts
import { expect, test, type Locator, type Page } from "@playwright/test";
import { installMockBackend, type MockState } from "./support/mockBackend";

// 설계: docs/specs/2026-10-25-mentoring-feedback-design.md 5.2

const MOBILE = { width: 390, height: 844 };
const LIBRARY = "중앙도서관";
const ENGINEERING = "공학관";

/** 중앙도서관 폴리곤을 동쪽으로 옮긴 둘째 건물. 공용 픽스처는 건드리지 않는다 */
function addEngineeringHall(state: MockState) {
  const library = state.buildings[0];
  const geojson = structuredClone(library.geojson) as {
    geometry: { coordinates: number[][][] };
  };
  geojson.geometry.coordinates = geojson.geometry.coordinates.map((ring) =>
    ring.map(([lng, lat]) => [lng + 0.0012, lat]),
  );
  state.buildings.push({
    ...library,
    id: 2,
    name: ENGINEERING,
    name_en: "Engineering Hall",
    geojson,
  });
}

function label(page: Page, name: string) {
  return page.locator(".ku-building-label").filter({ hasText: name });
}

function building(page: Page, index: number) {
  return page
    .locator(".leaflet-overlay-pane path.leaflet-interactive")
    .nth(index);
}

async function zoomToLabels(page: Page) {
  await page
    .locator(".leaflet-container")
    .dblclick({ position: { x: 600, y: 400 } });
  await expect(page.locator(".ku-map-shell")).toHaveAttribute(
    "data-building-labels-visible",
    "true",
  );
}

async function expectEmphasized(locator: Locator) {
  await expect(locator).toBeVisible();
  await expect(locator).toHaveCSS("opacity", "1");
  await expect(locator).toHaveCSS("font-weight", "800");
  await expect(locator).toHaveCSS("font-size", "12.5px");
}

async function expectPlain(locator: Locator) {
  await expect(locator).toHaveCSS("opacity", "0.58");
  await expect(locator).toHaveCSS("font-weight", "650");
}

async function centerOf(locator: Locator) {
  const box = (await locator.boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

const currentTileZoom = (page: Page) =>
  page.locator(".leaflet-tile").evaluateAll((tiles) =>
    Math.max(
      ...tiles.map((tile) => {
        const match = (tile as HTMLImageElement).src.match(
          /light_all\/(\d+)\//,
        );
        return match ? Number(match[1]) : 0;
      }),
    ),
  );

test.describe("건물 이름 강조 — 웹", () => {
  test.beforeEach(async ({ page }) => {
    const state = await installMockBackend(page);
    addEngineeringHall(state);
    await page.goto("/");
    await expect(page.locator(".ku-building-label")).toHaveCount(2);
  });

  test("이름이 보이는 확대에서 마우스를 올린 건물 이름만 강조하고 가운데는 그대로다", async ({
    page,
  }) => {
    await zoomToLabels(page);
    const library = label(page, LIBRARY);
    await expectPlain(library);
    const before = await centerOf(library);

    await building(page, 0).hover();
    await expectEmphasized(library);
    await expectPlain(label(page, ENGINEERING));
    const after = await centerOf(library);
    expect(Math.abs(after.x - before.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(after.y - before.y)).toBeLessThanOrEqual(1);
    await expect(page.locator(".ku-map-tooltip")).toHaveCount(0);

    await page.mouse.move(640, 700);
    await expectPlain(library);
  });

  test("마우스를 올린 건물과 선택된 건물이 다르면 둘 다 강조하고, 선택을 풀면 선택만 빠진다", async ({
    page,
  }) => {
    await zoomToLabels(page);
    await building(page, 0).click();
    await expect(page.locator(".ku-side-panel")).toBeVisible();
    await building(page, 1).hover();
    await expectEmphasized(label(page, LIBRARY));
    await expectEmphasized(label(page, ENGINEERING));

    await page.mouse.move(640, 700);
    await expectPlain(label(page, ENGINEERING));
    await expectEmphasized(label(page, LIBRARY));

    await page
      .locator(".ku-side-panel")
      .getByRole("button", { name: "닫기" })
      .click();
    await expect(page.locator(".ku-side-panel")).toHaveCount(0);
    await expectPlain(label(page, LIBRARY));
  });

  test("이름이 숨는 확대에서는 선택한 건물 이름만 띄우고 그 건물에는 커서 이름표를 띄우지 않는다", async ({
    page,
  }) => {
    await expect(page.locator(".ku-map-shell")).toHaveAttribute(
      "data-building-labels-visible",
      "false",
    );
    await building(page, 0).hover();
    await expect(page.locator(".ku-map-tooltip")).toBeVisible();
    await building(page, 0).click();
    await expect(page.locator(".ku-map-tooltip")).toHaveCount(0);
    await expectEmphasized(label(page, LIBRARY));
    await expect(label(page, ENGINEERING)).toBeHidden();

    await page.mouse.move(640, 700);
    await building(page, 0).hover();
    await expect(page.locator(".ku-map-tooltip")).toHaveCount(0);
    await building(page, 1).hover();
    await expect(page.locator(".ku-map-tooltip")).toBeVisible();
    await expect(label(page, ENGINEERING)).toBeHidden();

    await page
      .locator(".ku-side-panel")
      .getByRole("button", { name: "닫기" })
      .click();
    await expect(page.locator(".ku-side-panel")).toHaveCount(0);
    await expect(label(page, LIBRARY)).toBeHidden();
  });

  test("선택 강조는 언어를 바꾸거나 지도를 다시 그리거나 확대를 바꿔도 남는다", async ({
    page,
  }) => {
    await building(page, 0).click();
    await expectEmphasized(label(page, LIBRARY));

    await page.getByTitle("English").click();
    await expectEmphasized(label(page, "Central Library"));

    await page.getByRole("button", { name: "Switch to satellite" }).click();
    await expectEmphasized(label(page, "Central Library"));

    await page.getByRole("button", { name: "확대" }).click();
    await expect(page.locator(".ku-map-shell")).toHaveAttribute(
      "data-building-labels-visible",
      "true",
    );
    await expectEmphasized(label(page, "Central Library"));
    await expectPlain(label(page, "Engineering Hall"));
  });

  test("마우스를 올린 채 휠로 확대 경계를 넘어도 이름표 가운데가 그대로다", async ({
    page,
  }) => {
    await building(page, 0).hover();
    await expect(page.locator(".ku-map-tooltip")).toBeVisible();
    await page.mouse.wheel(0, -120);
    await expect(page.locator(".ku-map-shell")).toHaveAttribute(
      "data-building-labels-visible",
      "true",
    );
    const library = label(page, LIBRARY);
    await expectEmphasized(library);
    const hovered = await centerOf(library);

    // 강조를 떼면 자리를 다시 잰다. 경계를 넘을 때 가운데가 맞았다면 떼어도 그대로다
    await page.mouse.move(640, 700);
    await expectPlain(library);
    const plain = await centerOf(library);
    expect(Math.abs(hovered.x - plain.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(hovered.y - plain.y)).toBeLessThanOrEqual(1);
  });

  test("상세를 닫는 사이 다른 건물을 고르면 그 건물의 상세와 강조가 남는다", async ({
    page,
  }) => {
    await building(page, 0).click();
    await expect(
      page.getByRole("complementary", { name: `${LIBRARY} 접근성 정보` }),
    ).toBeVisible();
    await page
      .locator(".ku-side-panel")
      .getByRole("button", { name: "닫기" })
      .click();
    await building(page, 1).click();

    // 닫기 타이머(280ms)가 지난 뒤에도 남는지 봐야 해 시간을 둔다
    await page.waitForTimeout(400);
    await expect(
      page.getByRole("complementary", { name: `${ENGINEERING} 접근성 정보` }),
    ).toBeVisible();
    await expectEmphasized(label(page, ENGINEERING));
    await expect(label(page, LIBRARY)).toBeHidden();
  });

  test("지하철역을 고르면 앞서 고른 건물의 강조가 풀리고, 그 건물을 다시 누르면 다시 고른다", async ({
    page,
  }) => {
    await building(page, 0).click();
    await expectEmphasized(label(page, LIBRARY));
    await expect(building(page, 0)).toHaveAttribute("fill-opacity", "0.38");

    await page.getByTitle("고려대역", { exact: true }).click();
    await expect(label(page, LIBRARY)).toBeHidden();
    await expect(building(page, 0)).toHaveAttribute("fill-opacity", "0.18");

    await building(page, 0).click();
    await expect(
      page.getByRole("complementary", { name: `${LIBRARY} 접근성 정보` }),
    ).toBeVisible();
    await expectEmphasized(label(page, LIBRARY));
  });
});

test.describe("건물 이름 강조 — 모바일", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(MOBILE);
    await installMockBackend(page);
    await page.goto("/");
    await expect(page.locator(".ku-building-label")).toHaveCount(1);
  });

  test("누른 건물 이름이 상세 시트에 가리면 확대는 두고 시트 위로 옮긴다", async ({
    page,
  }) => {
    const zoomBefore = await currentTileZoom(page);
    const sheetTop = MOBILE.height - Math.min(MOBILE.height * 0.62, 620);
    const before = await building(page, 0).boundingBox();
    expect(before!.y).toBeGreaterThan(sheetTop);

    await building(page, 0).click();
    await expect(page.locator(".ku-side-panel")).toBeVisible();
    const library = label(page, LIBRARY);
    await expectEmphasized(library);
    // 위아래 모두 지도 위 ~ 시트 위 안이어야 한다 — 아래만 보면 화면 위로 밀려 나가도 통과한다
    await expect
      .poll(async () => {
        const box = await library.boundingBox();
        return Boolean(box && box.y >= 0 && box.y + box.height <= sheetTop);
      })
      .toBe(true);
    expect(await currentTileZoom(page)).toBe(zoomBefore);
  });

  test("누른 건물 이름이 이미 시트 위에 보이면 지도를 옮기지 않는다", async ({
    page,
  }) => {
    // 건물을 화면 위쪽으로 끌어 올린다
    const start = (await building(page, 0).boundingBox())!;
    await page.mouse.move(
      start.x + start.width / 2,
      start.y + start.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(start.x + start.width / 2, 170, { steps: 10 });
    // 멈췄다 놓는다. Leaflet은 놓기 직전 50ms의 움직임으로 관성을 주는데, 바로 놓으면 지도가 화면 밖까지 미끄러진다
    await page.waitForTimeout(150);
    await page.mouse.up();
    await page.waitForTimeout(400);
    const settled = (await building(page, 0).boundingBox())!;
    const sheetTop = MOBILE.height - Math.min(MOBILE.height * 0.62, 620);
    expect(settled.y + settled.height).toBeLessThan(sheetTop - 24);

    await building(page, 0).click();
    await expectEmphasized(label(page, LIBRARY));
    await page.waitForTimeout(400);
    const after = (await building(page, 0).boundingBox())!;
    expect(Math.abs(after.y - settled.y)).toBeLessThanOrEqual(1);
  });
});
```

(`waitForTimeout(400)`은 Leaflet의 끌기 관성·`maxBounds` 되돌림과 `panBy` 애니메이션(0.25초)이 끝나기를 기다린다. "옮기지 않았다"는 시간이
지나도 그대로임을 봐야 해 poll로 바꿀 수 없다.)

- [ ] **Step A2: 커밋하고 푸시 A**

```bash
npx --yes prettier@3.9.4 --write e2e/building-label-emphasis.spec.ts
rg -n "\x{FFFD}" e2e/building-label-emphasis.spec.ts
git add e2e/building-label-emphasis.spec.ts
git commit -m "test(e2e): 건물 이름 강조와 모바일 시트 위로 옮기기를 시험한다"
git push -u origin feat/building-label-emphasis
gh pr create --draft --base main --title "feat: 공개 지도 건물 이름 강조(멘토링 ③)" --body-file <초안 본문 파일>
```

초안 본문 파일(스크래치패드)은 "테스트를 먼저 올린 초안이다. 구현과 본문은 다음 푸시에서 채운다."와 설계·계획 경로, 끝에
`🤖 Generated with [Claude Code](https://claude.com/claude-code)`.

Expected: "푸시와 CI" 표의 A 줄.

---

### Task 4: 지도에 잇기

**Files:**

- Modify(B): `src/components/map/Map.tsx`, `src/components/map/map-ui.css`

**Interfaces:**

- Consumes: Task 2의 `setBuildingLabelEmphasis`, `revealLabelAboveSheet`.

- [ ] **Step B1: import** — `Map.tsx`의 `import SubwayMarkers from "./SubwayMarkers";` 바로 뒤에 더한다(같은 폴더 모듈은 `./`로 들여온다):

```tsx
import {
  revealLabelAboveSheet,
  setBuildingLabelEmphasis,
} from "./buildingLabel";
```

- [ ] **Step B2: 상태** — `const tooltipRef = useRef<HTMLDivElement | null>(null);` 바로 뒤에 더한다:

```tsx
// 이름표 강조(설계 5.2). 마우스 올림은 mouseover마다 바뀌어 state 대신 ref로 두고, 선택은 상세 패널이 열린 건물을 따른다
const hoveredBuildingIdRef = useRef<number | null>(null);
const labelSelectedIdRef = useRef<number | null>(null);
const selectedBuildingId = selectedBuilding?.id ?? null;

useEffect(() => {
  const previous = labelSelectedIdRef.current;
  labelSelectedIdRef.current = selectedBuildingId;
  for (const id of [previous, selectedBuildingId]) {
    if (id === null) continue;
    setBuildingLabelEmphasis(layerMapRef.current[id]?.getTooltip(), {
      hovered: hoveredBuildingIdRef.current === id,
      selected: selectedBuildingId === id,
    });
  }
}, [selectedBuildingId]);

// 지하철역 선택(SubwayMarkers의 onSelect)은 활성 폴리곤을 건드리지 않는다. 남겨 두면 그 건물이 강조된 채 남고, 다시 누르면
// 선택 대신 닫기로 읽힌다(click의 activeBuildingIdRef 비교)
useEffect(() => {
  if (
    !activeLayerRef.current ||
    activeBuildingIdRef.current === selectedBuildingId
  )
    return;
  activeLayerRef.current.setStyle(
    baseStyle(
      featureMapRef.current[activeBuildingIdRef.current ?? -1],
      tileMode,
      prefersDarkMode,
    ),
  );
  activeLayerRef.current = null;
  activeBuildingIdRef.current = null;
}, [selectedBuildingId, tileMode, prefersDarkMode]);
```

(둘째 효과의 조건은 폴리곤을 눌러 고르거나 검색·즐겨찾기로 고를 때 거짓이다 — 그 흐름들은 `activeBuildingIdRef`와 `selectedBuilding`을 같이
바꾼다. `handleClosePanel`도 둘을 같은 타이머에서 비운다. 어긋나는 것은 지하철역 선택뿐이다.)

- [ ] **Step B3: `onEachFeature`** — 바인딩 뒤 `layer.on({ … })` 블록을 바꾼다. `bindTooltip` 호출(`if (label) { … }`) 다음, `layer.on({`
      앞에 더한다:

```tsx
// 다시 만든 층은 마우스 올림 없이 시작한다. 지난 층의 mouseout은 오지 않는다
if (hoveredBuildingIdRef.current === bId) hoveredBuildingIdRef.current = null;
const syncLabel = () =>
  setBuildingLabelEmphasis(layer.getTooltip(), {
    hovered: hoveredBuildingIdRef.current === bId,
    selected: labelSelectedIdRef.current === bId,
  });
```

`layer.on({` 안의 `mouseover`를 바꾸고, 그 앞에 `tooltipopen`을 더한다:

```tsx
      // 타일·다크·데이터 버전으로 GeoJSON을 다시 만들면 이름표도 새로 열린다
      tooltipopen: syncLabel,
      mouseover(e: L.LeafletMouseEvent) {
        if (isMobileRef.current) return;
        hoveredBuildingIdRef.current = bId;
        syncLabel();
        // 이름이 보이는 확대에서는 이름표가 강조를 맡는다
        if ((mapRef.current?.getZoom() ?? 16) >= 17) return;
        layer.setStyle(hoverStyle(feature, tileMode, prefersDarkMode));
        // 선택된 건물은 이름표가 이미 떠 있다
        if (labelSelectedIdRef.current === bId) return;
        const { clientX, clientY } = e.originalEvent;
        const mapEl = mapRef.current?.getContainer();
        if (!mapEl) return;
        const rect = mapEl.getBoundingClientRect();
        setTooltip({
          visible: true,
          name: feature.properties.name,
          name_en: feature.properties.name_en ?? "",
          x: clientX - rect.left + 12,
          y: clientY - rect.top - 36,
        });
      },
```

`mouseout()`의 맨 앞에 더한다:

```tsx
if (hoveredBuildingIdRef.current === bId) {
  hoveredBuildingIdRef.current = null;
  syncLabel();
}
```

`click()`의 끝 `setSelectedBuilding({ id: bId, name: feature.properties.name });` 뒤에 더한다:

```tsx
// 선택하면 이름표가 뜬다 — 커서 이름표를 겹쳐 두지 않는다
setTooltip((prev) => (prev.visible ? { ...prev, visible: false } : prev));
if (isMobileRef.current && mapRef.current) {
  revealLabelAboveSheet(mapRef.current, layer.getTooltip());
}
```

- [ ] **Step B4: 닫기 타이머** — `handleClosePanel`을 바꾼다:

```tsx
function handleClosePanel() {
  window.dispatchEvent(new Event("sidePanelShouldClose"));
  const closingId = activeBuildingIdRef.current;
  setTimeout(() => {
    // 닫히는 사이 다른 건물을 고르면 그 선택을 지우지 않는다(설계 5.2)
    if (activeBuildingIdRef.current !== closingId) return;
    setSelectedBuilding(null);
    if (activeLayerRef.current) {
      activeLayerRef.current.setStyle(
        baseStyle(
          featureMapRef.current[activeBuildingIdRef.current ?? -1],
          tileMode,
          prefersDarkMode,
        ),
      );
      activeLayerRef.current = null;
      activeBuildingIdRef.current = null;
    }
  }, 280);
}
```

(지하철역 상세를 닫을 때는 위 Step B2의 둘째 효과가 이미 `activeBuildingIdRef`를 `null`로 비워 `closingId`도 `null`이다 — 그대로 닫힌다.)

- [ ] **Step B5: CSS** — `map-ui.css`의 `.ku-map-shell[data-building-labels-visible="true"] .ku-building-label { … }` 규칙 바로 뒤에 더한다:

```css
/* 마우스를 올린 건물(이름이 보이는 확대에서만)과 상세가 열린 건물(확대와 상관없이)의 이름. 설계: docs/specs/2026-10-25-mentoring-feedback-design.md 5.2.
   크기·굵기는 확대와 상관없이 클래스만 따른다 — 마우스를 올린 채 확대 경계를 넘을 때 너비가 바뀌면 자리를 다시 잴 때가 없다.
   너비가 바뀌는 클래스 변경 때는 buildingLabel.ts가 자리를 다시 잡는다 */
.ku-building-label.ku-building-label--hovered,
.ku-building-label.ku-building-label--selected {
  z-index: 1;
  font-size: 12.5px;
  font-weight: 800;
}

/* 위 0.58 규칙과 우선순위가 같거나 높아야 해 그 뒤에 둔다 */
.ku-map-shell[data-building-labels-visible="true"]
  .ku-building-label.ku-building-label--hovered,
.ku-map-shell .ku-building-label.ku-building-label--selected {
  visibility: visible;
  opacity: 1 !important;
}
```

- [ ] **Step B6: 커밋**

```bash
npx --yes prettier@3.9.4 --write src/components/map/Map.tsx src/components/map/map-ui.css
rg -n "\x{FFFD}" src/components/map/Map.tsx src/components/map/map-ui.css
git add src/components/map/Map.tsx src/components/map/map-ui.css
git commit -m "feat: 공개 지도가 마우스를 올린 건물과 선택된 건물의 이름을 강조한다"
```

---

### Task 5: 참조 역추적·푸시 B·병합 뒤

- [ ] **Step 1: 참조 역추적**

```bash
rg -n "mouseover.*아무것도|일부러 아무것도|0\.58|ku-building-label" docs/ src/ e2e/
rg -n "buildingLabel|LABEL_HOVERED_CLASS|LABEL_SELECTED_CLASS|revealLabelAboveSheet" docs/ src/ e2e/
```

각 결과를 (a) 이 PR에서 고쳤거나 (b) 날짜가 붙은 기록으로 그 날짜에 맞거나 (c) 무관한지 나눠 PR 본문에 명령과 함께 적는다. 설계 5.1
"이름이 보이는 확대에서는 `mouseover`가 일부러 아무것도 하지 않는다"는 이 PR 전의 "지금"을 적은 절이라 (b)로 둔다.

- [ ] **Step 2: 푸시 B**

```bash
git push
gh pr checks --watch
```

Expected: 전부 초록. 깨지면 `superpowers:systematic-debugging`으로 원인을 찾는다.

- [ ] **Step 3: PR 본문** — 스크래치패드에 쓰고 `gh pr edit --body-file <파일>`, 그다음 `gh pr ready`

요약(설계 5.2 한 줄씩), 바뀐 것(`buildingLabel.ts`·`Map.tsx`·CSS), 이 계획이 정한 것 5·6(검색·즐겨찾기는 옮기지 않음, 옮길 자리), 시험
(CI에서 센 수), 참조 역추적(명령·분류), 사용자 확인 요청(실제 휠·터치로 강조와 시트 위로 옮기기). 끝에
`🤖 Generated with [Claude Code](https://claude.com/claude-code)`.

- [ ] **Step 4: 병합 직전 — 계획 문서를 지운다**

```bash
git rm docs/plans/2026-10-27-building-label-emphasis.md
git commit -m "docs: 구현을 마친 건물 이름 강조 PR ③ 계획 문서를 지운다"
git push
gh pr checks --watch
```

- [ ] **Step 5: 병합 뒤** — 마이그레이션이 없어 운영 확인은 사용자 눈으로 한다(공개 지도에서 건물에 마우스 올리기, 모바일에서 건물 누르기).
      결과는 다음 PR 첫 커밋에서 진행 상황에 적는다. 원격 브랜치는 사용자 확인 뒤 지운다.
