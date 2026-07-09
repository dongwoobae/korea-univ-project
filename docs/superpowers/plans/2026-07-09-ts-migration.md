# JS → TypeScript 점진 마이그레이션 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `korea-univ-project`(ku-barrier-free-map)의 48개 JS 파일을 `allowJs` 공존 상태에서 파일 단위로 `.ts`/`.tsx`로 전환하고, 완료 후 `strict`로 승격한다.

**Architecture:** 잎(leaf)→뿌리(root) 순서로 의존성 낮은 순수 파일부터 전환한다. 각 페이즈는 `tsc --noEmit` + `vitest` + `next build` 3종 게이트를 통과해야 다음으로 넘어간다. 죽어있던 `supabase/database.types.ts`를 되살려 도메인 타입의 단일 소스로 삼는다. 거대 컴포넌트(`SidePanel`, `Map`)는 TS 전환과 분할을 별도 커밋으로 분리한다.

**Tech Stack:** Next.js 16, React 19, TypeScript, Leaflet / react-leaflet 5, Supabase, Vitest

관련 스펙: `docs/superpowers/specs/2026-07-09-ts-migration-design.md`

---

## 전환 레시피 (모든 파일 전환 공통 절차)

각 파일 전환 시 아래를 그대로 적용한다. 이후 Task들은 "레시피 적용"으로 참조한다.

1. `git mv <파일>.js <파일>.tsx` (React 컴포넌트/JSX 포함) 또는 `.ts` (JSX 없는 순수 로직)
   - `git mv`를 써야 히스토리가 보존된다.
2. 파일을 열어 아래를 채운다:
   - 함수 파라미터·반환 타입 주석 추가 (초기엔 명백한 것만, `any` 허용됨)
   - React 컴포넌트는 `props` 인터페이스 정의: `function Foo({ a, b }: FooProps)`
   - import한 도메인 데이터는 `@/types/domain`의 별칭 사용
3. `npx tsc --noEmit`로 해당 파일 타입 오류 확인 → 오류 해소
4. 해당 파일에 테스트가 있으면 `npm test -- <경로>`로 통과 확인

**초기 단계 규칙:** `strict:false`이므로 `any`·암묵적 any 허용. 완벽한 타입보다 **컴파일 통과 + 런타임 동작 불변**이 우선. 정교한 타입은 P5 승격에서 조인다.

---

## Task 0: 툴체인 셋업

**Files:**
- Create: `tsconfig.json`
- Delete: `jsconfig.json`
- Modify: `package.json`(scripts에 typecheck 추가)

- [ ] **Step 1: TypeScript 및 타입 패키지 설치**

Run:
```bash
npm install -D typescript @types/react @types/react-dom @types/node @types/leaflet
```
Expected: `package.json` devDependencies에 5개 추가, 에러 없이 완료.
(react-leaflet 5, @geoman-io/leaflet-geoman-free는 자체 타입 내장 → 설치 불필요)

- [ ] **Step 2: `jsconfig.json` 제거**

Run:
```bash
git rm jsconfig.json
```

- [ ] **Step 3: `tsconfig.json` 생성**

Create `tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "checkJs": false,
    "skipLibCheck": true,
    "strict": false,
    "noImplicitAny": false,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": {
      "@/*": ["./src/*"],
      "@supabase-types": ["./supabase/database.types.ts"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 4: `package.json`에 typecheck 스크립트 추가**

Modify `package.json` scripts:
```json
"typecheck": "tsc --noEmit",
```

- [ ] **Step 5: 첫 빌드로 툴체인 검증**

Run: `npm run build`
Expected: Next.js가 `next-env.d.ts`를 자동 생성하고 빌드 성공. (아직 JS 그대로이므로 타입 오류 없음)

- [ ] **Step 6: 게이트 통과 확인 & 커밋**

Run: `npm run typecheck && npm test && npm run build`
Expected: 3종 모두 통과.
```bash
git add tsconfig.json package.json package-lock.json
git commit -m "chore: TypeScript 툴체인 셋업 (allowJs 공존)"
```

---

## Task 1: 도메인 타입 신설 + supabase client 제네릭 연결

**Files:**
- Create: `src/types/domain.ts`
- Convert: `src/lib/supabaseClient.js` → `.ts`

- [ ] **Step 1: `src/types/domain.ts` 생성**

Create `src/types/domain.ts`:
```ts
import type { Database } from "@supabase-types";

type Tables = Database["public"]["Tables"];

export type Building = Tables["buildings"]["Row"];
export type Facility = Tables["building_facilities"]["Row"];
export type FacilityType = Tables["facility_types"]["Row"];
export type College = Tables["colleges"]["Row"];
export type BuildingPhoto = Tables["building_photos"]["Row"];

/** facilityColors의 알려진 시설 코드 */
export type FacilityCode = "elevator" | "restroom" | "ramp" | "parking" | "braille";
```

- [ ] **Step 2: `supabaseClient` 전환 + `<Database>` 제네릭 연결**

전환 레시피 적용 후 내용:
```ts
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@supabase-types";

export const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);
```
(env 값은 `string | undefined`이므로 `!` 단언. strict 승격 시 재검토 대상)

- [ ] **Step 3: 게이트 & 커밋**

Run: `npm run typecheck && npm test`
Expected: 통과.
```bash
git add src/types/domain.ts src/lib/supabaseClient.ts
git commit -m "feat: 도메인 타입 신설 및 supabase client에 Database 제네릭 연결"
```

---

## Task 2: 순수 유틸/데이터 전환 (P1)

**Files (각각 레시피 적용):**
- `src/components/map/facilityColors.js` → `.ts` (반환 타입 `string`, `code: FacilityCode` 활용)
- `src/components/map/subwayStations.js` → `.ts` (`SubwayStation` 인터페이스 정의 후 배열에 적용)
- `src/lib/translations.js` → `.ts`
- `src/lib/settings.js` → `.ts`
- `src/lib/authedFetch.js` → `.ts`
- `src/lib/authedFetch.test.js` → `.test.ts`
- `src/lib/requireAdmin.js` → `.ts`
- `src/lib/requireAdmin.test.js` → `.test.ts`
- `src/lib/compressVideo.js` → `.ts`
- `src/lib/LanguageContext.js` → `.js`는 JSX 포함 여부 확인 후 `.tsx`(Context Provider면 tsx)

- [ ] **Step 1: 위 파일들을 레시피대로 전환**

각 파일: `git mv` → 타입 주석 → `npx tsc --noEmit`로 개별 확인.
`subwayStations.ts`에는 인터페이스 추가:
```ts
export interface SubwayStation {
  id: number;
  name: string;
  name_en: string;
  name_zh: string;
  line: string;
  lat: number;
  lng: number;
}
export const SUBWAY_STATIONS: SubwayStation[] = [ /* 기존 데이터 그대로 */ ];
```

- [ ] **Step 2: 테스트 파일 동작 확인**

Run: `npm test`
Expected: `authedFetch`, `requireAdmin` 테스트 전부 통과 (import 경로 `./authedFetch`는 확장자 없이 그대로 동작).

- [ ] **Step 3: P1 게이트 & 커밋**

Run: `npm run typecheck && npm test && npm run build`
Expected: 3종 통과.
```bash
git add -A
git commit -m "refactor: 순수 유틸/데이터 레이어 TS 전환 (P1)"
```

---

## Task 3: 지도 로직 전환 (P2)

**Files (레시피 적용, 잎→뿌리 순):**
- `src/components/map/SlopeLegend.js` → `.tsx`
- `src/components/map/SlopeLayer.js` → `.tsx`
- `src/components/PolygonEditor.js` → `.tsx`
- `src/components/map/SearchControl.js` → `.tsx`
- `src/components/map/FilterPanel.js` → `.tsx`
- `src/components/FacilityMap.js` → `.tsx`
- `src/components/MapWrapper.js` → `.tsx`
- `src/components/map/Map.js` → `.tsx` (분할은 Task 7에서 별도)

- [ ] **Step 1: Leaflet 타입 확인**

`@types/leaflet` 설치 확인. Leaflet 명령형 객체는 `import L from "leaflet"` 후 `L.Map`, `L.LatLngExpression`, `L.LatLngBoundsExpression`, `L.PathOptions` 등 사용. react-leaflet ref는 `useRef<L.Map | null>(null)` 형태.

- [ ] **Step 2: 잎부터 순차 전환**

각 파일 레시피 적용. props 인터페이스 정의 예:
```tsx
interface SlopeLayerProps {
  slopes: Slope[];        // Slope 타입이 domain에 없으면 이 Task에서 정의해 추가
  visible: boolean;
}
```
(`Slope`가 `database.types.ts`에 없으면 `src/types/domain.ts`에 실제 slope API 응답 형태로 인터페이스 추가)

각 파일 전환 직후 `npx tsc --noEmit`로 오류 0 확인 후 다음 파일로.

- [ ] **Step 3: 지도 수동 확인 (체크포인트)**

Run: `npm run dev` → 지도 페이지에서 시설 마커·경사도 레이어·폴리곤 편집·검색이 전환 전과 동일 동작하는지 육안 확인.

- [ ] **Step 4: P2 게이트 & 커밋**

Run: `npm run typecheck && npm test && npm run build`
Expected: 3종 통과.
```bash
git add -A
git commit -m "refactor: 지도 로직 레이어 TS 전환 (P2)"
```

---

## Task 4: 일반 컴포넌트 전환 (P3)

**Files (레시피 적용):**
- `src/components/ConfirmModal.js` → `.tsx`
- `src/components/Toast.js` → `.tsx`
- `src/components/map/FavoritesList.js` → `.tsx`
- `src/components/map/FeedbackButton.js` → `.tsx`
- `src/components/map/LanguageSwitcher.js` → `.tsx`
- `src/components/admin/FeedbackEmailModal.js` → `.tsx`
- `src/components/SidePanel.js` → `.tsx` (분할은 Task 6에서 별도)

- [ ] **Step 1: 위 파일들을 레시피대로 전환**

각 파일 전환 후 `npx tsc --noEmit` 개별 확인.

- [ ] **Step 2: P3 게이트 & 커밋**

Run: `npm run typecheck && npm test && npm run build`
Expected: 3종 통과.
```bash
git add -A
git commit -m "refactor: 일반 컴포넌트 레이어 TS 전환 (P3)"
```

---

## Task 5: app 라우트 + API 전환 (P4)

**Files (레시피 적용):**
- API 라우트 핸들러 (`.js` → `.ts`):
  - `src/app/api/buildings/route.js`, `facilities/route.js`, `slopes/route.js`, `translate/route.js`
  - `upload-building-photo/route.js`, `delete-building-photo/route.js`
  - `upload-facility-video/route.js`, `delete-facility-video/route.js`, `facility-video-presign/route.js`, `facility-video-confirm/route.js`
  - `settings/feedback-emails/route.js`
- 페이지·레이아웃 (`.js` → `.tsx`, 단 `sitemap.js` → `.ts`):
  - `src/app/layout.js`, `src/app/page.js`, `src/app/sitemap.js`
  - `src/app/admin/page.js`, `admin/buildings/[id]/page.js`, `admin/buildings/new/page.js`
  - `admin/dashboard/layout.js`, `admin/dashboard/page.js`, `admin/dashboard/buildings/page.js`, `admin/dashboard/slopes/page.js`

- [ ] **Step 1: API 라우트 전환**

각 route 레시피 적용. Next 16 라우트 핸들러 시그니처:
```ts
export async function GET(request: Request): Promise<Response> { ... }
```
동적 라우트 params는 Next 16 규약(비동기 params) 확인 — `AGENTS.md` 지시대로 `node_modules/next/dist/docs/` 참조.

- [ ] **Step 2: 페이지·레이아웃 전환**

각 page/layout 레시피 적용. `sitemap.ts`는 `MetadataRoute.Sitemap` 반환 타입 사용:
```ts
import type { MetadataRoute } from "next";
export default function sitemap(): MetadataRoute.Sitemap { ... }
```

- [ ] **Step 3: P4 게이트 & 커밋**

Run: `npm run typecheck && npm test && npm run build`
Expected: 3종 통과.
```bash
git add -A
git commit -m "refactor: app 라우트 및 API 핸들러 TS 전환 (P4)"
```

---

## Task 6: SidePanel 분할 (체크포인트 리뷰)

**Files:**
- Modify: `src/components/SidePanel.tsx` (568줄 → 축소)
- Create: 분할된 하위 컴포넌트들 (`src/components/sidepanel/` 하위)

- [ ] **Step 1: 책임 경계 식별**

`SidePanel.tsx`를 읽고 논리 블록(예: 건물 헤더, 시설 목록, 사진 갤러리, 동영상, 피드백 등)을 식별해 하위 컴포넌트 후보를 목록화한다.

- [ ] **Step 2: 하위 컴포넌트 추출**

각 블록을 `src/components/sidepanel/<Name>.tsx`로 추출, props 인터페이스 정의. 로직 변경 없이 **JSX·핸들러를 그대로 이동**만 한다.

- [ ] **Step 3: 동작 동일성 확인 (체크포인트)**

Run: `npm run dev` → 사이드패널의 모든 상호작용(시설 선택, 사진/동영상, 피드백)이 분할 전과 동일한지 육안 확인.

- [ ] **Step 4: 게이트 & 커밋**

Run: `npm run typecheck && npm test && npm run build`
Expected: 3종 통과.
```bash
git add -A
git commit -m "refactor: SidePanel을 책임 단위 하위 컴포넌트로 분할"
```

---

## Task 7: Map 분할 (체크포인트 리뷰)

**Files:**
- Modify: `src/components/map/Map.tsx` (458줄 → 축소)
- Create: 분할된 하위 유닛 (`src/components/map/` 하위, 예: 커스텀 훅 `useMapMarkers`, `useMapControls` 등)

- [ ] **Step 1: 책임 경계 식별**

`Map.tsx`를 읽고 지도 초기화, 마커 렌더링, 컨트롤 배치, 이벤트 바인딩 등을 식별. 상태 로직은 커스텀 훅으로, 뷰는 하위 컴포넌트로 분리 후보 목록화.

- [ ] **Step 2: 추출**

식별된 훅/컴포넌트를 별도 파일로 추출, 타입 정의. 로직 변경 없이 이동만.

- [ ] **Step 3: 지도 동작 동일성 확인 (체크포인트)**

Run: `npm run dev` → 지도 로딩·마커·검색·필터·경사도가 분할 전과 동일한지 육안 확인.

- [ ] **Step 4: 게이트 & 커밋**

Run: `npm run typecheck && npm test && npm run build`
Expected: 3종 통과.
```bash
git add -A
git commit -m "refactor: Map을 훅/하위 컴포넌트로 분할"
```

---

## Task 8: strict 승격 (P5) + scripts 전환

**Files:**
- Convert: `src/scripts/syncBuildings.js` → `.ts` (+ `package.json`의 `sync-buildings` 스크립트 경로 수정)
- Modify: `tsconfig.json` (strict 활성화)

- [ ] **Step 1: scripts 전환**

`syncBuildings` 레시피 적용. `package.json`:
```json
"sync-buildings": "node --env-file=.env.local src/scripts/syncBuildings.ts"
```
(Node가 `.ts` 직접 실행 불가하면 `tsx`로 실행하도록 조정: `npx tsx --env-file=.env.local src/scripts/syncBuildings.ts` — 필요 시 `tsx`를 devDependency로 추가)

- [ ] **Step 2: strict 활성화**

Modify `tsconfig.json`:
```json
"strict": true,
"noImplicitAny": true,
```

- [ ] **Step 3: 승격 오류 정리**

Run: `npm run typecheck`
Expected: 다수 오류 발생 가능. 파일별로 순차 해소:
- `process.env.X` → 이미 `!` 단언 또는 가드 처리
- 암묵적 any 파라미터 → 명시 타입 부여
- nullable 접근 → 옵셔널 체이닝/가드

오류를 모두 0으로 만든다.

- [ ] **Step 4: 최종 게이트 & 커밋**

Run: `npm run typecheck && npm test && npm run build`
Expected: 3종 통과.
```bash
git add -A
git commit -m "refactor: strict 모드 승격 및 scripts TS 전환 (P5)"
```

- [ ] **Step 5: 잔여 JS 파일 부재 확인**

Run: `git ls-files "src/**/*.js" "src/**/*.jsx"`
Expected: 출력 없음 (모든 소스가 TS로 전환됨). 남으면 누락분 전환.

---

## Self-Review 결과

- **스펙 커버리지:** 툴체인(Task 0)·도메인 타입/제네릭 연결(Task 1)·잎→뿌리 순서(Task 2~5)·거대 컴포넌트 분할(Task 6~7)·strict 승격(Task 8)·검증 게이트(각 Task)·죽은 타입 되살리기(Task 1) 모두 대응됨.
- **엣지:** `Slope` 타입이 `database.types.ts`에 없을 수 있어 Task 3에서 조건부 정의 명시. `syncBuildings` `.ts` 실행 방식(`tsx`) 대안 명시.
- **타입 일관성:** 도메인 별칭 이름(`Building`/`Facility`/`FacilityType`/`College`/`BuildingPhoto`/`FacilityCode`)을 Task 1에서 정의하고 이후 Task에서 동일 사용.
