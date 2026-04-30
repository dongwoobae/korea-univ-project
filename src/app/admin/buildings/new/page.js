"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import Toast from "@/components/Toast";

const PolygonEditor = dynamic(() => import("@/components/PolygonEditor"), { ssr: false });

const inputStyle = {
  width: "100%",
  padding: "10px 12px",
  border: "1px solid #e5e7eb",
  borderRadius: 8,
  fontSize: 14,
  outline: "none",
  boxSizing: "border-box",
  background: "#fff",
};

const labelStyle = {
  fontSize: 13,
  fontWeight: 500,
  color: "#555",
  display: "block",
  marginBottom: 6,
};

export default function NewBuilding() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [campus, setCampus] = useState("서울");
  const [geojson, setGeojson] = useState(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);

  function showToast(message, type = "success") {
    setToast({ message, type });
  }

  // 인증 확인
  useEffect(() => {
    async function check() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) router.push("/admin");
    }
    check();
  }, []);

  async function handleSave() {
    if (!name.trim()) {
      showToast("건물 이름을 입력해주세요", "error");
      return;
    }
    if (!geojson) {
      showToast("폴리곤을 그려주세요", "error");
      return;
    }

    setSaving(true);

    // OSM id와 충돌하지 않도록 음수 timestamp 사용
    const newId = -Date.now();

    const { error } = await supabase.from("buildings").insert({
      id: newId,
      name: name.trim(),
      name_en: nameEn.trim() || null,
      campus,
      geojson,
    });

    setSaving(false);

    if (error) {
      showToast("저장에 실패했어요: " + error.message, "error");
      return;
    }

    showToast("건물이 추가되었어요!");
    setTimeout(() => router.push(`/admin/buildings/${newId}`), 800);
  }

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
        <div style={{ fontSize: 18, fontWeight: 600 }}>새 건물 추가</div>
        <button
          onClick={() => router.push("/admin/dashboard")}
          style={{ fontSize: 13, color: "#888", background: "none", border: "none", cursor: "pointer" }}
        >
          ← 대시보드
        </button>
      </div>

      <div style={{ maxWidth: 720, margin: "0 auto", padding: 24 }}>
        {/* 기본 정보 */}
        <div style={{ background: "#fff", borderRadius: 10, padding: 24, border: "1px solid #e5e7eb", marginBottom: 20 }}>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 20 }}>기본 정보</div>

          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>건물 이름 *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="예: 신공학관"
              style={inputStyle}
            />
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>영문 이름</label>
            <input
              type="text"
              value={nameEn}
              onChange={(e) => setNameEn(e.target.value)}
              placeholder="예: New Engineering Building"
              style={inputStyle}
            />
          </div>

          <div>
            <label style={labelStyle}>캠퍼스</label>
            <select
              value={campus}
              onChange={(e) => setCampus(e.target.value)}
              style={inputStyle}
            >
              <option value="서울">서울</option>
              <option value="의료원">의료원</option>
              <option value="녹지">녹지</option>
            </select>
          </div>
        </div>

        {/* 폴리곤 */}
        <div style={{ background: "#fff", borderRadius: 10, padding: 24, border: "1px solid #e5e7eb", marginBottom: 20 }}>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>건물 폴리곤 *</div>
          <div style={{ fontSize: 13, color: "#888", marginBottom: 16 }}>
            지도에서 건물 외곽선을 따라 폴리곤을 그려주세요.
          </div>
          <PolygonEditor
            geojson={null}
            onSave={(newGeojson) => {
              setGeojson(newGeojson);
              showToast("폴리곤이 저장되었어요. 아래 저장 버튼을 눌러 완료하세요.", "info");
            }}
            onCancel={() => router.push("/admin/dashboard")}
          />
          {geojson && (
            <div style={{ marginTop: 12, fontSize: 13, color: "#3B6D11", fontWeight: 500 }}>
              ✅ 폴리곤 준비 완료
            </div>
          )}
        </div>

        {/* 저장 버튼 */}
        <div style={{ display: "flex", gap: 12 }}>
          <button
            onClick={() => router.push("/admin/dashboard")}
            style={{
              flex: 1,
              padding: "12px",
              background: "#fff",
              border: "1px solid #e5e7eb",
              borderRadius: 8,
              fontSize: 14,
              cursor: "pointer",
              color: "#555",
            }}
          >
            취소
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              flex: 2,
              padding: "12px",
              background: saving ? "#93C5FD" : "#2563EB",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 600,
              cursor: saving ? "not-allowed" : "pointer",
              transition: "background 0.15s",
            }}
          >
            {saving ? "저장 중..." : "건물 저장"}
          </button>
        </div>
      </div>

      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}
    </div>
  );
}
