# JS → TypeScript 점진 마이그레이션 설계

- 작성일: 2026-07-09
- 대상 레포: `korea-univ-project` (`ku-barrier-free-map`)
- 스택: Next.js 16, React 19, Leaflet / react-leaflet 5, Supabase

## 배경 & 목표

현재 48개 파일 / ~6,166 LOC가 순수 JS(`jsconfig.json`)로 작성돼 있다.
복잡한 지도 로직(`Map.js` 458줄, `PolygonEditor.js`, `SlopeLayer.js`, `FacilityMap.js`)의
유지보수성을 높이기 위해 TypeScript로 전환한다.

핵심 목표:

1. 전체 파일을 `.ts`/`.tsx`로 전환한다.
2. `allowJs`로 JS/TS를 공존시키며 **파일 단위 점진 전환**한다 (한 번에 깨지지 않게).
3. 복잡한 지도 로직에 타입 안전성을 부여한다.
4. 마이그레이션 완료 후 `strict`로 승격한다.

## 결정 사항 (확정)

| 항목 | 결정 |
|---|---|
| 범위 | 전체 점진 마이그레이션 (48개 파일 전부) |
| 엄격성 | 증분적 강화 — 초기 `strict:false`, 완료 후 승격 |
| 전환 순서 | 잎(leaf)→뿌리(root): 의존성 낮은 순수 파일부터 |
| 도메인 타입 | 기존 `supabase/database.types.ts` 재사용 |
| 거대 컴포넌트 분할 | `SidePanel`, `Map` 확정. TS 전환 후 **별도 커밋**으로 분할 |
| auto mode | 하이브리드 — 기계적 전환은 auto, 페이즈 경계·분할은 체크포인트 리뷰 |

## 아키텍처 / 설정

### 툴체인 (Phase 0)

- 설치: `typescript`, `@types/react`, `@types/react-dom`, `@types/node`, `@types/leaflet`
  - react-leaflet 5, `@geoman-io/leaflet-geoman-free`는 자체 타입 내장 → 별도 `@types` 불필요
- `tsconfig.json` 생성 (초기 느슨 설정):
  - `allowJs: true`, `checkJs: false`
  - `strict: false`, `noImplicitAny: false`
  - `jsx: "preserve"`, `moduleResolution: "bundler"`, `paths: { "@/*": ["./src/*"] }`
  - Next.js 플러그인(`plugins: [{ name: "next" }]`)
- `jsconfig.json` 제거
- `next-env.d.ts` 자동 생성 허용 (`.gitignore` 확인)
- `vitest.config.js`는 TS 자동 지원 → 유지

### 도메인 타입 (Phase 1)

기존 `supabase/database.types.ts`(생성물)를 재사용해 `src/types/domain.ts`에 별칭 정의:

```ts
import type { Database } from "@/../supabase/database.types";

type Tables = Database["public"]["Tables"];
export type Building = Tables["buildings"]["Row"];
export type Facility = Tables["building_facilities"]["Row"];
export type FacilityType = Tables["facility_types"]["Row"];
export type College = Tables["colleges"]["Row"];
export type BuildingPhoto = Tables["building_photos"]["Row"];
```

- `facilityColors`의 code는 union 타입으로: `"elevator" | "restroom" | "ramp" | "parking" | "braille"`
- API 응답의 조인 형태(`facility_types(...)`, `buildings(name)`)는 필요 시 별도 조합 타입으로 확장

## 전환 순서 (잎 → 뿌리)

의존성이 낮은 파일부터 올려야 상위 파일이 타입 혜택을 받는다.
(대안: 기능 수직 단위 전환. 공유 유틸이 얽혀 있어 잎-우선이 더 안전하므로 채택하지 않음.)

- **P0 셋업**: 툴체인 + `tsconfig.json` + 첫 `build` 통과
- **P1 순수 유틸/데이터**: `facilityColors`, `subwayStations`, `translations`, `lib/*`
  (supabaseClient, authedFetch, requireAdmin, settings, LanguageContext, compressVideo)
  + `.test.js` → `.test.ts` + `src/types/domain.ts` 신설
- **P2 지도 로직**: `SlopeLayer`, `SlopeLegend`, `PolygonEditor`, `FacilityMap`,
  `SearchControl`, `FilterPanel`, `MapWrapper`, `Map` — Leaflet 타입 모델링 집중
- **P3 컴포넌트**: `SidePanel`, `ConfirmModal`, `Toast`, `admin/*`, `map/` 나머지
- **P4 app 라우트 + API**: `app/api/*` 라우트 핸들러, `page.js`/`layout.js`/`sitemap.js`,
  admin 페이지들
- **P5 마무리**: `scripts/syncBuildings`, `strict: true` 승격 + 잔여 오류 정리

## 거대 컴포넌트 분할

TS 전환과 분할을 **동시에 하지 않는다** (diff가 뒤엉켜 리뷰 불가).
순서: ① 해당 파일을 그대로 `.tsx`로 전환 → ② **별도 커밋**으로 분할.

- **확정**: `SidePanel.tsx` (568줄), `Map.tsx` (458줄)
- **경계선(전환 중 판단)**: `FilterPanel` (227줄), `SearchControl` (179줄)
  — 전환하며 상태 보고 분할 여부 결정

## 검증 전략

각 페이즈 완료 시 다음 3종 게이트를 모두 통과해야 다음 페이즈로 진행:

1. `npx tsc --noEmit` — 타입 체크
2. `npm test` (vitest) — 기존 테스트 통과
3. `npm run build` — Next.js 프로덕션 빌드

거대 컴포넌트 분할 커밋은 분할 전/후 동작 동일성을 눈으로 확인(체크포인트 리뷰).

## 리스크 & 대응

- **P5 strict 승격 시 오류 폭증**: `noImplicitAny`가 숨은 `any`를 드러냄
  → 승격을 맨 마지막으로 격리, 페이즈별로 미리 타입을 채워 충격 완화
- **Leaflet 명령형 API 타입 모델링**: react-leaflet ref·이벤트 핸들러 타입 까다로움
  → P2를 가장 어려운 구간으로 예상, 여유 시간 확보
- **분할 중 리그레션**: 구조 변경으로 버그 여지
  → TS 전환과 분리, 별도 커밋, 체크포인트 리뷰

## 범위 밖 (YAGNI)

- 지도 로직의 기능 개편/리팩토링 (타입 전환에 필요한 최소 정리만)
- 무관한 컴포넌트 분할 (`SidePanel`/`Map` 외)
- 테스트 커버리지 확대 (기존 테스트 유지가 목표)
