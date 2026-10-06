# 경사도 단위·편집기 사용성 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 도(°) 단위로 들어간 경사 실측값을 바르게 읽고, 범례·경고를 법 기준선에 맞추고, 경사도 편집기를 현장에서 쓸 수 있게 고치며, 건물 안 시설 수정과 사진 라이트박스를 더한다.

**Architecture:** 저장값의 의미를 도로 확정하고 단위 판단은 신규 순수 모듈 `slopeScale.ts`에 모은다. 저장 포맷은 `readRoutePoints` 하나로만 읽는다. 편집기 개선은 `SlopeRouteMap`(명령형 Leaflet)과 `SlopeRouteEditor`(상태)에 나눠 넣는다. 데이터 이전은 없다.

**Tech Stack:** Next.js 16 App Router · React 19 · Leaflet 1.9.4 · @geoman-io/leaflet-geoman-free 2.19.3 · react-leaflet 5 · Supabase · Vitest 3(`environment: "node"`) · Playwright

**Spec:** `docs/specs/2026-10-06-slope-units-and-editor-design.md` — 이 계획은 그 문서를 근거로 한다. 각 작업 머리의 절 번호를 같이 읽는다.

## Global Constraints

- 저장 포맷 키 `slope`의 단위는 **도(°)**. 범위 `0 ≤ slope ≤ 45`. 운영 데이터는 고치지 않는다 (설계 2장)
- `slope`는 **반올림하지 않고** 저장한다. `distance`만 `round1` (설계 2.2)
- 칸·경고 비교는 %로, `값 ≤ 경계 + 1e-9` (설계 2.2·3.2)
- 입력 범위 검사는 **도로 직접** — `tan` 주기성 때문 (설계 3.2)
- 기준선 상수는 비율로 적는다 — `1/18`, `1/12`, `1/8`. `8.33` 같은 리터럴 금지 (설계 3.1)
- 밖으로 내놓는 판정 함수는 도를 받고 이름에 `Deg`를 붙인다 (설계 3.1)
- 범례 6칸 경계 `2% / 1/18 / 1/12 / 1/8 / 15%`, 색 `#B5AFA8 #DDC26A #D89A3A #C96C24 #AE3B1E #7A1414` (설계 4장)
- 문구는 "법적 기준"을 쓰지 않는다 (설계 4장)
- `AGENTS.md`: 코드를 쓰기 전에 `node_modules/next/dist/docs/`의 해당 가이드를 읽는다
- 커밋 메시지·주석·문서에 리뷰·자체 점검 같은 과정 이름을 쓰지 않는다. 날짜만 쓴다. AI `Co-Authored-By` 트레일러 금지
- 주석은 코드로 알 수 없는 이유·제약·위험만. 같은 사실이 설계 문서에 있으면 절 번호를 가리킨다

## 파일 지도

| 파일                                                                                                        | 책임                                                     | 작업    |
| ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | ------- |
| `src/lib/slopeScale.ts` (신규)                                                                              | 단위 변환, 기준선, 색 칸, 도를 받는 판정, 입력 단위 변환 | 1       |
| `src/lib/slopeRoute.ts`                                                                                     | 경로 계산, 검증, 저장 포맷 변환, **유일한 decoder**      | 2·3     |
| `src/types/domain.ts`                                                                                       | 저장 포맷 타입                                           | 2       |
| `src/components/map/SlopeLayer.tsx`                                                                         | 공개 지도 경사 선                                        | 2·3     |
| `src/components/map/SlopeLegend.tsx`, `map-ui.css`                                                          | 범례                                                     | 3       |
| `src/app/admin/dashboard/slopes/page.tsx`                                                                   | 경로 목록                                                | 2       |
| `src/app/admin/slopes/[id]/page.tsx`, `new/page.tsx`                                                        | 편집 페이지                                              | 2       |
| `src/components/SlopeRouteEditor.tsx`                                                                       | 편집기 상태(이름·꼭짓점·도 값·입력 문자열·단위·스냅)     | 2·4·5·7 |
| `src/components/slope/SlopeSegmentList.tsx`                                                                 | 구간 입력 표현                                           | 3·5     |
| `src/components/slope/SlopeRouteMap.tsx`                                                                    | Leaflet·geoman 명령형 코드                               | 3·4·6·7 |
| `src/components/PolygonEditor.tsx`                                                                          | geoman 한국어                                            | 4       |
| `src/lib/mapBounds.ts` (신규)                                                                               | 캠퍼스 표시 범위                                         | 6       |
| `src/lib/neighborLayer.ts`                                                                                  | 회색 건물 레이어 옵션                                    | 7       |
| `src/components/admin/FacilityDetailModal.tsx`, `src/app/admin/buildings/[id]/page.tsx`                     | 건물 안 시설 수정                                        | 8       |
| `src/lib/photoDownload.ts` (신규), `src/components/sidepanel/PhotoLightbox.tsx` (신규), `PhotoCarousel.tsx` | 라이트박스·다운로드                                      | 9       |
| `e2e/support/mockBackend.ts`                                                                                | 목 백엔드                                                | 2·6·9   |
| 문서                                                                                                        | 대체 배너·README                                         | 10      |

---

### Task 0: 작업 환경

**Files:** 없음

- [ ] **Step 1: 디스크 여유 확인 후 의존성 설치** (저장소 안에서. scratchpad에 설치하지 않는다)

```bash
df -h /c
npm ci
npx playwright install chromium
```

- [ ] **Step 2: Next 가이드 확인** — `node_modules/next/dist/docs/`에서 클라이언트 컴포넌트, `next/dynamic`(`ssr: false`), `next/image`(`fill`·`unoptimized`) 항목을 읽는다.

- [ ] **Step 3: 기준선 확인** — 바꾸기 전 상태가 녹색인지 본다.

```bash
npm test
npm run typecheck
npx playwright test e2e/admin-buildings-slopes.spec.ts
```

Expected: 모두 PASS. 실패가 있으면 이 계획을 시작하지 말고 보고한다.

---

### Task 1: `slopeScale.ts` — 단위와 판정 (설계 2.2·3.1·3.2·4장)

**Files:**

- Create: `src/lib/slopeScale.ts`
- Test: `src/lib/slopeScale.test.ts`

**Interfaces:**

- Produces:
  - `WALKWAY_RATIO = 1/18`, `RELAXED_RATIO = 1/12`, `RAMP_EXCEPTION_RATIO = 1/8`, `MAX_SLOPE_DEG = 45`
  - `degToPercent(deg: number): number`, `percentToDeg(percent: number): number`
  - `isSlopeDegInRange(deg: number): boolean`
  - `SLOPE_BANDS: readonly { maxPercent: number; color: string }[]` (마지막 칸 `maxPercent: Infinity`)
  - `SLOPE_REFERENCE_LINES: readonly { ratioLabel: string; percent: number; label: string }[]`
  - `slopeColorFromDeg(deg: number): string`
  - `type SlopeWarning = "relaxed-limit" | "extreme" | null`, `slopeWarningFromDeg(deg: number): SlopeWarning`
  - `type SlopeUnit = "deg" | "percent"`, `toDegrees(value: number, unit: SlopeUnit): number`, `fromDegrees(deg: number, unit: SlopeUnit): number`
  - `formatPercent(percent: number): string` → `"17.6%"`, `formatDeg(deg: number): string` → `"10.0°"`, `formatSlopeInput(deg: number, unit: SlopeUnit): string` → 입력란용 문자열(소수 둘째 자리까지, 뒤 0 제거)

- [ ] **Step 1: 실패하는 테스트 작성** — `src/lib/slopeScale.test.ts`

```ts
import { describe, expect, it } from "vitest";
import {
  MAX_SLOPE_DEG,
  RAMP_EXCEPTION_RATIO,
  RELAXED_RATIO,
  SLOPE_BANDS,
  WALKWAY_RATIO,
  degToPercent,
  formatDeg,
  formatPercent,
  formatSlopeInput,
  fromDegrees,
  isSlopeDegInRange,
  percentToDeg,
  slopeColorFromDeg,
  slopeWarningFromDeg,
  toDegrees,
} from "./slopeScale";

const BAND_COLORS = [
  "#B5AFA8",
  "#DDC26A",
  "#D89A3A",
  "#C96C24",
  "#AE3B1E",
  "#7A1414",
];

// 변환을 거치지 않은 %로 칸을 찾는다. 테스트의 기대값 계산용.
const colorOfExactPercent = (percent: number) =>
  SLOPE_BANDS.find((band) => percent <= band.maxPercent)!.color;

describe("degToPercent / percentToDeg", () => {
  it("45°는 100%다", () => {
    expect(degToPercent(45)).toBeCloseTo(100, 10);
    expect(percentToDeg(100)).toBeCloseTo(45, 10);
  });

  it("10°는 17.63%다", () => {
    expect(degToPercent(10)).toBeCloseTo(17.633, 3);
  });

  it("왕복하면 값이 돌아온다", () => {
    for (const deg of [0, 1.1, 4.7636, 7.2, 10.4, 45]) {
      expect(percentToDeg(degToPercent(deg))).toBeCloseTo(deg, 10);
    }
  });
});

describe("기준선", () => {
  it("비율에서 나온다", () => {
    expect(WALKWAY_RATIO * 100).toBeCloseTo(5.5556, 4);
    expect(RELAXED_RATIO * 100).toBeCloseTo(8.3333, 4);
    expect(RAMP_EXCEPTION_RATIO * 100).toBe(12.5);
  });
});

describe("isSlopeDegInRange", () => {
  it("0°와 45°를 포함한다", () => {
    expect(isSlopeDegInRange(0)).toBe(true);
    expect(isSlopeDegInRange(MAX_SLOPE_DEG)).toBe(true);
  });

  // tan은 주기 함수라 %로 바꾼 뒤 검사하면 181°가 1.75%로 통과한다(설계 3.2).
  it("범위 밖 각도는 tan 값과 무관하게 거부한다", () => {
    for (const deg of [-0.1, 45.01, 90, 181, -179, 200]) {
      expect(isSlopeDegInRange(deg)).toBe(false);
    }
  });

  it("유한하지 않은 값을 거부한다", () => {
    expect(isSlopeDegInRange(NaN)).toBe(false);
    expect(isSlopeDegInRange(Infinity)).toBe(false);
  });
});

describe("slopeColorFromDeg", () => {
  it("색 순서가 설계와 같다", () => {
    expect(SLOPE_BANDS.map((band) => band.color)).toEqual(BAND_COLORS);
  });

  it("경계값은 그 칸에 포함되고 바로 위는 다음 칸이다", () => {
    SLOPE_BANDS.slice(0, -1).forEach((band, index) => {
      expect(slopeColorFromDeg(percentToDeg(band.maxPercent))).toBe(
        BAND_COLORS[index],
      );
      expect(slopeColorFromDeg(percentToDeg(band.maxPercent + 0.01))).toBe(
        BAND_COLORS[index + 1],
      );
    });
  });

  it("E2E가 쓰는 값의 칸", () => {
    expect(slopeColorFromDeg(1)).toBe("#B5AFA8");
    expect(slopeColorFromDeg(3)).toBe("#DDC26A");
    expect(slopeColorFromDeg(7.2)).toBe("#AE3B1E");
    expect(slopeColorFromDeg(10)).toBe("#7A1414");
  });
});

// 설계 2.2 — 자릿수 반올림은 어떤 경계값을 반드시 위 칸으로 민다. 저장은 반올림 없이.
describe("% 입력이 도 저장을 거쳐도 같은 칸에 남는다", () => {
  it.each([100 / 18, 100 / 12, 100 / 8, 2, 5.56, 8.33, 12.5, 15])(
    "%s%%",
    (percent) => {
      expect(slopeColorFromDeg(percentToDeg(percent))).toBe(
        colorOfExactPercent(percent),
      );
    },
  );
});

describe("slopeWarningFromDeg", () => {
  it("정확한 1/12는 경고가 없다", () => {
    expect(slopeWarningFromDeg(percentToDeg(100 / 12))).toBeNull();
  });

  it("1/12를 넘으면 완화 한도 경고다", () => {
    expect(slopeWarningFromDeg(percentToDeg(8.34))).toBe("relaxed-limit");
    expect(slopeWarningFromDeg(16.69)).toBe("relaxed-limit");
    expect(slopeWarningFromDeg(percentToDeg(30))).toBe("relaxed-limit");
  });

  it("30%를 넘으면 강한 경고다", () => {
    expect(slopeWarningFromDeg(16.71)).toBe("extreme");
    expect(slopeWarningFromDeg(45)).toBe("extreme");
  });
});

describe("입력 단위", () => {
  it("도는 그대로, %는 도로 바꾼다", () => {
    expect(toDegrees(7.2, "deg")).toBe(7.2);
    expect(toDegrees(12.5, "percent")).toBeCloseTo(7.1250163, 7);
    expect(fromDegrees(10, "deg")).toBe(10);
    expect(fromDegrees(10, "percent")).toBeCloseTo(17.633, 3);
  });

  it("입력란 문자열은 둘째 자리까지, 뒤 0 없이", () => {
    expect(formatSlopeInput(7.2, "deg")).toBe("7.2");
    expect(formatSlopeInput(10, "percent")).toBe("17.63");
    expect(formatSlopeInput(percentToDeg(12.5), "deg")).toBe("7.13");
    expect(formatSlopeInput(percentToDeg(12.5), "percent")).toBe("12.5");
  });

  it("표시 문자열", () => {
    expect(formatPercent(degToPercent(10))).toBe("17.6%");
    expect(formatDeg(10)).toBe("10.0°");
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/lib/slopeScale.test.ts`
Expected: FAIL — `Cannot find module './slopeScale'`

- [ ] **Step 3: 구현** — `src/lib/slopeScale.ts`

```ts
/**
 * 경사 단위와 색 칸. 저장값(`SlopeRoutePoint.slope`)은 도(°)다. 법 기준이 비율이라
 * 칸·경고는 %로 비교한다 — docs/specs/2026-10-06-slope-units-and-editor-design.md 2~4장.
 */

export const WALKWAY_RATIO = 1 / 18;
export const RELAXED_RATIO = 1 / 12;
export const RAMP_EXCEPTION_RATIO = 1 / 8;

export const MAX_SLOPE_DEG = 45;
const EXTREME_SLOPE_PERCENT = 30;

// tan(atan(x)) 왕복의 부동소수 오차가 정확한 경계값을 넘기지 않게 한다(설계 2.2).
const BOUNDARY_TOLERANCE = 1e-9;

export function degToPercent(deg: number): number {
  return Math.tan((deg * Math.PI) / 180) * 100;
}

export function percentToDeg(percent: number): number {
  return (Math.atan(percent / 100) * 180) / Math.PI;
}

export function isSlopeDegInRange(deg: number): boolean {
  return Number.isFinite(deg) && deg >= 0 && deg <= MAX_SLOPE_DEG;
}

export interface SlopeBand {
  /** 이 칸의 상한(%, 포함). 마지막 칸은 Infinity */
  maxPercent: number;
  color: string;
}

export const SLOPE_BANDS: readonly SlopeBand[] = [
  { maxPercent: 2, color: "#B5AFA8" },
  { maxPercent: WALKWAY_RATIO * 100, color: "#DDC26A" },
  { maxPercent: RELAXED_RATIO * 100, color: "#D89A3A" },
  { maxPercent: RAMP_EXCEPTION_RATIO * 100, color: "#C96C24" },
  { maxPercent: 15, color: "#AE3B1E" },
  { maxPercent: Infinity, color: "#7A1414" },
];

export interface SlopeReferenceLine {
  ratioLabel: string;
  percent: number;
  label: string;
}

export const SLOPE_REFERENCE_LINES: readonly SlopeReferenceLine[] = [
  { ratioLabel: "1/18", percent: WALKWAY_RATIO * 100, label: "보도 기준" },
  { ratioLabel: "1/12", percent: RELAXED_RATIO * 100, label: "완화 한도" },
  {
    ratioLabel: "1/8",
    percent: RAMP_EXCEPTION_RATIO * 100,
    label: "경사로 특례 한도",
  },
];

function bandForPercent(percent: number): SlopeBand {
  return (
    SLOPE_BANDS.find(
      (band) => percent <= band.maxPercent + BOUNDARY_TOLERANCE,
    ) ?? SLOPE_BANDS[SLOPE_BANDS.length - 1]
  );
}

export function slopeColorFromDeg(deg: number): string {
  return bandForPercent(degToPercent(Math.abs(deg))).color;
}

export type SlopeWarning = "relaxed-limit" | "extreme" | null;

export function slopeWarningFromDeg(deg: number): SlopeWarning {
  const percent = degToPercent(Math.abs(deg));
  if (percent > EXTREME_SLOPE_PERCENT + BOUNDARY_TOLERANCE) return "extreme";
  if (percent > RELAXED_RATIO * 100 + BOUNDARY_TOLERANCE)
    return "relaxed-limit";
  return null;
}

export type SlopeUnit = "deg" | "percent";

export function toDegrees(value: number, unit: SlopeUnit): number {
  return unit === "deg" ? value : percentToDeg(value);
}

export function fromDegrees(deg: number, unit: SlopeUnit): number {
  return unit === "deg" ? deg : degToPercent(deg);
}

export function formatPercent(percent: number): string {
  return `${percent.toFixed(1)}%`;
}

export function formatDeg(deg: number): string {
  return `${deg.toFixed(1)}°`;
}

export function formatSlopeInput(deg: number, unit: SlopeUnit): string {
  return String(Number(fromDegrees(deg, unit).toFixed(2)));
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run src/lib/slopeScale.test.ts`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add src/lib/slopeScale.ts src/lib/slopeScale.test.ts
git commit -m "feat(slope): 경사 단위 변환과 기준선 판정을 한 모듈로 둔다"
```

---

### Task 2: 저장 포맷 decoder와 GPX 코드 정리 (설계 2.2·6장)

색·문구는 아직 바꾸지 않는다(작업 3). 이 작업이 끝나도 화면 색은 지금과 같다.

**Files:**

- Modify: `src/types/domain.ts:17-31`
- Modify: `src/lib/slopeRoute.ts`
- Test: `src/lib/slopeRoute.test.ts`
- Modify: `src/components/map/SlopeLayer.tsx`
- Modify: `src/app/admin/dashboard/slopes/page.tsx`
- Modify: `src/app/admin/slopes/[id]/page.tsx`, `src/app/admin/slopes/new/page.tsx`
- Modify: `src/components/SlopeRouteEditor.tsx:13,40`
- Modify: `e2e/support/mockBackend.ts:274-302`
- Test: `e2e/admin-buildings-slopes.spec.ts`

**Interfaces:**

- Consumes: `isSlopeDegInRange` (작업 1)
- Produces:
  - `domain.ts`: `SlopeRouteStart { lat; lng }`, `SlopeRoutePoint extends SlopeRouteStart { slope: number /*도*/; distance: number }`, `SlopeRoutePoints = [SlopeRouteStart, ...SlopeRoutePoint[]]`, `SlopeSegment = Tables["slope_segments"]["Row"]` (`segments`는 `Json`). `SlopePoint`는 없어진다
  - `slopeRoute.ts`: `readRoutePoints(raw: unknown): SlopeRoutePoints | null`, `readStoredVertices(points: SlopeRoutePoints): Vertex[]`, `readStoredSlopes(points: SlopeRoutePoints): number[]`, `toStoredSegments(vertices: Vertex[], slopes: number[]): SlopeRoutePoints`. `isManualRoute`는 없어진다
  - 목록 `REDIRECT_NOTICE.invalid`

- [ ] **Step 1: 타입 교체** — `src/types/domain.ts`의 `SlopePoint`·`SlopeSegment` 정의(17~31행)를 다음으로 바꾼다.

```ts
/** slope_segments.segments(jsonb)의 시작 꼭짓점 */
export interface SlopeRouteStart {
  lat: number;
  lng: number;
}

/** 시작 다음 꼭짓점. 앞 꼭짓점에서 여기까지 구간의 값을 싣는다 */
export interface SlopeRoutePoint extends SlopeRouteStart {
  /** 구간 경사. 단위는 도(°), 0~45. 판정은 src/lib/slopeScale.ts */
  slope: number;
  /** 구간 길이(m) */
  distance: number;
}

/** readRoutePoints를 통과한 경로 */
export type SlopeRoutePoints = [SlopeRouteStart, ...SlopeRoutePoint[]];

/** segments는 jsonb라 readRoutePoints로 읽기 전에는 모양을 믿지 않는다 */
export type SlopeSegment = Tables["slope_segments"]["Row"];
```

- [ ] **Step 2: 단위 테스트를 새 계약으로** — `src/lib/slopeRoute.test.ts`에서

  1. import 목록에서 `isManualRoute`를 지우고 `percentToDeg`를 `./slopeScale`에서 가져온다.
  2. `describe("toStoredSegments", …)` 전체를 아래로 바꾼다.

```ts
describe("toStoredSegments", () => {
  it("첫 포인트는 좌표만 싣는다", () => {
    const stored = toStoredSegments([A, B], [7.2]);
    expect(stored[0]).toEqual({ lat: A.lat, lng: A.lng });
  });

  it("이후 포인트에 구간 값과 계산된 거리를 싣는다", () => {
    const stored = toStoredSegments([A, B], [7.2]);
    expect(stored[1]).toEqual({
      lat: B.lat,
      lng: B.lng,
      slope: 7.2,
      distance: 111.2,
    });
  });

  // 설계 2.2 — 자릿수 반올림은 %로 입력한 기준선 값을 위 칸으로 민다.
  it("경사도를 반올림하지 않는다", () => {
    expect(toStoredSegments([A, B], [7.26])[1].slope).toBe(7.26);
    const fromPercent = percentToDeg(12.5);
    expect(toStoredSegments([A, B], [fromPercent])[1].slope).toBe(fromPercent);
  });

  it("경사도 0도 값으로 저장한다", () => {
    expect(toStoredSegments([A, B], [0])[1].slope).toBe(0);
  });
});
```

3. `describe("readStoredVertices / readStoredSlopes", …)`에서 두 번째 테스트("slope가 없는 포인트는 0이 아니라 미입력으로 읽는다")를 지운다. 그런 행은 이제 decoder가 버린다.
4. `describe("isManualRoute", …)` 전체를 지운다.
5. `describe("readRoutePoints", …)` 전체를 아래로 바꾼다.

```ts
describe("readRoutePoints", () => {
  const stored = toStoredSegments([A, B, C], [7.2, 4.5]);

  it("정상 행은 그대로 돌려준다", () => {
    expect(readRoutePoints(stored)).toEqual(stored);
  });

  // 운영 행에는 GPX 시절 키 ele: null이 남아 있다. 읽지 않을 뿐 거부하지 않는다.
  it("남은 ele 키는 통과시킨다", () => {
    const legacy = [
      { lat: A.lat, lng: A.lng, ele: null },
      { lat: B.lat, lng: B.lng, ele: null, slope: 7.2, distance: 12.4 },
    ];
    expect(readRoutePoints(legacy)).toEqual(legacy);
  });

  it("배열이 아니면 거른다", () => {
    expect(readRoutePoints("xx")).toBeNull();
    expect(readRoutePoints(null)).toBeNull();
    expect(readRoutePoints({ lat: 1, lng: 2 })).toBeNull();
  });

  it("포인트가 2개 미만이면 거른다", () => {
    expect(readRoutePoints([])).toBeNull();
    expect(readRoutePoints([stored[0]])).toBeNull();
  });

  it("좌표가 유한한 수가 아니면 경로 전체를 거른다", () => {
    expect(
      readRoutePoints([{ lat: null, lng: 127.032 }, stored[1]]),
    ).toBeNull();
    expect(
      readRoutePoints([{ lat: "37", lng: 127.032 }, stored[1]]),
    ).toBeNull();
    expect(
      readRoutePoints([
        stored[0],
        { lat: 37.59, lng: NaN, slope: 1, distance: 1 },
      ]),
    ).toBeNull();
  });

  // GPX 분기가 사라졌으므로 slope 없는 행은 그릴 방법이 없다. 0%로 그리면 평지로 보인다.
  it("slope나 distance가 없는 행을 거른다", () => {
    expect(
      readRoutePoints([
        { lat: A.lat, lng: A.lng },
        { lat: B.lat, lng: B.lng, distance: 12.4 },
      ]),
    ).toBeNull();
    expect(
      readRoutePoints([
        { lat: A.lat, lng: A.lng },
        { lat: B.lat, lng: B.lng, slope: 7.2 },
      ]),
    ).toBeNull();
  });

  it("값이 범위를 벗어나면 거른다", () => {
    const withMetrics = (slope: number, distance: number) => [
      { lat: A.lat, lng: A.lng },
      { lat: B.lat, lng: B.lng, slope, distance },
    ];
    expect(readRoutePoints(withMetrics(-1, 10))).toBeNull();
    expect(readRoutePoints(withMetrics(46, 10))).toBeNull();
    expect(readRoutePoints(withMetrics(181, 10))).toBeNull();
    expect(readRoutePoints(withMetrics(5, 0))).toBeNull();
    expect(readRoutePoints(withMetrics(5, -3))).toBeNull();
    expect(readRoutePoints(withMetrics(NaN, 10))).toBeNull();
  });
});
```

6. `describe("readStoredVertices / readStoredSlopes", …)`의 남은 테스트는 `stored`가 이제 `SlopeRoutePoints`라 그대로 통과해야 한다.

- [ ] **Step 3: 실패 확인**

Run: `npx vitest run src/lib/slopeRoute.test.ts`
Expected: FAIL — 첫 포인트에 `ele`가 있음, `7.26`이 `7.3`, slope 없는 행이 통과함 등

- [ ] **Step 4: `slopeRoute.ts` 구현**

  1. 첫 줄 import를 바꾼다.

```ts
import type {
  SlopeRoutePoint,
  SlopeRoutePoints,
  SlopeRouteStart,
} from "@/types/domain";
import { isSlopeDegInRange } from "@/lib/slopeScale";
```

2. `toStoredSegments`부터 파일 끝까지(104~172행)를 아래로 바꾼다. `LEGAL_SLOPE_LIMIT`·`slopeWarning`·`validateRoute`는 작업 3에서 바꾸므로 그대로 둔다.

```ts
export function toStoredSegments(
  vertices: Vertex[],
  slopes: number[],
): SlopeRoutePoints {
  const segments = buildSegments(vertices);
  const [start, ...rest] = vertices;
  return [
    { lat: start.lat, lng: start.lng },
    ...rest.map((vertex, index) => ({
      lat: vertex.lat,
      lng: vertex.lng,
      // 반올림하지 않는다 — 설계 2.2
      slope: slopes[index],
      distance: segments[index].distance,
    })),
  ];
}

export function readStoredVertices(points: SlopeRoutePoints): Vertex[] {
  return points.map(({ lat, lng }) => ({ lat, lng }));
}

export function readStoredSlopes(points: SlopeRoutePoints): number[] {
  const [, ...measured] = points;
  return measured.map((point) => point.slope);
}

function isCoordinate(value: unknown): value is SlopeRouteStart {
  if (typeof value !== "object" || value === null) return false;
  const point = value as Record<string, unknown>;
  return (
    typeof point.lat === "number" &&
    Number.isFinite(point.lat) &&
    typeof point.lng === "number" &&
    Number.isFinite(point.lng)
  );
}

function hasValidMetrics(point: SlopeRouteStart): point is SlopeRoutePoint {
  const { slope, distance } = point as Partial<SlopeRoutePoint>;
  return (
    typeof slope === "number" &&
    isSlopeDegInRange(slope) &&
    typeof distance === "number" &&
    Number.isFinite(distance) &&
    distance > 0
  );
}

/**
 * 저장 포맷의 유일한 decoder다. 공개 지도와 관리자 편집 화면이 같은 규칙으로 읽어야
 * 한쪽이 버린 행을 다른 쪽이 열어 다시 저장하는 일이 없다.
 *
 * jsonb는 어떤 모양이든 담을 수 있고 slope_segments는 authenticated 전체에
 * 쓰기가 열려 있다. 못 쓰는 행은 부분 복구하지 않고 통째로 버린다. 좌표 일부를
 * 버리면 없던 선이 그려지고, 경사값이 깨진 행을 살리면 평지로 표시된다.
 */
export function readRoutePoints(raw: unknown): SlopeRoutePoints | null {
  if (!Array.isArray(raw) || raw.length < 2) return null;
  if (!raw.every(isCoordinate)) return null;
  const [start, ...rest] = raw as SlopeRouteStart[];
  if (!rest.every(hasValidMetrics)) return null;
  return [start, ...rest];
}
```

- [ ] **Step 5: 단위 테스트 통과 확인**

Run: `npx vitest run src/lib/slopeRoute.test.ts`
Expected: PASS

- [ ] **Step 6: `SlopeLayer.tsx`에서 GPX 계산 제거** — 파일 전체를 아래로 바꾼다. 색·문구는 아직 지금과 같다.

```tsx
"use client";
import { Polyline, Popup } from "react-leaflet";
import { slopeColor } from "@/lib/theme";
import { readRoutePoints } from "@/lib/slopeRoute";
import type { SlopeSegment } from "@/types/domain";

// /api/slopes는 id·name·segments만 select한다. Row 전체를 받는 것처럼 쓰면
// 런타임에 없는 필드를 있는 것으로 보증하게 된다.
type SlopeRoute = Pick<SlopeSegment, "id" | "name" | "segments">;

export default function SlopeLayer({ slopes }: { slopes: SlopeRoute[] }) {
  return slopes.flatMap((route) => {
    const points = readRoutePoints(route.segments);
    if (!points) return [];
    const [, ...measured] = points;

    return measured.map((point, i) => {
      const prev = points[i];
      const absoluteSlope = Math.abs(point.slope);
      return (
        <Polyline
          key={`${route.id}-${i}`}
          positions={[
            [prev.lat, prev.lng],
            [point.lat, point.lng],
          ]}
          pathOptions={{
            color: slopeColor(absoluteSlope),
            weight: 5,
            opacity: 0.85,
          }}
        >
          <Popup>
            <div style={{ fontSize: 13, lineHeight: 1.6 }}>
              <div style={{ fontWeight: 600, marginBottom: 2 }}>
                {route.name}
              </div>
              <div>
                경사 <strong>{absoluteSlope}%</strong>
              </div>
              <div style={{ color: "#888", fontSize: 11 }}>
                구간 거리 {point.distance}m
              </div>
            </div>
          </Popup>
        </Polyline>
      );
    });
  });
}
```

- [ ] **Step 7: 목록 페이지 GPX 정리** — `src/app/admin/dashboard/slopes/page.tsx`

  1. 6행 import를 `import type { SlopeSegment } from "@/types/domain";`로, 19행 `isManualRoute` import를 지운다. 21~47행 `buildGpx`·`downloadGpx`를 지운다.
  2. `REDIRECT_NOTICE`를 바꾼다.

```ts
const REDIRECT_NOTICE: Record<string, string> = {
  missing: "경로를 찾을 수 없어요. 이미 삭제됐을 수 있어요",
  invalid: "저장 형식이 깨진 경로라 열 수 없어요. 지우고 다시 그려주세요",
};
```

3. `buildAdminSearchFilter(["name", "gpx_file"], …)` → `buildAdminSearchFilter(["name"], …)`. `setSlopes((data ?? []) as unknown as SlopeSegment[])` → `setSlopes(data ?? [])`.
4. "GPX 등록은 종료됐어요…" 안내 `<div>`(158~170행)를 통째로 지운다.
5. `searchPlaceholder="경로명 또는 GPX 파일명 검색"` → `searchPlaceholder="경로명 검색"`.
6. 행 부제의 `{s.segments?.length ?? 0}개 포인트` → `{Array.isArray(s.segments) ? s.segments.length : 0}개 포인트`. 그 뒤 `isManualRoute(s) ? (직접 입력 배지) : ((파일명))` 삼항(280~299행)을 지운다.
7. 행 버튼의 `isManualRoute(s) ? (수정 버튼) : (다운로드 버튼)` 삼항(303~335행)을 수정 버튼만 남긴다.

- [ ] **Step 8: 편집 페이지가 decoder를 거치게** — `src/app/admin/slopes/[id]/page.tsx` 전체를 아래로 바꾼다.

```tsx
"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import SlopeRouteEditor from "@/components/SlopeRouteEditor";
import Toast from "@/components/Toast";
import {
  readRoutePoints,
  readStoredSlopes,
  readStoredVertices,
  type Vertex,
} from "@/lib/slopeRoute";
import type { SlopeRoutePoints } from "@/types/domain";
import type { Json } from "@supabase-types";
import "../../admin-ui.css";

export default function EditSlopeRoutePage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [vertices, setVertices] = useState<Vertex[]>([]);
  const [slopes, setSlopes] = useState<(number | null)[]>([]);
  const [loadedAt, setLoadedAt] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: string } | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (cancelled) return;
      if (!user) {
        router.push("/admin");
        return;
      }

      const { data, error } = await supabase
        .from("slope_segments")
        .select("*")
        .eq("id", params.id)
        .single();

      if (cancelled) return;

      // 리다이렉트가 즉시 언마운트되어 여기서 Toast를 띄워도 안 보이므로,
      // 사유를 목록 페이지로 넘겨 거기서 안내한다.
      if (error || !data) {
        router.push("/admin/dashboard/slopes?redirected=missing");
        return;
      }
      const points = readRoutePoints(data.segments);
      if (!points) {
        router.push("/admin/dashboard/slopes?redirected=invalid");
        return;
      }

      setName(data.name);
      setLoadedAt(data.updated_at);
      setVertices(readStoredVertices(points));
      setSlopes(readStoredSlopes(points));
      setLoading(false);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [params.id, router]);

  async function handleSave(nextName: string, segments: SlopeRoutePoints) {
    setSaving(true);
    // 화면을 연 뒤 행이 바뀌었을 수 있다. 조건을 쓰기에 같이 걸어 마지막
    // 저장이 조용히 이기는 것을 막는다. 조건이 안 맞으면 PostgREST는 오류가
    // 아니라 0행을 준다.
    const { data, error } = await supabase
      .from("slope_segments")
      .update({
        name: nextName,
        segments: segments as unknown as Json,
      })
      .eq("id", params.id)
      .eq("updated_at", loadedAt ?? "")
      .select("id");
    setSaving(false);
    if (error) {
      setToast({ message: "저장 실패: " + error.message, type: "error" });
      return;
    }
    if (!data?.length) {
      setToast({
        message:
          "다른 곳에서 바뀌었거나 삭제된 경로예요. 새로고침해서 확인해주세요",
        type: "error",
      });
      return;
    }
    router.push("/admin/dashboard/slopes");
  }

  if (loading) return null;

  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 24 }}>
        경사도 경로 수정
      </h1>
      <SlopeRouteEditor
        // 편집기와 지도는 초기 props를 마운트 때 한 번만 읽는다. id가 바뀌면
        // 새로 세우지 않는 한 이전 경로의 선과 입력값이 남는다.
        key={params.id}
        initialName={name}
        initialVertices={vertices}
        initialSlopes={slopes}
        saving={saving}
        onSave={handleSave}
        onCancel={() => router.push("/admin/dashboard/slopes")}
      />
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 9: 타입 따라가기**
  - `src/app/admin/slopes/new/page.tsx`: `import type { SlopePoint } …` → `import type { SlopeRoutePoints } from "@/types/domain";`, `handleSave(name: string, segments: SlopePoint[])` → `segments: SlopeRoutePoints`.
  - `src/components/SlopeRouteEditor.tsx`: 13행 import를 `SlopeRoutePoints`로, 40행 `onSave: (name: string, segments: SlopeRoutePoints) => void | Promise<void>;`.

Run: `npm run typecheck`
Expected: PASS. 남은 `SlopePoint`·`isManualRoute` 참조가 있으면 여기서 드러난다 — `rg -n "SlopePoint\b|isManualRoute" src e2e`로 확인하고 고친다.

- [ ] **Step 10: 목 백엔드의 GPX 행을 수기 경로로** — `e2e/support/mockBackend.ts`의 `slopes` 첫 행(id 1)을 바꾼다. 지우지 않는 이유: 목록 검색 E2E가 "중앙광장"으로 1건, 초기화로 2건을 단언한다.

```ts
      {
        id: 1,
        name: "정문-중앙광장",
        gpx_file: null,
        segments: [
          { lat: 37.589, lng: 127.032 },
          { lat: 37.5892, lng: 127.0322, slope: 3, distance: 28.4 },
        ],
        created_at: "2026-07-21T00:00:00Z",
        updated_at: "2026-07-22T00:00:00Z",
      },
```

id 2 행의 `ele: null` 키는 그대로 둔다 — 운영 행과 같은 모양을 decoder가 받아야 한다.

- [ ] **Step 11: E2E를 새 계약으로** — `e2e/admin-buildings-slopes.spec.ts`

  1. "GPX 경로를 다운로드하고 삭제한다"(359행)를 아래로 바꾼다.

```ts
test("경로를 삭제한다", async ({ page }) => {
  await installMockBackend(page, { authenticated: true });
  await page.goto("/admin/dashboard/slopes");

  const row = page.getByText("정문-중앙광장").locator("xpath=../..");
  await row.getByRole("button", { name: "삭제" }).click();
  const deleteConfirm = page
    .getByText('"정문-중앙광장" 경로를 삭제할까요?')
    .locator("..");
  await expect(deleteConfirm).toBeVisible();
  await deleteConfirm.getByRole("button", { name: "취소" }).click();
  await expect(page.getByText("정문-중앙광장", { exact: true })).toBeVisible();

  await row.getByRole("button", { name: "삭제" }).click();
  await page.getByRole("button", { name: "경로 삭제" }).click();
  await expect(page.getByText("정문-중앙광장", { exact: true })).toHaveCount(0);
});
```

2. "수기 경로와 GPX 경로의 행 동작을 구분한다"(387행)를 아래로 바꾼다.

```ts
test("목록에 GPX 안내·다운로드가 남지 않는다", async ({ page }) => {
  await installMockBackend(page, { authenticated: true });
  await page.goto("/admin/dashboard/slopes");

  await expect(page.getByText("안암병원 정문 경사로")).toBeVisible();
  await expect(page.getByText(/GPX/)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "다운로드" })).toHaveCount(0);
  await expect(
    page.getByRole("searchbox", { name: "경사도 경로 검색" }),
  ).toHaveAttribute("placeholder", "경로명 검색");
});
```

3. 다음 세 테스트를 지운다: "GPX 경로 id로 수정 화면에 가면 목록으로 돌려보낸다"(427행), "GPX 업로드를 닫고 종료 안내를 보여준다"(508행), "열어둔 사이 GPX 행이 되면 측정 원본을 덮지 않는다"(659행).
4. "사유 없이 목록에 들어가면 GPX 안내가 뜨지 않는다"(440행)를 아래로 바꾼다.

```ts
test("사유 없이 목록에 들어가면 리다이렉트 안내가 뜨지 않는다", async ({
  page,
}) => {
  await installMockBackend(page, { authenticated: true });
  await page.goto("/admin/dashboard/slopes");
  await expect(page.getByText("저장 형식이 깨진 경로라")).toHaveCount(0);
  await expect(page.getByText("경로를 찾을 수 없어요")).toHaveCount(0);
});
```

5. "없는 경로 id로 수정 화면에 가면…"(608행) 바로 뒤에 추가한다.

```ts
test("저장 형식이 깨진 경로는 열지 않고 목록에서 알린다", async ({ page }) => {
  const state = await installMockBackend(page, { authenticated: true });
  const row = state.slopes.find((slope) => slope.id === 2)!;
  row.segments = [
    { lat: 37.5861, lng: 127.0268 },
    { lat: 37.5862, lng: 127.0269, distance: 12.4 },
  ];

  await page.goto("/admin/slopes/2");
  await expect(page).toHaveURL(/\/admin\/dashboard\/slopes$/);
  await expect(
    page.getByText("저장 형식이 깨진 경로라 열 수 없어요"),
  ).toBeVisible();
});
```

6. "구간 값을 넣어 저장하면 수기 경로 포맷으로 들어간다"(678행)의 제목을 "구간 값을 넣어 저장하면 저장 포맷으로 들어간다"로 바꾸고, `expect(segments[0].slope).toBeUndefined(); expect(segments[0].ele).toBeNull();` 두 줄을 아래 한 줄로 바꾼다.

```ts
expect(segments[0]).toEqual({
  lat: expect.any(Number),
  lng: expect.any(Number),
});
```

- [ ] **Step 12: 검증**

```bash
npm test
npm run typecheck
npm run lint
npx playwright test e2e/admin-buildings-slopes.spec.ts e2e/public-map.spec.ts e2e/admin-dark.spec.ts
```

Expected: 모두 PASS

- [ ] **Step 13: 커밋**

```bash
git add src/types/domain.ts src/lib/slopeRoute.ts src/lib/slopeRoute.test.ts src/components/map/SlopeLayer.tsx src/app/admin/dashboard/slopes/page.tsx "src/app/admin/slopes/[id]/page.tsx" src/app/admin/slopes/new/page.tsx src/components/SlopeRouteEditor.tsx e2e/support/mockBackend.ts e2e/admin-buildings-slopes.spec.ts
git commit -m "refactor(slope): 저장 포맷을 한 decoder로 읽고 GPX 분기를 걷어낸다"
```

---

### Task 3: 판정·표시를 도 기준으로 (설계 3.2·3.4·4장)

**Files:**

- Modify: `src/lib/slopeRoute.ts` (경고·범위)
- Test: `src/lib/slopeRoute.test.ts`
- Modify: `src/components/slope/SlopeSegmentList.tsx`
- Modify: `src/components/slope/SlopeRouteMap.tsx:10,197`
- Modify: `src/components/map/SlopeLayer.tsx`
- Modify: `src/components/map/SlopeLegend.tsx`, `src/components/map/map-ui.css`
- Modify: `src/lib/theme.ts:43-51`
- Test: `e2e/admin-buildings-slopes.spec.ts`

**Interfaces:**

- Consumes: `slopeColorFromDeg`, `slopeWarningFromDeg`, `isSlopeDegInRange`, `degToPercent`, `percentToDeg`, `formatPercent`, `formatDeg`, `SLOPE_BANDS`, `SLOPE_REFERENCE_LINES` (작업 1)
- Produces: `validateRoute(name, vertices, slopes /* 도 */)` — 범위 오류 문구 `"N번 구간의 경사도는 0~45°(0~100%) 사이여야 해요"`. `slopeRoute.ts`의 `LEGAL_SLOPE_LIMIT`·`EXTREME_SLOPE_LIMIT`·`MAX_SLOPE_INPUT`·`slopeWarning`과 `theme.ts`의 `slopeColor`는 없어진다

- [ ] **Step 1: 단위 테스트를 새 범위 규칙으로** — `src/lib/slopeRoute.test.ts`

  1. import에서 `slopeWarning`을 지운다. `describe("slopeWarning", …)` 전체를 지운다(작업 1의 `slopeWarningFromDeg` 테스트가 대신한다).
  2. `describe("validateRoute", …)`의 "음수를 막는다", "100까지 허용하고 100 초과를 막는다", "30을 넘어도 저장은 막지 않는다"를 아래로 바꾼다.

```ts
const RANGE_ERROR = "1번 구간의 경사도는 0~45°(0~100%) 사이여야 해요";

it("음수를 막는다", () => {
  expect(validateRoute("이름", [A, B], [-0.1])).toContain(RANGE_ERROR);
});

it("45°까지 허용하고 45° 초과를 막는다", () => {
  expect(validateRoute("이름", [A, B], [45])).toEqual([]);
  expect(validateRoute("이름", [A, B], [45.01])).toContain(RANGE_ERROR);
});

// tan은 주기 함수라 %로 바꿔 검사하면 181°가 1.75%로 통과한다(설계 3.2).
it("tan 주기성으로 범위를 비켜 가지 못한다", () => {
  for (const deg of [181, -179, 200]) {
    expect(validateRoute("이름", [A, B], [deg])).toContain(RANGE_ERROR);
  }
});

// 30%는 경고일 뿐 저장은 된다. 실제로 존재하는 급경사를 막으면 안 된다.
it("30%를 넘어도 저장은 막지 않는다", () => {
  expect(validateRoute("이름", [A, B], [20])).toEqual([]);
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/lib/slopeRoute.test.ts`
Expected: FAIL — 범위 문구가 다르고 181°가 통과함

- [ ] **Step 3: `slopeRoute.ts` 구현**
  1. 15~20행(`LEGAL_SLOPE_LIMIT`·`EXTREME_SLOPE_LIMIT`·`MAX_SLOPE_INPUT`과 그 주석)과 `slopeWarning` 함수를 지운다.
  2. `validateRoute`의 경사 검사 블록을 아래로 바꾼다.

```ts
slopes.forEach((slope, index) => {
  const label = `${index + 1}번 구간의 경사도`;
  if (slope === null) {
    errors.push(`${label}를 입력해주세요`);
    return;
  }
  if (!Number.isFinite(slope)) {
    errors.push(`${label}가 숫자가 아니에요`);
    return;
  }
  if (!isSlopeDegInRange(slope)) {
    errors.push(`${label}는 0~45°(0~100%) 사이여야 해요`);
  }
});
```

Run: `npx vitest run src/lib/slopeRoute.test.ts` → PASS

- [ ] **Step 4: 입력 목록의 경고와 단위 표기** — `src/components/slope/SlopeSegmentList.tsx`
  1. 3행 import를 아래로 바꾼다.

```ts
import type { RouteSegment } from "@/lib/slopeRoute";
import { slopeWarningFromDeg } from "@/lib/slopeScale";
```

2. `WARNING_TEXT`를 바꾼다.

```ts
const WARNING_TEXT = {
  "relaxed-limit": "1/12 완화 한도 초과",
  extreme: "이 값이 맞나요? 30%(약 16.7°)를 넘는 보행 경사로는 매우 드뭅니다",
} as const;
```

3. `slopeWarning(value)` → `slopeWarningFromDeg(value)`. 입력란 옆 `<span style={{ fontSize: 13 }}>%</span>` → `°`. (작업 5에서 단위 선택으로 다시 바뀐다.)

- [ ] **Step 5: 지도 색** — `SlopeRouteMap.tsx` 10행 `import { slopeColor } from "@/lib/theme";` → `import { slopeColorFromDeg } from "@/lib/slopeScale";`, 197행 `color: slopeColor(Math.abs(slope))` → `color: slopeColorFromDeg(slope)`.

- [ ] **Step 6: 공개 지도 선과 팝업** — `SlopeLayer.tsx`
  1. `import { slopeColor } from "@/lib/theme";` → `import { degToPercent, formatDeg, formatPercent, slopeColorFromDeg } from "@/lib/slopeScale";`
  2. `const absoluteSlope = Math.abs(point.slope);` 줄을 지우고 `color: slopeColorFromDeg(point.slope)`.
  3. 팝업의 경사 줄을 바꾼다.

```tsx
<div>
  경사 <strong>{formatPercent(degToPercent(point.slope))}</strong> (
  {formatDeg(point.slope)})
</div>
```

- [ ] **Step 7: 범례** — `src/components/map/SlopeLegend.tsx` 전체를 바꾼다.

```tsx
"use client";

import {
  SLOPE_BANDS,
  SLOPE_REFERENCE_LINES,
  percentToDeg,
} from "@/lib/slopeScale";

function trim(value: number) {
  return String(Number(value.toFixed(2)));
}

function bandLabel(index: number) {
  const upper = SLOPE_BANDS[index].maxPercent;
  if (index === 0) {
    return `평지 · ${trim(upper)}% 이하 (${trim(percentToDeg(upper))}°)`;
  }
  const lower = SLOPE_BANDS[index - 1].maxPercent;
  if (upper === Infinity) {
    return `${trim(lower)}% 초과 (${trim(percentToDeg(lower))}°~)`;
  }
  return `${trim(lower)} – ${trim(upper)}% (${trim(percentToDeg(lower))}–${trim(percentToDeg(upper))}°)`;
}

export default function SlopeLegend({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <div className="ku-slope-legend" aria-label="경사도 범례">
      <div className="ku-slope-legend-title">경사도 범례</div>
      {SLOPE_BANDS.map((band, index) => (
        <div className="ku-slope-row" key={band.color}>
          <span
            className="ku-slope-line"
            style={{ "--slope-color": band.color } as React.CSSProperties}
          />
          <span>{bandLabel(index)}</span>
        </div>
      ))}
      {SLOPE_REFERENCE_LINES.map((line) => (
        <div className="ku-slope-threshold" key={line.ratioLabel}>
          ▶ {line.label} {line.ratioLabel} · {trim(line.percent)}% ·{" "}
          {trim(percentToDeg(line.percent))}°
        </div>
      ))}
    </div>
  );
}
```

`src/components/map/map-ui.css`의 `.ku-slope-threshold` 규칙 바로 뒤에 추가한다.

```css
.ku-slope-threshold + .ku-slope-threshold {
  margin-top: 2px;
  padding-top: 0;
  border-top: 0;
}
```

- [ ] **Step 8: `theme.ts`의 `slopeColor` 제거** — 43~51행 함수를 지운다. `rg -n "slopeColor\b" src` 결과가 0이어야 한다.

- [ ] **Step 9: E2E 기대값을 도 의미로** — `e2e/admin-buildings-slopes.spec.ts`
  1. "수정 화면을 열면 불러온 경사값으로 미리보기 선이 그려진다": `"#C96C24"` → `"#AE3B1E"` (7.2° = 12.63%).
  2. "법적 기준과 급경사 경고를 표시하되 저장은 막지 않는다": 제목을 "완화 한도와 급경사 경고를 표시하되 저장은 막지 않는다"로, `"법적 기준(1/12) 초과"` → `"1/12 완화 한도 초과"`, `"이 값이 맞나요? 30%를 넘는 보행 경사로는 매우 드뭅니다"` → `"이 값이 맞나요? 30%(약 16.7°)를 넘는 보행 경사로는 매우 드뭅니다"`. `120` 입력 단언은 그대로 두고 그 뒤에 추가한다.

```ts
// tan(181°)는 1.75%다. % 기준 범위 검사라면 통과해 버린다(설계 3.2).
await page.getByLabel("구간 1 경사도").fill("181");
await expect(page.getByRole("button", { name: "경로 저장" })).toBeDisabled();
```

3. "입력한 경사도에 따라 미리보기 선 색이 바뀐다": 마지막 `"#AE3B1E"` → `"#7A1414"` (10° = 17.63%).
4. "편집기에서 저장한 경로가 공개 지도에 그대로 그려진다": 주석과 셀렉터·팝업 단언을 바꾼다.

```ts
// 10°는 17.63%라 15% 초과 칸 #7A1414다(src/lib/slopeScale.ts).
// 픽스처의 두 행(3° #DDC26A, 7.2° #AE3B1E)은 이 색이 아니라 방금 저장한 경로만 잡힌다.
const saved = page.locator('path[stroke="#7A1414"]').first();
await expect(saved).toBeVisible();

await saved.dispatchEvent("click");
const popup = page.locator(".leaflet-popup");
await expect(popup).toContainText("끝단 시험 경사로");
await expect(popup).toContainText("17.6%");
await expect(popup).toContainText("10.0°");
```

- [ ] **Step 10: 검증**

```bash
npm test
npm run typecheck
npm run lint
npx playwright test e2e/admin-buildings-slopes.spec.ts e2e/public-map.spec.ts e2e/admin-dark.spec.ts
```

Expected: 모두 PASS

- [ ] **Step 11: 커밋**

```bash
git add src/lib/slopeRoute.ts src/lib/slopeRoute.test.ts src/components/slope/SlopeSegmentList.tsx src/components/slope/SlopeRouteMap.tsx src/components/map/SlopeLayer.tsx src/components/map/SlopeLegend.tsx src/components/map/map-ui.css src/lib/theme.ts e2e/admin-buildings-slopes.spec.ts
git commit -m "fix(slope): 도로 저장된 경사를 %로 읽던 색·경고·범례를 바로잡는다"
```

---

### Task 4: 편집기 배치와 지도 표시 (설계 5.1·5.2·5.3·5.6)

**Files:**

- Modify: `src/components/SlopeRouteEditor.tsx` (그리드 → 수직)
- Modify: `src/components/slope/SlopeRouteMap.tsx`
- Modify: `src/components/PolygonEditor.tsx`
- Modify: `src/app/admin/admin-ui.css`
- Test: `e2e/admin-buildings-slopes.spec.ts`

**Interfaces:**

- Produces: 지도 컨테이너 클래스 `ku-slope-route-map`, 구간 번호표 클래스 `ku-slope-segment-label` (작업 6·7이 같은 effect 구조를 쓴다)

- [ ] **Step 1: 실패하는 E2E 작성** — `e2e/admin-buildings-slopes.spec.ts` 끝(`});` 앞)에 추가한다.

```ts
test("편집기 지도는 19까지 확대된다", async ({ page }) => {
  await installMockBackend(page, { authenticated: true });
  await page.goto("/admin/slopes/new");

  const zoomIn = page.locator(".leaflet-control-zoom-in");
  await expect(zoomIn).not.toHaveClass(/leaflet-disabled/);
  await zoomIn.click();
  await expect(zoomIn).toHaveClass(/leaflet-disabled/);
});

test("선을 끝내면 구간마다 번호표가 뜬다", async ({ page }) => {
  await installMockBackend(page, { authenticated: true });
  await page.goto("/admin/slopes/new");

  const map = page.locator(".leaflet-container");
  await page.locator(".leaflet-pm-icon-polyline").locator("..").click();
  const points = [
    { x: 300, y: 120 },
    { x: 420, y: 180 },
    { x: 520, y: 260 },
  ];
  for (const position of points) await map.click({ position });
  await expect(page.locator(".ku-slope-segment-label")).toHaveCount(0);
  await map.click({ position: points[2] });

  const labels = page.locator(".ku-slope-segment-label");
  await expect(labels).toHaveCount(2);
  await expect(labels.nth(0)).toHaveText("1");
  await expect(labels.nth(1)).toHaveText("2");
});

test("그리기 도구 문구가 한국어다", async ({ page }) => {
  await installMockBackend(page, { authenticated: true });
  await page.goto("/admin/slopes/new");

  await page.locator(".leaflet-pm-icon-polyline").locator("..").click();
  const actions = page.locator(".leaflet-pm-actions-container");
  await expect(actions.getByText("끝내기")).toBeVisible();
  await expect(actions.getByText("마지막 꼭지점 제거")).toBeVisible();
});

test("모바일 폭에서도 지도가 화면 폭을 쓴다", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await installMockBackend(page, { authenticated: true });
  await page.goto("/admin/slopes/new");

  // 페이지 좌우 패딩 24px을 빼면 327px다. 2열 그리드일 때는 47px이었다.
  const box = await page.locator(".leaflet-container").boundingBox();
  expect(box!.width).toBeGreaterThanOrEqual(320);
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx playwright test e2e/admin-buildings-slopes.spec.ts -g "19까지|번호표|한국어|모바일 폭"`
Expected: 4건 FAIL

- [ ] **Step 3: 수직 배치** — `SlopeRouteEditor.tsx`의 `display: "grid"` 블록(130~150행)을 아래로 바꾼다.

```tsx
<div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
  <SlopeRouteMap
    initialVertices={initialVertices}
    onVerticesChange={handleVerticesChange}
    slopes={slopes}
    onResetReady={(reset) => {
      resetMapRef.current = reset;
    }}
  />
  <SlopeSegmentList
    segments={segments}
    slopes={slopes}
    onSlopeChange={handleSlopeChange}
  />
</div>
```

- [ ] **Step 4: 지도 — 줌·한국어·번호표** — `SlopeRouteMap.tsx`
  1. ref 선언부에 추가: `const labelsRef = useRef<L.LayerGroup | null>(null);`
  2. 지도 생성(60~63행)을 바꾼다. 처음 줌은 지금 실제로 보이던 18이다(설계 5.3).

```ts
const map = L.map(containerRef.current!, {
  scrollWheelZoom: true,
  maxZoom: 19,
}).setView(center, 18);
```

3. 타일 레이어 옵션에 `maxZoom: 19`를 더한다.
4. `previewRef.current = L.layerGroup(…)` 다음 줄에 `labelsRef.current = L.layerGroup().addTo(map);`
5. `map.pm.addControls({` 바로 앞에 `map.pm.setLang("ko");`
6. cleanup에 `labelsRef.current = null;`
7. 미리보기 effect(182~209행)를 바꾼다. 번호표는 값 입력과 무관하게 모든 구간에 단다.

```ts
useEffect(() => {
  const group = previewRef.current;
  const labels = labelsRef.current;
  if (!group || !labels) return;
  group.clearLayers();
  labels.clearLayers();
  const vertices = verticesRef.current;
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

    const slope = slopes[i];
    if (slope === null || slope === undefined || !Number.isFinite(slope))
      continue;
    L.polyline(
      [
        [from.lat, from.lng],
        [to.lat, to.lng],
      ],
      {
        color: slopeColorFromDeg(slope),
        weight: 8,
        opacity: 0.85,
        // geoman이 편집 대상으로 잡지 않게 한다. 없으면 색칠용 선에
        // 꼭짓점 핸들이 붙는다.
        pmIgnore: true,
        // 편집선으로 가야 할 클릭을 가로채지 않게 한다.
        interactive: false,
        pane: "slopePreview",
      },
    ).addTo(group);
  }
}, [slopes, vertexVersion]);
```

8. 반환 JSX의 `<div ref={containerRef}` 에 `className="ku-slope-route-map"`를 더한다.

- [ ] **Step 5: 건물 영역 편집기도 한국어** — `PolygonEditor.tsx`의 `map.pm.addControls({` 바로 앞에 `map.pm.setLang("ko");`. geoman 언어는 전역이라 한쪽만 켜면 세션마다 달라진다(설계 5.6).

- [ ] **Step 6: CSS** — `src/app/admin/admin-ui.css` 끝에 추가한다.

```css
/* 경사도 편집기 — 설계 2026-10-06 5.2·5.6 */
.ku-slope-route-map .ku-slope-segment-label {
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  border: 2px solid var(--ku-text-1);
  border-radius: 50%;
  background: var(--ku-surface);
  color: var(--ku-text-1);
  font-size: 12px;
  font-weight: 700;
}
.ku-slope-route-map .button-container.active .leaflet-pm-actions-container {
  display: flex;
  flex-direction: column;
}
.ku-slope-route-map
  .button-container
  .leaflet-pm-actions-container
  .leaflet-pm-action {
  border-right: 0;
  border-bottom: 1px solid #eee;
  border-radius: 0;
}
```

- [ ] **Step 7: 통과 확인**

Run: `npx playwright test e2e/admin-buildings-slopes.spec.ts e2e/admin-dark.spec.ts`
Expected: PASS (새 4건 포함). 기존 그리기 테스트는 지도 안 픽셀 좌표를 쓰므로 배치가 바뀌어도 그대로 통과해야 한다.

- [ ] **Step 8: 커밋**

```bash
git add src/components/SlopeRouteEditor.tsx src/components/slope/SlopeRouteMap.tsx src/components/PolygonEditor.tsx src/app/admin/admin-ui.css e2e/admin-buildings-slopes.spec.ts
git commit -m "feat(slope): 편집기를 위아래로 놓고 줌 19·구간 번호·한국어 도구를 단다"
```

---

### Task 5: 입력 단위 선택 (설계 3.3)

**Files:**

- Modify: `src/components/SlopeRouteEditor.tsx`
- Modify: `src/components/slope/SlopeSegmentList.tsx` (전체 교체)
- Test: `e2e/admin-buildings-slopes.spec.ts`

**Interfaces:**

- Consumes: `SlopeUnit`, `toDegrees`, `formatSlopeInput`, `degToPercent`, `formatPercent`, `formatDeg`, `isSlopeDegInRange`, `slopeWarningFromDeg` (작업 1)
- Produces: `SlopeSegmentList` props — `{ segments; drafts: string[]; slopes: (number | null)[] /*도*/; unit: SlopeUnit; onDraftChange(index, raw) }`. 라디오 접근 이름 `도(°)`·`퍼센트(%)`. 환산값 클래스 `ku-slope-converted`

- [ ] **Step 1: 실패하는 E2E 작성** — 같은 파일 끝에 추가한다.

```ts
test("퍼센트로 입력하면 도로 바꿔 저장한다", async ({ page }) => {
  const state = await installMockBackend(page, { authenticated: true });
  await page.goto("/admin/slopes/new");

  const map = page.locator(".leaflet-container");
  await page.locator(".leaflet-pm-icon-polyline").locator("..").click();
  const points = [
    { x: 300, y: 120 },
    { x: 420, y: 180 },
  ];
  for (const position of points) await map.click({ position });
  await map.click({ position: points[1] });

  await page.getByLabel("경로 이름").fill("퍼센트 입력 시험");
  await page.getByRole("radio", { name: "퍼센트(%)" }).check();
  await page.getByLabel("구간 1 경사도").fill("12.5");
  await page.getByRole("button", { name: "경로 저장" }).click();
  await expect(page).toHaveURL(/\/admin\/dashboard\/slopes$/);

  const saved = state.slopes[state.slopes.length - 1];
  const segments = saved.segments as Array<Record<string, unknown>>;
  // atan(0.125) = 7.12501634890…°. 반올림 없이 저장한다(설계 2.2).
  expect(segments[1].slope as number).toBeCloseTo(7.1250163489, 9);
});

test("다른 단위 환산값을 보여주고 단위를 바꿔도 값이 유지된다", async ({
  page,
}) => {
  await installMockBackend(page, { authenticated: true });
  await page.goto("/admin/slopes/new");

  const map = page.locator(".leaflet-container");
  await page.locator(".leaflet-pm-icon-polyline").locator("..").click();
  const points = [
    { x: 300, y: 120 },
    { x: 420, y: 180 },
  ];
  for (const position of points) await map.click({ position });
  await map.click({ position: points[1] });

  const input = page.getByLabel("구간 1 경사도");
  await input.fill("10");
  await expect(page.getByText("= 17.6%")).toBeVisible();

  await page.getByRole("radio", { name: "퍼센트(%)" }).check();
  await expect(input).toHaveValue("17.63");
  await expect(page.getByText("= 10.0°")).toBeVisible();

  await page.getByRole("radio", { name: "도(°)" }).check();
  await expect(input).toHaveValue("10");
});

test("고른 입력 단위를 기억한다", async ({ page }) => {
  await installMockBackend(page, { authenticated: true });
  await page.goto("/admin/slopes/new");
  await page.getByRole("radio", { name: "퍼센트(%)" }).check();

  await page.reload();
  await expect(page.getByRole("radio", { name: "퍼센트(%)" })).toBeChecked();
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx playwright test e2e/admin-buildings-slopes.spec.ts -g "퍼센트|환산값|기억"`
Expected: 3건 FAIL — 라디오가 없음

- [ ] **Step 3: `SlopeSegmentList.tsx` 전체 교체**

```tsx
"use client";

import type { RouteSegment } from "@/lib/slopeRoute";
import {
  degToPercent,
  formatDeg,
  formatPercent,
  isSlopeDegInRange,
  slopeWarningFromDeg,
  type SlopeUnit,
} from "@/lib/slopeScale";

interface SlopeSegmentListProps {
  segments: RouteSegment[];
  /** 입력란 문자열. 고른 단위 그대로다 */
  drafts: string[];
  /** 저장될 값(도). 경고와 환산값은 이것으로 계산한다 */
  slopes: (number | null)[];
  unit: SlopeUnit;
  onDraftChange: (index: number, raw: string) => void;
}

const WARNING_TEXT = {
  "relaxed-limit": "1/12 완화 한도 초과",
  extreme: "이 값이 맞나요? 30%(약 16.7°)를 넘는 보행 경사로는 매우 드뭅니다",
} as const;

const UNIT_SYMBOL: Record<SlopeUnit, string> = { deg: "°", percent: "%" };

export default function SlopeSegmentList({
  segments,
  drafts,
  slopes,
  unit,
  onDraftChange,
}: SlopeSegmentListProps) {
  if (segments.length === 0) {
    return (
      <div style={{ fontSize: 13, color: "var(--ku-text-3)" }}>
        지도에서 경로를 그리면 구간이 나타납니다.
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {segments.map((segment) => {
        const value = slopes[segment.index];
        const measured =
          value !== null && value !== undefined && isSlopeDegInRange(value)
            ? value
            : null;
        const warning =
          measured === null ? null : slopeWarningFromDeg(measured);
        const converted =
          measured === null
            ? null
            : unit === "deg"
              ? formatPercent(degToPercent(measured))
              : formatDeg(measured);
        return (
          <div
            key={segment.index}
            style={{
              border: "1px solid var(--ku-border)",
              borderRadius: 8,
              padding: 12,
            }}
          >
            <label
              htmlFor={`slope-${segment.index}`}
              style={{ fontSize: 13, fontWeight: 600 }}
            >
              구간 {segment.index + 1}
            </label>
            <span
              style={{
                fontSize: 12,
                color: "var(--ku-text-3)",
                marginLeft: 8,
              }}
            >
              {segment.distance}m
            </span>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                marginTop: 6,
              }}
            >
              <input
                id={`slope-${segment.index}`}
                aria-label={`구간 ${segment.index + 1} 경사도`}
                type="number"
                step="0.1"
                inputMode="decimal"
                value={drafts[segment.index] ?? ""}
                onChange={(event) =>
                  onDraftChange(segment.index, event.target.value)
                }
                style={{
                  width: 110,
                  padding: "8px 10px",
                  border: "1px solid var(--ku-border)",
                  borderRadius: 8,
                  fontSize: 14,
                }}
              />
              <span style={{ fontSize: 13 }}>{UNIT_SYMBOL[unit]}</span>
              {converted && (
                <span
                  className="ku-slope-converted"
                  style={{ fontSize: 12, color: "var(--ku-text-3)" }}
                >
                  = {converted}
                </span>
              )}
            </div>
            {warning && (
              <div
                style={{
                  marginTop: 6,
                  fontSize: 12,
                  color:
                    warning === "extreme"
                      ? "var(--ku-danger)"
                      : "var(--ku-text-2)",
                }}
              >
                {WARNING_TEXT[warning]}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: 편집기 상태** — `SlopeRouteEditor.tsx`
  1. import에 추가: `import { formatSlopeInput, toDegrees, type SlopeUnit } from "@/lib/slopeScale";`
  2. 컴포넌트 밖(`verticesEqual` 위)에 추가한다.

```ts
const UNIT_STORAGE_KEY = "ku_slope_input_unit";

// 편집기는 부모 페이지가 인증을 확인한 뒤에만 그려 서버 렌더링을 거치지 않는다.
// 그래서 첫 렌더에서 localStorage를 읽어도 hydration이 어긋나지 않는다.
function readUnitPreference(): SlopeUnit {
  try {
    return localStorage.getItem(UNIT_STORAGE_KEY) === "percent"
      ? "percent"
      : "deg";
  } catch {
    return "deg";
  }
}

function writeUnitPreference(unit: SlopeUnit) {
  try {
    localStorage.setItem(UNIT_STORAGE_KEY, unit);
  } catch {
    // 기억하지 못해도 입력은 된다.
  }
}
```

3. 상태 선언(`const [slopes, …]` 다음)에 추가한다.

```ts
const [unit, setUnit] = useState<SlopeUnit>(readUnitPreference);
const [drafts, setDrafts] = useState<string[]>(() =>
  initialSlopes.map((slope) =>
    slope === null ? "" : formatSlopeInput(slope, unit),
  ),
);
```

4. `handleVerticesChange`를 바꾼다.

```ts
const handleVerticesChange = useCallback((next: Vertex[]) => {
  setVertices(next);
  const count = Math.max(0, next.length - 1);
  setSlopes((prev) =>
    prev.length === count ? prev : Array.from({ length: count }, () => null),
  );
  setDrafts((prev) =>
    prev.length === count ? prev : Array.from({ length: count }, () => ""),
  );
}, []);
```

5. `handleSlopeChange`를 지우고 아래 둘을 둔다.

```ts
function handleDraftChange(index: number, raw: string) {
  setDrafts((prev) => prev.map((draft, i) => (i === index ? raw : draft)));
  const value = raw === "" ? null : toDegrees(Number(raw), unit);
  setSlopes((prev) => prev.map((slope, i) => (i === index ? value : slope)));
}

function handleUnitChange(next: SlopeUnit) {
  setUnit(next);
  writeUnitPreference(next);
  // 저장될 도 값은 그대로 두고 입력란 문자열만 새 단위로 다시 쓴다(설계 3.3).
  setDrafts((prev) =>
    slopes.map((slope, index) =>
      slope === null || !Number.isFinite(slope)
        ? (prev[index] ?? "")
        : formatSlopeInput(slope, next),
    ),
  );
}
```

6. 작업 4의 수직 블록에서 `SlopeSegmentList` 앞에 단위 선택을 넣고 props를 바꾼다.

```tsx
        <fieldset
          style={{
            border: 0,
            padding: 0,
            margin: 0,
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: 16,
            fontSize: 13,
          }}
        >
          <legend style={{ padding: 0, fontWeight: 600, marginBottom: 6 }}>
            경사 단위
          </legend>
          {(["deg", "percent"] as const).map((option) => (
            <label
              key={option}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                cursor: "pointer",
              }}
            >
              <input
                type="radio"
                name="slope-unit"
                value={option}
                checked={unit === option}
                onChange={() => handleUnitChange(option)}
              />
              {option === "deg" ? "도(°)" : "퍼센트(%)"}
            </label>
          ))}
        </fieldset>
        <SlopeSegmentList
          segments={segments}
          drafts={drafts}
          slopes={slopes}
          unit={unit}
          onDraftChange={handleDraftChange}
        />
```

- [ ] **Step 5: 통과 확인**

Run: `npx playwright test e2e/admin-buildings-slopes.spec.ts e2e/admin-dark.spec.ts && npm run typecheck && npm run lint`
Expected: PASS. 기존 "수기 경로를 열어 값을 고쳐 저장한다"가 입력란 `7.2`와 저장 `9.4`를 그대로 통과해야 한다(기본 단위가 도).

- [ ] **Step 6: 커밋**

```bash
git add src/components/SlopeRouteEditor.tsx src/components/slope/SlopeSegmentList.tsx e2e/admin-buildings-slopes.spec.ts
git commit -m "feat(slope): 경사를 도와 퍼센트 중 골라 입력하고 도로 저장한다"
```

---

### Task 6: 현재 위치에서 열기 (설계 5.4)

**Files:**

- Create: `src/lib/mapBounds.ts`
- Test: `src/lib/mapBounds.test.ts`
- Modify: `src/components/map/Map.tsx:60,85,616`
- Modify: `src/components/slope/SlopeRouteMap.tsx`
- Modify: `e2e/support/mockBackend.ts:832-917`
- Test: `e2e/admin-buildings-slopes.spec.ts`

**Interfaces:**

- Produces: `interface MapBounds { south; west; north; east }`, `KU_BOUNDS: MapBounds`, `containsPoint(bounds, lat, lng): boolean`. 목 옵션 `currentLocation?: {latitude; longitude} | null`(`null` = 권한 거부), `geolocationDelayMs?: number`

- [ ] **Step 1: 실패하는 단위 테스트** — `src/lib/mapBounds.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { KU_BOUNDS, containsPoint } from "./mapBounds";

describe("containsPoint", () => {
  it("캠퍼스 중심은 범위 안이다", () => {
    expect(containsPoint(KU_BOUNDS, 37.5893, 127.0327)).toBe(true);
  });

  it("경계선은 범위 안이다", () => {
    expect(containsPoint(KU_BOUNDS, KU_BOUNDS.south, KU_BOUNDS.west)).toBe(
      true,
    );
    expect(containsPoint(KU_BOUNDS, KU_BOUNDS.north, KU_BOUNDS.east)).toBe(
      true,
    );
  });

  // 무명 숫자 쌍이면 이 실수를 타입이 못 잡는다(설계 5.4).
  it("위도와 경도를 뒤집으면 범위 밖이다", () => {
    expect(containsPoint(KU_BOUNDS, 127.0327, 37.5893)).toBe(false);
  });

  it("캠퍼스 밖 좌표는 범위 밖이다", () => {
    expect(containsPoint(KU_BOUNDS, 37.5, 127.0)).toBe(false);
  });
});
```

Run: `npx vitest run src/lib/mapBounds.test.ts` → FAIL (모듈 없음)

- [ ] **Step 2: 구현** — `src/lib/mapBounds.ts`

```ts
/**
 * 캠퍼스 지도 표시 범위. Leaflet을 import하지 않는다 — src/lib/neighborLayer.ts
 * 파일 주석의 SSR 제약. 좌표 순서를 이름으로 못박는다(설계 2026-10-06 5.4).
 */
export interface MapBounds {
  south: number;
  west: number;
  north: number;
  east: number;
}

export const KU_BOUNDS: MapBounds = {
  south: 37.578,
  west: 127.018,
  north: 37.6,
  east: 127.048,
};

export function containsPoint(bounds: MapBounds, lat: number, lng: number) {
  return (
    lat >= bounds.south &&
    lat <= bounds.north &&
    lng >= bounds.west &&
    lng <= bounds.east
  );
}
```

Run: `npx vitest run src/lib/mapBounds.test.ts` → PASS

- [ ] **Step 3: 공개 지도가 같은 값을 쓰게** — `Map.tsx`
  1. import에 `import { KU_BOUNDS } from "@/lib/mapBounds";`
  2. 60행을 바꾼다.

```ts
const KU_LATLNG_BOUNDS = L.latLngBounds(
  [KU_BOUNDS.south, KU_BOUNDS.west],
  [KU_BOUNDS.north, KU_BOUNDS.east],
);
```

3. `map.setMaxBounds(KU_BOUNDS)` → `KU_LATLNG_BOUNDS`, `maxBounds={KU_BOUNDS}` → `maxBounds={KU_LATLNG_BOUNDS}`. `rg -n "KU_BOUNDS" src/components/map/Map.tsx`로 남은 Leaflet 용도가 없는지 확인한다.

- [ ] **Step 4: 목 백엔드 위치 옵션** — `e2e/support/mockBackend.ts`
  1. `installMockBackend` 옵션 타입의 `currentLocation`을 바꾸고 지연을 더한다.

```ts
    /** null이면 위치 권한 거부로 응답한다 */
    currentLocation?: { latitude: number; longitude: number } | null;
    /** 위치 응답을 늦춘다(ms) */
    geolocationDelayMs?: number;
```

2. `addInitScript` 콜백 인자를 `({ authenticated, currentLocation, geolocationDelayMs })`로 받고, `navigator.geolocation` 스텁을 바꾼다.

```ts
Object.defineProperty(navigator, "geolocation", {
  configurable: true,
  value: {
    getCurrentPosition(
      success: PositionCallback,
      error?: PositionErrorCallback | null,
    ) {
      const respond = () => {
        if (currentLocation) {
          success({ coords: currentLocation } as GeolocationPosition);
        } else {
          error?.({
            code: 1,
            message: "User denied Geolocation",
          } as GeolocationPositionError);
        }
      };
      if (geolocationDelayMs > 0) setTimeout(respond, geolocationDelayMs);
      else respond();
    },
  },
});
```

3. 두 번째 인자 객체를 바꾼다. `??`를 쓰면 `null`(거부)이 기본값으로 덮인다.

```ts
    {
      authenticated: state.authenticated,
      currentLocation:
        options.currentLocation === undefined
          ? { latitude: 37.5893, longitude: 127.0327 }
          : options.currentLocation,
      geolocationDelayMs: options.geolocationDelayMs ?? 0,
    },
```

4. 831행 주석의 `options.currentLocation: geolocation 좌표.`를 `options.currentLocation: geolocation 좌표(null이면 거부) / options.geolocationDelayMs: 응답 지연.`으로.

- [ ] **Step 5: 실패하는 E2E 작성** — `e2e/admin-buildings-slopes.spec.ts` 끝에 추가한다. 좌표 `127.034`는 `KU_CENTER`에서 줌 18 기준 약 240px 동쪽이라 화면 안에 들어온다.

```ts
const NEAR_CENTER = { latitude: 37.5893, longitude: 127.034 };
const blueDot = (page: import("@playwright/test").Page) =>
  page.locator('.leaflet-container path[fill="#2563EB"]');

async function dotOffsetFromCenter(page: import("@playwright/test").Page) {
  const mapBox = (await page.locator(".leaflet-container").boundingBox())!;
  const dotBox = (await blueDot(page).boundingBox())!;
  return {
    x: dotBox.x + dotBox.width / 2 - (mapBox.x + mapBox.width / 2),
    y: dotBox.y + dotBox.height / 2 - (mapBox.y + mapBox.height / 2),
  };
}

test("새 경로는 받은 위치를 가운데 두고 파란 점을 찍는다", async ({ page }) => {
  await installMockBackend(page, {
    authenticated: true,
    currentLocation: NEAR_CENTER,
  });
  await page.goto("/admin/slopes/new");

  await expect(blueDot(page)).toHaveCount(1);
  const offset = await dotOffsetFromCenter(page);
  expect(Math.abs(offset.x)).toBeLessThan(3);
  expect(Math.abs(offset.y)).toBeLessThan(3);
});

test("위치 권한이 없으면 점 없이 기본 위치로 연다", async ({ page }) => {
  await installMockBackend(page, {
    authenticated: true,
    currentLocation: null,
  });
  await page.goto("/admin/slopes/new");
  await expect(page.locator(".leaflet-container")).toBeVisible();
  await expect(blueDot(page)).toHaveCount(0);
});

test("캠퍼스 밖 위치는 쓰지 않는다", async ({ page }) => {
  await installMockBackend(page, {
    authenticated: true,
    currentLocation: { latitude: 37.5, longitude: 127.0 },
  });
  await page.goto("/admin/slopes/new");
  await expect(page.locator(".leaflet-container")).toBeVisible();
  await expect(blueDot(page)).toHaveCount(0);
});

test("위치 응답 전에 지도를 끌면 화면을 옮기지 않는다", async ({ page }) => {
  // 지연이 짧으면 드래그가 응답보다 늦게 끝나도 통과해 버려 결함을 못 잡는다.
  // 3초면 드래그가 먼저 끝나고, 응답은 expect 기본 대기(5초) 안에 온다.
  await installMockBackend(page, {
    authenticated: true,
    currentLocation: NEAR_CENTER,
    geolocationDelayMs: 3000,
  });
  await page.goto("/admin/slopes/new");

  const box = (await page.locator(".leaflet-container").boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 120, box.y + box.height / 2, {
    steps: 5,
  });
  await page.mouse.up();

  await expect(blueDot(page)).toHaveCount(1);
  const offset = await dotOffsetFromCenter(page);
  expect(Math.abs(offset.x)).toBeGreaterThan(30);
});

test("기존 경로 수정은 위치가 아니라 선에 맞춰 연다", async ({ page }) => {
  await installMockBackend(page, {
    authenticated: true,
    currentLocation: NEAR_CENTER,
  });
  await page.goto("/admin/slopes/2");
  await expect(
    page.locator(".leaflet-pane.slope-preview-pane path").first(),
  ).toBeVisible();
  await expect(blueDot(page)).toHaveCount(0);
});
```

Run: `npx playwright test e2e/admin-buildings-slopes.spec.ts -g "위치|선에 맞춰"`
Expected: "받은 위치를 가운데" FAIL(점 없음). 나머지는 점이 없어 우연히 통과할 수 있다 — 구현 뒤 다시 본다.

- [ ] **Step 6: 구현** — `SlopeRouteMap.tsx`
  1. import에 `import { KU_BOUNDS, containsPoint } from "@/lib/mapBounds";`
  2. 초기화 effect 맨 앞(`const initial = …` 다음)에 `let disposed = false;`
  3. `map.on("pm:create", …)` 블록 뒤, `return () => {` 앞에 넣는다.

```ts
if (!initial?.length && "geolocation" in navigator) {
  // 응답은 최대 10초 뒤에 온다. 그 사이 사용자가 지도를 움직였거나 그리기를
  // 시작했으면 화면을 옮기지 않는다 — 그리던 선이 화면 밖으로 사라진다(설계 5.4).
  let followLocation = true;
  const stopFollowing = () => {
    followLocation = false;
  };
  map.once("dragstart", stopFollowing);
  map.once("zoomstart", stopFollowing);
  map.once("pm:drawstart", stopFollowing);

  navigator.geolocation.getCurrentPosition(
    ({ coords }) => {
      if (disposed) return;
      const { latitude, longitude } = coords;
      if (!containsPoint(KU_BOUNDS, latitude, longitude)) return;
      L.circleMarker([latitude, longitude], {
        radius: 7,
        color: "#fff",
        weight: 2,
        fillColor: "#2563EB",
        fillOpacity: 1,
        interactive: false,
        pmIgnore: true,
      }).addTo(map);
      if (followLocation) map.setView([latitude, longitude], 18);
    },
    () => {
      // 거부·실패면 KU_CENTER에 그대로 둔다.
    },
    { enableHighAccuracy: true, timeout: 10_000 },
  );
}
```

4. cleanup 첫 줄에 `disposed = true;`

- [ ] **Step 7: 통과 확인**

```bash
npm test
npx playwright test e2e/admin-buildings-slopes.spec.ts e2e/public-map.spec.ts
```

Expected: PASS. 공개 지도의 현위치 테스트는 기본 좌표·즉시 응답이 그대로라 영향이 없어야 한다.

- [ ] **Step 8: 커밋**

```bash
git add src/lib/mapBounds.ts src/lib/mapBounds.test.ts src/components/map/Map.tsx src/components/slope/SlopeRouteMap.tsx e2e/support/mockBackend.ts e2e/admin-buildings-slopes.spec.ts
git commit -m "feat(slope): 새 경로는 현재 위치에서 열고 파란 점으로 표시한다"
```

---

### Task 7: 주변 건물과 스냅 토글 (설계 5.5)

**Files:**

- Modify: `src/lib/neighborLayer.ts`
- Modify: `src/components/slope/SlopeRouteMap.tsx`
- Modify: `src/components/SlopeRouteEditor.tsx`
- Test: `e2e/admin-buildings-slopes.spec.ts`

**Interfaces:**

- Produces: `addNeighborLayer(map, features, excludeId, layerOptions?: NeighborLayerOptions)` — `NeighborLayerOptions = { pane?: string; pmIgnore?: boolean; snapIgnore?: boolean }`. `SlopeRouteMap` prop `snapToBuildings: boolean`. 체크박스 접근 이름 `건물 외곽선에 붙이기`

- [ ] **Step 1: 실패하는 E2E 작성**

```ts
test("편집기에 주변 건물을 깔고 스냅은 끈 채 시작한다", async ({ page }) => {
  await installMockBackend(page, { authenticated: true });
  await page.goto("/admin/slopes/new");

  await expect(
    page.locator(".leaflet-tooltip.bldg-label", { hasText: "중앙도서관" }),
  ).toBeVisible();
  await expect(
    page.getByRole("checkbox", { name: "건물 외곽선에 붙이기" }),
  ).not.toBeChecked();
});

test("주변 건물이 있어도 찍은 자리에 꼭짓점이 놓인다", async ({ page }) => {
  // 스냅이 꺼져 있으면 건물 외곽선 근처를 찍어도 그 픽셀에 꼭짓점이 놓여야 한다.
  await installMockBackend(page, { authenticated: true });
  await page.goto("/admin/slopes/new");
  await expect(
    page.locator(".leaflet-tooltip.bldg-label").first(),
  ).toBeVisible();

  const map = page.locator(".leaflet-container");
  await page.locator(".leaflet-pm-icon-polyline").locator("..").click();
  const points = [
    { x: 300, y: 120 },
    { x: 420, y: 180 },
  ];
  for (const position of points) await map.click({ position });
  await map.click({ position: points[1] });

  const mapBox = (await map.boundingBox())!;
  const vertex = (await page.locator(".marker-icon").first().boundingBox())!;
  expect(
    Math.abs(vertex.x + vertex.width / 2 - (mapBox.x + points[0].x)),
  ).toBeLessThan(3);
  expect(
    Math.abs(vertex.y + vertex.height / 2 - (mapBox.y + points[0].y)),
  ).toBeLessThan(3);
});
```

Run: `npx playwright test e2e/admin-buildings-slopes.spec.ts -g "주변 건물"` → 첫 테스트 FAIL

- [ ] **Step 2: `neighborLayer.ts`에 옵션** — 함수 시그니처와 `L.geoJSON` 옵션을 바꾼다. 파일 주석 끝에 한 줄을 더한다: `편집기마다 geoman이 이 레이어를 다뤄야 하는 방식이 달라 레이어 옵션을 받는다(경사도 편집기: 설계 2026-10-06 5.5).`

```ts
export interface NeighborLayerOptions {
  pane?: string;
  pmIgnore?: boolean;
  snapIgnore?: boolean;
}

export function addNeighborLayer(
  map: L.Map,
  features: Feature[],
  excludeId: number | null,
  layerOptions: NeighborLayerOptions = {},
): void {
  const filtered = features.filter(
    (feature) => String(feature.properties?.bid) !== String(excludeId ?? ""),
  );
  L.geoJSON(
    { type: "FeatureCollection", features: filtered } as FeatureCollection,
    {
      ...layerOptions,
      style: NEIGHBOR_STYLE,
      interactive: false,
      onEachFeature: (f, layer) => {
        if (f.properties?.name) {
          layer.bindTooltip(f.properties.name, {
            permanent: true,
            direction: "center",
            className: "bldg-label",
          });
        }
      },
    },
  ).addTo(map);
}
```

- [ ] **Step 3: 편집기 지도에 건물과 스냅** — `SlopeRouteMap.tsx`
  1. import에 `import { fetchNeighborBuildings } from "@/lib/neighborBuildings";`, `import { addNeighborLayer } from "@/lib/neighborLayer";`
  2. props에 `snapToBuildings: boolean;`를 더하고 구조 분해한다.
  3. `slopePreview` pane 생성 바로 앞에 넣는다. 건물을 선보다 아래 pane에 두는 이유: 늦게 도착해 같은 pane에 붙으면 반투명 회색이 그린 선을 덮는다.

```ts
const buildingPane = map.createPane("slopeBuildings");
buildingPane.style.zIndex = "300";
void fetchNeighborBuildings()
  .then((features) => {
    if (disposed) return;
    // 드래그·편집 대상에서는 빼고 스냅 목록에는 남긴다. 스냅은 토글이 켜고 끈다.
    addNeighborLayer(map, features, null, {
      pane: "slopeBuildings",
      pmIgnore: true,
      snapIgnore: false,
    });
  })
  .catch(() => {
    // 배경 건물은 보조 정보다. 실패해도 경로는 그릴 수 있다.
  });
```

4. 초기화 effect 뒤에 effect를 더한다. `setGlobalOptions`는 그리는 도중에도 바로 반영된다(설계 10장).

```ts
useEffect(() => {
  mapRef.current?.pm.setGlobalOptions({ snappable: snapToBuildings });
}, [snapToBuildings]);
```

- [ ] **Step 4: 토글** — `SlopeRouteEditor.tsx`
  1. 상태 `const [snapToBuildings, setSnapToBuildings] = useState(false);`
  2. `<SlopeRouteMap … />`에 `snapToBuildings={snapToBuildings}`
  3. 단위 `<fieldset>` 바로 앞에 넣는다.

```tsx
<label
  style={{
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    fontSize: 13,
    cursor: "pointer",
  }}
>
  <input
    type="checkbox"
    checked={snapToBuildings}
    onChange={(event) => setSnapToBuildings(event.target.checked)}
  />
  건물 외곽선에 붙이기
</label>
```

- [ ] **Step 5: 통과 확인**

```bash
npm run typecheck
npx playwright test e2e/admin-buildings-slopes.spec.ts e2e/admin-dark.spec.ts
```

Expected: PASS. 기존 그리기 테스트가 모두 그대로 통과하는지 특히 본다 — 건물이 클릭을 가로채거나 스냅이 꼭짓점을 옮기면 여기서 깨진다.

- [ ] **Step 6: 브라우저 확인(수동)** — `npm run dev` 후 `/admin/slopes/new`에서 체크박스를 켜고 건물 외곽선 근처를 찍어 꼭짓점이 달라붙는지 본다(설계 10장 — `pmIgnore: true, snapIgnore: false` 조합의 스냅 계산은 배포본에서 끝까지 따라가 보지 않았다). 안 붙으면 보고한다.

- [ ] **Step 7: 커밋**

```bash
git add src/lib/neighborLayer.ts src/components/slope/SlopeRouteMap.tsx src/components/SlopeRouteEditor.tsx e2e/admin-buildings-slopes.spec.ts
git commit -m "feat(slope): 편집기에 주변 건물을 깔고 외곽선 스냅을 켜고 끄게 한다"
```

---

### Task 8: 건물 안 시설 수정 (설계 부록 A)

**Files:**

- Modify: `src/components/admin/FacilityDetailModal.tsx`
- Modify: `src/app/admin/buildings/[id]/page.tsx`
- Modify: `docs/specs/2026-08-04-facility-detail-modal-and-building-video-design.md`
- Test: `e2e/admin-p0.spec.ts`

**Interfaces:**

- Produces: `FacilityDetailModal` prop `onRequestEdit: () => void`, 버튼 이름 `수정`

- [ ] **Step 1: 실패하는 E2E 작성** — `e2e/admin-p0.spec.ts` 마지막 `});` 앞에 추가한다. `f-building-video`는 건물 1에 속하고 동영상이 있는 픽스처다.

```ts
test("건물 안 시설을 수정해도 동영상이 남는다", async ({ page }) => {
  const state = await installMockBackend(page, { authenticated: true });
  await page.goto("/admin/buildings/1");

  await page.getByRole("button", { name: /지하 주차장 진입로/ }).click();
  const detail = page.getByRole("dialog", { name: "지하 주차장 진입로" });
  await detail.getByRole("button", { name: "수정" }).click();

  const form = page.getByRole("dialog", { name: "시설 수정" });
  await expect(form.getByLabel("시설 이름 (선택)")).toHaveValue(
    "지하 주차장 진입로",
  );
  await form.getByLabel("시설 이름 (선택)").fill("지하 주차장 진입 경사로");
  await form.getByRole("button", { name: "저장", exact: true }).click();

  await expect(
    page.getByRole("button", { name: /지하 주차장 진입 경사로/ }),
  ).toBeVisible();
  const saved = state.facilities.find(
    (facility) => facility.id === "f-building-video",
  )!;
  expect(saved.name).toBe("지하 주차장 진입 경사로");
  expect(saved.video_url).toBe(
    "https://cdn.example.com/facility-videos/f-building-video/1.mp4",
  );
});
```

Run: `npx playwright test e2e/admin-p0.spec.ts -g "동영상이 남는다"` → FAIL (`수정` 버튼 없음)

- [ ] **Step 2: 상세 모달에 버튼** — `FacilityDetailModal.tsx`
  1. props 인터페이스에 `onRequestEdit: () => void;`를 더하고 구조 분해한다.
  2. 액션 영역의 `닫기` 버튼과 `삭제` 버튼 사이에 넣는다.

```tsx
<button
  type="button"
  onClick={onRequestEdit}
  className="ku-admin-row-action"
  style={{
    flex: 1,
    padding: "10px",
    background: "none",
    border: "1px solid var(--ku-primary-text)",
    borderRadius: 8,
    fontSize: 13,
    color: "var(--ku-primary-text)",
    cursor: "pointer",
  }}
>
  수정
</button>
```

- [ ] **Step 3: 건물 상세에서 폼 열기** — `src/app/admin/buildings/[id]/page.tsx`
  1. import에 `import FacilityFormModal from "@/components/admin/FacilityFormModal";`
  2. `selectedFacilityId` 상태 옆에 추가한다. 객체가 아니라 id로 든다 — 바로 아래 기존 주석과 같은 이유다.

```ts
const [editingFacilityId, setEditingFacilityId] = useState<string | null>(null);
const editingFacility =
  facilities.find((f) => f.id === editingFacilityId) ?? null;
```

3. `<FacilityDetailModal …>`에 prop을 더한다.

```tsx
          onRequestEdit={() => {
            setEditingFacilityId(selectedFacility.id);
            setSelectedFacilityId(null);
          }}
```

4. `FacilityDetailModal` 렌더 블록 뒤에 넣는다.

```tsx
{
  editingFacility && (
    <FacilityFormModal
      buildingId={id}
      center={
        editingFacility.lat != null && editingFacility.lng != null
          ? [editingFacility.lat, editingFacility.lng]
          : buildingCenter
      }
      facilityTypes={facilityTypes}
      facility={editingFacility}
      onClose={() => setEditingFacilityId(null)}
      onSaved={() => {
        setEditingFacilityId(null);
        void fetchData();
      }}
      showToast={showToast}
    />
  );
}
```

- [ ] **Step 4: 통과 확인**

```bash
npm run typecheck
npx playwright test e2e/admin-p0.spec.ts e2e/admin-buildings-slopes.spec.ts e2e/admin-dark.spec.ts
```

Expected: PASS

- [ ] **Step 5: 2026-08-04 설계 문서** — 먼저 그 문서 머리 40줄을 읽어 대체 배너가 있는지 본다. 없으면:
  1. `## 후속 과제`에서 "시설 이름·설명·층·좌표를 모달에서 편집하기" 줄을 지운다.
  2. 문서 끝에 추가한다.

```markdown
## 후속 반영

- 2026-10-06 — 건물 상세의 시설 모달에 `수정`을 달아 독립 시설과 같은 `FacilityFormModal`로 유형·이름·설명·층·좌표·설치 상태를 고친다. 저장 payload에 `video_url`이 없어 동영상은 유지된다. 같은 시설을 동시에 고칠 때의 문제는 `docs/TODO_list/admin/facility-concurrent-edit.md`.
```

- [ ] **Step 6: 커밋**

```bash
git add src/components/admin/FacilityDetailModal.tsx "src/app/admin/buildings/[id]/page.tsx" docs/specs/2026-08-04-facility-detail-modal-and-building-video-design.md e2e/admin-p0.spec.ts
git commit -m "feat(admin): 건물 안 시설을 상세 모달에서 수정한다"
```

---

### Task 9: 사진 라이트박스와 다운로드 (설계 부록 B)

**Files:**

- Create: `src/lib/photoDownload.ts`
- Test: `src/lib/photoDownload.test.ts`
- Create: `src/components/sidepanel/PhotoLightbox.tsx`
- Modify: `src/components/sidepanel/PhotoCarousel.tsx`
- Modify: `src/components/SidePanel.tsx:342-349`
- Modify: `src/lib/translations.ts`
- Modify: `src/components/map/map-ui.css`
- Modify: `e2e/support/mockBackend.ts:308`
- Test: `e2e/public-map.spec.ts`

**Interfaces:**

- Produces: `photoDownloadUrl(photoUrl: string, fileName: string): string`, `photoFileName(buildingName: string, index: number): string`. `PhotoCarousel` prop `buildingName: string`. 번역 키 `photoEnlarge`·`photoPrev`·`photoNext`·`photoDownload`

- [ ] **Step 1: 실패하는 단위 테스트** — `src/lib/photoDownload.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { photoDownloadUrl, photoFileName } from "./photoDownload";

const STORED =
  "https://example.supabase.co/storage/v1/object/public/building-photos/1/a.webp?t=1700000000000";

describe("photoDownloadUrl", () => {
  it("기존 t 파라미터를 남기고 download를 더한다", () => {
    const url = new URL(photoDownloadUrl(STORED, "중앙도서관-1.webp"));
    expect(url.searchParams.get("t")).toBe("1700000000000");
    expect(url.searchParams.get("download")).toBe("중앙도서관-1.webp");
    expect(url.pathname).toBe(
      "/storage/v1/object/public/building-photos/1/a.webp",
    );
  });

  // 문자열을 이어 붙이면 &는 새 파라미터, #은 fragment로 잘린다.
  it("파일명의 예약 문자를 보존한다", () => {
    const name = "본관 & 별관 #1-1.webp";
    const url = new URL(photoDownloadUrl(STORED, name));
    expect(url.searchParams.get("download")).toBe(name);
    expect(url.hash).toBe("");
  });
});

describe("photoFileName", () => {
  it("건물명과 1부터 센 번호", () => {
    expect(photoFileName("중앙도서관", 0)).toBe("중앙도서관-1.webp");
  });
});
```

Run: `npx vitest run src/lib/photoDownload.test.ts` → FAIL

- [ ] **Step 2: 구현** — `src/lib/photoDownload.ts`

```ts
/**
 * 사진은 Supabase Storage 공개 URL(사이트와 다른 origin)이라 <a download>가
 * 무시된다. Storage는 download 쿼리에 Content-Disposition: attachment로 답한다.
 * 저장된 URL에는 이미 ?t=가 있으므로 URL을 파싱해 붙인다(설계 2026-10-06 부록 B).
 */
export function photoDownloadUrl(photoUrl: string, fileName: string): string {
  const url = new URL(photoUrl);
  url.searchParams.set("download", fileName);
  return url.toString();
}

export function photoFileName(buildingName: string, index: number): string {
  return `${buildingName}-${index + 1}.webp`;
}
```

Run: `npx vitest run src/lib/photoDownload.test.ts` → PASS

- [ ] **Step 3: 실패하는 E2E 작성**
  1. `e2e/support/mockBackend.ts` 308행 사진 URL을 `"https://cdn.test/library.webp?t=1700000000000"`로 바꾼다(운영 URL 모양과 맞춘다).
  2. `e2e/public-map.spec.ts` 끝에 추가한다.

```ts
test("건물 사진을 크게 보고 내려받는다", async ({ page }) => {
  const state = await installMockBackend(page);
  state.photos.push({
    id: 2,
    building_id: 1,
    url: "https://cdn.test/library-2.webp?t=1700000000001",
    caption: "열람실",
    caption_en: "Reading room",
    caption_zh: "阅览室",
  });
  await page.goto("/");
  await page.getByPlaceholder("건물 검색...").fill("중앙도서관");
  await page.getByText("중앙도서관", { exact: true }).last().click();

  const open = page.getByRole("button", { name: "사진 크게 보기" });
  await open.click();
  const dialog = page.getByRole("dialog", { name: "중앙도서관", exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("1 / 2");
  await expect(dialog).toContainText("정문");

  const href = await dialog
    .getByRole("link", { name: "사진 다운로드" })
    .getAttribute("href");
  const url = new URL(href!);
  expect(url.searchParams.get("t")).toBe("1700000000000");
  expect(url.searchParams.get("download")).toBe("중앙도서관-1.webp");

  await page.keyboard.press("ArrowRight");
  await expect(dialog).toContainText("2 / 2");
  await expect(dialog).toContainText("열람실");
  await dialog.getByRole("button", { name: "이전 사진" }).click();
  await expect(dialog).toContainText("1 / 2");

  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(open).toBeFocused();
});
```

Run: `npx playwright test e2e/public-map.spec.ts -g "크게 보고"` → FAIL

- [ ] **Step 4: 번역 키** — `src/lib/translations.ts`의 각 언어 `noPhoto` 바로 다음 줄에 추가한다.

```ts
    // ko
    photoEnlarge: "사진 크게 보기",
    photoPrev: "이전 사진",
    photoNext: "다음 사진",
    photoDownload: "사진 다운로드",
```

```ts
    // en
    photoEnlarge: "View larger photo",
    photoPrev: "Previous photo",
    photoNext: "Next photo",
    photoDownload: "Download photo",
```

```ts
    // zh
    photoEnlarge: "查看大图",
    photoPrev: "上一张",
    photoNext: "下一张",
    photoDownload: "下载照片",
```

(주석 `// ko` 등은 붙이지 않는다 — 어느 블록에 넣는지 표시한 것이다.)

- [ ] **Step 5: 라이트박스** — `src/components/sidepanel/PhotoLightbox.tsx`

```tsx
"use client";

import { useEffect, useId } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { ChevronLeft, ChevronRight, Download, X } from "lucide-react";
import { useModalFocus } from "@/lib/useModalFocus";
import { photoDownloadUrl, photoFileName } from "@/lib/photoDownload";
import type { LangCode } from "@/lib/translations";
import type { SidePanelPhoto } from "@/components/SidePanel";

interface PhotoLightboxProps {
  photos: SidePanelPhoto[];
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
  /** 다운로드 파일명용 원래 이름 */
  buildingName: string;
  /** 화면 표시용 이름(언어에 따라 다름) */
  displayName: string;
  lang: LangCode;
  t: (key: string) => string;
}

export default function PhotoLightbox({
  photos,
  index,
  onIndexChange,
  onClose,
  buildingName,
  displayName,
  lang,
  t,
}: PhotoLightboxProps) {
  const titleId = useId();
  const dialogRef = useModalFocus<HTMLDivElement>({ onClose });
  const count = photos.length;
  const photo = photos[index];

  useEffect(() => {
    if (count < 2) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "ArrowLeft") onIndexChange((index - 1 + count) % count);
      if (event.key === "ArrowRight") onIndexChange((index + 1) % count);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [count, index, onIndexChange]);

  if (!photo) return null;
  const caption =
    lang === "ko" ? photo.caption : (photo[`caption_${lang}`] ?? photo.caption);

  // 사이드패널이 쌓임 맥락을 만들어 모달을 그 안에 가둔다. body로 뺀다(FeedbackButton과 같다).
  return createPortal(
    <div
      className="ku-photo-lightbox-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className="ku-photo-lightbox"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="ku-photo-lightbox-header">
          <span id={titleId} className="ku-photo-lightbox-title">
            {displayName}
          </span>
          <span className="ku-photo-lightbox-count">
            {index + 1} / {count}
          </span>
          <a
            className="ku-photo-lightbox-action"
            href={photoDownloadUrl(
              photo.url,
              photoFileName(buildingName, index),
            )}
            aria-label={t("photoDownload")}
          >
            <Download size={18} aria-hidden="true" />
          </a>
          <button
            type="button"
            className="ku-photo-lightbox-action"
            onClick={onClose}
            aria-label={t("closeLabel")}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <div className="ku-photo-lightbox-stage">
          <Image
            src={photo.url}
            alt={caption ?? displayName}
            fill
            sizes="100vw"
            unoptimized
            style={{ objectFit: "contain" }}
          />
          {count > 1 && (
            <>
              <button
                type="button"
                className="ku-photo-lightbox-action ku-photo-lightbox-nav ku-photo-lightbox-nav--prev"
                onClick={() => onIndexChange((index - 1 + count) % count)}
                aria-label={t("photoPrev")}
              >
                <ChevronLeft size={22} aria-hidden="true" />
              </button>
              <button
                type="button"
                className="ku-photo-lightbox-action ku-photo-lightbox-nav ku-photo-lightbox-nav--next"
                onClick={() => onIndexChange((index + 1) % count)}
                aria-label={t("photoNext")}
              >
                <ChevronRight size={22} aria-hidden="true" />
              </button>
            </>
          )}
        </div>
        {caption && <p className="ku-photo-lightbox-caption">{caption}</p>}
      </div>
    </div>,
    document.body,
  );
}
```

- [ ] **Step 6: 캐러셀에서 열기** — `PhotoCarousel.tsx`
  1. import에 `import { useState } from "react";`, `import PhotoLightbox from "@/components/sidepanel/PhotoLightbox";`
  2. props 인터페이스와 구조 분해에 `buildingName: string;`을 더한다.
  3. 함수 본문 첫 줄에 `const [lightboxOpen, setLightboxOpen] = useState(false);`
  4. `<Image … />`를 버튼으로 감싼다. 이전·다음·점 버튼은 뒤에 오므로 그대로 위에 쌓인다.

```tsx
<button
  type="button"
  onClick={() => setLightboxOpen(true)}
  aria-label={t("photoEnlarge")}
  style={{
    position: "absolute",
    inset: 0,
    padding: 0,
    border: 0,
    background: "none",
    cursor: "zoom-in",
  }}
>
  <Image
    src={photos[photoIndex]?.url}
    alt={displayName}
    fill
    sizes="(max-width: 767px) calc(100vw - 40px), 380px"
    unoptimized
    style={{
      objectFit: "cover",
    }}
  />
</button>
```

5. 최상위 fragment의 마지막(캡션 블록 뒤)에 넣는다.

```tsx
{
  lightboxOpen && photos.length > 0 && (
    <PhotoLightbox
      photos={photos}
      index={photoIndex}
      onIndexChange={setPhotoIndex}
      onClose={() => setLightboxOpen(false)}
      buildingName={buildingName}
      displayName={displayName}
      lang={lang}
      t={t}
    />
  );
}
```

6. `PhotoCarousel`의 지역 `PhotoRow` 타입을 지우고 `import type { SidePanelPhoto } from "@/components/SidePanel";`로 바꾼다(같은 Pick이다).

- [ ] **Step 7: 사이드패널** — `SidePanel.tsx`의 `<PhotoCarousel …>`에 `buildingName={buildingName}`를 더한다.

- [ ] **Step 8: CSS** — `src/components/map/map-ui.css`의 `.ku-feedback-backdrop` 블록 뒤에 추가한다.

```css
.ku-photo-lightbox-backdrop {
  position: fixed;
  z-index: 3000;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: rgba(0, 0, 0, 0.82);
}
.ku-photo-lightbox {
  display: flex;
  flex-direction: column;
  width: min(960px, 100%);
  max-height: 100%;
  color: #fff;
}
.ku-photo-lightbox-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-bottom: 8px;
}
.ku-photo-lightbox-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  font-size: 14px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ku-photo-lightbox-count {
  font-size: 13px;
  opacity: 0.8;
}
.ku-photo-lightbox-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border: 0;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.14);
  color: #fff;
  cursor: pointer;
}
.ku-photo-lightbox-stage {
  position: relative;
  height: min(75vh, 720px);
}
.ku-photo-lightbox-nav {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
}
.ku-photo-lightbox-nav--prev {
  left: 8px;
}
.ku-photo-lightbox-nav--next {
  right: 8px;
}
.ku-photo-lightbox-caption {
  margin: 8px 0 0;
  font-size: 13px;
  text-align: center;
  opacity: 0.9;
}
```

- [ ] **Step 9: 통과 확인**

```bash
npm test
npm run typecheck
npm run lint
npx playwright test e2e/public-map.spec.ts e2e/public-map-search.spec.ts
```

Expected: PASS

- [ ] **Step 10: 커밋**

```bash
git add src/lib/photoDownload.ts src/lib/photoDownload.test.ts src/components/sidepanel/PhotoLightbox.tsx src/components/sidepanel/PhotoCarousel.tsx src/components/SidePanel.tsx src/lib/translations.ts src/components/map/map-ui.css e2e/support/mockBackend.ts e2e/public-map.spec.ts
git commit -m "feat(map): 건물 사진을 라이트박스로 크게 보고 내려받는다"
```

---

### Task 10: 문서 정리와 최종 검증 (설계 7장)

**Files:**

- Modify: `docs/specs/2026-08-30-manual-slope-route-design.md`
- Modify: `docs/specs/2026-08-14-strict-types-and-logging.md`
- Modify: `docs/future-development/accessible-routing.md`
- Modify: `README.md`

- [ ] **Step 1: 2026-08-30 문서에 대체 표시** — 먼저 머리 40줄을 읽는다. 본문은 당시 기록이라 고치지 않는다.
  1. `## 이 문서의 목적` 절 끝에 추가한다.

```markdown
> **2026-10-06 — 일부 대체.** 아래 절은 [`2026-10-06-slope-units-and-editor-design.md`](./2026-10-06-slope-units-and-editor-design.md)가 대체한다. 본문은 당시 기록으로 둔다.
>
> | 이 문서        | 당시                                        | 현재                                                                                                   |
> | -------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
> | 2.4 색상 기준  | `slope`를 %로 읽고 1/12를 "건축법"으로 표기 | `slope`는 도. 1/18·1/12·1/8 기준선(편의증진법·교통약자법 시행규칙) — 새 문서 4장                       |
> | 4.2 저장 포맷  | 포인트에 `ele`, `slope`(%)                  | `{lat,lng}` 다음 `{lat,lng,slope(도),distance}`. `ele` 없음 — 새 문서 2장                              |
> | 5.5 검증       | 0~100%, 30% 경고                            | 범위는 0~45°로 도에서 직접, 경고는 % — 새 문서 3.2                                                     |
> | 7장 2단계 폐기 | 계획                                        | GPX 행 삭제 완료, 코드 정리 실행. 목록의 리다이렉트 Toast effect는 `missing`에 쓰여 남김 — 새 문서 6장 |
```

2. `### 2.4`, `### 4.2`, `### 5.5`, `## 7.` 제목 바로 아래 줄에 각각 `> 2026-10-06 대체 — 이 문서 머리의 표.`

- [ ] **Step 2: 2026-08-14 문서** — 머리 40줄을 읽고, `**`SlopePoint.ele`는 `number | null`.**` 항목 끝에 덧붙인다: `(2026-10-06 — GPX 코드 정리로`ele`를 없앴다. `ele`는 DB 컬럼이 아니라 `segments`jsonb 안 GPX 필드였다.`2026-10-06-slope-units-and-editor-design.md` 6장.)`

- [ ] **Step 3: 경로 탐색 후속 문서** — `docs/future-development/accessible-routing.md`
  1. `## 현재 경사도 데이터의 한계`의 첫 문단을 바꾼다.

```markdown
현재 `slope_segments`는 관리자가 지도에 그린 꼭짓점과 구간별 실측 경사(도 단위)를
`segments` JSON으로 저장하고, 지도에서 그 꼭짓점을 직접 연결해 표시한다. 2026-10-06
이전에는 GPX의 위도·경도·고도 좌표였다.
```

2. 같은 절의 목록 중 GPS·GPX에 관한 세 항목("GPS 오차로…", "동일한 길을 다시 측정하면…", "GPX 기록을 실제 길의 기준 형상으로…")을 아래 두 항목으로 바꾼다. 나머지 두 항목은 둔다.

```markdown
- 선은 관리자가 손으로 그린 근사 형상이라 실제 보행로 중심선과 다를 수 있다.
- 같은 길을 다른 사람이 그리면 서로 다른 모양이 된다.
```

3. 그 절의 결론 "따라서 GPX는 길 자체가 아니라 **경사도를 측정한 원본 자료**로 취급해야 한다." → "따라서 경사도 경로는 길 자체가 아니라 **경사도를 측정한 위치 기록**으로 취급해야 한다."
4. "기존 `slope_segments`는 즉시 삭제하지 않고 GPX 원본 및 마이그레이션 출처로 보존한다." → "기존 `slope_segments`는 즉시 삭제하지 않고 경사도 실측 기록 및 마이그레이션 출처로 보존한다."

- [ ] **Step 4: README** — 아래 줄을 바꾸거나 더한다. 줄 번호는 작성 시점 기준이니 문구로 찾는다.

| 찾을 문구                                                                                                                                                                        | 바꿀 내용                                                                                                                                                                                                                                                         |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `+ 범례 (법적 기준 1/12 구분선)`                                                                                                                                                 | `+ 범례 (보도 기준 1/18 · 완화 한도 1/12 · 경사로 특례 1/8 기준선, %와 도 병기)`                                                                                                                                                                                  |
| `입력값에 따라 선 색을 미리 보여주고 법적 기준(1/12)·급경사 경고를 표시하되 저장은 막지 않습니다. GPX 업로드는 종료했고, 기존 GPX 행은 측정 원본이라 다운로드·삭제만 가능합니다` | `도(°)나 %로 입력하고 도로 저장합니다. 입력값에 따라 선 색을 미리 보여주고 1/12 완화 한도·급경사 경고를 표시하되 저장은 막지 않습니다. 편집기는 현재 위치에서 열리고 주변 건물을 깔며, 건물 외곽선 스냅을 켜고 끌 수 있습니다`                                    |
| `# 경사도 경로 목록 — 수기/GPX 구분, GPX 다운로드·삭제`                                                                                                                          | `# 경사도 경로 목록 — 수정·삭제`                                                                                                                                                                                                                                  |
| `# 경사도 경로 수정 (수기 경로만, 낙관적 잠금)`                                                                                                                                  | `# 경사도 경로 수정 (저장 포맷 검증, 낙관적 잠금)`                                                                                                                                                                                                                |
| `SidePanelHeader.tsx / PhotoCarousel.tsx / FacilityList.tsx`                                                                                                                     | `SidePanelHeader.tsx / PhotoCarousel.tsx / PhotoLightbox.tsx / FacilityList.tsx`                                                                                                                                                                                  |
| `theme.ts                         # 디자인 토큰 · 캠퍼스/시설/경사 색상`                                                                                                         | `theme.ts                         # 디자인 토큰 · 캠퍼스/시설 색상`                                                                                                                                                                                               |
| `slopeRoute.ts` 트리 줄 다음                                                                                                                                                     | 세 줄 추가: `    slopeScale.ts                    # 경사 단위(도·%) 변환 · 색 칸 · 기준선 판정 (순수 함수)` / `    mapBounds.ts                     # 캠퍼스 지도 표시 범위 (Leaflet 비의존)` / `    photoDownload.ts                 # 사진 다운로드 URL·파일명` |
| `-- SlopePoint[] = { lat, lng, ele, slope?, distance? }`                                                                                                                         | `-- [{ lat, lng }, ...{ lat, lng, slope(도), distance(m) }]`                                                                                                                                                                                                      |
| `-- 수기 경로는 ele=null이고 2번째 포인트부터 slope·distance를 담는다`                                                                                                           | `-- 이 변경 전에 저장한 행에는 ele: null 키가 남아 있다(읽지 않음)`                                                                                                                                                                                               |
| `-- NULL이면 수기 경로, 값이 있으면 GPX 측정 원본`                                                                                                                               | `-- GPX 시절 컬럼. 2026-10-06 정리 이후 항상 NULL`                                                                                                                                                                                                                |
| `열어둔 사이 바뀐 행·GPX 행 보호`                                                                                                                                                | `열어둔 사이 바뀐 행 보호, 깨진 저장 포맷 거부, 도·% 입력, 현재 위치·구간 번호`                                                                                                                                                                                   |
| `- [ ] GPX 경사 경로 폐기 — 실측 데이터로 다시 채운 뒤 \`gpx_file\` 컬럼과 관련 분기 제거 (설계 문서의 2단계)`                                                                   | `- [ ] \`slope_segments.gpx_file\` 컬럼 삭제 — GPX 행 삭제와 코드 분기 정리는 끝났다(2026-10-06)`                                                                                                                                                                 |
| `경사 경로 판단 로직은 전부 \`src/lib/slopeRoute.ts\`의 순수 함수로 빼 두었습니다.`                                                                                              | `경사 경로 판단 로직은 \`src/lib/slopeRoute.ts\`(경로·저장 포맷)와 \`src/lib/slopeScale.ts\`(단위·색·기준선)의 순수 함수로 빼 두었습니다.`                                                                                                                        |

- [ ] **Step 5: 역추적** — 지운 이름·바꾼 주장이 남은 곳을 기계적으로 찾고, 명령과 출력을 PR 본문에 붙인다.

```bash
rg -n "slopeColor\b|isManualRoute|LEGAL_SLOPE_LIMIT|EXTREME_SLOPE_LIMIT|MAX_SLOPE_INPUT|slopeWarning\b|processRawPoints|buildGpx|downloadGpx|SlopePoint\b|redirected=gpx" src e2e docs README.md
rg -n "법적 기준|건축법" src e2e docs README.md
rg -n "GPX|gpx" src e2e README.md
```

각 결과가 (a) 이 브랜치에서 고침 (b) 날짜가 박힌 기록으로 그 날짜에 맞음(예: `docs/audits/2026-07-22-ux-audit.md`, 대체 배너 아래 2026-08-30 본문) (c) 무관 중 하나여야 한다. `gpx_file` 컬럼 참조(타입·insert)는 (c)다.

- [ ] **Step 6: 전체 검증**

```bash
npm test
npm run typecheck
npm run lint
npm run format:check
npm run build
npx playwright test
```

Expected: 모두 PASS. `format:check`가 실패하면 `npx prettier --write <바꾼 파일들>` 후 다시 본다.

- [ ] **Step 7: 커밋**

```bash
git add docs/specs/2026-08-30-manual-slope-route-design.md docs/specs/2026-08-14-strict-types-and-logging.md docs/future-development/accessible-routing.md README.md
git commit -m "docs: 경사도 단위·GPX 정리로 대체된 서술을 표시하고 README를 맞춘다"
```

- [ ] **Step 8: 병합 때** — 이 계획 문서는 작업 문서다. 구현이 끝나 base에 병합할 때 `git rm docs/plans/2026-10-06-slope-units-and-editor.md`를 이 브랜치에 커밋한다.
