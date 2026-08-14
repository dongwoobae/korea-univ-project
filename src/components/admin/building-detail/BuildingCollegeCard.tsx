"use client";

import type { College } from "@/types/domain";

export default function BuildingCollegeCard({
  colleges,
  selectedCollegeId,
  onSelect,
  hasUnsavedChanges,
  saving,
  onSave,
}: {
  colleges: College[];
  selectedCollegeId: number | null;
  onSelect: (collegeId: number | null) => void;
  hasUnsavedChanges: boolean;
  saving: boolean;
  onSave: () => void;
}) {
  return (
    <div
      id="building-college"
      className="ku-admin-detail-card ku-admin-detail-card--college"
      style={{
        background: "var(--ku-surface)",
        borderRadius: 10,
        padding: 20,
        border: "1px solid var(--ku-border)",
        marginBottom: 20,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 8,
          marginBottom: 16,
        }}
      >
        <span style={{ fontSize: 15, fontWeight: 600 }}>소속 단과대학</span>
        {hasUnsavedChanges && (
          <span className="ku-admin-detail-unsaved-label">저장 안 됨</span>
        )}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <select
          aria-label="소속 단과대학 선택"
          value={selectedCollegeId ?? ""}
          onChange={(e) =>
            onSelect(e.target.value ? Number(e.target.value) : null)
          }
          style={{
            flex: 1,
            padding: "8px 10px",
            border: "1px solid var(--ku-border)",
            borderRadius: 6,
            fontSize: 13,
            outline: "none",
            background: "var(--ku-surface)",
          }}
        >
          <option value="">선택 안 함</option>
          {colleges.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <button
          onClick={onSave}
          disabled={saving}
          style={{
            padding: "8px 16px",
            background: "var(--ku-primary)",
            color: "#fff",
            border: "none",
            borderRadius: 6,
            fontSize: 13,
            cursor: saving ? "not-allowed" : "pointer",
            opacity: saving ? 0.7 : 1,
          }}
        >
          {saving ? "저장 중..." : "저장"}
        </button>
      </div>
    </div>
  );
}
