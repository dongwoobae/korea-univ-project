# 경사도 경로 수기 입력 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** 관리자가 지도에 폴리라인을 그리고 꼭짓점 사이 구간마다 현장 실측
경사도(%)를 입력해 저장하는 기능을 만들고, 기존 GPX 업로드를 닫는다.

**Architecture:** DB 마이그레이션이 없다. `slope_segments.segments` jsonb에
`{lat, lng, ele: null, slope, distance}` 모양으로 넣으면 `SlopeLayer`의 기존
"구버전 포맷" 감지 분기가 그대로 렌더한다. 판단이 들어가는 로직은 전부
`src/lib/slopeRoute.ts`의 순수 함수로 빼고, 컴포넌트는 얇게 둔다. vitest가 node
환경이라 컴포넌트를 못 덮으므로 테스트 가능한 경계와 파일 경계를 일치시킨다.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Supabase JS,
Leaflet 1.9 + `@geoman-io/leaflet-geoman-free` 2.19.3, vitest(node 환경),
Playwright + `e2e/support/mockBackend.ts`

**Spec:** `docs/specs/2026-08-30-manual-slope-route-design.md`
이 계획은 그 문서를 전제하고 그 문서에서 논지를 가져온다. 실행자는 둘 다 읽는다.

---

## 전역 제약

이 아래 모든 태스크에 적용된다.

- **vitest는 `environment: "node"`다.** DOM이 없어 컴포넌트 테스트를 못 한다.
  순수 로직은 vitest, 화면 동작은 Playwright로 나눈다.
- **Leaflet을 import하는 컴포넌트는 `dynamic(..., { ssr: false })`로 싣는다.**
  서버에서 실행되면 `window`가 없어 터진다.
  `src/app/admin/buildings/new/page.tsx:15`가 같은 방식이다.
- **`/admin/slopes/*`는 `/admin/dashboard/layout.tsx` 바깥이다.** 관리자
  레이아웃도 인증 검사도 상속받지 못한다. 페이지마다 인증을 직접 확인한다.
- **geoman 값 (설치 버전 2.19.3에서 확인함)**
  - 도형 이름: `"Line"` — `enableDraw("Line")` / `disableDraw("Line")`
  - 툴바 버튼 키: `"drawPolyline"`
  - 버튼 CSS 클래스: `.leaflet-pm-icon-polyline`
  - 잠긴 버튼 클래스: `pm-disabled`
- **`ConfirmModal`의 취소 버튼 라벨은 "취소"다.** 확인 버튼만
  `confirmLabel`로 바꿀 수 있다.
- **경사도 임계값** — 법적 기준 `8.33`, 강한 경고 `30`, 입력 상한 `100`.
  숫자는 `slopeRoute.ts`에 상수로 두고 재사용한다.
- **거리는 절대 들고 다니지 않는다.** 좌표가 바뀔 때마다 다시 계산한다.
  선 전체를 옮기면 위도·경도가 바뀌어 haversine 거리가 보존되지 않는다.
- **커밋 메시지는 한국어 Conventional Commits.** 본문 끝에 `2026-08-30` 한 줄.
  `Co-Authored-By` 줄은 넣지 않는다.
- **prettier 검사는 변경 파일만 돌린다.**
  `npx prettier --check --end-of-line auto <files>`.
  `npm run format:check`를 전체로 돌리면 Windows CRLF 때문에 손대지 않은 파일이
  같이 실패한다.

---

## 파일 구조

| 파일                                        | 상태 | 책임                                           |
| ------------------------------------------- | ---- | ---------------------------------------------- |
| `src/types/domain.ts`                       | 수정 | `SlopePoint`에 `slope?`·`distance?` 추가       |
| `src/lib/slopeRoute.ts`                     | 생성 | 순수 함수 전부. 거리, 구간, 저장 변환, 검증    |
| `src/lib/slopeRoute.test.ts`                | 생성 | 위 함수들의 단위 테스트                        |
| `src/components/slope/SlopeRouteMap.tsx`    | 생성 | Leaflet + geoman만. 명령형 코드 격리           |
| `src/components/slope/SlopeSegmentList.tsx` | 생성 | 구간 입력 폼. 순수 표현                        |
| `src/components/SlopeRouteEditor.tsx`       | 생성 | 위 둘을 조합. 폼 상태 보유                     |
| `src/app/admin/slopes/new/page.tsx`         | 생성 | 신규 등록 + 인증                               |
| `src/app/admin/slopes/[id]/page.tsx`        | 생성 | 수정(수기 경로 한정) + 인증                    |
| `src/app/admin/dashboard/slopes/page.tsx`   | 수정 | 진입 버튼, 배지, 행 버튼 분기, GPX 업로드 종료 |
| `src/components/map/SlopeLayer.tsx`         | 수정 | 지역 `StoredPoint` 제거하고 `SlopePoint` 사용  |
| `e2e/support/mockBackend.ts`                | 수정 | 수기 경로 픽스처 추가                          |
| `e2e/admin-buildings-slopes.spec.ts`        | 수정 | 수기 경로 흐름 e2e                             |

---

## Task 1: 순수 함수와 타입

**파일**

- 수정: `src/types/domain.ts:17-22`
- 생성: `src/lib/slopeRoute.ts`
- 테스트: `src/lib/slopeRoute.test.ts`

**인터페이스**

- 사용: `SlopePoint` (`@/types/domain`)
- 제공: 아래 태스크가 전부 여기에 기댄다.
  - `interface Vertex { lat: number; lng: number }`
  - `interface RouteSegment { index: number; distance: number }`
  - `haversine(lat1: number, lng1: number, lat2: number, lng2: number): number`
  - `buildSegments(vertices: Vertex[]): RouteSegment[]`
  - `toStoredSegments(vertices: Vertex[], slopes: number[]): SlopePoint[]`
  - `readStoredVertices(segments: SlopePoint[]): Vertex[]`
  - `readStoredSlopes(segments: SlopePoint[]): number[]`
  - `validateRoute(name: string, vertices: Vertex[], slopes: (number | null)[]): string[]`
  - `slopeWarning(slope: number): "extreme" | "legal" | null`
  - `isManualRoute(route: { gpx_file: string | null }): boolean`
  - 상수 `LEGAL_SLOPE_LIMIT = 8.33`, `EXTREME_SLOPE_LIMIT = 30`, `MAX_SLOPE_INPUT = 100`

- [x] **Step 1: `SlopePoint`에 선택 속성을 추가한다**

`src/types/domain.ts`의 기존 정의를 이걸로 바꾼다.

```ts
/** slope_segments.segments(jsonb) 내부 포인트 */
export interface SlopePoint {
  lat: number;
  lng: number;
  /** GPX 측정 원본에만 있다. 수기 경로는 null (GPX 폐기 시 제거) */
  ele: number | null;
  /** 수기 경로의 구간 값. 첫 포인트에는 없다 */
  slope?: number;
  distance?: number;
}
```

union으로 만들지 않는 이유는 설계 문서 5.2.2절에 있다. 요약하면
`{lat,lng,ele}`와 `{lat,lng,ele,slope}`의 union에서는 `point.slope` 접근이
컴파일되지 않는다.

- [x] **Step 2: 실패하는 테스트를 쓴다**

`src/lib/slopeRoute.test.ts`를 새로 만든다.

```ts
import { describe, expect, it } from "vitest";
import {
  buildSegments,
  haversine,
  isManualRoute,
  readStoredSlopes,
  readStoredVertices,
  slopeWarning,
  toStoredSegments,
  validateRoute,
} from "./slopeRoute";

// 위도 0.001도는 약 111.19m, 경도 0.001도는 위도 37.589에서 약 88.1m다.
const A = { lat: 37.589, lng: 127.032 };
const B = { lat: 37.59, lng: 127.032 };
const C = { lat: 37.59, lng: 127.033 };

describe("haversine", () => {
  it("위도 0.001도 차이를 약 111m로 계산한다", () => {
    expect(haversine(A.lat, A.lng, B.lat, B.lng)).toBeCloseTo(111.19, 1);
  });

  it("같은 지점 사이 거리는 0이다", () => {
    expect(haversine(A.lat, A.lng, A.lat, A.lng)).toBe(0);
  });
});

describe("buildSegments", () => {
  it("꼭짓점이 2개 미만이면 구간이 없다", () => {
    expect(buildSegments([])).toEqual([]);
    expect(buildSegments([A])).toEqual([]);
  });

  it("꼭짓점 n개에서 구간 n-1개를 만든다", () => {
    const segments = buildSegments([A, B, C]);
    expect(segments).toHaveLength(2);
    expect(segments[0].index).toBe(0);
    expect(segments[1].index).toBe(1);
  });

  it("구간 거리를 소수점 한 자리로 반올림한다", () => {
    expect(buildSegments([A, B])[0].distance).toBe(111.2);
  });

  // 거리를 들고 다니면 안 되는 이유. 선을 통째로 옮기면 경도 길이가 달라진다.
  it("같은 형상이라도 위도가 다르면 거리가 달라진다", () => {
    const near = buildSegments([
      { lat: 37.589, lng: 127.032 },
      { lat: 37.589, lng: 127.033 },
    ])[0].distance;
    const far = buildSegments([
      { lat: 60.0, lng: 127.032 },
      { lat: 60.0, lng: 127.033 },
    ])[0].distance;
    expect(near).not.toBe(far);
  });
});

describe("toStoredSegments", () => {
  it("첫 포인트에는 slope와 distance가 없다", () => {
    const stored = toStoredSegments([A, B], [7.2]);
    expect(stored[0]).toEqual({ lat: A.lat, lng: A.lng, ele: null });
  });

  it("이후 포인트에 구간 값과 계산된 거리를 싣는다", () => {
    const stored = toStoredSegments([A, B], [7.2]);
    expect(stored[1]).toEqual({
      lat: B.lat,
      lng: B.lng,
      ele: null,
      slope: 7.2,
      distance: 111.2,
    });
  });

  it("모든 포인트에 ele: null이 있다", () => {
    const stored = toStoredSegments([A, B, C], [7.2, 4.5]);
    expect(stored.every((point) => point.ele === null)).toBe(true);
  });

  it("경사도를 소수점 한 자리로 반올림한다", () => {
    expect(toStoredSegments([A, B], [7.26])[1].slope).toBe(7.3);
  });

  // SlopeLayer의 구버전 감지가 raw[1].slope를 본다. 0도 통과해야 한다.
  it("경사도 0도 값으로 저장한다", () => {
    expect(toStoredSegments([A, B], [0])[1].slope).toBe(0);
  });
});

describe("readStoredVertices / readStoredSlopes", () => {
  it("저장된 포인트에서 꼭짓점과 값을 되읽는다", () => {
    const stored = toStoredSegments([A, B, C], [7.2, 4.5]);
    expect(readStoredVertices(stored)).toEqual([
      { lat: A.lat, lng: A.lng },
      { lat: B.lat, lng: B.lng },
      { lat: C.lat, lng: C.lng },
    ]);
    expect(readStoredSlopes(stored)).toEqual([7.2, 4.5]);
  });
});

describe("slopeWarning", () => {
  it("8.33 이하는 경고가 없다", () => {
    expect(slopeWarning(8.33)).toBeNull();
  });

  it("8.33 초과 30 이하는 법적 기준 경고다", () => {
    expect(slopeWarning(8.34)).toBe("legal");
    expect(slopeWarning(30)).toBe("legal");
  });

  it("30 초과는 강한 경고다", () => {
    expect(slopeWarning(30.1)).toBe("extreme");
  });
});

describe("validateRoute", () => {
  it("정상 입력에는 오류가 없다", () => {
    expect(validateRoute("정문 경사로", [A, B], [7.2])).toEqual([]);
  });

  it("이름이 비면 막는다", () => {
    expect(validateRoute("   ", [A, B], [7.2])).toContain(
      "경로 이름을 입력해주세요",
    );
  });

  it("꼭짓점이 2개 미만이면 막는다", () => {
    expect(validateRoute("이름", [A], [])).toContain(
      "지도에 경로를 그려주세요",
    );
  });

  it("입력값 개수가 구간 수와 어긋나면 막는다", () => {
    expect(validateRoute("이름", [A, B, C], [7.2])).toContain(
      "구간과 입력값이 어긋났어요. 지우고 다시 그려주세요",
    );
  });

  it("미입력 구간이 있으면 막는다", () => {
    expect(validateRoute("이름", [A, B], [null])).toContain(
      "1번 구간의 경사도를 입력해주세요",
    );
  });

  it("NaN과 Infinity를 막는다", () => {
    expect(validateRoute("이름", [A, B], [NaN])).toContain(
      "1번 구간의 경사도가 숫자가 아니에요",
    );
    expect(validateRoute("이름", [A, B], [Infinity])).toContain(
      "1번 구간의 경사도가 숫자가 아니에요",
    );
  });

  it("음수를 막는다", () => {
    expect(validateRoute("이름", [A, B], [-0.1])).toContain(
      "1번 구간의 경사도는 0 이상이어야 해요",
    );
  });

  it("100까지 허용하고 100 초과를 막는다", () => {
    expect(validateRoute("이름", [A, B], [100])).toEqual([]);
    expect(validateRoute("이름", [A, B], [100.1])).toContain(
      "1번 구간의 경사도는 100% 이하여야 해요",
    );
  });

  // 30%는 경고일 뿐 저장은 된다. 실제로 존재하는 급경사를 막으면 안 된다.
  it("30을 넘어도 저장은 막지 않는다", () => {
    expect(validateRoute("이름", [A, B], [45])).toEqual([]);
  });

  it("같은 자리를 두 번 찍어 생긴 0m 구간을 막는다", () => {
    expect(validateRoute("이름", [A, A], [7.2])).toContain(
      "길이가 0m인 구간이 있어요. 같은 자리를 두 번 찍지 말아주세요",
    );
  });
});

describe("isManualRoute", () => {
  it("gpx_file이 null이면 수기 경로다", () => {
    expect(isManualRoute({ gpx_file: null })).toBe(true);
    expect(isManualRoute({ gpx_file: "정문.gpx" })).toBe(false);
  });
});
```

- [x] **Step 3: 테스트가 실패하는지 확인한다**

```
npx vitest run src/lib/slopeRoute.test.ts
```

기대: `Failed to load ./slopeRoute` — 모듈이 없어 collect 단계에서 실패한다.

- [x] **Step 4: 구현한다**

`src/lib/slopeRoute.ts`를 만든다.

```ts
import type { SlopePoint } from "@/types/domain";

/** 지도에서 찍은 꼭짓점. 고도는 쓰지 않는다. */
export interface Vertex {
  lat: number;
  lng: number;
}

/** 구간 하나. index는 vertices[index] → vertices[index + 1]을 뜻한다. */
export interface RouteSegment {
  index: number;
  distance: number;
}

/** 건축법상 경사로 기준 1/12 */
export const LEGAL_SLOPE_LIMIT = 8.33;
/** 이 위는 오타를 의심한다. 저장은 막지 않는다. */
export const EXTREME_SLOPE_LIMIT = 30;
/** 45도. 이 위는 보행 노면이 아니라 입력 사고로 본다. */
export const MAX_SLOPE_INPUT = 100;

const EARTH_RADIUS_M = 6371000;

function toRadians(degrees: number) {
  return (degrees * Math.PI) / 180;
}

export function haversine(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
) {
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function round1(value: number) {
  return Math.round(value * 10) / 10;
}

export function buildSegments(vertices: Vertex[]): RouteSegment[] {
  if (vertices.length < 2) return [];
  const segments: RouteSegment[] = [];
  for (let i = 0; i < vertices.length - 1; i++) {
    const raw = haversine(
      vertices[i].lat,
      vertices[i].lng,
      vertices[i + 1].lat,
      vertices[i + 1].lng,
    );
    segments.push({ index: i, distance: round1(raw) });
  }
  return segments;
}

export function slopeWarning(slope: number): "extreme" | "legal" | null {
  if (slope > EXTREME_SLOPE_LIMIT) return "extreme";
  if (slope > LEGAL_SLOPE_LIMIT) return "legal";
  return null;
}

export function validateRoute(
  name: string,
  vertices: Vertex[],
  slopes: (number | null)[],
): string[] {
  const errors: string[] = [];
  if (!name.trim()) errors.push("경로 이름을 입력해주세요");
  if (vertices.length < 2) errors.push("지도에 경로를 그려주세요");

  const segments = buildSegments(vertices);
  if (vertices.length >= 2 && slopes.length !== segments.length) {
    errors.push("구간과 입력값이 어긋났어요. 지우고 다시 그려주세요");
  }
  if (segments.some((segment) => segment.distance === 0)) {
    errors.push("길이가 0m인 구간이 있어요. 같은 자리를 두 번 찍지 말아주세요");
  }

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
    if (slope < 0) errors.push(`${label}는 0 이상이어야 해요`);
    else if (slope > MAX_SLOPE_INPUT)
      errors.push(`${label}는 ${MAX_SLOPE_INPUT}% 이하여야 해요`);
  });

  return errors;
}

export function toStoredSegments(
  vertices: Vertex[],
  slopes: number[],
): SlopePoint[] {
  const segments = buildSegments(vertices);
  return vertices.map((vertex, index) => {
    if (index === 0) return { lat: vertex.lat, lng: vertex.lng, ele: null };
    return {
      lat: vertex.lat,
      lng: vertex.lng,
      ele: null,
      slope: round1(slopes[index - 1]),
      distance: segments[index - 1].distance,
    };
  });
}

export function readStoredVertices(segments: SlopePoint[]): Vertex[] {
  return segments.map((point) => ({ lat: point.lat, lng: point.lng }));
}

export function readStoredSlopes(segments: SlopePoint[]): number[] {
  return segments.slice(1).map((point) => point.slope ?? 0);
}

export function isManualRoute(route: { gpx_file: string | null }) {
  return route.gpx_file === null;
}
```

- [x] **Step 5: 테스트가 통과하는지 확인한다**

```
npx vitest run src/lib/slopeRoute.test.ts
npm run typecheck
```

기대: 테스트 전부 PASS, typecheck 오류 0.

`npm run typecheck`가 `SlopeLayer.tsx`에서 실패하면 Step 6에서 고친다.

- [x] **Step 6: `SlopeLayer`의 지역 타입을 정리한다**

`src/components/map/SlopeLayer.tsx` 상단의 지역 선언을 지운다.

```ts
// 지운다
type StoredPoint = SlopePoint & { slope?: number; distance?: number };
```

`SlopePoint`가 이제 그 모양이므로 `StoredPoint` 사용처를 `SlopePoint`로 바꾼다.
`MetricPoint`는 계산 결과가 필수인 지역 타입이므로 그대로 둔다.

```ts
const raw = route.segments as SlopePoint[] | null;
```

- [x] **Step 7: 전체 테스트와 빌드로 회귀를 확인한다**

```
npm test
npm run typecheck
npx prettier --check --end-of-line auto src/lib/slopeRoute.ts src/lib/slopeRoute.test.ts src/types/domain.ts src/components/map/SlopeLayer.tsx
```

기대: 전부 통과. `SlopeLayer`의 기존 렌더링 동작은 바뀌지 않는다.

- [x] **Step 8: 커밋**

```bash
git add src/lib/slopeRoute.ts src/lib/slopeRoute.test.ts src/types/domain.ts src/components/map/SlopeLayer.tsx
git commit -F - <<'EOF'
feat(slope): 수기 경로 계산과 검증을 순수 함수로 뺀다

거리·구간 생성·저장 포맷 변환·검증을 slopeRoute.ts에 모은다. vitest가
node 환경이라 판단이 들어가는 로직은 전부 여기서 덮는다.

거리는 저장하지 않고 좌표에서 매번 계산한다. 선을 통째로 옮기면 위경도가
바뀌어 haversine 거리가 보존되지 않기 때문이다. 테스트로 고정했다.

SlopePoint에 slope·distance 선택 속성을 넣고 SlopeLayer의 지역 StoredPoint를
지운다. union으로 만들면 측정형에 slope가 없어 .slope 접근이 막힌다.

2026-08-30
EOF
```

---

## Task 2: 라우트와 인증

빈 편집기 자리만 만들고 라우팅·인증을 먼저 닫는다. 지도 없이도 e2e로 검증된다.

**파일**

- 생성: `src/app/admin/slopes/new/page.tsx`
- 수정: `src/app/admin/dashboard/slopes/page.tsx`
- 테스트: `e2e/admin-buildings-slopes.spec.ts`

**인터페이스**

- 사용: 없음
- 제공: `/admin/slopes/new` 경로. Task 3이 여기에 편집기를 꽂는다.

- [x] **Step 1: 실패하는 e2e를 쓴다**

`e2e/admin-buildings-slopes.spec.ts` 맨 끝, `test.describe` 블록 안에 추가한다.

```ts
test("목록에서 경로 직접 그리기로 편집기에 들어간다", async ({ page }) => {
  await installMockBackend(page, { authenticated: true });
  await page.goto("/admin/dashboard/slopes");
  await page.getByRole("button", { name: "경로 직접 그리기" }).click();
  await expect(page).toHaveURL(/\/admin\/slopes\/new$/);
  await expect(
    page.getByRole("heading", { name: "경사도 경로 그리기" }),
  ).toBeVisible();
});

test("비로그인 상태로 편집기에 가면 로그인 화면으로 보낸다", async ({
  page,
}) => {
  await installMockBackend(page, { authenticated: false });
  await page.goto("/admin/slopes/new");
  await expect(page).toHaveURL(/\/admin$/);
});
```

- [x] **Step 2: 실패를 확인한다**

```
npx playwright test e2e/admin-buildings-slopes.spec.ts -g "목록에서 경로 직접 그리기로 편집기에 들어간다"
```

기대: FAIL. "경로 직접 그리기" 버튼이 없다.

`-g`는 테스트 제목 전체가 필요하다. 부분 제목은 `No tests found`가 난다.

- [x] **Step 3: 편집기 페이지를 만든다**

`src/app/admin/slopes/new/page.tsx`

```tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import "../../admin-ui.css";

export default function NewSlopeRoutePage() {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);

  // /admin/slopes/*는 대시보드 레이아웃 밖이라 인증을 상속받지 못한다.
  // buildings/new와 같은 방식으로 페이지가 직접 확인한다.
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        router.push("/admin");
        return;
      }
      setAuthChecked(true);
    });
  }, [router]);

  if (!authChecked) return null;

  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 24 }}>
        경사도 경로 그리기
      </h1>
    </div>
  );
}
```

- [x] **Step 4: 목록에 진입 버튼을 넣는다**

`src/app/admin/dashboard/slopes/page.tsx`에서 `useRouter`를 import하고
컴포넌트 안에 `const router = useRouter();`를 추가한다.

```ts
import { useRouter } from "next/navigation";
```

"등록된 경로" 카드의 제목 줄을 버튼과 함께 배치한다. 기존
`<div style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>등록된 경로 (총 {totalCount}개)</div>`
를 이걸로 바꾼다.

```tsx
<div
  style={{
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  }}
>
  <div style={{ fontSize: 14, fontWeight: 600 }}>
    등록된 경로 (총 {totalCount}개)
  </div>
  <button
    onClick={() => router.push("/admin/slopes/new")}
    style={{
      padding: "8px 16px",
      background: "var(--ku-primary)",
      color: "#fff",
      border: "none",
      borderRadius: 8,
      fontSize: 13,
      fontWeight: 500,
      cursor: "pointer",
    }}
  >
    경로 직접 그리기
  </button>
</div>
```

- [x] **Step 5: 통과를 확인한다**

```
npx playwright test e2e/admin-buildings-slopes.spec.ts -g "목록에서 경로 직접 그리기로 편집기에 들어간다"
npx playwright test e2e/admin-buildings-slopes.spec.ts -g "비로그인 상태로 편집기에 가면 로그인 화면으로 보낸다"
npm run typecheck
```

기대: 둘 다 PASS.

- [x] **Step 6: 커밋**

```bash
git add src/app/admin/slopes/new/page.tsx src/app/admin/dashboard/slopes/page.tsx e2e/admin-buildings-slopes.spec.ts
git commit -F - <<'EOF'
feat(slope): 경로 편집기 라우트와 인증을 연다

/admin/slopes/*는 대시보드 레이아웃 밖이라 레이아웃도 인증 검사도
상속받지 못한다. buildings/new와 같이 페이지가 직접 확인한다.

2026-08-30
EOF
```

---

## Task 3: 지도에 선 그리기

**파일**

- 생성: `src/components/slope/SlopeRouteMap.tsx`
- 수정: `src/app/admin/slopes/new/page.tsx`
- 테스트: `e2e/admin-buildings-slopes.spec.ts`

**인터페이스**

- 사용: `Vertex` (`@/lib/slopeRoute`)
- 제공: `SlopeRouteMap` 컴포넌트

```ts
interface SlopeRouteMapProps {
  initialVertices: Vertex[] | null;
  onVerticesChange: (vertices: Vertex[]) => void;
  slopes: (number | null)[];
}
```

`slopes`는 Task 5의 색상 미리보기에서 쓴다. 이번 태스크에서는 받기만 한다.

- [x] **Step 1: 실패하는 e2e를 쓴다**

```ts
test("폴리라인을 그리면 구간이 생기고 꼭짓점을 더 넣을 수 없다", async ({
  page,
}) => {
  await installMockBackend(page, { authenticated: true });
  await page.goto("/admin/slopes/new");

  const map = page.locator(".leaflet-container");
  await expect(map).toBeVisible();

  await page.locator(".leaflet-pm-icon-polyline").locator("..").click();
  const points = [
    { x: 300, y: 120 },
    { x: 420, y: 180 },
    { x: 520, y: 260 },
  ];
  for (const position of points) await map.click({ position });
  // 마지막 점을 한 번 더 눌러 선을 끝낸다.
  await map.click({ position: points[2] });

  await expect(page.getByText("구간 1")).toBeVisible();
  await expect(page.getByText("구간 2")).toBeVisible();
  await expect(page.getByText("구간 3")).toHaveCount(0);

  // 꼭짓점 삽입용 중간점 핸들이 없어야 한다.
  await expect(page.locator(".marker-icon-middle")).toHaveCount(0);

  // 선을 하나 그리면 그리기 버튼이 잠긴다.
  await expect(
    page.locator(".leaflet-pm-icon-polyline").locator(".."),
  ).toHaveClass(/pm-disabled/);
});

test("지우고 다시 그리기로 경로를 비운다", async ({ page }) => {
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
  await expect(page.getByText("구간 1")).toBeVisible();

  await page.getByRole("button", { name: "지우고 다시 그리기" }).click();
  await expect(page.getByText("구간 1")).toHaveCount(0);
  await expect(
    page.locator(".leaflet-pm-icon-polyline").locator(".."),
  ).not.toHaveClass(/pm-disabled/);
});
```

- [x] **Step 2: 실패를 확인한다**

```
npx playwright test e2e/admin-buildings-slopes.spec.ts -g "폴리라인을 그리면 구간이 생기고 꼭짓점을 더 넣을 수 없다"
```

기대: FAIL. `.leaflet-container`가 없다.

- [x] **Step 3: 지도 컴포넌트를 만든다**

`src/components/slope/SlopeRouteMap.tsx`

```tsx
"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "@geoman-io/leaflet-geoman-free";
import "@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css";
import { CARTO_ATTRIBUTION, getCartoTileUrl } from "@/lib/mapTiles";
import { usePrefersDarkMode } from "@/lib/usePrefersDarkMode";
import type { Vertex } from "@/lib/slopeRoute";

const KU_CENTER: [number, number] = [37.5893, 127.0327];

interface SlopeRouteMapProps {
  initialVertices: Vertex[] | null;
  onVerticesChange: (vertices: Vertex[]) => void;
  slopes: (number | null)[];
}

export default function SlopeRouteMap({
  initialVertices,
  onVerticesChange,
}: SlopeRouteMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const lineRef = useRef<L.Polyline | null>(null);
  const onChangeRef = useRef(onVerticesChange);
  const initialRef = useRef(initialVertices);
  const prefersDarkMode = usePrefersDarkMode();

  useEffect(() => {
    onChangeRef.current = onVerticesChange;
  }, [onVerticesChange]);

  useEffect(() => {
    if (mapRef.current) return;
    const initial = initialRef.current;

    const center: [number, number] = initial?.length
      ? [initial[0].lat, initial[0].lng]
      : KU_CENTER;
    const map = L.map(containerRef.current!, { scrollWheelZoom: true }).setView(
      center,
      19,
    );
    mapRef.current = map;

    tileLayerRef.current = L.tileLayer(getCartoTileUrl(false), {
      attribution: CARTO_ATTRIBUTION,
      subdomains: "abcd",
    }).addTo(map);

    // 이벤트는 "뭔가 바뀌었다"는 신호로만 쓴다. 무슨 편집이었는지 추론하지
    // 않고 좌표를 레이어에서 다시 읽는다. 멱등이라 중복 호출이 안전하다.
    function syncVertices() {
      const line = lineRef.current;
      if (!line) {
        onChangeRef.current([]);
        return;
      }
      const latlngs = line.getLatLngs() as L.LatLng[];
      onChangeRef.current(
        latlngs.map((latlng) => ({ lat: latlng.lat, lng: latlng.lng })),
      );
    }

    function lockDrawButton() {
      map.pm.disableDraw("Line");
      map.pm.Toolbar.setButtonDisabled("drawPolyline", true);
    }

    function attachLine(line: L.Polyline) {
      lineRef.current = line;
      // 꼭짓점 추가·삭제를 막는다. 개수가 고정되면 구간과 입력값의 대응이
      // 그리기 직후에 확정되고 그 뒤로 어긋나지 않는다.
      line.pm.enable({
        allowSelfIntersection: true,
        hideMiddleMarkers: true,
        preventMarkerRemoval: true,
      });
      line.on("pm:edit", syncVertices);
      line.on("pm:markerdragend", syncVertices);
      line.on("pm:dragend", syncVertices);
    }

    map.pm.addControls({
      position: "topleft",
      drawPolyline: true,
      editMode: false,
      dragMode: true,
      cutPolygon: false,
      removalMode: false,
      drawMarker: false,
      drawCircle: false,
      drawPolygon: false,
      drawRectangle: false,
      drawCircleMarker: false,
      drawText: false,
      rotateMode: false,
    });

    if (initial?.length) {
      const line = L.polyline(
        initial.map((vertex) => [vertex.lat, vertex.lng] as [number, number]),
        { color: "#2563EB", weight: 3 },
      ).addTo(map);
      attachLine(line);
      lockDrawButton();
      map.fitBounds(line.getBounds(), { padding: [40, 40] });
    }

    map.on("pm:create", (event) => {
      const line = event.layer as L.Polyline;
      attachLine(line);
      lockDrawButton();
      syncVertices();
    });

    return () => {
      map.remove();
      mapRef.current = null;
      tileLayerRef.current = null;
      lineRef.current = null;
    };
  }, []);

  useEffect(() => {
    tileLayerRef.current?.setUrl(getCartoTileUrl(prefersDarkMode));
  }, [prefersDarkMode]);

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%",
        height: 420,
        borderRadius: 8,
        overflow: "hidden",
        border: "1px solid var(--ku-border)",
      }}
    />
  );
}
```

- [x] **Step 4: 페이지에 꽂는다**

`src/app/admin/slopes/new/page.tsx`를 이렇게 바꾼다.

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { supabase } from "@/lib/supabaseClient";
import { buildSegments, type Vertex } from "@/lib/slopeRoute";
import "../../admin-ui.css";

// leaflet을 정적 import하므로 서버에서 실행되면 window가 없어 터진다.
const SlopeRouteMap = dynamic(
  () => import("@/components/slope/SlopeRouteMap"),
  { ssr: false },
);

export default function NewSlopeRoutePage() {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const [vertices, setVertices] = useState<Vertex[]>([]);
  const [slopes, setSlopes] = useState<(number | null)[]>([]);
  const [mapKey, setMapKey] = useState(0);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        router.push("/admin");
        return;
      }
      setAuthChecked(true);
    });
  }, [router]);

  const handleVerticesChange = useCallback((next: Vertex[]) => {
    setVertices(next);
    // 꼭짓점 개수는 그리기 이후 바뀌지 않는다. 길이가 다르면 새로 그린 것이다.
    setSlopes((prev) => {
      const count = Math.max(0, next.length - 1);
      if (prev.length === count) return prev;
      return Array.from({ length: count }, () => null);
    });
  }, []);

  function handleReset() {
    setVertices([]);
    setSlopes([]);
    setMapKey((key) => key + 1);
  }

  if (!authChecked) return null;

  const segments = buildSegments(vertices);

  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 24 }}>
        경사도 경로 그리기
      </h1>
      <SlopeRouteMap
        key={mapKey}
        initialVertices={null}
        onVerticesChange={handleVerticesChange}
        slopes={slopes}
      />
      {segments.length > 0 && (
        <>
          <ul style={{ marginTop: 16, paddingLeft: 20 }}>
            {segments.map((segment) => (
              <li key={segment.index} style={{ fontSize: 13 }}>
                구간 {segment.index + 1} · {segment.distance}m
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={handleReset}
            style={{
              marginTop: 12,
              padding: "8px 16px",
              background: "none",
              border: "1px solid var(--ku-danger)",
              color: "var(--ku-danger)",
              borderRadius: 8,
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            지우고 다시 그리기
          </button>
        </>
      )}
    </div>
  );
}
```

`mapKey`를 올려 지도를 통째로 다시 마운트하는 것이 초기화다. geoman 레이어와
툴바 상태를 손으로 되돌리는 것보다 확실하다.

- [x] **Step 5: 통과를 확인한다**

```
npx playwright test e2e/admin-buildings-slopes.spec.ts -g "폴리라인을 그리면 구간이 생기고 꼭짓점을 더 넣을 수 없다"
npx playwright test e2e/admin-buildings-slopes.spec.ts -g "지우고 다시 그리기로 경로를 비운다"
npm run typecheck
```

기대: 둘 다 PASS.

디버깅이 필요하면 `--headed --debug`를 붙인다.

- [x] **Step 6: 커밋**

```bash
git add src/components/slope/SlopeRouteMap.tsx src/app/admin/slopes/new/page.tsx e2e/admin-buildings-slopes.spec.ts
git commit -F - <<'EOF'
feat(slope): 지도에서 경로 폴리라인을 그린다

hideMiddleMarkers와 preventMarkerRemoval로 꼭짓점 추가·삭제를 막는다.
개수가 고정되면 구간과 입력값의 대응이 그리기 직후 확정되고 그 뒤로
어긋나지 않는다. 형상을 바꾸려면 지우고 다시 그린다.

이벤트는 신호로만 쓰고 좌표는 레이어에서 다시 읽는다. 멱등이라 pm:edit가
세부 이벤트와 겹쳐 들어와도 결과가 같다.

2026-08-30
EOF
```

---

## Task 4: 구간 입력과 저장

**파일**

- 생성: `src/components/slope/SlopeSegmentList.tsx`
- 생성: `src/components/SlopeRouteEditor.tsx`
- 수정: `src/app/admin/slopes/new/page.tsx`
- 테스트: `e2e/admin-buildings-slopes.spec.ts`

**인터페이스**

- 사용: `buildSegments`, `validateRoute`, `slopeWarning`, `toStoredSegments`,
  `Vertex` (`@/lib/slopeRoute`), `SlopeRouteMap`
- 제공:

```ts
interface SlopeSegmentListProps {
  segments: RouteSegment[];
  slopes: (number | null)[];
  onSlopeChange: (index: number, value: number | null) => void;
}

interface SlopeRouteEditorProps {
  initialName: string;
  initialVertices: Vertex[] | null;
  initialSlopes: number[];
  saving: boolean;
  onSave: (name: string, segments: SlopePoint[]) => void | Promise<void>;
  onCancel: () => void;
}
```

- [x] **Step 1: 실패하는 e2e를 쓴다**

```ts
test("구간 값을 넣어 저장하면 수기 경로 포맷으로 들어간다", async ({
  page,
}) => {
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

  await page.getByLabel("경로 이름").fill("안암병원 정문 경사로");

  // 값이 비어 있으면 저장이 막힌다.
  await expect(page.getByRole("button", { name: "경로 저장" })).toBeDisabled();

  await page.getByLabel("구간 1 경사도").fill("7.2");
  await page.getByRole("button", { name: "경로 저장" }).click();

  await expect(page).toHaveURL(/\/admin\/dashboard\/slopes$/);

  const saved = state.slopes.find((row) => row.name === "안암병원 정문 경사로");
  expect(saved).toBeTruthy();
  expect(saved!.gpx_file).toBeNull();

  const segments = saved!.segments as Array<Record<string, unknown>>;
  expect(segments).toHaveLength(2);
  expect(segments[0].slope).toBeUndefined();
  expect(segments[0].ele).toBeNull();
  expect(segments[1].slope).toBe(7.2);
  expect(typeof segments[1].distance).toBe("number");
  expect(segments[1].distance).toBeGreaterThan(0);
});

test("법적 기준과 급경사 경고를 표시하되 저장은 막지 않는다", async ({
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

  await page.getByLabel("경로 이름").fill("급경사 시험");

  await page.getByLabel("구간 1 경사도").fill("10");
  await expect(page.getByText("법적 기준(1/12) 초과")).toBeVisible();
  await expect(page.getByRole("button", { name: "경로 저장" })).toBeEnabled();

  await page.getByLabel("구간 1 경사도").fill("45");
  await expect(
    page.getByText("이 값이 맞나요? 30%를 넘는 보행 경사로는 매우 드뭅니다"),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "경로 저장" })).toBeEnabled();

  await page.getByLabel("구간 1 경사도").fill("120");
  await expect(page.getByRole("button", { name: "경로 저장" })).toBeDisabled();
});
```

- [x] **Step 2: 실패를 확인한다**

```
npx playwright test e2e/admin-buildings-slopes.spec.ts -g "구간 값을 넣어 저장하면 수기 경로 포맷으로 들어간다"
```

기대: FAIL. "경로 이름" 입력이 없다.

- [x] **Step 3: 구간 입력 목록을 만든다**

`src/components/slope/SlopeSegmentList.tsx`

```tsx
"use client";

import { slopeWarning, type RouteSegment } from "@/lib/slopeRoute";

interface SlopeSegmentListProps {
  segments: RouteSegment[];
  slopes: (number | null)[];
  onSlopeChange: (index: number, value: number | null) => void;
}

const WARNING_TEXT = {
  legal: "법적 기준(1/12) 초과",
  extreme: "이 값이 맞나요? 30%를 넘는 보행 경사로는 매우 드뭅니다",
} as const;

export default function SlopeSegmentList({
  segments,
  slopes,
  onSlopeChange,
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
        const warning =
          value !== null && value !== undefined && Number.isFinite(value)
            ? slopeWarning(value)
            : null;
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
                value={value ?? ""}
                onChange={(event) => {
                  const raw = event.target.value;
                  onSlopeChange(segment.index, raw === "" ? null : Number(raw));
                }}
                style={{
                  width: 110,
                  padding: "8px 10px",
                  border: "1px solid var(--ku-border)",
                  borderRadius: 8,
                  fontSize: 14,
                }}
              />
              <span style={{ fontSize: 13 }}>%</span>
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

- [x] **Step 4: 편집기를 만든다**

`src/components/SlopeRouteEditor.tsx`

```tsx
"use client";

import { useCallback, useState } from "react";
import dynamic from "next/dynamic";
import SlopeSegmentList from "@/components/slope/SlopeSegmentList";
import {
  buildSegments,
  toStoredSegments,
  validateRoute,
  type Vertex,
} from "@/lib/slopeRoute";
import type { SlopePoint } from "@/types/domain";

const SlopeRouteMap = dynamic(
  () => import("@/components/slope/SlopeRouteMap"),
  { ssr: false },
);

interface SlopeRouteEditorProps {
  initialName: string;
  initialVertices: Vertex[] | null;
  initialSlopes: number[];
  saving: boolean;
  onSave: (name: string, segments: SlopePoint[]) => void | Promise<void>;
  onCancel: () => void;
}

export default function SlopeRouteEditor({
  initialName,
  initialVertices,
  initialSlopes,
  saving,
  onSave,
  onCancel,
}: SlopeRouteEditorProps) {
  const [name, setName] = useState(initialName);
  const [vertices, setVertices] = useState<Vertex[]>(initialVertices ?? []);
  const [slopes, setSlopes] = useState<(number | null)[]>(initialSlopes);
  const [mapKey, setMapKey] = useState(0);

  const handleVerticesChange = useCallback((next: Vertex[]) => {
    setVertices(next);
    setSlopes((prev) => {
      const count = Math.max(0, next.length - 1);
      if (prev.length === count) return prev;
      return Array.from({ length: count }, () => null);
    });
  }, []);

  function handleSlopeChange(index: number, value: number | null) {
    setSlopes((prev) => prev.map((slope, i) => (i === index ? value : slope)));
  }

  function handleReset() {
    setVertices([]);
    setSlopes([]);
    setMapKey((key) => key + 1);
  }

  const segments = buildSegments(vertices);
  const errors = validateRoute(name, vertices, slopes);
  const canSave = errors.length === 0 && !saving;

  function handleSave() {
    if (!canSave) return;
    void onSave(name.trim(), toStoredSegments(vertices, slopes as number[]));
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <label
          htmlFor="slope-route-name"
          style={{ fontSize: 13, fontWeight: 600 }}
        >
          경로 이름
        </label>
        <input
          id="slope-route-name"
          aria-label="경로 이름"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="예: 안암병원 정문 경사로"
          style={{
            display: "block",
            width: "100%",
            maxWidth: 420,
            marginTop: 6,
            padding: "10px 12px",
            border: "1px solid var(--ku-border)",
            borderRadius: 8,
            fontSize: 14,
          }}
        />
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 2fr) minmax(260px, 1fr)",
          gap: 20,
          alignItems: "start",
        }}
      >
        <SlopeRouteMap
          key={mapKey}
          initialVertices={initialVertices}
          onVerticesChange={handleVerticesChange}
          slopes={slopes}
        />
        <SlopeSegmentList
          segments={segments}
          slopes={slopes}
          onSlopeChange={handleSlopeChange}
        />
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {vertices.length > 0 && (
          <button
            type="button"
            onClick={handleReset}
            style={{
              padding: "10px 16px",
              background: "none",
              border: "1px solid var(--ku-danger)",
              color: "var(--ku-danger)",
              borderRadius: 8,
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            지우고 다시 그리기
          </button>
        )}
        <button
          type="button"
          onClick={onCancel}
          style={{
            padding: "10px 16px",
            background: "none",
            border: "1px solid var(--ku-border)",
            borderRadius: 8,
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          취소
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={!canSave}
          style={{
            padding: "10px 20px",
            background: canSave ? "var(--ku-primary)" : "var(--ku-border)",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 500,
            cursor: canSave ? "pointer" : "not-allowed",
          }}
        >
          {saving ? "저장 중..." : "경로 저장"}
        </button>
      </div>

      {errors.length > 0 && vertices.length > 0 && (
        <ul
          style={{
            margin: 0,
            paddingLeft: 20,
            fontSize: 12,
            color: "var(--ku-text-2)",
          }}
        >
          {errors.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [x] **Step 5: 페이지를 편집기로 교체한다**

`src/app/admin/slopes/new/page.tsx`

```tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import SlopeRouteEditor from "@/components/SlopeRouteEditor";
import Toast from "@/components/Toast";
import type { SlopePoint } from "@/types/domain";
import type { Json } from "@supabase-types";
import "../../admin-ui.css";

export default function NewSlopeRoutePage() {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: string } | null>(
    null,
  );

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        router.push("/admin");
        return;
      }
      setAuthChecked(true);
    });
  }, [router]);

  async function handleSave(name: string, segments: SlopePoint[]) {
    setSaving(true);
    const { error } = await supabase.from("slope_segments").insert({
      name,
      gpx_file: null,
      segments: segments as unknown as Json,
    });
    setSaving(false);
    if (error) {
      // 그린 경로와 입력값을 날리지 않는다. 그대로 두고 재시도하게 한다.
      setToast({ message: "저장 실패: " + error.message, type: "error" });
      return;
    }
    router.push("/admin/dashboard/slopes");
  }

  if (!authChecked) return null;

  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 24 }}>
        경사도 경로 그리기
      </h1>
      <SlopeRouteEditor
        initialName=""
        initialVertices={null}
        initialSlopes={[]}
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

- [x] **Step 6: 통과를 확인한다**

```
npx playwright test e2e/admin-buildings-slopes.spec.ts -g "구간 값을 넣어 저장하면 수기 경로 포맷으로 들어간다"
npx playwright test e2e/admin-buildings-slopes.spec.ts -g "법적 기준과 급경사 경고를 표시하되 저장은 막지 않는다"
npm run typecheck
```

기대: 둘 다 PASS.

- [x] **Step 7: 커밋**

```bash
git add src/components/slope/SlopeSegmentList.tsx src/components/SlopeRouteEditor.tsx src/app/admin/slopes/new/page.tsx e2e/admin-buildings-slopes.spec.ts
git commit -F - <<'EOF'
feat(slope): 구간별 경사도를 입력해 저장한다

저장 차단은 음수·100 초과·NaN·미입력·0m 구간까지다. 30%는 오타 경고일
뿐 막지 않는다. 실제로 존재하는 급경사가 가장 실어야 할 정보이기 때문이다.

저장이 실패해도 그린 경로와 입력값을 유지한다.

2026-08-30
EOF
```

---

## Task 5: 실시간 색상 미리보기

**파일**

- 수정: `src/components/slope/SlopeRouteMap.tsx`
- 테스트: `e2e/admin-buildings-slopes.spec.ts`

**인터페이스**

- 사용: `slopeColor` (`@/lib/theme`), 이미 받고 있는 `slopes` prop
- 제공: 없음(내부 동작)

- [x] **Step 1: 실패하는 e2e를 쓴다**

```ts
test("입력한 경사도에 따라 미리보기 선 색이 바뀐다", async ({ page }) => {
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

  const preview = page.locator(".leaflet-pane.slope-preview-pane path").first();

  await page.getByLabel("구간 1 경사도").fill("1");
  await expect(preview).toHaveAttribute("stroke", "#B5AFA8");

  await page.getByLabel("구간 1 경사도").fill("10");
  await expect(preview).toHaveAttribute("stroke", "#AE3B1E");
});
```

색상값은 `src/lib/theme.ts`의 `slopeColor()` 그대로다. 1% 이하 `#B5AFA8`,
8.33% 초과 12% 이하 `#AE3B1E`.

- [x] **Step 2: 실패를 확인한다**

```
npx playwright test e2e/admin-buildings-slopes.spec.ts -g "입력한 경사도에 따라 미리보기 선 색이 바뀐다"
```

기대: FAIL. `.slope-preview-pane`이 없다.

- [x] **Step 3: 미리보기 레이어를 붙인다**

`src/components/slope/SlopeRouteMap.tsx`에 import를 추가한다.

```ts
import { slopeColor } from "@/lib/theme";
```

ref를 하나 더 둔다.

```ts
const previewRef = useRef<L.LayerGroup | null>(null);
const verticesRef = useRef<Vertex[]>([]);
```

지도 초기화 `useEffect` 안, 타일 레이어를 붙인 직후에 전용 pane을 만든다.

```ts
// 편집선(overlayPane, z-index 400)보다 아래에 둔다. "아래에 그린다"를 말로만
// 두면 실제 순서가 보장되지 않는다.
const pane = map.createPane("slopePreview");
pane.style.zIndex = "350";
pane.classList.add("slope-preview-pane");
previewRef.current = L.layerGroup([], { pane: "slopePreview" }).addTo(map);
```

`syncVertices` 안에서 좌표를 ref에도 담는다.

```ts
function syncVertices() {
  const line = lineRef.current;
  if (!line) {
    verticesRef.current = [];
    onChangeRef.current([]);
    return;
  }
  const latlngs = line.getLatLngs() as L.LatLng[];
  const next = latlngs.map((latlng) => ({
    lat: latlng.lat,
    lng: latlng.lng,
  }));
  verticesRef.current = next;
  onChangeRef.current(next);
}
```

컴포넌트 맨 아래, 기존 타일 `useEffect` 뒤에 미리보기 갱신 효과를 추가한다.

```tsx
useEffect(() => {
  const group = previewRef.current;
  if (!group) return;
  group.clearLayers();
  const vertices = verticesRef.current;
  for (let i = 0; i < vertices.length - 1; i++) {
    const slope = slopes[i];
    if (slope === null || slope === undefined || !Number.isFinite(slope))
      continue;
    L.polyline(
      [
        [vertices[i].lat, vertices[i].lng],
        [vertices[i + 1].lat, vertices[i + 1].lng],
      ],
      {
        color: slopeColor(Math.abs(slope)),
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
}, [slopes]);
```

`slopes`를 의존성으로 두면 값이 바뀔 때마다 다시 칠해진다. 구간이 몇 개
없으므로 통째로 재생성해도 무방하다.

- [x] **Step 4: 통과를 확인한다**

```
npx playwright test e2e/admin-buildings-slopes.spec.ts -g "입력한 경사도에 따라 미리보기 선 색이 바뀐다"
npx playwright test e2e/admin-buildings-slopes.spec.ts -g "폴리라인을 그리면 구간이 생기고 꼭짓점을 더 넣을 수 없다"
npm run typecheck
```

기대: 전부 PASS. 두 번째 테스트로 미리보기가 편집 동작을 방해하지 않는지
같이 확인한다.

- [x] **Step 5: 커밋**

```bash
git add src/components/slope/SlopeRouteMap.tsx e2e/admin-buildings-slopes.spec.ts
git commit -F - <<'EOF'
feat(slope): 입력값에 따라 구간 색을 미리 보여준다

공개 지도와 같은 slopeColor를 써서 저장 전에 결과를 확인하게 한다.

미리보기 레이어는 pmIgnore와 interactive:false로 편집에서 배제하고
z-index 350의 전용 pane에 그린다. 없으면 색칠용 선에 꼭짓점 핸들이
붙거나 편집선으로 갈 클릭을 가로챈다.

2026-08-30
EOF
```

---

## Task 6: 목록 페이지 분기와 GPX 업로드 종료

**파일**

- 수정: `src/app/admin/dashboard/slopes/page.tsx`
- 수정: `e2e/support/mockBackend.ts`
- 테스트: `e2e/admin-buildings-slopes.spec.ts`

**인터페이스**

- 사용: `isManualRoute` (`@/lib/slopeRoute`)
- 제공: 목록 행의 "수정" 버튼. Task 7이 여기서 진입한다.

- [x] **Step 1: 목 픽스처에 수기 경로를 넣는다**

`e2e/support/mockBackend.ts`의 `slopes` 배열에 두 번째 행을 추가한다.

```ts
{
  id: 2,
  name: "안암병원 정문 경사로",
  gpx_file: null,
  segments: [
    { lat: 37.5861, lng: 127.0268, ele: null },
    { lat: 37.5862, lng: 127.0269, ele: null, slope: 7.2, distance: 12.4 },
  ],
  created_at: "2026-08-30T00:00:00Z",
  updated_at: "2026-08-30T00:00:00Z",
},
```

- [x] **Step 2: 실패하는 e2e를 쓴다**

```ts
test("수기 경로와 GPX 경로의 행 동작을 구분한다", async ({ page }) => {
  await installMockBackend(page, { authenticated: true });
  await page.goto("/admin/dashboard/slopes");

  const manual = page.getByText("안암병원 정문 경사로").locator("xpath=../..");
  await expect(manual.getByText("직접 입력")).toBeVisible();
  await expect(manual.getByRole("button", { name: "수정" })).toBeVisible();
  await expect(manual.getByRole("button", { name: "다운로드" })).toHaveCount(0);

  const gpx = page.getByText("정문-중앙광장").locator("xpath=../..");
  await expect(gpx.getByRole("button", { name: "다운로드" })).toBeVisible();
  await expect(gpx.getByRole("button", { name: "수정" })).toHaveCount(0);
});

test("GPX 업로드를 닫고 종료 안내를 보여준다", async ({ page }) => {
  await installMockBackend(page, { authenticated: true });
  await page.goto("/admin/dashboard/slopes");
  await expect(page.locator("#gpx-input")).toHaveCount(0);
  await expect(
    page.getByText("GPX 등록은 종료됐어요. 경로는 직접 그려서 등록해주세요"),
  ).toBeVisible();
});
```

- [x] **Step 3: 실패를 확인한다**

```
npx playwright test e2e/admin-buildings-slopes.spec.ts -g "수기 경로와 GPX 경로의 행 동작을 구분한다"
```

기대: FAIL. "직접 입력" 배지가 없다.

- [x] **Step 4: 업로드 영역을 안내로 바꾼다**

`src/app/admin/dashboard/slopes/page.tsx`에서 "GPX 파일 업로드" 카드 전체를
아래 안내 블록으로 교체하고, 그 카드만 쓰던 것들을 함께 지운다.

- 상태 `selectedFile` / `setSelectedFile`
- 상태 `uploading` / `setUploading`
- 함수 `handleUpload`

`buildGpx`와 `downloadGpx`는 **남긴다.** GPX 행의 다운로드가 아직 살아 있다.

```tsx
<div
  style={{
    background: "var(--ku-surface)",
    borderRadius: 10,
    border: "1px solid var(--ku-border)",
    padding: 24,
    marginBottom: 24,
    fontSize: 13,
    color: "var(--ku-text-2)",
  }}
>
  GPX 등록은 종료됐어요. 경로는 직접 그려서 등록해주세요
</div>
```

업로드를 지금 닫는 이유는, 열어두면 폐기 대상이 계속 늘어나기 때문이다.
설계 문서 5.6절에 있다.

- [x] **Step 5: 행 버튼을 분기한다**

import에 추가한다.

```ts
import { isManualRoute } from "@/lib/slopeRoute";
```

경로 이름 아래 메타 줄에 배지를 넣는다. `{s.gpx_file && (...)}` 블록을
이걸로 바꾼다.

```tsx
{
  isManualRoute(s) ? (
    <span
      style={{
        marginLeft: 8,
        padding: "2px 6px",
        borderRadius: 4,
        background: "var(--ku-border)",
        color: "var(--ku-text-2)",
        fontSize: 11,
      }}
    >
      직접 입력
    </span>
  ) : (
    <span style={{ marginLeft: 8, color: "var(--ku-text-3)" }}>
      ({s.gpx_file})
    </span>
  );
}
```

행의 버튼 묶음에서 다운로드 버튼을 조건부로 바꾸고 수정 버튼을 추가한다.

```tsx
{
  isManualRoute(s) ? (
    <button
      onClick={() => router.push(`/admin/slopes/${s.id}`)}
      className="ku-admin-row-action"
      style={{
        fontSize: 13,
        color: "var(--ku-primary-text)",
        background: "none",
        border: "1px solid var(--ku-primary-text)",
        borderRadius: 6,
        padding: "6px 12px",
        cursor: "pointer",
      }}
    >
      수정
    </button>
  ) : (
    <button
      onClick={() => downloadGpx(s)}
      className="ku-admin-row-action"
      style={{
        fontSize: 13,
        color: "var(--ku-primary-text)",
        background: "none",
        border: "1px solid var(--ku-primary-text)",
        borderRadius: 6,
        padding: "6px 12px",
        cursor: "pointer",
      }}
    >
      다운로드
    </button>
  );
}
```

수기 경로에서 다운로드를 숨기는 이유는 `buildGpx()`가 고도를 그대로 문자열
보간해서 `<ele>null</ele>`이 찍힌 GPX가 나오기 때문이다.

- [x] **Step 6: 통과를 확인한다**

```
npx playwright test e2e/admin-buildings-slopes.spec.ts -g "수기 경로와 GPX 경로의 행 동작을 구분한다"
npx playwright test e2e/admin-buildings-slopes.spec.ts -g "GPX 업로드를 닫고 종료 안내를 보여준다"
npm run typecheck
npm run lint
```

기대: PASS. lint가 미사용 변수를 잡으면 Step 4에서 남긴 상태·함수를 지운다.

- [x] **Step 7: 깨진 기존 GPX 테스트를 정리한다**

업로드 UI가 사라졌으므로 아래 두 테스트가 실패한다. 지운다.

- `"잘못된 GPX를 오류 메시지와 함께 거부한다"`
- `"정상 GPX를 등록·다운로드·삭제한다"` 중 등록 부분

`"정상 GPX를 등록·다운로드·삭제한다"`는 픽스처의 GPX 행(`정문-중앙광장`)으로
다운로드·삭제만 확인하도록 다시 쓴다.

```ts
test("GPX 경로를 다운로드하고 삭제한다", async ({ page }) => {
  await installMockBackend(page, { authenticated: true });
  await page.goto("/admin/dashboard/slopes");

  const row = page.getByText("정문-중앙광장").locator("xpath=../..");
  const downloadPromise = page.waitForEvent("download");
  await row.getByRole("button", { name: "다운로드" }).click();
  expect((await downloadPromise).suggestedFilename()).toBe("정문-중앙광장.gpx");

  await row.getByRole("button", { name: "삭제" }).click();
  await page.getByRole("button", { name: "경로 삭제" }).click();
  await expect(page.getByText("정문-중앙광장")).toHaveCount(0);
});
```

- [x] **Step 8: 파일 전체를 돌린다**

```
npx playwright test e2e/admin-buildings-slopes.spec.ts
npm test
```

기대: 전부 PASS.

- [x] **Step 9: 커밋**

```bash
git add src/app/admin/dashboard/slopes/page.tsx e2e/support/mockBackend.ts e2e/admin-buildings-slopes.spec.ts
git commit -F - <<'EOF'
feat(slope): GPX 업로드를 닫고 목록에서 수기 경로를 구분한다

업로드를 열어두면 폐기 대상이 계속 늘어난다. 3장에서 이 파이프라인을
못 믿겠다고 결론 낸 이상 새 GPX를 더 받을 이유가 없다.

수기 경로는 직접 입력 배지와 수정 버튼을 달고 다운로드를 숨긴다.
buildGpx가 고도를 그대로 보간해서 ele가 null로 찍힌 GPX가 나온다.

2026-08-30
EOF
```

---

## Task 7: 수기 경로 수정

**파일**

- 생성: `src/app/admin/slopes/[id]/page.tsx`
- 테스트: `e2e/admin-buildings-slopes.spec.ts`

**인터페이스**

- 사용: `SlopeRouteEditor`, `readStoredVertices`, `readStoredSlopes`,
  `isManualRoute` (`@/lib/slopeRoute`), `SlopeSegment` (`@/types/domain`)
- 제공: 없음

- [x] **Step 1: 실패하는 e2e를 쓴다**

```ts
test("수기 경로를 열어 값을 고쳐 저장한다", async ({ page }) => {
  const state = await installMockBackend(page, { authenticated: true });
  await page.goto("/admin/dashboard/slopes");

  const row = page.getByText("안암병원 정문 경사로").locator("xpath=../..");
  await row.getByRole("button", { name: "수정" }).click();
  await expect(page).toHaveURL(/\/admin\/slopes\/2$/);

  await expect(page.getByLabel("경로 이름")).toHaveValue(
    "안암병원 정문 경사로",
  );
  await expect(page.getByLabel("구간 1 경사도")).toHaveValue("7.2");

  await page.getByLabel("구간 1 경사도").fill("9.4");
  await page.getByRole("button", { name: "경로 저장" }).click();
  await expect(page).toHaveURL(/\/admin\/dashboard\/slopes$/);

  const saved = state.slopes.find((row) => row.id === 2);
  const segments = saved!.segments as Array<Record<string, unknown>>;
  expect(segments[1].slope).toBe(9.4);
});

test("GPX 경로 id로 수정 화면에 가면 목록으로 돌려보낸다", async ({ page }) => {
  await installMockBackend(page, { authenticated: true });
  await page.goto("/admin/slopes/1");
  await expect(page).toHaveURL(/\/admin\/dashboard\/slopes$/);
});

test("비로그인 상태로 수정 화면에 가면 로그인 화면으로 보낸다", async ({
  page,
}) => {
  await installMockBackend(page, { authenticated: false });
  await page.goto("/admin/slopes/2");
  await expect(page).toHaveURL(/\/admin$/);
});
```

- [x] **Step 2: 실패를 확인한다**

```
npx playwright test e2e/admin-buildings-slopes.spec.ts -g "수기 경로를 열어 값을 고쳐 저장한다"
```

기대: FAIL. `/admin/slopes/2`가 404다.

- [x] **Step 3: 수정 페이지를 만든다**

`src/app/admin/slopes/[id]/page.tsx`

`useParams`는 클라이언트 컴포넌트에서 라우트 파라미터를 읽는 훅이다.
`src/app/admin/buildings/[id]/page.tsx`가 같은 방식을 쓴다.

```tsx
"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import SlopeRouteEditor from "@/components/SlopeRouteEditor";
import Toast from "@/components/Toast";
import {
  isManualRoute,
  readStoredSlopes,
  readStoredVertices,
  type Vertex,
} from "@/lib/slopeRoute";
import type { SlopePoint, SlopeSegment } from "@/types/domain";
import type { Json } from "@supabase-types";
import "../../admin-ui.css";

export default function EditSlopeRoutePage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [vertices, setVertices] = useState<Vertex[]>([]);
  const [slopes, setSlopes] = useState<number[]>([]);
  const [toast, setToast] = useState<{ message: string; type: string } | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
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

      // GPX 행을 편집 가능하게 만들면 측정 원본이 훼손된다.
      if (error || !data || !isManualRoute(data as unknown as SlopeSegment)) {
        router.push("/admin/dashboard/slopes");
        return;
      }

      const route = data as unknown as SlopeSegment;
      setName(route.name);
      setVertices(readStoredVertices(route.segments));
      setSlopes(readStoredSlopes(route.segments));
      setLoading(false);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [params.id, router]);

  async function handleSave(nextName: string, segments: SlopePoint[]) {
    setSaving(true);
    const { error } = await supabase
      .from("slope_segments")
      .update({
        name: nextName,
        segments: segments as unknown as Json,
        updated_at: new Date().toISOString(),
      })
      .eq("id", params.id);
    setSaving(false);
    if (error) {
      setToast({ message: "저장 실패: " + error.message, type: "error" });
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

- [x] **Step 4: 통과를 확인한다**

```
npx playwright test e2e/admin-buildings-slopes.spec.ts -g "수기 경로를 열어 값을 고쳐 저장한다"
npx playwright test e2e/admin-buildings-slopes.spec.ts -g "GPX 경로 id로 수정 화면에 가면 목록으로 돌려보낸다"
npx playwright test e2e/admin-buildings-slopes.spec.ts -g "비로그인 상태로 수정 화면에 가면 로그인 화면으로 보낸다"
npm run typecheck
```

기대: 셋 다 PASS.

- [x] **Step 5: 커밋**

```bash
git add "src/app/admin/slopes/[id]/page.tsx" e2e/admin-buildings-slopes.spec.ts
git commit -F - <<'EOF'
feat(slope): 수기 경로를 수정한다

오타 하나 고치려고 경로를 다시 그리는 건 못 쓸 UX다. GPX 행은 열지
않고 목록으로 돌려보낸다. 편집 가능하게 만들면 측정 원본이 훼손된다.

2026-08-30
EOF
```

---

## Task 8: 미저장 이탈 경고와 저장 실패 보존

**파일**

- 수정: `src/components/SlopeRouteEditor.tsx`
- 테스트: `e2e/admin-buildings-slopes.spec.ts`

**인터페이스**

- 사용: 없음
- 제공: 없음

- [x] **Step 1: 실패하는 e2e를 쓴다**

```ts
test("저장이 실패해도 그린 경로와 입력값이 남는다", async ({ page }) => {
  await installMockBackend(page, { authenticated: true });
  // 목 뒤에 얹으면 LIFO로 먼저 걸린다. slope_segments POST만 500으로 돌린다.
  await page.route("**/rest/v1/slope_segments*", async (route) => {
    if (route.request().method() === "POST") {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ message: "서버 오류" }),
      });
      return;
    }
    await route.fallback();
  });

  await page.goto("/admin/slopes/new");
  const map = page.locator(".leaflet-container");
  await page.locator(".leaflet-pm-icon-polyline").locator("..").click();
  const points = [
    { x: 300, y: 120 },
    { x: 420, y: 180 },
  ];
  for (const position of points) await map.click({ position });
  await map.click({ position: points[1] });

  await page.getByLabel("경로 이름").fill("실패 시험");
  await page.getByLabel("구간 1 경사도").fill("7.2");
  await page.getByRole("button", { name: "경로 저장" }).click();

  await expect(page.getByText(/저장 실패/)).toBeVisible();
  await expect(page).toHaveURL(/\/admin\/slopes\/new$/);
  await expect(page.getByLabel("경로 이름")).toHaveValue("실패 시험");
  await expect(page.getByLabel("구간 1 경사도")).toHaveValue("7.2");
});

test("값을 입력한 채 벗어나려 하면 경고한다", async ({ page }) => {
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
  await page.getByLabel("경로 이름").fill("작성 중");

  // 편집기 하단의 취소 버튼. 모달이 뜨면 모달 안의 취소로 되돌아온다.
  await page.getByRole("button", { name: "취소" }).first().click();
  await expect(page.getByText("저장하지 않은 변경사항이 있어요")).toBeVisible();

  await page.getByRole("dialog").getByRole("button", { name: "취소" }).click();
  await expect(page.getByLabel("경로 이름")).toHaveValue("작성 중");
});
```

- [x] **Step 2: 실패를 확인한다**

```
npx playwright test e2e/admin-buildings-slopes.spec.ts -g "값을 입력한 채 벗어나려 하면 경고한다"
```

기대: FAIL. 경고 모달이 없다.

"저장이 실패해도..." 테스트는 이미 통과할 수 있다. Task 4에서 실패 시
상태를 유지하도록 만들었기 때문이다. 통과하면 그대로 두고 회귀 방지로 남긴다.

- [x] **Step 3: 이탈 경고를 붙인다**

`src/components/SlopeRouteEditor.tsx`에 import를 추가한다.

```ts
import ConfirmModal from "@/components/ConfirmModal";
```

상태를 하나 더 둔다.

```ts
const [confirmLeave, setConfirmLeave] = useState(false);
```

취소 버튼의 `onClick`을 바꾼다.

```tsx
onClick={() => {
  const dirty = name.trim() !== initialName || vertices.length > 0;
  if (dirty) {
    setConfirmLeave(true);
    return;
  }
  onCancel();
}}
```

컴포넌트 반환문 맨 끝, 오류 목록 뒤에 모달을 추가한다.

```tsx
{
  confirmLeave && (
    <ConfirmModal
      message="저장하지 않은 변경사항이 있어요"
      description="지금 나가면 그린 경로와 입력한 경사도가 사라집니다."
      confirmLabel="나가기"
      onConfirm={onCancel}
      onCancel={() => setConfirmLeave(false)}
    />
  );
}
```

`ConfirmModal`의 취소 라벨은 "취소"로 고정돼 있어 바꿀 수 없다. 편집기 하단에도
같은 라벨의 버튼이 있으므로 테스트는 `getByRole("dialog")`로 모달 안을 좁혀
구분한다.

- [x] **Step 4: 통과를 확인한다**

```
npx playwright test e2e/admin-buildings-slopes.spec.ts -g "값을 입력한 채 벗어나려 하면 경고한다"
npx playwright test e2e/admin-buildings-slopes.spec.ts -g "저장이 실패해도 그린 경로와 입력값이 남는다"
```

기대: 둘 다 PASS.

- [x] **Step 5: 커밋**

```bash
git add src/components/SlopeRouteEditor.tsx e2e/admin-buildings-slopes.spec.ts
git commit -F - <<'EOF'
feat(slope): 미저장 이탈을 경고하고 저장 실패 시 상태를 지킨다

건물 상세 화면과 같은 문구를 쓴다. 저장 실패 시 폼을 비우면 현장에서
다시 재야 하므로 그린 경로와 입력값을 그대로 둔다.

2026-08-30
EOF
```

---

## Task 9: 공개 지도 렌더링 확인

이 설계 전체가 "저장 포맷을 `SlopeLayer`가 그대로 읽는다"에 걸려 있다.
끝단에서 한 번 확인한다.

**파일**

- 테스트: `e2e/public-map-p1.spec.ts` 또는 `e2e/admin-buildings-slopes.spec.ts`

- [x] **Step 1: 실패할 수 있는 e2e를 쓴다**

`e2e/admin-buildings-slopes.spec.ts`에 추가한다.

```ts
test("저장한 수기 경로가 공개 지도 경사도 오버레이에 그려진다", async ({
  page,
}) => {
  await installMockBackend(page, { authenticated: true });
  await page.goto("/");

  // 경사도 오버레이는 기본값이 꺼짐이다.
  await page.getByRole("checkbox", { name: "경사도" }).check();

  // 픽스처의 수기 경로(구간 1개, 7.2%)가 그려진다.
  // slopeColor(7.2)는 8.33 이하라 #C96C24다.
  await expect(page.locator('path[stroke="#C96C24"]').first()).toBeVisible();
});
```

`slopeColor(7.2)`는 `src/lib/theme.ts` 기준 5% 초과 8.33% 이하이므로
`#C96C24`다.

- [x] **Step 2: 돌려본다**

```
npx playwright test e2e/admin-buildings-slopes.spec.ts -g "저장한 수기 경로가 공개 지도 경사도 오버레이에 그려진다"
```

기대: PASS. `SlopeLayer`의 구버전 감지 분기가 이미 이 포맷을 읽으므로
코드 변경 없이 통과해야 한다.

FAIL이면 설계의 핵심 가정이 깨진 것이다. `SlopeLayer.tsx`의
`raw[1]?.slope !== undefined` 분기와 저장된 실제 payload를 대조한다.

토글 셀렉터는 `FilterPanel.tsx`의 `<label class="ku-filter-check">`가 체크박스를
감싸고 `<span>{t("slopeToggle")}</span>`을 넣는 구조에서 온다. 한국어
`slopeToggle`은 "경사도"다.

- [x] **Step 3: 전체 검증**

```
npm test
npm run typecheck
npm run lint
npx playwright test
npx prettier --check --end-of-line auto $(git diff --name-only main...HEAD)
```

기대: 전부 통과.

- [x] **Step 4: 커밋**

```bash
git add e2e/admin-buildings-slopes.spec.ts
git commit -F - <<'EOF'
test(slope): 수기 경로가 공개 지도에 그려지는지 확인한다

이 설계 전체가 저장 포맷을 SlopeLayer가 그대로 읽는다는 가정에 걸려
있다. 끝단에서 한 번 고정한다.

2026-08-30
EOF
```

---

## 완료 후 할 일 (이번 계획 범위 밖)

설계 문서 7절의 2단계 폐기는 **실측 데이터 재구축이 끝난 뒤** 별도 작업이다.
이번 계획에 넣지 않는다.

- `gpx_file IS NOT NULL`인 행을 GPX로 내려받아 보관
- 같은 조건으로 삭제하고 잔존 0건 확인
- `SlopePoint`에서 `ele` 제거, `SlopeLayer`의 `processRawPoints`·`medianFilter`·
  이중 포맷 감지 제거, 목록의 `buildGpx`·`downloadGpx`·`gpx_file` 분기 제거
