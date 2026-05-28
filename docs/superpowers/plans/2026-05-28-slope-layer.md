# Slope Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** GPX 파일을 업로드해 구간별 경사도를 계산·저장하고, 메인 지도에 색상 폴리라인 레이어로 표시하는 기능 구현

**Architecture:** 관리자가 `/admin/dashboard/slopes`에서 GPX 파일을 업로드하면 브라우저에서 파싱·경사도 계산 후 Supabase `slope_segments` 테이블에 저장한다. 메인 지도(`Map.js`)는 `/api/slopes`를 통해 데이터를 가져와 `SlopeLayer` 컴포넌트로 경사도별 색상 폴리라인을 렌더링한다. 대시보드는 `layout.js`로 공통 헤더+사이드바를 추출해 건물 관리와 경사도 관리로 분기한다.

**Tech Stack:** Next.js 16.2.4 (App Router, JS), react-leaflet 5.0.0, Leaflet 1.9.4, Supabase (@supabase/supabase-js 2.105.0), DOMParser (브라우저 내장), Haversine 공식

---

## 전제 조건: Supabase 테이블 생성 (수동 실행)

코드 작업 전 Supabase SQL Editor에서 아래 SQL을 실행해야 한다.

```sql
create table slope_segments (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  gpx_file    text,
  segments    jsonb not null,
  created_at  timestamptz default now()
);

alter table slope_segments enable row level security;

create policy "anon read" on slope_segments
  for select using (true);

create policy "auth all" on slope_segments
  for all using (auth.role() = 'authenticated');
```

---

## 파일 구조

| 동작 | 파일 | 역할 |
|------|------|------|
| 생성 | `src/app/api/slopes/route.js` | GET `/api/slopes` — slope_segments 전체 조회 |
| 생성 | `src/components/SlopeLayer.js` | Leaflet Polyline 경사도 레이어 컴포넌트 |
| 생성 | `src/app/admin/dashboard/layout.js` | 대시보드 공통 헤더 + 사이드바 레이아웃 |
| 생성 | `src/app/admin/dashboard/buildings/page.js` | 건물 관리 (기존 dashboard/page.js 내용 이동, 헤더·인증 제거) |
| 수정 | `src/app/admin/dashboard/page.js` | `/admin/dashboard/buildings` redirect로 교체 |
| 생성 | `src/app/admin/dashboard/slopes/page.js` | GPX 업로드 + 경사도 경로 목록 관리 |
| 수정 | `src/components/Map.js` | 경사도 토글 버튼 + SlopeLayer 렌더 추가 |

---

## Task 1: GET /api/slopes API 라우트

**Files:**
- Create: `src/app/api/slopes/route.js`

- [ ] **Step 1: 파일 생성**

```js
// src/app/api/slopes/route.js
import { supabase } from "@/lib/supabaseClient";
import { NextResponse } from "next/server";

export async function GET() {
  const { data, error } = await supabase
    .from("slope_segments")
    .select("id, name, segments");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}
```

- [ ] **Step 2: 빌드 검증**

```bash
cd c:\Users\servi\projects\korea-univ-project
npm run build
```

Expected: 에러 없이 빌드 성공 (또는 기존 에러와 동일)

- [ ] **Step 3: 커밋**

```bash
git add src/app/api/slopes/route.js
git commit -m "feat: add GET /api/slopes route"
```

---

## Task 2: SlopeLayer 컴포넌트

**Files:**
- Create: `src/components/SlopeLayer.js`

경사도 기준:
- `slope < 5%` → `#22c55e` (녹색, 통행 가능)
- `5% ≤ slope < 8%` → `#facc15` (노란색, 주의)
- `slope ≥ 8%` → `#ef4444` (빨간색, 통행 어려움)

연속된 동일 색상 구간은 하나의 Polyline으로 묶어 렌더링 횟수 최소화.
공유 끝점(endpoint)을 next 구간 시작점으로 재사용해 폴리라인 간 갭 방지.

- [ ] **Step 1: 파일 생성**

```js
// src/components/SlopeLayer.js
"use client";
import { Polyline } from "react-leaflet";

function slopeColor(slope) {
  if (slope >= 8) return "#ef4444";
  if (slope >= 5) return "#facc15";
  return "#22c55e";
}

export default function SlopeLayer({ slopes }) {
  return slopes.flatMap((route) => {
    const segs = route.segments;
    if (!segs?.length) return [];

    const groups = [];
    let group = null;

    for (let i = 1; i < segs.length; i++) {
      const color = slopeColor(segs[i].slope);
      if (!group || group.color !== color) {
        group = { color, points: [[segs[i - 1].lat, segs[i - 1].lng]] };
        groups.push(group);
      }
      group.points.push([segs[i].lat, segs[i].lng]);
    }

    return groups.map((g, idx) => (
      <Polyline
        key={`${route.id}-${idx}`}
        positions={g.points}
        pathOptions={{ color: g.color, weight: 5, opacity: 0.85 }}
      />
    ));
  });
}
```

- [ ] **Step 2: 커밋**

```bash
git add src/components/SlopeLayer.js
git commit -m "feat: add SlopeLayer polyline component"
```

---

## Task 3: 대시보드 공통 layout.js

**Files:**
- Create: `src/app/admin/dashboard/layout.js`

layout.js가 담당:
- Supabase 인증 체크 (미인증 시 `/admin` redirect)
- 공통 헤더 (타이틀, 이메일, 지도 보기, 로그아웃)
- 사이드바/탭 내비게이션
- `{children}` 렌더

이 파일이 인증을 처리하므로 `buildings/page.js`, `slopes/page.js`는 인증 체크 불필요.

- [ ] **Step 1: 파일 생성**

```js
// src/app/admin/dashboard/layout.js
"use client";
import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

const NAV = [
  { label: "🏢 건물 관리", href: "/admin/dashboard/buildings" },
  { label: "📐 경사도 경로", href: "/admin/dashboard/slopes" },
];

export default function DashboardLayout({ children }) {
  const [user, setUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { router.push("/admin"); return; }
      setUser(user);
      setAuthChecked(true);
    });
  }, []);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/admin");
  }

  if (!authChecked) {
    return (
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        minHeight: "100vh", color: "#aaa", fontSize: 14,
      }}>
        불러오는 중...
      </div>
    );
  }

  const navItems = NAV.map((item) => {
    const active = pathname === item.href || pathname.startsWith(item.href + "/");
    return (
      <Link
        key={item.href}
        href={item.href}
        style={{
          display: "block",
          padding: isMobile ? "6px 12px" : "10px 16px",
          borderRadius: 8,
          fontSize: 14,
          fontWeight: active ? 600 : 400,
          color: active ? "#2563EB" : "#444",
          background: active ? "#EFF6FF" : "transparent",
          textDecoration: "none",
          transition: "background 0.15s",
          whiteSpace: "nowrap",
        }}
      >
        {item.label}
      </Link>
    );
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      {/* 헤더 */}
      <div style={{
        background: "#fff",
        borderBottom: "1px solid #e5e7eb",
        padding: "16px 24px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        flexShrink: 0,
      }}>
        <div style={{ fontSize: 18, fontWeight: 600 }}>모두의 캠퍼스 — 관리자</div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          {!isMobile && (
            <span style={{ fontSize: 13, color: "#888" }}>{user?.email}</span>
          )}
          <button
            onClick={() => router.push("/")}
            style={{
              fontSize: 13, color: "#2563EB", background: "none",
              border: "1px solid #2563EB", borderRadius: 6,
              padding: "6px 12px", cursor: "pointer",
            }}
          >
            ← 지도 보기
          </button>
          <button
            onClick={handleLogout}
            style={{
              fontSize: 13, color: "#DC2626", background: "none",
              border: "1px solid #DC2626", borderRadius: 6,
              padding: "6px 12px", cursor: "pointer",
            }}
          >
            로그아웃
          </button>
        </div>
      </div>

      <div style={{ display: "flex", flex: 1 }}>
        {/* 데스크탑: 사이드바 */}
        {!isMobile && (
          <div style={{
            width: 200,
            background: "#fff",
            borderRight: "1px solid #e5e7eb",
            padding: 16,
            flexShrink: 0,
          }}>
            {navItems}
          </div>
        )}

        <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
          {/* 모바일: 탭바 */}
          {isMobile && (
            <div style={{
              background: "#fff",
              borderBottom: "1px solid #e5e7eb",
              padding: "8px 16px",
              display: "flex",
              gap: 8,
            }}>
              {navItems}
            </div>
          )}

          {/* 콘텐츠 */}
          <div style={{ flex: 1, background: "#f5f5f5" }}>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 빌드 검증 (buildings 디렉토리 없으면 에러 날 수 있으므로 Task 4 이후 검증)**

이 단계는 Task 5 이후 빌드 검증으로 대체

- [ ] **Step 3: 커밋**

```bash
git add src/app/admin/dashboard/layout.js
git commit -m "feat: add admin dashboard layout with sidebar nav"
```

---

## Task 4: buildings/page.js — 건물 관리 페이지

기존 `dashboard/page.js`에서 헤더 JSX(lines 84-102)와 `user` 상태, auth 체크 제거. `SummaryCard` 컴포넌트 함께 이동. `handleLogout` 제거 (layout이 처리).

**Files:**
- Create: `src/app/admin/dashboard/buildings/page.js`

- [ ] **Step 1: 파일 생성**

```js
// src/app/admin/dashboard/buildings/page.js
"use client";

import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";

export default function BuildingsPage() {
  const [buildings, setBuildings] = useState([]);
  const [facilities, setFacilities] = useState([]);
  const [facilityTypes, setFacilityTypes] = useState([]);
  const [search, setSearch] = useState("");
  const [registrationFilter, setRegistrationFilter] = useState(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    const [{ data: b }, { data: f }, { data: ft }] = await Promise.all([
      supabase.from("buildings").select("*").order("name"),
      supabase.from("building_facilities").select("building_id, facility_code"),
      supabase.from("facility_types").select("code, label"),
    ]);
    setBuildings(b ?? []);
    setFacilities(f ?? []);
    setFacilityTypes(ft ?? []);
    setLoading(false);
  }

  const stats = useMemo(() => {
    const activeBuildings = buildings.filter((b) => !b.is_deleted);
    const registeredIds = new Set(facilities.map((f) => f.building_id));
    const registeredCount = activeBuildings.filter((b) => registeredIds.has(b.id)).length;
    const unregisteredCount = activeBuildings.filter((b) => !registeredIds.has(b.id)).length;

    const typeCounts = {};
    for (const f of facilities) {
      typeCounts[f.facility_code] = (typeCounts[f.facility_code] ?? 0) + 1;
    }
    const typeBreakdown = facilityTypes
      .map((ft) => ({ ...ft, count: typeCounts[ft.code] ?? 0 }))
      .filter((ft) => ft.count > 0)
      .sort((a, b) => b.count - a.count);

    const maxCount = typeBreakdown[0]?.count ?? 1;

    return { activeBuildings, registeredIds, registeredCount, unregisteredCount, typeBreakdown, maxCount };
  }, [buildings, facilities, facilityTypes]);

  const filtered = useMemo(() => {
    return buildings
      .filter((b) => {
        const matchSearch =
          b.name?.includes(search) ||
          b.name_en?.toLowerCase().includes(search.toLowerCase());
        const isRegistered = stats.registeredIds.has(b.id);
        const matchFilter =
          registrationFilter === null ||
          (registrationFilter === "registered" && isRegistered) ||
          (registrationFilter === "unregistered" && !isRegistered);
        return matchSearch && matchFilter;
      })
      .sort((a, b) => {
        if (a.is_deleted === b.is_deleted) return 0;
        return a.is_deleted ? 1 : -1;
      });
  }, [buildings, search, registrationFilter, stats.registeredIds]);

  return (
    <div style={{ padding: 24 }}>
      {!loading && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 16, marginBottom: 20 }}>
            <SummaryCard
              label="전체 건물"
              value={stats.activeBuildings.length}
              unit="개"
              color="#2563EB"
              active={registrationFilter === null}
              onClick={() => setRegistrationFilter(null)}
              hint="클릭하여 전체 보기"
            />
            <SummaryCard
              label="시설 등록됨"
              value={stats.registeredCount}
              unit="개"
              color="#16A34A"
              active={registrationFilter === "registered"}
              onClick={() => setRegistrationFilter((f) => f === "registered" ? null : "registered")}
              hint="클릭하여 필터"
            />
            <SummaryCard
              label="시설 미등록"
              value={stats.unregisteredCount}
              unit="개"
              color="#DC2626"
              active={registrationFilter === "unregistered"}
              onClick={() => setRegistrationFilter((f) => f === "unregistered" ? null : "unregistered")}
              hint="클릭하여 필터"
            />
            <SummaryCard label="전체 시설 수" value={facilities.length} unit="개" color="#7C3AED" />
          </div>

          {stats.typeBreakdown.length > 0 && (
            <div style={{
              background: "#fff", borderRadius: 10, border: "1px solid #e5e7eb",
              padding: 20, marginBottom: 24,
            }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#111", marginBottom: 16 }}>유형별 현황</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {stats.typeBreakdown.map((ft) => (
                  <div key={ft.code} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ width: 120, fontSize: 13, color: "#444", flexShrink: 0, textAlign: "right" }}>
                      {ft.label}
                    </div>
                    <div style={{ flex: 1, background: "#f3f4f6", borderRadius: 4, height: 14, overflow: "hidden" }}>
                      <div style={{
                        width: `${(ft.count / stats.maxCount) * 100}%`,
                        background: "#2563EB", height: "100%", borderRadius: 4,
                        transition: "width 0.4s ease",
                      }} />
                    </div>
                    <div style={{ width: 32, fontSize: 13, color: "#666", flexShrink: 0 }}>{ft.count}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ fontSize: 16, fontWeight: 600 }}>건물 목록</div>
        <span style={{ fontSize: 13, color: "#888" }}>총 {buildings.length}개</span>
      </div>

      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 20, flexWrap: "wrap" }}>
        <div style={{ position: "relative", maxWidth: 700, flex: 1 }}>
          <span style={{
            position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)",
            fontSize: 15, color: "#aaa",
          }}>🔍</span>
          <input
            type="text"
            placeholder="건물명으로 검색..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: "100%", padding: "10px 16px 10px 36px",
              border: "1px solid #e5e7eb", borderRadius: 8, fontSize: 14,
              outline: "none", background: "#fff", boxSizing: "border-box",
            }}
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              style={{
                position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)",
                background: "none", border: "none", cursor: "pointer", fontSize: 15, color: "#aaa",
              }}
            >✕</button>
          )}
        </div>
        <button
          onClick={() => router.push("/admin/buildings/new")}
          style={{
            flexShrink: 0, padding: "10px 18px", background: "#2563EB", color: "#fff",
            border: "none", borderRadius: 8, fontSize: 14, fontWeight: 500,
            cursor: "pointer", whiteSpace: "nowrap",
          }}
        >
          + 건물 추가
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", color: "#aaa", paddingTop: 40 }}>불러오는 중...</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: "center", color: "#aaa", paddingTop: 40 }}>
          {search
            ? `"${search}" 검색 결과가 없어요`
            : registrationFilter === "unregistered"
            ? "미등록 건물이 없어요"
            : registrationFilter === "registered"
            ? "등록된 건물이 없어요"
            : "건물이 없어요"}
        </div>
      ) : (
        <>
          {(search || registrationFilter) && (
            <div style={{ fontSize: 13, color: "#888", marginBottom: 12 }}>{filtered.length}개</div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 16 }}>
            {filtered.map((b) => {
              const hasNoFacility = !stats.registeredIds.has(b.id);
              return (
                <div
                  key={b.id}
                  onClick={() => router.push(`/admin/buildings/${b.id}`)}
                  style={{
                    background: "#fff", borderRadius: 10, padding: 20,
                    border: `1px solid ${hasNoFacility && !b.is_deleted ? "#FECACA" : "#e5e7eb"}`,
                    cursor: "pointer", transition: "box-shadow 0.15s",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.1)")}
                  onMouseLeave={(e) => (e.currentTarget.style.boxShadow = "none")}
                >
                  <div style={{ fontSize: 15, fontWeight: 600, color: "#111", marginBottom: 4 }}>{b.name}</div>
                  <div style={{ fontSize: 12, color: "#888", marginBottom: 12 }}>{b.name_en ?? "—"}</div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                      <span style={{
                        fontSize: 12, color: "#2563EB", background: "#EFF6FF",
                        padding: "3px 8px", borderRadius: 20,
                      }}>{b.campus}</span>
                      {hasNoFacility && !b.is_deleted && (
                        <span style={{
                          fontSize: 12, color: "#DC2626", background: "#FEF2F2",
                          padding: "3px 8px", borderRadius: 20,
                        }}>시설 미등록</span>
                      )}
                      {b.is_deleted && (
                        <span style={{
                          fontSize: 12, color: "#fff", background: "#DC2626",
                          padding: "3px 8px", borderRadius: 20,
                        }}>삭제됨</span>
                      )}
                    </div>
                    {b.last_updated && (
                      <span style={{ fontSize: 11, color: "#bbb" }}>{b.last_updated}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function SummaryCard({ label, value, unit, color, active, onClick, hint }) {
  return (
    <div
      onClick={onClick}
      style={{
        background: active ? `${color}10` : "#fff",
        borderRadius: 10, padding: "18px 20px",
        border: `1.5px solid ${active ? color : "#e5e7eb"}`,
        cursor: onClick ? "pointer" : "default",
        transition: "box-shadow 0.15s, border-color 0.15s",
        userSelect: "none",
      }}
      onMouseEnter={(e) => { if (onClick) e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.08)"; }}
      onMouseLeave={(e) => { if (onClick) e.currentTarget.style.boxShadow = "none"; }}
    >
      <div style={{ fontSize: 12, color: "#888", marginBottom: 8 }}>{label}</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
        <span style={{ fontSize: 28, fontWeight: 700, color }}>{value}</span>
        <span style={{ fontSize: 13, color: "#aaa" }}>{unit}</span>
      </div>
      {hint && <div style={{ fontSize: 11, color: "#bbb", marginTop: 6 }}>{hint}</div>}
    </div>
  );
}
```

- [ ] **Step 2: 커밋**

```bash
git add src/app/admin/dashboard/buildings/page.js
git commit -m "feat: add buildings management page under dashboard"
```

---

## Task 5: dashboard/page.js → redirect

기존 `dashboard/page.js`의 모든 내용을 redirect로 교체. "use client" 제거 → 서버 컴포넌트로 변경.

**Files:**
- Modify: `src/app/admin/dashboard/page.js` (전체 교체)

- [ ] **Step 1: 파일 전체 교체**

```js
// src/app/admin/dashboard/page.js
import { redirect } from "next/navigation";

export default function DashboardPage() {
  redirect("/admin/dashboard/buildings");
}
```

- [ ] **Step 2: 빌드 검증**

```bash
npm run build
```

Expected: 에러 없이 빌드 성공. `/admin/dashboard` 접근 시 `/admin/dashboard/buildings`로 redirect

- [ ] **Step 3: 커밋**

```bash
git add src/app/admin/dashboard/page.js
git commit -m "refactor: dashboard page redirects to /buildings, layout handles auth+nav"
```

---

## Task 6: slopes/page.js — GPX 업로드 관리 페이지

브라우저에서 GPX 파싱 → Haversine으로 거리 계산 → 경사도(%) 계산 → Supabase 저장.
경사도 > 30%는 GPS 오류로 간주, 0으로 클램프.

**Files:**
- Create: `src/app/admin/dashboard/slopes/page.js`

- [ ] **Step 1: 파일 생성**

```js
// src/app/admin/dashboard/slopes/page.js
"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";

function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) *
    Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export default function SlopesPage() {
  const [slopes, setSlopes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);

  useEffect(() => {
    fetchSlopes();
  }, []);

  async function fetchSlopes() {
    const { data } = await supabase
      .from("slope_segments")
      .select("id, name, gpx_file, segments, created_at")
      .order("created_at", { ascending: false });
    setSlopes(data ?? []);
    setLoading(false);
  }

  async function handleUpload() {
    if (!selectedFile) return;
    setUploading(true);
    try {
      const name = selectedFile.name.replace(/\.gpx$/i, "");
      const text = await selectedFile.text();
      const xml = new DOMParser().parseFromString(text, "application/xml");

      const trkpts = Array.from(xml.querySelectorAll("trkpt"));
      const points = trkpts
        .map((pt) => ({
          lat: parseFloat(pt.getAttribute("lat")),
          lng: parseFloat(pt.getAttribute("lon")),
          ele: parseFloat(pt.querySelector("ele")?.textContent ?? "NaN"),
        }))
        .filter((p) => !isNaN(p.lat) && !isNaN(p.lng) && !isNaN(p.ele));

      if (points.length < 2) {
        alert("유효한 GPS 포인트가 부족합니다 (고도 데이터 포함 최소 2개 필요).");
        return;
      }

      const segments = points.map((p, i) => {
        if (i === 0) return { lat: p.lat, lng: p.lng, ele: p.ele, slope: 0, distance: 0 };
        const prev = points[i - 1];
        const dist = haversine(prev.lat, prev.lng, p.lat, p.lng);
        const rawSlope = dist > 0 ? Math.abs((p.ele - prev.ele) / dist) * 100 : 0;
        const slope = rawSlope > 30 ? 0 : rawSlope;
        return {
          lat: p.lat,
          lng: p.lng,
          ele: p.ele,
          slope: Math.round(slope * 10) / 10,
          distance: Math.round(dist * 10) / 10,
        };
      });

      const { error } = await supabase.from("slope_segments").insert({
        name,
        gpx_file: selectedFile.name,
        segments,
      });
      if (error) throw error;

      setSelectedFile(null);
      document.getElementById("gpx-input").value = "";
      await fetchSlopes();
    } catch (err) {
      alert("업로드 실패: " + err.message);
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(id, name) {
    if (!confirm(`"${name}" 경로를 삭제하시겠습니까?`)) return;
    const { error } = await supabase.from("slope_segments").delete().eq("id", id);
    if (error) { alert("삭제 실패: " + error.message); return; }
    await fetchSlopes();
  }

  return (
    <div style={{ padding: 24 }}>
      <div style={{ fontSize: 20, fontWeight: 600, marginBottom: 24 }}>경사도 경로 관리</div>

      {/* 업로드 섹션 */}
      <div style={{
        background: "#fff", borderRadius: 10,
        border: "1px solid #e5e7eb", padding: 24, marginBottom: 24,
      }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>GPX 파일 업로드</div>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
          <input
            id="gpx-input"
            type="file"
            accept=".gpx"
            onChange={(e) => setSelectedFile(e.target.files[0] ?? null)}
            style={{ fontSize: 13 }}
          />
          <button
            onClick={handleUpload}
            disabled={!selectedFile || uploading}
            style={{
              padding: "8px 20px",
              background: selectedFile && !uploading ? "#2563EB" : "#d1d5db",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 500,
              cursor: selectedFile && !uploading ? "pointer" : "not-allowed",
            }}
          >
            {uploading ? "처리 중..." : "업로드 & 저장"}
          </button>
        </div>
        {selectedFile && (
          <div style={{ fontSize: 12, color: "#555", marginBottom: 4 }}>
            경로명: <strong>{selectedFile.name.replace(/\.gpx$/i, "")}</strong>
          </div>
        )}
        <div style={{ fontSize: 12, color: "#aaa" }}>
          Strava에서 GPX 내보내기 전 파일명을 경로명으로 변경하세요 (예: 정문-중앙광장.gpx)
        </div>
      </div>

      {/* 경로 목록 */}
      <div style={{
        background: "#fff", borderRadius: 10,
        border: "1px solid #e5e7eb", padding: 24,
      }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>
          등록된 경로 ({slopes.length}개)
        </div>
        {loading ? (
          <div style={{ color: "#aaa", fontSize: 13 }}>불러오는 중...</div>
        ) : slopes.length === 0 ? (
          <div style={{ color: "#aaa", fontSize: 13 }}>등록된 경로가 없습니다.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {slopes.map((s) => (
              <div
                key={s.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "12px 16px",
                  border: "1px solid #e5e7eb",
                  borderRadius: 8,
                }}
              >
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#111" }}>{s.name}</div>
                  <div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>
                    {s.segments?.length ?? 0}개 포인트 · {new Date(s.created_at).toLocaleDateString("ko-KR")}
                    {s.gpx_file && (
                      <span style={{ marginLeft: 8, color: "#bbb" }}>({s.gpx_file})</span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(s.id, s.name)}
                  style={{
                    fontSize: 13,
                    color: "#DC2626",
                    background: "none",
                    border: "1px solid #DC2626",
                    borderRadius: 6,
                    padding: "6px 12px",
                    cursor: "pointer",
                  }}
                >
                  삭제
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 빌드 검증**

```bash
npm run build
```

Expected: 에러 없이 빌드 성공

- [ ] **Step 3: 커밋**

```bash
git add src/app/admin/dashboard/slopes/page.js
git commit -m "feat: add slopes admin page with GPX upload and segment calculation"
```

---

## Task 7: Map.js — 경사도 토글 버튼 + SlopeLayer 렌더

**Files:**
- Modify: `src/components/Map.js`

변경 사항:
1. `SlopeLayer` import 추가 (line 19 이후)
2. `showSlope`, `slopes` state 추가 (line 329 `tileMode` 아래)
3. `/api/slopes` fetch useEffect 추가 (facility_types useEffect 아래 ~line 457)
4. `<SlopeLayer>` MapContainer 내부 렌더 (`</MapContainer>` 닫기 태그 앞 ~line 830)
5. 경사도 토글 버튼 추가 (피드백 div 닫힘 ~line 965 이후)

버튼 위치: 좌측, 피드백 버튼 아래
- 데스크탑: `top: 200px, left: 16px`
- 모바일: `top: 100px, left: 16px`

- [ ] **Step 1: SlopeLayer import 추가**

[src/components/Map.js](src/components/Map.js) line 18 (`import { useLanguage }` 줄) 다음에 추가:

```js
// 기존 line 18:
import { useLanguage } from "@/lib/LanguageContext";
// 추가:
import SlopeLayer from "@/components/SlopeLayer";
```

Edit `old_string`:
```
import { useLanguage } from "@/lib/LanguageContext";
```
`new_string`:
```
import { useLanguage } from "@/lib/LanguageContext";
import SlopeLayer from "@/components/SlopeLayer";
```

- [ ] **Step 2: showSlope, slopes state 추가**

line 329 `const [tileMode, setTileMode] = useState("street");` 다음에 추가:

Edit `old_string`:
```
  const [tileMode, setTileMode] = useState("street");
  const { lang, setLang, t } = useLanguage();
```
`new_string`:
```
  const [tileMode, setTileMode] = useState("street");
  const [showSlope, setShowSlope] = useState(false);
  const [slopes, setSlopes] = useState([]);
  const { lang, setLang, t } = useLanguage();
```

- [ ] **Step 3: /api/slopes fetch useEffect 추가**

facility_types useEffect 블록(line ~447-457) 다음에 추가:

Edit `old_string`:
```
  // facility_types DB에서 동적 로드
  useEffect(() => {
    supabase
      .from("facility_types")
      .select("code, label, label_en, label_zh, icon")
      .then(({ data }) => {
        if (!data) return;
        setFacilityTypes(data);
        setActiveTypes(Object.fromEntries(data.map((ft) => [ft.code, false])));
      });
  }, []);
```
`new_string`:
```
  // facility_types DB에서 동적 로드
  useEffect(() => {
    supabase
      .from("facility_types")
      .select("code, label, label_en, label_zh, icon")
      .then(({ data }) => {
        if (!data) return;
        setFacilityTypes(data);
        setActiveTypes(Object.fromEntries(data.map((ft) => [ft.code, false])));
      });
  }, []);

  // 경사도 경로 데이터
  useEffect(() => {
    fetch("/api/slopes")
      .then((r) => r.json())
      .then((data) => setSlopes(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);
```

- [ ] **Step 4: SlopeLayer MapContainer 내부 렌더 추가**

지하철역 마커 뒤, `</MapContainer>` 앞에 추가:

Edit `old_string`:
```
      </MapContainer>

      {/* 항공사진 출처 라벨 */}
```
`new_string`:
```
        {showSlope && slopes.length > 0 && (
          <SlopeLayer slopes={slopes} />
        )}
      </MapContainer>

      {/* 항공사진 출처 라벨 */}
```

- [ ] **Step 5: 경사도 토글 버튼 추가**

피드백 div 닫힘(`</div>` 블록 — `onMouseLeave` div 닫힘 line ~965) 다음에 추가:

Edit `old_string`:
```
      {/* 즐겨찾기 패널 — 모바일: top:64로 검색창과 안 겹치게 */}
```
`new_string`:
```
      {/* 경사도 레이어 토글 버튼 */}
      <button
        onClick={() => setShowSlope((v) => !v)}
        title={showSlope ? "경사도 숨기기" : "경사도 표시"}
        style={{
          position: "absolute",
          ...(isMobile ? { top: 100, left: 16 } : { top: 200, left: 16 }),
          zIndex: 1000,
          height: 28,
          padding: "0 10px",
          borderRadius: 8,
          background: showSlope ? "#2563EB" : "#fff",
          border: "1px solid #ddd",
          boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
          cursor: "pointer",
          fontSize: 12,
          color: showSlope ? "#fff" : "#555",
          fontWeight: 500,
          display: "flex",
          alignItems: "center",
          gap: 4,
          whiteSpace: "nowrap",
        }}
      >
        📐 경사도
      </button>

      {/* 즐겨찾기 패널 — 모바일: top:64로 검색창과 안 겹치게 */}
```

- [ ] **Step 6: 빌드 검증**

```bash
npm run build
```

Expected: 에러 없이 빌드 성공

- [ ] **Step 7: 수동 검증**

`npm run dev` 실행 후:
1. `http://localhost:3000` — 지도 로드 확인
2. 좌측 피드백 버튼 아래 "📐 경사도" 버튼 존재 확인
3. (slope_segments 데이터 없으면 버튼 클릭해도 폴리라인 없음 — 정상)
4. `http://localhost:3000/admin/dashboard` → `/admin/dashboard/buildings` redirect 확인
5. 사이드바에 "🏢 건물 관리" / "📐 경사도 경로" 메뉴 확인
6. `/admin/dashboard/slopes` — GPX 업로드 UI 확인

- [ ] **Step 8: 최종 커밋**

```bash
git add src/components/Map.js
git commit -m "feat: add slope layer toggle button and SlopeLayer render to main map"
```

---

## 경사도 색상 범례 (참고)

지도에 별도 범례 UI는 MVP 범위 밖. 필요 시 추후 추가.

| 색상 | 경사도 | 의미 |
|------|--------|------|
| 🟢 `#22c55e` | 0~5% 미만 | 통행 가능 |
| 🟡 `#facc15` | 5~8% | 주의 구간 |
| 🔴 `#ef4444` | 8% 이상 | 통행 어려움 |
