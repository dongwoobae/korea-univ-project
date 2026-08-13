# 공개 지도 lucide 아이콘 전환 + 데스크톱 라벨 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 공개 지도 페이지(`/`)의 모든 이모지 아이콘을 lucide 아이콘으로 바꾸고, 데스크톱 플로팅 버튼 3개에 보이는 텍스트 라벨을 단다.

**Architecture:** `src/lib/mapIcons.ts`가 `시설 코드 → 아이콘 자리` 매핑의 단일 출처다. Leaflet `divIcon`은 HTML 문자열을 요구하므로 여기서 `lucide-static`의 SVG 문자열을 제공하고, JSX 쪽은 `src/components/map/iconography.tsx`가 같은 키 union으로 `lucide-react` 컴포넌트를 매핑한다. 두 테이블이 같은 `FacilityIconKey` union을 키로 쓰므로 한쪽만 고치면 타입 오류가 난다.

**Tech Stack:** Next.js 16 / React 19 / TypeScript / react-leaflet 5 / lucide-react 1.31 / lucide-static 1.31 / vitest (node env) / Playwright

**설계 문서:** `docs/superpowers/specs/2026-08-13-public-map-lucide-icons-design.md`

---

## 사전 확인 사항 (조사로 확정된 사실)

- lucide 1.31.0에 아래 이름이 모두 존재함을 검증했다: `LocateFixed` `Satellite` `Map` `MessageSquare` `Plus` `Minus` `Search` `X` `Mic` `Star` `Volume2` `List` `Mountain` `Sparkles` `ChevronUp` `ChevronDown` `TriangleAlert` `ChevronLeft` `ChevronRight` `TrainFront` `Accessibility` `ArrowUpDown` `Toilet` `TrendingUp` `SquareParking` `GripVertical` `CircleCheck` `CircleX`.
- `lucide-static`의 각 export는 SVG **문자열**이며 `stroke="currentColor"` `width="24"` `height="24"`를 갖는다. 색은 부모의 `color`를 상속하고, 크기는 `sizedIconSvg()`가 두 속성을 치환해 정한다.
- `braille`은 `facility_types` 테이블에 아직 행이 없지만 `FacilityCode` union에는 있다. 매핑은 미리 넣어 둔다.
- lucide에 elevator·ramp·braille 전용 아이콘이 없어 은유로 대체한다(`ArrowUpDown` / `TrendingUp` / `GripVertical`). `GripVertical`은 2×3 원 배열이라 점자 셀 형상과 일치한다.
- `/api/facilities`는 공개 지도만 쓴다(관리자는 별도 쿼리). 여기서 `icon`을 빼도 관리자 화면은 영향받지 않는다.
- **범위 밖:** `SlopeLegend`의 `▶`(타이포그래피 불릿), `PhotoCarousel`의 점 인디케이터(도형), 관리자 페이지 전체.

## 파일 구조

| 파일                                           | 책임                                                        | 상태 |
| ---------------------------------------------- | ----------------------------------------------------------- | ---- |
| `src/lib/mapIcons.ts`                          | 시설 코드 → 아이콘 키 매핑, divIcon용 SVG 문자열, 크기 치환 | 생성 |
| `src/lib/mapIcons.test.ts`                     | 위 모듈의 단위 테스트                                       | 생성 |
| `src/components/map/iconography.tsx`           | JSX용 `FacilityTypeIcon` (lucide-react)                     | 생성 |
| `src/components/map/FacilityMarkers.tsx`       | 시설 마커·클러스터 divIcon                                  | 수정 |
| `src/components/map/SubwayMarkers.tsx`         | 지하철 마커 divIcon                                         | 수정 |
| `src/components/map/LandmarkMarkers.tsx`       | 명소 마커·클러스터·팝업                                     | 수정 |
| `src/components/map/Map.tsx`                   | 액션 버튼 3종 + 줌, `browseItems` 데이터 흐름               | 수정 |
| `src/components/map/FeedbackButton.tsx`        | 피드백 버튼·모달 닫기                                       | 수정 |
| `src/components/map/SearchControl.tsx`         | 검색·음성·즐겨찾기·명소 결과                                | 수정 |
| `src/components/map/FilterPanel.tsx`           | 시설 칩·토글·섹션 셰브런                                    | 수정 |
| `src/components/map/MapBrowseList.tsx`         | 목록 트리거·닫기·항목 아이콘                                | 수정 |
| `src/components/map/FavoritesList.tsx`         | 즐겨찾기 행 별                                              | 수정 |
| `src/components/map/MapErrorBanner.tsx`        | 오류 경고 아이콘                                            | 수정 |
| `src/components/map/map-ui.css`                | 라벨 버튼 레이아웃, 아이콘 정렬                             | 수정 |
| `src/components/sidepanel/SidePanelHeader.tsx` | 닫기·음성·즐겨찾기                                          | 수정 |
| `src/components/sidepanel/PhotoCarousel.tsx`   | 이전·다음 화살표                                            | 수정 |
| `src/components/sidepanel/FacilityList.tsx`    | 시설 행 아이콘                                              | 수정 |
| `src/components/Toast.tsx`                     | 상태 아이콘·닫기 (관리자와 공용)                            | 수정 |
| `src/lib/translations.ts`                      | 타일 전환 라벨 키 4종                                       | 수정 |
| `src/components/map/useMapData.ts`             | `facility_types` select에서 `icon` 제거                     | 수정 |
| `src/app/api/facilities/route.ts`              | 조인 select에서 `icon` 제거                                 | 수정 |
| `e2e/public-map.spec.ts` 외                    | 이모지 의존 셀렉터 갱신                                     | 수정 |

---

### Task 1: 의존성 설치와 아이콘 매핑 모듈

**Files:**

- Modify: `package.json` (npm이 갱신)
- Create: `src/lib/mapIcons.ts`
- Create: `src/components/map/iconography.tsx`
- Test: `src/lib/mapIcons.test.ts`

- [ ] **Step 1: 의존성 설치**

```bash
npm install lucide-react@^1.31.0 lucide-static@^1.31.0
```

- [ ] **Step 2: 실패하는 테스트 작성**

`src/lib/mapIcons.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  FACILITY_CLUSTER_ICON_SVG,
  LANDMARK_ICON_SVG,
  SUBWAY_ICON_SVG,
  facilityIconKey,
  facilityIconSvg,
  sizedIconSvg,
} from "./mapIcons";

describe("facilityIconKey", () => {
  it("알려진 시설 코드는 전용 키로 간다", () => {
    expect(facilityIconKey("elevator")).toBe("elevator");
    expect(facilityIconKey("restroom")).toBe("restroom");
    expect(facilityIconKey("ramp")).toBe("ramp");
    expect(facilityIconKey("parking")).toBe("parking");
    expect(facilityIconKey("braille")).toBe("braille");
  });

  it("모르는 코드와 빈 값은 fallback으로 간다", () => {
    expect(facilityIconKey("unknown_code")).toBe("fallback");
    expect(facilityIconKey("")).toBe("fallback");
    expect(facilityIconKey(null)).toBe("fallback");
    expect(facilityIconKey(undefined)).toBe("fallback");
  });
});

describe("facilityIconSvg", () => {
  it("코드마다 서로 다른 lucide 아이콘을 준다", () => {
    expect(facilityIconSvg("elevator", 17)).toContain("lucide-arrow-up-down");
    expect(facilityIconSvg("restroom", 17)).toContain("lucide-toilet");
    expect(facilityIconSvg("ramp", 17)).toContain("lucide-trending-up");
    expect(facilityIconSvg("parking", 17)).toContain("lucide-square-parking");
    expect(facilityIconSvg("braille", 17)).toContain("lucide-grip-vertical");
    expect(facilityIconSvg("unknown_code", 17)).toContain(
      "lucide-accessibility",
    );
  });

  it("요청한 크기를 SVG 속성에 반영한다", () => {
    const svg = facilityIconSvg("ramp", 17);
    expect(svg).toContain('width="17"');
    expect(svg).toContain('height="17"');
    expect(svg).not.toContain('width="24"');
  });

  it("색은 부모에서 상속받도록 currentColor를 유지한다", () => {
    expect(facilityIconSvg("ramp", 17)).toContain('stroke="currentColor"');
  });
});

describe("sizedIconSvg", () => {
  it("width·height만 바꾸고 stroke-width는 건드리지 않는다", () => {
    const out = sizedIconSvg(LANDMARK_ICON_SVG, 15);
    expect(out).toContain('width="15"');
    expect(out).toContain('height="15"');
    expect(out).toContain('stroke-width="2"');
  });
});

describe("마커 전용 아이콘", () => {
  it("명소·지하철·시설 클러스터 아이콘을 노출한다", () => {
    expect(LANDMARK_ICON_SVG).toContain("lucide-sparkles");
    expect(SUBWAY_ICON_SVG).toContain("lucide-train-front");
    expect(FACILITY_CLUSTER_ICON_SVG).toContain("lucide-accessibility");
  });
});
```

- [ ] **Step 3: 테스트를 돌려 실패를 확인**

Run: `npm test -- src/lib/mapIcons.test.ts`
Expected: FAIL — `Failed to resolve import "./mapIcons"`

- [ ] **Step 4: 매핑 모듈 구현**

`src/lib/mapIcons.ts`:

```ts
import {
  Accessibility,
  ArrowUpDown,
  GripVertical,
  Sparkles,
  SquareParking,
  Toilet,
  TrainFront,
  TrendingUp,
} from "lucide-static";

/**
 * 시설 유형 코드가 매핑되는 아이콘 자리.
 * lucide에 elevator·ramp·braille 전용 아이콘이 없어 은유로 대체한다.
 */
export type FacilityIconKey =
  "elevator" | "restroom" | "ramp" | "parking" | "braille" | "fallback";

const FACILITY_ICON_KEY: Record<string, FacilityIconKey> = {
  elevator: "elevator",
  restroom: "restroom",
  ramp: "ramp",
  parking: "parking",
  braille: "braille",
};

export function facilityIconKey(
  code: string | null | undefined,
): FacilityIconKey {
  return FACILITY_ICON_KEY[code ?? ""] ?? "fallback";
}

const FACILITY_ICON_SVG: Record<FacilityIconKey, string> = {
  elevator: ArrowUpDown,
  restroom: Toilet,
  ramp: TrendingUp,
  parking: SquareParking,
  braille: GripVertical,
  fallback: Accessibility,
};

export const LANDMARK_ICON_SVG = Sparkles;
export const SUBWAY_ICON_SVG = TrainFront;
export const FACILITY_CLUSTER_ICON_SVG = Accessibility;

/** lucide-static SVG는 24px 고정이라 자리 크기에 맞춰 덮어쓴다. */
export function sizedIconSvg(svg: string, size: number): string {
  return svg
    .replace('width="24"', `width="${size}"`)
    .replace('height="24"', `height="${size}"`);
}

export function facilityIconSvg(
  code: string | null | undefined,
  size: number,
): string {
  return sizedIconSvg(FACILITY_ICON_SVG[facilityIconKey(code)], size);
}
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `npm test -- src/lib/mapIcons.test.ts`
Expected: PASS — 6 tests

- [ ] **Step 6: JSX용 매핑 컴포넌트 작성**

`src/components/map/iconography.tsx`:

```tsx
"use client";

import {
  Accessibility,
  ArrowUpDown,
  GripVertical,
  SquareParking,
  Toilet,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import { facilityIconKey, type FacilityIconKey } from "@/lib/mapIcons";

// mapIcons.ts의 SVG 테이블과 같은 키 union을 써서 한쪽만 고치면 타입 오류가 난다.
const FACILITY_ICON: Record<FacilityIconKey, LucideIcon> = {
  elevator: ArrowUpDown,
  restroom: Toilet,
  ramp: TrendingUp,
  parking: SquareParking,
  braille: GripVertical,
  fallback: Accessibility,
};

interface FacilityTypeIconProps {
  code: string | null | undefined;
  size?: number;
}

export function FacilityTypeIcon({ code, size = 18 }: FacilityTypeIconProps) {
  const Icon = FACILITY_ICON[facilityIconKey(code)];
  return <Icon size={size} aria-hidden="true" />;
}
```

- [ ] **Step 7: 타입 검사와 포맷**

Run: `npm run typecheck && npx prettier --write src/lib/mapIcons.ts src/lib/mapIcons.test.ts src/components/map/iconography.tsx`
Expected: 타입 오류 없음

- [ ] **Step 8: 커밋**

```bash
git add package.json package-lock.json src/lib/mapIcons.ts src/lib/mapIcons.test.ts src/components/map/iconography.tsx
git commit -m "feat(map): lucide 아이콘 매핑 모듈을 만든다"
```

---

### Task 2: 시설 마커와 클러스터

**Files:**

- Modify: `src/components/map/FacilityMarkers.tsx:24-42`, `:117-121`

- [ ] **Step 1: 마커 아이콘 생성부를 lucide로 교체**

`src/components/map/FacilityMarkers.tsx` 상단 import에 추가:

```ts
import {
  FACILITY_CLUSTER_ICON_SVG,
  facilityIconSvg,
  sizedIconSvg,
} from "@/lib/mapIcons";
```

`facilityMarkerIcon`과 `facilityClusterIcon`을 교체한다. `icon: string` 인자가
사라지고 `code`만 남는다 — 아이콘이 코드에서 파생되므로 캐시 키도 좁아진다:

```ts
const facilityMarkerIcon = (code: string, id: string) =>
  cachedIcon(`facility|${code}|${id}`, () =>
    L.divIcon({
      className: "",
      html: `<div data-testid="facility-marker-${id}" style="width:34px;height:34px;background:${FACILITY_COLORS[code as keyof typeof FACILITY_COLORS] ?? "#666"};border:2px solid white;border-radius:50% 50% 50% 4px;display:flex;align-items:center;justify-content:center;color:#fff;box-shadow:0 2px 7px rgba(28,25,23,0.28);transform:rotate(-45deg);"><span style="display:flex;transform:rotate(45deg)">${facilityIconSvg(code, 17)}</span></div>`,
      iconAnchor: [17, 30],
      popupAnchor: [0, -30],
    }),
  );

const facilityClusterIcon = (count: number) =>
  cachedIcon(`cluster|${count}`, () =>
    L.divIcon({
      className: "",
      html: `<div class="ku-marker-cluster" data-testid="facility-marker-cluster"><span style="display:flex">${sizedIconSvg(FACILITY_CLUSTER_ICON_SVG, 16)}</span><strong>${count}</strong></div>`,
      iconSize: [42, 42],
      iconAnchor: [21, 21],
    }),
  );
```

- [ ] **Step 2: 호출부에서 icon 인자 제거**

`src/components/map/FacilityMarkers.tsx:117-121`의 `icon={...}` 를 교체:

```tsx
            icon={facilityMarkerIcon(f.facility_types?.code ?? "", f.id)}
```

- [ ] **Step 3: 타입 검사**

Run: `npm run typecheck`
Expected: 오류 없음

- [ ] **Step 4: 관련 e2e 확인**

Run: `npm run test:e2e -- e2e/public-map.spec.ts -g "시설 필터"`
Expected: PASS — 마커 단언은 `data-testid` 기반이라 영향 없음

- [ ] **Step 5: 커밋**

```bash
git add src/components/map/FacilityMarkers.tsx
git commit -m "feat(map): 시설 마커와 클러스터를 lucide 아이콘으로 바꾼다"
```

---

### Task 3: 지하철 마커

**Files:**

- Modify: `src/components/map/SubwayMarkers.tsx:13-26`

- [ ] **Step 1: import 추가**

`src/components/map/SubwayMarkers.tsx` 상단:

```ts
import { SUBWAY_ICON_SVG, sizedIconSvg } from "@/lib/mapIcons";
```

- [ ] **Step 2: divIcon HTML의 🚇를 교체**

`subwayIcon` 안의 `html` 문자열에서 원형 배지 부분을 바꾼다. `font-size:16px;font-weight:bold;`
는 이모지 크기 조절용이라 함께 지운다:

```ts
      html: `<div style="display:flex;flex-direction:column;align-items:center;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.35))"><div style="background:#B9282D;color:white;border:2.5px solid white;border-radius:50%;width:32px;height:32px;display:flex;align-items:center;justify-content:center;">${sizedIconSvg(SUBWAY_ICON_SVG, 17)}</div>${showLabel ? `<div data-testid="subway-label" style="background:#B9282D;color:white;border-radius:10px;padding:2px 7px;font-size:11px;font-weight:700;margin-top:3px;white-space:nowrap;border:1.5px solid white;">${name}</div>` : ""}</div>`,
```

- [ ] **Step 3: 타입 검사와 e2e**

Run: `npm run typecheck && npm run test:e2e -- e2e/public-map.spec.ts -g "줌"`
Expected: PASS — `subway-label` testid 유지

- [ ] **Step 4: 커밋**

```bash
git add src/components/map/SubwayMarkers.tsx
git commit -m "feat(map): 지하철 마커를 lucide 아이콘으로 바꾼다"
```

---

### Task 4: 명소 마커·클러스터·팝업

**Files:**

- Modify: `src/components/map/LandmarkMarkers.tsx:32-58`, `:134-147`
- Modify: `e2e/public-map.spec.ts:76-79`

- [ ] **Step 1: 이모지를 단언하는 e2e를 먼저 고쳐 실패를 만든다**

`e2e/public-map.spec.ts:76-79`의 아래 블록을

```ts
await expect(
  page.locator('[data-testid^="landmark-marker-"]').first(),
).toHaveText("🐿️");
```

다음으로 바꾼다:

```ts
await expect(
  page.locator('[data-testid^="landmark-marker-"] svg.lucide-sparkles'),
).toHaveCount(1);
```

- [ ] **Step 2: 테스트를 돌려 실패를 확인**

Run: `npm run test:e2e -- e2e/public-map.spec.ts -g "지도와 핵심 컨트롤"`
Expected: FAIL — `Expected: 1, Received: 0` (아직 이모지를 렌더링 중)

- [ ] **Step 3: 마커·클러스터 아이콘 교체**

`src/components/map/LandmarkMarkers.tsx` 상단 import에 추가:

```ts
import { LANDMARK_ICON_SVG, sizedIconSvg } from "@/lib/mapIcons";
```

`landmarkMarkerIcon`을 교체한다. 아이콘이 `landmark.icon`에서 오지 않으므로
캐시 키에서 빠지고, 아이콘 문자열 이스케이프도 필요 없어진다:

```ts
const landmarkMarkerIcon = (
  landmark: Landmark,
  name: string,
  showLabel: boolean,
) =>
  cachedIcon(`landmark|${landmark.id}|${name}|${showLabel}`, () =>
    L.divIcon({
      className: "",
      html: `<div style="display:flex;flex-direction:column;align-items:center;gap:3px;white-space:nowrap"><div data-testid="landmark-marker-${landmark.id}" style="width:30px;height:30px;background:white;border:2px solid #C08A2D;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#C08A2D;box-shadow:0 2px 7px rgba(28,25,23,0.22);">${sizedIconSvg(LANDMARK_ICON_SVG, 15)}</div>${showLabel ? `<span data-testid="landmark-label" style="padding:2px 5px;border-radius:999px;color:#7A5C16;background:rgba(255,255,255,.92);box-shadow:0 1px 3px rgba(28,25,23,.12);font:700 10.5px Pretendard,sans-serif">${escapeHtml(name)}</span>` : ""}</div>`,
      iconAnchor: [17, 17],
      popupAnchor: [0, -20],
    }),
  );
```

`landmarkClusterIcon`의 `<span aria-hidden="true">✨</span>`를 교체:

```ts
      html: `<div class="ku-marker-cluster ku-marker-cluster--landmark" data-testid="landmark-marker-cluster"><span style="display:flex">${sizedIconSvg(LANDMARK_ICON_SVG, 16)}</span><strong>${count}</strong></div>`,
```

- [ ] **Step 4: 팝업의 이모지를 교체**

`src/components/map/LandmarkMarkers.tsx:144-148`의 팝업 제목 줄을 바꾼다.
상단에 `import { Sparkles } from "lucide-react";`를 추가하고:

```tsx
<div
  style={{
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: 14,
    fontWeight: 700,
    color: "#222",
  }}
>
  <Sparkles size={15} aria-hidden="true" />
  {name}
</div>
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `npm run typecheck && npm run test:e2e -- e2e/public-map.spec.ts`
Expected: PASS — 전체 스펙 통과

- [ ] **Step 6: 커밋**

```bash
git add src/components/map/LandmarkMarkers.tsx e2e/public-map.spec.ts
git commit -m "feat(map): 명소 마커와 팝업을 lucide 아이콘으로 통일한다"
```

---

### Task 5: 지도 액션 버튼과 데스크톱 라벨

**Files:**

- Modify: `src/lib/translations.ts` (ko/en/zh 3블록)
- Modify: `src/components/map/Map.tsx:765-809`
- Modify: `src/components/map/map-ui.css:491-517`, `:1248-1252`
- Modify: `e2e/public-map.spec.ts:119`, `e2e/public-map-p1.spec.ts:30,62`

- [ ] **Step 1: 라벨을 단언하는 e2e를 먼저 고쳐 실패를 만든다**

`e2e/public-map.spec.ts:119`:

```ts
await page.getByRole("button", { name: "위성 지도로 전환" }).click();
```

`e2e/public-map-p1.spec.ts:30`과 `:62`의 두 줄:

```ts
await page.getByRole("button", { name: "현 위치" }).click();
```

`e2e/public-map.spec.ts`의 "지도와 핵심 컨트롤을 로드한다" 테스트에
`await expect(page.getByPlaceholder("건물 검색...")).toBeVisible();` 다음 줄로
데스크톱 라벨 단언을 추가한다:

```ts
await expect(page.getByRole("button", { name: "현 위치" })).toContainText(
  "현 위치",
);
await expect(
  page.getByRole("button", { name: "위성 지도로 전환" }),
).toContainText("위성");
```

- [ ] **Step 2: 테스트를 돌려 실패를 확인**

Run: `npm run test:e2e -- e2e/public-map-p1.spec.ts -g "P1-02"`
Expected: FAIL — `getByRole('button', { name: '현 위치' })` resolved to 0 elements

- [ ] **Step 3: 번역 키 추가**

`src/lib/translations.ts`의 `ko` 블록에서 `myLocationMarker` 다음 줄에 추가:

```ts
    tileSatellite: "위성",
    tileStreet: "지도",
    tileToSatellite: "위성 지도로 전환",
    tileToStreet: "지도로 전환",
```

`en` 블록의 같은 자리에:

```ts
    tileSatellite: "Satellite",
    tileStreet: "Map",
    tileToSatellite: "Switch to satellite",
    tileToStreet: "Switch to map",
```

`zh` 블록의 같은 자리에:

```ts
    tileSatellite: "卫星",
    tileStreet: "地图",
    tileToSatellite: "切换到卫星地图",
    tileToStreet: "切换到地图",
```

- [ ] **Step 4: Map.tsx의 액션 버튼 교체**

`src/components/map/Map.tsx` 상단 import에 추가:

```ts
import {
  LocateFixed,
  Map as MapIcon,
  Minus,
  Plus,
  Satellite,
} from "lucide-react";
```

`:765-809`의 줌·현위치·타일 버튼 블록 전체를 아래로 교체한다. 보이는 라벨과
접근 이름을 일치시키려고 현위치 `aria-label`을 `t("myLocation")`으로, 타일
전환은 방향을 담은 `tileTo*` 문구로 바꾼다:

```tsx
        <div className="ku-map-zoom" aria-label="지도 확대 및 축소">
          <button
            className="ku-map-action"
            type="button"
            onClick={() => mapRef.current?.zoomIn()}
            title="확대"
            aria-label="확대"
          >
            <Plus size={19} aria-hidden="true" />
          </button>
          <button
            className="ku-map-action"
            type="button"
            onClick={() => mapRef.current?.zoomOut()}
            title="축소"
            aria-label="축소"
          >
            <Minus size={19} aria-hidden="true" />
          </button>
        </div>
        <button
          className="ku-map-action ku-map-action--labeled"
          type="button"
          onClick={locateUser}
          title={t("myLocation")}
          aria-label={t("myLocation")}
          disabled={locating}
          data-locating={locating}
          aria-busy={locating}
        >
          <LocateFixed size={19} aria-hidden="true" />
          <span className="ku-map-action-label">{t("myLocation")}</span>
        </button>
        <button
          className="ku-map-action ku-map-action--labeled"
          type="button"
          onClick={() =>
            setTileMode((mode) => (mode === "street" ? "satellite" : "street"))
          }
          title={
            tileMode === "street" ? t("tileToSatellite") : t("tileToStreet")
          }
          aria-label={
            tileMode === "street" ? t("tileToSatellite") : t("tileToStreet")
          }
        >
          {tileMode === "street" ? (
            <Satellite size={19} aria-hidden="true" />
          ) : (
            <MapIcon size={19} aria-hidden="true" />
          )}
          <span className="ku-map-action-label">
            {tileMode === "street" ? t("tileSatellite") : t("tileStreet")}
          </span>
        </button>
```

- [ ] **Step 5: CSS 추가**

`src/components/map/map-ui.css:491-517`의 `.ku-map-action` 블록 뒤(현재 `.ku-marker-cluster` 앞)에 넣는다. `font-size: 17px`는 이모지 크기용이라 지운다:

```css
.ku-map-action {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border: 1px solid var(--ku-border-input);
  border-radius: 10px;
  color: var(--ku-text-1);
  background: var(--ku-map-control);
  box-shadow: var(--ku-shadow-raised);
  cursor: pointer;
}
.ku-map-action--labeled {
  flex-direction: column;
  gap: 2px;
  width: auto;
  min-width: 52px;
  height: auto;
  padding: 7px 7px 6px;
}
.ku-map-action-label {
  font-size: 10.5px;
  font-weight: 600;
  line-height: 1.2;
  white-space: nowrap;
}
.ku-map-action--primary {
  border-color: var(--ku-crimson-700);
  color: #fff;
  background: #8c0000;
}
.ku-map-action[data-locating="true"] {
  cursor: progress;
  opacity: 0.6;
}
/* 라벨까지 같이 흔들리지 않도록 아이콘에만 건다. */
.ku-map-action[data-locating="true"] svg {
  animation: ku-locate-pulse 0.9s ease-in-out infinite;
}
```

`:1248-1252`의 모바일 블록을 아래로 교체해 모바일은 아이콘만 남긴다:

```css
.ku-map-action {
  width: 48px;
  height: 48px;
  border-radius: 12px;
}
.ku-map-action--labeled {
  width: 48px;
  min-width: 0;
  height: 48px;
  padding: 0;
}
.ku-map-action-label {
  display: none;
}
```

- [ ] **Step 6: 테스트 통과 확인**

Run: `npm run typecheck && npm run test:e2e -- e2e/public-map.spec.ts e2e/public-map-p1.spec.ts`
Expected: PASS

- [ ] **Step 7: 커밋**

```bash
git add src/lib/translations.ts src/components/map/Map.tsx src/components/map/map-ui.css e2e/public-map.spec.ts e2e/public-map-p1.spec.ts
git commit -m "feat(map): 지도 액션 버튼을 lucide로 바꾸고 데스크톱 라벨을 단다"
```

---

### Task 6: 피드백 버튼과 모달

**Files:**

- Modify: `src/components/map/FeedbackButton.tsx:98-106`, `:132-140`

- [ ] **Step 1: 버튼과 닫기 아이콘 교체**

`src/components/map/FeedbackButton.tsx` 상단 import에 추가:

```ts
import { MessageSquare, X } from "lucide-react";
```

`:98-106`의 트리거 버튼을 교체한다. 이 컴포넌트는 지금도 한국어 고정 문구만
쓰므로 라벨도 같은 방식을 따른다(다국어화는 별도 작업):

```tsx
<button
  className="ku-map-action ku-map-action--primary ku-map-action--labeled"
  type="button"
  onClick={openDialog}
  title="피드백 보내기"
  aria-label="피드백 보내기"
>
  <MessageSquare size={19} aria-hidden="true" />
  <span className="ku-map-action-label">피드백</span>
</button>
```

`:132-140`의 모달 닫기 버튼 본문 `✕`를 교체:

```tsx
<button
  className="ku-feedback-close"
  type="button"
  onClick={() => setOpen(false)}
  aria-label="닫기"
  disabled={status.kind === "submitting"}
>
  <X size={17} aria-hidden="true" />
</button>
```

- [ ] **Step 2: 타입 검사와 e2e**

Run: `npm run typecheck && npm run test:e2e -- e2e/public-map-p1-remainder.spec.ts`
Expected: PASS

- [ ] **Step 3: 커밋**

```bash
git add src/components/map/FeedbackButton.tsx
git commit -m "feat(map): 피드백 버튼을 lucide로 바꾸고 라벨을 단다"
```

---

### Task 7: 검색 컨트롤

**Files:**

- Modify: `src/components/map/SearchControl.tsx:311-313`, `:346-391`, `:420-424`, `:443-450`

- [ ] **Step 1: import 추가**

`src/components/map/SearchControl.tsx` 상단:

```ts
import { Mic, Search, Sparkles, Star, X } from "lucide-react";
```

- [ ] **Step 2: 검색 아이콘 교체**

`:311-313`을 교체한다. lucide SVG 자체가 그림이므로 `role="img"` 래퍼가 필요 없다:

```tsx
<span className="ku-search-icon">
  <Search size={16} aria-hidden="true" />
</span>
```

- [ ] **Step 3: 지우기·음성·즐겨찾기 버튼 교체**

`:346-391`에서 각 버튼의 본문만 바꾼다:

```tsx
{
  hasQuery && (
    <button
      className="ku-search-clear"
      type="button"
      onMouseDown={(event) => event.preventDefault()}
      onClick={handleClear}
      aria-label={t("searchClear")}
      title={t("searchClear")}
    >
      <X size={15} aria-hidden="true" />
    </button>
  );
}
<button
  className="ku-voice-button"
  type="button"
  onMouseDown={handleVoiceSearch}
  aria-label={t("voiceSearch")}
  title={t("voiceSearch")}
  data-listening={isListening}
>
  <Mic size={17} aria-hidden="true" />
</button>;
```

즐겨찾기 버튼(`:372-391`)의 `<span aria-hidden="true">★</span>`을 교체:

```tsx
<Star size={17} fill="currentColor" aria-hidden="true" />
```

- [ ] **Step 4: 검색 결과의 명소 아이콘과 별 교체**

`:420-424`:

```tsx
{
  result.kind === "landmark" && (
    <span className="ku-search-result-icon">
      <Sparkles size={15} aria-hidden="true" />
    </span>
  );
}
```

`:443-450`:

```tsx
{
  result.kind === "building" && favoriteIds.has(result.id) && (
    <span className="ku-search-result-star" aria-label={t("favorites")}>
      <Star size={13} fill="currentColor" aria-hidden="true" />
    </span>
  );
}
```

- [ ] **Step 5: 아이콘 정렬 CSS 보정**

인라인 SVG는 기본이 baseline 정렬이라 박스 중앙에 오지 않는다. 이모지 크기를
잡던 `font-size` 선언을 정렬 선언으로 바꾼다.

`src/components/map/map-ui.css:56` `.ku-search-icon`에서 `font-size: 15px;`를
`display: flex;`로 교체:

```css
.ku-search-icon {
  position: absolute;
  z-index: 1;
  top: 50%;
  left: 13px;
  transform: translateY(-50%);
  display: flex;
  pointer-events: none;
}
```

`:198` `.ku-search-result-icon`에서 `font-size: 15px;`와 `line-height: 1;`을
교체:

```css
.ku-search-result-icon {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
}
```

`:102` `.ku-voice-button`에 정렬을 추가(현재 `display` 선언이 없다):

```css
.ku-voice-button {
  position: absolute;
  top: 1px;
  right: 1px;
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  border: 0;
  border-radius: 7px;
  color: var(--ku-text-3);
  background: transparent;
  cursor: pointer;
}
```

`.ku-search-clear`(`:213`)와 `.ku-favorite-button`(`:85`)은 이미
`inline-flex` + `align-items/justify-content: center`라 고칠 것이 없다.

- [ ] **Step 6: 타입 검사와 e2e**

Run: `npm run typecheck && npm run test:e2e -- e2e/public-map-search.spec.ts e2e/public-map-p1-remainder.spec.ts`
Expected: PASS — `getByTitle("음성 검색")`, `getByTitle("즐겨찾기")` 유지

- [ ] **Step 7: 커밋**

```bash
git add src/components/map/SearchControl.tsx src/components/map/map-ui.css
git commit -m "feat(map): 검색 컨트롤 아이콘을 lucide로 바꾼다"
```

---

### Task 8: 필터 패널

**Files:**

- Modify: `src/components/map/FilterPanel.tsx:99-110`, `:140-178`, `:180-204`, `:216-230`
- Modify: `e2e/public-map.spec.ts:83,208,237,271,294`

- [ ] **Step 1: 셰브런에 의존하는 e2e 셀렉터를 먼저 고쳐 실패를 만든다**

`e2e/public-map.spec.ts`에서 `/시설 [▼▲]/` 네 곳(`:83,208,237,271`)을
`"시설"` 완전일치로 좁힌다. 셰브런이 SVG가 되면 접근 이름이 `"시설"`만 남는다:

```ts
      page.getByRole("button", { name: "시설", exact: true }),
```

호출부(`:208,237,271`)는 다음 형태로 바꾼다:

```ts
await page.getByRole("button", { name: "시설", exact: true }).click();
```

`:294`의 영어 모드도 같이 바꾼다:

```ts
await page.getByRole("button", { name: "Facilities", exact: true }).click();
```

- [ ] **Step 2: 테스트를 돌려 실패를 확인**

Run: `npm run test:e2e -- e2e/public-map.spec.ts -g "지도와 핵심 컨트롤"`
Expected: FAIL — 접근 이름이 아직 `"시설 ▼"`이라 완전일치가 0건

- [ ] **Step 3: import 추가**

`src/components/map/FilterPanel.tsx` 상단:

```ts
import { ChevronDown, ChevronUp, Mountain, Sparkles } from "lucide-react";
import { FacilityTypeIcon } from "./iconography";
```

- [ ] **Step 4: 섹션 셰브런 3곳 교체**

`:107-109`(캠퍼스), `:148-150`(시설) 두 곳을 각각 교체한다:

```tsx
<span className="ku-filter-chevron">
  {campusSectionOpen ? (
    <ChevronUp size={14} aria-hidden="true" />
  ) : (
    <ChevronDown size={14} aria-hidden="true" />
  )}
</span>
```

```tsx
<span className="ku-filter-chevron">
  {facilitySectionOpen ? (
    <ChevronUp size={14} aria-hidden="true" />
  ) : (
    <ChevronDown size={14} aria-hidden="true" />
  )}
</span>
```

`:229`의 모바일 트리거 셰브런:

```tsx
{
  mobileFilterOpen ? (
    <ChevronUp size={14} aria-hidden="true" />
  ) : (
    <ChevronDown size={14} aria-hidden="true" />
  );
}
```

- [ ] **Step 5: 시설 칩 아이콘 교체**

`:169-171`의 `<span role="img" aria-label={...}>{item.icon}</span>`을 교체한다.
칩에 이미 텍스트 라벨이 뒤따르므로 아이콘은 장식이다:

```tsx
<FacilityTypeIcon code={item.code} size={15} />
```

- [ ] **Step 6: 경사도·명소 토글 아이콘 교체**

`:187-189`와 `:198-200`을 각각 교체:

```tsx
<Mountain size={15} aria-hidden="true" />
```

```tsx
<Sparkles size={15} aria-hidden="true" />
```

- [ ] **Step 7: CSS 정렬 보정**

`src/components/map/map-ui.css:333`의 `.ku-filter-chevron`에서 `font-size: 11px;`를
정렬 선언으로 교체:

```css
.ku-filter-chevron {
  color: var(--ku-text-3);
  display: flex;
  align-items: center;
}
```

- [ ] **Step 8: 테스트 통과 확인**

Run: `npm run typecheck && npm run test:e2e -- e2e/public-map.spec.ts`
Expected: PASS

- [ ] **Step 9: 커밋**

```bash
git add src/components/map/FilterPanel.tsx src/components/map/map-ui.css e2e/public-map.spec.ts
git commit -m "feat(map): 필터 패널 아이콘을 lucide로 바꾼다"
```

---

### Task 9: 목록 패널과 browseItems 데이터 흐름

**Files:**

- Modify: `src/components/map/MapBrowseList.tsx:6-14`, `:55`, `:71-78`, `:94-96`
- Modify: `src/components/map/Map.tsx:157-165`, `:173-183`

- [ ] **Step 1: MapBrowseItem에서 icon을 code로 교체**

`src/components/map/MapBrowseList.tsx:6-14`:

```ts
export interface MapBrowseItem {
  key: string;
  kind: "facility" | "landmark";
  /** kind가 facility일 때의 시설 유형 코드. landmark는 아이콘이 고정이라 쓰지 않는다. */
  code: string | null;
  name: string;
  detail: string;
  lat: number;
  lng: number;
}
```

- [ ] **Step 2: 트리거·닫기·항목 아이콘 교체**

`src/components/map/MapBrowseList.tsx` 상단 import에 추가:

```ts
import { List, Sparkles, X } from "lucide-react";
import { FacilityTypeIcon } from "./iconography";
```

`:55`의 `<span aria-hidden="true">☷</span>`:

```tsx
<List size={16} aria-hidden="true" />
```

`:71-78`의 닫기 버튼 본문 `×`:

```tsx
<button
  ref={closeButtonRef}
  type="button"
  aria-label={t("closeMapBrowse")}
  onClick={() => setOpen(false)}
>
  <X size={17} aria-hidden="true" />
</button>
```

`:94-96`의 항목 아이콘:

```tsx
<span className="ku-map-browse-icon">
  {item.kind === "landmark" ? (
    <Sparkles size={16} aria-hidden="true" />
  ) : (
    <FacilityTypeIcon code={item.code} size={16} />
  )}
</span>
```

- [ ] **Step 3: Map.tsx의 항목 생성부를 맞춘다**

`src/components/map/Map.tsx:157-165`의 `facilityBrowseItem` 반환값에서
`icon` 줄을 `code`로 바꾼다:

```tsx
return {
  key: `facility-${facility.id}`,
  kind: "facility",
  code: facility.facility_types?.code ?? null,
  name,
  detail: [type, location].filter(Boolean).join(" · "),
  lat: facility.lat!,
  lng: facility.lng!,
};
```

`:173-183`의 `landmarkBrowseItem`에서 `icon` 줄을 `code: null`로 바꾼다:

```tsx
return {
  key: `landmark-${landmark.id}`,
  kind: "landmark",
  code: null,
  name:
    localizedValue(landmark.name, landmark.name_en, landmark.name_zh, lang) ??
    landmark.name,
  detail,
  lat: landmark.lat,
  lng: landmark.lng,
};
```

`.ku-map-browse-icon`(`map-ui.css:643`)은 이미 `display: grid; place-items: center;`라
CSS는 고칠 것이 없다.

- [ ] **Step 4: 타입 검사와 e2e**

Run: `npm run typecheck && npm run test:e2e -- e2e/public-map.spec.ts e2e/public-map-p0.spec.ts`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add src/components/map/MapBrowseList.tsx src/components/map/Map.tsx
git commit -m "feat(map): 목록 패널이 이모지 대신 시설 코드로 아이콘을 고르게 한다"
```

---

### Task 10: 사이드패널

**Files:**

- Modify: `src/components/sidepanel/SidePanelHeader.tsx:42-71`
- Modify: `src/components/sidepanel/PhotoCarousel.tsx:56,81` 부근
- Modify: `src/components/sidepanel/FacilityList.tsx:92-98`

- [ ] **Step 1: 헤더의 닫기·음성·즐겨찾기 교체**

`src/components/sidepanel/SidePanelHeader.tsx` 상단 import에 추가:

```ts
import { Star, Volume2, X } from "lucide-react";
```

`:42-71`의 세 버튼 본문을 바꾼다:

```tsx
        <button
          className="ku-side-close"
          type="button"
          onClick={onClose}
          aria-label="닫기"
        >
          <X size={17} aria-hidden="true" />
        </button>
      </div>
      <div className="ku-side-actions">
        <button
          className="ku-side-action"
          type="button"
          onClick={onTts}
          disabled={loading}
          aria-pressed={isSpeaking}
        >
          <Volume2 size={16} aria-hidden="true" />
          {isSpeaking ? t("stopSpeaking") : t("speakInfo")}
        </button>
        <button
          className="ku-side-action ku-side-action--favorite"
          type="button"
          onClick={onToggleFavorite}
          aria-label={isFavorite ? t("removeFavorite") : t("addFavorite")}
          aria-pressed={isFavorite}
        >
          <Star
            size={16}
            fill={isFavorite ? "currentColor" : "none"}
            aria-hidden="true"
          />
          {t("favorites")}
        </button>
```

아이콘과 글자 사이 간격은 Step 4의 `.ku-side-action { gap }`이 만든다. 그래서
기존의 `{" "}` 공백 노드는 지운다.

- [ ] **Step 2: 사진 캐러셀 화살표 교체**

`src/components/sidepanel/PhotoCarousel.tsx` 상단 import에 추가:

```ts
import { ChevronLeft, ChevronRight } from "lucide-react";
```

이전 버튼(`:56` 부근)의 본문 `‹`를 교체:

```tsx
<ChevronLeft size={18} aria-hidden="true" />
```

다음 버튼(`:81` 부근)의 본문 `›`를 교체:

```tsx
<ChevronRight size={18} aria-hidden="true" />
```

- [ ] **Step 3: 시설 목록의 유형 아이콘 교체**

`src/components/sidepanel/FacilityList.tsx` 상단 import에 추가:

```ts
import { FacilityTypeIcon } from "@/components/map/iconography";
```

`:92-98`을 교체한다. `role="img"`+`aria-label`은 이모지를 그림으로 읽히게 하려던
장치인데, 아이콘 옆 `.ku-facility-name`이 같은 이름을 이미 텍스트로 보여주므로
중복 낭독을 없애고 장식으로 돌린다:

```tsx
<div className="ku-facility-icon">
  <FacilityTypeIcon code={facility.facility_types?.code} size={19} />
</div>
```

- [ ] **Step 4: CSS 정렬 보정**

`src/components/map/map-ui.css:973`의 `.ku-side-close`에 정렬을 추가(현재
`display` 선언이 없다):

```css
.ku-side-close {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  flex: 0 0 36px;
  border: 0;
  border-radius: 8px;
  color: var(--ku-text-2);
  background: var(--ku-bg);
  cursor: pointer;
}
```

`:989`의 `.ku-side-action`에 정렬과 간격을 추가:

```css
.ku-side-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  min-height: 40px;
  border: 1px solid var(--ku-border-input);
  border-radius: 8px;
  color: var(--ku-text-1);
  background: var(--ku-surface);
  cursor: pointer;
  font-size: 13px;
  font-weight: 600;
}
```

`:1027`의 `.ku-facility-icon`은 이미 `display: grid; place-items: center;`라
정렬은 그대로 두고, 이모지 크기를 잡던 `font-size: 16px;` 줄만 지운다:

```css
.ku-facility-icon {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  flex: 0 0 36px;
  border: 1px solid var(--ku-border);
  border-radius: 9px;
  background: var(--ku-surface);
}
```

- [ ] **Step 5: 타입 검사와 e2e**

Run: `npm run typecheck && npm run test:e2e -- e2e/public-map.spec.ts e2e/accessibility-dialog-toast.spec.ts`
Expected: PASS — `"즐겨찾기 추가"`/`"즐겨찾기 해제"` 접근 이름 유지

- [ ] **Step 6: 커밋**

```bash
git add src/components/sidepanel src/components/map/map-ui.css
git commit -m "feat(map): 사이드패널 아이콘을 lucide로 바꾼다"
```

---

### Task 11: 즐겨찾기 목록·오류 배너·토스트

**Files:**

- Modify: `src/components/map/FavoritesList.tsx:29`
- Modify: `src/components/map/MapErrorBanner.tsx:73-76`
- Modify: `src/components/Toast.tsx:5-9`, `:47`, `:53-66`

- [ ] **Step 1: 즐겨찾기 행의 별 교체**

`src/components/map/FavoritesList.tsx` 상단에 `import { Star } from "lucide-react";`를
추가하고 `:29`를 교체:

```tsx
<Star size={14} fill="currentColor" aria-hidden="true" />
```

- [ ] **Step 2: 오류 배너 아이콘 교체**

`src/components/map/MapErrorBanner.tsx` 상단에
`import { TriangleAlert } from "lucide-react";`를 추가하고 `:73-76`을 교체:

```tsx
<span style={{ display: "flex", alignItems: "center", gap: 8, flex: 1 }}>
  <TriangleAlert size={16} aria-hidden="true" />
  <span>{t(ERROR_MESSAGE_KEY[source])}</span>
</span>
```

- [ ] **Step 3: 토스트 아이콘 교체**

`src/components/Toast.tsx`는 공개 지도(위치 오류 안내)와 관리자 화면이 함께 쓴다.
아이콘만 바뀌고 문구·역할·타이밍은 그대로다.

상단 import 교체:

```tsx
"use client";

import { useEffect } from "react";
import { CircleCheck, CircleX, TriangleAlert, X } from "lucide-react";
```

`:5-9`의 `STYLES`에서 `icon`을 컴포넌트로 바꾼다:

```tsx
const STYLES = {
  success: {
    bg: "#F0FDF4",
    border: "#86EFAC",
    color: "#166534",
    Icon: CircleCheck,
  },
  error: { bg: "#FEF2F2", border: "#FCA5A5", color: "#991B1B", Icon: CircleX },
  warning: {
    bg: "#FFFBEB",
    border: "#FCD34D",
    color: "#92400E",
    Icon: TriangleAlert,
  },
};
```

`:47`의 `<span aria-hidden="true">{s.icon}</span>`을 교체:

```tsx
<s.Icon size={18} aria-hidden="true" style={{ flexShrink: 0 }} />
```

`:53-66`의 닫기 버튼 본문 `✕`를 교체하고, SVG가 가운데 오도록 `display`를 더한다:

```tsx
<button
  type="button"
  onClick={onClose}
  aria-label="알림 닫기"
  style={{
    display: "flex",
    alignItems: "center",
    background: "none",
    border: "none",
    cursor: "pointer",
    color: s.color,
    opacity: 0.6,
    padding: 0,
  }}
>
  <X size={15} aria-hidden="true" />
</button>
```

- [ ] **Step 4: 타입 검사와 e2e**

Run: `npm run typecheck && npm run test:e2e -- e2e/accessibility-dialog-toast.spec.ts e2e/public-map-p1.spec.ts`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add src/components/map/FavoritesList.tsx src/components/map/MapErrorBanner.tsx src/components/Toast.tsx
git commit -m "feat(map): 즐겨찾기·오류 배너·토스트 아이콘을 lucide로 바꾼다"
```

---

### Task 12: icon 컬럼 참조 제거와 전체 검증

**Files:**

- Modify: `src/components/map/useMapData.ts:106`
- Modify: `src/app/api/facilities/route.ts:14`
- Modify: `e2e/support/mockBackend.ts:51-72`, `:268`

- [ ] **Step 1: 공개 지도 쿼리에서 icon을 뺀다**

후속 PR에서 컬럼을 drop하려면 그 전에 배포된 프론트가 이 컬럼을 읽지 않아야 한다.

`src/components/map/useMapData.ts:106`:

```ts
      .select("code, label, label_en, label_zh")
```

`src/app/api/facilities/route.ts:14`:

```ts
      "*, facility_types(code, label, label_en, label_zh), buildings(name, name_en)",
```

- [ ] **Step 2: e2e 픽스처에서 이모지 필드를 뺀다**

`e2e/support/mockBackend.ts:51-72`의 `types` 배열에서 세 항목의 `icon` 줄을
지운다. 결과:

```ts
const types = [
  {
    code: "elevator",
    label: "엘리베이터",
    label_en: "Elevator",
    label_zh: "电梯",
  },
  {
    code: "ramp",
    label: "경사로",
    label_en: "Ramp",
    label_zh: "坡道",
  },
  {
    code: "parking",
    label: "장애인 주차",
    label_en: "Accessible parking",
    label_zh: "无障碍停车",
  },
];
```

`:268`의 landmark 픽스처에서 `icon: "🐿️",` 줄을 지운다. `landmarks` API는
`select("*")`라 컬럼이 없어도 동작하며, 렌더링은 `Sparkles` 고정이다.

- [ ] **Step 3: 타입 검사**

Run: `npm run typecheck`
Expected: 오류 없음 — `FacilityWithType`의 `facility_types`가 `Partial`이라
서브셋 select가 그대로 할당된다

- [ ] **Step 4: 전체 단위 테스트**

Run: `npm test`
Expected: PASS — 기존 테스트 전부 + `mapIcons` 6건

- [ ] **Step 5: 린트와 포맷**

Run: `npm run lint && npm run format:check`
Expected: 오류 없음. 실패하면 `npm run format` 후 재실행

- [ ] **Step 6: 전체 e2e**

Run: `npm run test:e2e`
Expected: 전체 PASS

- [ ] **Step 7: 프로덕션 빌드로 번들 확인**

Run: `npm run build`
Expected: 성공. 공개 지도 라우트(`/`)의 First Load JS가 이전 대비 과도하게
늘지 않았는지 출력에서 확인한다(lucide는 사용한 아이콘만 포함돼야 한다).

- [ ] **Step 8: 이모지 잔존 여부 최종 확인**

Run:

```bash
grep -rnP '[\x{1F300}-\x{1FAFF}\x{2600}-\x{27BF}]|★|☆|✕|☷|＋|−' src/components/map src/components/sidepanel src/components/SidePanel.tsx src/components/Toast.tsx
```

Expected: 결과 없음. 남는 게 있으면 해당 파일을 마저 고치고 이 태스크의
커밋에 포함한다.

- [ ] **Step 9: 커밋**

```bash
git add src/components/map/useMapData.ts src/app/api/facilities/route.ts e2e/support/mockBackend.ts
git commit -m "refactor(map): 공개 지도 쿼리에서 icon 컬럼 참조를 걷어낸다"
```

---

## 후속 작업 (별도 PR)

이 PR이 배포되어 `icon` 컬럼을 읽는 프론트가 사라진 뒤에 진행한다:

1. 관리자 명소 폼(`LandmarkFormModal.tsx`)의 이모지 입력란·필수 검증·저장 제거.
2. 관리자 화면의 `facility_types.icon` 표시 지점을 `FacilityTypeIcon` 재사용으로 교체
   (`src/app/admin/dashboard/facilities/page.tsx`, `src/app/admin/buildings/[id]/page.tsx`,
   `src/components/admin/FacilityFormModal.tsx`, `FacilityVideoModal.tsx`,
   `src/app/admin/dashboard/landmarks/page.tsx`).
3. `landmarks.icon`·`facility_types.icon` drop 마이그레이션을 `supabase/migrations/`에
   `YYYYMMDDHHMMSS_drop_icon_columns.sql`로 추가(main 머지 시 CI가 자동 적용).
4. `supabase/database.types.ts` 재생성.

`FeedbackButton`의 한국어 고정 문구 다국어화도 별도 작업으로 남는다.
