"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import Toast from "@/components/Toast";
import { inferCampusFromGeometry } from "@/lib/campusGeometry";
import { useCampusBoundaries } from "@/lib/useCampusBoundaries";
import type { Feature, Polygon } from "geojson";
import type { Json } from "@supabase-types";
import "../../admin-ui.css";

const PolygonEditor = dynamic(() => import("@/components/PolygonEditor"), {
  ssr: false,
});

const inputStyle: CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  border: "1px solid var(--ku-border)",
  borderRadius: 8,
  fontSize: 14,
  outline: "none",
  boxSizing: "border-box",
  background: "var(--ku-surface)",
};

const labelStyle = {
  fontSize: 13,
  fontWeight: 500,
  color: "var(--ku-text-2)",
  display: "block",
  marginBottom: 6,
};

export default function NewBuilding() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [geojson, setGeojson] = useState<Feature<Polygon> | null>(null);
  const [saving, setSaving] = useState(false);
  const { boundaries, error: boundariesError } = useCampusBoundaries();
  const campus = useMemo(
    () => inferCampusFromGeometry(geojson, boundaries),
    [geojson, boundaries],
  );
  const [toast, setToast] = useState<{ message: string; type: string } | null>(
    null,
  );

  function showToast(message, type = "success") {
    setToast({ message, type });
  }

  // 인증 확인
  useEffect(() => {
    async function check() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) router.push("/admin");
    }
    check();
  }, [router]);

  async function handleSave() {
    if (!name.trim()) {
      showToast("건물 이름을 입력해주세요", "error");
      return;
    }
    if (!geojson) {
      showToast("폴리곤을 그려주세요", "error");
      return;
    }
    if (!boundaries && !boundariesError) {
      showToast(
        "캠퍼스 영역을 확인하고 있어요. 잠시 후 다시 저장해주세요",
        "info",
      );
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
      geojson: geojson as unknown as Json,
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
    <div className="ku-admin-shell ku-admin-detail-shell">
      {/* 헤더 */}
      <div
        className="ku-admin-detail-header"
        style={{
          background: "var(--ku-surface)",
          borderBottom: "1px solid var(--ku-border)",
          padding: "16px 24px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div style={{ fontSize: 18, fontWeight: 600 }}>새 건물 추가</div>
        <button
          onClick={() => router.push("/admin/dashboard")}
          style={{
            fontSize: 13,
            color: "var(--ku-text-2)",
            background: "none",
            border: "none",
            cursor: "pointer",
          }}
        >
          ← 대시보드
        </button>
      </div>

      <div className="ku-admin-new-building">
        {/* 기본 정보 */}
        <div
          style={{
            background: "var(--ku-surface)",
            borderRadius: 10,
            padding: 24,
            border: "1px solid var(--ku-border)",
            marginBottom: 20,
          }}
        >
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 20 }}>
            기본 정보
          </div>

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
            <div style={labelStyle}>캠퍼스 자동 판정</div>
            <div
              role="status"
              style={{
                ...inputStyle,
                color: campus
                  ? "var(--ku-status-installed-fg)"
                  : "var(--ku-text-2)",
                background: "var(--ku-surface-raised)",
              }}
            >
              {!geojson
                ? "폴리곤을 저장하면 캠퍼스를 자동으로 판정합니다."
                : !boundaries && !boundariesError
                  ? "캠퍼스 판정 중..."
                  : campus
                    ? campus
                    : boundariesError
                      ? "캠퍼스 경계를 불러오지 못했습니다. 캠퍼스 미지정으로 저장됩니다."
                      : "캠퍼스 영역 밖입니다. 캠퍼스 미지정으로 저장할 수 있습니다."}
            </div>
          </div>
        </div>

        {/* 폴리곤 */}
        <div
          style={{
            background: "var(--ku-surface)",
            borderRadius: 10,
            padding: 24,
            border: "1px solid var(--ku-border)",
            marginBottom: 20,
          }}
        >
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>
            건물 폴리곤 *
          </div>
          <div
            style={{
              fontSize: 13,
              color: "var(--ku-text-2)",
              marginBottom: 16,
            }}
          >
            지도에서 건물 외곽선을 따라 폴리곤을 그려주세요.
          </div>
          <PolygonEditor
            geojson={null}
            excludeId={null}
            onSave={(newGeojson) => {
              setGeojson(newGeojson);
              showToast(
                "폴리곤이 저장되었어요. 아래 저장 버튼을 눌러 완료하세요.",
                "info",
              );
            }}
            onCancel={() => router.push("/admin/dashboard")}
          />
          {geojson && (
            <div
              style={{
                marginTop: 12,
                fontSize: 13,
                color: "var(--ku-status-installed-fg)",
                fontWeight: 500,
              }}
            >
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
              background: "var(--ku-surface)",
              border: "1px solid var(--ku-border)",
              borderRadius: 8,
              fontSize: 14,
              cursor: "pointer",
              color: "var(--ku-text-2)",
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
              background: saving
                ? "var(--ku-primary-disabled)"
                : "var(--ku-primary)",
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
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
}
