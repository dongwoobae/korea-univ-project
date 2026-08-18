"use client";

import type { Building } from "@/types/domain";

export default function BuildingDetailHeader({
  building,
  hasUnsavedChanges,
  unsavedChangeCount,
  onNavigate,
}: {
  building: Building;
  hasUnsavedChanges: boolean;
  unsavedChangeCount: number;
  onNavigate: (href: string) => void;
}) {
  const saveStatus = hasUnsavedChanges
    ? `저장하지 않은 변경 ${unsavedChangeCount}개`
    : "모든 변경 저장됨";

  return (
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
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button
          onClick={() => onNavigate("/admin/dashboard")}
          aria-label="건물 목록으로 돌아가기"
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            fontSize: 20,
            color: "var(--ku-text-2)",
          }}
        >
          ←
        </button>
        <div>
          <div style={{ fontSize: 18, fontWeight: 600 }}>{building.name}</div>
          <div style={{ fontSize: 12, color: "var(--ku-text-2)" }}>
            {building.name_en}
          </div>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div
          className="ku-admin-detail-save-status"
          data-unsaved={hasUnsavedChanges}
          role="status"
          aria-label={saveStatus}
        >
          {saveStatus}
        </div>
        <button
          onClick={() => onNavigate("/")}
          style={{
            fontSize: 13,
            color: "var(--ku-text-2)",
            background: "none",
            border: "1px solid var(--ku-border)",
            borderRadius: 6,
            padding: "6px 12px",
            cursor: "pointer",
          }}
        >
          지도 보기
        </button>
      </div>
    </div>
  );
}
