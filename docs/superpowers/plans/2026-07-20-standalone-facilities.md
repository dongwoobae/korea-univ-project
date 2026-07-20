# 독립 시설(건물 비종속) 등록 구현 플랜

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 배리어프리 시설을 건물에 소속시키지 않고(`building_id IS NULL`) 등록·수정·삭제·지도 표시한다.

**Architecture:** 기존 `building_facilities` 테이블 재사용(이미 nullable, 마이그레이션 없음). 건물 편집 페이지의 시설 추가 모달을 신규/편집 겸용 `FacilityFormModal`로 승격하고, 동영상 모달과 함께 `src/components/admin/`으로 분리한다. 대시보드 하위에 독립 시설 관리 페이지를 신설한다. 지도는 `/api/facilities`가 lat/lng 기준으로 이미 전 시설을 반환하므로 팝업의 건물명 줄만 조건부 렌더로 바꾼다.

**Tech Stack:** Next.js(App Router, client components) + Supabase(js client) + react-leaflet + vitest. 패키지 매니저 **npm**.

**스펙:** `docs/superpowers/specs/2026-07-20-standalone-facilities-design.md`

**공통 규칙:**

- 저장소: `c:\Users\servi\projects\korea-univ-project` (모든 명령은 이 디렉터리에서 실행)
- 브랜치: 시작 전 `git checkout -b feature/standalone-facilities` (main 기준, 클린 상태 확인)
- 커밋: Conventional Commits 한국어. **Co-Authored-By/Generated-with 트레일러 절대 금지.**
- push는 하지 않는다(사용자 게이트).

**codex 1차 리뷰 반영 사항(이 플랜에 이미 포함됨):**

- 시설 목록 통계 오염(Task 7), insert/update 오류 무시(Task 4), 동영상 고아 객체(Task 2),
  편집 UI 부재(Task 4·5), 분리 후 미사용 import(Task 3·4)
- RLS는 기존 건물 시설과 **동일 경로**라 신규 위험 아님 → Task 9 수동 테스트로 확인
- SidePanel은 `.eq("building_id", ...)`라 독립 시설이 섞이지 않음 → 변경 없음

---

### Task 0: 브랜치 생성

**Files:** 없음 (git만)

- [ ] **Step 1: 클린 상태 확인 후 브랜치 생성**

```bash
git status --short   # 출력 없어야 함
git checkout -b feature/standalone-facilities
```

---

### Task 1: 시설 폼 검증 헬퍼 (TDD)

독립 시설은 좌표가 없으면 지도 어디에도 나타나지 않아 유령 데이터가 된다.
저장 전 검증을 순수 함수로 만든다.

**Files:**

- Create: `src/lib/facilityForm.ts`
- Test: `src/lib/facilityForm.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`src/lib/facilityForm.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { validateFacilityForm } from "./facilityForm";

describe("validateFacilityForm", () => {
  const base = { facility_code: "elevator", lat: "37.5", lng: "127.0" };

  it("유형 미선택이면 오류 메시지를 반환한다", () => {
    expect(
      validateFacilityForm(
        { ...base, facility_code: "" },
        { standalone: false },
      ),
    ).toBe("시설 유형을 선택해주세요");
  });

  it("독립 시설은 좌표가 없으면 오류 메시지를 반환한다", () => {
    expect(
      validateFacilityForm({ ...base, lat: "", lng: "" }, { standalone: true }),
    ).toBe("지도를 클릭해 위치를 선택해주세요");
  });

  it("독립 시설이라도 좌표가 있으면 통과한다", () => {
    expect(validateFacilityForm(base, { standalone: true })).toBeNull();
  });

  it("건물 시설은 좌표가 없어도 통과한다", () => {
    expect(
      validateFacilityForm(
        { ...base, lat: "", lng: "" },
        { standalone: false },
      ),
    ).toBeNull();
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test -- facilityForm`
Expected: FAIL — `Failed to resolve import "./facilityForm"` (모듈 없음)

- [ ] **Step 3: 최소 구현**

`src/lib/facilityForm.ts`:

```ts
export interface FacilityFormValues {
  facility_code: string;
  lat: string;
  lng: string;
}

/** 시설 폼 저장 전 검증. 통과하면 null, 실패하면 토스트용 메시지. */
export function validateFacilityForm(
  form: FacilityFormValues,
  opts: { standalone: boolean },
): string | null {
  if (!form.facility_code) return "시설 유형을 선택해주세요";
  if (opts.standalone && (!form.lat || !form.lng))
    return "지도를 클릭해 위치를 선택해주세요";
  return null;
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test -- facilityForm`
Expected: PASS (4 tests)

- [ ] **Step 5: 커밋**

```bash
git add src/lib/facilityForm.ts src/lib/facilityForm.test.ts
git commit -m "feat: 시설 폼 검증 헬퍼 추가 (독립 시설 좌표 필수)"
```

---

### Task 2: 시설 삭제 헬퍼 — R2 동영상 정리 포함 (TDD)

현재 시설 삭제는 row만 지워 R2 동영상 객체가 고아로 남는다. 건물 시설·독립 시설
양쪽이 함께 쓸 헬퍼를 만든다. 동영상 정리에 실패하면 **row를 지우지 않고**
오류를 반환한다(고아 객체 방지, 사용자가 재시도 가능).

**Files:**

- Create: `src/lib/facilityDelete.ts`
- Test: `src/lib/facilityDelete.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`src/lib/facilityDelete.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const authedFetch = vi.fn();
const eq = vi.fn();
const del = vi.fn(() => ({ eq }));
const from = vi.fn(() => ({ delete: del }));

vi.mock("@/lib/supabaseClient", () => ({ supabase: { from } }));
vi.mock("@/lib/authedFetch", () => ({ authedFetch }));

describe("deleteFacility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    eq.mockResolvedValue({ error: null });
  });

  it("동영상이 없으면 R2 정리 없이 row만 삭제한다", async () => {
    const { deleteFacility } = await import("./facilityDelete");

    const result = await deleteFacility({ id: "f1", video_url: null });

    expect(authedFetch).not.toHaveBeenCalled();
    expect(eq).toHaveBeenCalledWith("id", "f1");
    expect(result).toBeNull();
  });

  it("동영상이 있으면 R2를 먼저 정리한 뒤 row를 삭제한다", async () => {
    authedFetch.mockResolvedValueOnce({ ok: true });
    const { deleteFacility } = await import("./facilityDelete");

    const result = await deleteFacility({
      id: "f2",
      video_url: "https://cdn.example.com/videos/f2.mp4",
    });

    expect(authedFetch).toHaveBeenCalledWith(
      "/api/delete-facility-video",
      expect.objectContaining({ method: "POST" }),
    );
    expect(eq).toHaveBeenCalledWith("id", "f2");
    expect(result).toBeNull();
  });

  it("동영상 정리에 실패하면 row를 삭제하지 않고 메시지를 반환한다", async () => {
    authedFetch.mockResolvedValueOnce({ ok: false });
    const { deleteFacility } = await import("./facilityDelete");

    const result = await deleteFacility({
      id: "f3",
      video_url: "https://cdn.example.com/videos/f3.mp4",
    });

    expect(eq).not.toHaveBeenCalled();
    expect(result).toBe("동영상 삭제에 실패해 시설을 지우지 못했어요");
  });

  it("row 삭제에 실패하면 메시지를 반환한다", async () => {
    eq.mockResolvedValueOnce({ error: { message: "권한 없음" } });
    const { deleteFacility } = await import("./facilityDelete");

    const result = await deleteFacility({ id: "f4", video_url: null });

    expect(result).toBe("권한 없음");
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test -- facilityDelete`
Expected: FAIL — `Failed to resolve import "./facilityDelete"`

- [ ] **Step 3: 최소 구현**

`src/lib/facilityDelete.ts`:

```ts
import { supabase } from "@/lib/supabaseClient";
import { authedFetch } from "@/lib/authedFetch";

/**
 * 시설을 삭제한다. 동영상이 있으면 R2 객체를 먼저 정리한다.
 * 정리에 실패하면 고아 객체가 남지 않도록 row를 남겨두고 메시지를 반환한다.
 * @returns 성공 시 null, 실패 시 토스트용 메시지
 */
export async function deleteFacility(facility: {
  id: string;
  video_url?: string | null;
}): Promise<string | null> {
  if (facility.video_url) {
    const res = await authedFetch("/api/delete-facility-video", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        facilityId: facility.id,
        videoUrl: facility.video_url,
      }),
    });
    if (!res.ok) return "동영상 삭제에 실패해 시설을 지우지 못했어요";
  }

  const { error } = await supabase
    .from("building_facilities")
    .delete()
    .eq("id", facility.id);

  return error ? error.message : null;
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test -- facilityDelete`
Expected: PASS (4 tests)

- [ ] **Step 5: 커밋**

```bash
git add src/lib/facilityDelete.ts src/lib/facilityDelete.test.ts
git commit -m "feat: 시설 삭제 시 R2 동영상 정리하는 헬퍼 추가"
```

---

### Task 3: FacilityVideoModal 컴포넌트 분리 (순수 이동)

`src/app/admin/buildings/[id]/page.tsx`의 `FacilityVideoModal`(현재 1245행~파일 끝)을
그대로 옮긴다. 로직 변경 없음 — `facility.id`/`facility.video_url`만 쓰므로
독립 시설에서도 그대로 동작한다.

**Files:**

- Create: `src/components/admin/FacilityVideoModal.tsx`
- Modify: `src/app/admin/buildings/[id]/page.tsx`

- [ ] **Step 1: 새 파일 생성**

`src/components/admin/FacilityVideoModal.tsx` — 아래 헤더를 쓰고, page.tsx의
`function FacilityVideoModal({ facility, onUpdate, showToast, onClose }) {` 부터
파일 끝(`}`)까지를 **그대로** 붙여넣은 뒤, 선언만
`export default function FacilityVideoModal(...)`으로 바꾼다:

```tsx
"use client";

import { useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { authedFetch } from "@/lib/authedFetch";
import ConfirmModal from "@/components/ConfirmModal";

// (여기에 page.tsx의 FacilityVideoModal 본문을 그대로 이동)
```

주의: 함수 본문은 한 글자도 수정하지 않는다(순수 이동). props 타입 추가도
하지 않는다 — 기존과 동일한 무타입 시그니처 유지.

- [ ] **Step 2: page.tsx에서 제거 + import**

`src/app/admin/buildings/[id]/page.tsx`:

- `function FacilityVideoModal` 전체 삭제.
- 상단 import에 추가:

```tsx
import FacilityVideoModal from "@/components/admin/FacilityVideoModal";
```

- `useRef`는 `FacilityVideoModal`의 `xhrRef` 전용이었으므로 3행 import에서 제거:

```tsx
import { useEffect, useState, type CSSProperties } from "react";
```

- [ ] **Step 3: 검증**

Run: `npm run typecheck && npm run lint && npm test`
Expected: 모두 PASS (기존과 동일)

- [ ] **Step 4: 커밋**

```bash
git add src/components/admin/FacilityVideoModal.tsx "src/app/admin/buildings/[id]/page.tsx"
git commit -m "refactor: FacilityVideoModal 공용 컴포넌트로 분리"
```

---

### Task 4: FacilityFormModal 신설 (신규/편집 겸용) + AddFacilityButton 분리

`page.tsx`의 `AddFacilityButton`(원본 965~1243행)을 두 컴포넌트로 나눈다.

- `FacilityFormModal`: 실제 폼 모달. `facility`가 null이면 신규, 있으면 편집.
  `buildingId`가 null이면 독립 시설 모드(층 정보 숨김·좌표 필수).
- `AddFacilityButton`: "+ 시설 추가" 버튼 + open 상태만 가진 얇은 래퍼.

기존 대비 달라지는 점: **insert/update 오류를 검사**해 실패 시 모달을 닫지 않고
오류 토스트를 띄운다(기존은 항상 성공으로 처리).

**Files:**

- Create: `src/components/admin/FacilityFormModal.tsx`
- Create: `src/components/admin/AddFacilityButton.tsx`
- Modify: `src/app/admin/buildings/[id]/page.tsx`

- [ ] **Step 1: FacilityFormModal 작성**

`src/components/admin/FacilityFormModal.tsx`:

```tsx
"use client";

import { useState, type CSSProperties } from "react";
import dynamic from "next/dynamic";
import { supabase } from "@/lib/supabaseClient";
import { authedFetch } from "@/lib/authedFetch";
import { validateFacilityForm } from "@/lib/facilityForm";
import type { FacilityType, FacilityWithType } from "@/types/domain";

const FacilityMap = dynamic(() => import("@/components/FacilityMap"), {
  ssr: false,
});

interface FacilityFormModalProps {
  /** null이면 건물 비종속(독립) 시설 */
  buildingId: number | null;
  center: [number, number];
  facilityTypes: FacilityType[];
  /** null이면 신규 추가, 값이 있으면 해당 시설 편집 */
  facility: FacilityWithType | null;
  onClose: () => void;
  onSaved: () => void;
  showToast: (message: string, type?: string) => void;
}

export default function FacilityFormModal({
  buildingId,
  center,
  facilityTypes,
  facility,
  onClose,
  onSaved,
  showToast,
}: FacilityFormModalProps) {
  const standalone = buildingId === null;
  const editing = facility !== null;
  const [form, setForm] = useState({
    facility_code: facility?.facility_code ?? "",
    name: facility?.name ?? "",
    description: facility?.description ?? "",
    floor_info: facility?.floor_info ?? "",
    is_installed: facility?.is_installed ?? true,
    lat: facility?.lat != null ? String(facility.lat) : "",
    lng: facility?.lng != null ? String(facility.lng) : "",
  });
  const [saving, setSaving] = useState(false);

  /** 번역 컬럼을 현재 입력 기준으로 다시 채운다. 실패 시 기존 값을 유지한다. */
  async function syncTranslations(facilityId: string) {
    const texts: Record<string, string> = {};
    if (form.name) texts.name = form.name;
    if (form.description) texts.description = form.description;
    if (!standalone && form.floor_info) texts.floor_info = form.floor_info;

    const translated: {
      name_en: string | null;
      name_zh: string | null;
      description_en: string | null;
      description_zh: string | null;
      floor_info_en: string | null;
      floor_info_zh: string | null;
    } = {
      name_en: null,
      name_zh: null,
      description_en: null,
      description_zh: null,
      floor_info_en: null,
      floor_info_zh: null,
    };

    if (Object.keys(texts).length > 0) {
      try {
        const res = await authedFetch("/api/translate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ texts }),
        });
        if (!res.ok) throw new Error("translate failed");
        const { en, zh } = await res.json();
        translated.name_en = en.name ?? null;
        translated.name_zh = zh.name ?? null;
        translated.description_en = en.description ?? null;
        translated.description_zh = zh.description ?? null;
        translated.floor_info_en = en.floor_info ?? null;
        translated.floor_info_zh = zh.floor_info ?? null;
      } catch {
        // 번역 실패해도 시설 저장은 완료 — 기존 번역을 건드리지 않는다
        return;
      }
    }

    await supabase
      .from("building_facilities")
      .update(translated)
      .eq("id", facilityId);
  }

  async function handleSave() {
    const invalid = validateFacilityForm(form, { standalone });
    if (invalid) {
      showToast(invalid, "warning");
      return;
    }
    setSaving(true);

    const payload = {
      building_id: buildingId,
      facility_code: form.facility_code,
      name: form.name || null,
      description: form.description || null,
      floor_info: standalone ? null : form.floor_info || null,
      is_installed: form.is_installed,
      lat: form.lat ? parseFloat(form.lat) : null,
      lng: form.lng ? parseFloat(form.lng) : null,
    };

    // 주의: `editing` 불리언으로는 facility가 non-null로 좁혀지지 않는다.
    // 반드시 facility 자체를 조건으로 써야 typecheck를 통과한다.
    let facilityId: string;
    if (facility) {
      const { error } = await supabase
        .from("building_facilities")
        .update(payload)
        .eq("id", facility.id);
      if (error) {
        setSaving(false);
        showToast("저장에 실패했어요", "error");
        return;
      }
      facilityId = facility.id;
    } else {
      const { data: inserted, error } = await supabase
        .from("building_facilities")
        .insert(payload)
        .select("id")
        .single();
      if (error || !inserted) {
        setSaving(false);
        showToast("저장에 실패했어요", "error");
        return;
      }
      facilityId = inserted.id;
    }

    await syncTranslations(facilityId);

    setSaving(false);
    onSaved();
    showToast(editing ? "시설이 수정되었어요!" : "시설이 추가되었어요!");
  }

  const inputStyle: CSSProperties = {
    width: "100%",
    padding: "8px 10px",
    border: "1px solid #ddd",
    borderRadius: 6,
    fontSize: 13,
    outline: "none",
    boxSizing: "border-box",
    marginTop: 4,
  };
  const labelStyle: CSSProperties = {
    fontSize: 12,
    color: "#555",
    display: "block",
    marginTop: 12,
  };

  return (
    <div
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
        style={{
          background: "#fff",
          borderRadius: 12,
          padding: 24,
          width: 500,
          maxHeight: "90vh",
          overflowY: "auto",
        }}
      >
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>
          {editing ? "시설 수정" : "시설 추가"}
        </div>

        <label style={labelStyle}>시설 유형 *</label>
        <select
          value={form.facility_code}
          onChange={(e) => setForm({ ...form, facility_code: e.target.value })}
          style={inputStyle}
        >
          <option value="">선택해주세요</option>
          {facilityTypes.map((t) => (
            <option key={t.code} value={t.code}>
              {t.icon} {t.label}
            </option>
          ))}
        </select>

        <label style={labelStyle}>시설 이름 (선택)</label>
        <input
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="예: 정문 엘리베이터"
          style={inputStyle}
        />

        <label style={labelStyle}>설명 (선택)</label>
        <input
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          placeholder="예: 정문 우측 내부"
          style={inputStyle}
        />

        {!standalone && (
          <>
            <label style={labelStyle}>층 정보 (선택)</label>
            <input
              value={form.floor_info}
              onChange={(e) => setForm({ ...form, floor_info: e.target.value })}
              placeholder="예: 1층~4층"
              style={inputStyle}
            />
          </>
        )}

        <label style={labelStyle}>
          위치 (지도에서 클릭해서 선택){standalone ? " *" : ""}
        </label>
        <div
          style={{
            marginTop: 4,
            borderRadius: 8,
            overflow: "hidden",
            border: "1px solid #ddd",
          }}
        >
          <FacilityMap
            center={center}
            highlightId={buildingId ?? undefined}
            markerPosition={
              form.lat && form.lng
                ? [parseFloat(form.lat), parseFloat(form.lng)]
                : null
            }
            onMapClick={(lat, lng) =>
              setForm((prev) => ({
                ...prev,
                lat: lat.toFixed(7),
                lng: lng.toFixed(7),
              }))
            }
          />
        </div>

        {form.lat && form.lng && (
          <div style={{ fontSize: 12, color: "#2563EB", marginTop: 8 }}>
            선택된 위치: {form.lat}, {form.lng}
          </div>
        )}

        <label
          style={{
            ...labelStyle,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <input
            type="checkbox"
            checked={form.is_installed}
            onChange={(e) =>
              setForm({ ...form, is_installed: e.target.checked })
            }
          />
          설치됨
        </label>

        <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
          <button
            onClick={onClose}
            style={{
              flex: 1,
              padding: "10px",
              background: "none",
              border: "1px solid #ddd",
              borderRadius: 8,
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            취소
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              flex: 1,
              padding: "10px",
              background: "#2563EB",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            {saving ? "저장 중..." : "저장"}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: AddFacilityButton 작성**

`src/components/admin/AddFacilityButton.tsx`:

```tsx
"use client";

import { useState } from "react";
import type { FacilityType } from "@/types/domain";
import FacilityFormModal from "@/components/admin/FacilityFormModal";

interface AddFacilityButtonProps {
  /** null이면 건물 비종속(독립) 시설 */
  buildingId: number | null;
  center: [number, number];
  facilityTypes: FacilityType[];
  onAdd: () => void;
  showToast: (message: string, type?: string) => void;
}

export default function AddFacilityButton({
  buildingId,
  center,
  facilityTypes,
  onAdd,
  showToast,
}: AddFacilityButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        style={{
          fontSize: 13,
          padding: "8px 16px",
          background: "#2563EB",
          color: "#fff",
          border: "none",
          borderRadius: 8,
          cursor: "pointer",
        }}
      >
        + 시설 추가
      </button>

      {open && (
        <FacilityFormModal
          buildingId={buildingId}
          center={center}
          facilityTypes={facilityTypes}
          facility={null}
          onClose={() => setOpen(false)}
          onSaved={() => {
            setOpen(false);
            onAdd();
          }}
          showToast={showToast}
        />
      )}
    </>
  );
}
```

- [ ] **Step 3: page.tsx 수정**

`src/app/admin/buildings/[id]/page.tsx`:

1. `function AddFacilityButton(...)` 전체(원본 965~1243행 범위) 삭제.
2. 상단 import 추가:

```tsx
import AddFacilityButton from "@/components/admin/AddFacilityButton";
```

3. `FacilityMap` dynamic import(원본 18~20행)는 `AddFacilityButton` 안에서만
   쓰였으므로 삭제한다. `PolygonEditor` dynamic import는 유지.
4. `CSSProperties` import 제거(원본 1053행 `inputStyle` 전용이었음). 3행은
   Task 3 이후 최종적으로 다음이 된다:

```tsx
import { useEffect, useState } from "react";
```

5. 호출부(원본 492~498행)의 prop 명칭 변경 — `buildingCenter` → `center`:

```tsx
<AddFacilityButton
  buildingId={id}
  center={buildingCenter}
  facilityTypes={facilityTypes}
  onAdd={fetchData}
  showToast={showToast}
/>
```

6. `center: [number, number]` 타입을 만족시키기 위해 상수·헬퍼에 반환 타입 명시
   (원본 25~39행):

```tsx
const KU_CENTER: [number, number] = [37.5893, 127.0327];

function getBuildingCenter(building): [number, number] {
  const geom = building?.geojson?.geometry;
  if (!geom) return KU_CENTER;
  if (geom.type === "Point") return [geom.coordinates[1], geom.coordinates[0]];
  const coords = geom.coordinates?.[0];
  if (!coords?.length) return KU_CENTER;
  const lats = coords.map(([, lat]) => lat);
  const lngs = coords.map(([lng]) => lng);
  return [
    (Math.min(...lats) + Math.max(...lats)) / 2,
    (Math.min(...lngs) + Math.max(...lngs)) / 2,
  ];
}
```

7. `handleDeleteFacility`(원본 112~117행)를 Task 2 헬퍼로 교체한다.
   기존 시그니처는 `facilityId` 문자열이었으나 동영상 URL이 필요하므로
   시설 객체를 받도록 바꾸고, 호출부(`confirmModal` 상태)도 함께 고친다:

```tsx
async function handleDeleteFacility(facility) {
  const error = await deleteFacility(facility);
  setConfirmModal(null);
  if (error) {
    showToast(error, "error");
    return;
  }
  fetchData();
  showToast("시설이 삭제되었어요");
}
```

import 추가:

```tsx
import { deleteFacility } from "@/lib/facilityDelete";
```

`confirmModal` 상태 타입을 시설 객체로 변경(원본 60~62행):

```tsx
const [confirmModal, setConfirmModal] = useState<FacilityWithType | null>(null);
```

목록의 삭제 버튼(원본 571행):

```tsx
onClick={() => setConfirmModal(f)}
```

확인 모달(원본 640~648행):

```tsx
{
  confirmModal && (
    <ConfirmModal
      message="시설을 삭제할까요?"
      description="삭제한 시설은 복구할 수 없어요."
      confirmLabel="삭제"
      onConfirm={() => handleDeleteFacility(confirmModal)}
      onCancel={() => setConfirmModal(null)}
    />
  );
}
```

- [ ] **Step 4: 검증**

Run: `npm run typecheck && npm run lint && npm test`
Expected: 모두 PASS

- [ ] **Step 5: 커밋**

```bash
git add src/components/admin/FacilityFormModal.tsx src/components/admin/AddFacilityButton.tsx "src/app/admin/buildings/[id]/page.tsx"
git commit -m "refactor: 시설 폼을 신규·편집 겸용 모달로 분리하고 독립 시설 모드 지원"
```

---

### Task 5: 독립 시설 관리 페이지 + 대시보드 메뉴

**Files:**

- Create: `src/app/admin/dashboard/facilities/page.tsx`
- Modify: `src/app/admin/dashboard/layout.tsx:10-13` (NAV 배열)

- [ ] **Step 1: 페이지 작성**

`src/app/admin/dashboard/facilities/page.tsx`
(인증·네비는 dashboard layout이 처리하므로 페이지엔 없음):

```tsx
"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { deleteFacility } from "@/lib/facilityDelete";
import type { FacilityWithType, FacilityType } from "@/types/domain";
import Toast from "@/components/Toast";
import ConfirmModal from "@/components/ConfirmModal";
import AddFacilityButton from "@/components/admin/AddFacilityButton";
import FacilityFormModal from "@/components/admin/FacilityFormModal";
import FacilityVideoModal from "@/components/admin/FacilityVideoModal";

const KU_CENTER: [number, number] = [37.5893, 127.0327];

export default function StandaloneFacilitiesPage() {
  const [facilities, setFacilities] = useState<FacilityWithType[]>([]);
  const [facilityTypes, setFacilityTypes] = useState<FacilityType[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: string } | null>(
    null,
  );
  const [confirmDelete, setConfirmDelete] = useState<FacilityWithType | null>(
    null,
  );
  const [editingFacility, setEditingFacility] =
    useState<FacilityWithType | null>(null);
  const [videoModalFacility, setVideoModalFacility] =
    useState<FacilityWithType | null>(null);

  function showToast(message, type = "success") {
    setToast({ message, type });
  }

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    const [{ data: facilitiesData }, { data: typesData }] = await Promise.all([
      supabase
        .from("building_facilities")
        .select("*, facility_types(label, icon)")
        .is("building_id", null)
        .order("created_at"),
      supabase.from("facility_types").select("*"),
    ]);
    setFacilities(facilitiesData ?? []);
    setFacilityTypes(typesData ?? []);
    setLoading(false);
  }

  async function handleDelete(facility) {
    const error = await deleteFacility(facility);
    setConfirmDelete(null);
    if (error) {
      showToast(error, "error");
      return;
    }
    fetchData();
    showToast("시설이 삭제되었어요");
  }

  async function handleToggleInstalled(facility) {
    await supabase
      .from("building_facilities")
      .update({ is_installed: !facility.is_installed })
      .eq("id", facility.id);
    fetchData();
    showToast(
      facility.is_installed ? "미설치로 변경되었어요" : "설치로 변경되었어요",
    );
  }

  if (loading)
    return <div style={{ padding: 40, color: "#aaa" }}>불러오는 중...</div>;

  return (
    <div style={{ padding: 24, maxWidth: 800, margin: "0 auto" }}>
      <div
        style={{
          background: "#fff",
          borderRadius: 10,
          padding: 20,
          border: "1px solid #e5e7eb",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 4,
          }}
        >
          <div style={{ fontSize: 15, fontWeight: 600 }}>독립 시설</div>
          <AddFacilityButton
            buildingId={null}
            center={KU_CENTER}
            facilityTypes={facilityTypes}
            onAdd={fetchData}
            showToast={showToast}
          />
        </div>
        <div style={{ fontSize: 12, color: "#888", marginBottom: 16 }}>
          건물에 소속되지 않는 시설(야외 경사로, 독립 주차구역 등)을 관리해요.
        </div>

        {facilities.length === 0 ? (
          <div
            style={{
              textAlign: "center",
              color: "#aaa",
              fontSize: 13,
              padding: "20px 0",
            }}
          >
            등록된 독립 시설이 없어요
          </div>
        ) : (
          facilities.map((f) => (
            <div
              key={f.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "12px 0",
                borderBottom: "1px solid #f5f5f5",
              }}
            >
              <div style={{ fontSize: 20 }}>{f.facility_types?.icon}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 500 }}>
                  {f.name ?? f.facility_types?.label}
                </div>
                {f.description && (
                  <div style={{ fontSize: 12, color: "#888" }}>
                    {f.description}
                  </div>
                )}
                {f.lat && (
                  <div style={{ fontSize: 11, color: "#bbb" }}>
                    위도 {f.lat} / 경도 {f.lng}
                  </div>
                )}
              </div>
              <button
                onClick={() => setVideoModalFacility(f)}
                style={{
                  fontSize: 11,
                  padding: "4px 8px",
                  borderRadius: 6,
                  border: "1px solid",
                  cursor: "pointer",
                  fontWeight: 500,
                  background: f.video_url ? "#EFF6FF" : "none",
                  borderColor: f.video_url ? "#2563EB" : "#d1d5db",
                  color: f.video_url ? "#2563EB" : "#6b7280",
                }}
              >
                {f.video_url ? "동영상 ✓" : "동영상"}
              </button>
              <button
                onClick={() => handleToggleInstalled(f)}
                style={{
                  fontSize: 12,
                  padding: "4px 10px",
                  borderRadius: 20,
                  border: "none",
                  cursor: "pointer",
                  fontWeight: 500,
                  background: f.is_installed ? "#EAF3DE" : "#FCEBEB",
                  color: f.is_installed ? "#3B6D11" : "#A32D2D",
                }}
              >
                {f.is_installed ? "설치" : "미설치"}
              </button>
              <button
                onClick={() => setEditingFacility(f)}
                style={{
                  fontSize: 12,
                  color: "#2563EB",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                수정
              </button>
              <button
                onClick={() => setConfirmDelete(f)}
                style={{
                  fontSize: 12,
                  color: "#DC2626",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                삭제
              </button>
            </div>
          ))
        )}
      </div>

      {editingFacility && (
        <FacilityFormModal
          buildingId={null}
          center={
            editingFacility.lat != null && editingFacility.lng != null
              ? [editingFacility.lat, editingFacility.lng]
              : KU_CENTER
          }
          facilityTypes={facilityTypes}
          facility={editingFacility}
          onClose={() => setEditingFacility(null)}
          onSaved={() => {
            setEditingFacility(null);
            fetchData();
          }}
          showToast={showToast}
        />
      )}

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      {confirmDelete && (
        <ConfirmModal
          message="시설을 삭제할까요?"
          description="삭제한 시설은 복구할 수 없어요."
          confirmLabel="삭제"
          onConfirm={() => handleDelete(confirmDelete)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}

      {videoModalFacility && (
        <FacilityVideoModal
          facility={videoModalFacility}
          onUpdate={() => {
            fetchData();
            setVideoModalFacility((f) => (f ? { ...f } : null));
          }}
          showToast={showToast}
          onClose={() => setVideoModalFacility(null)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: NAV 메뉴 추가**

`src/app/admin/dashboard/layout.tsx` 10~13행:

```tsx
const NAV = [
  { label: "🏢 건물 관리", href: "/admin/dashboard/buildings" },
  { label: "📍 독립 시설", href: "/admin/dashboard/facilities" },
  { label: "📐 경사도 경로", href: "/admin/dashboard/slopes" },
];
```

- [ ] **Step 3: 검증**

Run: `npm run typecheck && npm run lint && npm test`
Expected: 모두 PASS

- [ ] **Step 4: 커밋**

```bash
git add src/app/admin/dashboard/facilities/page.tsx src/app/admin/dashboard/layout.tsx
git commit -m "feat: 독립 시설 관리 페이지 및 대시보드 메뉴 추가"
```

---

### Task 6: 지도 팝업 건물명 조건부 렌더

독립 시설은 `buildings` 조인이 null이라 팝업 하단에 빈 줄이 생긴다.

**Files:**

- Modify: `src/components/map/FacilityMarkers.tsx:54-56`

- [ ] **Step 1: 수정**

기존:

```tsx
<div style={{ fontSize: 11, color: "#aaa", marginTop: 4 }}>
  {f.buildings?.name}
</div>
```

변경:

```tsx
{
  f.buildings?.name && (
    <div style={{ fontSize: 11, color: "#aaa", marginTop: 4 }}>
      {f.buildings.name}
    </div>
  );
}
```

- [ ] **Step 2: 검증**

Run: `npm run typecheck && npm run lint && npm test`
Expected: 모두 PASS

- [ ] **Step 3: 커밋**

```bash
git add src/components/map/FacilityMarkers.tsx
git commit -m "fix: 시설 팝업에서 건물명 없는 경우 빈 줄 제거"
```

---

### Task 7: 건물 대시보드 통계에서 독립 시설 제외

`src/app/admin/dashboard/buildings/page.tsx`의 `stats`는 전체
`building_facilities`를 세므로 독립 시설이 건물 유형 통계에 섞인다.
쿼리 단계에서 제외한다.

**Files:**

- Modify: `src/app/admin/dashboard/buildings/page.tsx:30`

- [ ] **Step 1: 수정**

기존:

```tsx
      supabase.from("building_facilities").select("building_id, facility_code"),
```

변경:

```tsx
      supabase
        .from("building_facilities")
        .select("building_id, facility_code")
        .not("building_id", "is", null),
```

- [ ] **Step 2: 검증**

Run: `npm run typecheck && npm run lint && npm test`
Expected: 모두 PASS

- [ ] **Step 3: 커밋**

```bash
git add src/app/admin/dashboard/buildings/page.tsx
git commit -m "fix: 건물 대시보드 시설 통계에서 독립 시설 제외"
```

---

### Task 8: 최종 검증 (회귀 + 신규 동작)

**Files:** 없음 (검증만)

- [ ] **Step 1: 전체 자동 검증**

Run: `npm run typecheck && npm run lint && npm test && npm run build`
Expected: 전부 PASS. 실패 시 원인 수정 후 재실행.

- [ ] **Step 2: 수동 회귀·신규 확인 (dev 서버)**

Run: `npm run dev` 후 브라우저에서:

1. **회귀(건물 시설)** — `/admin` 로그인 → 건물 편집 페이지에서 시설 추가
   (층 정보 입력란 보이는지, 좌표 없이 저장되는지=기존 동작), 동영상 모달 열림,
   설치 토글, 삭제(동영상 있는 시설 삭제 시 R2 정리까지).
2. **신규(독립 시설)** — 대시보드 "📍 독립 시설" 진입 → 추가 모달에서
   층 정보 입력란이 **없고**, 좌표 없이 저장 시 "지도를 클릭해 위치를
   선택해주세요"로 차단되는지 → 좌표 선택 후 저장 → 목록 반영 →
   "수정"으로 이름·좌표 변경 후 반영 확인 → 삭제.
3. **RLS 확인** — 위 저장/수정/삭제가 실제로 성공하는지로 정책 이상 여부 확인
   (실패 시 오류 토스트가 뜨므로 조용한 실패는 없음).
4. **통계** — 건물 관리 대시보드의 유형별 통계에 독립 시설이 안 섞이는지 확인.
5. **지도** — `/` 에서 해당 유형 필터 켜고 독립 시설 마커 확인, 팝업에 건물명
   줄이 없는지 확인. (`/api/facilities`는 revalidate 3600이라 dev 캐시가 남으면
   서버 재시작 후 확인.)
6. 확인용으로 만든 독립 시설은 관리 페이지에서 삭제.

- [ ] **Step 3: 종료 보고**

push·PR은 하지 않는다. 사용자에게 결과(검증 출력 요약, 커밋 목록) 보고 후 대기.
