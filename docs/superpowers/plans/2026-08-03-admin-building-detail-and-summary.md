# 관리자 건물 화면 정리 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 건물 편집 페이지(폴리곤 프리뷰·내비 제거·삭제 버튼)와 건물 관리 목록(요약 카드 실패 처리·모바일 정렬·경고 카드 클릭 필터)을 한 번에 정리하고, 카드 숫자와 목록 필터가 같은 SQL 정의를 보게 만든다.

**Architecture:** 주변 건물 조회·회색 스타일·폴리곤 중심 계산을 `src/lib`의 공유 모듈로 뺀 뒤, 읽기 전용 `BuildingPolygonPreview`가 편집기와 같은 뷰포트·같은 그림을 그린다. 조회 결과는 모듈 수준 Promise 캐시에 담고 무효화 책임을 호출부에 둔다. 목록 쪽은 `admin_building_flags` 뷰를 새로 만들어 요약 함수와 목록 필터가 **한 벌의 조건식**을 공유하게 하고, 실패는 부분 표시 없이 영역 전체를 실패 상태로 전환한다.

**Tech Stack:** Next.js 16.2.4 (App Router, React Compiler), React 19.2.4, TypeScript 5.9, Leaflet 1.9 + @geoman-io, Supabase (PostgREST + RPC), vitest 3.2 (순수 함수 단위 테스트), Playwright 1.61 (E2E), GitHub Actions CI.

## Global Constraints

- **Next.js 16은 학습 데이터와 다르다.** 코드를 쓰기 전에 `node_modules/next/dist/docs/` 의 해당 가이드를 읽는다 (`AGENTS.md`).
- 단위 테스트 러너는 **vitest**(`npm run test`). jsdom·@testing-library가 없으므로 **단위 테스트는 순수 함수/모듈만** 다룬다. 컴포넌트 동작은 Playwright E2E 또는 수동 검증으로 확인한다.
- Prettier가 CI 게이트다(`npm run format:check`). 커밋 전 `npx prettier --write <바꾼 파일>`.
- ESLint(`npm run lint`)와 타입체크(`npm run typecheck`)도 CI 게이트다.
- UI 문구는 **한국어**, 기존 화면의 어투(`~했어요`, `~없어요`)를 따른다.
- 커밋 메시지에 `Co-Authored-By:` 라인을 넣지 않는다.
- 마이그레이션 파일명은 `^[0-9]{14}_[a-z0-9_]+\.sql$` 를 만족해야 한다(`scripts/check-migrations.sh`). 기존 마이그레이션 파일은 **수정·삭제·이름변경 금지** — 새 파일만 추가한다.
- 스펙 원문: `docs/superpowers/specs/2026-08-03-admin-building-detail-and-summary-design.md`

---

## 파일 구조

**신규**

| 파일                                                                 | 책임                                                   |
| -------------------------------------------------------------------- | ------------------------------------------------------ |
| `src/lib/neighborBuildings.ts`                                       | 주변 건물 조회 + 모듈 캐시 + 무효화 + 회색 스타일 상수 |
| `src/lib/neighborBuildings.test.ts`                                  | 위 모듈 단위 테스트                                    |
| `src/lib/polygonCenter.ts`                                           | 폴리곤 링 평균 중심점 (편집기·프리뷰 공용)             |
| `src/lib/polygonCenter.test.ts`                                      | 위 모듈 단위 테스트                                    |
| `src/components/BuildingPolygonPreview.tsx`                          | 읽기 전용 폴리곤 프리뷰 지도                           |
| `src/lib/adminBuildingSummary.ts`                                    | 요약 타입·카드 설정·요약 결과 판정·플래그 필터 판정    |
| `src/lib/adminBuildingSummary.test.ts`                               | 위 모듈 단위 테스트                                    |
| `supabase/migrations/20260803000000_create_admin_building_flags.sql` | `admin_building_flags` 뷰 + 요약 함수 재생성           |
| `scripts/build-supabase-db-url.sh`                                   | 마스킹된 DB URL 구성 (migrate·verify 두 잡이 공유)     |

**수정**

| 파일                                         | 변경                                                           |
| -------------------------------------------- | -------------------------------------------------------------- |
| `src/components/PolygonEditor.tsx`           | 주변 건물 조회·스타일·중심 계산을 공유 모듈로 위임             |
| `src/components/FacilityMap.tsx`             | 같음 (제외 없이 전부 받아 하나를 강조)                         |
| `src/app/admin/buildings/[id]/page.tsx`      | 프리뷰 연결·내비 제거·저장 칩 이동·캐시 무효화·카드 클래스     |
| `src/app/admin/buildings/new/page.tsx`       | 신규 등록 성공 시 캐시 무효화                                  |
| `src/app/admin/admin-ui.css`                 | 내비 규칙 제거·그리드 선택자 축소·클래스 배치·요약 카드 버튼화 |
| `src/app/admin/dashboard/buildings/page.tsx` | 요약 실패 처리·요약 마크업 전환·플래그 필터                    |
| `supabase/database.types.ts`                 | 뷰 Row 타입 + 함수 반환 컬럼 추가                              |
| `.github/workflows/ci.yml`                   | 이력 검증 스텝을 별도 잡으로 분리하고 jq 의존 제거             |
| `e2e/support/mockBackend.ts`                 | RPC mock에 `translation_needed_building_count` 추가            |
| `e2e/admin-buildings-slopes.spec.ts`         | 섹션 내비 단언 제거, 해시 URL 단언 수정                        |

**작업 순서:** Task 1–7(상세 페이지) → Task 8–9(DB·CI) → Task 10–12(목록 화면) → Task 13(수동 검증).
Task 12는 Task 8의 뷰와 생성 타입이 있어야 타입체크가 통과하므로 순서를 지킨다.

---

### Task 1: 주변 건물 조회 공유 모듈

**Files:**

- Create: `src/lib/neighborBuildings.ts`
- Test: `src/lib/neighborBuildings.test.ts`

**Interfaces:**

- Consumes: `supabase` (`@/lib/supabaseClient`)
- Produces:
  - `fetchNeighborBuildings(): Promise<Feature[]>` — 삭제되지 않은 전체 건물의 geojson feature 배열. 각 feature `properties`에 `bid: number`, `name: string`.
  - `invalidateNeighborBuildings(): void`
  - `NEIGHBOR_STYLE` — `{ color: "#9ca3af"; weight: 1; fillColor: "#9ca3af"; fillOpacity: 0.25 }`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`src/lib/neighborBuildings.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const not = vi.fn();
const eq = vi.fn(() => ({ not }));
const select = vi.fn(() => ({ eq }));
const from = vi.fn(() => ({ select }));

vi.mock("@/lib/supabaseClient", () => ({ supabase: { from } }));

const polygon = {
  type: "Feature",
  geometry: { type: "Polygon", coordinates: [[[127.03, 37.58]]] },
  properties: {},
};

describe("fetchNeighborBuildings", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    not.mockResolvedValue({
      data: [
        { id: 1, name: "중앙도서관", geojson: polygon },
        { id: 2, name: "폴리곤 없음", geojson: null },
        { id: 3, name: "geometry 없음", geojson: { type: "Feature" } },
      ],
      error: null,
    });
  });

  it("geometry가 있는 행만 남기고 properties에 bid와 name을 넣는다", async () => {
    const { fetchNeighborBuildings } = await import("./neighborBuildings");

    const features = await fetchNeighborBuildings();

    expect(features).toHaveLength(1);
    expect(features[0].properties).toMatchObject({
      bid: 1,
      name: "중앙도서관",
    });
    expect(from).toHaveBeenCalledWith("buildings");
    expect(select).toHaveBeenCalledWith("id, name, geojson");
    expect(eq).toHaveBeenCalledWith("is_deleted", false);
    expect(not).toHaveBeenCalledWith("geojson", "is", null);
  });

  it("두 번 호출해도 조회는 한 번만 나간다", async () => {
    const { fetchNeighborBuildings } = await import("./neighborBuildings");

    await fetchNeighborBuildings();
    await fetchNeighborBuildings();

    expect(from).toHaveBeenCalledTimes(1);
  });

  it("동시에 호출하면 진행 중인 Promise를 공유한다", async () => {
    const { fetchNeighborBuildings } = await import("./neighborBuildings");

    const [first, second] = await Promise.all([
      fetchNeighborBuildings(),
      fetchNeighborBuildings(),
    ]);

    expect(from).toHaveBeenCalledTimes(1);
    expect(first).toBe(second);
  });

  it("무효화하면 다음 호출이 다시 조회한다", async () => {
    const { fetchNeighborBuildings, invalidateNeighborBuildings } =
      await import("./neighborBuildings");

    await fetchNeighborBuildings();
    invalidateNeighborBuildings();
    await fetchNeighborBuildings();

    expect(from).toHaveBeenCalledTimes(2);
  });

  it("조회에 실패하면 캐시를 비워 다음 호출이 재시도한다", async () => {
    not.mockResolvedValueOnce({ data: null, error: { message: "boom" } });
    const { fetchNeighborBuildings } = await import("./neighborBuildings");

    await expect(fetchNeighborBuildings()).rejects.toBeTruthy();
    await expect(fetchNeighborBuildings()).resolves.toHaveLength(1);
    expect(from).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run src/lib/neighborBuildings.test.ts`
Expected: FAIL — `Failed to load .../neighborBuildings` (모듈 없음)

- [ ] **Step 3: 모듈을 구현한다**

`src/lib/neighborBuildings.ts`:

```ts
import type { Feature } from "geojson";
import { supabase } from "@/lib/supabaseClient";

/**
 * 주변 건물(회색 배경 레이어) 조회를 한 곳에 모은 모듈.
 *
 * 캐시는 모듈 수준이라 같은 세션에서 조회가 한 번만 나간다. 캐시가 담는 것은
 * `select("id, name, geojson")` 결과이므로 **이름·존재 여부·폴리곤 중 하나라도
 * 바꾸는 경로는 성공 직후 `invalidateNeighborBuildings()`를 호출해야 한다.**
 * 무효화 책임은 호출부에 있다.
 *
 * 무효화가 필요한 경로: 소프트 삭제 · 복구 · 건물명 저장 · 폴리곤 저장 · 신규 등록.
 * 소속(college_id) 저장은 캐시에 담기지 않으므로 무효화하지 않는다.
 */

export const NEIGHBOR_STYLE = {
  color: "#9ca3af",
  weight: 1,
  fillColor: "#9ca3af",
  fillOpacity: 0.25,
};

let cache: Promise<Feature[]> | null = null;

export function invalidateNeighborBuildings() {
  cache = null;
}

export function fetchNeighborBuildings(): Promise<Feature[]> {
  if (cache) return cache;

  async function load(): Promise<Feature[]> {
    const { data, error } = await supabase
      .from("buildings")
      .select("id, name, geojson")
      .eq("is_deleted", false)
      .not("geojson", "is", null);
    if (error) throw error;
    return (data ?? [])
      .filter((row) => (row.geojson as unknown as Feature | null)?.geometry)
      .map((row) => {
        const feature = row.geojson as unknown as Feature;
        return {
          ...feature,
          properties: {
            ...(feature.properties ?? {}),
            bid: row.id,
            name: row.name,
          },
        };
      });
  }

  const pending: Promise<Feature[]> = load().catch((error: unknown) => {
    // 실패한 Promise를 남기면 세션 내내 주변 건물이 안 그려진다.
    if (cache === pending) cache = null;
    throw error;
  });
  cache = pending;
  return pending;
}
```

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run src/lib/neighborBuildings.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: 커밋**

```bash
npx prettier --write src/lib/neighborBuildings.ts src/lib/neighborBuildings.test.ts
git add src/lib/neighborBuildings.ts src/lib/neighborBuildings.test.ts
git commit -m "feat(map): 주변 건물 조회를 캐시되는 공유 모듈로 분리"
```

---

### Task 2: 폴리곤 중심 계산 공유

편집기와 프리뷰가 **같은 뷰포트**를 잡아야 편집 버튼을 누를 때 지도가 튀지 않는다. 편집기는 링 좌표의 **평균**을 쓰고, 상세 페이지의 `getBuildingCenter`는 **bbox 중심**을 쓴다 — 두 값이 다르므로 프리뷰는 편집기 쪽 계산을 써야 한다. 계산을 한 곳에 두어 갈라지지 않게 한다.

**Files:**

- Create: `src/lib/polygonCenter.ts`
- Test: `src/lib/polygonCenter.test.ts`

**Interfaces:**

- Produces:
  - `KU_CENTER: [number, number]` — `[37.5893, 127.0327]`
  - `getPolygonRingCenter(geojson: Feature<Polygon> | null): [number, number]`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`src/lib/polygonCenter.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { Feature, Polygon } from "geojson";
import { KU_CENTER, getPolygonRingCenter } from "./polygonCenter";

function polygon(ring: [number, number][]): Feature<Polygon> {
  return {
    type: "Feature",
    geometry: { type: "Polygon", coordinates: [ring] },
    properties: {},
  };
}

describe("getPolygonRingCenter", () => {
  it("링 좌표의 평균점을 [lat, lng] 순서로 돌려준다", () => {
    const center = getPolygonRingCenter(
      polygon([
        [127.0, 37.0],
        [127.2, 37.0],
        [127.2, 37.4],
        [127.0, 37.4],
      ]),
    );

    expect(center[0]).toBeCloseTo(37.2, 10);
    expect(center[1]).toBeCloseTo(127.1, 10);
  });

  it("bbox 중심이 아니라 평균을 쓴다", () => {
    // 아래 변에 점이 하나 더 있어 평균은 아래로 쏠린다. bbox 중심이면 37.5.
    const center = getPolygonRingCenter(
      polygon([
        [127.0, 37.0],
        [127.5, 37.0],
        [127.5, 38.0],
        [127.0, 38.0],
        [127.25, 37.0],
      ]),
    );

    expect(center[0]).toBeCloseTo(37.4, 10);
  });

  it("폴리곤이 없으면 캠퍼스 중심으로 폴백한다", () => {
    expect(getPolygonRingCenter(null)).toEqual(KU_CENTER);
  });

  it("링이 비어 있으면 캠퍼스 중심으로 폴백한다", () => {
    expect(getPolygonRingCenter(polygon([]))).toEqual(KU_CENTER);
  });

  it("Point geometry면 캠퍼스 중심으로 폴백한다", () => {
    const point = {
      type: "Feature",
      geometry: { type: "Point", coordinates: [127.03, 37.58] },
      properties: {},
    } as unknown as Feature<Polygon>;

    expect(getPolygonRingCenter(point)).toEqual(KU_CENTER);
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run src/lib/polygonCenter.test.ts`
Expected: FAIL — 모듈을 찾을 수 없음

- [ ] **Step 3: 모듈을 구현한다**

`src/lib/polygonCenter.ts`:

```ts
import type { Feature, Polygon } from "geojson";

export const KU_CENTER: [number, number] = [37.5893, 127.0327];

/**
 * 폴리곤 링 좌표의 평균점.
 *
 * bbox 중심이 아니라 **평균**이라는 점이 중요하다. `PolygonEditor`가 이 값으로
 * `setView(center, 18)`을 하므로, 프리뷰가 다른 계산을 쓰면 편집 버튼을 누르는
 * 순간 지도가 튄다. 두 화면이 이 함수 하나만 보게 한다.
 */
export function getPolygonRingCenter(
  geojson: Feature<Polygon> | null,
): [number, number] {
  const ring = geojson?.geometry?.coordinates?.[0];
  if (!Array.isArray(ring) || ring.length === 0) return KU_CENTER;
  const avgLat = ring.reduce((sum, coord) => sum + coord[1], 0) / ring.length;
  const avgLng = ring.reduce((sum, coord) => sum + coord[0], 0) / ring.length;
  return [avgLat, avgLng];
}
```

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run src/lib/polygonCenter.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: 커밋**

```bash
npx prettier --write src/lib/polygonCenter.ts src/lib/polygonCenter.test.ts
git add src/lib/polygonCenter.ts src/lib/polygonCenter.test.ts
git commit -m "feat(map): 폴리곤 중심 계산을 편집기·프리뷰 공용 모듈로 분리"
```

---

### Task 3: 기존 소비자 두 곳을 공유 모듈로 전환

**Files:**

- Modify: `src/components/PolygonEditor.tsx:46-139`
- Modify: `src/components/FacilityMap.tsx:63-91`, `src/components/FacilityMap.tsx:130-144`

**Interfaces:**

- Consumes: `fetchNeighborBuildings`, `NEIGHBOR_STYLE` (Task 1), `getPolygonRingCenter` (Task 2)
- Produces: 없음 (동작 동일)

**주의:** `FacilityMap`의 회색 `fillOpacity`가 `0.2` → `0.25`로 바뀐다. 세 소비자가 한 상수를 보게 하려는 의도된 통일이며 육안으로 구분되지 않는다. 파란색 강조 스타일(`fillOpacity: 0.15`)은 소비자 고유값이므로 그대로 둔다.

- [ ] **Step 1: `PolygonEditor`의 import를 바꾼다**

`src/components/PolygonEditor.tsx` 상단, `import { supabase } from "@/lib/supabaseClient";` 줄을 지우고 아래를 추가한다 (`ConfirmModal` import 위):

```ts
import {
  NEIGHBOR_STYLE,
  fetchNeighborBuildings,
} from "@/lib/neighborBuildings";
import { getPolygonRingCenter } from "@/lib/polygonCenter";
```

- [ ] **Step 2: 중심 계산을 공유 함수로 바꾼다**

`src/components/PolygonEditor.tsx` — 아래 블록을

```ts
let center: [number, number] = [37.5893, 127.0327];
const initialRing = initialGeojson?.geometry.coordinates[0];
if (initialRing?.length) {
  const coords = initialRing;
  const avgLat = coords.reduce((s, c) => s + c[1], 0) / coords.length;
  const avgLng = coords.reduce((s, c) => s + c[0], 0) / coords.length;
  center = [avgLat, avgLng];
}

const map = L.map(containerRef.current!, {
  scrollWheelZoom: true,
}).setView(center, 18);
```

이렇게 바꾼다:

```ts
const map = L.map(containerRef.current!, {
  scrollWheelZoom: true,
}).setView(getPolygonRingCenter(initialGeojson), 18);
```

지역 변수 `center`와 `initialRing`이 사라지므로 lint가 미사용 변수를 잡지 않는지 확인한다.

- [ ] **Step 3: 주변 건물 조회를 공유 모듈로 바꾼다**

`src/components/PolygonEditor.tsx` — 아래 블록을

```ts
// 기존 건물들을 회색 배경 레이어로 표시 (편집 대상 제외, 클릭 통과)
let cancelled = false;
supabase
  .from("buildings")
  .select("id, name, geojson")
  .eq("is_deleted", false)
  .not("geojson", "is", null)
  .then(({ data }) => {
    if (cancelled || !mapRef.current) return;
    const features = (data ?? [])
      .filter(
        (b) =>
          (b.geojson as unknown as Feature | null)?.geometry &&
          String(b.id) !== String(initialExcludeId ?? ""),
      )
      .map((b) => {
        const g = b.geojson as unknown as Feature;
        return {
          ...g,
          properties: { ...(g.properties ?? {}), name: b.name },
        };
      });
    L.geoJSON({ type: "FeatureCollection", features } as FeatureCollection, {
      style: {
        color: "#9ca3af",
        weight: 1,
        fillColor: "#9ca3af",
        fillOpacity: 0.25,
      },
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
    }).addTo(map);
  });
```

이렇게 바꾼다:

```ts
// 기존 건물들을 회색 배경 레이어로 표시 (편집 대상 제외, 클릭 통과)
let cancelled = false;
void fetchNeighborBuildings()
  .then((neighbors) => {
    if (cancelled || !mapRef.current) return;
    const features = neighbors.filter(
      (feature) =>
        String(feature.properties?.bid) !== String(initialExcludeId ?? ""),
    );
    L.geoJSON({ type: "FeatureCollection", features } as FeatureCollection, {
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
    }).addTo(map);
  })
  .catch(() => {
    // 주변 건물은 보조 정보다. 실패해도 편집 자체는 계속할 수 있다.
  });
```

- [ ] **Step 4: `FacilityMap`을 전환한다**

`src/components/FacilityMap.tsx` — `import { supabase } from "@/lib/supabaseClient";` 줄을 지우고 아래로 바꾼다:

```ts
import {
  NEIGHBOR_STYLE,
  fetchNeighborBuildings,
} from "@/lib/neighborBuildings";
```

그리고 조회 이펙트를

```ts
useEffect(() => {
  let cancelled = false;
  supabase
    .from("buildings")
    .select("id, name, geojson")
    .eq("is_deleted", false)
    .not("geojson", "is", null)
    .then(({ data }) => {
      if (cancelled) return;
      setBuildingFeatures(
        (data ?? [])
          .filter((b) => (b.geojson as unknown as Feature | null)?.geometry)
          .map((b) => {
            const g = b.geojson as unknown as Feature;
            return {
              ...g,
              properties: {
                ...(g.properties ?? {}),
                bid: b.id,
                name: b.name,
              },
            };
          }),
      );
    });
  return () => {
    cancelled = true;
  };
}, []);
```

이렇게 바꾼다:

```ts
useEffect(() => {
  let cancelled = false;
  void fetchNeighborBuildings()
    .then((features) => {
      if (!cancelled) setBuildingFeatures(features);
    })
    .catch(() => {
      // 배경 건물은 보조 정보다. 실패해도 시설 위치 선택은 계속할 수 있다.
    });
  return () => {
    cancelled = true;
  };
}, []);
```

- [ ] **Step 5: `FacilityMap`의 회색 스타일을 상수로 바꾼다**

`src/components/FacilityMap.tsx` — `style` prop의 else 갈래를

```tsx
                : {
                    color: "#9ca3af",
                    weight: 1,
                    fillColor: "#9ca3af",
                    fillOpacity: 0.2,
                  }
```

이렇게 바꾼다:

```tsx
                : NEIGHBOR_STYLE
```

- [ ] **Step 6: 검증**

Run: `npm run typecheck && npm run lint && npm run test`
Expected: 모두 통과. `FacilityMap.tsx`에서 `Feature` 타입 import가 더 이상 쓰이지 않으면 lint가 `no-unused-vars`로 잡는다 — `import type { Feature, FeatureCollection } from "geojson";`에서 필요 없는 이름을 지운다(`FeatureCollection`은 계속 쓰인다).

Run: `npx playwright test e2e/admin-buildings-slopes.spec.ts`
Expected: PASS (기존 7 tests)

- [ ] **Step 7: 커밋**

```bash
npx prettier --write src/components/PolygonEditor.tsx src/components/FacilityMap.tsx
git add src/components/PolygonEditor.tsx src/components/FacilityMap.tsx
git commit -m "refactor(map): 편집기와 시설 지도가 공유 주변 건물 모듈을 쓴다"
```

---

### Task 4: 폴리곤 프리뷰 컴포넌트와 상세 페이지 연결

**Files:**

- Create: `src/components/BuildingPolygonPreview.tsx`
- Modify: `src/app/admin/buildings/[id]/page.tsx:27-29`(dynamic import), `:574-660`(폴리곤 카드)

**Interfaces:**

- Consumes: `fetchNeighborBuildings`, `NEIGHBOR_STYLE`, `getPolygonRingCenter`, `getCartoTileUrl`, `CARTO_ATTRIBUTION`, `usePrefersDarkMode`
- Produces: `BuildingPolygonPreview` (default export), props `{ geojson: Feature<Polygon>; buildingId: number }`
  - **계약: 이 컴포넌트는 초기 폴리곤을 한 번만 읽는다. 호출부가 `key`로 재마운트를 강제해야 한다.**

- [ ] **Step 1: 프리뷰 컴포넌트를 만든다**

`src/components/BuildingPolygonPreview.tsx`:

```tsx
"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import type { Feature, FeatureCollection, Polygon } from "geojson";
import "leaflet/dist/leaflet.css";
import { CARTO_ATTRIBUTION, getCartoTileUrl } from "@/lib/mapTiles";
import { usePrefersDarkMode } from "@/lib/usePrefersDarkMode";
import {
  NEIGHBOR_STYLE,
  fetchNeighborBuildings,
} from "@/lib/neighborBuildings";
import { getPolygonRingCenter } from "@/lib/polygonCenter";

interface BuildingPolygonPreviewProps {
  geojson: Feature<Polygon>;
  buildingId: number;
}

/**
 * 읽기 전용 폴리곤 프리뷰.
 *
 * 뷰포트·타일·주변 건물 그림을 `PolygonEditor`와 맞춘다. 편집 버튼을 눌렀을 때
 * 화면이 튀지 않게 하려는 것이므로, 한쪽만 바꾸지 않는다.
 *
 * 초기 폴리곤을 **한 번만** 읽는다. 폴리곤을 저장해도 지도가 그대로인 버그를
 * 막으려면 호출부가 `key`로 재마운트를 강제해야 한다.
 */
export default function BuildingPolygonPreview({
  geojson,
  buildingId,
}: BuildingPolygonPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const initialGeojsonRef = useRef(geojson);
  const buildingIdRef = useRef(buildingId);
  const prefersDarkMode = usePrefersDarkMode();

  useEffect(() => {
    if (mapRef.current) return;
    const initialGeojson = initialGeojsonRef.current;
    const excludeId = buildingIdRef.current;

    // 지도 옵션과 레이어 옵션을 함께 끈다. 지도 옵션만 끄면 폴리곤이 마우스
    // 이벤트를 잡아 커서가 바뀐다.
    const map = L.map(containerRef.current!, {
      dragging: false,
      scrollWheelZoom: false,
      doubleClickZoom: false,
      touchZoom: false,
      boxZoom: false,
      keyboard: false,
      zoomControl: false,
    }).setView(getPolygonRingCenter(initialGeojson), 18);
    mapRef.current = map;

    tileLayerRef.current = L.tileLayer(getCartoTileUrl(false), {
      attribution: CARTO_ATTRIBUTION,
      subdomains: "abcd",
    }).addTo(map);

    let cancelled = false;
    void fetchNeighborBuildings()
      .then((neighbors) => {
        if (cancelled || !mapRef.current) return;
        const features = neighbors.filter(
          (feature) => String(feature.properties?.bid) !== String(excludeId),
        );
        L.geoJSON(
          { type: "FeatureCollection", features } as FeatureCollection,
          {
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
      })
      .catch(() => {
        // 주변 건물은 보조 정보다. 실패해도 이 건물 폴리곤은 그린다.
      });

    // Point geojson(지하철역 3건)은 폴리곤이 아니므로 그리지 않는다.
    // Point 처리 정책은 별도 과제로 남아 있다.
    if (initialGeojson.geometry?.type === "Polygon") {
      L.geoJSON(initialGeojson, {
        style: { color: "#2563EB", weight: 2, fillOpacity: 0.3 },
        interactive: false,
      }).addTo(map);
    }

    return () => {
      cancelled = true;
      map.remove();
      mapRef.current = null;
      tileLayerRef.current = null;
    };
  }, []);

  useEffect(() => {
    tileLayerRef.current?.setUrl(getCartoTileUrl(prefersDarkMode));
  }, [prefersDarkMode]);

  return (
    <div
      ref={containerRef}
      role="img"
      aria-label="건물 폴리곤 미리보기"
      style={{
        width: "100%",
        height: 260,
        borderRadius: 8,
        overflow: "hidden",
        border: "1px solid var(--ku-border)",
      }}
    />
  );
}
```

- [ ] **Step 2: 상세 페이지에 dynamic import를 추가한다**

`src/app/admin/buildings/[id]/page.tsx` — 기존 `PolygonEditor` dynamic 아래에 추가:

```ts
const PolygonEditor = dynamic(() => import("@/components/PolygonEditor"), {
  ssr: false,
});

const BuildingPolygonPreview = dynamic(
  () => import("@/components/BuildingPolygonPreview"),
  { ssr: false },
);
```

- [ ] **Step 3: 폴리곤 카드에 프리뷰를 렌더한다**

`src/app/admin/buildings/[id]/page.tsx` — 폴리곤 카드에서 `{editingPolygon && (<PolygonEditor ... />)}` **바로 앞**에 아래를 넣는다:

```tsx
{
  !editingPolygon && building.geojson && (
    <div style={{ marginTop: 16 }}>
      <BuildingPolygonPreview
        key={JSON.stringify(building.geojson)}
        geojson={building.geojson as unknown as Feature<Polygon>}
        buildingId={id}
      />
    </div>
  );
}
```

`key`가 계약이다. `fetchData()`는 시설 토글 같은 무관한 갱신에서도 새 `building` 객체를 만들지만, `key`가 **내용 기반**이라 폴리곤이 실제로 바뀔 때만 재마운트된다.

`❌ 폴리곤 없음 — 편집으로 추가` 문구와 `✅ 폴리곤 데이터 있음` 문구는 그대로 둔다(스펙: geojson이 없으면 지도 없이 기존 문구 유지).

- [ ] **Step 4: 검증**

Run: `npm run typecheck && npm run lint`
Expected: 통과

Run: `npx playwright test e2e/admin-buildings-slopes.spec.ts`
Expected: PASS. 상세 페이지 테스트에서 프리뷰 지도가 추가로 뜨지만 mock이 타일 요청을 abort하므로 단언에 영향이 없다. 실패하면 `.leaflet-container` 로케이터가 두 개가 되지 않았는지 확인한다(편집 중이 아니면 하나만 떠야 한다).

- [ ] **Step 5: 커밋**

```bash
npx prettier --write src/components/BuildingPolygonPreview.tsx "src/app/admin/buildings/[id]/page.tsx"
git add src/components/BuildingPolygonPreview.tsx "src/app/admin/buildings/[id]/page.tsx"
git commit -m "feat(admin): 건물 상세에서 폴리곤을 편집 전에 미리 본다"
```

---

### Task 5: 캐시 무효화 다섯 경로 연결

캐시는 `id, name, geojson`과 `is_deleted` 조건을 담는다. 이 넷 중 하나라도 바꾸는 경로가 무효화하지 않으면 **툴팁에 옛 이름이 남거나 삭제한 건물이 계속 그려진다.**

**Files:**

- Modify: `src/app/admin/buildings/[id]/page.tsx` — `handleDeleteBuilding`, `handleRestoreBuilding`, `handleSaveName`, 폴리곤 `onSave`
- Modify: `src/app/admin/buildings/new/page.tsx` — `handleSave`

**Interfaces:**

- Consumes: `invalidateNeighborBuildings` (Task 1)

- [ ] **Step 1: 상세 페이지에 import를 추가한다**

`src/app/admin/buildings/[id]/page.tsx`:

```ts
import { invalidateNeighborBuildings } from "@/lib/neighborBuildings";
```

- [ ] **Step 2: 네 개의 핸들러에 무효화를 넣는다**

`handleDeleteBuilding` — `router.push` **앞**:

```ts
if (error) {
  showToast("삭제에 실패했어요", "error");
  return;
}
invalidateNeighborBuildings();
router.push("/admin/dashboard");
```

`handleRestoreBuilding` — `showToast` **앞**:

```ts
if (error) {
  showToast("복구에 실패했어요", "error");
  return;
}
invalidateNeighborBuildings();
showToast("건물이 복구되었어요!");
fetchData();
```

`handleSaveName` — `await fetchData()` **앞**:

```ts
if (error) {
  showToast("저장에 실패했어요", "error");
  return;
}
invalidateNeighborBuildings();
await fetchData();
showToast("건물명이 저장되었어요!");
```

폴리곤 `onSave` — `setEditingPolygon(false)` **앞**:

```ts
if (error) {
  showToast("저장에 실패했어요", "error");
  return;
}
invalidateNeighborBuildings();
setEditingPolygon(false);
await fetchData();
showToast("폴리곤이 저장되었어요!");
```

**`handleSaveCollege`에는 넣지 않는다.** `college_id`는 캐시에 담기지 않는다.

- [ ] **Step 3: 신규 등록 페이지에 넣는다**

`src/app/admin/buildings/new/page.tsx` — import 추가:

```ts
import { invalidateNeighborBuildings } from "@/lib/neighborBuildings";
```

`handleSave` — 성공 분기:

```ts
if (error) {
  showToast("저장에 실패했어요: " + error.message, "error");
  return;
}

invalidateNeighborBuildings();
showToast("건물이 추가되었어요!");
setTimeout(() => router.push(`/admin/buildings/${newId}`), 800);
```

- [ ] **Step 4: 다섯 곳이 모두 걸렸는지 확인한다**

Run: `npx rg -n "invalidateNeighborBuildings\(\)" src/app`
Expected: 정확히 5줄 (`[id]/page.tsx` 4줄 + `new/page.tsx` 1줄). `handleSaveCollege` 안에는 없어야 한다.

Run: `npm run typecheck && npm run lint`
Expected: 통과

- [ ] **Step 5: 커밋**

```bash
npx prettier --write "src/app/admin/buildings/[id]/page.tsx" src/app/admin/buildings/new/page.tsx
git add "src/app/admin/buildings/[id]/page.tsx" src/app/admin/buildings/new/page.tsx
git commit -m "fix(admin): 건물 변이 다섯 경로에서 주변 건물 캐시를 무효화"
```

---

### Task 6: 섹션 내비 제거와 저장 상태 칩 이동

**Files:**

- Modify: `src/app/admin/buildings/[id]/page.tsx:33-40`(상수), `:83-85`(상태), `:148-167`(옵저버), `:329-376`(헤더·내비)
- Modify: `src/app/admin/admin-ui.css:552-594`, `:625-628`, `:906-932`
- Modify: `e2e/admin-buildings-slopes.spec.ts:242-248`, `:262`

**Interfaces:**

- Produces: 없음. `저장하지 않은 변경 N개` 칩의 `role="status"`와 `aria-label`은 그대로 유지된다(E2E 회귀 방어선).

**카드의 `id` 속성은 남긴다.** 앵커 대상으로는 쓸 데가 없지만 E2E가 `#building-name`·`#building-photos`를 섹션 스코프 로케이터로 쓴다.

- [ ] **Step 1: E2E에서 내비 단언을 먼저 지운다 (RED 대신 계약 갱신)**

`e2e/admin-buildings-slopes.spec.ts` — 아래 블록을 삭제한다:

```ts
const sectionNav = page.getByRole("navigation", {
  name: "건물 상세 섹션",
});
await expect(sectionNav).toBeVisible();
await expect(sectionNav.getByRole("link")).toHaveCount(6);
await sectionNav.getByRole("link", { name: "시설", exact: true }).click();
await expect(page).toHaveURL(/#building-facilities$/);
```

그리고 이탈 경고 모달 취소 후 URL 단언을

```ts
await expect(page).toHaveURL(/admin\/buildings\/1#building-facilities$/);
```

이렇게 바꾼다:

```ts
await expect(page).toHaveURL(/admin\/buildings\/1$/);
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx playwright test e2e/admin-buildings-slopes.spec.ts -g "건물명 수정과 소프트 삭제"`
Expected: PASS (내비가 아직 있어도 단언을 안 하므로 통과). 이 단계는 뒤 단계의 안전망이다 — 통과를 확인만 하고 넘어간다.

- [ ] **Step 3: 페이지에서 내비를 걷어낸다**

`src/app/admin/buildings/[id]/page.tsx`:

1. `DETAIL_SECTIONS` 상수 블록(33–40행)을 삭제한다.
2. `activeSection` 상태 선언을 삭제한다:

```ts
const [activeSection, setActiveSection] = useState<string>(
  DETAIL_SECTIONS[0].id,
);
```

3. `IntersectionObserver` 이펙트 전체(148–167행)를 삭제한다.
4. `<nav className="ku-admin-detail-section-nav"> … </nav>` 블록 전체(345–376행)를 삭제한다.

- [ ] **Step 4: 저장 상태 칩을 헤더로 옮긴다**

`src/app/admin/buildings/[id]/page.tsx` — 헤더의 `지도 보기` 버튼을 감싸 아래로 바꾼다:

```tsx
<div style={{ display: "flex", alignItems: "center", gap: 10 }}>
  <div
    className="ku-admin-detail-save-status"
    data-unsaved={hasUnsavedChanges}
    role="status"
    aria-label={
      hasUnsavedChanges
        ? `저장하지 않은 변경 ${unsavedChangeCount}개`
        : "모든 변경 저장됨"
    }
  >
    {hasUnsavedChanges
      ? `저장하지 않은 변경 ${unsavedChangeCount}개`
      : "모든 변경 저장됨"}
  </div>
  <button
    onClick={() => navigateWithUnsavedCheck("/")}
    style={{
      fontSize: 13,
      color: "var(--ku-text-2)",
      background: "none",
      border: "1px solid var(--ku-border)",
      borderRadius: 6,
      padding: "6px 12px",
      cursor: "pointer",
    }}
  >
    지도 보기
  </button>
</div>
```

- [ ] **Step 5: CSS에서 내비 규칙을 지운다**

`src/app/admin/admin-ui.css` — 552–594행의 아래 규칙 **전부** 삭제:

```css
.ku-admin-detail-section-nav { … }
.ku-admin-detail-section-nav-inner { … }
.ku-admin-detail-section-links { … }
.ku-admin-detail-section-links::-webkit-scrollbar { … }
.ku-admin-detail-section-links a { … }
.ku-admin-detail-section-links a[aria-current="location"] { … }
```

625–628행의 `scroll-margin-top` 규칙 삭제:

```css
.ku-admin-detail-card,
.ku-admin-detail-danger {
  scroll-margin-top: 132px;
}
```

모바일 블록(906–932행)에서 아래를 삭제:

```css
.ku-admin-detail-section-nav {
  top: 58px;
}
.ku-admin-detail-section-nav-inner {
  display: block;
  padding: 0;
}
.ku-admin-detail-section-links {
  min-height: 44px;
  padding: 0 8px;
}
.ku-admin-detail-section-links a {
  padding: 0 10px;
}
.ku-admin-detail-save-status {
  position: absolute;
  top: calc(100% + 8px);
  right: 14px;
  box-shadow: var(--ku-shadow-soft);
}
.ku-admin-detail-card,
.ku-admin-detail-danger {
  scroll-margin-top: 112px;
}
```

**남기는 것:** 모바일의

```css
.ku-admin-detail-save-status:not([data-unsaved="true"]) {
  display: none;
}
```

는 그대로 둔다. 좁은 헤더에서 `모든 변경 저장됨`을 숨겨 공간을 아끼는 규칙이고, 붙을 대상(칩)이 헤더에 남아 있다.

- [ ] **Step 6: 남은 참조가 없는지 확인한다**

Run: `npx rg -n "section-nav|section-links|DETAIL_SECTIONS|activeSection|scroll-margin-top" src e2e`
Expected: 결과 없음

Run: `npm run typecheck && npm run lint && npx playwright test e2e/admin-buildings-slopes.spec.ts`
Expected: 모두 통과. `저장하지 않은 변경 1개` / `저장 안 됨` 단언이 여전히 초록불이어야 한다.

- [ ] **Step 7: 커밋**

```bash
npx prettier --write "src/app/admin/buildings/[id]/page.tsx" src/app/admin/admin-ui.css e2e/admin-buildings-slopes.spec.ts
git add "src/app/admin/buildings/[id]/page.tsx" src/app/admin/admin-ui.css e2e/admin-buildings-slopes.spec.ts
git commit -m "refactor(admin): 동작하지 않는 섹션 내비 제거, 저장 칩을 헤더로 이동"
```

---

### Task 7: 삭제 버튼 위치·모양

두 가지가 겹쳐 있다. `.ku-admin-detail-grid > div`가 그리드 직계 자식 **전부**에 카드 배경을 강제해 danger 래퍼가 카드처럼 보이고, 배치 규칙이 `nth-child(1)~(5)`뿐이라 6번째 자식은 자동 배치로 왼쪽 열 아래에 떨어진다.

**DOM 순서를 레이아웃 API로 쓴 것이 원인**이므로 선택자 범위만 좁히지 않고 **클래스 기반 배치로 바꾼다.**

**Files:**

- Modify: `src/app/admin/admin-ui.css:629-655`
- Modify: `src/app/admin/buildings/[id]/page.tsx` — 카드 5개 `className`, danger 버튼 2개 치수

- [ ] **Step 1: CSS 선택자를 좁히고 배치를 클래스로 바꾼다**

`src/app/admin/admin-ui.css` — 629–655행 전체를 아래로 교체한다:

```css
.ku-admin-detail-grid > .ku-admin-detail-card {
  margin: 0 !important;
  color: var(--ku-text-1);
  border-color: var(--ku-border) !important;
  border-radius: 12px !important;
  background: var(--ku-surface) !important;
}
/* DOM 순서가 아니라 카드의 의미로 배치한다. nth-child로 두면 카드를 하나
   더 붙일 때 배치 규칙 없는 자식이 다시 생긴다. */
.ku-admin-detail-card--photos {
  grid-column: 1;
  grid-row: 2;
}
.ku-admin-detail-card--name {
  grid-column: 1;
  grid-row: 1;
}
.ku-admin-detail-card--college {
  grid-column: 1;
  grid-row: 3;
}
.ku-admin-detail-card--polygon {
  grid-column: 2;
  grid-row: 2 / span 2;
}
.ku-admin-detail-card--facilities {
  grid-column: 2;
  grid-row: 1;
}
.ku-admin-detail-danger {
  grid-column: 1 / -1;
}
```

- [ ] **Step 2: JSX에 의미 클래스를 붙인다**

`src/app/admin/buildings/[id]/page.tsx` — 다섯 카드의 `className`을 바꾼다:

| `id`                  | 새 `className`                                            |
| --------------------- | --------------------------------------------------------- |
| `building-photos`     | `"ku-admin-detail-card ku-admin-detail-card--photos"`     |
| `building-name`       | `"ku-admin-detail-card ku-admin-detail-card--name"`       |
| `building-college`    | `"ku-admin-detail-card ku-admin-detail-card--college"`    |
| `building-polygon`    | `"ku-admin-detail-card ku-admin-detail-card--polygon"`    |
| `building-facilities` | `"ku-admin-detail-card ku-admin-detail-card--facilities"` |

예:

```tsx
        <div
          id="building-photos"
          className="ku-admin-detail-card ku-admin-detail-card--photos"
```

- [ ] **Step 3: 삭제·복구 버튼 치수를 맞춘다**

`src/app/admin/buildings/[id]/page.tsx` — danger 블록의 두 버튼을 아래로 바꾼다. **두 버튼의 `fontSize`·`padding`이 같아야** 토글할 때 레이아웃이 흔들리지 않는다.

```tsx
{
  building.is_deleted ? (
    // 삭제된 건물: 복구 버튼
    <button
      onClick={handleRestoreBuilding}
      style={{
        fontSize: 12,
        color: "#fff",
        background: "var(--ku-primary)",
        border: "1px solid var(--ku-primary)",
        borderRadius: 6,
        padding: "6px 14px",
        cursor: "pointer",
      }}
    >
      건물 복구
    </button>
  ) : (
    // 정상 건물: 삭제 버튼
    <button
      onClick={() => setConfirmDeleteBuilding(true)}
      style={{
        fontSize: 12,
        color: "var(--ku-danger)",
        background: "none",
        border: "1px solid var(--ku-danger)",
        borderRadius: 6,
        padding: "6px 14px",
        cursor: "pointer",
      }}
    >
      건물 삭제
    </button>
  );
}
```

- [ ] **Step 4: 검증**

Run: `npm run typecheck && npm run lint && npx playwright test e2e/admin-buildings-slopes.spec.ts`
Expected: 통과 (`건물 삭제`·`건물 복구` 버튼 단언 유지)

수동: `npm run dev` → `/admin/buildings/1`
Expected: 삭제 버튼이 **두 열 아래 전체 폭에서 가운데**, 흰 카드 배경 없이 페이지 배경 위에 놓인다. 삭제→복구 전환 시 버튼 크기가 변하지 않는다.

- [ ] **Step 5: 커밋**

```bash
npx prettier --write "src/app/admin/buildings/[id]/page.tsx" src/app/admin/admin-ui.css
git add "src/app/admin/buildings/[id]/page.tsx" src/app/admin/admin-ui.css
git commit -m "fix(admin): 건물 상세 카드 배치를 클래스 기반으로 바꾸고 삭제 버튼 위치 교정"
```

---

### Task 8: `admin_building_flags` 뷰와 요약 함수 재생성

카드 숫자와 목록 개수가 어긋나지 않으려면 조건 정의가 **한 곳에만** 있어야 한다.

**함수는 `create or replace`로 못 고친다.** `RETURNS TABLE`의 컬럼 목록이 반환 타입이고 PostgreSQL은 `CREATE OR REPLACE FUNCTION`으로 반환 타입 변경을 허용하지 않는다(`cannot change return type of existing function`). `drop` 후 재생성하고 **권한을 다시 부여한다** — `drop`은 권한도 함께 지운다.

**Files:**

- Create: `supabase/migrations/20260803000000_create_admin_building_flags.sql`
- Modify: `supabase/database.types.ts:361-376`

**Interfaces:**

- Produces:
  - 뷰 `public.admin_building_flags(building_id, missing_facility, missing_photo, missing_location, stale_update, translation_needed)`
  - 함수 `public.get_admin_building_summary()` — 컬럼 7개 (기존 6개 + `translation_needed_building_count`)

- [ ] **Step 1: 마이그레이션을 쓴다**

`supabase/migrations/20260803000000_create_admin_building_flags.sql`:

```sql
-- 건물별 보완 플래그 뷰.
-- 요약 카드 숫자와 목록 필터가 둘 다 이 뷰를 보게 해서 정의가 갈라지지 않게 한다.
-- 조건식은 기존 get_admin_building_summary()의 SQL을 그대로 옮긴 것이다.
-- 특히 stale_update는 interval '1 year'가 아니라 current_date - 365다 —
-- 바꾸면 윤년 구간에서 기존 stale_update_count가 조용히 달라진다.
create view public.admin_building_flags
with (security_invoker = on)
as
  select
    building.id as building_id,
    not exists (
      select 1
      from public.building_facilities facility
      where facility.building_id = building.id
    ) as missing_facility,
    not exists (
      select 1
      from public.building_photos photo
      where photo.building_id = building.id
    ) as missing_photo,
    building.geojson is null as missing_location,
    (
      building.last_updated is null
      or building.last_updated < current_date - 365
    ) as stale_update,
    exists (
      select 1
      from public.building_facilities facility
      where facility.building_id = building.id
        and facility.translation_status <> 'translated'
    ) as translation_needed
  from public.buildings building
  where not coalesce(building.is_deleted, false);

-- 함수와 같은 posture. Supabase 기본 권한이 anon에도 grant를 주므로
-- public revoke만으로는 부족해 anon을 명시적으로 회수한다.
revoke all on public.admin_building_flags from public;
revoke all on public.admin_building_flags from anon;
grant select on public.admin_building_flags to authenticated;

-- RETURNS TABLE 컬럼이 반환 타입이라 create or replace로는 컬럼을 늘릴 수 없다.
drop function if exists public.get_admin_building_summary();

create function public.get_admin_building_summary()
returns table (
  registered_facility_count bigint,
  missing_facility_count bigint,
  missing_photo_count bigint,
  missing_location_count bigint,
  stale_update_count bigint,
  translation_needed_count bigint,
  translation_needed_building_count bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    (
      select count(*)
      from public.building_facilities facility
      join public.admin_building_flags flag
        on flag.building_id = facility.building_id
    ) as registered_facility_count,
    (
      select count(*)
      from public.admin_building_flags flag
      where flag.missing_facility
    ) as missing_facility_count,
    (
      select count(*)
      from public.admin_building_flags flag
      where flag.missing_photo
    ) as missing_photo_count,
    (
      select count(*)
      from public.admin_building_flags flag
      where flag.missing_location
    ) as missing_location_count,
    (
      select count(*)
      from public.admin_building_flags flag
      where flag.stale_update
    ) as stale_update_count,
    (
      select count(*)
      from public.building_facilities facility
      join public.admin_building_flags flag
        on flag.building_id = facility.building_id
      where facility.translation_status <> 'translated'
    ) as translation_needed_count,
    (
      select count(*)
      from public.admin_building_flags flag
      where flag.translation_needed
    ) as translation_needed_building_count;
$$;

-- drop이 권한도 지웠으므로 그대로 다시 부여한다.
revoke execute on function public.get_admin_building_summary() from public;
grant execute on function public.get_admin_building_summary() to authenticated;
```

- [ ] **Step 2: 파일명 규칙을 확인한다**

Run: `EVENT_NAME=workflow_dispatch HEAD_SHA=HEAD GITHUB_OUTPUT=/dev/null bash scripts/check-migrations.sh`
Expected: 오류 없이 종료. (파일명이 `^[0-9]{14}_[a-z0-9_]+\.sql$`를 만족해야 한다. 커밋 전이라 `git ls-files`에 안 잡히면 `git add` 후 다시 돌린다.)

- [ ] **Step 3: 생성 타입을 갱신한다**

로컬에 Supabase 접속이 있으면:

```bash
npx supabase gen types typescript --db-url "$SUPABASE_DB_URL" --schema public > supabase/database.types.ts
```

없으면 `supabase/database.types.ts`를 손으로 맞춘다. `Views` 블록을

```ts
    Views: {
      [_ in never]: never;
    };
```

에서 아래로 바꾸고,

```ts
Views: {
  admin_building_flags: {
    Row: {
      building_id: number | null;
      missing_facility: boolean | null;
      missing_location: boolean | null;
      missing_photo: boolean | null;
      stale_update: boolean | null;
      translation_needed: boolean | null;
    }
    Relationships: [];
  }
}
```

함수 `Returns`에 컬럼을 추가한다:

```ts
get_admin_building_summary: {
  Args: Record<PropertyKey, never>;
  Returns: {
    missing_facility_count: number;
    missing_location_count: number;
    missing_photo_count: number;
    registered_facility_count: number;
    stale_update_count: number;
    translation_needed_building_count: number;
    translation_needed_count: number;
  }
  [];
}
```

- [ ] **Step 4: 검증**

Run: `npm run typecheck`
Expected: 통과

- [ ] **Step 5: 커밋**

```bash
npx prettier --write supabase/database.types.ts
git add supabase/migrations/20260803000000_create_admin_building_flags.sql supabase/database.types.ts
git commit -m "feat(db): 건물별 보완 플래그 뷰 추가하고 요약 함수를 뷰 기반으로 재생성"
```

---

### Task 9: CI 마이그레이션 이력 검증 분리·수정

두 가지를 고친다.

1. **검증 스텝 자체가 깨져 있다.** `supabase migration list --output json`이 JSON 앞에 진행 메시지를 stdout으로 흘리는데 그 출력을 `jq`에 그대로 물린다(run `30800700137`: `jq: parse error: Invalid numeric literal`). 잡이 계속 skip돼서 드러나지 않았을 뿐 **한 번도 통과한 적이 없다.**
2. **검증이 `migrate` 잡 안에만 있다.** 그 잡이 skip되면 검증도 함께 사라져 드리프트가 감지되지 않는다.

**Files:**

- Create: `scripts/build-supabase-db-url.sh`
- Modify: `.github/workflows/ci.yml:150-197` (마스킹 스텝을 스크립트 호출로, 검증 스텝 제거), 파일 끝에 새 잡 추가

**분리한 잡이 지켜야 할 세 조건:**

- `migrate` 이후에 돈다. `needs: [migrate]` + `if: always() && needs.migrate.result != 'failure'` — "적용 성공 **또는** 정상 skip 후 실행". `needs`만 붙이면 평상시(`has_changes=false`) 함께 skip돼 분리한 의미가 사라지고, `needs` 없이 두면 새 마이그레이션 푸시에서 **적용 전** 원격을 조회해 정상 푸시가 빨간불이 된다.
- **PR에서는 돌리지 않는다.** 포크 PR에는 secrets가 없어 DB URL 검사에서 `exit 1`이 난다. 항상 빨간불이면 드리프트 신호로서 무의미하다.
- **마스킹이 두 잡 모두에 걸린다.** 원본 secret은 자동 마스킹되지만 `[YOUR-PASSWORD]` 치환 후의 인코딩된 파생 값은 별도 마스킹 없이 로그에 남는다. 스펙은 "마스킹을 그대로 복사한다"고 적었지만, **30줄을 두 벌 두는 대신 공유 스크립트로 뺀다** — 마스킹·검증 로직은 그대로 보존되고 한쪽만 고쳐지는 사고를 막는다. `scripts/check-migrations.sh`가 이미 같은 패턴이다.

- [ ] **Step 1: DB URL 구성을 공유 스크립트로 뺀다**

`scripts/build-supabase-db-url.sh` (신규):

```bash
#!/usr/bin/env bash

# `migrate`와 `verify-migration-history` 잡이 공유한다.
# 원본 secret은 자동 마스킹되지만 `[YOUR-PASSWORD]` 치환 후의 인코딩된 파생 값은
# 별도 마스킹 없이는 로그에 그대로 남는다. 두 잡이 같은 마스킹을 받도록
# 로직을 한 곳에만 둔다.

set -euo pipefail

if [[ -z "${SUPABASE_DB_URL_TEMPLATE:-}" || -z "${SUPABASE_DB_PASSWORD:-}" ]]; then
  echo "::error::Configure SUPABASE_DB_URL and SUPABASE_DB_PASSWORD in the production environment or repository secrets."
  exit 1
fi
if [[ "$SUPABASE_DB_URL_TEMPLATE" != *".pooler.supabase.com:5432/"* ]]; then
  echo "::error::SUPABASE_DB_URL must be the IPv4-compatible Session pooler URI on port 5432."
  exit 1
fi
if [[ "$SUPABASE_DB_URL_TEMPLATE" != *"[YOUR-PASSWORD]"* ]]; then
  echo "::error::SUPABASE_DB_URL must retain the [YOUR-PASSWORD] placeholder."
  exit 1
fi

encoded_password="$(
  node -e 'process.stdout.write(encodeURIComponent(process.env.SUPABASE_DB_PASSWORD))'
)"
database_url="${SUPABASE_DB_URL_TEMPLATE/\[YOUR-PASSWORD\]/$encoded_password}"

echo "::add-mask::$encoded_password"
echo "::add-mask::$database_url"
echo "SUPABASE_MIGRATION_DB_URL=$database_url" >> "$GITHUB_ENV"
```

`.github/workflows/ci.yml` — `migrate` 잡의 `Build masked database connection` 스텝(150–175행) **전체**를 아래로 줄인다:

```yaml
- name: Build masked database connection
  shell: bash
  run: bash scripts/build-supabase-db-url.sh
```

- [ ] **Step 2: `migrate`에서 검증 스텝을 빼고 새 잡을 추가한다**

`.github/workflows/ci.yml` — 183–197행의 `Verify local and remote migration history` 스텝 전체를 삭제한다. `migrate` 잡은 `Apply pending migrations`에서 끝난다.

파일 끝에 새 잡을 추가한다:

`.github/workflows/ci.yml` 파일 끝에 추가:

```yaml
verify-migration-history:
  name: Verify migration history
  # migrate 성공 또는 정상 skip 후에 돈다. always()가 없으면 has_changes=false로
  # migrate가 skip되는 평상시에 검증도 함께 사라져 지금과 같은 사각지대가 된다.
  # pull_request에서는 돌리지 않는다 — 포크 PR에 secrets가 없어 항상 빨간불이 된다.
  if: >-
    always() &&
    (github.event_name == 'push' || github.event_name == 'workflow_dispatch') &&
    needs.migrate.result != 'failure'
  needs: [migrate]
  runs-on: ubuntu-latest
  timeout-minutes: 10
  environment: production
  concurrency:
    group: supabase-production-migrations
    cancel-in-progress: false
  permissions:
    contents: read
  env:
    SUPABASE_DB_URL_TEMPLATE: ${{ secrets.SUPABASE_DB_URL }}
    SUPABASE_DB_PASSWORD: ${{ secrets.SUPABASE_DB_PASSWORD }}
  steps:
    - uses: actions/checkout@v4

    - name: Build masked database connection
      shell: bash
      run: bash scripts/build-supabase-db-url.sh

    - name: Compare migration files with applied versions
      shell: bash
      run: |
        set -euo pipefail

        # CLI 출력 포맷에 의존하지 않는다. supabase migration list --output json은
        # JSON 앞에 진행 메시지를 stdout으로 흘려 jq 파싱을 깨뜨린다.
        psql "$SUPABASE_MIGRATION_DB_URL" --no-align --tuples-only \
          --command "select version from supabase_migrations.schema_migrations" \
          | sed '/^$/d' | sort > /tmp/applied-versions.txt

        git ls-files 'supabase/migrations/*.sql' \
          | xargs -n1 basename \
          | sed 's/_.*//' \
          | sort > /tmp/local-versions.txt

        if ! diff -u /tmp/local-versions.txt /tmp/applied-versions.txt; then
          echo "::error::Local migration files and applied versions differ."
          exit 1
        fi
        echo "Local and remote migration histories match."
```

`psql`은 GitHub `ubuntu-latest` 이미지에 기본 포함된다. 만약 `psql: command not found`가 나면 `Compare` 스텝 앞에 `sudo apt-get update && sudo apt-get install -y postgresql-client`를 넣는다.

- [ ] **Step 3: 워크플로 문법을 확인한다**

Run: `npx --yes yaml-lint .github/workflows/ci.yml` (없으면 `node -e "require('fs').readFileSync('.github/workflows/ci.yml','utf8')"` 대신 GitHub Actions 탭에서 파싱 오류를 확인)
Expected: 파싱 오류 없음

Run: `bash -n scripts/build-supabase-db-url.sh`
Expected: 문법 오류 없음

Run: `npm run format:check`
Expected: 통과 (Prettier가 YAML도 검사한다. 실패하면 `npx prettier --write .github/workflows/ci.yml`)

- [ ] **Step 4: 커밋**

```bash
git add .github/workflows/ci.yml scripts/build-supabase-db-url.sh
git commit -m "ci: 마이그레이션 이력 검증을 별도 잡으로 분리하고 jq 의존 제거"
```

- [ ] **Step 5: 실제 실행으로 확인 (푸시 후)**

Task 8·9를 푸시한 뒤 Actions에서 확인한다:

Expected:

- `Apply Supabase migrations` 잡이 **성공**한다(`supabase db push`가 `drop`+재생성과 권한 재부여를 실제로 적용한다). 여기서 실패하면 마이그레이션 SQL을 고쳐 **새 파일**로 추가한다 — 기존 파일 수정은 `check-migrations.sh`가 막는다.
- `Verify migration history` 잡이 **초록불**이다.
- 다음 푸시(마이그레이션 변경 없음)에서 `migrate`는 skip, `Verify migration history`는 **여전히 실행**된다. 이것이 이번 분리의 목적이다.

---

### Task 10: 요약 조회 실패 판정 로직

`fetchSummary`는 지금 **세 요청 중 어느 것의 오류도 확인하지 않는다.** RPC뿐 아니라 count 두 개도 실패하면 `count ?? 0`을 거쳐 `0`이 되어 `총 0개 · 삭제됨 0개`라는 **정상처럼 보이는 거짓말**이 남는다.

부분 성공을 부분 표시하지 않는다 — 어느 숫자가 진짜인지 화면에서 구분할 수 없으면 전부 못 믿는 편이 낫다.

**Files:**

- Create: `src/lib/adminBuildingSummary.ts`
- Test: `src/lib/adminBuildingSummary.test.ts`

**Interfaces:**

- Produces:
  - `AdminBuildingSummary` — 7개 숫자 필드 인터페이스
  - `AdminBuildingFlagKey = "missing_facility" | "missing_photo" | "missing_location" | "stale_update" | "translation_needed"`
  - `ADMIN_BUILDING_FLAG_LABELS: Record<AdminBuildingFlagKey, string>`
  - `AdminSummaryPart = { prefix?: string; value: number }`
  - `AdminSummaryItem = { id: string; label: string; description: string; parts: (s: AdminBuildingSummary) => AdminSummaryPart[]; warningValue: (s: AdminBuildingSummary) => number; flag?: AdminBuildingFlagKey }`
  - `ADMIN_SUMMARY_ITEMS: AdminSummaryItem[]` (6개)
  - `resolveSummary(total, deleted, summary)` → `{ status: "ok"; value: { overallTotalCount; deletedCount; summary } } | { status: "error"; errors: unknown[] }`
  - `resolveFlagFilter(response)` → `{ status: "error" } | { status: "empty" } | { status: "ids"; ids: number[] }`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`src/lib/adminBuildingSummary.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  ADMIN_SUMMARY_ITEMS,
  resolveFlagFilter,
  resolveSummary,
  type AdminBuildingSummary,
} from "./adminBuildingSummary";

const summary: AdminBuildingSummary = {
  registered_facility_count: 40,
  missing_facility_count: 12,
  missing_photo_count: 9,
  missing_location_count: 3,
  stale_update_count: 21,
  translation_needed_count: 12,
  translation_needed_building_count: 7,
};

const ok = { count: 96, error: null };

describe("resolveSummary", () => {
  it("셋 다 성공하면 값을 돌려준다", () => {
    const result = resolveSummary(
      ok,
      { count: 4, error: null },
      {
        data: summary,
        error: null,
      },
    );

    expect(result).toEqual({
      status: "ok",
      value: { overallTotalCount: 96, deletedCount: 4, summary },
    });
  });

  it("RPC가 실패하면 실패 상태가 된다", () => {
    const result = resolveSummary(
      ok,
      { count: 4, error: null },
      {
        data: null,
        error: { message: "function does not exist" },
      },
    );

    expect(result.status).toBe("error");
  });

  it("RPC가 아닌 전체 건물 count만 실패해도 실패 상태가 된다", () => {
    const result = resolveSummary(
      { count: null, error: { message: "boom" } },
      { count: 4, error: null },
      { data: summary, error: null },
    );

    expect(result.status).toBe("error");
  });

  it("삭제 건물 count만 실패해도 실패 상태가 된다", () => {
    const result = resolveSummary(
      ok,
      { count: null, error: { message: "boom" } },
      { data: summary, error: null },
    );

    expect(result.status).toBe("error");
  });

  it("오류가 없어도 RPC 데이터가 없으면 실패 상태가 된다", () => {
    const result = resolveSummary(
      ok,
      { count: 4, error: null },
      {
        data: null,
        error: null,
      },
    );

    expect(result.status).toBe("error");
  });
});

describe("resolveFlagFilter", () => {
  it("오류면 error", () => {
    expect(
      resolveFlagFilter({ data: null, error: { message: "boom" } }).status,
    ).toBe("error");
  });

  it("0건이면 empty (빈 배열을 .in()에 넘기지 않기 위해)", () => {
    expect(resolveFlagFilter({ data: [], error: null }).status).toBe("empty");
  });

  it("building_id가 null인 행은 버린다", () => {
    expect(
      resolveFlagFilter({ data: [{ building_id: null }], error: null }).status,
    ).toBe("empty");
  });

  it("1건 이상이면 id 배열을 돌려준다", () => {
    expect(
      resolveFlagFilter({
        data: [{ building_id: 1 }, { building_id: null }, { building_id: 7 }],
        error: null,
      }),
    ).toEqual({ status: "ids", ids: [1, 7] });
  });
});

describe("ADMIN_SUMMARY_ITEMS", () => {
  it("경고 카드 5개만 flag를 갖는다", () => {
    expect(ADMIN_SUMMARY_ITEMS.filter((item) => item.flag)).toHaveLength(5);
    expect(
      ADMIN_SUMMARY_ITEMS.find((item) => item.id === "registered_facility")
        ?.flag,
    ).toBeUndefined();
  });

  it("번역 필요 카드는 시설 수와 건물 수를 함께 보여준다", () => {
    const item = ADMIN_SUMMARY_ITEMS.find(
      (entry) => entry.id === "translation_needed",
    )!;

    expect(item.parts(summary)).toEqual([
      { prefix: "시설", value: 12 },
      { prefix: "건물", value: 7 },
    ]);
  });

  it("나머지 카드는 값 하나만 보여준다", () => {
    for (const item of ADMIN_SUMMARY_ITEMS) {
      if (item.id === "translation_needed") continue;
      expect(item.parts(summary)).toHaveLength(1);
    }
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run src/lib/adminBuildingSummary.test.ts`
Expected: FAIL — 모듈을 찾을 수 없음

- [ ] **Step 3: 모듈을 구현한다**

`src/lib/adminBuildingSummary.ts`:

```ts
export interface AdminBuildingSummary {
  registered_facility_count: number;
  missing_facility_count: number;
  missing_photo_count: number;
  missing_location_count: number;
  stale_update_count: number;
  /** 번역이 필요한 **시설** 수 */
  translation_needed_count: number;
  /** 번역이 필요한 시설을 가진 **건물** 수 (클릭 필터가 거르는 대상) */
  translation_needed_building_count: number;
}

export type AdminBuildingFlagKey =
  | "missing_facility"
  | "missing_photo"
  | "missing_location"
  | "stale_update"
  | "translation_needed";

export const ADMIN_BUILDING_FLAG_LABELS: Record<AdminBuildingFlagKey, string> =
  {
    missing_facility: "시설 정보 없음",
    missing_photo: "사진 없음",
    missing_location: "위치 없음",
    stale_update: "갱신일 오래됨",
    translation_needed: "번역 필요",
  };

export interface AdminSummaryPart {
  prefix?: string;
  value: number;
}

export interface AdminSummaryItem {
  id: string;
  label: string;
  description: string;
  /** 카드에 표시할 값. 카드마다 표시 방식이 다를 수 있다. */
  parts: (summary: AdminBuildingSummary) => AdminSummaryPart[];
  /** 0보다 크면 경고 강조 */
  warningValue: (summary: AdminBuildingSummary) => number;
  /** 있으면 클릭 가능한 필터 카드. 표시 값과는 별개의 키다. */
  flag?: AdminBuildingFlagKey;
}

export const ADMIN_SUMMARY_ITEMS: AdminSummaryItem[] = [
  {
    id: "registered_facility",
    label: "등록된 시설",
    description: "공개 건물에 등록된 시설",
    parts: (summary) => [{ value: summary.registered_facility_count }],
    warningValue: () => 0,
  },
  {
    id: "missing_facility",
    label: ADMIN_BUILDING_FLAG_LABELS.missing_facility,
    description: "등록된 시설이 없는 공개 건물",
    parts: (summary) => [{ value: summary.missing_facility_count }],
    warningValue: (summary) => summary.missing_facility_count,
    flag: "missing_facility",
  },
  {
    id: "missing_photo",
    label: ADMIN_BUILDING_FLAG_LABELS.missing_photo,
    description: "사진이 없는 공개 건물",
    parts: (summary) => [{ value: summary.missing_photo_count }],
    warningValue: (summary) => summary.missing_photo_count,
    flag: "missing_photo",
  },
  {
    id: "missing_location",
    label: ADMIN_BUILDING_FLAG_LABELS.missing_location,
    description: "지도 위치가 없는 공개 건물",
    parts: (summary) => [{ value: summary.missing_location_count }],
    warningValue: (summary) => summary.missing_location_count,
    flag: "missing_location",
  },
  {
    id: "stale_update",
    label: ADMIN_BUILDING_FLAG_LABELS.stale_update,
    description: "갱신일이 없거나 1년 이상 지난 공개 건물",
    parts: (summary) => [{ value: summary.stale_update_count }],
    warningValue: (summary) => summary.stale_update_count,
    flag: "stale_update",
  },
  {
    // 이 카드만 두 숫자를 갖는다. 카드가 세는 것은 시설이지만 클릭 필터는
    // 건물을 거르므로, 걸러지는 대상이 카드에서 바로 읽혀야 한다.
    id: "translation_needed",
    label: ADMIN_BUILDING_FLAG_LABELS.translation_needed,
    description: "번역 대기 또는 실패 상태인 시설 · 그 시설을 가진 건물",
    parts: (summary) => [
      { prefix: "시설", value: summary.translation_needed_count },
      { prefix: "건물", value: summary.translation_needed_building_count },
    ],
    warningValue: (summary) => summary.translation_needed_count,
    flag: "translation_needed",
  },
];

interface CountResult {
  count: number | null;
  error: unknown;
}

interface SummaryResult {
  data: AdminBuildingSummary | null;
  error: unknown;
}

export type ResolvedSummary =
  | {
      status: "ok";
      value: {
        overallTotalCount: number;
        deletedCount: number;
        summary: AdminBuildingSummary;
      };
    }
  | { status: "error"; errors: unknown[] };

/**
 * 세 요청 중 하나라도 실패하면 요약 영역 전체를 실패로 본다.
 * 부분 성공을 부분 표시하면 어느 숫자가 진짜인지 화면에서 구분할 수 없다.
 */
export function resolveSummary(
  totalResult: CountResult,
  deletedResult: CountResult,
  summaryResult: SummaryResult,
): ResolvedSummary {
  const errors = [
    totalResult.error,
    deletedResult.error,
    summaryResult.error,
  ].filter(Boolean);
  if (errors.length > 0 || !summaryResult.data) {
    return { status: "error", errors };
  }
  return {
    status: "ok",
    value: {
      overallTotalCount: totalResult.count ?? 0,
      deletedCount: deletedResult.count ?? 0,
      summary: summaryResult.data,
    },
  };
}

export type ResolvedFlagFilter =
  { status: "error" } | { status: "empty" } | { status: "ids"; ids: number[] };

/**
 * 플래그 조회 결과를 세 갈래로 나눈다.
 *
 * 0건에서 빈 배열을 그대로 `.in()`에 넘기면 supabase-js가 `id=in.()`으로
 * 직렬화하고 PostgREST가 파싱 오류를 돌려준다 — "경고 0건인 카드를 눌렀더니
 * 목록이 깨진다"가 된다. 오류를 빈 배열로 뭉개면 뷰 미적용·RLS 거부·네트워크
 * 실패가 모두 "해당 건물 없음"으로 보인다.
 */
export function resolveFlagFilter(response: {
  data: { building_id: number | null }[] | null;
  error: unknown;
}): ResolvedFlagFilter {
  if (response.error) return { status: "error" };
  const ids = (response.data ?? [])
    .map((row) => row.building_id)
    .filter((id): id is number => id !== null);
  if (ids.length === 0) return { status: "empty" };
  return { status: "ids", ids };
}
```

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run src/lib/adminBuildingSummary.test.ts`
Expected: PASS (12 tests)

- [ ] **Step 5: 커밋**

```bash
npx prettier --write src/lib/adminBuildingSummary.ts src/lib/adminBuildingSummary.test.ts
git add src/lib/adminBuildingSummary.ts src/lib/adminBuildingSummary.test.ts
git commit -m "feat(admin): 요약 실패 판정과 플래그 필터 판정을 순수 모듈로 분리"
```

---

### Task 11: 모바일 목록 정렬 어긋남

`.ku-admin-mobile-card`는 `<button>`인데 `globals.css` 리셋에 `text-align` 항목이 없다. 브라우저 기본값 `center`를 상속받아 건물명이 가운데로 가고, 바로 아래 `.ku-admin-mobile-meta`는 `display: flex`라 왼쪽에 붙는다. 두 줄의 기준선이 달라 목록이 들쑥날쑥해 보인다.

**Files:**

- Modify: `src/app/admin/admin-ui.css:874-883`

- [ ] **Step 1: `text-align: left`를 준다**

`src/app/admin/admin-ui.css` — 모바일 블록의 `.ku-admin-mobile-card`에 한 줄 추가:

```css
.ku-admin-mobile-card {
  display: flex;
  align-items: center;
  min-height: 82px;
  padding: 13px 14px;
  border: 1px solid var(--ku-border);
  border-radius: 12px;
  text-align: left;
  color: var(--ku-text-1);
  background: var(--ku-surface);
}
```

- [ ] **Step 2: 검증**

수동: `npm run dev` → 브라우저 폭 390px → `/admin/dashboard/buildings`
Expected: 건물명과 그 아래 메타 줄의 **왼쪽 끝이 맞는다**.

- [ ] **Step 3: 커밋**

```bash
npx prettier --write src/app/admin/admin-ui.css
git add src/app/admin/admin-ui.css
git commit -m "fix(admin): 모바일 건물 카드 텍스트를 왼쪽 정렬"
```

---

### Task 12: 요약 카드 전환·실패 상태·경고 카드 필터

**마크업 전환과 필터 배선을 한 태스크로 묶는다.** 둘을 나누면 중간 커밋에 "눌러도 아무 일 없는 버튼"이 남는데, 그것은 스펙이 총계 카드에 대해 명시적으로 금지한 상태다(`눌리지 않는 버튼을 두면 키보드 사용자가 포커스를 받고도 아무 일이 없는 상태를 만난다`).

카드를 `<button>`으로 바꾸려면 `<dl>`을 함께 바꿔야 한다. `<dl>`의 직계 자식으로 허용되는 것은 `<dt>`·`<dd>`와 그 둘을 묶는 `<div>`뿐이라 `<button>`은 유효하지 않고, 반대로 `<dt>`·`<dd>`는 `<button>` 안에 들어갈 수 있는 내용이 아니다. 양쪽에서 깨지므로 브라우저가 DOM을 교정하고 React는 중첩 경고를 낸다.

컨테이너를 일반 `<div>`로, 카드를 `<button>`(총계 카드는 `<div>`), 카드 안의 `<dt>`·`<dd>`를 `<span>`으로 바꾼다. 정의목록 시맨틱을 잃지만 이 영역은 원래 용어-정의 쌍이 아니라 **지표 타일**이고 그중 다섯이 필터 컨트롤이 된다.

**Files:**

- Modify: `src/app/admin/dashboard/buildings/page.tsx:28-78`(로컬 타입·상수 제거), `:104-121`(fetchSummary), `:123-169`(fetchData), `:199-271`(헤딩·요약·컨트롤·빈 상태)
- Modify: `src/app/admin/admin-ui.css:180-220`
- Modify: `e2e/support/mockBackend.ts:388-424`

**Interfaces:**

- Consumes: Task 10의 `ADMIN_SUMMARY_ITEMS`, `ADMIN_BUILDING_FLAG_LABELS`, `AdminBuildingSummary`, `AdminBuildingFlagKey`, `resolveSummary`, `resolveFlagFilter`; Task 8의 `admin_building_flags` 뷰와 그 생성 타입
- Produces: 없음 (화면 종단)

- [ ] **Step 1: mock RPC에 새 컬럼을 추가한다**

`e2e/support/mockBackend.ts` — `translation_needed_count` 계산 **뒤**에 추가:

```ts
      translation_needed_building_count: activeBuildings.filter((building) =>
        state.facilities.some(
          (facility) =>
            facility.building_id === building.id &&
            facility.translation_status !== "translated",
        ),
      ).length,
```

이걸 빼면 `번역 필요` 카드가 `건물 undefined개`로 렌더된다.

- [ ] **Step 2: 로컬 타입·상수를 걷어내고 상태·토글을 추가한다**

`src/app/admin/dashboard/buildings/page.tsx` — 28–78행의 `interface AdminBuildingSummary`와 `const summaryItems` 블록을 **전부 삭제**하고, import에 추가한다:

```ts
import {
  ADMIN_BUILDING_FLAG_LABELS,
  ADMIN_SUMMARY_ITEMS,
  resolveFlagFilter,
  resolveSummary,
  type AdminBuildingFlagKey,
  type AdminBuildingSummary,
} from "@/lib/adminBuildingSummary";
```

컴포넌트 상태에 셋을 추가한다:

```ts
const [summaryError, setSummaryError] = useState(false);
const [activeFlag, setActiveFlag] = useState<AdminBuildingFlagKey | null>(null);
const [listError, setListError] = useState(false);
```

`campusByBuilding` useMemo 위에 토글 함수를 둔다:

```ts
// 필터는 한 번에 하나만. 같은 카드를 다시 누르면 꺼진다.
// 페이지를 1로 되돌리지 않으면 결과가 1페이지뿐인데 3페이지에 머무는 일이 생긴다.
function toggleFlag(flag: AdminBuildingFlagKey) {
  setActiveFlag((current) => (current === flag ? null : flag));
  setPage(1);
}
```

- [ ] **Step 3: `fetchSummary`가 세 결과의 오류를 모두 본다**

`src/app/admin/dashboard/buildings/page.tsx` — `fetchSummary`를 아래로 바꾼다:

```ts
const fetchSummary = useCallback(async () => {
  const [totalResult, deletedResult, summaryResult] = await Promise.all([
    supabase.from("buildings").select("id", { count: "exact", head: true }),
    supabase
      .from("buildings")
      .select("id", { count: "exact", head: true })
      .eq("is_deleted", true),
    supabase.rpc("get_admin_building_summary").single(),
  ]);
  const resolved = resolveSummary(totalResult, deletedResult, summaryResult);
  if (resolved.status === "error") {
    // 원문은 콘솔로만 보낸다. PostgREST 오류의 message·details·hint에는
    // 함수 시그니처, relation·column 이름, schema cache 힌트가 담긴다.
    console.error("건물 요약 조회 실패", resolved.errors);
    setSummary(null);
    setSummaryError(true);
    return;
  }
  setSummaryError(false);
  setOverallTotalCount(resolved.value.overallTotalCount);
  setDeletedCount(resolved.value.deletedCount);
  setSummary(resolved.value.summary);
}, []);
```

- [ ] **Step 4: `fetchData`가 플래그를 먼저 조회한다**

`src/app/admin/dashboard/buildings/page.tsx` — `fetchData`를 아래로 바꾼다:

```ts
const fetchData = useCallback(async () => {
  setListError(false);

  let flagIds: number[] | null = null;
  if (activeFlag) {
    const flagResponse = await supabase
      .from("admin_building_flags")
      .select("building_id")
      .eq(activeFlag, true);
    const resolved = resolveFlagFilter(flagResponse);
    if (resolved.status === "error") {
      console.error("건물 플래그 조회 실패", flagResponse.error);
      setBuildings([]);
      setFacilityCounts(new Map());
      setTotalCount(0);
      setListError(true);
      setLoading(false);
      return;
    }
    if (resolved.status === "empty") {
      // 빈 배열을 .in()에 넘기면 id=in.()으로 직렬화돼 PostgREST가 파싱 오류를 낸다.
      setBuildings([]);
      setFacilityCounts(new Map());
      setTotalCount(0);
      setLoading(false);
      return;
    }
    flagIds = resolved.ids;
  }

  const { from, to } = getAdminPageRange(page);
  let query = supabase.from("buildings").select("*", { count: "exact" });
  if (flagIds) query = query.in("id", flagIds);
  const searchFilter = buildAdminSearchFilter(
    ["name", "name_en"],
    debouncedSearch,
  );
  if (searchFilter) query = query.or(searchFilter);
  const { data, error, count } = await query
    .order("is_deleted", { ascending: true })
    .order("name", { ascending: true })
    .order("id", { ascending: true })
    .range(from, to);
  if (error) {
    console.error("건물 목록 조회 실패", error);
    setBuildings([]);
    setFacilityCounts(new Map());
    setTotalCount(0);
    setListError(true);
    setLoading(false);
    return;
  }
  const nextTotal = count ?? 0;
  const pageCount = getAdminPageCount(nextTotal);
  if (page > pageCount) {
    setPage(pageCount);
    return;
  }
  const nextBuildings = data ?? [];
  const buildingIds = nextBuildings.map((building) => building.id);
  const { data: facilityData } =
    buildingIds.length === 0
      ? { data: [] }
      : await supabase
          .from("building_facilities")
          .select("building_id")
          .in("building_id", buildingIds);
  const counts = new Map<number, number>();
  (facilityData ?? []).forEach((facility) => {
    if (facility.building_id !== null)
      counts.set(
        facility.building_id,
        (counts.get(facility.building_id) ?? 0) + 1,
      );
  });
  setBuildings(nextBuildings);
  setFacilityCounts(counts);
  setTotalCount(nextTotal);
  setLoading(false);
}, [activeFlag, debouncedSearch, page]);
```

- [ ] **Step 5: 헤딩 캡션도 실패 상태를 따른다**

`총 N개 · 삭제됨 M개`는 실패한 count에서 온 값일 수 있다. 요약이 실패하면 숫자를 보여주지 않는다:

```tsx
          <h1 className="ku-admin-title">건물 관리</h1>
          <p className="ku-admin-caption">
            {summaryError
              ? "건물 수를 불러오지 못했어요"
              : `총 ${overallTotalCount}개 · 삭제됨 ${deletedCount}개`}
          </p>
```

- [ ] **Step 6: `<dl>`을 `<div>`로 바꾸고 카드를 그린다**

`src/app/admin/dashboard/buildings/page.tsx` — `<dl className="ku-admin-overview"> … </dl>` 전체를 아래로 교체한다:

```tsx
{
  summaryError ? (
    <div className="ku-admin-overview-error" role="status">
      <span>요약을 불러오지 못했어요.</span>
      <button
        className="ku-admin-button"
        type="button"
        disabled={refreshing}
        onClick={() => void handleRefresh()}
      >
        다시 시도
      </button>
    </div>
  ) : (
    <div
      className="ku-admin-overview"
      role="group"
      aria-label="관리자 보완 현황"
    >
      {ADMIN_SUMMARY_ITEMS.map((item) => {
        const body = (
          <>
            <span className="ku-admin-overview-label">{item.label}</span>
            <span className="ku-admin-overview-value">
              {summary ? (
                item.parts(summary).map((part, index) => (
                  <span
                    className="ku-admin-overview-part"
                    key={part.prefix ?? index}
                  >
                    {part.prefix && <span>{part.prefix}</span>}
                    <strong>{part.value}</strong>
                    <span>개</span>
                  </span>
                ))
              ) : (
                <strong>—</strong>
              )}
            </span>
          </>
        );
        const warning = Boolean(
          item.flag && summary && item.warningValue(summary) > 0,
        );
        // 클릭 대상이 아닌 총계 카드는 button으로 만들지 않는다.
        // 눌리지 않는 버튼은 키보드 사용자가 포커스를 받고도 아무 일이 없다.
        return item.flag ? (
          <button
            className="ku-admin-overview-item"
            type="button"
            data-warning={warning}
            aria-pressed={activeFlag === item.flag}
            key={item.id}
            title={item.description}
            onClick={() => toggleFlag(item.flag!)}
          >
            {body}
          </button>
        ) : (
          <div
            className="ku-admin-overview-item"
            data-warning={warning}
            key={item.id}
            title={item.description}
          >
            {body}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 7: CSS의 `dt`·`dd` 선택자를 클래스로 바꾸고 버튼 스타일을 넣는다**

`src/app/admin/admin-ui.css` — 186–220행을 아래로 교체한다:

```css
.ku-admin-overview-item {
  display: block;
  min-width: 0;
  padding: 12px 13px;
  border: 1px solid var(--ku-border);
  border-radius: 10px;
  /* button은 브라우저 기본값이 text-align: center이고 color도 상속하지 않는다.
     둘 다 명시하지 않으면 카드 안 텍스트가 가운데로 가고 색이 어긋난다.
     (globals.css 리셋은 button에 font: inherit만 준다) */
  text-align: left;
  color: var(--ku-text-1);
  background: var(--ku-surface);
}
button.ku-admin-overview-item {
  cursor: pointer;
}
.ku-admin-overview-item[aria-pressed="true"] {
  border-color: var(--ku-crimson-600);
  box-shadow: inset 0 0 0 1px var(--ku-crimson-600);
}
.ku-admin-overview-label {
  display: block;
  overflow: hidden;
  color: var(--ku-text-3);
  font-size: 11.5px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ku-admin-overview-value {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 3px;
  margin: 5px 0 0;
  color: var(--ku-text-2);
  font-size: 12px;
}
.ku-admin-overview-part {
  display: inline-flex;
  align-items: baseline;
  gap: 3px;
}
.ku-admin-overview-part + .ku-admin-overview-part::before {
  content: "·";
  margin-right: 3px;
}
.ku-admin-overview-item strong {
  color: var(--ku-text-1);
  font-size: 20px;
  line-height: 1;
}
.ku-admin-overview-item[data-warning="true"] {
  border-color: color-mix(in srgb, #d97706 45%, var(--ku-border));
  background: color-mix(in srgb, #fffbeb 60%, var(--ku-surface));
}
.ku-admin-overview-item[data-warning="true"] strong {
  color: #92400e;
}
.ku-admin-overview-error {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  margin: 0 0 16px;
  padding: 12px 13px;
  border: 1px solid var(--ku-border);
  border-radius: 10px;
  color: var(--ku-text-2);
  background: var(--ku-surface);
  font-size: 13px;
}
```

원래 186–192행의 `.ku-admin-overview-item` 정의와 193–220행의 `dt`/`dd`/`strong`/`data-warning` 규칙을 위 블록이 대체한다. 180–185행의 `.ku-admin-overview` 그리드 규칙과 820–825행의 모바일 규칙은 **그대로 둔다.**

- [ ] **Step 8: 초기화 경로와 빈·오류 상태**

`AdminListControls` 호출을 바꾼다. 지금은 검색어만 보고 있다:

```tsx
        hasActiveFilters={search.trim() !== "" || activeFlag !== null}
        onReset={() => {
          setSearch("");
          setActiveFlag(null);
          setPage(1);
        }}
```

목록 분기를 아래로 바꾼다:

```tsx
      {loading ? (
        <div className="ku-admin-empty">불러오는 중...</div>
      ) : listError ? (
        <div className="ku-admin-empty">
          목록을 불러오지 못했어요.{" "}
          <button
            className="ku-admin-button"
            type="button"
            disabled={refreshing}
            onClick={() => void handleRefresh()}
          >
            다시 시도
          </button>
        </div>
      ) : buildings.length === 0 ? (
        <div className="ku-admin-empty">
          {activeFlag
            ? `‘${ADMIN_BUILDING_FLAG_LABELS[activeFlag]}’에 해당하는 건물이 없습니다.`
            : "검색 결과가 없습니다."}
        </div>
      ) : (
```

- [ ] **Step 9: 검증**

Run: `npm run typecheck && npm run lint && npm run test`
Expected: 통과. `supabase.from("admin_building_flags")`가 타입 오류를 내면 Task 8 Step 3의 `database.types.ts` 편집이 빠진 것이다.

Run: `npx playwright test e2e/admin-buildings-slopes.spec.ts`
Expected: PASS (7 tests). `overview.getByText("등록된 시설").locator("..")`는 이제 카드 `<div>`를 가리키고 여전히 `2개`를 담는다. `번역 필요`는 `시설 1개 · 건물 1개`라 `1개`를 담는다. mock은 `admin_building_flags`를 모르는 relation으로 보고 빈 배열을 돌려주지만 **기존 테스트는 카드를 누르지 않으므로 영향이 없다.**

수동: `npm run dev` → `/admin/dashboard/buildings` → DevTools 콘솔
Expected: **DOM 중첩 경고가 없다.** 이것이 컨테이너 구조 변경의 회귀 신호다.

- [ ] **Step 10: 커밋**

```bash
npx prettier --write src/app/admin/dashboard/buildings/page.tsx src/app/admin/admin-ui.css e2e/support/mockBackend.ts
git add src/app/admin/dashboard/buildings/page.tsx src/app/admin/admin-ui.css e2e/support/mockBackend.ts
git commit -m "feat(admin): 요약 실패를 화면에 드러내고 경고 카드로 목록을 거른다"
```

---

### Task 13: 수동 검증

**E2E는 이번 핵심 계약을 잡지 못한다.** mock 백엔드는 모르는 relation에 빈 배열을 돌려주므로 `admin_building_flags`가 항상 0건이 되고, id 필터도 `eq.`만 처리해 `in.(...)`을 모른다. 요약 mock의 stale 기준도 고정 날짜라 DB의 `current_date - 365`와 이미 갈라져 있다. **"카드 숫자와 목록 개수 일치"는 수동 검증으로만 확인된다.** 이 항목에 E2E 초록불을 근거로 삼지 않는다.

**Files:** 없음 (검증만)

- [ ] **Step 1: 자동 스위트 전체를 돌린다**

```bash
npm run lint && npm run typecheck && npm run test && npm run test:e2e && npm run format:check
```

Expected: 모두 통과

- [ ] **Step 2: 건물 상세 — 폴리곤 프리뷰**

`npm run dev` → 운영 데이터가 붙은 환경에서 확인한다.

- [ ] 폴리곤이 **있는** 건물에서 프리뷰 지도가 뜬다
- [ ] 폴리곤이 **없는** 건물에서는 지도 없이 `❌ 폴리곤 없음 — 편집으로 추가` 문구가 남는다
- [ ] 편집 진입 시 지도가 **하나만** 뜬다 (프리뷰가 사라지고 편집기가 뜬다)
- [ ] 편집 버튼을 눌러도 **지도 뷰포트가 튀지 않는다**
- [ ] 폴리곤을 편집·저장한 뒤 프리뷰가 **새 폴리곤**을 그린다
- [ ] 편집 진입·취소를 5회 반복한 뒤 DOM에 `.leaflet-container`가 하나만 남는다 (지도 인스턴스가 쌓이지 않는다)
- [ ] 프리뷰에서 드래그·휠·더블클릭이 모두 먹지 않고, 폴리곤 위에서 커서가 바뀌지 않는다
- [ ] 상세 페이지를 연속으로 5개 열었을 때 네트워크 탭의 `buildings?select=id%2Cname%2Cgeojson` 요청이 **한 번만** 나간다

- [ ] **Step 3: 건물 상세 — 캐시 무효화 회귀**

- [ ] 건물 A의 이름을 바꾼 뒤 **같은 세션에서** 건물 B 상세를 열어 프리뷰 툴팁에 **새 이름**이 뜬다
- [ ] 건물 A를 삭제한 뒤 시설 지도(`/admin/buildings/new` 또는 시설 추가 지도)에서 A가 사라진다

- [ ] **Step 4: 건물 상세 — 내비·삭제 버튼**

- [ ] 섹션 내비 바가 없다
- [ ] 이름을 수정한 채로 두면 헤더에 `저장하지 않은 변경 1개`가 뜨고, 저장하면 사라진다
- [ ] 삭제 버튼이 두 열 아래 가운데에, 흰 카드 배경 없이 놓인다
- [ ] 390px 폭에서 헤더가 깨지지 않는다

- [ ] **Step 5: 건물 관리 — 요약과 필터**

- [ ] 요약 카드 6개에 `—`가 아닌 **실제 숫자**가 뜬다
- [ ] 390px 폭에서 건물명과 메타 줄의 왼쪽 끝이 맞는다
- [ ] 경고 카드 5개를 각각 눌러 **목록 개수가 카드 숫자와 일치**한다 — 뷰를 도입한 이유이므로 가장 중요한 검증이다
- [ ] `번역 필요`는 두 숫자 중 **건물 쪽**과 목록 개수가 일치한다
- [ ] 필터를 켠 채 검색어를 넣으면 AND로 걸린다
- [ ] 필터를 끄면 원래 목록으로 돌아온다
- [ ] `초기화` 버튼이 필터만 켠 상태에서도 나타나고, 누르면 필터가 풀린다
- [ ] 3페이지를 보던 중 필터를 켜면 1페이지로 돌아간다
- [ ] 키보드(Tab + Enter/Space)만으로 카드를 눌러 필터를 켜고 끌 수 있고, 눌린 카드가 시각적으로 구분된다
- [ ] 경고 숫자가 **0인 카드**를 눌러도 목록이 빈 상태로 정상 표시된다. 네트워크 탭 요청 URL에 **`id=in.()`이 나가지 않는다**

- [ ] **Step 6: 건물 관리 — 실패 경로**

DevTools Network에서 요청을 차단해 확인한다.

- [ ] RPC(`rpc/get_admin_building_summary`)만 실패시켰을 때 화면에 **오류 원문이 아니라** `요약을 불러오지 못했어요`가 뜬다 (원문은 콘솔에만)
- [ ] **RPC가 아닌** 전체/삭제 건물 count만 실패시켰을 때도 요약 영역이 실패 상태가 된다. `총 0개 · 삭제됨 0개`가 정상처럼 뜨면 안 된다
- [ ] `admin_building_flags` 조회만 실패시켰을 때 `결과 없음`이 아니라 오류로 표시되고 재시도 수단이 있다
- [ ] 브라우저 콘솔에 **DOM 중첩 경고가 없다**

- [ ] **Step 7: DB — 숫자 불변 확인**

마이그레이션 적용 **전후**로 같은 값을 확인한다. 적용 전 값을 미리 기록해 둔다.

```sql
select stale_update_count, translation_needed_count
from public.get_admin_building_summary();
```

Expected: `stale_update_count`와 `translation_needed_count`가 **적용 전과 같다.** 뷰로 옮기면서 조건식이 바뀌지 않았다는 증거다. 다르면 `current_date - 365`가 `interval '1 year'`로 바뀌지 않았는지 확인한다.

- [ ] **Step 8: 결과 기록**

검증에서 나온 문제는 해당 태스크로 되돌아가 고친다. 모두 통과하면 브랜치를 정리한다 (superpowers:finishing-a-development-branch).

---

## 이번 범위 밖 (스펙 명시)

- `PolygonEditor`의 편집 기능 자체
- 프리뷰·편집기의 뷰포트를 `fitBounds`로 개선하는 것 (두 화면을 함께 바꿔야 하므로 별건)
- 주변 건물 조회를 bounds 기반으로 좁히는 것 (건물 수가 수백 개가 될 때)
- 목록 필터를 여러 조건 동시 적용으로 확장하는 것
- `README.md`의 RLS 서술 정정 (선재 문제)

## 후속 과제 (스펙 명시 — 이번에 만들지 않는다)

- E2E mock에 `admin_building_flags` 뷰와 `in.(...)` 필터 추가
- Point geometry 처리 정책 (지하철역 3건 — 프리뷰가 폴리곤 없는 지도로 뜬다)
- `buildings`·`building_facilities`의 SELECT RLS 정책이 마이그레이션에 없음
- `schema_migrations` 대조로는 못 잡는 스키마 드리프트 (뷰·함수·grant 존재 SQL smoke check)
- `AdminBuildingSummary` 수기 인터페이스를 생성 타입 별칭으로 교체
- 필터 연타 시 응답 경합 (요청 세대·abort 없음)
