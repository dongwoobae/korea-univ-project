# 계단 표시 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 경사도 선이 끊긴 자리(계단)를 공개 지도에 회색 점선으로 그리고, 관리자가 OSM 계단 후보를 확정하거나 손으로 그려 넣게 한다.

**Architecture:** `slope_segments`에 `kind`(`slope`·`stairs`)·`osm_way_id`·`note`를 더하고, 계단 행은 좌표만 담는다. 읽기 경로마다 `kind`로 먼저 나눈다. OSM 계단은 스크립트로 받은 스냅숏 파일(`public/osm-stairs.geojson`)에서 후보로 띄우고, 확정·손 그리기는 기존 편집 지도(`SlopeRouteMap`)를 `kind="stairs"`로 재사용한다.

**Tech Stack:** Next.js 16.2.4 App Router, React 19, Supabase(PostgREST·RLS·pgTAP), Leaflet + react-leaflet 5 + geoman 2.19.3, vitest(node 환경, DOM 없음), Playwright(`e2e/support/mockBackend.ts` 목).

**Spec:** [`docs/specs/2026-11-06-stairs-layer-design.md`](../specs/2026-11-06-stairs-layer-design.md) — 계획은 설계를 근거로 한다. 실행자는 둘 다 읽는다.

## Global Constraints

- 이름은 `계단`. 화면 어디에도 "통행 불가 경로"·"경사 없는 경로"를 쓰지 않는다(설계 2장).
- 계단 선 색 `#78716C`, 점선 `dashArray: "0 14"` + `lineCap: "round"`, 공개 지도 굵기 5, 외곽선도 같은 점선 무늬(설계 7.1).
- 끝 잇기 반경 10m, 계단 끝 꼭짓점을 경사로 끝점으로 **바꾼다**(덧붙이지 않는다). 경사로 행은 건드리지 않는다(설계 6.3).
- 문구: 범례 툴팁 `계단` + `휠체어로 지나갈 수 없어요`, 칩 `전체 · 경사로 · 계단`, 목록 머리 `경사로와 계단 · 총 {n}개`, 계단 행 요약 `계단 · {길이}m · {수정일}`, 동시 확정 `이미 확정된 계단이에요`, 후보 확정 버튼 `계단으로 확정`, 후보 토글 `OSM 계단 후보`, 손 그리기 `＋ 계단 그리기`.
- 단 수는 받지 않는다(설계 2.3).
- 주석은 기본으로 쓰지 않는다. 쓰면 WHY·외부 제약·위험만, 날짜만 붙이고 리뷰·점검 과정을 적지 않는다. 다른 파일의 줄 번호·개수·상수값을 주석에 적지 않는다(이름으로 가리킨다). 커밋에 AI `Co-Authored-By`를 붙이지 않는다.
- 설계 문서의 대체 표시(머리 배너와 표)는 **그 절의 코드를 바꾸는 커밋**에서 단다.
- `AGENTS.md`: 라우트 핸들러를 고치기 전 `node_modules/next/dist/docs/`의 해당 가이드를 읽는다.
- `main`에 병합되면 마이그레이션이 운영 DB에 바로 적용된다(`docs/database-migrations.md`). 병합은 사용자 승인 뒤에만.
- 이 저장소에서 `gh workflow run`을 쓰지 않는다(운영 마이그레이션 잡이 같이 돈다). 검증은 PR CI(`pull_request` 트리거).
- 커밋 메시지는 저장소 형식(`feat: …다`, 시험 먼저면 `test: … 시험을 먼저 둔다`).

---

## 파일 구조

| 파일                                                                                                                                     | 책임                                                                  | Task     |
| ---------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | -------- |
| `supabase/migrations/20261106000000_add_slope_segment_kind.sql` (새)                                                                     | 세 컬럼·제약·고유 인덱스                                              | 1        |
| `supabase/tests/slope_segment_kind.test.sql` (새)                                                                                        | 제약 pgTAP                                                            | 1        |
| `supabase/database.types.ts`                                                                                                             | 세 컬럼 타입                                                          | 1        |
| `src/types/domain.ts`                                                                                                                    | `StairsPoints`                                                        | 1        |
| `src/lib/stairs.ts` (새)                                                                                                                 | 계단 읽기·길이·검증·끝 잇기·후보 읽기·선 스타일                       | 2        |
| `src/lib/slopeRoute.ts`                                                                                                                  | `isCoordinate` 내보내기                                               | 2        |
| `src/lib/slopeDraft.ts`                                                                                                                  | `verticesEqual` 내보내기                                              | 2        |
| `src/lib/osmStairs.ts` (새)                                                                                                              | Overpass 응답 → 스냅숏(순수, `@/` 경로 없음 — Node 스크립트도 불러서) | 3        |
| `src/scripts/fetchOsmStairs.ts` (새), `package.json`                                                                                     | 스냅숏 받기                                                           | 3        |
| `public/osm-stairs.geojson` (새)                                                                                                         | 스냅숏                                                                | 3        |
| `src/app/api/slopes/route.ts`                                                                                                            | select에 `kind`·`note`                                                | 4        |
| `src/components/map/SlopeLayer.tsx`                                                                                                      | 계단 선·누르기 선·팝업, 순서                                          | 4        |
| `src/components/map/SlopeBandsLegend.tsx`, `slope-bands-legend.css`, `SlopeLegend.tsx`, `map-ui.css`, `admin-ui.css`(모달 미리보기 규칙) | 범례 계단 칸                                                          | 5        |
| `src/lib/slopeWorkspace.ts`                                                                                                              | 목록 항목 합 타입, 계단 요약, 칩, 요약 줄, 끝점, 확정된 OSM 번호      | 6        |
| `src/components/admin/slopes/SlopeListRow.tsx`, `SlopeWorkspaceMap.tsx`, `SlopeViewPanel.tsx`                                            | 종류별 그리기                                                         | 6        |
| `src/components/admin/slopes/StairsViewPanel.tsx` (새)                                                                                   | 계단 보기                                                             | 6        |
| `src/components/admin/workspace/WorkspaceListPanel.tsx`                                                                                  | 두 번째 추가 버튼, 점선 범례 견본                                     | 6        |
| `src/app/admin/dashboard/slopes/page.tsx`                                                                                                | 칩·머리 문구·종류별 패널, 이후 편집·후보 연결                         | 6·7·8    |
| `src/lib/workspaceUrl.ts`                                                                                                                | `new-stairs`·`candidate` 상태                                         | 7        |
| `src/components/slope/types.ts`                                                                                                          | `SlopeEditDraft.kind`, `StairsEditDraft`                              | 7        |
| `src/components/slope/useStairsDraft.ts` (새)                                                                                            | 계단 초안                                                             | 7        |
| `src/components/admin/slopes/StairsEditPanel.tsx` (새)                                                                                   | 계단 편집·후보 확정 패널                                              | 7        |
| `src/components/slope/SlopeRouteMap.tsx`                                                                                                 | `kind` 분기(편집 옵션·미리보기·다른 경로의 계단)                      | 7        |
| `src/components/admin/workspace/DetailPanel.tsx`                                                                                         | 저장 버튼 문구                                                        | 7        |
| `src/lib/slopeSave.ts`                                                                                                                   | `saveStairs`(`23505` → duplicate)                                     | 7        |
| `src/components/admin/workspace/useWorkspaceSelection.ts`                                                                                | 옵션 타입                                                             | 7        |
| `src/lib/activityLabels.ts`                                                                                                              | 이름표·`kind` 값                                                      | 9        |
| `e2e/support/mockBackend.ts`                                                                                                             | 세 컬럼 기본값, `23505`, 스냅숏 응답                                  | 4·7·8    |
| `docs/future-development/accessible-routing.md`, 설계 문서들                                                                             | 설계 8장, 대체 표시, 12장 결과                                        | 5·6·7·10 |

---

## Task 0: 작업 공간 준비

**Files:** 없음(로컬 설정만)

- [ ] **Step 1: 워크트리 확인**

이미 있다: `C:/Users/servi/projects/korea-univ-project/.claude/worktrees/stairs-layer`, 브랜치 `feat/stairs-layer`(설계 커밋 `92e849e`, 이 계획 커밋이 그 위).

```bash
cd C:/Users/servi/projects/korea-univ-project/.claude/worktrees/stairs-layer
git status --short --branch
```

Expected: `## feat/stairs-layer...origin/feat/stairs-layer`, 변경 없음.

- [ ] **Step 2: 메인 체크아웃의 node_modules를 연결한다**

C 드라이브 여유가 적다(2026-11-06 5.4G). `npm ci`를 하지 않고 메인 체크아웃의 `node_modules`를 junction으로 쓴다. 두 `package-lock.json`이 같을 때만이다.

```bash
sha1sum package-lock.json ../../../package-lock.json
cmd //c "mklink /J node_modules ..\\..\\..\\node_modules"
git check-ignore node_modules
```

Expected: 두 해시가 같다, `Junction created`, `node_modules`(무시됨). 해시가 다르면 멈추고 사용자에게 묻는다.

- [ ] **Step 3: 기준선**

```bash
npx vitest run
npx tsc --noEmit
```

Expected: 둘 다 통과. 실패하면 이 작업과 무관한 기존 실패이므로 멈추고 알린다.

- [ ] **Step 4: draft PR을 연다** — CI가 `pull_request`에서만 돈다.

```bash
gh pr create --draft --base main --head feat/stairs-layer \
  --title "경사도 선이 끊긴 자리에 계단을 그린다" \
  --body "설계: docs/specs/2026-11-06-stairs-layer-design.md · 계획: docs/plans/2026-11-06-stairs-layer.md

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

---

## Task 1: DB — 세 컬럼과 제약

**Files:**

- Create: `supabase/migrations/20261106000000_add_slope_segment_kind.sql`
- Create: `supabase/tests/slope_segment_kind.test.sql`
- Modify: `supabase/database.types.ts` (`slope_segments` Row·Insert·Update)
- Modify: `src/types/domain.ts`

**Interfaces:**

- Produces: `SlopeSegment`(= `Tables["slope_segments"]["Row"]`)에 `kind: string`, `note: string | null`, `osm_way_id: number | null`. `StairsPoints` 타입.

- [ ] **Step 1: pgTAP 시험을 먼저 쓴다**

`supabase/tests/slope_segment_kind.test.sql`:

```sql
-- 설계: docs/specs/2026-11-06-stairs-layer-design.md 4.1
begin;
select plan(6);

insert into public.slope_segments (name, segments) values ('경사로 기본값', '[]');
select is(
  (select kind from public.slope_segments where name = '경사로 기본값'),
  'slope'::text,
  '종류를 주지 않으면 경사로다');

select throws_ok(
  $$insert into public.slope_segments (name, segments, kind) values ('엘리베이터', '[]', 'elevator')$$,
  '23514', null, '경사로·계단 밖의 종류는 거부한다');

select throws_ok(
  $$insert into public.slope_segments (name, segments, osm_way_id) values ('OSM 경사로', '[]', 1)$$,
  '23514', null, '경사로에는 OSM 번호를 넣지 못한다');

insert into public.slope_segments (name, segments, kind, osm_way_id)
values ('계단 1', '[]', 'stairs', 394382780);
select throws_ok(
  $$insert into public.slope_segments (name, segments, kind, osm_way_id) values ('계단 2', '[]', 'stairs', 394382780)$$,
  '23505', null, '같은 OSM 계단은 한 번만 확정한다');

insert into public.slope_segments (name, segments, kind)
values ('손 계단 1', '[]', 'stairs'), ('손 계단 2', '[]', 'stairs');
select is(
  (select count(*) from public.slope_segments where kind = 'stairs' and osm_way_id is null),
  2::bigint,
  'OSM 번호가 없는 계단은 여럿일 수 있다');

select is(
  (select note from public.slope_segments where name = '계단 1'),
  null::text,
  '설명은 비어도 된다');

select * from finish();
rollback;
```

- [ ] **Step 2: 마이그레이션을 쓴다**

`supabase/migrations/20261106000000_add_slope_segment_kind.sql`:

```sql
-- 설계: docs/specs/2026-11-06-stairs-layer-design.md 4.1
alter table public.slope_segments
  add column kind text not null default 'slope',
  add column osm_way_id bigint,
  add column note text;

alter table public.slope_segments
  add constraint slope_segments_kind_check
    check (kind in ('slope', 'stairs')),
  add constraint slope_segments_osm_way_id_stairs_only
    check (osm_way_id is null or kind = 'stairs');

create unique index slope_segments_osm_way_id_key
  on public.slope_segments (osm_way_id)
  where osm_way_id is not null;
```

- [ ] **Step 3: 생성 타입을 손으로 맞춘다** — `supabase/database.types.ts`의 `slope_segments`.

```ts
      slope_segments: {
        Row: {
          created_at: string | null;
          gpx_file: string | null;
          id: string;
          kind: string;
          name: string;
          note: string | null;
          osm_way_id: number | null;
          segments: Json;
          updated_at: string;
        };
        Insert: {
          created_at?: string | null;
          gpx_file?: string | null;
          id?: string;
          kind?: string;
          name: string;
          note?: string | null;
          osm_way_id?: number | null;
          segments: Json;
          updated_at?: string;
        };
        Update: {
          created_at?: string | null;
          gpx_file?: string | null;
          id?: string;
          kind?: string;
          name?: string;
          note?: string | null;
          osm_way_id?: number | null;
          segments?: Json;
          updated_at?: string;
        };
        Relationships: [];
      };
```

- [ ] **Step 4: `StairsPoints`를 더한다** — `src/types/domain.ts`의 `SlopeRoutePoints` 아래.

```ts
/** kind = 'stairs' 행의 segments. 경사·거리를 싣지 않는다 */
export type StairsPoints = [
  SlopeRouteStart,
  SlopeRouteStart,
  ...SlopeRouteStart[],
];
```

- [ ] **Step 5: 확인**

```bash
npx tsc --noEmit
npx prettier --check supabase/database.types.ts src/types/domain.ts
```

Expected: 통과. pgTAP은 로컬에 Docker가 없으면 PR CI의 `DB test`로 본다.

- [ ] **Step 6: 커밋하고 push**

```bash
git add supabase/migrations/20261106000000_add_slope_segment_kind.sql supabase/tests/slope_segment_kind.test.sql supabase/database.types.ts src/types/domain.ts
git commit -m "feat: 경사도 경로에 종류(경사로·계단)·OSM 번호·설명 칸을 둔다"
git push
gh run list --branch feat/stairs-layer --limit 1
```

Expected: CI의 `DB test`·`Migration safety`·`Typecheck` 통과.

---

## Task 2: `src/lib/stairs.ts` — 계단 순수 로직

**Files:**

- Create: `src/lib/stairs.ts`
- Create: `src/lib/stairs.test.ts`
- Modify: `src/lib/slopeRoute.ts` (`function isCoordinate` → `export function isCoordinate`)
- Modify: `src/lib/slopeDraft.ts` (`function verticesEqual` → `export function verticesEqual`)

**Interfaces:**

- Consumes: `haversine`, `buildSegments`, `isCoordinate`, `type Vertex` (`slopeRoute.ts`), `slopeCasingStyle` (`slopeBands.ts`), `verticesEqual` (`slopeDraft.ts`), `StairsPoints` (Task 1).
- Produces:
  - 상수 `STAIRS_LINE_COLOR = "#78716C"`, `STAIRS_DASH = "0 14"`, `STAIRS_JOIN_RADIUS_M = 10`, `STAIRS_LINE_CLASS = "ku-stairs-line"`, `STAIRS_HIT_CLASS = "ku-stairs-hit"`, `OSM_STAIRS_SNAPSHOT_URL = "/osm-stairs.geojson"`
  - `stairsLineStyle(weight: number, opacity?: number)`, `stairsCasingStyle(weight: number, darkMap: boolean, fade?: number)`, `stairsHitStyle()`
  - `readStairsPoints(raw: unknown): StairsPoints | null`
  - `polylineLength(vertices: Vertex[]): number` (0.1m 반올림)
  - `validateStairs(name: string, vertices: Vertex[]): string[]`
  - `type StairsEnd = "start" | "end"`, `interface RouteEndpoint { key: string; routeName: string; point: Vertex }`, `interface StairsJoin { end: StairsEnd; endpoint: RouteEndpoint; distance: number }`
  - `suggestStairsJoins(vertices: Vertex[], endpoints: RouteEndpoint[], radius?: number): StairsJoin[]`
  - `applyStairsJoins(vertices: Vertex[], joins: StairsJoin[], enabled: Record<StairsEnd, boolean>): Vertex[]`
  - `interface StairsCandidate { osmWayId: number; name: string | null; vertices: Vertex[] }`, `readStairsSnapshot(raw: unknown): StairsCandidate[] | null`, `availableCandidates(candidates: StairsCandidate[], confirmed: ReadonlySet<number>): StairsCandidate[]`
  - `interface StairsDraftValues { name: string; note: string; vertices: Vertex[] }`, `stairsDraftDirty(current: StairsDraftValues, initial: StairsDraftValues): boolean`

- [ ] **Step 1: 실패하는 시험을 쓴다** — `src/lib/stairs.test.ts`

```ts
import { describe, expect, it } from "vitest";
import {
  applyStairsJoins,
  availableCandidates,
  polylineLength,
  readStairsPoints,
  readStairsSnapshot,
  stairsCasingStyle,
  stairsDraftDirty,
  stairsLineStyle,
  suggestStairsJoins,
  validateStairs,
  type RouteEndpoint,
} from "./stairs";

// 위도 0.00001도는 약 1.11m다(slopeRoute.test.ts의 기준과 같다)
const S = { lat: 37.589, lng: 127.032 };
const E = { lat: 37.58908, lng: 127.032 };

function endpoint(key: string, lat: number, lng = 127.032): RouteEndpoint {
  return { key, routeName: key, point: { lat, lng } };
}

describe("readStairsPoints", () => {
  it("두 점 미만이나 좌표가 아닌 원소는 형식 오류다", () => {
    expect(readStairsPoints([S])).toBeNull();
    expect(readStairsPoints([S, { lat: "37.5", lng: 127 }])).toBeNull();
    expect(readStairsPoints("nope")).toBeNull();
  });

  it("좌표 밖의 키는 버리고 좌표만 돌려준다", () => {
    expect(readStairsPoints([S, { ...E, slope: 3, distance: 8.9 }])).toEqual([
      S,
      E,
    ]);
  });
});

describe("polylineLength", () => {
  it("꼭짓점 사이 거리의 합을 0.1m로 반올림한다", () => {
    expect(polylineLength([S, { lat: 37.59, lng: 127.032 }])).toBe(111.2);
    expect(polylineLength([S])).toBe(0);
  });
});

describe("validateStairs", () => {
  it("이름·두 점·길이 0 구간을 본다", () => {
    expect(validateStairs("", [S, E])).toEqual(["계단 이름을 입력해주세요"]);
    expect(validateStairs("계단", [S])).toEqual(["지도에 계단을 그려주세요"]);
    expect(validateStairs("계단", [S, S])).toEqual([
      "길이가 0m인 구간이 있어요. 같은 자리를 두 번 찍지 말아주세요",
    ]);
    expect(validateStairs("계단", [S, E])).toEqual([]);
  });
});

describe("suggestStairsJoins", () => {
  it("10m 안의 가장 가까운 경사로 끝점을 고른다", () => {
    const joins = suggestStairsJoins(
      [S, E],
      [endpoint("near", 37.58897), endpoint("nearer", 37.58898)],
    );
    expect(joins).toEqual([
      {
        end: "start",
        endpoint: endpoint("nearer", 37.58898),
        distance: 2.2,
      },
    ]);
  });

  it("10m 밖의 끝점은 고르지 않는다", () => {
    expect(suggestStairsJoins([S, E], [endpoint("far", 37.5889)])).toEqual([]);
  });

  it("두 끝이 같은 끝점을 고르면 가까운 끝만 잇고, 다른 끝은 다음 끝점을 고른다", () => {
    const shared = endpoint("shared", 37.58903);
    const next = endpoint("next", 37.58916);
    expect(suggestStairsJoins([S, E], [shared, next])).toEqual([
      { end: "start", endpoint: shared, distance: 3.3 },
      { end: "end", endpoint: next, distance: 8.9 },
    ]);
  });

  it("이미 끝점에 붙은 끝은 제안하지 않고, 다른 끝도 그 끝점을 가져가지 않는다", () => {
    expect(
      suggestStairsJoins(
        [S, { lat: 37.58905, lng: 127.032 }],
        [endpoint("on", S.lat)],
      ),
    ).toEqual([]);
  });
});

describe("applyStairsJoins", () => {
  it("켠 끝만 끝점 좌표로 바꾼다", () => {
    const joins = suggestStairsJoins(
      [S, E],
      [endpoint("a", 37.58897), endpoint("b", 37.58911)],
    );
    expect(joins).toHaveLength(2);
    expect(
      applyStairsJoins([S, E], joins, { start: true, end: false }),
    ).toEqual([{ lat: 37.58897, lng: 127.032 }, E]);
  });
});

describe("readStairsSnapshot", () => {
  const feature = (
    osmWayId: unknown,
    coordinates: unknown,
    name: unknown = null,
  ) => ({
    type: "Feature",
    properties: { osmWayId, name },
    geometry: { type: "LineString", coordinates },
  });

  it("GeoJSON [lng, lat]를 꼭짓점으로 바꾸고, 빈 이름은 null이다", () => {
    expect(
      readStairsSnapshot({
        type: "FeatureCollection",
        features: [
          feature(
            7,
            [
              [127.032, 37.589],
              [127.0321, 37.5891],
            ],
            " ",
          ),
        ],
      }),
    ).toEqual([
      {
        osmWayId: 7,
        name: null,
        vertices: [
          { lat: 37.589, lng: 127.032 },
          { lat: 37.5891, lng: 127.0321 },
        ],
      },
    ]);
  });

  it("FeatureCollection이 아니면 null, 틀린 계단 하나는 빼고 나머지를 쓴다", () => {
    expect(readStairsSnapshot({ features: [] })).toBeNull();
    expect(
      readStairsSnapshot({
        type: "FeatureCollection",
        features: [
          feature(-1, [
            [127, 37],
            [127.1, 37.1],
          ]),
          feature(8, [[127, 37]]),
          feature(
            9,
            [
              [127, 37],
              [127.1, 37.1],
            ],
            "본관 계단",
          ),
        ],
      })?.map((candidate) => candidate.osmWayId),
    ).toEqual([9]);
  });
});

describe("availableCandidates", () => {
  it("확정된 OSM 번호를 뺀다", () => {
    const candidates = [
      { osmWayId: 1, name: null, vertices: [S, E] },
      { osmWayId: 2, name: null, vertices: [S, E] },
    ];
    expect(
      availableCandidates(candidates, new Set([1])).map((c) => c.osmWayId),
    ).toEqual([2]);
  });
});

describe("stairsDraftDirty", () => {
  const initial = { name: "계단", note: "", vertices: [S, E] };
  it("앞뒤 공백은 보지 않고, 값이 같으면 새 배열이어도 깨끗하다", () => {
    expect(
      stairsDraftDirty(
        { name: " 계단 ", note: "", vertices: [{ ...S }, { ...E }] },
        initial,
      ),
    ).toBe(false);
    expect(stairsDraftDirty({ ...initial, note: "우회" }, initial)).toBe(true);
  });
});

describe("선 스타일", () => {
  it("선과 외곽선이 같은 점선 무늬다", () => {
    expect(stairsLineStyle(5)).toMatchObject({
      color: "#78716C",
      weight: 5,
      dashArray: "0 14",
      lineCap: "round",
    });
    expect(stairsCasingStyle(5, false)).toMatchObject({
      weight: 8,
      dashArray: "0 14",
      lineCap: "round",
    });
  });
});
```

거리 기대값의 근거(시험에 주석으로 쓰지 않는다): 위도 0.00001도 ≈ 1.112m. `nearer` 0.00002 → 2.2, `shared` 0.00003 → 3.3, `next`는 끝 E에서 0.00008 → 8.9, `far` 0.0001 → 11.1, `on`의 다른 끝은 0.00005 → 5.6, `b`는 E에서 0.00003 → 3.3.

- [ ] **Step 2: 실패를 확인한다**

```bash
npx vitest run src/lib/stairs.test.ts
```

Expected: FAIL — `Failed to resolve import "./stairs"`.

- [ ] **Step 3: 시험 커밋**

```bash
git add src/lib/stairs.test.ts
git commit -m "test: 계단 읽기·끝 잇기·후보 읽기 시험을 먼저 둔다"
```

- [ ] **Step 4: 내보내기 두 개** — `src/lib/slopeRoute.ts`의 `function isCoordinate(`를 `export function isCoordinate(`로, `src/lib/slopeDraft.ts`의 `function verticesEqual(`를 `export function verticesEqual(`로 바꾼다.

- [ ] **Step 5: 구현한다** — `src/lib/stairs.ts`

```ts
import { slopeCasingStyle } from "@/lib/slopeBands";
import { verticesEqual } from "@/lib/slopeDraft";
import {
  buildSegments,
  haversine,
  isCoordinate,
  type Vertex,
} from "@/lib/slopeRoute";
import type { StairsPoints } from "@/types/domain";

export const STAIRS_LINE_COLOR = "#78716C";
// 길이 0 대시에 둥근 끝을 줘 점으로 그린다. 외곽선(선 굵기 + 3)의 점끼리 붙지 않을 간격이다(설계 7.1)
export const STAIRS_DASH = "0 14";
export const STAIRS_JOIN_RADIUS_M = 10;
export const STAIRS_LINE_CLASS = "ku-stairs-line";
export const STAIRS_HIT_CLASS = "ku-stairs-hit";
export const OSM_STAIRS_SNAPSHOT_URL = "/osm-stairs.geojson";

// 점선은 점 위만 눌린다. 누르기는 보이지 않는 굵은 선이 받는다
const HIT_WEIGHT = 16;
const JOINED_EPSILON_M = 0.01;

export function stairsLineStyle(weight: number, opacity = 1) {
  return {
    color: STAIRS_LINE_COLOR,
    weight,
    opacity,
    dashArray: STAIRS_DASH,
    lineCap: "round" as const,
  };
}

export function stairsCasingStyle(weight: number, darkMap: boolean, fade = 1) {
  return {
    ...slopeCasingStyle(weight, darkMap, fade),
    dashArray: STAIRS_DASH,
    lineCap: "round" as const,
  };
}

export function stairsHitStyle() {
  return { color: STAIRS_LINE_COLOR, weight: HIT_WEIGHT, opacity: 0 };
}

export function readStairsPoints(raw: unknown): StairsPoints | null {
  if (!Array.isArray(raw) || raw.length < 2) return null;
  if (!raw.every(isCoordinate)) return null;
  return raw.map(({ lat, lng }) => ({ lat, lng })) as StairsPoints;
}

export function polylineLength(vertices: Vertex[]): number {
  let total = 0;
  for (let i = 1; i < vertices.length; i++) {
    total += haversine(
      vertices[i - 1].lat,
      vertices[i - 1].lng,
      vertices[i].lat,
      vertices[i].lng,
    );
  }
  return Math.round(total * 10) / 10;
}

export function validateStairs(name: string, vertices: Vertex[]): string[] {
  const errors: string[] = [];
  if (!name.trim()) errors.push("계단 이름을 입력해주세요");
  if (vertices.length < 2) errors.push("지도에 계단을 그려주세요");
  if (buildSegments(vertices).some((segment) => segment.distance === 0)) {
    errors.push("길이가 0m인 구간이 있어요. 같은 자리를 두 번 찍지 말아주세요");
  }
  return errors;
}

export type StairsEnd = "start" | "end";

export interface RouteEndpoint {
  /** `{경로 id}:start` 또는 `{경로 id}:end` */
  key: string;
  routeName: string;
  point: Vertex;
}

export interface StairsJoin {
  end: StairsEnd;
  endpoint: RouteEndpoint;
  /** 0.1m 반올림 */
  distance: number;
}

interface Ranked {
  endpoint: RouteEndpoint;
  distance: number;
}

function rankEndpoints(
  point: Vertex,
  endpoints: RouteEndpoint[],
  radius: number,
): Ranked[] {
  return endpoints
    .map((endpoint) => ({
      endpoint,
      distance: haversine(
        point.lat,
        point.lng,
        endpoint.point.lat,
        endpoint.point.lng,
      ),
    }))
    .filter(({ distance }) => distance <= radius)
    .sort((a, b) => a.distance - b.distance);
}

/** 설계 6.3. 이미 끝점에 붙은 끝은 제안하지 않는다 — 기존 계단을 열면 토글이 처음에 보이지 않는다 */
export function suggestStairsJoins(
  vertices: Vertex[],
  endpoints: RouteEndpoint[],
  radius = STAIRS_JOIN_RADIUS_M,
): StairsJoin[] {
  if (vertices.length < 2) return [];
  const start = rankEndpoints(vertices[0], endpoints, radius);
  const end = rankEndpoints(vertices[vertices.length - 1], endpoints, radius);
  let startPick: Ranked | undefined = start[0];
  let endPick: Ranked | undefined = end[0];
  if (startPick && endPick && startPick.endpoint.key === endPick.endpoint.key) {
    if (startPick.distance <= endPick.distance) endPick = end[1];
    else startPick = start[1];
  }
  const joins: StairsJoin[] = [];
  const picks: [StairsEnd, Ranked | undefined][] = [
    ["start", startPick],
    ["end", endPick],
  ];
  for (const [which, pick] of picks) {
    if (!pick || pick.distance < JOINED_EPSILON_M) continue;
    joins.push({
      end: which,
      endpoint: pick.endpoint,
      distance: Math.round(pick.distance * 10) / 10,
    });
  }
  return joins;
}

export function applyStairsJoins(
  vertices: Vertex[],
  joins: StairsJoin[],
  enabled: Record<StairsEnd, boolean>,
): Vertex[] {
  const next = vertices.map(({ lat, lng }) => ({ lat, lng }));
  for (const join of joins) {
    if (!enabled[join.end]) continue;
    const { lat, lng } = join.endpoint.point;
    next[join.end === "start" ? 0 : next.length - 1] = { lat, lng };
  }
  return next;
}

export interface StairsCandidate {
  osmWayId: number;
  name: string | null;
  vertices: Vertex[];
}

interface SnapshotFeature {
  properties?: { osmWayId?: unknown; name?: unknown };
  geometry?: { type?: unknown; coordinates?: unknown };
}

function isLngLat(value: unknown): value is [number, number] {
  return (
    Array.isArray(value) &&
    value.length >= 2 &&
    typeof value[0] === "number" &&
    Number.isFinite(value[0]) &&
    typeof value[1] === "number" &&
    Number.isFinite(value[1])
  );
}

/** 파일이 깨졌으면 null. 형식이 틀린 계단 하나는 빼고 나머지를 쓴다 */
export function readStairsSnapshot(raw: unknown): StairsCandidate[] | null {
  if (typeof raw !== "object" || raw === null) return null;
  const { type, features } = raw as { type?: unknown; features?: unknown };
  if (type !== "FeatureCollection" || !Array.isArray(features)) return null;
  const candidates: StairsCandidate[] = [];
  for (const feature of features as (SnapshotFeature | null)[]) {
    const id = feature?.properties?.osmWayId;
    const name = feature?.properties?.name;
    const coordinates = feature?.geometry?.coordinates;
    if (feature?.geometry?.type !== "LineString") continue;
    if (typeof id !== "number" || !Number.isSafeInteger(id) || id <= 0)
      continue;
    if (
      !Array.isArray(coordinates) ||
      coordinates.length < 2 ||
      !coordinates.every(isLngLat)
    )
      continue;
    candidates.push({
      osmWayId: id,
      name: typeof name === "string" && name.trim() ? name : null,
      vertices: coordinates.map(([lng, lat]) => ({ lat, lng })),
    });
  }
  return candidates;
}

export function availableCandidates(
  candidates: StairsCandidate[],
  confirmed: ReadonlySet<number>,
): StairsCandidate[] {
  return candidates.filter((candidate) => !confirmed.has(candidate.osmWayId));
}

export interface StairsDraftValues {
  name: string;
  note: string;
  vertices: Vertex[];
}

/** 이름·설명은 저장할 때 트림하므로 앞뒤 공백은 보지 않는다 */
export function stairsDraftDirty(
  current: StairsDraftValues,
  initial: StairsDraftValues,
): boolean {
  return (
    current.name.trim() !== initial.name.trim() ||
    current.note.trim() !== initial.note.trim() ||
    !verticesEqual(current.vertices, initial.vertices)
  );
}
```

- [ ] **Step 6: 통과를 확인한다**

```bash
npx vitest run src/lib/stairs.test.ts src/lib/slopeRoute.test.ts src/lib/slopeDraft.test.ts
npx tsc --noEmit
npx eslint src/lib/stairs.ts src/lib/stairs.test.ts
npx prettier --write src/lib/stairs.ts src/lib/stairs.test.ts
```

Expected: PASS. 거리 기대값이 0.1 어긋나면 `haversine`의 반올림 경계다 — 시험 좌표를 바꾸지 말고 계산값을 `node -e`로 찍어 기대값을 맞춘다.

- [ ] **Step 7: 커밋**

```bash
git add src/lib/stairs.ts src/lib/stairs.test.ts src/lib/slopeRoute.ts src/lib/slopeDraft.ts
git commit -m "feat: 계단 좌표 읽기·길이·끝 잇기 제안·OSM 후보 읽기를 둔다"
```

---

## Task 3: OSM 계단 스냅숏

**Files:**

- Create: `src/lib/osmStairs.ts`
- Create: `src/lib/osmStairs.test.ts`
- Create: `src/scripts/fetchOsmStairs.ts`
- Modify: `package.json` (`scripts`)
- Create: `public/osm-stairs.geojson` (스크립트 산출물)

**Interfaces:**

- Produces: `buildStairsSnapshot(overpass: unknown, campuses: unknown, fetchedAt: string): StairsSnapshot`(깨진 입력이면 throw), `campusBoundingBox(campuses: unknown)`, `overpassStairsQuery(box)`, `pointInRing(lng, lat, ring)`. 파일 형식은 Task 2의 `readStairsSnapshot`이 읽는 형식(설계 5.3)이다.

- [ ] **Step 1: 실패하는 시험** — `src/lib/osmStairs.test.ts`

```ts
import { describe, expect, it } from "vitest";
import {
  buildStairsSnapshot,
  campusBoundingBox,
  overpassStairsQuery,
  pointInRing,
} from "./osmStairs";

const SQUARE: [number, number][] = [
  [127.0, 37.0],
  [127.1, 37.0],
  [127.1, 37.1],
  [127.0, 37.1],
  [127.0, 37.0],
];

const CAMPUSES = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: { campus: "시험" },
      geometry: { type: "Polygon", coordinates: [SQUARE] },
    },
  ],
};

function way(
  id: number,
  points: [number, number][],
  tags: Record<string, string> = { highway: "steps" },
) {
  return {
    type: "way",
    id,
    tags,
    geometry: points.map(([lon, lat]) => ({ lat, lon })),
  };
}

describe("pointInRing", () => {
  it("다각형 안팎을 가른다", () => {
    expect(pointInRing(127.05, 37.05, SQUARE)).toBe(true);
    expect(pointInRing(127.2, 37.05, SQUARE)).toBe(false);
  });
});

describe("campusBoundingBox", () => {
  it("모든 캠퍼스 꼭짓점의 경계다", () => {
    expect(campusBoundingBox(CAMPUSES)).toEqual({
      south: 37.0,
      west: 127.0,
      north: 37.1,
      east: 127.1,
    });
  });
});

describe("overpassStairsQuery", () => {
  it("경계 안의 계단 way를 좌표와 함께 묻는다", () => {
    expect(
      overpassStairsQuery({ south: 37, west: 127, north: 37.1, east: 127.1 }),
    ).toBe(
      '[out:json][timeout:60];way["highway"="steps"](37,127,37.1,127.1);out tags geom;',
    );
  });
});

describe("buildStairsSnapshot", () => {
  const overpass = {
    elements: [
      way(
        30,
        [
          [127.05, 37.05],
          [127.06, 37.06],
        ],
        { highway: "steps", name: "본관 계단" },
      ),
      way(10, [
        [127.09, 37.05],
        [127.2, 37.05],
      ]),
      way(20, [
        [127.3, 37.3],
        [127.4, 37.4],
      ]),
      way(
        40,
        [
          [127.05, 37.05],
          [127.06, 37.06],
        ],
        { highway: "footway" },
      ),
      way(50, [[127.05, 37.05]]),
    ],
  };

  it("캠퍼스에 꼭짓점이 하나라도 걸친 계단만, 번호순으로 담는다", () => {
    const snapshot = buildStairsSnapshot(
      overpass,
      CAMPUSES,
      "2026-11-06T00:00:00Z",
    );
    expect(snapshot).toMatchObject({
      type: "FeatureCollection",
      attribution: "© OpenStreetMap contributors",
      license: "ODbL-1.0",
      fetchedAt: "2026-11-06T00:00:00Z",
    });
    expect(snapshot.features.map((feature) => feature.properties)).toEqual([
      { osmWayId: 10, name: null },
      { osmWayId: 30, name: "본관 계단" },
    ]);
    expect(snapshot.features[1].geometry).toEqual({
      type: "LineString",
      coordinates: [
        [127.05, 37.05],
        [127.06, 37.06],
      ],
    });
  });

  it("깨진 응답이나 빈 캠퍼스는 던진다 — 스크립트가 파일을 덮지 않는다", () => {
    expect(() => buildStairsSnapshot({}, CAMPUSES, "t")).toThrow();
    expect(() =>
      buildStairsSnapshot(
        overpass,
        { type: "FeatureCollection", features: [] },
        "t",
      ),
    ).toThrow();
  });
});
```

- [ ] **Step 2: 실패 확인·커밋**

```bash
npx vitest run src/lib/osmStairs.test.ts
git add src/lib/osmStairs.test.ts
git commit -m "test: Overpass 응답을 계단 스냅숏으로 바꾸는 시험을 먼저 둔다"
```

Expected: FAIL — 모듈 없음.

- [ ] **Step 3: 구현** — `src/lib/osmStairs.ts`

```ts
// fetchOsmStairs.ts가 Node로 바로 불러 @/ 경로와 런타임 import를 쓰지 않는다
type Ring = [number, number][];

export interface StairsFeature {
  type: "Feature";
  properties: { osmWayId: number; name: string | null };
  geometry: { type: "LineString"; coordinates: [number, number][] };
}

export interface StairsSnapshot {
  type: "FeatureCollection";
  attribution: string;
  license: string;
  fetchedAt: string;
  features: StairsFeature[];
}

export interface BoundingBox {
  south: number;
  west: number;
  north: number;
  east: number;
}

interface CampusFeature {
  geometry?: { type?: unknown; coordinates?: unknown };
}

interface OverpassElement {
  type?: unknown;
  id?: unknown;
  tags?: Record<string, unknown>;
  geometry?: { lat?: unknown; lon?: unknown }[];
}

function readCampusRings(raw: unknown): Ring[] {
  const features = (raw as { features?: unknown } | null)?.features;
  if (!Array.isArray(features))
    throw new Error("캠퍼스 경계 파일 형식이 아니에요");
  const rings: Ring[] = [];
  for (const feature of features as (CampusFeature | null)[]) {
    const geometry = feature?.geometry;
    if (!Array.isArray(geometry?.coordinates)) continue;
    if (geometry.type === "Polygon")
      rings.push((geometry.coordinates as Ring[])[0]);
    if (geometry.type === "MultiPolygon")
      for (const polygon of geometry.coordinates as Ring[][])
        rings.push(polygon[0]);
  }
  if (rings.length === 0) throw new Error("캠퍼스 경계가 비었어요");
  return rings;
}

export function pointInRing(lng: number, lat: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (
      yi > lat !== yj > lat &&
      lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi
    )
      inside = !inside;
  }
  return inside;
}

export function campusBoundingBox(campuses: unknown): BoundingBox {
  const points = readCampusRings(campuses).flat();
  return {
    south: Math.min(...points.map(([, lat]) => lat)),
    west: Math.min(...points.map(([lng]) => lng)),
    north: Math.max(...points.map(([, lat]) => lat)),
    east: Math.max(...points.map(([lng]) => lng)),
  };
}

export function overpassStairsQuery(box: BoundingBox): string {
  return `[out:json][timeout:60];way["highway"="steps"](${box.south},${box.west},${box.north},${box.east});out tags geom;`;
}

/** 설계 5.2·5.3 */
export function buildStairsSnapshot(
  overpass: unknown,
  campuses: unknown,
  fetchedAt: string,
): StairsSnapshot {
  const elements = (overpass as { elements?: unknown } | null)?.elements;
  if (!Array.isArray(elements))
    throw new Error("Overpass 응답 형식이 아니에요");
  const rings = readCampusRings(campuses);
  const features: StairsFeature[] = [];
  for (const element of elements as (OverpassElement | null)[]) {
    if (element?.type !== "way" || element.tags?.highway !== "steps") continue;
    if (typeof element.id !== "number" || !Array.isArray(element.geometry))
      continue;
    const coordinates = element.geometry.flatMap((point) =>
      typeof point?.lat === "number" && typeof point?.lon === "number"
        ? [[point.lon, point.lat] as [number, number]]
        : [],
    );
    if (
      coordinates.length < 2 ||
      coordinates.length !== element.geometry.length
    )
      continue;
    const inCampus = coordinates.some(([lng, lat]) =>
      rings.some((ring) => pointInRing(lng, lat, ring)),
    );
    if (!inCampus) continue;
    const name = element.tags?.name;
    features.push({
      type: "Feature",
      properties: {
        osmWayId: element.id,
        name: typeof name === "string" && name.trim() ? name : null,
      },
      geometry: { type: "LineString", coordinates },
    });
  }
  // 갱신 diff를 읽을 수 있게 번호순으로 둔다(설계 5.3)
  features.sort((a, b) => a.properties.osmWayId - b.properties.osmWayId);
  return {
    type: "FeatureCollection",
    attribution: "© OpenStreetMap contributors",
    license: "ODbL-1.0",
    fetchedAt,
    features,
  };
}
```

- [ ] **Step 4: 통과 확인**

```bash
npx vitest run src/lib/osmStairs.test.ts
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 5: 스크립트** — `src/scripts/fetchOsmStairs.ts`

```ts
import { readFile, writeFile } from "node:fs/promises";
import {
  buildStairsSnapshot,
  campusBoundingBox,
  overpassStairsQuery,
} from "../lib/osmStairs.ts";

// syncBuildings.ts와 같은 서버
const OVERPASS_URL = "https://overpass.kumi.systems/api/interpreter";
const CAMPUS_FILE = "public/campus-boundaries.geojson";
const SNAPSHOT_FILE = "public/osm-stairs.geojson";

async function main() {
  const campuses: unknown = JSON.parse(await readFile(CAMPUS_FILE, "utf8"));
  const response = await fetch(OVERPASS_URL, {
    method: "POST",
    body: new URLSearchParams({
      data: overpassStairsQuery(campusBoundingBox(campuses)),
    }),
    headers: { "User-Agent": "KU-BarrierFree-Map/1.0" },
  });
  if (!response.ok) throw new Error(`Overpass ${response.status}`);
  // Overpass는 오류를 200 + XML로도 준다. json()이 던지면 파일을 덮지 않는다
  const snapshot = buildStairsSnapshot(
    await response.json(),
    campuses,
    new Date().toISOString(),
  );
  await writeFile(SNAPSHOT_FILE, `${JSON.stringify(snapshot, null, 2)}\n`);
  console.log(`계단 ${snapshot.features.length}개를 ${SNAPSHOT_FILE}에 썼어요`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
```

`package.json`의 `scripts`에 `"sync-buildings"` 다음 줄로:

```json
    "fetch-osm-stairs": "node src/scripts/fetchOsmStairs.ts"
```

- [ ] **Step 6: 스냅숏을 받는다**

```bash
npm run fetch-osm-stairs
node -e "const s=JSON.parse(require('fs').readFileSync('public/osm-stairs.geojson','utf8'));console.log(s.features.length,s.fetchedAt)"
```

Expected: `계단 N개를 public/osm-stairs.geojson에 썼어요`. N은 2026-11-06 실측(71)과 가깝다 — OSM이 그사이 바뀌었을 수 있어 같을 필요는 없다.

- `kumi` 서버가 응답하지 않으면 `OVERPASS_URL`을 `https://overpass-api.de/api/interpreter`로 바꾸고 주석을 `// syncBuildings.ts의 서버가 2026-11-xx 응답하지 않아 공개 기본 서버`로 고친다(설계 12장).
- Node가 `.ts`의 ESM 문법을 거부하면(`SyntaxError: Cannot use import statement`) 스크립트 파일 이름을 `fetchOsmStairs.mts`로 바꾸고 `package.json`도 맞춘다.

- [ ] **Step 7: 확인·커밋**

```bash
npx eslint src/lib/osmStairs.ts src/lib/osmStairs.test.ts src/scripts/fetchOsmStairs.ts
npx prettier --write src/lib/osmStairs.ts src/lib/osmStairs.test.ts src/scripts/fetchOsmStairs.ts package.json
git add src/lib/osmStairs.ts src/scripts/fetchOsmStairs.ts package.json public/osm-stairs.geojson
git commit -m "feat: 캠퍼스 안 OSM 계단을 스냅숏 파일로 받는 스크립트를 둔다"
```

---

## Task 4: 공개 지도 — 계단 선과 팝업

**Files:**

- Modify: `src/app/api/slopes/route.ts`
- Modify: `src/components/map/SlopeLayer.tsx`
- Modify: `e2e/support/mockBackend.ts` (시드 두 행, `/api/slopes`, `slope_segments` POST 기본값)
- Test: `e2e/public-map.spec.ts`

**Interfaces:**

- Consumes: Task 2의 `readStairsPoints`, `stairsLineStyle`, `stairsCasingStyle`, `stairsHitStyle`, `STAIRS_LINE_CLASS`, `STAIRS_HIT_CLASS`.

- [ ] **Step 1: Next 가이드를 읽는다** — `node_modules/next/dist/docs/` 아래 route handler 문서(`route.md`). select 문자열만 바꾸므로 지금 파일의 `GET`·`NextResponse.json` 그대로가 맞는지만 본다.

- [ ] **Step 2: 목을 맞춘다** — `e2e/support/mockBackend.ts`

1. `createState`의 `slopes` 시드 두 행(`id: 1`, `id: 2`)에 `kind: "slope", note: null, osm_way_id: null,`을 `gpx_file: null,` 다음에 더한다.
2. `/api/slopes` 응답을 바꾼다:

```ts
// 실제 라우트는 id·name·kind·note·segments만 select한다. 넓게 돌려주면 공개 지도가
// 응답에 없는 필드에 기대도 e2e가 초록으로 남는다.
if (path === "/api/slopes")
  return json(
    route,
    state.slopes.map((row) => ({
      id: row.id,
      name: row.name,
      kind: row.kind ?? "slope",
      note: row.note ?? null,
      segments: row.segments,
    })),
  );
```

3. 일반 쓰기 흉내의 `if (method === "POST") {` 블록에서 `created`를 만든 뒤, `if (name === "building_facilities")` 앞에:

```ts
if (name === "slope_segments") {
  created.kind ??= "slope";
  created.note ??= null;
  created.osm_way_id ??= null;
  // 운영의 slope_segments_osm_way_id_key와 같은 고유 인덱스(설계 4.1·6.7)
  if (
    created.osm_way_id !== null &&
    target.some((row) => row.osm_way_id === created.osm_way_id)
  )
    return json(
      route,
      {
        code: "23505",
        message:
          'duplicate key value violates unique constraint "slope_segments_osm_way_id_key"',
        details: null,
        hint: null,
      },
      409,
    );
}
```

- [ ] **Step 3: 실패하는 e2e** — `e2e/public-map.spec.ts`, `test.describe("공개 지도 — 경사도 범례", …)` 앞에 새 describe:

```ts
test.describe("공개 지도 — 계단", () => {
  function stairsRow() {
    return {
      id: 50,
      name: "중앙광장 계단",
      gpx_file: null,
      kind: "stairs",
      note: "우회: 본관 엘리베이터",
      osm_way_id: 394382780,
      segments: [
        { lat: 37.5893, lng: 127.0325 },
        { lat: 37.5895, lng: 127.0328 },
      ],
      created_at: "2026-11-06T00:00:00Z",
      updated_at: "2026-11-06T00:00:00Z",
    };
  }

  test("계단은 회색 점선과 같은 무늬의 외곽선으로 경사로 선 아래에 그리고, 누르면 계단 팝업이 뜬다", async ({
    page,
  }) => {
    const state = await installMockBackend(page);
    state.slopes.push(stairsRow());
    await page.goto("/");
    await setSlope(page, true);

    const line = page.locator(".leaflet-overlay-pane path.ku-stairs-line");
    await expect(line).toHaveCount(1);
    await expect(line).toHaveAttribute("stroke", "#78716C");
    await expect(line).toHaveAttribute("stroke-dasharray", "0 14");
    await expect(line).toHaveAttribute("stroke-linecap", "round");
    await expect(line).not.toHaveClass(/leaflet-interactive/);
    await expect(
      page.locator(
        ".leaflet-overlay-pane path.ku-slope-casing[stroke-dasharray='0 14']",
      ),
    ).toHaveCount(1);

    const order = await page
      .locator(".leaflet-overlay-pane path")
      .evaluateAll((paths) =>
        paths.map((path) =>
          path.classList.contains("ku-slope-casing")
            ? "casing"
            : path.classList.contains("ku-stairs-line")
              ? "stairs"
              : path.getAttribute("stroke") === "#8BC34A"
                ? "slope"
                : "other",
        ),
      );
    expect(order.lastIndexOf("casing")).toBeLessThan(order.indexOf("stairs"));
    expect(order.indexOf("stairs")).toBeLessThan(order.indexOf("slope"));

    await page.locator(".leaflet-overlay-pane path.ku-stairs-hit").click();
    const popup = page.locator(".leaflet-popup-content");
    await expect(popup.locator("strong")).toHaveText("계단");
    await expect(popup).toContainText("중앙광장 계단");
    await expect(popup).toContainText("우회: 본관 엘리베이터");

    await setSlope(page, false);
    await expect(line).toHaveCount(0);
  });
});
```

시드 경로 1(3°)은 기본 첫 구간 색 `#8BC34A`다(같은 파일의 "저장된 범례가 있으면 …" 시험과 같은 근거).

- [ ] **Step 4: 시험 커밋**

```bash
npx prettier --write e2e/public-map.spec.ts e2e/support/mockBackend.ts
git add e2e/public-map.spec.ts e2e/support/mockBackend.ts
git commit -m "test: 공개 지도가 계단을 회색 점선으로 그리고 팝업을 띄우는 시험을 먼저 둔다"
```

- [ ] **Step 5: API select** — `src/app/api/slopes/route.ts`

```ts
    .select("id, name, kind, note, segments");
```

- [ ] **Step 6: `SlopeLayer`** — `src/components/map/SlopeLayer.tsx` 전체를 바꾼다.

```tsx
"use client";
import { scaledFontSize } from "@/lib/fontScale";
import { Polyline, Popup } from "react-leaflet";
import {
  SLOPE_CASING_CLASS,
  slopeBandFromDeg,
  slopeCasingStyle,
} from "@/lib/slopeBands";
import { useSlopeBands } from "@/lib/slopeBandsStore";
import { degToPercent, formatDeg, formatPercent } from "@/lib/slopeScale";
import { readRoutePoints } from "@/lib/slopeRoute";
import {
  STAIRS_HIT_CLASS,
  STAIRS_LINE_CLASS,
  readStairsPoints,
  stairsCasingStyle,
  stairsHitStyle,
  stairsLineStyle,
} from "@/lib/stairs";
import type { SlopeSegment } from "@/types/domain";

// /api/slopes는 id·name·kind·note·segments만 select한다. Row 전체를 받는 것처럼 쓰면
// 런타임에 없는 필드를 있는 것으로 보증하게 된다.
type SlopeRoute = Pick<
  SlopeSegment,
  "id" | "name" | "kind" | "note" | "segments"
>;

const LINE_WEIGHT = 5;
const LINE_OPACITY = 0.85;

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
  const stairsCasing = stairsCasingStyle(LINE_WEIGHT, darkMap);
  const stairs = slopes.flatMap((route) => {
    if (route.kind !== "stairs") return [];
    const points = readStairsPoints(route.segments);
    if (!points) return [];
    return [
      {
        key: `stairs-${route.id}`,
        route,
        positions: points.map(({ lat, lng }) => [lat, lng] as [number, number]),
      },
    ];
  });
  const lines = slopes.flatMap((route) => {
    if (route.kind === "stairs") return [];
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
  // 계단은 경사로보다 먼저 붙여, 이어 붙인 계단 끝이 경사로 끝 밑으로 들어간다(설계 2026-11-06 7.2).
  // className·interactive는 최상위 prop이다 — react-leaflet은 pathOptions를 선을 붙인 뒤 setStyle로 넘기고,
  // Leaflet은 둘을 선을 만들 때만 읽는다
  return (
    <>
      {stairs.map(({ key, positions }) => (
        <Polyline
          key={`casing-${key}`}
          positions={positions}
          className={SLOPE_CASING_CLASS}
          interactive={false}
          pathOptions={stairsCasing}
        />
      ))}
      {lines.map(({ key, positions }) => (
        <Polyline
          key={`casing-${key}`}
          positions={positions}
          className={SLOPE_CASING_CLASS}
          interactive={false}
          pathOptions={casing}
        />
      ))}
      {stairs.map(({ key, positions }) => (
        <Polyline
          key={key}
          positions={positions}
          className={STAIRS_LINE_CLASS}
          interactive={false}
          pathOptions={stairsLineStyle(LINE_WEIGHT, LINE_OPACITY)}
        />
      ))}
      {stairs.map(({ key, route, positions }) => (
        <Polyline
          key={`hit-${key}`}
          positions={positions}
          className={STAIRS_HIT_CLASS}
          pathOptions={stairsHitStyle()}
        >
          <Popup>
            <div style={{ fontSize: scaledFontSize(13), lineHeight: 1.6 }}>
              <strong style={{ display: "block", marginBottom: 2 }}>
                계단
              </strong>
              <div>{route.name}</div>
              {route.note?.trim() && (
                <div
                  style={{
                    color: "var(--ku-text-3)",
                    fontSize: scaledFontSize(11),
                  }}
                >
                  {route.note}
                </div>
              )}
            </div>
          </Popup>
        </Polyline>
      ))}
      {lines.map(({ key, route, point, positions }) => (
        <Polyline
          key={key}
          positions={positions}
          pathOptions={{
            color: slopeBandFromDeg(bands, point.slope).color,
            weight: LINE_WEIGHT,
            opacity: LINE_OPACITY,
          }}
        >
          <Popup>
            <div style={{ fontSize: scaledFontSize(13), lineHeight: 1.6 }}>
              <div style={{ fontWeight: 600, marginBottom: 2 }}>
                {route.name}
              </div>
              <div>
                경사 <strong>{formatPercent(degToPercent(point.slope))}</strong>{" "}
                ({formatDeg(point.slope)})
              </div>
              <div
                style={{
                  color: "var(--ku-text-3)",
                  fontSize: scaledFontSize(11),
                }}
              >
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

`useMapData.ts`는 `SlopeSegment[]`로 받아 넘기므로 바꾸지 않는다.

- [ ] **Step 7: 확인**

```bash
npx tsc --noEmit
npx eslint src/components/map/SlopeLayer.tsx src/app/api/slopes/route.ts
npx playwright test e2e/public-map.spec.ts -g "계단"
```

로컬에서 Playwright를 못 돌리면(브라우저 미설치·디스크) push 뒤 PR CI로 본다. Expected: 새 시험 PASS, `public-map.spec.ts`의 기존 시험도 그대로 PASS(기본 시드에는 계단이 없다).

- [ ] **Step 8: 설계 12장 결과를 적는다** — `docs/specs/2026-11-06-stairs-layer-design.md` 12장 첫 항목 아래에 날짜 줄(이 저장소 설계 문서의 "구현 시 확인할 것" 기록 형식):

```markdown
- 2026-11-xx — 점선은 점 위만 눌려, 공개 지도는 보이지 않는 굵은 선(`stairsHitStyle`)이 누르기와 팝업을 받고 보이는 점선은 `interactive: false`다. {브라우저별 점 모양 확인 결과}
```

`{…}`는 실제로 본 결과로 채운다. 못 봤으면 "확인 전"이라고 적는다.

- [ ] **Step 9: 커밋·push**

```bash
npx prettier --write src/components/map/SlopeLayer.tsx docs/specs/2026-11-06-stairs-layer-design.md
git add src/app/api/slopes/route.ts src/components/map/SlopeLayer.tsx docs/specs/2026-11-06-stairs-layer-design.md
git commit -m "feat: 공개 지도가 계단을 회색 점선으로 경사로 선 아래에 그리고 계단 팝업을 띄운다"
git push
```

---

## Task 5: 범례 계단 칸

**Files:**

- Modify: `src/components/map/SlopeBandsLegend.tsx`
- Modify: `src/components/map/slope-bands-legend.css`
- Modify: `src/components/map/SlopeLegend.tsx`
- Modify: `src/components/map/map-ui.css` (모바일 `.ku-slope-legend .ku-slope-bands` 규칙 옆)
- Modify: `src/app/admin/admin-ui.css` (`.ku-bands-modal-preview .ku-slope-bands` 옆)
- Modify: `docs/specs/2026-10-19-slope-bands-design.md` (대체 표시)
- Test: `e2e/public-map.spec.ts`, `e2e/font-scale.spec.ts`, `e2e/mobile-fixes.spec.ts`, `e2e/admin-slopes-workspace.spec.ts`

**Interfaces:**

- Produces: `SlopeBandsLegend`의 `showStairs?: boolean`(기본 false). 구간 칸은 `.ku-slope-bands-bar` 안, 계단 칸은 `.ku-slope-bands-stairs`.

- [ ] **Step 1: 깨질 단언을 먼저 고치고 새 단언을 쓴다**

다시 grep으로 센다:

```bash
rg -n 'legend.getByRole\("button"\)\)\.toHaveCount' e2e
```

나온 줄마다 `legend.getByRole("button")`를 `legend.locator(".ku-slope-bands-bar").getByRole("button")`로 바꾼다(2026-11-06 기준 `public-map.spec.ts` 4곳, `font-scale.spec.ts` 1곳, `mobile-fixes.spec.ts` 1곳). 숫자는 그대로다.

`e2e/public-map.spec.ts`의 `"공개 지도 — 경사도 범례"` describe 안 끝에 새 시험:

```ts
test("막대 옆 계단 칸은 툴팁으로 계단을 알린다", async ({ page }) => {
  await installMockBackend(page);
  await page.goto("/");
  await setSlope(page, true);
  const legend = legendOf(page);
  const stairs = legend.getByRole("button", { name: "계단", exact: true });
  await expect(stairs).toBeVisible();
  await expect(
    legend.locator(".ku-slope-bands-bar").getByRole("button", { name: "계단" }),
  ).toHaveCount(0);

  await stairs.click();
  const tooltip = legend.getByRole("tooltip");
  await expect(tooltip.locator("strong")).toHaveText("계단");
  await expect(tooltip).toContainText("휠체어로 지나갈 수 없어요");
  await expect(stairs).toHaveAttribute(
    "aria-describedby",
    (await tooltip.getAttribute("id")) ?? "",
  );
  await page.keyboard.press("Escape");
  await expect(tooltip).toHaveCount(0);
});
```

`e2e/admin-slopes-workspace.spec.ts`의 "미리보기 툴팁을 누르면 툴팁만 닫히고…" 시험의 `const percent = …` 다음 줄에:

```ts
await expect(
  dialog
    .getByRole("group", { name: "경사도 범례" })
    .getByRole("button", { name: "계단", exact: true }),
).toHaveCount(0);
```

- [ ] **Step 2: 시험 커밋**

```bash
npx prettier --write e2e/public-map.spec.ts e2e/font-scale.spec.ts e2e/mobile-fixes.spec.ts e2e/admin-slopes-workspace.spec.ts
git add e2e/public-map.spec.ts e2e/font-scale.spec.ts e2e/mobile-fixes.spec.ts e2e/admin-slopes-workspace.spec.ts
git commit -m "test: 범례 막대 옆 계단 칸 시험을 먼저 두고, 칸 개수는 구간 막대 안에서만 센다"
```

- [ ] **Step 3: 컴포넌트** — `src/components/map/SlopeBandsLegend.tsx` 전체:

```tsx
"use client";

import {
  useEffect,
  useEffectEvent,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { slopeBandRangeLabel, type SlopeBand } from "@/lib/slopeBands";
import { formatSlopeInput, percentToDeg } from "@/lib/slopeScale";
import { STAIRS_LINE_COLOR } from "@/lib/stairs";
import "./slope-bands-legend.css";

type TooltipSource = "hover" | "pin" | "focus";
/** 구간 칸은 번호, 계단 칸은 "stairs" */
type LegendCell = number | "stairs";

interface SlopeBandsLegendProps {
  bands: readonly SlopeBand[];
  /** 모달처럼 위가 스크롤 상자에 잘리는 곳에서는 아래 */
  tooltipPlacement?: "above" | "below";
  /** 모달이 툴팁이 열린 동안 자기 Esc 닫기를 끈다(설계 6.1) */
  onTooltipOpenChange?: (open: boolean) => void;
  /** 막대 옆 계단 칸. 범례 편집 모달은 구간을 고치는 곳이라 끈다(설계 2026-11-06 7.4) */
  showStairs?: boolean;
}

/** 공개 지도와 범례 편집 모달의 미리보기가 같이 쓴다. 저장소를 직접 읽지 않고 구간을 props로 받는다 */
export default function SlopeBandsLegend({
  bands,
  tooltipPlacement = "above",
  onTooltipOpenChange,
  showStairs = false,
}: SlopeBandsLegendProps) {
  const [tooltip, setTooltip] = useState<{
    cell: LegendCell;
    source: TooltipSource;
  } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const tooltipId = useId();
  const openCell: LegendCell | null =
    tooltip === null
      ? null
      : tooltip.cell === "stairs"
        ? showStairs
          ? "stairs"
          : null
        : tooltip.cell < bands.length
          ? tooltip.cell
          : null;
  const isOpen = openCell !== null;
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
      // 나중에 열린 글자 크기 칸이 이미 받은 Esc다(FontScaleControl)
      if (event.key !== "Escape" || event.defaultPrevented) return;
      // 열린 지도 메뉴 패널이 같은 Esc에 닫히지 않게 한다(docs/specs/2026-10-27-map-menu-design.md 5.4)
      event.preventDefault();
      setTooltip(null);
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      notifyOpenChange(false);
    };
  }, [isOpen]);

  function cellProps(cell: LegendCell) {
    return {
      "aria-describedby": openCell === cell ? tooltipId : undefined,
      onPointerEnter: (event: ReactPointerEvent<HTMLButtonElement>) => {
        if (event.pointerType !== "mouse") return;
        setTooltip((current) =>
          current?.cell === cell && current.source === "pin"
            ? current
            : { cell, source: "hover" },
        );
      },
      onPointerLeave: (event: ReactPointerEvent<HTMLButtonElement>) => {
        if (event.pointerType !== "mouse") return;
        setTooltip((current) =>
          current?.cell === cell && current.source === "hover" ? null : current,
        );
      },
      onFocus: () =>
        setTooltip((current) =>
          current?.cell === cell ? current : { cell, source: "focus" },
        ),
      onBlur: () =>
        setTooltip((current) =>
          current?.cell === cell && current.source === "focus" ? null : current,
        ),
      onClick: () =>
        setTooltip((current) =>
          current?.cell === cell && current.source === "pin"
            ? null
            : { cell, source: "pin" },
        ),
    };
  }

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
      <div className="ku-slope-bands-scale">
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
              {...cellProps(index)}
            />
          ))}
        </div>
        <div className="ku-slope-bands-ticks" aria-hidden="true">
          {ticks("deg")}
        </div>
      </div>
      {showStairs && (
        <button
          type="button"
          className="ku-slope-bands-stairs"
          aria-label="계단"
          {...cellProps("stairs")}
        >
          <svg width="24" height="8" viewBox="0 0 24 8" aria-hidden="true">
            <line
              x1="3"
              y1="4"
              x2="21"
              y2="4"
              stroke={STAIRS_LINE_COLOR}
              strokeWidth="5"
              strokeLinecap="round"
              strokeDasharray="0 9"
            />
          </svg>
        </button>
      )}
      {openCell !== null && (
        // 툴팁은 범례 안이라 바깥 누르기로 닫히지 않는다. 모달에서는 아래 단위 버튼을 덮어, 누르면 툴팁만 닫는다
        <div
          id={tooltipId}
          role="tooltip"
          className="ku-slope-bands-tooltip"
          onClick={() => setTooltip(null)}
        >
          {openCell === "stairs" ? (
            <>
              <strong>계단</strong>
              <span>휠체어로 지나갈 수 없어요</span>
            </>
          ) : (
            <>
              <strong>{bands[openCell].name}</strong>
              {bands[openCell].description && (
                <span>{bands[openCell].description}</span>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
```

`src/components/map/SlopeLegend.tsx`: `<SlopeBandsLegend bands={bands} />` → `<SlopeBandsLegend bands={bands} showStairs />`.

- [ ] **Step 4: CSS** — `src/components/map/slope-bands-legend.css`의 `.ku-slope-bands` 규칙을 바꾸고 두 규칙을 더한다:

```css
/* 관리자 모달 미리보기도 이 컴포넌트를 쓴다. map-ui.css는 공개 지도(Map.tsx)만 불러와 여기 둔다 */
.ku-slope-bands {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  width: max-content;
  color: var(--ku-text-2);
  font-size: 10px;
  line-height: 1.2;
}
/* 6구간 눈금 글자(예: 16.67%)가 200px에서는 칸 간격과 거의 같아 겹친다 */
.ku-slope-bands-scale {
  width: 240px;
}
.ku-slope-bands-stairs {
  display: grid;
  flex: none;
  place-items: center;
  width: 28px;
  height: 24px;
  padding: 0;
  border: 0;
  background: none;
  cursor: pointer;
}
.ku-slope-bands-stairs:focus-visible {
  outline: 2px solid var(--ku-crimson-700);
  outline-offset: 1px;
}
```

`src/components/map/map-ui.css`의 모바일 규칙 `.ku-slope-legend .ku-slope-bands { width: auto; }` 바로 아래:

```css
.ku-slope-legend .ku-slope-bands-scale {
  flex: 1;
  width: auto;
  min-width: 0;
}
```

`src/app/admin/admin-ui.css`의 `.ku-bands-modal-preview .ku-slope-bands { width: 100%; }` 바로 아래:

```css
.ku-bands-modal-preview .ku-slope-bands-scale {
  flex: 1;
  width: auto;
}
```

- [ ] **Step 5: 대체 표시** — `docs/specs/2026-10-19-slope-bands-design.md`. 먼저 머리 40줄을 읽는다. `## 1. 결정 요약` 앞의 `---` 바로 위에:

```markdown
> **2026-11-06 — 일부 대체.** 아래 절은 [`2026-11-06-stairs-layer-design.md`](./2026-11-06-stairs-layer-design.md)가 대체한다. 본문은 당시 기록으로 둔다.
>
> | 이 문서          | 당시                       | 현재                                                                             |
> | ---------------- | -------------------------- | -------------------------------------------------------------------------------- |
> | 4.2 늘 보이는 것 | 막대와 칸 사이 경계 눈금뿐 | 막대 오른쪽에 계단 점선 칸 하나(공개 지도만, 모달 미리보기는 없음) — 새 문서 7.4 |
```

- [ ] **Step 6: 확인**

```bash
npx tsc --noEmit
npx eslint src/components/map/SlopeBandsLegend.tsx src/components/map/SlopeLegend.tsx
npx prettier --write src/components/map/SlopeBandsLegend.tsx src/components/map/SlopeLegend.tsx src/components/map/slope-bands-legend.css src/components/map/map-ui.css src/app/admin/admin-ui.css docs/specs/2026-10-19-slope-bands-design.md
npx playwright test e2e/public-map.spec.ts e2e/font-scale.spec.ts e2e/mobile-fixes.spec.ts -g "범례"
```

Expected: PASS. 겹침 시험("6구간에서도 경계 눈금 글자가 겹치지 않는다", "150%에서도…", "667×375: 6구간에서도…")이 실패하면 모바일 폭에서 막대가 계단 칸만큼 좁아진 것이다 — 칸 폭(`28px`)·간격(`8px`)을 줄여 다시 보고, 그래도 겹치면 멈추고 사용자에게 알린다(배치 결정이 바뀐다).

- [ ] **Step 7: 커밋·push**

```bash
git add src/components/map/SlopeBandsLegend.tsx src/components/map/SlopeLegend.tsx src/components/map/slope-bands-legend.css src/components/map/map-ui.css src/app/admin/admin-ui.css docs/specs/2026-10-19-slope-bands-design.md
git commit -m "feat: 공개 지도 범례 막대 옆에 계단 칸을 두고 툴팁으로 알린다"
git push
```

---

## Task 6: 관리자 목록·지도·보기 — 계단 행을 종류로 나눠 읽는다

**Files:**

- Modify: `src/lib/slopeWorkspace.ts`, `src/lib/slopeWorkspace.test.ts`
- Modify: `src/components/admin/slopes/SlopeListRow.tsx`, `SlopeWorkspaceMap.tsx`, `SlopeViewPanel.tsx`
- Create: `src/components/admin/slopes/StairsViewPanel.tsx`
- Modify: `src/components/admin/workspace/WorkspaceListPanel.tsx`
- Modify: `src/app/admin/admin-ui.css`
- Modify: `src/app/admin/dashboard/slopes/page.tsx`
- Modify: `docs/specs/2026-10-19-slope-bands-design.md` (대체 표 한 줄), `docs/specs/2026-11-06-stairs-layer-design.md` (10.2)
- Test: `e2e/admin-slopes-workspace.spec.ts`

**Interfaces:**

- Consumes: Task 2 `readStairsPoints`, `polylineLength`, `stairsLineStyle`, `stairsCasingStyle`, `stairsHitStyle`, `STAIRS_LINE_COLOR`, `STAIRS_LINE_CLASS`, `type RouteEndpoint`.
- Produces (`slopeWorkspace.ts`):
  - `interface StairsSummary { vertices: Vertex[]; length: number; bounds: [[number, number], [number, number]] }`, `summarizeStairs(raw: unknown): StairsSummary | null`
  - `type SlopeListItem = { kind: "slope"; route: SlopeSegment; summary: SlopeRouteSummary | null } | { kind: "stairs"; route: SlopeSegment; summary: StairsSummary | null }`, `type SlopeRouteListItem`, `type StairsListItem`(각각 `Extract`)
  - `slopeListItem(route: SlopeSegment): SlopeListItem`
  - `type SlopeChip = "slope" | "stairs"`, `SLOPE_CHIPS`, `SLOPE_COLLECTION_POLICY: AdminCollectionPolicy<SlopeListItem, SlopeChip>`
  - `formatSlopeListMeta(item: SlopeListItem): string`
  - `slopeRouteEndpoints(items: SlopeListItem[]): RouteEndpoint[]`, `confirmedOsmWayIds(items: SlopeListItem[]): Set<number>`
  - `slopeRouteBadge(summary: object | null)`(인자 타입만 넓힘)
- Produces (`WorkspaceListPanel`): `secondaryAdd?: { label: string; mobileLabel: string; onClick: () => void }`, `WorkspaceLegendItem.dotted?: boolean`.

- [ ] **Step 1: 깨질 단언을 고치고 새 시험을 쓴다**

```bash
rg -n 'name: "목록 필터" \}\)\)\.toHaveCount\(0\)|구간별 경사를 기록한 보행 경로|name: "범례" \}\)' e2e/admin-slopes-workspace.spec.ts
```

- `목록 필터` 0개 단언(2026-11-06 기준 3곳)은 칩이 생겨 깨진다. 각 자리를 다음으로 바꾼다(데스크톱은 `list`, 모바일 두 곳은 `page` 범위 그대로):

```ts
await expect(
  list.getByRole("group", { name: "목록 필터" }).getByRole("button"),
).toHaveText([/^전체/, /^경사로/, /^계단/]);
```

- 머리 문구 `구간별 경사를 기록한 보행 경로 · 총 4개` → `경사로와 계단 · 총 4개`.
- 목록 범례 `toHaveText(["보도 기준 이내", "완화 범위", "특례 범위", "초과"])` → 끝에 `"계단"`을 더한다.

같은 파일에 픽스처와 새 describe를 더한다(`addMixedRoutes` 아래):

```ts
/** 경로 1 끝(37.5892, 127.0322)에 이어 붙은 OSM 계단과 손으로 그린 계단 */
function addStairs(state: MockState) {
  state.slopes.push(
    slopeRow({
      id: 70,
      name: "중앙광장 계단",
      kind: "stairs",
      note: "우회: 본관 엘리베이터",
      osm_way_id: 394382780,
      segments: [
        { lat: 37.5892, lng: 127.0322 },
        { lat: 37.5894, lng: 127.0324 },
      ],
      updated_at: "2026-11-06T00:00:00Z",
    }),
    slopeRow({
      id: 71,
      name: "본관 뒤 계단",
      kind: "stairs",
      note: null,
      osm_way_id: null,
      segments: [
        { lat: 37.5897, lng: 127.0331 },
        { lat: 37.5898, lng: 127.0333 },
      ],
      updated_at: "2026-11-05T00:00:00Z",
    }),
  );
}

test.describe("경사도 작업 화면 — 계단 목록·보기", () => {
  test("칩으로 경사로와 계단을 거르고, 계단 행은 계단 요약 줄만 보인다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    addStairs(state);
    await page.goto("/admin/dashboard/slopes");
    const list = listPanel(page);
    const names = list.getByTestId("admin-list-item-name");
    await expect(list.getByText("경사로와 계단 · 총 4개")).toBeVisible();

    await list.getByRole("button", { name: "계단 2개" }).click();
    await expect(names).toHaveText(["중앙광장 계단", "본관 뒤 계단"]);
    const row = listRow(page, "중앙광장 계단");
    await expect(row.locator(".ku-workspace-row-meta")).toHaveText(
      /^계단 · \d+(\.\d)?m · /,
    );
    await expect(row.locator(".ku-slope-profile")).toHaveCount(0);
    await expect(row.locator(".ku-row-badge")).toHaveCount(0);

    await list.getByRole("button", { name: "경사로 2개" }).click();
    await expect(names).toHaveText(["안암병원 정문 경사로", "정문-중앙광장"]);
  });

  test("계단은 작업 지도에 점선으로 그리고, 고르면 출처·길이·설명을 보이며 계단 편집으로 들어간다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    addStairs(state);
    await page.goto("/admin/dashboard/slopes");
    const line = page.locator("path.ku-stairs-line");
    await expect(line).toHaveCount(2);
    await expect(line.first()).toHaveAttribute("stroke-dasharray", "0 14");

    await routeLine(page, 70).click();
    await expect(page).toHaveURL(/\?id=70$/);
    const view = detailPanel(page, "중앙광장 계단");
    await expect(view).toContainText("OSM 394382780");
    await expect(view).toContainText("우회: 본관 엘리베이터");
    await listRow(page, "본관 뒤 계단").click();
    await expect(detailPanel(page, "본관 뒤 계단")).toContainText("직접 그림");
  });
});
```

`slopeRow`는 `overrides`를 펼치므로 `kind`·`note`·`osm_way_id`가 그대로 실린다. 정렬은 최근 수정순 기본값이다 — 기대 순서가 다르게 나오면 픽스처 `updated_at`을 바꾸지 말고 실제 기본 정렬을 확인해 기대값을 맞춘다.

- [ ] **Step 2: 단위 시험** — `src/lib/slopeWorkspace.test.ts`

`item()` 도우미를 `slopeListItem`으로 바꾼다:

```ts
function item(
  id: number,
  name: string,
  raw: unknown,
  extra: Record<string, unknown> = {},
): SlopeListItem {
  return slopeListItem({
    id,
    name,
    segments: raw,
    updated_at: "2026-10-01T00:00:00Z",
    ...extra,
  } as unknown as SlopeSegment);
}
```

import에 `confirmedOsmWayIds`, `formatSlopeListMeta`, `slopeListItem`, `slopeRouteEndpoints`를 더하고, 새 describe:

```ts
describe("계단 행", () => {
  const stairs = item(
    7,
    "본관 계단",
    [
      { lat: 37.58, lng: 127.02 },
      { lat: 37.581, lng: 127.02 },
    ],
    { kind: "stairs", osm_way_id: 394382780 },
  );
  const route = item(1, "평지", [
    { lat: 37.58, lng: 127.02 },
    { lat: 37.581, lng: 127.021, slope: 1, distance: 5 },
  ]);

  it("좌표만 담긴 계단은 형식 오류가 아니라 계단 요약이다", () => {
    expect(stairs.kind).toBe("stairs");
    expect(stairs.summary).toMatchObject({ length: 111.2 });
    expect(slopeRouteBadge(stairs.summary)).toBeNull();
  });

  it("칩은 종류로 센다", () => {
    const view = viewAdminCollection([route, stairs], SLOPE_COLLECTION_POLICY, {
      search: "",
      chip: "stairs",
      sort: "updated-desc",
      page: 1,
    });
    expect(view.matched.map((entry) => entry.route.name)).toEqual([
      "본관 계단",
    ]);
    expect(view.chipCounts).toMatchObject({ all: 2, slope: 1, stairs: 1 });
  });

  it("계단 요약 줄은 계단·길이·수정일이다", () => {
    expect(formatSlopeListMeta(stairs)).toBe(
      `계단 · 111.2m · ${formatAdminUpdatedAt("2026-10-01T00:00:00Z")}`,
    );
  });

  it("끝점은 경사로의 양 끝만, 확정된 OSM 번호는 계단에서만 모은다", () => {
    expect(slopeRouteEndpoints([route, stairs])).toEqual([
      { key: "1:start", routeName: "평지", point: { lat: 37.58, lng: 127.02 } },
      { key: "1:end", routeName: "평지", point: { lat: 37.581, lng: 127.021 } },
    ]);
    expect([...confirmedOsmWayIds([route, stairs])]).toEqual([394382780]);
  });
});
```

`view.chipCounts`의 실제 이름은 `adminCollection.ts`의 `AdminCollectionView`에서 확인한다(명소 페이지가 `view.chipCounts`로 쓴다).

- [ ] **Step 3: 시험 커밋**

```bash
npx prettier --write src/lib/slopeWorkspace.test.ts e2e/admin-slopes-workspace.spec.ts
git add src/lib/slopeWorkspace.test.ts e2e/admin-slopes-workspace.spec.ts
git commit -m "test: 경사도 목록이 계단 행을 종류로 나눠 칩·요약 줄·보기로 보이는 시험을 먼저 둔다"
```

- [ ] **Step 4: `slopeWorkspace.ts`**

import에 `readStairsPoints, polylineLength, type RouteEndpoint`(`@/lib/stairs`)를 더하고, `SlopeListItem`·정책·배지·메타를 바꾼다:

```ts
export interface StairsSummary {
  vertices: Vertex[];
  /** 0.1m 반올림 */
  length: number;
  bounds: [[number, number], [number, number]];
}

export function summarizeStairs(raw: unknown): StairsSummary | null {
  const points = readStairsPoints(raw);
  if (!points) return null;
  const vertices = points.map(({ lat, lng }) => ({ lat, lng }));
  const bounds = verticesBounds(vertices);
  if (!bounds) return null;
  return { vertices, length: polylineLength(vertices), bounds };
}

/** 읽는 곳마다 kind로 먼저 나눈다 — 계단 행이 readRoutePoints로 가면 형식 오류가 된다(설계 2026-11-06 4.2) */
export type SlopeListItem =
  | { kind: "slope"; route: SlopeSegment; summary: SlopeRouteSummary | null }
  | { kind: "stairs"; route: SlopeSegment; summary: StairsSummary | null };
export type SlopeRouteListItem = Extract<SlopeListItem, { kind: "slope" }>;
export type StairsListItem = Extract<SlopeListItem, { kind: "stairs" }>;

export function slopeListItem(route: SlopeSegment): SlopeListItem {
  return route.kind === "stairs"
    ? { kind: "stairs", route, summary: summarizeStairs(route.segments) }
    : { kind: "slope", route, summary: summarizeSlopeRoute(route.segments) };
}

export type SlopeChip = "slope" | "stairs";

export const SLOPE_CHIPS: { key: SlopeChip; label: string }[] = [
  { key: "slope", label: "경사로" },
  { key: "stairs", label: "계단" },
];

// 구간 색은 관리자가 고치는 값이라 칩 조건으로 두지 않는다(설계 2026-10-19 5장). 칩은 종류다(설계 2026-11-06 6.5)
export const SLOPE_COLLECTION_POLICY: AdminCollectionPolicy<
  SlopeListItem,
  SlopeChip
> = {
  // 목 백엔드는 id를 숫자로 돌려준다
  id: ({ route }) => String(route.id),
  name: ({ route }) => slopeDisplayName(route),
  updatedAt: ({ route }) => route.updated_at,
  searchText: ({ route }) => [route.name],
  chips: {
    slope: (item) => item.kind === "slope",
    stairs: (item) => item.kind === "stairs",
  },
};

/** 판정 배지는 없다. 형식 오류는 판정이 아니라 읽기 실패 표시라 남긴다(설계 2026-10-19 5장) */
export function slopeRouteBadge(
  summary: object | null,
): { label: "형식 오류"; tone: "missing" } | null {
  return summary ? null : { label: "형식 오류", tone: "missing" };
}

export function formatSlopeListMeta(item: SlopeListItem): string {
  if (item.kind === "slope")
    return formatSlopeRouteMeta(item.summary, item.route.updated_at);
  const updated = formatAdminUpdatedAt(item.route.updated_at);
  return item.summary
    ? `계단 · ${formatMeters(item.summary.length)} · ${updated}`
    : updated;
}

export function slopeRouteEndpoints(items: SlopeListItem[]): RouteEndpoint[] {
  return items.flatMap((item) => {
    if (item.kind !== "slope" || !item.summary) return [];
    const id = SLOPE_COLLECTION_POLICY.id(item);
    const routeName = slopeDisplayName(item.route);
    const { vertices } = item.summary;
    return [
      { key: `${id}:start`, routeName, point: vertices[0] },
      { key: `${id}:end`, routeName, point: vertices[vertices.length - 1] },
    ];
  });
}

export function confirmedOsmWayIds(items: SlopeListItem[]): Set<number> {
  return new Set(
    items.flatMap((item) =>
      item.kind === "stairs" && item.route.osm_way_id !== null
        ? [Number(item.route.osm_way_id)]
        : [],
    ),
  );
}
```

기존 `interface SlopeListItem { route; summary }`는 지운다.

- [ ] **Step 5: `WorkspaceListPanel`**

1. `WorkspaceLegendItem`에 `/** 계단처럼 점선 견본 */ dotted?: boolean;`.
2. props에 `/** 두 번째 추가 동작. 경사도 탭의 "＋ 계단 그리기" */ secondaryAdd?: { label: string; mobileLabel: string; onClick: () => void };`를 더하고 구조 분해에 넣는다.
3. 데스크톱 제목 줄의 추가 버튼을 감싼다:

```tsx
<div className="ku-float-panel-add">
  {secondaryAdd && (
    <button
      type="button"
      className="ku-workspace-button"
      onClick={secondaryAdd.onClick}
    >
      {secondaryAdd.label}
    </button>
  )}
  <button type="button" className="ku-workspace-primary" onClick={onAdd}>
    {addLabel}
  </button>
</div>
```

4. 모바일 `ku-bottom-sheet-head`의 `＋ 추가` 앞에:

```tsx
{
  secondaryAdd && (
    <button
      type="button"
      className="ku-workspace-button"
      onClick={secondaryAdd.onClick}
    >
      {secondaryAdd.mobileLabel}
    </button>
  );
}
```

5. 범례 견본:

```tsx
<li key={index}>
  <span
    aria-hidden="true"
    data-dotted={item.dotted || undefined}
    style={item.dotted ? { color: item.color } : { background: item.color }}
  />
  {item.label}
</li>
```

`src/app/admin/admin-ui.css`의 `.ku-float-panel-legend li span` 규칙 아래와 `.ku-float-panel-title-row` 규칙 아래에:

```css
.ku-float-panel-legend li span[data-dotted] {
  width: 14px;
  height: 4px;
  border-radius: 0;
  background: radial-gradient(circle, currentColor 1.5px, transparent 2px) 0
    50% / 5px 4px repeat-x;
}
```

```css
.ku-float-panel-add {
  display: flex;
  flex: none;
  gap: 6px;
}
```

- [ ] **Step 6: `SlopeListRow`** — 배지·막대·메타:

```tsx
import {
  formatSlopeListMeta,
  slopeDisplayName,
  slopeRouteBadge,
  type SlopeListItem,
} from "@/lib/slopeWorkspace";
```

본문에서 `const { route, summary } = item;`을 `const { route } = item;`으로, `slopeRouteBadge(summary)`를 `slopeRouteBadge(item.summary)`로, 막대 조건 `{summary && (`를 `{item.kind === "slope" && item.summary && (`로(안의 `summary.segments`는 `item.summary.segments`), 메타를 `{formatSlopeListMeta(item)}`로 바꾼다.

- [ ] **Step 7: `SlopeWorkspaceMap`**

import에 `STAIRS_LINE_CLASS, stairsCasingStyle, stairsHitStyle, stairsLineStyle`(`@/lib/stairs`)와 `type StairsSummary`를 더하고, `RouteLines` 아래에 계단 선을 둔다:

```tsx
interface StairsLinesProps {
  id: string;
  summary: StairsSummary;
  selected: boolean;
  dimmed: boolean;
  onSelect: (id: string) => void;
}

// 점선은 점 위만 눌려, 보이지 않는 굵은 선이 누르기를 받는다. 경로 선처럼 ku-slope-route-{id}는 누르는 선에만 단다
function StairsLines({
  id,
  summary,
  selected,
  dimmed,
  onSelect,
}: StairsLinesProps) {
  const weight = selected ? 7 : 5;
  const opacity = dimmed ? DIMMED_OPACITY : 1;
  const positions = summary.vertices.map(
    ({ lat, lng }) => [lat, lng] as [number, number],
  );
  return (
    <>
      <Polyline
        positions={positions}
        className={SLOPE_CASING_CLASS}
        interactive={false}
        pathOptions={stairsCasingStyle(weight, false, opacity)}
        eventHandlers={SEND_TO_BACK}
      />
      <Polyline
        positions={positions}
        className={STAIRS_LINE_CLASS}
        interactive={false}
        pathOptions={stairsLineStyle(weight, opacity)}
      />
      <Polyline
        positions={positions}
        className={`ku-slope-route-${id}`}
        pathOptions={stairsHitStyle()}
        eventHandlers={{ click: () => onSelect(id) }}
      />
    </>
  );
}
```

본문의 두 그리기 자리를 종류로 나눈다:

```tsx
      {routes.map((item) => {
        const id = SLOPE_COLLECTION_POLICY.id(item);
        if (!item.summary || id === selectedId) return null;
        return item.kind === "stairs" ? (
          <StairsLines
            key={id}
            id={id}
            summary={item.summary}
            selected={false}
            dimmed={selectedId !== null}
            onSelect={onSelect}
          />
        ) : (
          <RouteLines
            key={id}
            id={id}
            summary={item.summary}
            bands={bands}
            selected={false}
            dimmed={selectedId !== null}
            onSelect={onSelect}
          />
        );
      })}
      {selected?.kind === "stairs" && selected.summary && (
        <StairsLines
          key={`selected:${selectedId}`}
          id={SLOPE_COLLECTION_POLICY.id(selected)}
          summary={selected.summary}
          selected
          dimmed={false}
          onSelect={onSelect}
        />
      )}
      {/* 따로 된 key로 다시 붙여 SVG 맨 뒤(위)에 그린다. 흐린 선 밑에 고른 선이 깔리지 않게 한다 */}
      {selected?.kind === "slope" && selected.summary && (
```

(그 뒤 기존 고른 경로 블록은 그대로다. 그 안의 `selected.summary`는 이제 `SlopeRouteSummary`로 좁혀진다.)

- [ ] **Step 8: `SlopeViewPanel`** — `item: SlopeListItem`을 `item: SlopeRouteListItem`으로 바꾸고 import도 맞춘다. 다른 줄은 그대로다.

- [ ] **Step 9: `StairsViewPanel`** — `src/components/admin/slopes/StairsViewPanel.tsx`

```tsx
"use client";

import DetailPanel, {
  type DetailRemoveAction,
} from "@/components/admin/workspace/DetailPanel";
import { ADMIN_MOBILE_QUERY } from "@/components/admin/workspace/types";
import {
  formatMeters,
  formatSlopeListMeta,
  slopeDisplayName,
  type StairsListItem,
} from "@/lib/slopeWorkspace";
import { useMediaQuery } from "@/lib/useMediaQuery";

interface StairsViewPanelProps {
  item: StairsListItem;
  onEdit: () => void;
  onClose: () => void;
  remove?: DetailRemoveAction;
}

export default function StairsViewPanel({
  item,
  onEdit,
  onClose,
  remove,
}: StairsViewPanelProps) {
  const mobile = useMediaQuery(ADMIN_MOBILE_QUERY);
  const { route, summary } = item;
  const name = slopeDisplayName(route);
  const meta = formatSlopeListMeta(item);
  const editButton = summary && (
    <button type="button" className="ku-workspace-primary" onClick={onEdit}>
      계단 편집
    </button>
  );

  return (
    <DetailPanel
      label={name}
      header={
        <div className="ku-detail-title ku-slope-view-title">
          <div>
            <h2>{name}</h2>
            <p>{meta}</p>
          </div>
          {editButton}
        </div>
      }
      onClose={onClose}
      remove={remove}
      save={null}
    >
      {mobile && (
        <div className="ku-slope-view-mobile-head">
          <p>{meta}</p>
          {editButton}
        </div>
      )}
      {summary ? (
        <dl className="ku-stairs-facts">
          <dt>출처</dt>
          <dd>
            {route.osm_way_id === null
              ? "직접 그림"
              : `OSM ${route.osm_way_id}`}
          </dd>
          <dt>길이</dt>
          <dd>{formatMeters(summary.length)}</dd>
          <dt>설명</dt>
          <dd>{route.note?.trim() || "없음"}</dd>
        </dl>
      ) : (
        <p className="ku-slope-view-notice">
          저장 형식이 깨진 계단이라 열 수 없어요. 지우고 다시 그려주세요
        </p>
      )}
    </DetailPanel>
  );
}
```

`admin-ui.css`의 `.ku-slope-table` 규칙 근처:

```css
.ku-stairs-facts {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 6px 12px;
  margin: 0;
  font-size: 13px;
}
.ku-stairs-facts dt {
  color: var(--ku-text-3);
}
.ku-stairs-facts dd {
  margin: 0;
}
```

- [ ] **Step 10: 페이지** — `src/app/admin/dashboard/slopes/page.tsx`

1. import: `StairsViewPanel`, `type AdminChip`(`@/lib/adminCollection`), `SLOPE_CHIPS`, `slopeListItem`, `type SlopeChip`(`@/lib/slopeWorkspace`), `STAIRS_LINE_COLOR`(`@/lib/stairs`). `summarizeSlopeRoute` import는 지운다.
2. `fetchRows`의 매핑:

```ts
return (data ?? []).map(slopeListItem);
```

3. `const { view, setPage } = collection;` 아래에 칩:

```ts
const chips = [
  { key: "all", label: "전체", count: view.chipCounts.all },
  ...SLOPE_CHIPS.map((chip) => ({
    ...chip,
    count: view.chipCounts[chip.key],
  })),
];
```

4. 보기 패널을 종류로 나눈다:

```tsx
  ) : selected ? (
    selected.kind === "stairs" ? (
      <StairsViewPanel
        key={SLOPE_COLLECTION_POLICY.id(selected)}
        item={selected}
        onEdit={() =>
          requestSelection({
            mode: "edit",
            id: SLOPE_COLLECTION_POLICY.id(selected),
          })
        }
        onClose={() => requestSelection({ mode: "closed" })}
        remove={remove}
      />
    ) : (
      <SlopeViewPanel
        key={SLOPE_COLLECTION_POLICY.id(selected)}
        item={selected}
        onEdit={() =>
          requestSelection({
            mode: "edit",
            id: SLOPE_COLLECTION_POLICY.id(selected),
          })
        }
        onClose={() => requestSelection({ mode: "closed" })}
        remove={remove}
      />
    )
  ) : null;
```

5. 편집 패널은 Task 7 전까지 경사로만 연다 — `SlopeEditPanel`의 `summary` prop을 좁힌다:

```tsx
        summary={
          selected?.kind === "slope" && state.mode === "edit"
            ? selected.summary
            : null
        }
```

그리고 `owner` 계산의 편집 조건을 `(state.mode === "edit" && selected?.kind === "slope" && Boolean(selected.summary))`로 바꾼다(계단 편집은 Task 7에서 연다).

6. `WorkspaceListPanel` props:

```tsx
            caption={`경사로와 계단 · 총 ${view.total}개`}
            chips={chips}
            activeChip={collection.chip}
            onChipChange={(key) =>
              clearSelectionThen(() =>
                collection.setChip(key as AdminChip<SlopeChip>),
              )
            }
            legend={[
              ...slopeBands.bands.map((band) => ({
                label: band.name,
                color: band.color,
              })),
              { label: "계단", color: STAIRS_LINE_COLOR, dotted: true },
            ]}
```

- [ ] **Step 11: 대체 표 한 줄** — `docs/specs/2026-10-19-slope-bands-design.md`에 Task 5가 단 배너 표 끝에:

```markdown
> | 5장 목록 칩 | 칩 줄을 그리지 않는다 | `전체 · 경사로 · 계단` 칩(종류 기준) — 새 문서 6.5 |
```

그리고 `docs/specs/2026-11-06-stairs-layer-design.md` 10.2에 목록 범례 단언을 더한다(설계를 쓸 때 빠졌다):

```markdown
- 목록 범례 항목 `toHaveText(["보도 기준 이내", "완화 범위", "특례 범위", "초과"])` — 같은 파일 첫 시험. → 끝에 `계단`.
```

- [ ] **Step 12: 확인·커밋·push**

```bash
npx vitest run src/lib/slopeWorkspace.test.ts
npx tsc --noEmit
npx eslint src/lib/slopeWorkspace.ts src/components/admin/slopes src/components/admin/workspace/WorkspaceListPanel.tsx src/app/admin/dashboard/slopes/page.tsx
npx prettier --write src/lib/slopeWorkspace.ts src/components/admin/slopes src/components/admin/workspace/WorkspaceListPanel.tsx src/app/admin/dashboard/slopes/page.tsx src/app/admin/admin-ui.css docs/specs/2026-10-19-slope-bands-design.md docs/specs/2026-11-06-stairs-layer-design.md
npx playwright test e2e/admin-slopes-workspace.spec.ts
git add -A src docs/specs
git commit -m "feat: 경사도 작업 화면이 계단 행을 종류로 나눠 칩·점선·보기 패널로 보인다"
git push
```

`git add -A src docs/specs`로 넣기 전 `git status --short`로 이 Task의 파일만인지 본다.

---

## Task 7: 계단 편집 — 손 그리기와 기존 계단 고치기

**Files:**

- Modify: `src/lib/workspaceUrl.ts`, `src/lib/workspaceUrl.test.ts`
- Modify: `src/components/admin/workspace/useWorkspaceSelection.ts`
- Modify: `src/components/slope/types.ts`
- Create: `src/components/slope/useStairsDraft.ts`
- Modify: `src/components/admin/slopes/SlopeEditPanel.tsx` (초안에 `kind: "slope"`)
- Create: `src/components/admin/slopes/StairsEditPanel.tsx`
- Modify: `src/components/slope/SlopeRouteMap.tsx`
- Modify: `src/components/admin/workspace/DetailPanel.tsx`
- Modify: `src/lib/slopeSave.ts`, `src/lib/slopeSave.test.ts`
- Modify: `src/app/admin/dashboard/slopes/page.tsx`
- Modify: `src/app/admin/admin-ui.css`
- Modify: `docs/specs/2026-11-06-stairs-layer-design.md` (6.6·12장)
- Test: `e2e/admin-slopes-workspace.spec.ts`

**Interfaces:**

- Consumes: Task 2 `suggestStairsJoins`, `applyStairsJoins`, `polylineLength`, `validateStairs`, `stairsDraftDirty`, `readStairsPoints`, 선 스타일, `type RouteEndpoint`, `type StairsEnd`. Task 6 `slopeRouteEndpoints`, `SlopeListItem`.
- Produces:
  - `WorkspaceState`에 `{ mode: "new-stairs" }`, `{ mode: "candidate"; osmWayId: number }`. `readWorkspaceState(search, { allowEdit: boolean; stairs?: boolean })`.
  - `StairsEditDraft { owner: string; kind: "stairs"; preview: Vertex[]; locked: boolean; bounds: [[number, number], [number, number]] | null; onVerticesChange: (vertices: Vertex[]) => void }`, `EditDraft = SlopeEditDraft | StairsEditDraft`. `SlopeEditDraft`에 `kind: "slope"`.
  - `saveStairs(input: { routeId: string | null; loadedAt: string | null; name: string; note: string | null; osmWayId: number | null; points: StairsPoints }): Promise<StairsSaveResult>`, `StairsSaveResult = SlopeSaveResult | { ok: false; reason: "duplicate" }`.
  - `StairsEditPanel` props(아래 Step 7). Task 8이 `candidate`·`onDuplicate`를 쓴다.
  - `SlopeRouteMap`의 `kind: "slope" | "stairs"` prop.
  - `DetailPanel`의 `save.label?: string`.

- [ ] **Step 1: 실패하는 단위 시험**

`src/lib/workspaceUrl.test.ts`에:

```ts
describe("계단 상태", () => {
  const stairs = { allowEdit: true, stairs: true };

  it("new=stairs는 새 계단, osm=번호는 후보다", () => {
    expect(readWorkspaceState("?new=stairs", stairs)).toEqual({
      mode: "new-stairs",
    });
    expect(readWorkspaceState("?osm=394382780", stairs)).toEqual({
      mode: "candidate",
      osmWayId: 394382780,
    });
  });

  it("계단을 받지 않는 탭과 숫자가 아닌 osm은 닫힘이다", () => {
    expect(readWorkspaceState("?new=stairs", { allowEdit: false })).toEqual({
      mode: "closed",
    });
    expect(readWorkspaceState("?osm=abc", stairs)).toEqual({ mode: "closed" });
    expect(readWorkspaceState("?osm=0", stairs)).toEqual({ mode: "closed" });
  });

  it("쓰고 다시 읽으면 같은 상태이고, 다른 상태로 쓰면 osm을 지운다", () => {
    for (const state of [
      { mode: "new-stairs" },
      { mode: "candidate", osmWayId: 7 },
    ] as const) {
      expect(
        readWorkspaceState(writeWorkspaceState("", state), stairs),
      ).toEqual(state);
    }
    expect(writeWorkspaceState("?osm=7&tab=x", { mode: "closed" })).toBe(
      "?tab=x",
    );
  });
});
```

`src/lib/slopeSave.test.ts`에(맨 위 목 그대로 쓴다):

```ts
describe("saveStairs", () => {
  const points: StairsPoints = [
    { lat: 37.58, lng: 127.02 },
    { lat: 37.581, lng: 127.02 },
  ];

  it("새 계단은 종류·OSM 번호·설명과 좌표만 넣는다", async () => {
    single.mockResolvedValue({ data: { id: 11 }, error: null });
    const { saveStairs } = await import("./slopeSave");
    const result = await saveStairs({
      routeId: null,
      loadedAt: null,
      name: "본관 계단",
      note: null,
      osmWayId: 394382780,
      points,
    });
    expect(insert).toHaveBeenCalledWith({
      kind: "stairs",
      name: "본관 계단",
      note: null,
      osm_way_id: 394382780,
      gpx_file: null,
      segments: points,
    });
    expect(result).toEqual({ ok: true, routeId: "11", created: true });
  });

  it("같은 OSM 계단(23505)은 duplicate다", async () => {
    single.mockResolvedValue({
      data: null,
      error: { code: "23505", message: "duplicate key" },
    });
    const { saveStairs } = await import("./slopeSave");
    expect(
      await saveStairs({
        routeId: null,
        loadedAt: null,
        name: "본관 계단",
        note: null,
        osmWayId: 394382780,
        points,
      }),
    ).toEqual({ ok: false, reason: "duplicate" });
  });

  it("기존 계단은 이름·설명·좌표만 updated_at 조건으로 고친다", async () => {
    selectAfterUpdate.mockResolvedValue({ data: [{ id: 11 }], error: null });
    const { saveStairs } = await import("./slopeSave");
    const result = await saveStairs({
      routeId: "11",
      loadedAt: "2026-11-06T00:00:00Z",
      name: "본관 계단",
      note: "우회",
      osmWayId: 394382780,
      points,
    });
    expect(update).toHaveBeenCalledWith({
      name: "본관 계단",
      note: "우회",
      segments: points,
    });
    expect(eqUpdateId).toHaveBeenCalledWith("id", "11");
    expect(eqUpdatedAt).toHaveBeenCalledWith(
      "updated_at",
      "2026-11-06T00:00:00Z",
    );
    expect(result).toEqual({ ok: true, routeId: "11", created: false });
  });
});
```

import에 `StairsPoints`를 더한다(`import type { SlopeRoutePoints, StairsPoints } from "@/types/domain";`).

- [ ] **Step 2: 실패하는 e2e** — `e2e/admin-slopes-workspace.spec.ts`의 Task 6 describe 안에:

```ts
test("＋ 계단 그리기로 그린 계단은 좌표만 저장하고 보기 패널에 직접 그림으로 보인다", async ({
  page,
}) => {
  const state = await installMockBackend(page, { authenticated: true });
  await page.goto("/admin/dashboard/slopes");
  await listPanel(page).getByRole("button", { name: "＋ 계단 그리기" }).click();
  await expect(page).toHaveURL(/\?new=stairs$/);
  const panel = detailPanel(page, "새 계단");
  await expect(panel.getByRole("group", { name: "경사 단위" })).toHaveCount(0);

  await drawRoute(page, THREE_POINTS);
  await expect(
    page.locator(".leaflet-pane.slope-preview-pane path.ku-stairs-line"),
  ).toHaveCount(1);
  await panel.getByLabel("계단 이름").fill("본관 뒤 계단");
  await panel.getByLabel("설명 (선택)").fill("우회: 본관 엘리베이터");
  await panel.getByRole("button", { name: "저장" }).click();
  await expect(page.getByText("계단을 추가했어요")).toBeVisible();

  const saved = state.slopes.at(-1)!;
  expect(saved).toMatchObject({
    kind: "stairs",
    name: "본관 뒤 계단",
    note: "우회: 본관 엘리베이터",
    osm_way_id: null,
  });
  const points = saved.segments as Record<string, unknown>[];
  expect(points).toHaveLength(3);
  expect(
    points.every((point) => Object.keys(point).sort().join() === "lat,lng"),
  ).toBe(true);
  await expect(detailPanel(page, "본관 뒤 계단")).toContainText("직접 그림");
});

test("기존 계단을 고쳐 저장하면 OSM 번호는 남고 설명이 바뀐다", async ({
  page,
}) => {
  const state = await installMockBackend(page, { authenticated: true });
  addStairs(state);
  await page.goto("/admin/dashboard/slopes?id=70");
  await detailPanel(page, "중앙광장 계단")
    .getByRole("button", { name: "계단 편집" })
    .click();
  await expect(page).toHaveURL(/\?id=70&edit=1$/);
  const panel = editPanel(page, "중앙광장 계단");
  await expect(panel.getByRole("checkbox")).toHaveCount(0);
  await panel.getByLabel("설명 (선택)").fill("우회: 국제관 엘리베이터");
  await panel.getByRole("button", { name: "저장" }).click();
  await expect(page.getByText("계단을 수정했어요")).toBeVisible();
  expect(state.slopes.find((row) => row.id === 70)).toMatchObject({
    note: "우회: 국제관 엘리베이터",
    osm_way_id: 394382780,
    kind: "stairs",
  });
});
```

`addStairs`의 계단 70은 시작점이 경로 1의 끝점과 같아(이미 이어짐) 끝 잇기 체크박스가 없다(Task 2의 `suggestStairsJoins` 규칙). `THREE_POINTS`의 화면 점이 시드 경로 끝에서 10m 안에 떨어지면 체크박스가 생기고 저장 좌표가 바뀐다 — 이 시험은 좌표 키와 개수만 본다.

- [ ] **Step 3: 시험 커밋**

```bash
npx prettier --write src/lib/workspaceUrl.test.ts src/lib/slopeSave.test.ts e2e/admin-slopes-workspace.spec.ts
git add src/lib/workspaceUrl.test.ts src/lib/slopeSave.test.ts e2e/admin-slopes-workspace.spec.ts
git commit -m "test: 계단 손 그리기·고치기와 계단 주소·저장 시험을 먼저 둔다"
```

- [ ] **Step 4: `workspaceUrl.ts`**

```ts
/** 작업 화면 상태와 URL의 대응·우선순위는 docs/specs/2026-10-14-admin-map-first-redesign-design.md 3.4. 계단 두 상태는 2026-11-06 설계 6.1·6.4 */
export type WorkspaceState =
  | { mode: "closed" }
  | { mode: "view"; id: string }
  | { mode: "new" }
  | { mode: "edit"; id: string }
  | { mode: "new-stairs" }
  | { mode: "candidate"; osmWayId: number };

const OWN_KEYS = ["id", "new", "edit", "osm"] as const;

export function readWorkspaceState(
  search: string,
  options: { allowEdit: boolean; stairs?: boolean },
): WorkspaceState {
  const params = new URLSearchParams(search);
  // 옛 경사도 라우트의 리다이렉트가 원래 쿼리를 붙여 겹친 조합이 들어올 수 있다(설계 2026-10-14 6.5)
  if (params.get("new") === "1") return { mode: "new" };
  if (options.stairs) {
    if (params.get("new") === "stairs") return { mode: "new-stairs" };
    const osm = params.get("osm");
    if (osm && /^[1-9]\d*$/.test(osm))
      return { mode: "candidate", osmWayId: Number(osm) };
  }
  const id = params.get("id");
  if (!id) return { mode: "closed" };
  if (options.allowEdit && params.get("edit") === "1") {
    return { mode: "edit", id };
  }
  return { mode: "view", id };
}

export function writeWorkspaceState(
  search: string,
  state: WorkspaceState,
): string {
  const params = new URLSearchParams(search);
  for (const key of OWN_KEYS) params.delete(key);
  if (state.mode === "new") params.set("new", "1");
  if (state.mode === "new-stairs") params.set("new", "stairs");
  if (state.mode === "candidate") params.set("osm", String(state.osmWayId));
  if (state.mode === "view" || state.mode === "edit") {
    params.set("id", state.id);
  }
  if (state.mode === "edit") params.set("edit", "1");
  const query = params.toString();
  return query ? `?${query}` : "";
}
```

`useWorkspaceSelection.ts`: `export function useWorkspaceSelection(options: { allowEdit: boolean; stairs?: boolean })`.

- [ ] **Step 5: `slopeSave.ts`** — 파일 끝 `deleteSlopeRoute` 앞에:

```ts
export type StairsSaveResult =
  SlopeSaveResult | { ok: false; reason: "duplicate" };

/** 설계 2026-11-06 6.2·6.7. 수정은 saveSlopeRoute와 같은 updated_at 조건이다 */
export async function saveStairs(input: {
  routeId: string | null;
  loadedAt: string | null;
  name: string;
  note: string | null;
  osmWayId: number | null;
  points: StairsPoints;
}): Promise<StairsSaveResult> {
  const segments = input.points as unknown as Json;

  if (input.routeId === null) {
    const { data, error } = await supabase
      .from("slope_segments")
      .insert({
        kind: "stairs",
        name: input.name,
        note: input.note,
        osm_way_id: input.osmWayId,
        gpx_file: null,
        segments,
      })
      .select("id")
      .single();
    if (error?.code === "23505") return { ok: false, reason: "duplicate" };
    if (error || !data) {
      return {
        ok: false,
        reason: "error",
        message: error?.message ?? "저장 실패",
      };
    }
    // 목 백엔드는 id를 숫자로 돌려준다
    return { ok: true, routeId: String(data.id), created: true };
  }

  const { data, error } = await supabase
    .from("slope_segments")
    .update({ name: input.name, note: input.note, segments })
    .eq("id", input.routeId)
    .eq("updated_at", input.loadedAt ?? "")
    .select("id");
  if (error) return { ok: false, reason: "error", message: error.message };
  if (!data?.length) return { ok: false, reason: "conflict" };
  return { ok: true, routeId: input.routeId, created: false };
}
```

import를 `import type { SlopeRoutePoints, StairsPoints } from "@/types/domain";`로.

- [ ] **Step 6: 초안 타입과 훅**

`src/components/slope/types.ts` — `SlopeEditDraft`에 `owner` 다음 줄 `kind: "slope";`, 파일 끝에:

```ts
/** 계단 편집 패널이 내놓는다. 지도는 preview를 그리고 꼭짓점 변경을 돌려준다 */
export interface StairsEditDraft {
  owner: string;
  kind: "stairs";
  /** 끝 잇기를 반영한, 저장될 좌표 */
  preview: Vertex[];
  locked: boolean;
  bounds: [[number, number], [number, number]] | null;
  onVerticesChange: (vertices: Vertex[]) => void;
}

export type EditDraft = SlopeEditDraft | StairsEditDraft;
```

`SlopeEditPanel.tsx`의 초안 내놓기 effect 객체에 `kind: "slope",`를 `owner,` 다음에 더한다.

`src/components/slope/useStairsDraft.ts`:

```ts
"use client";

import { useCallback, useState } from "react";
import type { Vertex } from "@/lib/slopeRoute";
import {
  stairsDraftDirty,
  validateStairs,
  type StairsDraftValues,
} from "@/lib/stairs";

/** initial은 마운트 때만 읽는다. 다른 계단을 열려면 key로 새로 세운다 */
export function useStairsDraft(initial: {
  name: string;
  note: string;
  vertices: Vertex[] | null;
}) {
  const [initialValues] = useState<StairsDraftValues>(() => ({
    name: initial.name,
    note: initial.note,
    vertices: initial.vertices ?? [],
  }));
  const [name, setName] = useState(initialValues.name);
  const [note, setNote] = useState(initialValues.note);
  const [vertices, setVertices] = useState<Vertex[]>(initialValues.vertices);

  // 편집 패널이 초안에 실어 지도로 넘긴다. 참조가 바뀌면 렌더마다 초안을 다시 내놓게 된다
  const handleVerticesChange = useCallback(
    (next: Vertex[]) => setVertices(next),
    [],
  );

  return {
    name,
    setName,
    note,
    setNote,
    vertices,
    handleVerticesChange,
    errors: validateStairs(name, vertices),
    dirty: stairsDraftDirty({ name, note, vertices }, initialValues),
  };
}
```

- [ ] **Step 7: `DetailPanel` 저장 문구** — `save` 타입을 `{ pending: boolean; disabled?: boolean; label?: string; onClick: () => void } | null`로, 버튼 글자를 `{save.pending ? "저장 중..." : (save.label ?? "저장")}`로.

- [ ] **Step 8: `StairsEditPanel`** — `src/components/admin/slopes/StairsEditPanel.tsx`

모바일 전체 지도 부분은 `SlopeEditPanel`과 같은 규칙(설계 2026-10-14 6.6)이다. 공유 훅으로 빼지 않는다 — `SlopeEditPanel`을 이 작업에서 바꾸지 않으려는 선택이다.

```tsx
"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import ConfirmModal from "@/components/ConfirmModal";
import { useUnsavedChanges } from "@/components/admin/UnsavedChangesGuard";
import DetailPanel, {
  type DetailRemoveAction,
} from "@/components/admin/workspace/DetailPanel";
import { ADMIN_MOBILE_QUERY } from "@/components/admin/workspace/types";
import SlopeEditToolbar from "@/components/admin/slopes/SlopeEditToolbar";
import type {
  SlopeEditorHandle,
  StairsEditDraft,
} from "@/components/slope/types";
import { useStairsDraft } from "@/components/slope/useStairsDraft";
import type { Vertex } from "@/lib/slopeRoute";
import { saveStairs } from "@/lib/slopeSave";
import {
  formatMeters,
  slopeDisplayName,
  verticesBounds,
} from "@/lib/slopeWorkspace";
import {
  applyStairsJoins,
  polylineLength,
  suggestStairsJoins,
  type RouteEndpoint,
  type StairsEnd,
} from "@/lib/stairs";
import { useMediaQuery } from "@/lib/useMediaQuery";
import type { SlopeSegment, StairsPoints } from "@/types/domain";

interface StairsEditPanelProps {
  /** 초안의 owner. 페이지가 만든다 */
  owner: string;
  /** null이면 새 계단 */
  route: SlopeSegment | null;
  /** 기존 계단의 저장된 모양, OSM 후보의 모양. 손으로 그리는 새 계단은 null */
  initialVertices: Vertex[] | null;
  /** OSM 후보로 여는 새 계단 */
  candidate: { osmWayId: number; name: string | null } | null;
  /** 끝 잇기 대상(경사로 끝점). 페이지가 목록이 바뀔 때만 새로 만든다 — 렌더마다 새 배열이면 초안을 끝없이 다시 내놓는다 */
  endpoints: RouteEndpoint[];
  editor: SlopeEditorHandle | null;
  onDraftChange: (draft: StairsEditDraft | null) => void;
  onSaved: (routeId: string, created: boolean) => Promise<void>;
  /** 이미 확정된 OSM 계단이었다. 페이지가 패널을 닫고 목록을 다시 받는다 */
  onDuplicate: () => Promise<void>;
  onCancel: () => void;
  remove?: DetailRemoveAction;
  onFullMapChange: (open: boolean, closed?: boolean) => void;
  showToast: (message: string, type?: string) => void;
}

export default function StairsEditPanel({
  owner,
  route,
  initialVertices,
  candidate,
  endpoints,
  editor,
  onDraftChange,
  onSaved,
  onDuplicate,
  onCancel,
  remove,
  onFullMapChange,
  showToast,
}: StairsEditPanelProps) {
  const mobile = useMediaQuery(ADMIN_MOBILE_QUERY);
  const isNew = route === null;
  const {
    name,
    setName,
    note,
    setNote,
    vertices,
    handleVerticesChange,
    errors,
    dirty: fieldsDirty,
  } = useStairsDraft({
    name: route?.name ?? (candidate ? (candidate.name ?? "계단") : ""),
    note: route?.note ?? "",
    vertices: initialVertices,
  });
  // 기존 계단은 잇지 않은 끝을 관리자가 일부러 둔 것일 수 있어 꺼진 채 연다
  const [joinEnabled, setJoinEnabled] = useState<Record<StairsEnd, boolean>>(
    () => ({ start: isNew, end: isNew }),
  );
  const joins = useMemo(
    () => suggestStairsJoins(vertices, endpoints),
    [vertices, endpoints],
  );
  const stored = useMemo(
    () => applyStairsJoins(vertices, joins, joinEnabled),
    [vertices, joins, joinEnabled],
  );
  const dirty =
    fieldsDirty || joins.some((join) => joinEnabled[join.end] !== isNew);
  const osmWayId = route ? route.osm_way_id : (candidate?.osmWayId ?? null);
  // 저장 조건은 패널을 연 때의 행 값이다(설계 2026-10-14 2.8)
  const [loadedAt] = useState(route?.updated_at ?? null);
  const [saving, setSaving] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [fullMapOpen, setFullMapOpen] = useState(false);
  const onDraftChangeRef = useRef(onDraftChange);
  const onFullMapChangeRef = useRef(onFullMapChange);
  const mapButtonRef = useRef<HTMLButtonElement>(null);
  const mapBarRef = useRef<HTMLDivElement>(null);
  const mapReturnFocusRef = useRef(false);
  const fieldId = useId();
  const fullMap = mobile && fullMapOpen;
  useUnsavedChanges(dirty);

  useEffect(() => {
    onDraftChangeRef.current = onDraftChange;
    onFullMapChangeRef.current = onFullMapChange;
  }, [onDraftChange, onFullMapChange]);

  // 사라지면 초안을 거둔다 — SlopeEditPanel과 같은 이유
  useEffect(() => {
    const publish = onDraftChangeRef;
    return () => publish.current(null);
  }, []);

  useEffect(() => () => onFullMapChangeRef.current(false, true), []);

  useEffect(() => {
    if (fullMap) {
      mapBarRef.current?.focus();
      return;
    }
    if (!mapReturnFocusRef.current) return;
    mapReturnFocusRef.current = false;
    mapButtonRef.current?.focus();
  }, [fullMap]);

  useEffect(() => {
    if (!mobile || fullMap || editor?.state.mode !== "drag") return;
    editor.commands.setMode("vertex");
  }, [mobile, fullMap, editor]);

  useEffect(() => {
    onDraftChangeRef.current({
      owner,
      kind: "stairs",
      preview: stored,
      locked: saving,
      bounds: verticesBounds(stored),
      onVerticesChange: handleVerticesChange,
    });
  }, [owner, stored, saving, handleVerticesChange]);

  const canSave = errors.length === 0;
  const status = isNew
    ? { label: candidate ? "OSM 후보" : "새 계단", tone: "neutral" }
    : dirty
      ? { label: "저장 안 됨", tone: "warn" }
      : { label: "저장됨", tone: "ok" };

  async function handleSave() {
    if (!canSave || saving) return;
    setSaving(true);
    const result = await saveStairs({
      routeId: route ? String(route.id) : null,
      loadedAt,
      name: name.trim(),
      note: note.trim() || null,
      osmWayId,
      points: stored as StairsPoints,
    });
    if (!result.ok) {
      setSaving(false);
      if (result.reason === "duplicate") {
        showToast("이미 확정된 계단이에요", "error");
        await onDuplicate();
        return;
      }
      showToast(
        result.reason === "conflict"
          ? "다른 곳에서 바뀌었거나 삭제된 계단이에요. 새로고침해서 확인해주세요"
          : `저장 실패: ${result.message}`,
        "error",
      );
      return;
    }
    // 성공 토스트를 먼저 띄운다. 뒤따르는 목록 다시 받기가 실패하면 그 오류 토스트가 마지막에 남아야 한다
    showToast(result.created ? "계단을 추가했어요" : "계단을 수정했어요");
    await onSaved(result.routeId, result.created);
    setSaving(false);
  }

  function openFullMap() {
    setFullMapOpen(true);
    onFullMapChange(true);
  }

  function closeFullMap() {
    mapReturnFocusRef.current = true;
    setFullMapOpen(false);
    onFullMapChange(false);
  }

  const label = route
    ? `${slopeDisplayName(route)} 편집`
    : candidate
      ? "OSM 계단 확정"
      : "새 계단";

  const statusRow = (
    <div className="ku-slope-edit-status-row">
      <span
        className="ku-row-badge ku-slope-edit-status"
        data-tone={status.tone}
      >
        {status.label}
      </span>
      <span className="ku-slope-edit-meta">
        계단 · 총 {formatMeters(polylineLength(stored))}
      </span>
    </div>
  );

  return (
    <>
      <DetailPanel
        label={label}
        header={statusRow}
        onClose={onCancel}
        closeDisabled={saving}
        closeLabel="취소"
        footNote="지도에서 꼭짓점을 끌어 계단을 고쳐요"
        remove={mobile && remove ? { ...remove, disabled: saving } : undefined}
        save={{
          pending: saving,
          disabled: !canSave,
          label: isNew && candidate ? "계단으로 확정" : undefined,
          onClick: () => void handleSave(),
        }}
        hidden={fullMap}
      >
        {mobile && statusRow}
        {mobile && (
          <button
            ref={mapButtonRef}
            type="button"
            className="ku-workspace-button"
            disabled={saving}
            onClick={openFullMap}
          >
            {vertices.length > 0
              ? "지도에서 계단 고치기"
              : "지도에서 계단 그리기"}
          </button>
        )}
        <div className="ku-slope-edit-name">
          <label htmlFor={`${fieldId}-name`} className="ku-detail-label">
            계단 이름
          </label>
          <input
            id={`${fieldId}-name`}
            value={name}
            placeholder="예: 중앙광장 계단"
            disabled={saving}
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <div className="ku-slope-edit-name">
          <label htmlFor={`${fieldId}-note`} className="ku-detail-label">
            설명 (선택)
          </label>
          <textarea
            id={`${fieldId}-note`}
            value={note}
            rows={2}
            placeholder="예: 우회: 본관 엘리베이터"
            disabled={saving}
            onChange={(event) => setNote(event.target.value)}
          />
        </div>
        {joins.length > 0 && (
          <fieldset className="ku-stairs-joins">
            <legend className="ku-detail-label">끝 잇기</legend>
            {joins.map((join) => (
              <label key={join.end}>
                <input
                  type="checkbox"
                  checked={joinEnabled[join.end]}
                  disabled={saving}
                  onChange={(event) =>
                    setJoinEnabled((current) => ({
                      ...current,
                      [join.end]: event.target.checked,
                    }))
                  }
                />
                {join.endpoint.routeName} 끝에 잇기 (
                {formatMeters(join.distance)})
              </label>
            ))}
          </fieldset>
        )}
        {errors.length > 0 && vertices.length > 0 && (
          <ul className="ku-slope-edit-errors">
            {errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        )}
      </DetailPanel>
      {(!mobile || fullMap) && (
        <SlopeEditToolbar
          editor={editor}
          locked={saving}
          onResetRequest={() => setConfirmReset(true)}
        />
      )}
      {fullMap && (
        <div
          ref={mapBarRef}
          className="ku-slope-map-bar"
          role="region"
          aria-label="지도 편집"
          tabIndex={-1}
        >
          <p>도구 바로 그리고 꼭짓점을 끌어 고쳐요</p>
          <button
            type="button"
            className="ku-workspace-primary"
            disabled={editor?.state.drawing ?? false}
            onClick={closeFullMap}
          >
            완료
          </button>
        </div>
      )}
      {confirmReset && (
        <ConfirmModal
          message="그린 계단을 지우고 다시 그릴까요?"
          description="그린 선이 사라집니다."
          confirmLabel="지우고 다시 그리기"
          onConfirm={() => {
            setConfirmReset(false);
            editor?.commands.reset();
          }}
          onCancel={() => setConfirmReset(false)}
        />
      )}
    </>
  );
}
```

체크박스 접근 이름은 label 글자 그대로라 `"{경로 이름} 끝에 잇기 ({거리}m)"`다. JSX 줄바꿈이 괄호 앞뒤 공백을 만들면 Task 8 e2e의 이름 단언이 깨진다 — prettier 뒤 `{join.endpoint.routeName} 끝에 잇기 ({formatMeters(join.distance)})`가 한 덩어리 글자인지 확인하고, 깨지면 템플릿 문자열 하나로 바꾼다.

`admin-ui.css`에(`.ku-slope-edit-errors` 근처):

```css
.ku-stairs-joins {
  display: grid;
  gap: 6px;
  margin: 0;
  padding: 0;
  border: 0;
  font-size: 13px;
}
.ku-stairs-joins label {
  display: flex;
  align-items: center;
  gap: 6px;
}
.ku-slope-edit-name textarea {
  font: inherit;
  resize: vertical;
}
```

(`.ku-slope-edit-name input`의 기존 규칙이 `textarea`에 없으면 그 규칙의 선택자에 `textarea`를 더한다.)

- [ ] **Step 9: `SlopeRouteMap`**

1. import: `readStairsPoints, stairsCasingStyle, stairsLineStyle, STAIRS_LINE_CLASS`(`@/lib/stairs`), `type EditDraft`(`./types`). `SlopeEditDraft` import는 지운다.
2. `EDIT_OPTIONS` 아래:

```ts
// 계단은 구간마다 값이 없어 꼭짓점을 더하고 지워도 된다(설계 2026-11-06 12장)
const STAIRS_EDIT_OPTIONS = { allowSelfIntersection: true };
```

3. props: `/** 마운트 때만 읽는다 */ kind: "slope" | "stairs";`를 더하고 `draft: EditDraft | null;`로. 구조 분해에 `kind`.
4. `mountRef`를 `useRef({ initialViewport, initialVertices, editingRouteId, kind })`로. 마운트 effect 안 첫 구조 분해에 `kind: mountKind`를 더하고 바로 아래:

```ts
const editOptions = mountKind === "stairs" ? STAIRS_EDIT_OPTIONS : EDIT_OPTIONS;
```

`applyMode`와 `attachLine`의 `line.pm.enable(EDIT_OPTIONS)` 두 곳을 `line.pm.enable(editOptions)`로. 5. 다른 경로 상태: `otherSegments` 아래

```ts
const [otherStairs, setOtherStairs] = useState<[number, number][][] | null>(
  null,
);
```

조회를 `.select("id, kind, segments")`로, 반복을:

```ts
const segments: OtherSegment[] = [];
const stairs: [number, number][][] = [];
for (const route of data ?? []) {
  if (String(route.id) === skipRouteId) continue;
  if (route.kind === "stairs") {
    const points = readStairsPoints(route.segments);
    if (points)
      stairs.push(points.map(({ lat, lng }) => [lat, lng] as [number, number]));
    continue;
  }
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
setOtherStairs(stairs);
```

6. 다른 경로 그리기 effect를 바꾼다:

```ts
useEffect(() => {
  const group = othersRef.current;
  if (!group || !otherSegments || !otherStairs) return;
  group.clearLayers();
  // 다른 경로는 늘 흐린 선이라 외곽선도 그 비율로 흐린다
  const casing = slopeCasingStyle(OTHER_WEIGHT, false, OTHER_OPACITY);
  const stairsCasing = stairsCasingStyle(OTHER_WEIGHT, false, OTHER_OPACITY);
  const common = {
    interactive: false,
    pmIgnore: true,
    pane: "slopeOthers",
  };
  // 외곽선을 전부 먼저, 계단을 경사로보다 먼저 넣는다(공개 지도 SlopeLayer와 같은 순서)
  for (const positions of otherStairs)
    L.polyline(positions, {
      ...stairsCasing,
      ...common,
      className: SLOPE_CASING_CLASS,
    }).addTo(group);
  for (const segment of otherSegments)
    L.polyline(segment.positions, {
      ...casing,
      ...common,
      className: SLOPE_CASING_CLASS,
    }).addTo(group);
  for (const positions of otherStairs)
    L.polyline(positions, {
      ...stairsLineStyle(OTHER_WEIGHT, OTHER_OPACITY),
      ...common,
      className: STAIRS_LINE_CLASS,
    }).addTo(group);
  for (const segment of otherSegments)
    L.polyline(segment.positions, {
      ...common,
      color: slopeBandFromDeg(bands, segment.slope).color,
      weight: OTHER_WEIGHT,
      opacity: OTHER_OPACITY,
    }).addTo(group);
}, [otherSegments, otherStairs, bands]);
```

7. 미리보기: `const slopes = draft?.slopes;`를

```ts
const slopes = draft?.kind === "slope" ? draft.slopes : undefined;
const stairsPreview = draft?.kind === "stairs" ? draft.preview : null;
```

로 바꾸고, 미리보기 effect의 `if (!group || !labels) return; group.clearLayers(); labels.clearLayers();` 바로 다음에:

```ts
if (mountRef.current.kind === "stairs") {
  if (!stairsPreview || stairsPreview.length < 2) return;
  const positions = stairsPreview.map(
    ({ lat, lng }) => [lat, lng] as [number, number],
  );
  const common = { pmIgnore: true, interactive: false, pane: "slopePreview" };
  L.polyline(positions, {
    ...stairsCasingStyle(PREVIEW_WEIGHT, false),
    ...common,
    className: SLOPE_CASING_CLASS,
  }).addTo(group);
  L.polyline(positions, {
    ...stairsLineStyle(PREVIEW_WEIGHT, 0.85),
    ...common,
    className: STAIRS_LINE_CLASS,
  }).addTo(group);
  return;
}
```

의존성 배열을 `[slopes, stairsPreview, vertexVersion, bands]`로.

- [ ] **Step 10: 페이지 연결** — `src/app/admin/dashboard/slopes/page.tsx`

1. import: `useMemo`, `StairsEditPanel`, `type EditDraft`(`@/components/slope/types`, 기존 `SlopeEditDraft` import 대체), `slopeRouteEndpoints`.
2. `currentSelection()`과 `useWorkspaceSelection` 옵션을 `{ allowEdit: true, stairs: true }`로.
3. `editOwner`:

```ts
function editOwner(state: WorkspaceState) {
  if (state.mode === "edit") return `edit:${state.id}`;
  if (state.mode === "new") return "edit:new";
  if (state.mode === "new-stairs") return "edit:new-stairs";
  if (state.mode === "candidate") return `edit:osm:${state.osmWayId}`;
  return null;
}
```

4. `const [draft, setDraft] = useState<EditDraft | null>(null);`
5. `owner` 계산을 바꾸고 종류를 정한다(Task 6에서 좁힌 조건을 푼다). 후보(`candidate`)는 Task 8에서 채운다 — 이 Task에서는 `null`:

```ts
const endpoints = useMemo(() => slopeRouteEndpoints(routes), [routes]);
const candidate: StairsCandidate | null = null;
const owner =
  state.mode === "new" ||
  state.mode === "new-stairs" ||
  (state.mode === "candidate" && candidate !== null) ||
  (state.mode === "edit" && Boolean(selected?.summary))
    ? editOwner(state)
    : null;
const editingKind: "slope" | "stairs" =
  state.mode === "new"
    ? "slope"
    : state.mode === "edit"
      ? (selected?.kind ?? "slope")
      : "stairs";
```

(`StairsCandidate` 타입 import는 `@/lib/stairs`.) 6. `handleSaved`의 `stillEditing`:

```ts
const stillEditing = created
  ? selection.mode === "new" ||
    selection.mode === "new-stairs" ||
    selection.mode === "candidate"
  : selection.mode === "edit" && selection.id === routeId;
```

7. `handleDuplicate`(`handleDeleted` 아래):

```ts
// 패널을 먼저 닫는다 — 다시 받은 목록에서 후보가 빠지면 없는 후보 안내가 같은 일을 두 번 알린다(설계 2026-11-06 6.7)
async function handleDuplicate() {
  if (currentSelection().mode === "candidate")
    applyWorkspaceState({ mode: "closed" });
  await loadRoutes();
}
```

8. 편집 패널 자리:

```tsx
  const editingStairs = selected?.kind === "stairs" ? selected : null;
  const editingSlope = selected?.kind === "slope" ? selected : null;
  const detail =
    owner !== null ? (
      editingKind === "stairs" ? (
        <StairsEditPanel
          key={owner}
          owner={owner}
          route={
            state.mode === "edit" && editingStairs ? editingStairs.route : null
          }
          initialVertices={
            state.mode === "edit"
              ? (editingStairs?.summary?.vertices ?? null)
              : null
          }
          candidate={null}
          endpoints={endpoints}
          editor={activeEditor}
          onDraftChange={setDraft}
          onSaved={handleSaved}
          onDuplicate={handleDuplicate}
          onCancel={() =>
            requestSelection(
              afterEdit(state.mode === "edit" ? state.id : null),
            )
          }
          remove={remove}
          onFullMapChange={handleFullMapChange}
          showToast={showToast}
        />
      ) : (
        <SlopeEditPanel
          key={owner}
          owner={owner}
          route={editingSlope && state.mode === "edit" ? editingSlope.route : null}
          summary={
            editingSlope && state.mode === "edit" ? editingSlope.summary : null
          }
          editor={activeEditor}
          onDraftChange={setDraft}
          onSaved={handleSaved}
          onCancel={() =>
            requestSelection(
              afterEdit(state.mode === "edit" ? state.id : null),
            )
          }
          remove={remove}
          onFullMapChange={handleFullMapChange}
          showToast={showToast}
        />
      )
    ) : selected ? (
```

(뒤의 보기 패널 분기는 Task 6 그대로.) 9. 편집 지도에 `kind={editingKind}`를 넘긴다. 10. 목록 패널에:

```tsx
            secondaryAdd={{
              label: "＋ 계단 그리기",
              mobileLabel: "＋ 계단",
              onClick: () => requestSelection({ mode: "new-stairs" }),
            }}
```

- [ ] **Step 11: 설계 고침** — `docs/specs/2026-11-06-stairs-layer-design.md`

6.6의 "기존 행이면 끝 잇기 토글을 처음에는 보이지 않고, 꼭짓점을 옮기면 다시 계산한다."를 다음으로 바꾼다:

```markdown
- 끝 잇기는 이미 경사로 끝점에 붙은 끝(0.01m 미만)을 제안하지 않는다. 그래서 이어 둔 기존 계단을 열면 토글이 보이지 않고,
  꼭짓점을 옮기면 다시 계산한다. 잇지 않은 끝이 있는 기존 계단은 토글이 처음부터 보이되 꺼져 있다 — 관리자가 일부러 끈
  끝일 수 있다.
```

12장 "편집 지도는 … 고정을 풀지, 그대로 쓸지." 아래에:

```markdown
- 2026-11-xx — 계단은 고정을 푼다(`STAIRS_EDIT_OPTIONS`). 구간마다 값이 없어 꼭짓점을 더하고 지워도 어긋날 것이 없다.
```

- [ ] **Step 12: 확인·커밋·push**

```bash
npx vitest run
npx tsc --noEmit
npx eslint src/lib src/components src/app/admin/dashboard/slopes
npx prettier --write src/lib/workspaceUrl.ts src/lib/slopeSave.ts src/components/slope src/components/admin src/app/admin/dashboard/slopes/page.tsx src/app/admin/admin-ui.css docs/specs/2026-11-06-stairs-layer-design.md
npx playwright test e2e/admin-slopes-workspace.spec.ts
git status --short
git add src docs/specs/2026-11-06-stairs-layer-design.md
git commit -m "feat: 계단을 손으로 그리고 고치며, 저장할 때 근처 경사로 끝에 잇는다"
git push
```

Expected: 기존 경사로 편집 시험(그리기·저장·모바일 전체 지도)이 그대로 PASS — `SlopeEditDraft.kind`만 더했다.

---

## Task 8: OSM 후보 확정

**Files:**

- Modify: `e2e/support/mockBackend.ts` (`osmStairs` 상태·`/osm-stairs.geojson`)
- Modify: `src/components/admin/slopes/SlopeWorkspaceMap.tsx` (후보 층)
- Modify: `src/app/admin/dashboard/slopes/page.tsx` (토글·스냅숏·후보 상태)
- Modify: `src/app/admin/admin-ui.css`
- Test: `e2e/admin-slopes-workspace.spec.ts`

**Interfaces:**

- Consumes: Task 2 `readStairsSnapshot`, `availableCandidates`, `OSM_STAIRS_SNAPSHOT_URL`, `stairsHitStyle`, `STAIRS_LINE_COLOR`, `type StairsCandidate`. Task 6 `confirmedOsmWayIds`. Task 7 `StairsEditPanel`의 `candidate`·`onDuplicate`, `WorkspaceState`의 `candidate`.
- Produces: `SlopeWorkspaceMap`의 `candidates: StairsCandidate[] | null`, `onSelectCandidate: (osmWayId: number) => void`. 후보 선 클래스 `ku-stairs-candidate`(보이는 선), `ku-stairs-candidate-hit ku-stairs-candidate-hit-{번호}`(누르는 선).

- [ ] **Step 1: 목** — `e2e/support/mockBackend.ts`

`MockState`에:

```ts
/** `/osm-stairs.geojson` 응답. null이면 404 */
osmStairs: unknown;
```

`createState`의 반환 객체에:

```ts
    // 경로 1 끝에서 1.1m(394382780), 경로 2 끝에서 10m 밖(944932557)
    osmStairs: {
      type: "FeatureCollection",
      attribution: "© OpenStreetMap contributors",
      license: "ODbL-1.0",
      fetchedAt: "2026-11-06T00:00:00Z",
      features: [
        {
          type: "Feature",
          properties: { osmWayId: 394382780, name: "중앙광장 계단" },
          geometry: {
            type: "LineString",
            coordinates: [
              [127.0322, 37.58921],
              [127.0324, 37.5894],
            ],
          },
        },
        {
          type: "Feature",
          properties: { osmWayId: 944932557, name: null },
          geometry: {
            type: "LineString",
            coordinates: [
              [127.027, 37.5863],
              [127.0272, 37.5865],
            ],
          },
        },
      ],
    },
```

`page.route("**/*", …)`의 `/rest/v1/` 분기 앞에:

```ts
if (url.pathname === "/osm-stairs.geojson")
  return state.osmStairs === null
    ? route.fulfill({ status: 404, body: "" })
    : json(route, state.osmStairs);
```

- [ ] **Step 2: 실패하는 e2e** — `e2e/admin-slopes-workspace.spec.ts`에 새 describe:

```ts
test.describe("경사도 작업 화면 — OSM 계단 후보", () => {
  function candidateLines(page: Page) {
    return page.locator("path.ku-stairs-candidate");
  }

  test("후보를 켜고 눌러 계단으로 확정하면 경사로 끝에 이어 저장하고 후보에서 빠진다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/slopes");
    const toggle = listPanel(page).getByRole("button", {
      name: "OSM 계단 후보",
    });
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
    await expect(candidateLines(page)).toHaveCount(0);

    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
    await expect(candidateLines(page)).toHaveCount(2);
    await page.locator("path.ku-stairs-candidate-hit-394382780").click();
    await expect(page).toHaveURL(/\?osm=394382780$/);

    const panel = detailPanel(page, "OSM 계단 확정");
    await expect(panel.getByLabel("계단 이름")).toHaveValue("중앙광장 계단");
    const join = panel.getByRole("checkbox", {
      name: "정문-중앙광장 끝에 잇기 (1.1m)",
    });
    await expect(join).toBeChecked();
    await panel.getByRole("button", { name: "계단으로 확정" }).click();
    await expect(page.getByText("계단을 추가했어요")).toBeVisible();

    const saved = state.slopes.at(-1)!;
    expect(saved).toMatchObject({
      kind: "stairs",
      name: "중앙광장 계단",
      osm_way_id: 394382780,
    });
    expect((saved.segments as unknown[])[0]).toEqual({
      lat: 37.5892,
      lng: 127.0322,
    });
    await expect(candidateLines(page)).toHaveCount(1);
  });

  test("끝 잇기를 끄면 OSM 모양 그대로 저장한다", async ({ page }) => {
    const state = await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/slopes?osm=394382780");
    const panel = detailPanel(page, "OSM 계단 확정");
    await panel.getByRole("checkbox", { name: /끝에 잇기/ }).uncheck();
    await panel.getByRole("button", { name: "계단으로 확정" }).click();
    await expect(page.getByText("계단을 추가했어요")).toBeVisible();
    expect((state.slopes.at(-1)!.segments as unknown[])[0]).toEqual({
      lat: 37.58921,
      lng: 127.0322,
    });
  });

  test("그사이 다른 곳에서 확정된 후보는 알리고 목록을 다시 받는다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/slopes?osm=394382780");
    const panel = detailPanel(page, "OSM 계단 확정");
    await expect(panel).toBeVisible();
    state.slopes.push(
      slopeRow({
        id: 80,
        name: "먼저 확정한 계단",
        kind: "stairs",
        note: null,
        osm_way_id: 394382780,
        segments: [
          { lat: 37.5892, lng: 127.0322 },
          { lat: 37.5894, lng: 127.0324 },
        ],
      }),
    );
    await panel.getByRole("button", { name: "계단으로 확정" }).click();
    await expect(page.getByText("이미 확정된 계단이에요")).toBeVisible();
    await expect(page).toHaveURL(/\/admin\/dashboard\/slopes$/);
    await expect(listRow(page, "먼저 확정한 계단")).toBeVisible();
  });

  test("없는 후보 주소는 닫고 알리며, 스냅숏을 못 받으면 토글 옆에 알리고 끈다", async ({
    page,
  }) => {
    const state = await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/slopes?osm=1");
    await expect(
      page.getByText(
        "OSM 계단 후보를 찾지 못했어요. 이미 확정됐거나 주소가 틀렸어요.",
      ),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/admin\/dashboard\/slopes$/);

    state.osmStairs = null;
    await page.reload();
    const toggle = listPanel(page).getByRole("button", {
      name: "OSM 계단 후보",
    });
    await toggle.click();
    await expect(
      listPanel(page).getByText("OSM 계단 후보를 불러오지 못했어요"),
    ).toBeVisible();
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
  });
});
```

`page.reload()`에도 같은 목 상태가 쓰인다(`installMockBackend`의 `page.route`는 페이지에 걸려 남는다) — 다른 시험이 이미 `reload`를 쓰는지 `rg -n "page.reload" e2e/admin-slopes-workspace.spec.ts`로 보고, 없으면 두 번째 부분을 별도 시험으로 나눠 `installMockBackend` 뒤 `state.osmStairs = null`을 먼저 둔다.

- [ ] **Step 3: 시험 커밋**

```bash
npx prettier --write e2e/support/mockBackend.ts e2e/admin-slopes-workspace.spec.ts
git add e2e/support/mockBackend.ts e2e/admin-slopes-workspace.spec.ts
git commit -m "test: OSM 계단 후보를 켜고 확정·끝 잇기·동시 확정·없는 후보를 다루는 시험을 먼저 둔다"
```

- [ ] **Step 4: 후보 층** — `SlopeWorkspaceMap.tsx`

import에 `STAIRS_LINE_COLOR`, `type StairsCandidate`(`@/lib/stairs`). props에:

```ts
  /** 켠 경우만. 이미 확정된 번호는 페이지가 뺀다 */
  candidates: StairsCandidate[] | null;
  onSelectCandidate: (osmWayId: number) => void;
```

`AdminWorkspaceMap` 자식 맨 앞(확정된 선보다 아래)에:

```tsx
{
  candidates?.map((candidate) => {
    const positions = candidate.vertices.map(
      ({ lat, lng }) => [lat, lng] as [number, number],
    );
    return (
      <Fragment key={`osm:${candidate.osmWayId}`}>
        <Polyline
          positions={positions}
          className="ku-stairs-candidate"
          interactive={false}
          pathOptions={{
            color: STAIRS_LINE_COLOR,
            weight: 4,
            opacity: 0.6,
            dashArray: "6 6",
          }}
        />
        <Polyline
          positions={positions}
          className={`ku-stairs-candidate-hit ku-stairs-candidate-hit-${candidate.osmWayId}`}
          pathOptions={stairsHitStyle()}
          eventHandlers={{
            click: () => onSelectCandidate(candidate.osmWayId),
          }}
        />
      </Fragment>
    );
  });
}
```

후보는 확정된 계단(점선 `0 14`)과 갈리게 긴 대시(`6 6`)·옅은 불투명도다.

- [ ] **Step 5: 페이지** — `src/app/admin/dashboard/slopes/page.tsx`

1. import: `useEffect`, `useEffectEvent`(`react`), `readStairsSnapshot`, `availableCandidates`, `OSM_STAIRS_SNAPSHOT_URL`(`@/lib/stairs`), `confirmedOsmWayIds`, `verticesBounds`(`@/lib/slopeWorkspace`).
2. 문구 상수(`NOT_FOUND_MESSAGE` 아래):

```ts
const CANDIDATE_NOT_FOUND =
  "OSM 계단 후보를 찾지 못했어요. 이미 확정됐거나 주소가 틀렸어요.";
const SNAPSHOT_FAILED = "OSM 계단 후보를 불러오지 못했어요";
```

3. 상태(`bandsModalOpen` 근처):

```ts
const [showCandidates, setShowCandidates] = useState(false);
const [snapshot, setSnapshot] = useState<StairsCandidate[] | null>(null);
const [snapshotError, setSnapshotError] = useState(false);
```

4. Task 7의 `const candidate: StairsCandidate | null = null;`을 바꾼다:

```ts
const confirmedIds = useMemo(() => confirmedOsmWayIds(routes), [routes]);
const available = useMemo(
  () => (snapshot ? availableCandidates(snapshot, confirmedIds) : null),
  [snapshot, confirmedIds],
);
// 확정 패널의 후보는 거르기 전 스냅숏에서 찾는다. 걸러진 목록에서 찾으면, 확정 직후 목록을 다시 받는 순간 후보가
// 빠져 저장 중인 패널이 사라지고 없는 후보 안내가 뜬다
const candidate =
  state.mode === "candidate"
    ? (snapshot?.find((item) => item.osmWayId === state.osmWayId) ?? null)
    : null;
const candidateConfirmed =
  candidate !== null && confirmedIds.has(candidate.osmWayId);
```

5. 스냅숏 받기와 없는 후보 처리(`useWorkspaceCloseRequest` 아래):

```ts
// 후보 주소로 바로 들어와도 받는다. 한 번 받으면 다시 받지 않는다(설계 2026-11-06 5.3·6.1)
const needSnapshot = showCandidates || state.mode === "candidate";
useEffect(() => {
  if (!needSnapshot || snapshot !== null || snapshotError) return;
  let cancelled = false;
  fetch(OSM_STAIRS_SNAPSHOT_URL)
    .then((response) => (response.ok ? response.json() : null))
    .then((raw: unknown) => {
      if (cancelled) return;
      const candidates = readStairsSnapshot(raw);
      if (candidates) {
        setSnapshot(candidates);
        return;
      }
      setSnapshotError(true);
      setShowCandidates(false);
    })
    .catch(() => {
      if (cancelled) return;
      setSnapshotError(true);
      setShowCandidates(false);
    });
  return () => {
    cancelled = true;
  };
}, [needSnapshot, snapshot, snapshotError]);

const closeMissingCandidate = useEffectEvent((message: string) => {
  applyWorkspaceState({ mode: "closed" });
  showToast(message, snapshotError ? "error" : "warning");
});
// 저장 중에는 보지 않는다 — 확정이 끝나 목록을 다시 받으면 그 후보는 확정된 번호가 되고, 뒤이어 handleSaved가 보기로 옮긴다
useEffect(() => {
  if (state.mode !== "candidate" || saving) return;
  if (snapshotError) {
    closeMissingCandidate(SNAPSHOT_FAILED);
    return;
  }
  if (status !== "ready" || snapshot === null) return;
  if (candidate === null || candidateConfirmed)
    closeMissingCandidate(CANDIDATE_NOT_FOUND);
}, [
  state.mode,
  saving,
  snapshotError,
  status,
  snapshot,
  candidate,
  candidateConfirmed,
]);
```

이 effect는 `saving`(`activeDraft?.locked`) 정의보다 아래에 둔다. 확정된 번호로 바로 들어오면 목록을 받기 전 잠깐 패널이 열렸다가 닫힌다 — 목록 조회 전에는 확정 여부를 모른다.

6. `StairsEditPanel`의 두 prop:

```tsx
          initialVertices={
            state.mode === "edit"
              ? (editingStairs?.summary?.vertices ?? null)
              : (candidate?.vertices ?? null)
          }
          candidate={
            candidate
              ? { osmWayId: candidate.osmWayId, name: candidate.name }
              : null
          }
```

7. 편집 지도의 `initialVertices`:

```tsx
              initialVertices={
                state.mode === "edit"
                  ? (selected?.summary?.vertices ?? null)
                  : state.mode === "candidate"
                    ? (candidate?.vertices ?? null)
                    : null
              }
```

8. 작업 화면 지도:

```tsx
              candidates={showCandidates ? available : null}
              onSelectCandidate={(osmWayId) =>
                requestSelection({ mode: "candidate", osmWayId })
              }
```

9. focus — 기존 식의 마지막 `: null`을 후보 경계로:

```ts
const candidateBounds = candidate ? verticesBounds(candidate.vertices) : null;
const focus: WorkspaceFocus | null =
  fullMapFocus && fullMapFocus.owner === owner
    ? fullMapFocus.focus
    : selected?.summary
      ? {
          key: `route:${SLOPE_COLLECTION_POLICY.id(selected)}`,
          target: { bounds: selected.summary.bounds },
        }
      : candidate && candidateBounds
        ? {
            key: `osm:${candidate.osmWayId}`,
            target: { bounds: candidateBounds },
          }
        : null;
```

10. 목록 패널의 `filters`:

```tsx
            filters={
              <>
                <button
                  type="button"
                  className="ku-workspace-button"
                  aria-pressed={showCandidates}
                  onClick={() => {
                    setSnapshotError(false);
                    setShowCandidates((value) => !value);
                  }}
                >
                  OSM 계단 후보
                </button>
                {snapshotError && (
                  <span role="alert" className="ku-stairs-snapshot-error">
                    {SNAPSHOT_FAILED}
                  </span>
                )}
              </>
            }
```

`admin-ui.css`:

```css
.ku-stairs-snapshot-error {
  color: var(--ku-danger, #b91c1c);
  font-size: 12px;
}
```

(`--ku-danger`가 없는 토큰이면 이 저장소의 오류 글자 토큰을 `admin-ui.css`에서 찾아 쓴다.)

- [ ] **Step 6: 확인·커밋·push**

```bash
npx tsc --noEmit
npx eslint src/components/admin/slopes/SlopeWorkspaceMap.tsx src/app/admin/dashboard/slopes/page.tsx
npx prettier --write src/components/admin/slopes/SlopeWorkspaceMap.tsx src/app/admin/dashboard/slopes/page.tsx src/app/admin/admin-ui.css
npx playwright test e2e/admin-slopes-workspace.spec.ts
git add src/components/admin/slopes/SlopeWorkspaceMap.tsx src/app/admin/dashboard/slopes/page.tsx src/app/admin/admin-ui.css
git commit -m "feat: OSM 계단 후보를 켜고 눌러 계단으로 확정한다"
git push
```

`react-hooks/set-state-in-effect` 경고가 새로 나오면(이 저장소는 warn) 어느 줄인지 적어 두고, effect 본문에서 동기 `setState`를 부르지 않는지 본다 — 위 코드는 promise 콜백과 `useEffectEvent` 안에서만 부른다.

---

## Task 9: 활동 기록 이름표

**Files:**

- Modify: `src/lib/activityLabels.ts`, `src/lib/activityLabels.test.ts`

- [ ] **Step 1: 실패하는 시험** — `activityLabels.test.ts`의 "칸과 값을 한글로 바꾼다" 시험 끝에:

```ts
expect(formatValue("kind", "stairs")).toBe("계단");
expect(formatValue("kind", "slope")).toBe("경사로");
```

그리고 새 시험:

```ts
it("경사도 경로의 새 칸 이름", () => {
  expect(columnLabel("kind")).toBe("종류");
  expect(columnLabel("note")).toBe("설명");
  expect(columnLabel("osm_way_id")).toBe("OSM 번호");
});
```

(`columnLabel`을 import에 더한다.)

```bash
npx vitest run src/lib/activityLabels.test.ts
git add src/lib/activityLabels.test.ts
git commit -m "test: 활동 기록이 경사도 경로의 종류·설명·OSM 번호를 한글로 보이는 시험을 먼저 둔다"
```

Expected: FAIL.

- [ ] **Step 2: 구현** — `COLUMN_LABELS`의 `["segments", "경로 형상"],` 다음에:

```ts
  ["kind", "종류"],
  ["note", "설명"],
  ["osm_way_id", "OSM 번호"],
```

`BOOLEAN_LABELS` 아래에:

```ts
// 감사 대상 테이블 중 kind 칸은 slope_segments뿐이다(activity_logs.kind는 기록 자체라 감사하지 않는다)
const TEXT_VALUE_LABELS = new Map<string, ReadonlyMap<string, string>>([
  [
    "kind",
    new Map([
      ["slope", "경사로"],
      ["stairs", "계단"],
    ]),
  ],
]);
```

`formatValue`의 `if (typeof value === "string" || typeof value === "number")` 앞에:

```ts
if (typeof value === "string") {
  const label = TEXT_VALUE_LABELS.get(column)?.get(value);
  if (label) return label;
}
```

- [ ] **Step 3: 통과·커밋**

```bash
npx vitest run src/lib/activityLabels.test.ts
npx prettier --write src/lib/activityLabels.ts src/lib/activityLabels.test.ts
git add src/lib/activityLabels.ts
git commit -m "feat: 활동 기록이 경사도 경로의 종류·설명·OSM 번호를 한글로 보인다"
git push
```

---

## Task 10: 문서와 마무리

**Files:**

- Modify: `docs/future-development/accessible-routing.md`
- Modify: `docs/specs/2026-11-06-stairs-layer-design.md` (12장 결과)

- [ ] **Step 1: 경로 탐색 문서** — 먼저 머리 40줄을 읽는다(대체 배너가 있으면 그 아래 본문은 고치지 않는다 — 2026-11-06에는 없다). 설계 8장대로:

1. "보행로를 연결 그래프로 관리한다"의 `- 제한: 휠체어 통행 가능 여부, 운영 시간, 공사 및 임시 폐쇄` →

```markdown
- 제한: 운영 시간, 공사 및 임시 폐쇄
- 통행 가능 여부는 저장하지 않고 구간 유형 + 경사 + 이동 수단으로 계산한다. 같은 길도 수동·전동 휠체어에 따라 판정이
  갈린다(위 "목표 사용자 여정").
```

2. `walkway_edges`의 `- 휠체어 통행 가능 여부` 줄을 지운다(위 규칙이 대신한다).
3. "관리자 데이터 구축 흐름" 1번 → `1. OSM 보행로를 가져와 검수하고, OSM에 없는 길은 지도에서 직접 그린다.`
4. `기존 \`slope_segments\`는 즉시 삭제하지 않고 …` 문단 아래에:

```markdown
`slope_segments`의 계단 행(`kind = 'stairs'`, 2026-11-06 설계)은 겹치는 보행로 구간의 유형 `계단`의 근거다.
`osm_way_id`가 있으면 그 OSM 길과의 연결 고리다.
```

5. "구현 전 결정할 사항"의 `- 자체 조사 데이터와 OpenStreetMap 등 외부 데이터의 결합 방식` 아래에:

```markdown
- 2026-11-06 실측: OSM 캠퍼스 영역의 보행 그래프는 노드의 98.8%가 한 덩어리로 이어지고, 운영 경사도 꼭짓점 156개 중
  152개가 OSM 길에서 5m 안이다. 접근성 태그(단 수·휠체어·턱·엘리베이터)는 거의 없다. 근거와 ODbL 동일조건은
  `docs/specs/2026-11-06-stairs-layer-design.md` 3장·5.5.
```

- [ ] **Step 2: 설계 12장 남은 항목** — 각 항목 아래에 실제로 본 결과를 날짜 줄로 적는다(Overpass 서버, `kind` 값 이름표, 점 모양). 못 본 것은 "확인 전"으로 둔다.

- [ ] **Step 3: 참조 역추적** — 이번 PR에서 바꾼 이름·문구마다:

```bash
rg -n "구간별 경사를 기록한 보행 경로|휠체어 통행 가능 여부|interface SlopeListItem|summarizeSlopeRoute\(route.segments\)|select\(\"id, name, segments\"\)|select\(\"id, segments\"\)" docs src e2e
```

남은 결과가 (a) 이 PR에서 고침, (b) 날짜가 있는 당시 기록, (c) 무관 중 하나인지 PR 본문에 명령과 출력을 붙인다.

- [ ] **Step 4: 전체 확인**

```bash
npm run lint
npm run format:check
npm run typecheck
npm run test
```

Expected: 모두 통과. 그 뒤 push하고 PR CI(`Test (Playwright)`, `DB test` 포함)를 본다:

```bash
git add docs/future-development/accessible-routing.md docs/specs/2026-11-06-stairs-layer-design.md
git commit -m "docs: 경로 탐색 문서에 계단 행의 이전과 OSM 실측을 적고, 통행 가능 여부를 계산 값으로 고친다"
git push
gh run list --branch feat/stairs-layer --limit 3
```

- [ ] **Step 5: PR 본문을 고치고 draft를 푼다** — 무엇이 바뀌었는지, 운영 반영 후 할 일(아래), Step 3의 역추적 출력을 적는다. draft 해제와 병합은 사용자에게 묻는다.

운영 반영 후 할 일(PR 본문과 사용자 보고에 같이):

- 병합하면 마이그레이션이 운영에 바로 적용된다. 그 뒤 관리자가 `OSM 계단 후보`를 켜고 끊긴 자리의 계단을 확정한다(설계 3장의 후보 15곳부터).
- OSM 유래 데이터의 공개 방식은 발주자 확인 사항(설계 13장).

- [ ] **Step 6: 병합 직전** — 사용자가 병합을 승인하면, 병합 전에 이 계획 문서를 `git rm docs/plans/2026-11-06-stairs-layer.md`로 지우는 커밋을 feature 브랜치에 넣는다(계획 문서는 작업 문서다).
