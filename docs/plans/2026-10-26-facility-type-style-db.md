# 시설 종류 PR ②-2a 구현 계획 — 아이콘·색을 DB로

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans(권장 — 푸시 두 번이 태스크를 걸쳐 묶인다) 또는
> superpowers:subagent-driven-development로 태스크 순서대로 실행한다. 단계는 체크박스(`- [ ]`)로 추적한다. 테스트를 먼저 커밋하고,
> 기대한 이유로 실패하는 것을 CI에서 본 뒤 구현을 커밋한다. 진행은 `git log`로 본다.

**Goal:** 시설 종류마다 아이콘 키와 색을 DB(`facility_types.icon`·`color`)에 두고, 모든 화면이 공용 저장소에서 그 값을 읽어 그리게
한다. 화면은 지금과 같다(자동문 필터 칩만 회색).

**Architecture:** 아이콘·색 목록과 고르는 규칙은 `src/lib/facilityStyleCatalog.ts`(순수), 종류 목록 받기는
`src/lib/facilityTypesStore.ts`(`useSyncExternalStore`, `slopeBandsStore.ts`와 같은 모양)에 둔다. 그리는 곳은 코드를 넘겨
`facilityStyleOf(types, code)`로 아이콘·색을 얻는다. 코드에 박힌 매핑(`FacilityCode`, `facilityColor`, `FALLBACK_PALETTE`,
`FACILITY_ICON_KEY`)은 지운다.

**Tech Stack:** Postgres·pgTAP, Next 16.2.4 · React 19.2.4(React Compiler), `@supabase/supabase-js` 2.x, `lucide-react`·`lucide-static`
1.31.0, vitest 3, Playwright.

**Spec:** `docs/specs/2026-10-26-facility-type-management-design.md`(이하 "설계 N.N") 1·2·4.1장. 계획과 설계가 다르면 설계가 맞다 —
멈추고 보고한다.

## Global Constraints

- **화면이 바뀌면 안 된다**(설계 2.3). 예외는 자동문 필터 칩(보라 → 회색 `#666666`)과, 관리자 화면에서 종류를 받기 전 아이콘 자리가
  잠깐 비는 것.
- 칸: `icon text not null default 'accessibility'`, `color text not null default '#666666'`, 색 검사 `^#[0-9A-F]{6}$`(대문자만).
  `icon`에는 DB 목록 검사를 두지 않는다(설계 1.1).
- 채우기 값(설계 1.2): `restroom` `toilet` `#2F7A4F` · `ramp` `trending-up` `#B25617` · `parking` `square-parking` `#6D4AB0` ·
  `elevator` `elevator` `#2D5FB0` · `student_lounge` `sofa` `#0F766E` · `braille` `grip-vertical` `#8A6A00`. 활동 기록 트리거는 끄지
  않는다.
- 아이콘 30개·색 10개는 설계 1.3 목록 그대로, 그 순서로.
- 대체값은 `accessibility`·`#666666`. 목록에 없는 코드, 목록에 없는 아이콘 키, 형식이 틀린 색, 칸이 없는 행(마이그레이션 전) 모두 대체값.
- 저장소는 처음 한 번만 자동으로 받는다. `reloadFacilityTypes()`는 받는 동안·실패해도 직전 목록을 둔다(설계 2.1).
- `<FacilityTypeIcon>`은 처음 받는 중(`loaded === false && status === "loading"`)이면 같은 크기의 빈 자리를 그린다.
- 마커 아이콘 캐시 키 두 곳에 아이콘 키와 색을 넣는다(설계 2.2).
- 마이그레이션 파일 이름 `^[0-9]{14}_[a-z0-9_]+\.sql$`, `20261026000000`보다 늦게 — 이 계획은 `20261026010000`.
- **로컬에서 `npm ci`·vitest·tsc·eslint·Playwright·Supabase를 돌리지 않는다**(C 드라이브 여유 약 1.5GB). 검증은 PR CI. 서식만
  `npx --yes prettier@3.9.4 --write <바꾼 파일>`.
- `gh workflow run` 금지. 주석은 이유·외부 제약·위험만. 커밋 메시지 한국어 `type(scope): 내용`, `Co-Authored-By` 없음, 작업 과정을 적지
  않는다. `core.autocrlf=true`, 커밋 전 `rg -n "\x{FFFD}" <바꾼 파일>`.
- 모든 명령은 저장소 루트에서. 브랜치 `feat/facility-type-style-db`(이미 있다, 설계 커밋 두 개가 올라가 있다).

## 이 계획이 정한 것

1. **다시 받기 함수 이름은 `reloadFacilityTypes()`.** 설계 2.1의 "다시 불러오기"와 `invalidateFacilityTypes()`를 하나로 합친다(실패 뒤
   다시 시도와 관리 화면의 쓰기 뒤가 같은 동작이다). Task 1이 설계 문구를 맞춘다.
2. **스냅숏에 `loaded`를 둔다** — 한 번이라도 받았는지. 빈 자리와 대체 아이콘을 가르는 데 쓴다.
3. **늦게 온 응답은 버린다.** 받기마다 번호를 매기고 가장 최근 것만 반영한다 — 고친 뒤 다시 받기보다 먼저 시작한 응답이 나중에 와서
   새 목록을 덮지 않게.
4. **공개 필터 선택을 미리 채우지 않는다.** 지금 `useMapData`는 종류를 받을 때 모든 코드를 `false`로 채운다. 읽는 곳이 모두 없는 키를
   `false`로 다루므로(`FacilityMarkers.tsx`·`FilterPanel.tsx`·`Map.tsx`) 채우기를 지워 다시 받아도 선택이 남게 한다(설계 2.2).
5. **배열은 `readonly`로 두지 않는다.** 저장소의 `types`를 그대로 받는 관리자 컴포넌트 props가 `FacilityType[]`다.
6. **명소·지하철·클러스터 아이콘과 `sizedIconSvg`·엘리베이터 그림은 `mapIcons.ts`에 남긴다.** 시설 종류 아이콘 표만 카탈로그로 옮긴다.

## Review Focus

1. **늦은 응답**: `load()`가 시작할 때 번호를 받고, 끝났을 때 번호가 최신이 아니면 버리는지. 실패 때 `{ ...snapshot, status: "error" }`가
   끝난 시점의 스냅숏을 쓰는지(시작 시점이 아니라).
2. **훅 위치**: `useFacilityStyle`·`useFacilityTypes`를 부르는 곳이 조건문·조기 반환 뒤가 아닌지(`FacilityDetailPanel`의 `code`,
   `FacilityRequestDrawer`의 `typeLabel` 근처).
3. **캐시 키**: 공개 `facilityMarkerIcon`과 관리자 `markerIcon`의 키에 `style.icon`·`style.color`가 모두 있는지.
4. **지운 심볼**: `rg -n "FacilityCode|facilityColor\b|FALLBACK_PALETTE|getFacilityColor|getFacilityMarkerColor|facilityIconKey|FacilityIconKey|FACILITY_ICON_KEY" src e2e`가
   카탈로그의 `FacilityIconKey`만 남기는지.
5. **E2E 기존 아이콘 단언**: 목 픽스처 종류(`elevator`·`ramp`·`parking`)의 `icon`이 지금 코드 매핑과 같은지 — 다르면 기존 테스트가 다른
   이유로 깨진다.

## 푸시와 CI

| 푸시 | 담는 커밋                         | 기대                                                                                                          |
| ---- | --------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| A    | 계획·설계 문구, Task 2·3·4 테스트 | `Typecheck`·`Test (unit)`은 새 모듈이 없어 실패. `DB test`는 새 파일만 실패. Playwright는 새 테스트 셋만 실패 |
| B    | Task 2·3·4 구현, 참조 역추적      | 전부 초록                                                                                                     |

실패 목록: `gh run view <run id> --log-failed | grep -E "✘|Error:|Expected|Received|not ok|FAIL" | head -60`. `DB test`가 `toomanyrequests`·
`port 54322 ... address already in use`로 죽으면 `gh run rerun <run id> --failed`.

---

### Task 1: 계획 문서와 설계 문구

**Files:**

- Create: `docs/plans/2026-10-26-facility-type-style-db.md`(이 문서)
- Modify: `docs/specs/2026-10-26-facility-type-management-design.md` 2.1·3.2·3.3

- [ ] **Step 1: 설계 문구를 맞춘다**

설계 문서 첫 40줄을 읽어 대체 배너가 없음을 확인한다. `invalidateFacilityTypes()`가 나오는 곳(`rg -n "invalidateFacilityTypes" docs`)을
모두 `reloadFacilityTypes()`로 바꾸고, 2.1의 그 항목 첫 문장을 "`reloadFacilityTypes()`: 다시 받는다. 받기 실패 뒤 다시 시도와 ②-2b
관리 화면의 쓰기 뒤에 부른다."로 고친다. 2.1에 한 줄 더한다: "스냅숏의 `loaded`는 한 번이라도 받았는지다. 빈 자리(받기 전)와 대체
아이콘(받은 뒤 모르는 코드)을 가른다."

- [ ] **Step 2: 서식과 커밋**

```bash
npx --yes prettier@3.9.4 --write docs/plans/2026-10-26-facility-type-style-db.md docs/specs/2026-10-26-facility-type-management-design.md
rg -n "\x{FFFD}" docs/plans/2026-10-26-facility-type-style-db.md docs/specs/2026-10-26-facility-type-management-design.md
git add docs/plans/2026-10-26-facility-type-style-db.md docs/specs/2026-10-26-facility-type-management-design.md
git commit -m "docs: 시설 종류 아이콘·색 DB 계획을 두고 다시 받기 함수 이름을 맞춘다"
```

---

### Task 2: 아이콘·색 카탈로그와 종류 저장소

**Files:**

- Create: `src/lib/facilityStyleCatalog.ts`, `src/lib/facilityTypesStore.ts`
- Test: `src/lib/facilityStyleCatalog.test.ts`, `src/lib/facilityTypesStore.test.ts`
- Modify(구현 단계): `src/lib/mapIcons.ts`, `src/lib/mapIcons.test.ts`, `src/components/map/iconography.tsx`,
  `src/components/map/iconography.test.ts`, `src/lib/theme.ts`, `src/types/domain.ts`
- Create(구현 단계): `src/lib/theme.test.ts`
- Delete(구현 단계): `src/components/map/facilityColors.ts`, `src/lib/facilityColors.test.ts`

**Interfaces:**

- Consumes: `ELEVATOR_ICON_SVG`·`sizedIconSvg`(`mapIcons.ts`, 그대로 남는다), `supabase`(`@/lib/supabaseClient`), `FacilityType`
  (`@/types/domain`, Task 3가 `icon`·`color`를 더한다)
- Produces:

  ```ts
  // facilityStyleCatalog.ts
  export const FACILITY_ICON_CHOICES: readonly { key: FacilityIconKey; label: string }[];
  export type FacilityIconKey; // "accessibility" | "elevator" | … 30개
  export const FACILITY_ICON_SVG: Record<FacilityIconKey, string>;
  export const FACILITY_COLOR_CHOICES: readonly { hex: string; label: string }[];
  export interface FacilityStyle { icon: FacilityIconKey; color: string }
  export const FALLBACK_FACILITY_STYLE: FacilityStyle;
  export function isFacilityIconKey(value: unknown): value is FacilityIconKey;
  export function facilityStyleOf(
    types: readonly { code: string; icon?: string | null; color?: string | null }[],
    code: string | null | undefined,
  ): FacilityStyle;
  export function facilityIconSvg(icon: string, size: number): string;
  // facilityTypesStore.ts
  export type FacilityTypesStatus = "loading" | "ready" | "error";
  export interface FacilityTypesSnapshot { types: FacilityType[]; status: FacilityTypesStatus; loaded: boolean }
  export function subscribeFacilityTypes(listener: () => void): () => void;
  export function getFacilityTypesSnapshot(): FacilityTypesSnapshot;
  export function getFacilityTypesServerSnapshot(): FacilityTypesSnapshot;
  export function reloadFacilityTypes(): void;
  export function useFacilityTypes(): FacilityTypesSnapshot;
  export function useFacilityStyle(code: string | null | undefined): FacilityStyle;
  // iconography.tsx
  export const FACILITY_ICON: Record<FacilityIconKey, LucideIcon>;
  export function FacilityTypeIcon(props: { code: string | null | undefined; size?: number }): JSX.Element;
  ```

- [ ] **Step 1: 카탈로그 테스트를 쓴다** — `src/lib/facilityStyleCatalog.test.ts`

```ts
import { describe, expect, it } from "vitest";
import {
  FACILITY_COLOR_CHOICES,
  FACILITY_ICON_CHOICES,
  FACILITY_ICON_SVG,
  FALLBACK_FACILITY_STYLE,
  facilityIconSvg,
  facilityStyleOf,
  isFacilityIconKey,
} from "@/lib/facilityStyleCatalog";

function contrastWithWhite(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 1.05 / (0.2126 * r + 0.7152 * g + 0.0722 * b + 0.05);
}

const types = [
  { code: "ramp", icon: "trending-up", color: "#B25617" },
  { code: "odd_icon", icon: "not-an-icon", color: "#2D5FB0" },
  { code: "odd_color", icon: "sofa", color: "red" },
  { code: "before_migration" },
];

describe("아이콘 목록", () => {
  it("30개이고 키마다 마커 SVG가 같은 lucide 아이콘이다", () => {
    expect(FACILITY_ICON_CHOICES).toHaveLength(30);
    for (const { key } of FACILITY_ICON_CHOICES)
      expect(FACILITY_ICON_SVG[key], key).toContain(
        `class="lucide lucide-${key}"`,
      );
  });

  it("키가 겹치지 않고 이름이 비지 않는다", () => {
    const keys = FACILITY_ICON_CHOICES.map((choice) => choice.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const choice of FACILITY_ICON_CHOICES)
      expect(choice.label.trim()).not.toBe("");
  });

  it("목록에 있는 키만 아이콘 키로 인정한다", () => {
    expect(isFacilityIconKey("sofa")).toBe(true);
    expect(isFacilityIconKey("not-an-icon")).toBe(false);
    expect(isFacilityIconKey("constructor")).toBe(false);
    expect(isFacilityIconKey(null)).toBe(false);
  });
});

describe("색 목록", () => {
  it("10개이고 모두 흰 아이콘과 대비가 4.5:1 이상인 대문자 #RRGGBB다", () => {
    expect(FACILITY_COLOR_CHOICES).toHaveLength(10);
    for (const { hex } of FACILITY_COLOR_CHOICES) {
      expect(hex).toMatch(/^#[0-9A-F]{6}$/);
      expect(contrastWithWhite(hex), hex).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("대체 색도 목록에 있다", () => {
    expect(FACILITY_COLOR_CHOICES.map((choice) => choice.hex)).toContain(
      FALLBACK_FACILITY_STYLE.color,
    );
  });
});

describe("facilityStyleOf", () => {
  it("행의 아이콘·색을 돌려준다", () => {
    expect(facilityStyleOf(types, "ramp")).toEqual({
      icon: "trending-up",
      color: "#B25617",
    });
  });

  it("모르는 코드와 빈 코드는 대체값이다", () => {
    expect(facilityStyleOf(types, "unknown")).toEqual(FALLBACK_FACILITY_STYLE);
    expect(facilityStyleOf(types, null)).toEqual(FALLBACK_FACILITY_STYLE);
    expect(facilityStyleOf([], "ramp")).toEqual(FALLBACK_FACILITY_STYLE);
  });

  it("목록에 없는 아이콘·형식이 틀린 색은 그 칸만 대체값이다", () => {
    expect(facilityStyleOf(types, "odd_icon")).toEqual({
      icon: "accessibility",
      color: "#2D5FB0",
    });
    expect(facilityStyleOf(types, "odd_color")).toEqual({
      icon: "sofa",
      color: "#666666",
    });
  });

  it("마이그레이션 전처럼 칸이 없는 행도 대체값이다", () => {
    expect(facilityStyleOf(types, "before_migration")).toEqual(
      FALLBACK_FACILITY_STYLE,
    );
  });
});

describe("facilityIconSvg", () => {
  it("크기를 반영하고 색은 부모에서 상속한다", () => {
    const svg = facilityIconSvg("trending-up", 17);
    expect(svg).toContain("lucide-trending-up");
    expect(svg).toContain('width="17"');
    expect(svg).toContain('stroke="currentColor"');
  });

  it("모르는 키는 대체 아이콘이다", () => {
    expect(facilityIconSvg("not-an-icon", 17)).toContain(
      "lucide-accessibility",
    );
  });

  it("엘리베이터는 직접 그린 아이콘이고 크기가 svg에만 걸린다", () => {
    const svg = facilityIconSvg("elevator", 17);
    expect(svg).toContain('<svg class="lucide lucide-elevator"');
    expect(svg).toContain('width="17" height="17"');
    expect(svg).toContain('width="16" height="13"');
  });
});
```

- [ ] **Step 2: 저장소 테스트를 쓴다** — `src/lib/facilityTypesStore.test.ts`

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { queryStub } from "@/test/queryStub";

const from = vi.fn();
vi.mock("@/lib/supabaseClient", () => ({ supabase: { from } }));

const RAMP = {
  code: "ramp",
  label: "경사로",
  icon: "trending-up",
  color: "#B25617",
};
const LOUNGE = {
  code: "student_lounge",
  label: "장애학생 휴게실",
  icon: "sofa",
  color: "#0F766E",
};

async function loadStore() {
  return import("./facilityTypesStore");
}

function deferred() {
  let respond!: (value: unknown) => void;
  const pending = new Promise((resolve) => {
    respond = resolve;
  });
  return { pending, respond };
}

describe("facilityTypesStore", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("구독 전에는 읽지 않고, 첫 스냅숏은 서버 스냅숏과 같은 객체다", async () => {
    const store = await loadStore();
    expect(store.getFacilityTypesSnapshot()).toBe(
      store.getFacilityTypesServerSnapshot(),
    );
    expect(store.getFacilityTypesSnapshot()).toEqual({
      types: [],
      status: "loading",
      loaded: false,
    });
    expect(from).not.toHaveBeenCalled();
  });

  it("두 번 구독해도 한 번만, sort_order·code 순으로 읽는다", async () => {
    const stub = queryStub({ data: [RAMP, LOUNGE], error: null });
    from.mockReturnValue(stub);
    const store = await loadStore();
    store.subscribeFacilityTypes(() => {});
    store.subscribeFacilityTypes(() => {});

    await vi.waitFor(() =>
      expect(store.getFacilityTypesSnapshot().status).toBe("ready"),
    );
    expect(from).toHaveBeenCalledTimes(1);
    expect(from).toHaveBeenCalledWith("facility_types");
    expect(stub.calls).toEqual([
      { method: "select", args: ["*"] },
      { method: "order", args: ["sort_order"] },
      { method: "order", args: ["code"] },
    ]);
    expect(store.getFacilityTypesSnapshot()).toEqual({
      types: [RAMP, LOUNGE],
      status: "ready",
      loaded: true,
    });
  });

  it("처음 읽기가 실패하면 error·빈 목록이고 loaded는 거짓이다", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    from.mockReturnValue(
      queryStub({ data: null, error: { code: "XX000", message: "boom" } }),
    );
    const store = await loadStore();
    store.subscribeFacilityTypes(() => {});

    await vi.waitFor(() =>
      expect(store.getFacilityTypesSnapshot().status).toBe("error"),
    );
    expect(store.getFacilityTypesSnapshot()).toEqual({
      types: [],
      status: "error",
      loaded: false,
    });
  });

  it("다시 받는 동안과 다시 받기가 실패해도 직전 목록을 둔다", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    from.mockReturnValueOnce(queryStub({ data: [RAMP], error: null }));
    const store = await loadStore();
    store.subscribeFacilityTypes(() => {});
    await vi.waitFor(() =>
      expect(store.getFacilityTypesSnapshot().status).toBe("ready"),
    );

    const { pending, respond } = deferred();
    from.mockReturnValueOnce(queryStub(pending));
    store.reloadFacilityTypes();
    expect(store.getFacilityTypesSnapshot()).toEqual({
      types: [RAMP],
      status: "loading",
      loaded: true,
    });

    respond({ data: null, error: { code: "XX000", message: "boom" } });
    await vi.waitFor(() =>
      expect(store.getFacilityTypesSnapshot().status).toBe("error"),
    );
    expect(store.getFacilityTypesSnapshot()).toEqual({
      types: [RAMP],
      status: "error",
      loaded: true,
    });
  });

  it("먼저 시작한 응답이 나중에 와도 최근 다시 받기 결과를 덮지 않는다", async () => {
    const first = deferred();
    from.mockReturnValueOnce(queryStub(first.pending));
    const store = await loadStore();
    store.subscribeFacilityTypes(() => {});

    from.mockReturnValueOnce(queryStub({ data: [RAMP, LOUNGE], error: null }));
    store.reloadFacilityTypes();
    await vi.waitFor(() =>
      expect(store.getFacilityTypesSnapshot().status).toBe("ready"),
    );

    first.respond({ data: [RAMP], error: null });
    await first.pending;
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(store.getFacilityTypesSnapshot().types).toEqual([RAMP, LOUNGE]);
  });

  it("조회가 예외를 던져도 error다", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    from.mockImplementation(() => {
      throw new Error("network");
    });
    const store = await loadStore();
    store.subscribeFacilityTypes(() => {});
    await vi.waitFor(() =>
      expect(store.getFacilityTypesSnapshot().status).toBe("error"),
    );
  });
});
```

- [ ] **Step 3: 테스트를 커밋한다**

```bash
npx --yes prettier@3.9.4 --write src/lib/facilityStyleCatalog.test.ts src/lib/facilityTypesStore.test.ts
git add src/lib/facilityStyleCatalog.test.ts src/lib/facilityTypesStore.test.ts
git commit -m "test: 시설 종류 아이콘·색 카탈로그와 종류 저장소를 시험한다"
```

푸시는 Task 4 Step 2와 함께(푸시 A).

- [ ] **Step 4: 카탈로그를 만든다** — `src/lib/facilityStyleCatalog.ts`

```ts
import {
  Accessibility,
  Armchair,
  Baby,
  Bath,
  BatteryCharging,
  Bell,
  BookOpen,
  Bus,
  Coffee,
  DoorOpen,
  Ear,
  Footprints,
  GlassWater,
  GripVertical,
  Hand,
  HeartPulse,
  Info,
  MapPin,
  Phone,
  Printer,
  ShowerHead,
  Sofa,
  SquareParking,
  Stethoscope,
  Toilet,
  TrainFront,
  TrendingUp,
  Utensils,
  Wifi,
} from "lucide-static";
import { ELEVATOR_ICON_SVG, sizedIconSvg } from "@/lib/mapIcons";

/** 관리자가 시설 종류에 고르는 아이콘·색. 설계: docs/specs/2026-10-26-facility-type-management-design.md 1.3 */

export const FACILITY_ICON_CHOICES = [
  { key: "accessibility", label: "휠체어" },
  { key: "elevator", label: "엘리베이터" },
  { key: "toilet", label: "화장실" },
  { key: "trending-up", label: "경사로" },
  { key: "square-parking", label: "주차" },
  { key: "grip-vertical", label: "점자" },
  { key: "sofa", label: "소파" },
  { key: "armchair", label: "의자" },
  { key: "door-open", label: "문" },
  { key: "baby", label: "수유·기저귀" },
  { key: "glass-water", label: "음수대" },
  { key: "bath", label: "욕실" },
  { key: "shower-head", label: "샤워" },
  { key: "heart-pulse", label: "자동심장충격기" },
  { key: "stethoscope", label: "보건" },
  { key: "ear", label: "청각 보조" },
  { key: "hand", label: "도움" },
  { key: "phone", label: "전화" },
  { key: "info", label: "안내" },
  { key: "bell", label: "호출벨" },
  { key: "utensils", label: "식당" },
  { key: "coffee", label: "카페" },
  { key: "bus", label: "버스" },
  { key: "train-front", label: "지하철" },
  { key: "footprints", label: "보행로" },
  { key: "map-pin", label: "위치" },
  { key: "printer", label: "프린터" },
  { key: "book-open", label: "열람" },
  { key: "wifi", label: "와이파이" },
  { key: "battery-charging", label: "충전" },
] as const;

export type FacilityIconKey = (typeof FACILITY_ICON_CHOICES)[number]["key"];

export const FACILITY_ICON_SVG: Record<FacilityIconKey, string> = {
  accessibility: Accessibility,
  elevator: ELEVATOR_ICON_SVG,
  toilet: Toilet,
  "trending-up": TrendingUp,
  "square-parking": SquareParking,
  "grip-vertical": GripVertical,
  sofa: Sofa,
  armchair: Armchair,
  "door-open": DoorOpen,
  baby: Baby,
  "glass-water": GlassWater,
  bath: Bath,
  "shower-head": ShowerHead,
  "heart-pulse": HeartPulse,
  stethoscope: Stethoscope,
  ear: Ear,
  hand: Hand,
  phone: Phone,
  info: Info,
  bell: Bell,
  utensils: Utensils,
  coffee: Coffee,
  bus: Bus,
  "train-front": TrainFront,
  footprints: Footprints,
  "map-pin": MapPin,
  printer: Printer,
  "book-open": BookOpen,
  wifi: Wifi,
  "battery-charging": BatteryCharging,
};

export const FACILITY_COLOR_CHOICES = [
  { hex: "#2D5FB0", label: "파랑" },
  { hex: "#2F7A4F", label: "초록" },
  { hex: "#0F766E", label: "청록" },
  { hex: "#B25617", label: "주황" },
  { hex: "#8A6A00", label: "황토" },
  { hex: "#6D4AB0", label: "보라" },
  { hex: "#BE185D", label: "분홍" },
  { hex: "#B91C1C", label: "빨강" },
  { hex: "#475569", label: "청회색" },
  { hex: "#666666", label: "회색" },
] as const;

export interface FacilityStyle {
  icon: FacilityIconKey;
  color: string;
}

export const FALLBACK_FACILITY_STYLE: FacilityStyle = {
  icon: "accessibility",
  color: "#666666",
};

const HEX_COLOR = /^#[0-9A-F]{6}$/;

export function isFacilityIconKey(value: unknown): value is FacilityIconKey {
  return typeof value === "string" && Object.hasOwn(FACILITY_ICON_SVG, value);
}

/** DB 검사가 없는 아이콘 키, 마이그레이션 전 행(칸 없음)까지 받아 칸마다 대체값으로 떨어뜨린다. 설계 1.1·2.4 */
export function facilityStyleOf(
  types: readonly {
    code: string;
    icon?: string | null;
    color?: string | null;
  }[],
  code: string | null | undefined,
): FacilityStyle {
  const type = code ? types.find((item) => item.code === code) : undefined;
  if (!type) return FALLBACK_FACILITY_STYLE;
  return {
    icon: isFacilityIconKey(type.icon)
      ? type.icon
      : FALLBACK_FACILITY_STYLE.icon,
    color:
      typeof type.color === "string" && HEX_COLOR.test(type.color)
        ? type.color
        : FALLBACK_FACILITY_STYLE.color,
  };
}

export function facilityIconSvg(icon: string, size: number): string {
  return sizedIconSvg(
    FACILITY_ICON_SVG[
      isFacilityIconKey(icon) ? icon : FALLBACK_FACILITY_STYLE.icon
    ],
    size,
  );
}
```

- [ ] **Step 5: 저장소를 만든다** — `src/lib/facilityTypesStore.ts`

```ts
"use client";

import { useSyncExternalStore } from "react";
import {
  facilityStyleOf,
  type FacilityStyle,
} from "@/lib/facilityStyleCatalog";
import { supabase } from "@/lib/supabaseClient";
import type { FacilityType } from "@/types/domain";

/** 시설 종류 목록을 한 번 받아 여러 화면이 같이 쓴다. 설계: docs/specs/2026-10-26-facility-type-management-design.md 2.1 */

export type FacilityTypesStatus = "loading" | "ready" | "error";

export interface FacilityTypesSnapshot {
  types: FacilityType[];
  status: FacilityTypesStatus;
  loaded: boolean;
}

// 서버 스냅숏과 첫 클라이언트 스냅숏이 같은 객체여야 hydration이 어긋나지 않는다
const INITIAL_SNAPSHOT: FacilityTypesSnapshot = {
  types: [],
  status: "loading",
  loaded: false,
};

let snapshot = INITIAL_SNAPSHOT;
let loadStarted = false;
let latestLoad = 0;
const listeners = new Set<() => void>();

function publish(next: FacilityTypesSnapshot) {
  snapshot = next;
  for (const listener of listeners) listener();
}

async function load() {
  latestLoad += 1;
  const thisLoad = latestLoad;
  let next: FacilityTypesSnapshot;
  try {
    const { data, error } = await supabase
      .from("facility_types")
      .select("*")
      .order("sort_order")
      .order("code");
    if (error) {
      console.error("[facility-types] read failed", {
        code: error.code,
        message: error.message,
      });
      next = { ...snapshot, status: "error" };
    } else {
      next = { types: data ?? [], status: "ready", loaded: true };
    }
  } catch (error) {
    console.error("[facility-types] read failed", error);
    next = { ...snapshot, status: "error" };
  }
  // 고친 뒤 다시 받기보다 먼저 시작한 응답이 나중에 오면 낡은 목록이다
  if (thisLoad !== latestLoad) return;
  publish(next);
}

export function subscribeFacilityTypes(listener: () => void): () => void {
  listeners.add(listener);
  if (!loadStarted) {
    loadStarted = true;
    void load();
  }
  return () => {
    listeners.delete(listener);
  };
}

export function getFacilityTypesSnapshot(): FacilityTypesSnapshot {
  return snapshot;
}

export function getFacilityTypesServerSnapshot(): FacilityTypesSnapshot {
  return INITIAL_SNAPSHOT;
}

/** 받는 동안에도 직전 목록을 둔다 — 비우면 열린 화면의 아이콘이 모두 대체 아이콘으로 번쩍인다 */
export function reloadFacilityTypes() {
  loadStarted = true;
  publish({ ...snapshot, status: "loading" });
  void load();
}

export function useFacilityTypes(): FacilityTypesSnapshot {
  return useSyncExternalStore(
    subscribeFacilityTypes,
    getFacilityTypesSnapshot,
    getFacilityTypesServerSnapshot,
  );
}

export function useFacilityStyle(
  code: string | null | undefined,
): FacilityStyle {
  return facilityStyleOf(useFacilityTypes().types, code);
}
```

- [ ] **Step 6: 시설 아이콘 표를 카탈로그로 옮긴다**

`src/lib/mapIcons.ts`:

- `lucide-static` import에서 `GripVertical`, `Sofa`, `SquareParking`, `Toilet`, `TrendingUp`을 뺀다(`Accessibility`는
  `FACILITY_CLUSTER_ICON_SVG`가 쓰므로 남긴다).
- `import type { FacilityCode } …` 줄, `FacilityIconKey` 타입, `FACILITY_ICON_KEY`, `facilityIconKey`, `FACILITY_ICON_SVG`,
  `facilityIconSvg`를 지운다. `ELEVATOR_ICON_NODE`·`ELEVATOR_ICON_SVG`·`sizedIconSvg`·명소·지하철·클러스터·`landmarkEmoji`는 그대로.

`src/lib/mapIcons.test.ts`: `describe("facilityIconKey", …)`와 `describe("facilityIconSvg", …)`를 지우고, `describe("엘리베이터 커스텀
아이콘", …)` 안의 `facilityIconSvg("elevator", 17)`을 `sizedIconSvg(ELEVATOR_ICON_SVG, 17)`로 바꾼다(import도 맞춘다 — `facilityIconKey`·
`facilityIconSvg`를 빼고 `ELEVATOR_ICON_SVG`를 더한다). 엘리베이터 SVG의 내용 검사는 이 파일에 남고, 키·대체 규칙은 카탈로그 테스트가
본다.

`src/components/map/iconography.tsx`:

```tsx
"use client";

import {
  Accessibility,
  Armchair,
  Baby,
  Bath,
  BatteryCharging,
  Bell,
  BookOpen,
  Bus,
  Coffee,
  DoorOpen,
  Ear,
  Footprints,
  GlassWater,
  GripVertical,
  Hand,
  HeartPulse,
  Info,
  MapPin,
  Phone,
  Printer,
  ShowerHead,
  Sofa,
  Sparkles,
  SquareParking,
  Stethoscope,
  Toilet,
  TrainFront,
  TrendingUp,
  Utensils,
  Wifi,
  createLucideIcon,
  type LucideIcon,
} from "lucide-react";
import {
  facilityStyleOf,
  type FacilityIconKey,
} from "@/lib/facilityStyleCatalog";
import { useFacilityTypes } from "@/lib/facilityTypesStore";
import { ELEVATOR_ICON_NODE, landmarkEmoji } from "@/lib/mapIcons";

/**
 * 마커 SVG와 같은 노드에서 만든다 — 두 벌이 갈라지지 않게 하는 것이
 * `iconography.test.ts`의 짝 검사가 지키는 성질이다.
 */
const Elevator = createLucideIcon("elevator", ELEVATOR_ICON_NODE);

// Leaflet divIcon은 HTML 문자열을, JSX는 컴포넌트를 요구해 같은 매핑을 두 벌 둔다(마커 쪽은 facilityStyleCatalog.ts).
export const FACILITY_ICON: Record<FacilityIconKey, LucideIcon> = {
  accessibility: Accessibility,
  elevator: Elevator,
  toilet: Toilet,
  "trending-up": TrendingUp,
  "square-parking": SquareParking,
  "grip-vertical": GripVertical,
  sofa: Sofa,
  armchair: Armchair,
  "door-open": DoorOpen,
  baby: Baby,
  "glass-water": GlassWater,
  bath: Bath,
  "shower-head": ShowerHead,
  "heart-pulse": HeartPulse,
  stethoscope: Stethoscope,
  ear: Ear,
  hand: Hand,
  phone: Phone,
  info: Info,
  bell: Bell,
  utensils: Utensils,
  coffee: Coffee,
  bus: Bus,
  "train-front": TrainFront,
  footprints: Footprints,
  "map-pin": MapPin,
  printer: Printer,
  "book-open": BookOpen,
  wifi: Wifi,
  "battery-charging": BatteryCharging,
};

interface FacilityTypeIconProps {
  code: string | null | undefined;
  size?: number;
}

export function FacilityTypeIcon({ code, size = 18 }: FacilityTypeIconProps) {
  const { types, loaded, status } = useFacilityTypes();
  // 처음 받기 전에 휠체어 대체 아이콘이 번쩍이지 않게 자리만 둔다. 받기에 실패했으면 대체 아이콘이다
  if (!loaded && status === "loading")
    return (
      <span
        aria-hidden="true"
        style={{ display: "inline-block", width: size, height: size }}
      />
    );
  const Icon = FACILITY_ICON[facilityStyleOf(types, code).icon];
  return <Icon size={size} aria-hidden="true" />;
}
```

나머지(`LANDMARK_CATEGORY_ICON`, `LandmarkCategoryIcon`, `LandmarkEmoji`)는 그대로 둔다.

`src/components/map/iconography.test.ts`의 첫 테스트를 바꾼다:

```ts
import { describe, expect, it, vi } from "vitest";
import { FACILITY_ICON_SVG } from "@/lib/facilityStyleCatalog";
import { LANDMARK_CATEGORY_ICON_SVG } from "@/lib/mapIcons";
import { FACILITY_ICON, LANDMARK_CATEGORY_ICON } from "./iconography";

// iconography.tsx가 종류 저장소를 거쳐 supabaseClient를 import한다. 그 모듈은 import할 때 환경 변수로 클라이언트를 만들고,
// CI 단위 테스트 잡에는 그 변수가 없어 수집 단계에서 터진다.
vi.mock("@/lib/supabaseClient", () => ({ supabase: { from: vi.fn() } }));
```

컴포넌트를 import하는 단위 테스트는 이 파일 하나다(2026-10-26 `src/**/*.test.ts`의 import를 훑어 확인).

`describe("아이콘 테이블 짝 맞추기")`의 첫 `it`은 그대로 두되(`FACILITY_ICON`의 키마다 `FACILITY_ICON_SVG`가 같은 아이콘), 키 수가 같은지도
본다: 그 `it` 끝에 `expect(Object.keys(FACILITY_ICON).sort()).toEqual(Object.keys(FACILITY_ICON_SVG).sort());`.

- [ ] **Step 7: 코드 매핑을 지운다**

- `src/types/domain.ts`: `FacilityCode` 타입과 그 위 주석을 지운다.
- `src/lib/theme.ts`: `facilityColor`를 지운다.
- `src/components/map/facilityColors.ts`: 파일을 지운다(`git rm`).
- `src/lib/facilityColors.test.ts`: 파일을 지운다(`git rm`). 그 안의 캠퍼스 색 대비 검사는 `src/lib/theme.test.ts`로 옮긴다:

```ts
import { describe, expect, it } from "vitest";
import { campusColor } from "@/lib/theme";

function contrastWithWhite(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 1.05 / (0.2126 * r + 0.7152 * g + 0.0722 * b + 0.05);
}

// 선택된 필터 칩은 이 색으로 채우고 흰 글자를 얹는다(2026-10-16-square-corners-design.md). 시설 종류 색은 facilityStyleCatalog.test.ts
describe("캠퍼스 칩 채움색", () => {
  it("흰 글자와 대비가 4.5:1 이상이다", () => {
    for (const hex of Object.values(campusColor))
      expect(contrastWithWhite(hex), hex).toBeGreaterThanOrEqual(4.5);
  });
});
```

`getFacilityMarkerColor`·`getFacilityColor`·`facilityIconSvg`를 부르는 화면 코드는 Task 4가 바꾼다. 이 단계 뒤 커밋까지는 타입 검사가
깨진 상태라 푸시하지 않는다(푸시 B는 Task 4까지 묶는다).

- [ ] **Step 8: 서식과 커밋**

```bash
npx --yes prettier@3.9.4 --write src/lib/facilityStyleCatalog.ts src/lib/facilityTypesStore.ts src/lib/mapIcons.ts src/lib/mapIcons.test.ts src/components/map/iconography.tsx src/components/map/iconography.test.ts src/types/domain.ts src/lib/theme.ts src/lib/theme.test.ts
git rm -q src/components/map/facilityColors.ts src/lib/facilityColors.test.ts
git add src/lib/facilityStyleCatalog.ts src/lib/facilityTypesStore.ts src/lib/mapIcons.ts src/lib/mapIcons.test.ts src/components/map/iconography.tsx src/components/map/iconography.test.ts src/types/domain.ts src/lib/theme.ts src/lib/theme.test.ts
git commit -m "feat: 시설 종류 아이콘·색 카탈로그와 공용 종류 저장소를 두고 코드 매핑을 지운다"
```

---

### Task 3: `icon`·`color` 칸 마이그레이션

**Files:**

- Create: `supabase/migrations/20261026010000_add_facility_type_icon_color.sql`
- Modify: `supabase/database.types.ts`(`facility_types`), `src/lib/activityLabels.ts`(`COLUMN_LABELS`)
- Test: `supabase/tests/facility_type_style.test.sql`

**Interfaces:**

- Consumes: 없음
- Produces: `facility_types.icon text not null`, `facility_types.color text not null`. 타입 `FacilityType`에 `icon: string; color: string`.

- [ ] **Step 1: pgTAP 테스트를 쓴다**

```sql
-- 설계: docs/specs/2026-10-26-facility-type-management-design.md 1.1·1.2
-- 빈 DB에도 멘토링 ② 마이그레이션이 넣은 restroom·student_lounge가 있다.
begin;
select plan(7);

select is(
  (select (icon, color) from public.facility_types where code = 'restroom'),
  ('toilet'::text, '#2F7A4F'::text),
  '화장실은 지금 코드와 같은 아이콘·색을 받는다');

select is(
  (select (icon, color) from public.facility_types where code = 'student_lounge'),
  ('sofa'::text, '#0F766E'::text),
  '장애학생 휴게실은 소파·청록을 받는다');

insert into public.facility_types (code, label) values ('test_style', '시험 종류');
select is(
  (select (icon, color) from public.facility_types where code = 'test_style'),
  ('accessibility'::text, '#666666'::text),
  '아이콘·색 없이 넣은 종류는 대체값을 받는다');

select throws_ok(
  $$insert into public.facility_types (code, label, color) values ('bad_name', '나쁨', 'red')$$,
  '23514', null, '색 이름은 거부한다');
select throws_ok(
  $$insert into public.facility_types (code, label, color) values ('bad_short', '나쁨', '#fff')$$,
  '23514', null, '세 자리 색은 거부한다');
select throws_ok(
  $$insert into public.facility_types (code, label, color) values ('bad_lower', '나쁨', '#0f766e')$$,
  '23514', null, '소문자 색은 거부한다');

select col_not_null('public', 'facility_types', 'icon', '아이콘 칸은 비지 않는다');

select * from finish();
rollback;
```

- [ ] **Step 2: 테스트를 커밋한다**

```bash
rg -n "\x{FFFD}" supabase/tests/facility_type_style.test.sql
git add supabase/tests/facility_type_style.test.sql
git commit -m "test(db): 시설 종류 아이콘·색 칸과 채우기를 시험한다"
```

Expected(푸시 A CI): `DB test`는 새 파일만 실패(`icon` 칸이 없다). 기존 다섯 파일은 통과.

- [ ] **Step 3: 마이그레이션을 쓴다**

```sql
-- 설계: docs/specs/2026-10-26-facility-type-management-design.md 1.1·1.2
-- 아이콘 키는 목록을 코드(facilityStyleCatalog.ts)에 두어 DB가 검사하지 않는다. 모르는 키는 화면이 대체 아이콘으로 그린다.
alter table public.facility_types
  add column icon text not null default 'accessibility',
  add column color text not null default '#666666',
  add constraint facility_types_color_check check (color ~ '^#[0-9A-F]{6}$');

-- 화면이 바뀌지 않게 2026-10-26 코드 매핑(mapIcons.ts·theme.ts) 값 그대로 옮긴다. 아이콘·색이 정해진 기록은 남긴다.
update public.facility_types as ft
set icon = style.icon, color = style.color
from (values
  ('restroom', 'toilet', '#2F7A4F'),
  ('ramp', 'trending-up', '#B25617'),
  ('parking', 'square-parking', '#6D4AB0'),
  ('elevator', 'elevator', '#2D5FB0'),
  ('student_lounge', 'sofa', '#0F766E'),
  ('braille', 'grip-vertical', '#8A6A00')
) as style (code, icon, color)
where ft.code = style.code;
```

- [ ] **Step 4: 타입과 기록 이름표**

`supabase/database.types.ts`의 `facility_types`: `Row`에 `color: string;`(`code` 다음)·`icon: string;`(`code` 다음 `color` 다음 — 칸 이름
사전 순: `code`, `color`, `icon`, `label`, …), `Insert`·`Update`에 `color?: string;`·`icon?: string;` 같은 자리.

`src/lib/activityLabels.ts`의 `COLUMN_LABELS`에 `["color", "색"],`을 `["icon", "아이콘"],` 다음 줄에 더한다.

- [ ] **Step 5: 커밋**

```bash
npx --yes prettier@3.9.4 --write supabase/database.types.ts src/lib/activityLabels.ts
rg -n "\x{FFFD}" supabase/migrations/20261026010000_add_facility_type_icon_color.sql supabase/database.types.ts src/lib/activityLabels.ts
git add supabase/migrations/20261026010000_add_facility_type_icon_color.sql supabase/database.types.ts src/lib/activityLabels.ts
git commit -m "feat(db): 시설 종류에 아이콘·색 칸을 두고 지금 코드 값으로 채운다"
```

---

### Task 4: 화면이 저장소로 그리게 한다

**Files:**

- Modify: `src/components/map/useMapData.ts`, `src/components/map/FilterPanel.tsx`, `src/components/map/FacilityMarkers.tsx`,
  `src/components/sidepanel/FacilityRequestModal.tsx`, `src/app/admin/buildings/[id]/page.tsx`,
  `src/app/admin/dashboard/facilities/page.tsx`, `src/app/admin/dashboard/inbox/page.tsx`,
  `src/components/admin/facilities/FacilityWorkspaceMap.tsx`, `src/components/admin/facilities/FacilityListRow.tsx`,
  `src/components/admin/facilities/FacilityDetailPanel.tsx`, `src/components/admin/inbox/FacilityRequestDrawer.tsx`
- Modify: `e2e/support/mockBackend.ts`(종류 픽스처)
- Create: `e2e/facility-type-style.spec.ts`

**Interfaces:**

- Consumes: Task 2의 `useFacilityTypes`·`useFacilityStyle`·`reloadFacilityTypes`·`facilityStyleOf`·`facilityIconSvg`·
  `FALLBACK_FACILITY_STYLE`·`FacilityStyle`, Task 3의 `FacilityType.icon`·`color`
- Produces: 없음

- [ ] **Step 1: E2E 테스트를 쓴다** — `e2e/facility-type-style.spec.ts`

```ts
import { expect, test, type Page } from "@playwright/test";
import { installMockBackend } from "./support/mockBackend";

// 설계: docs/specs/2026-10-26-facility-type-management-design.md 2장 — 아이콘·색은 코드가 아니라 종류 행에서 온다.
// route.fetch()는 목 백엔드의 전역 라우트를 거치지 않고 실제 주소로 나가므로, 목 픽스처와 같은 행을 직접 돌려준다.
const MOCK_TYPES = [
  {
    code: "elevator",
    label: "엘리베이터",
    label_en: "Elevator",
    label_zh: "电梯",
    icon: "elevator",
    color: "#2D5FB0",
  },
  {
    code: "ramp",
    label: "경사로",
    label_en: "Ramp",
    label_zh: "坡道",
    icon: "trending-up",
    color: "#B25617",
  },
  {
    code: "parking",
    label: "장애인 주차",
    label_en: "Accessible parking",
    label_zh: "无障碍停车",
    icon: "square-parking",
    color: "#6D4AB0",
  },
];

async function serveTypes(page: Page, rows: Record<string, unknown>[]) {
  await page.route(
    (url) => url.pathname.endsWith("/rest/v1/facility_types"),
    (route) =>
      route.request().method() !== "GET"
        ? route.fallback()
        : route.fulfill({
            status: 200,
            headers: { "access-control-allow-origin": "*" },
            contentType: "application/json",
            body: JSON.stringify(rows),
          }),
  );
}

// 경사로 행의 아이콘·색을 바꿔 돌려주면 코드 매핑(trending-up·주황)이 아니라 그 값으로 그려야 한다
async function serveRampAsLounge(page: Page) {
  await serveTypes(
    page,
    MOCK_TYPES.map((row) =>
      row.code === "ramp" ? { ...row, icon: "sofa", color: "#0F766E" } : row,
    ),
  );
}

test("공개 지도는 종류 행의 아이콘·색으로 필터 칩과 마커를 그린다", async ({
  page,
}) => {
  await installMockBackend(page);
  await serveRampAsLounge(page);
  await page.goto("/");
  await page.getByRole("button", { name: "시설", exact: true }).click();
  const chip = page.getByRole("button", { name: /경사로/ });
  await expect(chip.locator("svg.lucide-sofa")).toHaveCount(1);
  await expect(chip).toHaveAttribute("style", /--chip-color:\s*#0F766E/i);

  await chip.click();
  const marker = page.locator(
    '[data-testid^="facility-marker-"]:not([data-testid$="cluster"])',
  );
  await expect(marker.locator("svg.lucide-sofa")).toHaveCount(1);
  await expect(marker).toHaveCSS("background-color", "rgb(15, 118, 110)");
});

test("코드가 모르는 종류도 종류 행의 아이콘·색으로 칩과 마커를 그린다", async ({
  page,
}) => {
  const state = await installMockBackend(page);
  const base = state.facilities.find(
    (facility) => facility.id === "f-installed",
  )!;
  state.facilities.push({
    ...base,
    id: "f-lounge",
    name: "학생 휴게실",
    facility_code: "type_lounge01",
    lat: Number(base.lat) + 0.0004,
    facility_types: {
      code: "type_lounge01",
      label: "휴게실",
      label_en: "Lounge",
      label_zh: "休息室",
    },
  });
  await serveTypes(page, [
    ...MOCK_TYPES,
    {
      code: "type_lounge01",
      label: "휴게실",
      label_en: "Lounge",
      label_zh: "休息室",
      icon: "sofa",
      color: "#0F766E",
    },
  ]);
  await page.goto("/");
  await page.getByRole("button", { name: "시설", exact: true }).click();
  const chip = page.getByRole("button", { name: /휴게실/ });
  await expect(chip.locator("svg.lucide-sofa")).toHaveCount(1);
  await expect(chip).toHaveAttribute("style", /--chip-color:\s*#0F766E/i);

  await chip.click();
  const marker = page.locator(
    '[data-testid^="facility-marker-"]:not([data-testid$="cluster"])',
  );
  await expect(marker.locator("svg.lucide-sofa")).toHaveCount(1);
  await expect(marker).toHaveCSS("background-color", "rgb(15, 118, 110)");
});

test("관리자 독립 시설 목록은 종류 행의 아이콘·색으로 그린다", async ({
  page,
}) => {
  await installMockBackend(page, { authenticated: true });
  await serveRampAsLounge(page);
  await page.goto("/admin/dashboard/facilities");
  const row = page
    .getByRole("region", { name: "독립 시설", exact: true })
    .getByRole("button", { name: /중앙광장 경사로/ });
  await expect(row.locator("svg.lucide-sofa")).toHaveCount(1);
  await expect(row.locator(".ku-workspace-row-icon")).toHaveCSS(
    "background-color",
    "rgb(15, 118, 110)",
  );
});
```

- [ ] **Step 2: 테스트를 커밋하고 푸시 A를 한다**

```bash
npx --yes prettier@3.9.4 --write e2e/facility-type-style.spec.ts
git add e2e/facility-type-style.spec.ts
git commit -m "test(e2e): 공개 지도와 관리자 목록이 종류 행의 아이콘·색으로 그리는지 시험한다"
git push -u origin feat/facility-type-style-db
gh pr create --draft --title "feat: 시설 종류 아이콘·색을 DB에 두고 공용 저장소로 그린다" --body-file <PR 본문 파일>
```

PR 본문: 설계 1·2장 요약, "이 계획이 정한 것", 화면 변화(자동문 칩 회색, 관리자 아이콘 자리 잠깐 비움), 배포 사이(설계 2.4), 병합 뒤 확인.
끝에 `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.

Expected(CI): `Typecheck`·`Test (unit)`은 새 모듈(`facilityStyleCatalog`·`facilityTypesStore`)이 없어 실패. `DB test`는 새 파일만 실패.
Playwright는 새 세 테스트만 실패(경사로 둘은 `svg.lucide-trending-up`과 주황 — 지금 코드 매핑, 모르는 종류는 휠체어와 대체 팔레트 색). `Lint`·`Format`·`Migration safety`는
초록. 그 밖의 실패는 멈추고 본다.

- [ ] **Step 3: 목 백엔드 종류 픽스처에 아이콘·색**

`e2e/support/mockBackend.ts`의 `types` 세 행에 지금 코드 매핑과 같은 값을 더한다(Review Focus 5): `elevator` → `icon: "elevator",
color: "#2D5FB0"`, `ramp` → `icon: "trending-up", color: "#B25617"`, `parking` → `icon: "square-parking", color: "#6D4AB0"`.

- [ ] **Step 4: 공개 지도**

`src/components/map/useMapData.ts`:

- import에 `import { reloadFacilityTypes, useFacilityTypes } from "@/lib/facilityTypesStore";`. `FacilityType` import는 쓰는 곳이 없어지면
  지운다.
- `facilityTypes` 상태(`useState<Pick<FacilityType, …>[]>`), `facilityTypesStatus` 상태, `loadFacilityTypes` 함수를 지운다.
- 함수 몸통 앞쪽에 `const facilityTypesSnapshot = useFacilityTypes();`
- `useEffect` 안의 `loadFacilityTypes();`와 의존성 배열의 `loadFacilityTypes`를 지운다.
- `statuses.facilityTypes: facilityTypesSnapshot.status`, `retry.facilityTypes: reloadFacilityTypes`.
- 반환의 `facilityTypes,` → `facilityTypes: facilityTypesSnapshot.types,`.
- `setActiveTypes`로 모든 코드를 `false`로 채우던 줄은 함께 사라진다("이 계획이 정한 것" 4).

`src/components/map/FilterPanel.tsx`:

- `import { getFacilityColor } from "./facilityColors";` → `import { facilityStyleOf } from "@/lib/facilityStyleCatalog";`
- `FilterFacilityType`의 `Pick` 키에 `"icon" | "color"`를 더한다. 그 위 주석 "useMapData가 select하는 열만 온다"는 "종류 저장소의 행"으로
  고친다.
- `facilityTypes.map((item, index) => {` → `facilityTypes.map((item) => {`, `getFacilityColor(item.code, index)` →
  `facilityStyleOf(facilityTypes, item.code).color`.

`src/components/map/FacilityMarkers.tsx`:

- import: `facilityIconSvg`를 `@/lib/mapIcons`에서 빼고 `import { facilityIconSvg, facilityStyleOf, type FacilityStyle } from
"@/lib/facilityStyleCatalog";`, `import { useFacilityTypes } from "@/lib/facilityTypesStore";`. `getFacilityMarkerColor` import 줄을 지운다.
- `facilityMarkerIcon`:

```ts
const facilityMarkerIcon = (style: FacilityStyle, id: string) =>
  // 키에 아이콘·색이 없으면 종류를 받기 전에 만든 대체 아이콘이 이 키로 남는다
  cachedIcon(`facility|${style.icon}|${style.color}|${id}`, () =>
    L.divIcon({
      className: "",
      html: `<div data-testid="facility-marker-${id}" style="width:34px;height:34px;background:${style.color};border:2px solid white;border-radius:50% 50% 50% 4px;display:flex;align-items:center;justify-content:center;color:#fff;box-shadow:0 2px 7px rgba(28,25,23,0.28);transform:rotate(-45deg);"><span aria-hidden="true" style="display:flex;transform:rotate(45deg)">${facilityIconSvg(style.icon, 17)}</span></div>`,
      iconAnchor: [17, 30],
      popupAnchor: [0, -30],
    }),
  );
```

- 컴포넌트 몸통 `const map = useMap();` 다음에 `const { types } = useFacilityTypes();`, 마커의
  `icon={facilityMarkerIcon(f.facility_types?.code ?? "", f.id)}` → `icon={facilityMarkerIcon(facilityStyleOf(types, f.facility_types?.code), f.id)}`.

`src/components/sidepanel/FacilityRequestModal.tsx`:

- `types`·`typesFailed` 상태와 종류를 읽는 `useEffect`를 지운다.
- import `useFacilityTypes`, 몸통에서 `const facilityTypesSnapshot = useFacilityTypes();`.
- `const types = facilityTypesSnapshot.types.map((type) => ({ code: type.code, label: (lang === "en" ? type.label_en : lang === "zh" ?
type.label_zh : type.label) ?? type.label ?? type.code }));`(지운 `useEffect` 안의 매핑 그대로).
- `const typesFailed = facilityTypesSnapshot.status === "error" && !facilityTypesSnapshot.loaded;`
- 지운 상태를 쓰던 곳(`facilityTypes={types}`, `typesFailed && !errorKey`)은 이름이 같아 그대로 둔다. `useState`·`supabase` import가 더
  쓰이지 않으면 지운다.

- [ ] **Step 5: 관리자 화면**

`src/app/admin/buildings/[id]/page.tsx`: `Promise.all`의 `facility_types` 조회와 `{ data: typesData }` 자리를 지우고, `facilityTypes`
상태와 `setFacilityTypes(typesData ?? [])`를 지운다. 몸통에 `const { types: facilityTypes } = useFacilityTypes();`. 아래에서
`facilityTypes`를 props로 넘기는 곳은 이름이 같아 그대로다.

`src/app/admin/dashboard/facilities/page.tsx`:

- `facilityTypes`·`typesFailed` 상태, `loadTypes`, 그것을 부르는 `useEffect`를 지운다. import `getFacilityMarkerColor` 줄을 지운다.
- 몸통에 `const facilityTypesSnapshot = useFacilityTypes(); const facilityTypes = facilityTypesSnapshot.types; const typesFailed =
facilityTypesSnapshot.status === "error";`
- `retry()`의 `setTypesFailed(false); void loadTypes();` → `reloadFacilityTypes();`.
- 범례 `color: getFacilityMarkerColor(type.code)` → `color: facilityStyleOf(facilityTypes, type.code).color`.

`src/app/admin/dashboard/inbox/page.tsx`: `types` 상태와 종류를 읽는 `useEffect`를 지우고 `const { types } = useFacilityTypes();`.
`typeLabels`의 `new Map(types.map(…))`는 그대로다.

지운 상태 때문에 안 쓰이게 되는 import를 지운다(Lint `no-unused-vars`가 잡는다): 건물 상세의 `FacilityType`(타입 import 목록에서),
독립 시설 탭의 `useEffect`(다른 effect가 없으면 — 지우기 전에 `rg -n "useEffect" src/app/admin/dashboard/facilities/page.tsx`로 센다)와
`FacilityType`, 제보함의 `supabase`(다른 곳에서 쓰지 않으면 — 같은 방식으로 센다). 등록 요청 모달·`useMapData`도 같은 방식으로 본다.

`src/components/admin/facilities/FacilityWorkspaceMap.tsx`:

- import: `getFacilityMarkerColor`, `facilityIconSvg`(`@/lib/mapIcons`) 줄을 지우고 `import { FALLBACK_FACILITY_STYLE, facilityIconSvg,
facilityStyleOf, type FacilityStyle } from "@/lib/facilityStyleCatalog";`, `import { useFacilityTypes } from "@/lib/facilityTypesStore";`.
- `markerIcon(id, code, fill, selected)` → `markerIcon(id: string, style: FacilityStyle, selected: boolean)`, 키
  `` `${id}|${style.icon}|${style.color}|${selected}` ``, HTML의 `background:${fill}` → `background:${style.color}`,
  `facilityIconSvg(code, …)` → `facilityIconSvg(style.icon, selected ? 15 : 12)`.
- 몸통에 `const { types } = useFacilityTypes();`. 부르는 곳: `markerIcon(facility.id, facilityStyleOf(types, facility.facility_code), false)`,
  `markerIcon(selected.id, facilityStyleOf(types, pinCode), true)`, 새 핀은
  `markerIcon("new", { icon: FALLBACK_FACILITY_STYLE.icon, color: "var(--ku-primary)" }, true)`.

`src/components/admin/facilities/FacilityListRow.tsx`: `getFacilityMarkerColor` import → `import { useFacilityStyle } from
"@/lib/facilityTypesStore";`, `const code = …` 다음 줄에 `const style = useFacilityStyle(code);`, `background:
getFacilityMarkerColor(code ?? "")` → `background: style.color`.

`src/components/admin/facilities/FacilityDetailPanel.tsx`: 같은 방식 — `const code = …` 다음에 `const typeStyle = useFacilityStyle(code);`,
`getFacilityMarkerColor(code ?? "")` → `typeStyle.color`.

`src/components/admin/inbox/FacilityRequestDrawer.tsx`: `const typeLabel = …` 앞에
`const typeStyle = useFacilityStyle(detail?.facility_code);`, `getFacilityMarkerColor(detail?.facility_code ?? "")` → `typeStyle.color`.

훅을 넣는 세 컴포넌트는 그 자리보다 앞에 최상위 조기 반환이 없다(2026-10-26 확인 — `return`은 모두 안쪽 함수·effect 안이다).

- [ ] **Step 6: 참조 역추적**

```bash
rg -n "FacilityCode|facilityColor\b|FALLBACK_PALETTE|getFacilityColor|getFacilityMarkerColor|facilityIconKey|FACILITY_ICON_KEY|facilityColors" src e2e docs
rg -n 'from\("facility_types"\)' src
rg -n "invalidateFacilityTypes" src docs
```

결과가 (a) 이 PR에서 고침, (b) 날짜가 붙은 당시 기록(멘토링 설계 4장, 2026-08-13 설계 본문, 설계 1.4 "지우는 것"), (c) 등록 요청 API 두
곳의 한 행 확인 중 하나여야 한다. `from("facility_types")`는 저장소 하나와 API 두 곳만 남아야 한다. 명령과 출력을 보고에 남긴다.

- [ ] **Step 7: 서식, 커밋, 푸시 B**

```bash
npx --yes prettier@3.9.4 --write e2e/support/mockBackend.ts src/components/map/useMapData.ts src/components/map/FilterPanel.tsx src/components/map/FacilityMarkers.tsx src/components/sidepanel/FacilityRequestModal.tsx "src/app/admin/buildings/[id]/page.tsx" src/app/admin/dashboard/facilities/page.tsx src/app/admin/dashboard/inbox/page.tsx src/components/admin/facilities/FacilityWorkspaceMap.tsx src/components/admin/facilities/FacilityListRow.tsx src/components/admin/facilities/FacilityDetailPanel.tsx src/components/admin/inbox/FacilityRequestDrawer.tsx
git add e2e/support/mockBackend.ts src/components/map/useMapData.ts src/components/map/FilterPanel.tsx src/components/map/FacilityMarkers.tsx src/components/sidepanel/FacilityRequestModal.tsx "src/app/admin/buildings/[id]/page.tsx" src/app/admin/dashboard/facilities/page.tsx src/app/admin/dashboard/inbox/page.tsx src/components/admin/facilities/FacilityWorkspaceMap.tsx src/components/admin/facilities/FacilityListRow.tsx src/components/admin/facilities/FacilityDetailPanel.tsx src/components/admin/inbox/FacilityRequestDrawer.tsx
git commit -m "feat: 화면들이 시설 종류 저장소의 아이콘·색으로 그린다"
git push
gh pr checks --watch
```

Expected: 모든 잡 초록. 초록이면 사용자에게 알리고, ready·병합은 묻는다. 병합 직전에 이 계획 문서를 `git rm`하는 커밋을 더한다
(`docs: 구현을 마친 시설 종류 PR ②-2a 계획 문서를 지운다`).

---

## 병합 뒤 확인

1. `Apply Supabase migrations`가 `20261026010000`을 적용하고 `Verify migration history`가 통과했는지.
2. 방문자 키로 `facility_types?select=code,icon,color&order=sort_order` — 설계 1.2 표와 같고 `automatic_door`는 `accessibility`/`#666666`.
3. 사용자 확인: 공개 지도 필터 칩·마커·시설 목록의 아이콘·색이 전과 같은지(자동문 칩만 회색), 관리자 활동 기록에 "시설 종류 수정"이 종류
   다섯 줄(바뀐 칸 "아이콘"·"색")로 남았는지.
4. 멘토링 설계 "진행 상황"을 ②-2a 완료·다음 ②-2b로 고친다(②-2b의 첫 커밋).
