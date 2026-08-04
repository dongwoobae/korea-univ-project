# 시설 상세 모달화와 건물 동영상 섹션 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 건물 상세 페이지의 시설 행에서 액션을 걷어내 상세 모달로 옮기고, 동영상 관리를 건물 단위 섹션으로 모은다.

**Architecture:** 건물 상세 페이지가 `facilities` 한 벌을 계속 소유한다. 신규 컴포넌트는 조회를 갖지 않고 props로 받은 배열에서 파생하며, 모든 변경은 부모 `fetchData()`를 await 한다. 배지 판정만 순수 함수로 분리해 vitest로 덮고, 나머지는 Playwright로 검증한다.

**Tech Stack:** Next.js (App Router) · React 클라이언트 컴포넌트 · Supabase JS · vitest(node 환경) · Playwright

**설계 문서:** `docs/superpowers/specs/2026-08-04-facility-detail-modal-and-building-video-design.md`

---

## 사전 확인

- [ ] **설계 문서를 먼저 읽는다.** 이 계획은 설계를 코드로 옮기는 절차만 담는다. 왜 그렇게 하는지는 전부 설계 문서에 있다.
- [ ] 이 프로젝트에는 jsdom이 없다(`vitest.config.js`의 `environment: "node"`). **컴포넌트 단위 테스트를 새로 만들려 하지 마라.** 순수 함수는 vitest, UI는 Playwright다.
- [ ] `/admin/dashboard/facilities`는 이번 범위 밖이다. 그 화면과 그 화면을 겨냥한 E2E는 건드리지 않는다.

## 파일 구조

**신규**

| 파일                                             | 책임                                        |
| ------------------------------------------------ | ------------------------------------------- |
| `src/lib/facilityBadges.ts`                      | 시설 → 배지 종류 배열. 순수 함수            |
| `src/lib/facilityBadges.test.ts`                 | 위 함수의 vitest                            |
| `src/components/admin/FacilityDetailModal.tsx`   | 시설 하나의 상태·번역·위치·삭제             |
| `src/components/admin/BulkRetranslateButton.tsx` | 번역 필요 시설 일괄 재번역                  |
| `src/components/admin/BuildingVideoManager.tsx`  | 건물 동영상 목록·시설 선택·업로드 모달 진입 |

**수정**

| 파일                                         | 변경                                                                     |
| -------------------------------------------- | ------------------------------------------------------------------------ |
| `src/app/admin/admin-ui.css`                 | 시설 행·배지·동영상 섹션 클래스                                          |
| `src/components/admin/AddFacilityButton.tsx` | 선택적 `buttonRef` prop                                                  |
| `src/app/admin/buildings/[id]/page.tsx`      | 행 단순화 · 모달 연결 · 정렬 · 동영상 카드 · 헤더 일괄 재번역            |
| `e2e/support/mockBackend.ts`                 | 건물 1에 미설치·번역 필요·동영상 시설 픽스처 추가                        |
| `e2e/admin-p0.spec.ts`                       | 집계·selector 정리(Task 3) → 상태 토글 계약을 모달 흐름으로 이관(Task 7) |
| `e2e/admin-buildings-slopes.spec.ts`         | 집계·selector 정리(Task 3) → 상태 토글 계약을 모달 흐름으로 이관(Task 7) |
| `e2e/admin-building-facility-modal.spec.ts`  | 신규 스펙                                                                |

---

## Task 1: 배지 판정 순수 함수

**Files:**

- Create: `src/lib/facilityBadges.ts`
- Test: `src/lib/facilityBadges.test.ts`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`src/lib/facilityBadges.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { getFacilityBadges } from "./facilityBadges";

const cleanFacility = {
  is_installed: true,
  name: "중앙 경사로",
  name_en: "Central ramp",
  name_zh: "中央坡道",
  description: null,
  description_en: null,
  description_zh: null,
  floor_info: null,
  floor_info_en: null,
  floor_info_zh: null,
  translation_status: "translated",
} as const;

describe("getFacilityBadges", () => {
  it("정상 시설에는 배지가 없다", () => {
    expect(getFacilityBadges(cleanFacility)).toEqual([]);
  });

  it("is_installed가 참이 아니면 missing을 붙인다", () => {
    expect(
      getFacilityBadges({ ...cleanFacility, is_installed: false }),
    ).toEqual(["missing"]);
    expect(getFacilityBadges({ ...cleanFacility, is_installed: null })).toEqual(
      ["missing"],
    );
  });

  it("번역이 필요하면 translation_needed를 붙인다", () => {
    expect(
      getFacilityBadges({ ...cleanFacility, translation_status: "failed" }),
    ).toEqual(["translation_needed"]);
  });

  it("원문이 있는데 번역 필드가 비면 translation_needed를 붙인다", () => {
    expect(getFacilityBadges({ ...cleanFacility, name_zh: null })).toEqual([
      "translation_needed",
    ]);
  });

  it("둘 다 해당하면 미설치가 먼저 온다", () => {
    expect(
      getFacilityBadges({
        ...cleanFacility,
        is_installed: false,
        translation_status: "failed",
      }),
    ).toEqual(["missing", "translation_needed"]);
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run src/lib/facilityBadges.test.ts`
Expected: FAIL — `Failed to resolve import "./facilityBadges"`

- [ ] **Step 3: 최소 구현을 쓴다**

`src/lib/facilityBadges.ts`:

```ts
import { facilityNeedsTranslation } from "@/lib/facilityTranslationState";

export type FacilityBadge = "missing" | "translation_needed";

type FacilityBadgeSource = { is_installed: boolean | null } & Parameters<
  typeof facilityNeedsTranslation
>[0];

export function getFacilityBadges(
  facility: FacilityBadgeSource,
): FacilityBadge[] {
  const badges: FacilityBadge[] = [];
  if (facility.is_installed !== true) badges.push("missing");
  if (facilityNeedsTranslation(facility)) badges.push("translation_needed");
  return badges;
}
```

라벨과 클래스는 여기 없다. 컴포넌트가 매핑한다.

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run src/lib/facilityBadges.test.ts`
Expected: PASS — 5 passed

- [ ] **Step 5: 타입 검사**

Run: `npm run typecheck`
Expected: 오류 없음

- [ ] **Step 6: 커밋**

```bash
git add src/lib/facilityBadges.ts src/lib/facilityBadges.test.ts
git commit -m "feat: 시설 배지 판정을 순수 함수로 분리"
```

---

## Task 2: 시설 행·배지 CSS

**Files:**

- Modify: `src/app/admin/admin-ui.css` (파일 끝, `@media (max-width: 767px)` 블록 앞)

- [ ] **Step 1: 클래스를 추가한다**

`.ku-facility-translation-control` 정의들 바로 뒤, 모바일 미디어 쿼리 앞에 넣는다:

```css
/* 행이 button이 되면 전역 button 리셋이 가운데 정렬과 색 미상속을 걸어온다.
   관리자 모바일 카드에서 같은 문제가 한 번 있었으므로 명시적으로 되돌린다. */
.ku-facility-row {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 12px 0;
  border: none;
  border-bottom: 1px solid var(--ku-border);
  background: none;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.ku-facility-row:hover {
  background: var(--ku-surface-2, rgba(0, 0, 0, 0.02));
}

.ku-facility-row:focus-visible {
  outline: 2px solid var(--ku-primary-text);
  outline-offset: -2px;
}

.ku-facility-row-icon {
  font-size: 20px;
  line-height: 1;
}

.ku-facility-row-body {
  flex: 1 1 auto;
  min-width: 0;
}

.ku-facility-row-name {
  display: block;
  font-size: 14px;
  font-weight: 500;
}

.ku-facility-row-desc {
  display: block;
  font-size: 12px;
  color: var(--ku-text-2);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ku-facility-row-badges {
  display: flex;
  flex-shrink: 0;
  gap: 4px;
}

.ku-facility-row-badge {
  padding: 3px 7px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  white-space: nowrap;
}

.ku-facility-row-badge--missing {
  color: var(--ku-status-missing-fg);
  background: var(--ku-status-missing-bg);
}

.ku-facility-row-badge--translation {
  border: 1px solid #f59e0b;
  color: #92400e;
  background: #fffbeb;
}

.ku-facility-row-chevron {
  flex-shrink: 0;
  color: var(--ku-text-3);
}

.ku-facility-modal-field {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 0;
  border-bottom: 1px solid var(--ku-border);
}

.ku-facility-modal-field-label {
  flex-shrink: 0;
  color: var(--ku-text-2);
  font-size: 13px;
}

.ku-building-video-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 0;
  border-bottom: 1px solid var(--ku-border);
}

.ku-building-video-item-body {
  flex: 1 1 auto;
  min-width: 0;
}

.ku-building-video-unpublished {
  margin-left: 6px;
  padding: 2px 6px;
  border-radius: 999px;
  color: var(--ku-text-2);
  background: var(--ku-border);
  font-size: 11px;
  font-weight: 700;
}
```

- [ ] **Step 2: 모바일 터치 영역을 추가한다**

기존 `@media (max-width: 767px)` 블록 안, `.ku-admin-confirm-actions button` 규칙 뒤에 넣는다:

```css
.ku-facility-row {
  min-height: 44px;
}
```

- [ ] **Step 3: 포맷 검사**

Run: `npx prettier --check src/app/admin/admin-ui.css`
Expected: 통과. 실패하면 `npx prettier --write` 후 다시 확인

- [ ] **Step 4: 커밋**

```bash
git add src/app/admin/admin-ui.css
git commit -m "style(admin): 시설 행·배지·동영상 섹션 클래스 추가"
```

---

## Task 3: E2E 픽스처 보강

행 배지와 동영상 섹션을 검증하려면 건물 1에 미설치 시설, 번역 필요 시설, 동영상 있는 시설이 있어야 한다. 지금은 `중앙 엘리베이터` 하나뿐이다.

**Files:**

- Modify: `e2e/support/mockBackend.ts` (facilities 배열, `f-building` 항목 뒤)

- [ ] **Step 1: 픽스처 3건을 추가한다**

`id: "f-building"` 객체 뒤에 이어 붙인다. `facility_types`는 같은 배열의 `types`를 쓴다:

```ts
      {
        id: "f-building-missing",
        building_id: 1,
        facility_code: "ramp",
        name: "후문 경사로",
        name_en: "Rear gate ramp",
        name_zh: "后门坡道",
        translation_status: "translated",
        description: "공사 중",
        description_en: "Under construction",
        description_zh: "施工中",
        floor_info: null,
        floor_info_en: null,
        floor_info_zh: null,
        is_installed: false,
        lat: 37.5895,
        lng: 127.0322,
        video_url: null,
        video_caption: null,
        facility_types: types[1],
        buildings: { name: "중앙도서관", name_en: "Central Library" },
        created_at: "2026-07-21T00:00:01Z",
        updated_at: "2026-07-22T02:00:00Z",
      },
      {
        id: "f-building-untranslated",
        building_id: 1,
        facility_code: "elevator",
        name: "지하 1층 엘리베이터",
        name_en: null,
        name_zh: null,
        translation_status: "failed",
        description: "전 층",
        description_en: null,
        description_zh: null,
        floor_info: null,
        floor_info_en: null,
        floor_info_zh: null,
        is_installed: true,
        lat: 37.5892,
        lng: 127.0323,
        video_url: null,
        video_caption: null,
        facility_types: types[0],
        buildings: { name: "중앙도서관", name_en: "Central Library" },
        created_at: "2026-07-21T00:00:02Z",
        updated_at: "2026-07-22T02:00:00Z",
      },
      {
        id: "f-building-video",
        building_id: 1,
        facility_code: "parking",
        name: "지하 주차장 진입로",
        name_en: "Underground parking approach",
        name_zh: "地下停车场入口",
        translation_status: "translated",
        description: "지하 1층",
        description_en: "B1",
        description_zh: "地下一层",
        floor_info: null,
        floor_info_en: null,
        floor_info_zh: null,
        is_installed: true,
        lat: 37.5891,
        lng: 127.0324,
        video_url: "https://cdn.example.com/facility-videos/f-building-video/1.mp4",
        video_caption: "진입로 경사",
        facility_types: types[2],
        buildings: { name: "중앙도서관", name_en: "Central Library" },
        created_at: "2026-07-21T00:00:03Z",
        updated_at: "2026-07-22T02:00:00Z",
      },
```

- [ ] **Step 2: 픽스처가 바꾼 집계 단언을 같은 커밋에서 갱신한다**

mock의 `rpc/get_admin_building_summary`는 **전역 카운트**다 — 활성 건물에 속한 모든 시설을 센다. 건물 1에 3건을 더하면 `admin-buildings-slopes.spec.ts`의 하드코딩된 개수가 바로 어긋난다. 픽스처가 만든 변화이므로 같은 커밋에서 고친다.

`e2e/admin-buildings-slopes.spec.ts`의 "건물 보완 필요 현황을 서버 집계로 표시한다" 테스트에서 두 곳만 바꾼다:

```ts
await expect(overview.getByText("등록된 시설").locator("..")).toContainText(
  "5개",
);
```

```ts
await expect(overview.getByText("번역 필요").locator("..")).toContainText(
  "2개",
);
```

`등록된 시설`은 2→5(`f-building` + 건물 3의 `f-needs-translation` + 새 3건). `번역 필요`는 1→2(`f-needs-translation` + `f-building-untranslated`). `시설 정보 없음`·`사진 없음`·`위치 없음`·`갱신일 오래됨`은 건물 단위 집계라 **바뀌지 않는다. 건드리지 마라.**

- [ ] **Step 3: 취약해진 selector의 범위를 좁힌다**

`e2e/admin-p0.spec.ts`의 "시설 상태 변경이 실패하면 성공 메시지를 표시하지 않는다"는 `getByRole("status", { name: "현재 상태: 설치" })`를 페이지 전역에서 잡는다. 건물 1에 설치 상태 시설이 3건이 되면 strict mode 위반이 난다.

`중앙 엘리베이터` 행으로 범위를 좁힌다:

```ts
const row = page.getByText("중앙 엘리베이터").locator("xpath=../..");
const status = row.getByRole("status", { name: "현재 상태: 설치" });
const toggle = row.getByRole("button", { name: "미설치로 변경" });
```

이 테스트가 지키는 계약(저장 실패 시 성공 토스트를 내지 않고 상태를 원복한다)은 그대로다. Task 7이 이 블록을 모달 흐름으로 다시 쓰지만, 그때도 대상은 `중앙 엘리베이터` 하나다 — 지금 좁혀두는 방향과 같다.

- [ ] **Step 4: 게이트 — 기존 E2E가 전부 통과하는지 확인한다**

Run: `npm run test:e2e`
Expected: 전부 PASS.

**스펙 파일 몇 개만 골라 돌리지 마라.** 이 픽스처는 전역 상태(`state.facilities`)를 늘리므로, 시설 개수나 지도 마커 개수를 하드코딩한 **관리자 밖 스펙까지** 건드린다. 실제로 `admin-campus-boundaries.spec.ts`와 `public-map.spec.ts`가 그렇다 — 좁은 게이트로 돌리면 이 둘을 놓치고 Task 7에 가서야 드러난다.

**여전히 실패하면 멈추고 보고한다.** 이후 태스크가 그 실패를 자기 실패로 오인한다. 특히 **행 구조를 바꾸는 수정으로 통과시키려 하지 마라** — 그건 Task 6의 일이다.

- [ ] **Step 5: 커밋**

```bash
git add e2e/support/mockBackend.ts e2e/admin-buildings-slopes.spec.ts e2e/admin-p0.spec.ts
git commit -m "test(e2e): 건물 1에 미설치·번역실패·동영상 시설 픽스처 추가"
```

---

## Task 4: AddFacilityButton에 buttonRef prop

모달에서 시설을 삭제하면 열었던 행이 사라진다. `useModalFocus`의 기본 복귀 대상이 없어지므로 포커스를 보낼 곳이 필요하다.

**Files:**

- Modify: `src/components/admin/AddFacilityButton.tsx`

- [ ] **Step 1: 선택적 prop을 추가한다**

`import { useState } from "react";`를 다음으로 바꾼다:

```tsx
import { useState, type RefObject } from "react";
```

`AddFacilityButtonProps`에 한 줄 추가:

```tsx
  buttonRef?: RefObject<HTMLButtonElement | null>;
```

구조 분해에 `buttonRef`를 넣고, `<button>`에 `ref={buttonRef}`를 붙인다:

```tsx
      <button
        ref={buttonRef}
        onClick={() => setOpen(true)}
```

- [ ] **Step 2: 타입 검사**

Run: `npm run typecheck`
Expected: 오류 없음. `buttonRef`가 선택적이므로 기존 호출부(건물 상세·시설 대시보드)는 그대로 통과한다

- [ ] **Step 3: 커밋**

```bash
git add src/components/admin/AddFacilityButton.tsx
git commit -m "feat(admin): AddFacilityButton에 선택적 buttonRef 추가"
```

---

## Task 5: FacilityDetailModal

**Files:**

- Create: `src/components/admin/FacilityDetailModal.tsx`

- [ ] **Step 1: 컴포넌트를 만든다**

이 저장소의 모달 껍데기는 **인라인 스타일 + 다크모드 오버라이드 클래스** 조합이다. `ku-admin-modal-*` 같은 클래스는 없다. `FacilityFormModal.tsx:172-200`의 구조를 그대로 따른다 — `dialogRef`·`role="dialog"`·`aria-labelledby`가 **백드롭 div**에 붙고, 백드롭에 `ku-facility-modal-backdrop`, 안쪽 카드에 `ku-facility-modal`을 준다. 이 두 클래스가 다크모드 배경·테두리를 담당한다.

```tsx
"use client";

import { useId } from "react";
import { useModalFocus } from "@/lib/useModalFocus";
import FacilityInstallationControl from "@/components/admin/FacilityInstallationControl";
import FacilityTranslationControl from "@/components/admin/FacilityTranslationControl";
import type { FacilityWithType } from "@/types/domain";

interface FacilityDetailModalProps {
  facility: FacilityWithType;
  toggling: boolean;
  onToggleInstalled: () => void;
  onTranslated: () => void | Promise<void>;
  onRequestDelete: () => void;
  onClose: () => void;
  showToast: (message: string, type?: string) => void;
}

export default function FacilityDetailModal({
  facility,
  toggling,
  onToggleInstalled,
  onTranslated,
  onRequestDelete,
  onClose,
  showToast,
}: FacilityDetailModalProps) {
  const titleId = useId();
  const dialogRef = useModalFocus<HTMLDivElement>({ onClose });
  const title = facility.name ?? facility.facility_types?.label ?? "시설";

  return (
    <div
      ref={dialogRef}
      className="ku-facility-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.4)",
        zIndex: 2000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        className="ku-facility-modal"
        style={{
          background: "#fff",
          borderRadius: 12,
          padding: 24,
          width: "min(420px, calc(100vw - 32px))",
          boxSizing: "border-box",
          maxHeight: "90vh",
          overflowY: "auto",
        }}
      >
        <div
          id={titleId}
          style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}
        >
          {title}
        </div>

        <div className="ku-facility-modal-field">
          <span className="ku-facility-modal-field-label">상태</span>
          <FacilityInstallationControl
            installed={facility.is_installed}
            pending={toggling}
            onToggle={onToggleInstalled}
          />
        </div>

        <div className="ku-facility-modal-field">
          <span className="ku-facility-modal-field-label">번역</span>
          <FacilityTranslationControl
            facility={facility}
            onTranslated={onTranslated}
            showToast={showToast}
          />
        </div>

        <div className="ku-facility-modal-field">
          <span className="ku-facility-modal-field-label">위치</span>
          <span style={{ fontSize: 12, color: "var(--ku-text-3)" }}>
            {facility.lat
              ? `위도 ${facility.lat} / 경도 ${facility.lng}`
              : "좌표 없음"}
          </span>
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              flex: 1,
              padding: "10px",
              background: "none",
              border: "1px solid #ddd",
              borderRadius: 8,
              fontSize: 13,
              color: "#555",
              cursor: "pointer",
            }}
          >
            닫기
          </button>
          <button
            type="button"
            onClick={onRequestDelete}
            className="ku-admin-row-action ku-admin-row-action--danger"
            style={{
              flex: 1,
              padding: "10px",
              background: "none",
              border: "1px solid #DC2626",
              borderRadius: 8,
              fontSize: 13,
              color: "#DC2626",
              cursor: "pointer",
            }}
          >
            삭제
          </button>
        </div>
      </div>
    </div>
  );
}
```

`FacilityTranslationControl`은 번역이 필요 없으면 스스로 `null`을 돌려주므로 호출부에서 조건을 걸지 않는다. 번역 줄에 라벨만 남는 것은 의도한 모양이다.

백드롭 클릭으로 닫는 동작은 넣지 않는다. `FacilityFormModal`도 넣지 않았고, 시설 삭제가 들어 있는 모달에서 바깥 클릭으로 닫히면 실수가 늘어난다. ESC와 `닫기` 버튼으로 충분하다.

- [ ] **Step 2: 모달 껍데기 클래스가 실제로 있는지 확인한다**

Run: `git grep -n -E "ku-facility-modal-backdrop|\.ku-facility-modal\b" -- src/app/admin/admin-ui.css`
Expected: 두 클래스가 모두 나온다. 없으면 멈추고 보고하라 — 새 모달 껍데기 CSS를 만들지 마라

`npx rg`를 쓰지 마라. 이 환경에 `rg` 바이너리가 없어 npm이 무관한 패키지를 설치하려 든다.

- [ ] **Step 3: 타입 검사**

Run: `npm run typecheck`
Expected: 오류 없음

- [ ] **Step 4: 커밋**

```bash
git add src/components/admin/FacilityDetailModal.tsx
git commit -m "feat(admin): 시설 상세 모달 컴포넌트 추가"
```

---

## Task 6: 건물 상세 페이지에 행·모달 연결

여기부터 화면이 실제로 바뀐다. E2E를 먼저 쓴다.

**Files:**

- Create: `e2e/admin-building-facility-modal.spec.ts`
- Modify: `src/app/admin/buildings/[id]/page.tsx`

- [ ] **Step 1: 실패하는 E2E를 쓴다**

`e2e/admin-building-facility-modal.spec.ts`:

```ts
import { expect, test } from "@playwright/test";
import { installMockBackend } from "./support/mockBackend";

test.describe("건물 상세 시설 모달", () => {
  test.beforeEach(async ({ page }) => {
    await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/buildings/1");
  });

  test("행을 누르면 시설명이 제목인 모달이 열린다", async ({ page }) => {
    await page.getByRole("button", { name: /중앙 엘리베이터/ }).click();
    await expect(
      page.getByRole("dialog", { name: "중앙 엘리베이터" }),
    ).toBeVisible();
  });

  test("정상 시설 행에는 배지가 없고 손봐야 할 행에만 붙는다", async ({
    page,
  }) => {
    await expect(
      page.getByRole("button", { name: /중앙 엘리베이터/ }),
    ).not.toContainText("미설치");
    await expect(
      page.getByRole("button", { name: /후문 경사로/ }),
    ).toContainText("미설치");
    await expect(
      page.getByRole("button", { name: /지하 1층 엘리베이터/ }),
    ).toContainText("번역 필요");
  });

  test("모달에서 상태를 토글하면 목록 배지가 따라 바뀐다", async ({ page }) => {
    const row = page.getByRole("button", { name: /중앙 엘리베이터/ });
    await row.click();
    const dialog = page.getByRole("dialog", { name: "중앙 엘리베이터" });
    await dialog.getByRole("button", { name: "미설치로 변경" }).click();
    await dialog.getByRole("button", { name: "닫기" }).click();
    await expect(row).toContainText("미설치");
  });

  test("모달을 닫으면 포커스가 열었던 행으로 돌아온다", async ({ page }) => {
    const row = page.getByRole("button", { name: /중앙 엘리베이터/ });
    await row.click();
    await page
      .getByRole("dialog", { name: "중앙 엘리베이터" })
      .getByRole("button", { name: "닫기" })
      .click();
    await expect(row).toBeFocused();
  });

  test("모달에서 시설을 삭제하면 모달이 닫히고 포커스가 시설 추가로 간다", async ({
    page,
  }) => {
    await page.getByRole("button", { name: /중앙 엘리베이터/ }).click();
    await page
      .getByRole("dialog", { name: "중앙 엘리베이터" })
      .getByRole("button", { name: "삭제" })
      .click();
    await page.getByText("시설을 삭제할까요?").waitFor();
    await page
      .getByRole("button", { name: "삭제", exact: true })
      .last()
      .click();

    await expect(
      page.getByRole("dialog", { name: "중앙 엘리베이터" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "+ 시설 추가" }),
    ).toBeFocused();
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx playwright test e2e/admin-building-facility-modal.spec.ts`
Expected: 5개 전부 FAIL — 행이 아직 `<button>`이 아니라 이름으로 잡히지 않는다

- [ ] **Step 3: import와 상태를 더한다**

`src/app/admin/buildings/[id]/page.tsx` 상단 import에 추가:

```tsx
import { useCallback, useEffect, useRef, useState } from "react";
```

`FacilityTranslationControl` import 뒤에 추가:

```tsx
import FacilityDetailModal from "@/components/admin/FacilityDetailModal";
import { getFacilityBadges } from "@/lib/facilityBadges";
```

`videoModalFacility` 상태 선언 뒤에 추가:

```tsx
const [selectedFacilityId, setSelectedFacilityId] = useState<string | null>(
  null,
);
const addFacilityRef = useRef<HTMLButtonElement>(null);

// 객체가 아니라 id를 들고 매 렌더 목록에서 찾는다.
// 객체를 붙들면 fetchData() 뒤 모달이 옛 값을 보여준다.
const selectedFacility =
  facilities.find((f) => f.id === selectedFacilityId) ?? null;
```

- [ ] **Step 4: 시설 쿼리에 정렬을 건다**

`fetchData` 안의 `building_facilities` 쿼리를 바꾼다:

```tsx
      supabase
        .from("building_facilities")
        .select("*, facility_types(label, icon)")
        .eq("building_id", id)
        .order("created_at")
        .order("id"),
```

정렬 기준이 없으면 DB 반환 순서가 그대로 화면 순서가 되어 E2E locator와 운영자 기대가 함께 흔들린다.

- [ ] **Step 5: 삭제 핸들러를 모달과 맞춘다**

`handleDeleteFacility`를 통째로 바꾼다:

```tsx
async function handleDeleteFacility(facility) {
  const error = await deleteFacility(facility);
  setConfirmModal(null);
  if (error) {
    showToast(error, "error");
    return;
  }
  setSelectedFacilityId(null);
  await fetchData();
  addFacilityRef.current?.focus();
  showToast("시설이 삭제되었어요");
}
```

- [ ] **Step 6: 시설 행을 갈아끼운다**

`facilities.map((f) => (...))` 블록 전체(`<div key={f.id} …>`부터 닫는 `))`까지)를 바꾼다:

```tsx
facilities.map((f) => (
  <button
    key={f.id}
    type="button"
    className="ku-facility-row"
    onClick={() => setSelectedFacilityId(f.id)}
  >
    <span className="ku-facility-row-icon">{f.facility_types?.icon}</span>
    <span className="ku-facility-row-body">
      <span className="ku-facility-row-name">
        {f.name ?? f.facility_types?.label}
      </span>
      <span className="ku-facility-row-desc">
        {f.description}
        {f.floor_info && ` · ${f.floor_info}`}
      </span>
    </span>
    <span className="ku-facility-row-badges">
      {getFacilityBadges(f).map((badge) =>
        badge === "missing" ? (
          <span
            key={badge}
            className="ku-facility-row-badge ku-facility-row-badge--missing"
          >
            미설치
          </span>
        ) : (
          <span
            key={badge}
            className="ku-facility-row-badge ku-facility-row-badge--translation"
          >
            번역 필요
          </span>
        ),
      )}
    </span>
    <span className="ku-facility-row-chevron" aria-hidden="true">
      ›
    </span>
  </button>
));
```

배지는 `<span>`이고 `aria-label`을 붙이지 않는다. 행 버튼의 접근 이름은 자손 텍스트로 만들어지므로 배지 글자가 자동으로 들어간다. `aria-label`을 붙이면 시설명을 덮어쓴다.

- [ ] **Step 7: `+ 시설 추가`에 ref를 연결한다**

```tsx
<AddFacilityButton
  buildingId={id}
  center={buildingCenter}
  facilityTypes={facilityTypes}
  onAdd={fetchData}
  showToast={showToast}
  buttonRef={addFacilityRef}
/>
```

- [ ] **Step 8: 모달을 렌더한다**

`{videoModalFacility && (` 블록 앞에 넣는다:

```tsx
{
  selectedFacility && (
    <FacilityDetailModal
      facility={selectedFacility}
      toggling={togglingId === selectedFacility.id}
      onToggleInstalled={() => handleToggleInstalled(selectedFacility)}
      onTranslated={fetchData}
      onRequestDelete={() => setConfirmModal(selectedFacility)}
      onClose={() => setSelectedFacilityId(null)}
      showToast={showToast}
    />
  );
}
```

- [ ] **Step 9: 삭제 확인창에 동영상 문구를 더한다**

동영상이 건물 섹션에 보이게 된 뒤로는, 시설을 지웠을 뿐인데 건물 동영상이 사라지는 일이 예고 없이 일어난다. 시설 삭제 `ConfirmModal`을 바꾼다:

```tsx
{
  confirmModal && (
    <ConfirmModal
      message="시설을 삭제할까요?"
      description={
        confirmModal.video_url
          ? "삭제한 시설은 복구할 수 없어요. 이 시설의 동영상도 함께 삭제됩니다."
          : "삭제한 시설은 복구할 수 없어요."
      }
      confirmLabel="삭제"
      onConfirm={() => handleDeleteFacility(confirmModal)}
      onCancel={() => setConfirmModal(null)}
    />
  );
}
```

`e2e/admin-building-facility-modal.spec.ts`의 `test.describe` 안에 단언을 더한다:

```ts
test("동영상이 있는 시설의 삭제 확인창은 동영상도 지워진다고 알린다", async ({
  page,
}) => {
  await page.getByRole("button", { name: /지하 주차장 진입로/ }).click();
  await page
    .getByRole("dialog", { name: "지하 주차장 진입로" })
    .getByRole("button", { name: "삭제" })
    .click();
  await expect(
    page.getByText("이 시설의 동영상도 함께 삭제됩니다"),
  ).toBeVisible();
});

test("동영상이 없는 시설의 삭제 확인창에는 그 문구가 없다", async ({
  page,
}) => {
  await page.getByRole("button", { name: /중앙 엘리베이터/ }).click();
  await page
    .getByRole("dialog", { name: "중앙 엘리베이터" })
    .getByRole("button", { name: "삭제" })
    .click();
  await expect(
    page.getByText("이 시설의 동영상도 함께 삭제됩니다"),
  ).toHaveCount(0);
});
```

- [ ] **Step 10: 통과를 확인한다**

Run: `npx playwright test e2e/admin-building-facility-modal.spec.ts`
Expected: 7 passed

포커스 단언이 실패하면 `useModalFocus`가 `previouslyFocused`로 복귀하는 경로를 확인한다. 삭제 케이스는 행이 사라지므로 훅이 복귀시키지 못하고 Step 5의 `addFacilityRef.current?.focus()`가 담당한다.

- [ ] **Step 11: 타입·린트·포맷**

Run: `npm run typecheck; if ($?) { npm run lint }; if ($?) { npx prettier --check "src/**/*.tsx" }`
Expected: 전부 통과

- [ ] **Step 12: 커밋**

```bash
git add src/app/admin/buildings/[id]/page.tsx e2e/admin-building-facility-modal.spec.ts
git commit -m "feat(admin): 시설 행을 상세 모달로 바꾸고 배지로 상태를 드러낸다"
```

---

## Task 7: 깨진 기존 E2E를 새 흐름으로 이관

Task 6에서 행 구조가 바뀌었으므로 건물 상세를 겨냥한 기존 단언이 깨진다. **단언을 지우지 말고 새 흐름으로 옮겨 적는다.** 계약이 사라지면 회귀를 못 잡는다.

**Files:**

- Modify: `e2e/admin-p0.spec.ts:41-68`
- Modify: `e2e/admin-buildings-slopes.spec.ts:277-286`

- [ ] **Step 1: 어떤 것이 깨졌는지 확인한다**

Run: `npx playwright test e2e/admin-p0.spec.ts e2e/admin-buildings-slopes.spec.ts`
Expected: FAIL. 실패 목록을 적어둔다

- [ ] **Step 2: `admin-p0.spec.ts`의 상태 토글 테스트를 모달 경유로 바꾼다**

`await page.goto("/admin/buildings/1");` 뒤 본문을 바꾼다:

```ts
await page.getByRole("button", { name: /중앙 엘리베이터/ }).click();
const dialog = page.getByRole("dialog", { name: "중앙 엘리베이터" });
const status = dialog.getByRole("status", { name: "현재 상태: 설치" });
const toggle = dialog.getByRole("button", { name: "미설치로 변경" });
await expect(status).toBeVisible();
await expect(toggle).toBeVisible();
await toggle.click();

await expect(page.getByText("변경에 실패했어요")).toBeVisible();
await expect(page.getByText("설치로 변경되었어요")).toHaveCount(0);
await expect(page.getByText("미설치로 변경되었어요")).toHaveCount(0);
// 상태가 바뀌지 않고 원복된다
await expect(status).toBeVisible();
await expect(toggle).toHaveText("미설치로 변경");
```

지키는 계약은 그대로다 — 저장 실패 시 성공 토스트를 내지 않고 상태를 원복한다.

- [ ] **Step 3: `admin-buildings-slopes.spec.ts`의 행 단언을 바꾼다**

`const facilityRow = …` 부터 그 테스트 끝까지를 바꾼다:

```ts
await page.getByRole("button", { name: /중앙 엘리베이터/ }).click();
const dialog = page.getByRole("dialog", { name: "중앙 엘리베이터" });
await expect(
  dialog.getByRole("status", { name: "현재 상태: 설치" }),
).toBeVisible();
await dialog.getByRole("button", { name: "미설치로 변경" }).click();
await expect(
  dialog.getByRole("status", { name: "현재 상태: 미설치" }),
).toBeVisible();
```

- [ ] **Step 4: 대시보드 스펙은 건드리지 않았는지 확인한다**

Run: `git diff --name-only`
Expected: `e2e/accessibility-dialog-toast.spec.ts`와 `src/app/admin/dashboard/**`가 **목록에 없다.** 있으면 되돌린다 — 그 화면은 범위 밖이고 옛 행 UI를 그대로 검증해야 한다

- [ ] **Step 5: Task 3 픽스처가 남긴 전역 개수 단언을 고친다**

Task 3이 건물 1에 시설 3건을 더하면서 전역 시설 개수와 공개 지도 마커 개수를 하드코딩한 스펙 둘이 깨졌다.

`e2e/admin-campus-boundaries.spec.ts` — 이 테스트가 지키는 계약은 "저장하면 시설이 **한 건 늘어난다**"이지 "총 4건이 된다"가 아니다. 전역 개수 대신 증분으로 바꿔 픽스처가 또 늘어도 안 깨지게 한다:

```ts
const before = state.facilities.length;
```

를 `+ 시설 추가` 클릭 전에 두고, `toHaveLength(4)`를 바꾼다:

```ts
expect(state.facilities).toHaveLength(before + 1);
```

`e2e/public-map.spec.ts` — 클러스터를 펼쳤을 때 나오는 개별 마커 수가 2에서 3으로 늘었다. 새 `지하 1층 엘리베이터`가 `is_installed: true`라 공개 API(`is_installed`가 참인 것만 내려보냄)를 통과하고, 이 테스트가 켜는 필터(경사로·엘리베이터)에 걸리기 때문이다. `후문 경사로`는 미설치라 공개에 안 나오고 `지하 주차장 진입로`는 주차라 필터 밖이다. 숫자를 실제값으로 고친다:

```ts
    ).toHaveCount(3);
```

- [ ] **Step 6: 전체 E2E를 돌린다**

Run: `npm run test:e2e`
Expected: 전부 PASS

- [ ] **Step 6: 커밋**

```bash
git add e2e/admin-p0.spec.ts e2e/admin-buildings-slopes.spec.ts
git commit -m "test(e2e): 시설 상태 토글 계약을 상세 모달 흐름으로 이관"
```

---

## Task 8: 카드 헤더 일괄 재번역

**Files:**

- Create: `src/components/admin/BulkRetranslateButton.tsx`
- Modify: `src/app/admin/buildings/[id]/page.tsx`
- Modify: `e2e/admin-building-facility-modal.spec.ts`

- [ ] **Step 1: 실패하는 E2E를 더한다**

`e2e/admin-building-facility-modal.spec.ts`의 `test.describe` 안에 추가:

```ts
test("번역 필요 건수를 헤더에 드러내고 일괄 재번역하면 배지가 사라진다", async ({
  page,
}) => {
  const bulk = page.getByRole("button", { name: /전부 재번역/ });
  await expect(bulk).toContainText("번역 필요 1건");
  await bulk.click();
  await expect(
    page.getByRole("button", { name: /지하 1층 엘리베이터/ }),
  ).not.toContainText("번역 필요");
  await expect(bulk).toHaveCount(0);
});

test("번역이 다시 실패하면 배지가 그대로 남는다", async ({ page }) => {
  await page.route("**/api/translate", (route) =>
    route.fulfill({ status: 500, json: { error: "translate failed" } }),
  );

  await page.getByRole("button", { name: /전부 재번역/ }).click();

  await expect(page.getByText("1건은 다시 실패했어요")).toBeVisible();
  await expect(
    page.getByRole("button", { name: /지하 1층 엘리베이터/ }),
  ).toContainText("번역 필요");
  await expect(page.getByRole("button", { name: /전부 재번역/ })).toBeVisible();
});
```

부분 실패가 배지로 남아야 다음 조치 대상이 드러난다. 이 단언이 없으면 실패를 성공으로 삼키는 구현이 통과한다.

- [ ] **Step 2: 실패를 확인한다**

Run: `npx playwright test e2e/admin-building-facility-modal.spec.ts -g "재번역"`
Expected: 2개 FAIL — 버튼이 없다

- [ ] **Step 3: 컴포넌트를 만든다**

`src/components/admin/BulkRetranslateButton.tsx`:

```tsx
"use client";

import { useState } from "react";
import { authedFetch } from "@/lib/authedFetch";
import { translateFacility } from "@/lib/facilityTranslation";
import { facilityNeedsTranslation } from "@/lib/facilityTranslationState";
import type { FacilityWithType } from "@/types/domain";

interface BulkRetranslateButtonProps {
  facilities: FacilityWithType[];
  onDone: () => void | Promise<void>;
  showToast: (message: string, type?: string) => void;
}

export default function BulkRetranslateButton({
  facilities,
  onDone,
  showToast,
}: BulkRetranslateButtonProps) {
  const [progress, setProgress] = useState<number | null>(null);
  const targets = facilities.filter(facilityNeedsTranslation);

  if (targets.length === 0) return null;

  async function handleClick() {
    let failed = 0;
    // 파파고를 병렬로 두들기지 않는다.
    for (const [index, facility] of targets.entries()) {
      setProgress(index + 1);
      const ok = await translateFacility(facility);
      if (!ok) failed += 1;
    }
    // 재검증은 건마다가 아니라 마지막에 한 번.
    await authedFetch("/api/revalidate-facilities", { method: "POST" }).catch(
      () => {},
    );
    setProgress(null);
    await onDone();
    showToast(
      failed === 0
        ? `${targets.length}건을 번역했어요`
        : `${failed}건은 다시 실패했어요`,
      failed === 0 ? "success" : "warning",
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={progress !== null}
      className="ku-admin-row-action"
      style={{
        fontSize: 12,
        padding: "4px 8px",
        border: "1px solid #d97706",
        borderRadius: 6,
        background: "var(--ku-surface)",
        color: "#92400e",
        fontWeight: 600,
        cursor: progress !== null ? "wait" : "pointer",
        whiteSpace: "nowrap",
      }}
    >
      {progress !== null
        ? `${targets.length}건 중 ${progress}건`
        : `번역 필요 ${targets.length}건 · 전부 재번역`}
    </button>
  );
}
```

- [ ] **Step 4: 카드 헤더에 붙인다**

`src/app/admin/buildings/[id]/page.tsx`의 import에 추가:

```tsx
import BulkRetranslateButton from "@/components/admin/BulkRetranslateButton";
```

`시설 현황` 제목과 `AddFacilityButton` 사이에 넣는다. 헤더 `<div>`의 자식 순서가 `제목 → 일괄 재번역 → 시설 추가`가 되도록 한다:

```tsx
            <div style={{ fontSize: 15, fontWeight: 600 }}>시설 현황</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <BulkRetranslateButton
                facilities={facilities}
                onDone={fetchData}
                showToast={showToast}
              />
              <AddFacilityButton
                buildingId={id}
                center={buildingCenter}
                facilityTypes={facilityTypes}
                onAdd={fetchData}
                showToast={showToast}
                buttonRef={addFacilityRef}
              />
            </div>
```

- [ ] **Step 5: 통과를 확인한다**

Run: `npx playwright test e2e/admin-building-facility-modal.spec.ts`
Expected: 10 passed (Task 6이 8건, 이 태스크가 2건)

- [ ] **Step 6: 타입·린트**

Run: `npm run typecheck; if ($?) { npm run lint }`
Expected: 통과

- [ ] **Step 7: 커밋**

```bash
git add src/components/admin/BulkRetranslateButton.tsx src/app/admin/buildings/[id]/page.tsx e2e/admin-building-facility-modal.spec.ts
git commit -m "feat(admin): 시설 현황 헤더에 일괄 재번역 진입점 추가"
```

---

## Task 9: 건물 동영상 섹션

**Files:**

- Create: `src/components/admin/BuildingVideoManager.tsx`
- Modify: `src/app/admin/buildings/[id]/page.tsx`
- Create: `e2e/admin-building-video.spec.ts`

- [ ] **Step 1: 실패하는 E2E를 쓴다**

`e2e/admin-building-video.spec.ts`:

```ts
import { expect, test } from "@playwright/test";
import { installMockBackend } from "./support/mockBackend";

test.describe("건물 동영상 섹션", () => {
  test("동영상이 있는 시설을 목록에 보여준다", async ({ page }) => {
    await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/buildings/1");

    const section = page.locator("#building-videos");
    await expect(section).toContainText("지하 주차장 진입로");
    await expect(section).toContainText("진입로 경사");
  });

  test("시설을 고르면 업로드 모달이 열린다", async ({ page }) => {
    await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/buildings/1");

    const section = page.locator("#building-videos");
    await section.getByRole("button", { name: "+ 동영상 추가" }).click();
    await section
      .getByRole("combobox", { name: "동영상을 추가할 시설" })
      .selectOption({ label: "중앙 엘리베이터" });
    await section.getByRole("button", { name: "확인" }).click();

    await expect(page.getByRole("dialog", { name: /동영상/ })).toBeVisible();
  });

  test("이미 동영상이 있는 시설을 고르면 교체 경고가 뜬다", async ({
    page,
  }) => {
    await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/buildings/1");

    const section = page.locator("#building-videos");
    await section.getByRole("button", { name: "+ 동영상 추가" }).click();
    await section
      .getByRole("combobox", { name: "동영상을 추가할 시설" })
      .selectOption({ label: "지하 주차장 진입로" });

    await expect(section).toContainText("기존 동영상이 교체됩니다");
  });

  test("미설치 시설의 동영상에 공개 안 됨 표시가 붙는다", async ({ page }) => {
    await installMockBackend(page, { authenticated: true });
    await page.route("**/rest/v1/building_facilities**", async (route) => {
      if (route.request().method() !== "GET") return route.fallback();
      const response = await route.fetch();
      const rows = await response.json();
      for (const row of rows) {
        if (row.id === "f-building-video") row.is_installed = false;
      }
      return route.fulfill({ response, json: rows });
    });
    await page.goto("/admin/buildings/1");

    await expect(page.locator("#building-videos")).toContainText("공개 안 됨");
  });

  test("시설이 없는 건물에서는 동영상 추가가 비활성이다", async ({ page }) => {
    await installMockBackend(page, { authenticated: true });
    await page.route("**/rest/v1/building_facilities**", async (route) => {
      if (route.request().method() !== "GET") return route.fallback();
      return route.fulfill({ json: [] });
    });
    await page.goto("/admin/buildings/1");

    await expect(
      page.locator("#building-videos").getByRole("button", {
        name: "+ 동영상 추가",
      }),
    ).toBeDisabled();
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx playwright test e2e/admin-building-video.spec.ts`
Expected: 5개 전부 FAIL — `#building-videos`가 없다

- [ ] **Step 3: 컴포넌트를 만든다**

`src/components/admin/BuildingVideoManager.tsx`:

```tsx
"use client";

import { useState } from "react";
import FacilityVideoModal from "@/components/admin/FacilityVideoModal";
import type { FacilityWithType } from "@/types/domain";

interface BuildingVideoManagerProps {
  facilities: FacilityWithType[];
  onChanged: () => void | Promise<void>;
  showToast: (message: string, type?: string) => void;
}

export default function BuildingVideoManager({
  facilities,
  onChanged,
  showToast,
}: BuildingVideoManagerProps) {
  const [picking, setPicking] = useState(false);
  const [pickedId, setPickedId] = useState("");
  const [target, setTarget] = useState<FacilityWithType | null>(null);

  const withVideo = facilities.filter((f) => f.video_url);
  const picked = facilities.find((f) => f.id === pickedId) ?? null;

  function confirmPick() {
    if (!picked) return;
    setTarget(picked);
    setPicking(false);
    setPickedId("");
  }

  return (
    <>
      {withVideo.length === 0 ? (
        <div
          style={{ padding: "12px 0", fontSize: 13, color: "var(--ku-text-3)" }}
        >
          등록된 동영상이 없어요
        </div>
      ) : (
        withVideo.map((f) => (
          <div key={f.id} className="ku-building-video-item">
            <span className="ku-building-video-item-body">
              <span style={{ fontSize: 14, fontWeight: 500 }}>
                {f.name ?? f.facility_types?.label}
                {f.is_installed !== true && (
                  <span className="ku-building-video-unpublished">
                    공개 안 됨
                  </span>
                )}
              </span>
              <span
                style={{
                  display: "block",
                  fontSize: 12,
                  color: "var(--ku-text-2)",
                }}
              >
                {f.video_caption ?? "캡션 없음"}
              </span>
            </span>
            <button
              type="button"
              className="ku-admin-row-action"
              onClick={() => setTarget(f)}
            >
              관리 ›
            </button>
          </div>
        ))
      )}

      {picking ? (
        <div style={{ display: "flex", gap: 8, paddingTop: 12 }}>
          <select
            aria-label="동영상을 추가할 시설"
            value={pickedId}
            onChange={(event) => setPickedId(event.target.value)}
          >
            <option value="">시설 선택</option>
            {facilities.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name ?? f.facility_types?.label}
              </option>
            ))}
          </select>
          <button type="button" onClick={confirmPick} disabled={!picked}>
            확인
          </button>
          <button type="button" onClick={() => setPicking(false)}>
            취소
          </button>
        </div>
      ) : (
        <button
          type="button"
          disabled={facilities.length === 0}
          onClick={() => setPicking(true)}
          style={{ marginTop: 12 }}
        >
          + 동영상 추가
        </button>
      )}

      {picking && facilities.length === 0 && (
        <p style={{ fontSize: 12, color: "var(--ku-text-3)" }}>
          먼저 시설을 등록해 주세요
        </p>
      )}

      {picking && picked?.video_url && (
        <p style={{ fontSize: 12, color: "var(--ku-danger)" }}>
          기존 동영상이 교체됩니다
        </p>
      )}

      {target && (
        <FacilityVideoModal
          facility={target}
          onClose={() => setTarget(null)}
          onUpdate={onChanged}
          showToast={showToast}
        />
      )}
    </>
  );
}
```

`FacilityVideoModal`의 prop 이름은 건물 상세 페이지의 기존 사용부에서 그대로 베낀다. 이름이 다르면 여기를 맞춘다 — 모달 쪽을 고치지 마라. 대시보드도 같은 모달을 쓴다.

- [ ] **Step 4: 카드를 페이지에 꽂는다**

건물 사진 카드(`<PhotoManager …>`가 들어 있는 `div`) 바로 뒤에, 사진 카드와 같은 클래스·구조로 넣는다:

```tsx
<div id="building-videos" className="ku-admin-detail-card">
  <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>
    건물 동영상
  </div>
  <BuildingVideoManager
    facilities={facilities}
    onChanged={fetchData}
    showToast={showToast}
  />
</div>
```

import를 더한다:

```tsx
import BuildingVideoManager from "@/components/admin/BuildingVideoManager";
```

사진 카드의 실제 클래스명이 `ku-admin-detail-card`가 아니면 그 카드에서 읽어 맞춘다.

- [ ] **Step 5: 시설 행의 `동영상` 버튼을 지운다**

Task 6에서 이미 행을 갈아끼웠으므로 남아 있지 않아야 한다. 확인한다:

Run: `git grep -n -E "동영상 ✓|setVideoModalFacility" -- "src/app/admin/buildings/[id]/page.tsx"`
Expected: 결과 없음. 남아 있으면 지우고, `videoModalFacility` 상태와 그 모달 렌더 블록도 함께 지운다 — 진입점을 하나로 모으는 것이 설계 1의 목적이다

- [ ] **Step 6: 통과를 확인한다**

Run: `npx playwright test e2e/admin-building-video.spec.ts`
Expected: 5 passed

- [ ] **Step 7: 전체 검사**

Run: `npm run typecheck; if ($?) { npm run lint }; if ($?) { npm test }; if ($?) { npm run test:e2e }`
Expected: 전부 통과

- [ ] **Step 8: 커밋**

```bash
git add src/components/admin/BuildingVideoManager.tsx src/app/admin/buildings/[id]/page.tsx e2e/admin-building-video.spec.ts
git commit -m "feat(admin): 건물 동영상 섹션을 만들고 시설 행의 동영상 진입점을 걷어낸다"
```

---

## Task 10: 접근성 마무리 — live region 중복

`FacilityInstallationControl`과 `FacilityTranslationControl`은 각각 `role="status"` live region을 갖는다. 모달이 열릴 때마다 삽입되어 낭독되는데, 같은 정보를 행 배지가 이미 전달한다.

**Files:**

- Modify: `src/app/admin/admin-ui.css` 또는 위 두 컴포넌트 중 한쪽

- [ ] **Step 1: 실제 낭독을 확인한다**

브라우저에서 `/admin/buildings/1`을 열고 스크린 리더(Windows 내레이터 `Ctrl+Win+Enter`)를 켠 뒤 행을 눌러 모달을 연다. 제목 다음에 `현재 상태: 설치`가 한 번 더 낭독되는지 듣는다.

- [ ] **Step 2: 중복이면 배지 쪽을 장식으로 돌린다**

행 배지에 `aria-hidden`을 붙이면 안 된다 — 행의 접근 이름에서 배지가 사라져 스크린 리더 사용자가 어느 행을 눌러야 하는지 알 수 없게 된다. 대신 **모달 안의 live region을 끈다.** `FacilityDetailModal`의 두 컨트롤을 감싼 `div`에 다음을 준다:

```tsx
        <div className="ku-facility-modal-field" aria-live="off">
```

`role="status"`는 암묵적으로 `aria-live="polite"`이므로 조상에서 `off`로 덮으면 모달 진입 시 낭독되지 않고, 값이 바뀔 때의 낭독은 컨트롤 자신의 토스트가 담당한다.

- [ ] **Step 3: 중복이 아니면 아무것도 하지 않는다**

들어보고 한 번만 낭독되면 이 태스크는 변경 없이 끝낸다. 들은 결과를 커밋 메시지가 아니라 작업 보고에 남긴다.

- [ ] **Step 4: 변경했다면 커밋**

```bash
git add src/components/admin/FacilityDetailModal.tsx
git commit -m "fix(a11y): 모달 진입 시 상태 live region 중복 낭독 제거"
```

---

## Task 11: 수동 검증

자동으로 못 잡는 것들이다. 하나씩 눈으로 본다.

- [ ] **Step 1: 행 높이 균일성**

`/admin/buildings/1`에서 번역 필요 시설과 정상 시설이 섞인 목록의 행 높이가 같은지 본다. 배지 유무로 높이가 달라지면 `.ku-facility-row`에 `min-height`를 준다.

- [ ] **Step 2: 좁은 폭**

DevTools에서 390px 폭으로 줄이고, 배지가 시설명을 밀어내지 않는지 본다. `.ku-facility-row-desc`의 `text-overflow: ellipsis`가 먹는지 확인한다.

같은 폭에서 **`시설 현황` 카드 헤더도 본다.** 이 브랜치가 헤더 버튼을 둘(`번역 필요 N건 · 전부 재번역`, `+ 시설 추가`)로 늘렸다. 저장소의 다른 헤더는 전부 버튼이 하나뿐이라 겪지 않던 경우다. `flexWrap: "wrap"`을 줘 두었으니 넘치면 줄바꿈돼야 한다 — 겹치거나 잘리지 않는지 확인한다. N이 두 자리일 때가 가장 길다.

- [ ] **Step 3: 동영상 업로드 실주행**

E2E mock이 ffmpeg 압축과 R2 업로드를 태우지 못한다. 실제 개발 서버에서 건물 동영상 섹션 → 시설 선택 → 파일 업로드까지 한 번 돌린다. 교체 경고를 승인한 뒤 새 동영상이 공개 화면에 뜨는지도 확인한다.

- [ ] **Step 4: 키보드만으로 삭제까지**

Tab으로 행에 도달 → Enter → 모달 → 삭제 → 확인 → 포커스가 `+ 시설 추가`에 있는지 본다.

- [ ] **Step 5: 결과를 보고한다**

통과·실패를 사실대로 적는다. 실패가 있으면 고치고 다시 돌린다.

---

## Task 12: 계획 정리

- [ ] **Step 1: 설계 문서의 `후속 과제`가 그대로 남아 있는지 확인한다**

이 계획은 후속 과제를 구현하지 않는다. 설계 문서에 남아 있어야 다음 작업이 그것을 찾는다.

Run: `git grep -n -A 20 "후속 과제" -- docs/superpowers/specs/2026-08-04-facility-detail-modal-and-building-video-design.md`
Expected: 항목들이 그대로 있다

- [ ] **Step 2: 전체 검사를 마지막으로 한 번 더**

Run: `npm run typecheck; if ($?) { npm run lint }; if ($?) { npm test }; if ($?) { npm run test:e2e }`
Expected: 전부 통과

`npm run format:check`는 여기서 돌리지 않는다. 이 저장소를 CRLF로 체크아웃하면 prettier가 기존 파일 전부를 줄바꿈 때문에 경고한다 — 이 작업 이전 커밋(`56fc68c`)의 `src/app/admin/buildings/[id]/page.tsx`도 똑같이 경고한다. **이 브랜치에서 고칠 문제가 아니다.** `prettier --write`로 재포맷하면 diff가 파일 전체로 번져 리뷰가 불가능해진다.

대신 **이 브랜치가 새로 만든 파일만** 확인한다:

Run: `npx prettier --check src/lib/facilityBadges.ts src/lib/facilityBadges.test.ts src/components/admin/FacilityDetailModal.tsx src/components/admin/BulkRetranslateButton.tsx src/components/admin/BuildingVideoManager.tsx e2e/admin-building-facility-modal.spec.ts e2e/admin-building-video.spec.ts`
Expected: 전부 통과

- [ ] **Step 3: 이 계획 문서를 지운다**

구현이 끝나고 base 브랜치로 병합할 때만 한다. PR이 열려 있거나 미완이면 남긴다.

```bash
git rm docs/superpowers/plans/2026-08-04-facility-detail-modal-and-building-video.md
git commit -m "docs: 시설 상세 모달 구현 완료로 계획 문서 삭제"
```
