"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";

export default function Dashboard() {
  const [buildings, setBuildings] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const router = useRouter();

  useEffect(() => {
    async function init() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push("/admin");
        return;
      }
      setUser(user);
      fetchBuildings();
    }
    init();
  }, []);

  async function fetchBuildings() {
    const { data } = await supabase.from("buildings").select("*").order("name");
    setBuildings(data ?? []);
    setLoading(false);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/admin");
  }

  const filtered = buildings
    .filter(
      (b) =>
        b.name?.includes(search) ||
        b.name_en?.toLowerCase().includes(search.toLowerCase()),
    )
    .sort((a, b) => {
      if (a.is_deleted === b.is_deleted) return 0;
      return a.is_deleted ? 1 : -1;
    });

  return (
    <div style={{ minHeight: "100vh", background: "#f5f5f5" }}>
      {/* 헤더 */}
      <div
        style={{
          background: "#fff",
          borderBottom: "1px solid #e5e7eb",
          padding: "16px 24px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div style={{ fontSize: 18, fontWeight: 600 }}>
          모두의 캠퍼스 — 관리자
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <span style={{ fontSize: 13, color: "#888" }}>{user?.email}</span>
          <button
            onClick={() => router.push("/")}
            style={{
              fontSize: 13,
              color: "#2563EB",
              background: "none",
              border: "1px solid #2563EB",
              borderRadius: 6,
              padding: "6px 12px",
              cursor: "pointer",
            }}
          >
            ← 지도 보기
          </button>
          <button
            onClick={handleLogout}
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
            로그아웃
          </button>
        </div>
      </div>

      <div style={{ padding: 24 }}>
        {/* 타이틀 */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 16,
          }}
        >
          <div style={{ fontSize: 16, fontWeight: 600 }}>건물 목록</div>
          <span style={{ fontSize: 13, color: "#888" }}>
            총 {buildings.length}개
          </span>
        </div>

        {/* 검색창 + 건물 추가 버튼 */}
        <div
          style={{
            display: "flex",
            gap: 12,
            alignItems: "center",
            marginBottom: 20,
          }}
        >
          <div style={{ position: "relative", maxWidth: 700, flex: 1 }}>
            <span
              style={{
                position: "absolute",
                left: 12,
                top: "50%",
                transform: "translateY(-50%)",
                fontSize: 15,
                color: "#aaa",
              }}
            >
              🔍
            </span>
            <input
              type="text"
              placeholder="건물명으로 검색..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: "100%",
                padding: "10px 16px 10px 36px",
                border: "1px solid #e5e7eb",
                borderRadius: 8,
                fontSize: 14,
                outline: "none",
                background: "#fff",
                boxSizing: "border-box",
              }}
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                style={{
                  position: "absolute",
                  right: 12,
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  fontSize: 15,
                  color: "#aaa",
                }}
              >
                ✕
              </button>
            )}
          </div>

          {/* 건물 추가 버튼 */}
          <button
            onClick={() => router.push("/admin/buildings/new")}
            style={{
              flexShrink: 0,
              padding: "10px 18px",
              background: "#2563EB",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 500,
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            + 건물 추가
          </button>
        </div>

        {/* 목록 */}
        {loading ? (
          <div style={{ textAlign: "center", color: "#aaa", paddingTop: 40 }}>
            불러오는 중...
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: "center", color: "#aaa", paddingTop: 40 }}>
            {search ? `"${search}" 검색 결과가 없어요` : "등록된 건물이 없어요"}
          </div>
        ) : (
          <>
            {search && (
              <div style={{ fontSize: 13, color: "#888", marginBottom: 12 }}>
                {filtered.length}개 검색됨
              </div>
            )}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
                gap: 16,
              }}
            >
              {filtered.map((b) => (
                <div
                  key={b.id}
                  onClick={() => router.push(`/admin/buildings/${b.id}`)}
                  style={{
                    background: "#fff",
                    borderRadius: 10,
                    padding: 20,
                    border: "1px solid #e5e7eb",
                    cursor: "pointer",
                    transition: "box-shadow 0.15s",
                  }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.boxShadow =
                      "0 4px 12px rgba(0,0,0,0.1)")
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.boxShadow = "none")
                  }
                >
                  <div
                    style={{
                      fontSize: 15,
                      fontWeight: 600,
                      color: "#111",
                      marginBottom: 4,
                    }}
                  >
                    {b.name}
                  </div>
                  <div
                    style={{ fontSize: 12, color: "#888", marginBottom: 12 }}
                  >
                    {b.name_en ?? "—"}
                  </div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <div
                      style={{ display: "flex", gap: 6, alignItems: "center" }}
                    >
                      <span
                        style={{
                          fontSize: 12,
                          color: "#2563EB",
                          background: "#EFF6FF",
                          padding: "3px 8px",
                          borderRadius: 20,
                        }}
                      >
                        {b.campus}
                      </span>
                      {b.is_deleted && (
                        <span
                          style={{
                            fontSize: 12,
                            color: "#fff",
                            background: "#DC2626",
                            padding: "3px 8px",
                            borderRadius: 20,
                          }}
                        >
                          삭제됨
                        </span>
                      )}
                    </div>
                    {b.last_updated && (
                      <span style={{ fontSize: 11, color: "#bbb" }}>
                        {b.last_updated}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
