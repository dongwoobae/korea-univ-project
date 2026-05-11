"use client";

import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";

export default function Dashboard() {
  const [buildings, setBuildings] = useState([]);
  const [facilities, setFacilities] = useState([]);
  const [facilityTypes, setFacilityTypes] = useState([]);
  const [search, setSearch] = useState("");
  const [showUnregistered, setShowUnregistered] = useState(false);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const router = useRouter();

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/admin"); return; }
      setUser(user);
      fetchData();
    }
    init();
  }, []);

  async function fetchData() {
    const [{ data: b }, { data: f }, { data: ft }] = await Promise.all([
      supabase.from("buildings").select("*").order("name"),
      supabase.from("building_facilities").select("building_id, facility_type_id"),
      supabase.from("facility_types").select("id, label"),
    ]);
    setBuildings(b ?? []);
    setFacilities(f ?? []);
    setFacilityTypes(ft ?? []);
    setLoading(false);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/admin");
  }

  const stats = useMemo(() => {
    const activeBuildings = buildings.filter((b) => !b.is_deleted);
    const registeredIds = new Set(facilities.map((f) => f.building_id));
    const registeredCount = activeBuildings.filter((b) => registeredIds.has(b.id)).length;
    const unregisteredCount = activeBuildings.filter((b) => !registeredIds.has(b.id)).length;

    const typeCounts = {};
    for (const f of facilities) {
      typeCounts[f.facility_type_id] = (typeCounts[f.facility_type_id] ?? 0) + 1;
    }
    const typeBreakdown = facilityTypes
      .map((ft) => ({ ...ft, count: typeCounts[ft.id] ?? 0 }))
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
        const matchUnreg = !showUnregistered || !stats.registeredIds.has(b.id);
        return matchSearch && matchUnreg;
      })
      .sort((a, b) => {
        if (a.is_deleted === b.is_deleted) return 0;
        return a.is_deleted ? 1 : -1;
      });
  }, [buildings, search, showUnregistered, stats.registeredIds]);

  return (
    <div style={{ minHeight: "100vh", background: "#f5f5f5" }}>
      {/* 헤더 */}
      <div style={{
        background: "#fff", borderBottom: "1px solid #e5e7eb",
        padding: "16px 24px", display: "flex", justifyContent: "space-between", alignItems: "center",
      }}>
        <div style={{ fontSize: 18, fontWeight: 600 }}>모두의 캠퍼스 — 관리자</div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <span style={{ fontSize: 13, color: "#888" }}>{user?.email}</span>
          <button onClick={() => router.push("/")} style={{
            fontSize: 13, color: "#2563EB", background: "none",
            border: "1px solid #2563EB", borderRadius: 6, padding: "6px 12px", cursor: "pointer",
          }}>← 지도 보기</button>
          <button onClick={handleLogout} style={{
            fontSize: 13, color: "#DC2626", background: "none",
            border: "1px solid #DC2626", borderRadius: 6, padding: "6px 12px", cursor: "pointer",
          }}>로그아웃</button>
        </div>
      </div>

      <div style={{ padding: 24 }}>
        {/* 요약 카드 */}
        {!loading && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 16, marginBottom: 20 }}>
              <SummaryCard label="전체 건물" value={stats.activeBuildings.length} unit="개" color="#2563EB" />
              <SummaryCard label="시설 등록됨" value={stats.registeredCount} unit="개" color="#16A34A" />
              <SummaryCard
                label="시설 미등록"
                value={stats.unregisteredCount}
                unit="개"
                color="#DC2626"
                active={showUnregistered}
                onClick={() => setShowUnregistered((v) => !v)}
                hint="클릭하여 필터"
              />
              <SummaryCard label="전체 시설 수" value={facilities.length} unit="개" color="#7C3AED" />
            </div>

            {/* 유형별 현황 */}
            {stats.typeBreakdown.length > 0 && (
              <div style={{
                background: "#fff", borderRadius: 10, border: "1px solid #e5e7eb",
                padding: 20, marginBottom: 24,
              }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: "#111", marginBottom: 16 }}>유형별 현황</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {stats.typeBreakdown.map((ft) => (
                    <div key={ft.id} style={{ display: "flex", alignItems: "center", gap: 12 }}>
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

        {/* 건물 목록 타이틀 */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ fontSize: 16, fontWeight: 600 }}>건물 목록</div>
          <span style={{ fontSize: 13, color: "#888" }}>총 {buildings.length}개</span>
        </div>

        {/* 검색창 + 필터 + 건물 추가 */}
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
              <button onClick={() => setSearch("")} style={{
                position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)",
                background: "none", border: "none", cursor: "pointer", fontSize: 15, color: "#aaa",
              }}>✕</button>
            )}
          </div>

          <button
            onClick={() => setShowUnregistered((v) => !v)}
            style={{
              flexShrink: 0, padding: "10px 16px",
              background: showUnregistered ? "#FEF2F2" : "#fff",
              color: showUnregistered ? "#DC2626" : "#666",
              border: `1px solid ${showUnregistered ? "#DC2626" : "#e5e7eb"}`,
              borderRadius: 8, fontSize: 14, fontWeight: showUnregistered ? 600 : 400,
              cursor: "pointer", whiteSpace: "nowrap",
            }}
          >
            {showUnregistered ? "✕ 미등록 필터 해제" : "시설 미등록 건물만 보기"}
          </button>

          <button onClick={() => router.push("/admin/buildings/new")} style={{
            flexShrink: 0, padding: "10px 18px", background: "#2563EB", color: "#fff",
            border: "none", borderRadius: 8, fontSize: 14, fontWeight: 500,
            cursor: "pointer", whiteSpace: "nowrap",
          }}>+ 건물 추가</button>
        </div>

        {/* 목록 */}
        {loading ? (
          <div style={{ textAlign: "center", color: "#aaa", paddingTop: 40 }}>불러오는 중...</div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: "center", color: "#aaa", paddingTop: 40 }}>
            {search ? `"${search}" 검색 결과가 없어요` : showUnregistered ? "미등록 건물이 없어요" : "등록된 건물이 없어요"}
          </div>
        ) : (
          <>
            {(search || showUnregistered) && (
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
