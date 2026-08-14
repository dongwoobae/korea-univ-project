"use client";

import dynamic from "next/dynamic";
import type { Feature, Polygon } from "geojson";

const PolygonEditor = dynamic(() => import("@/components/PolygonEditor"), {
  ssr: false,
});

const BuildingPolygonPreview = dynamic(
  () => import("@/components/BuildingPolygonPreview"),
  { ssr: false },
);

export default function BuildingPolygonCard({
  buildingId,
  geojson,
  editing,
  onStartEdit,
  onSave,
  onCancel,
}: {
  buildingId: number;
  geojson: Feature<Polygon> | null;
  editing: boolean;
  onStartEdit: () => void;
  onSave: (geojson: Feature<Polygon>) => Promise<void>;
  onCancel: () => void;
}) {
  return (
    <div
      id="building-polygon"
      className="ku-admin-detail-card ku-admin-detail-card--polygon"
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
          alignItems: "center",
          marginBottom: editing ? 16 : 0,
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 15, fontWeight: 600 }}>건물 폴리곤</span>
            {editing && (
              <span className="ku-admin-detail-unsaved-label">편집 중</span>
            )}
          </div>
          {!editing && (
            <div
              style={{
                fontSize: 12,
                color: geojson
                  ? "var(--ku-status-installed-fg)"
                  : "var(--ku-text-3)",
                marginTop: 4,
              }}
            >
              {geojson
                ? "✅ 폴리곤 데이터 있음"
                : "❌ 폴리곤 없음 — 편집으로 추가"}
            </div>
          )}
        </div>
        {!editing && (
          <button
            onClick={onStartEdit}
            style={{
              fontSize: 13,
              padding: "6px 14px",
              background: "none",
              border: "1px solid var(--ku-primary-text)",
              color: "var(--ku-primary-text)",
              borderRadius: 8,
              cursor: "pointer",
            }}
          >
            편집
          </button>
        )}
      </div>

      {!editing && geojson && (
        <div style={{ marginTop: 16 }}>
          <BuildingPolygonPreview
            key={JSON.stringify(geojson)}
            geojson={geojson}
            buildingId={buildingId}
          />
        </div>
      )}

      {editing && (
        <PolygonEditor
          geojson={geojson}
          excludeId={buildingId}
          onSave={onSave}
          onCancel={onCancel}
        />
      )}
    </div>
  );
}
