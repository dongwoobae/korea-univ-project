"use client";

import { useCallback, useState } from "react";
import dynamic from "next/dynamic";
import SlopeSegmentList from "@/components/slope/SlopeSegmentList";
import {
  buildSegments,
  toStoredSegments,
  validateRoute,
  type Vertex,
} from "@/lib/slopeRoute";
import type { SlopePoint } from "@/types/domain";

const SlopeRouteMap = dynamic(
  () => import("@/components/slope/SlopeRouteMap"),
  { ssr: false },
);

interface SlopeRouteEditorProps {
  initialName: string;
  initialVertices: Vertex[] | null;
  initialSlopes: number[];
  saving: boolean;
  onSave: (name: string, segments: SlopePoint[]) => void | Promise<void>;
  onCancel: () => void;
}

export default function SlopeRouteEditor({
  initialName,
  initialVertices,
  initialSlopes,
  saving,
  onSave,
  onCancel,
}: SlopeRouteEditorProps) {
  const [name, setName] = useState(initialName);
  const [vertices, setVertices] = useState<Vertex[]>(initialVertices ?? []);
  const [slopes, setSlopes] = useState<(number | null)[]>(initialSlopes);
  const [mapKey, setMapKey] = useState(0);

  const handleVerticesChange = useCallback((next: Vertex[]) => {
    setVertices(next);
    setSlopes((prev) => {
      const count = Math.max(0, next.length - 1);
      if (prev.length === count) return prev;
      return Array.from({ length: count }, () => null);
    });
  }, []);

  function handleSlopeChange(index: number, value: number | null) {
    setSlopes((prev) => prev.map((slope, i) => (i === index ? value : slope)));
  }

  function handleReset() {
    setVertices([]);
    setSlopes([]);
    setMapKey((key) => key + 1);
  }

  const segments = buildSegments(vertices);
  const errors = validateRoute(name, vertices, slopes);
  const canSave = errors.length === 0 && !saving;

  function handleSave() {
    if (!canSave) return;
    void onSave(name.trim(), toStoredSegments(vertices, slopes as number[]));
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <label
          htmlFor="slope-route-name"
          style={{ fontSize: 13, fontWeight: 600 }}
        >
          경로 이름
        </label>
        <input
          id="slope-route-name"
          aria-label="경로 이름"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="예: 안암병원 정문 경사로"
          style={{
            display: "block",
            width: "100%",
            maxWidth: 420,
            marginTop: 6,
            padding: "10px 12px",
            border: "1px solid var(--ku-border)",
            borderRadius: 8,
            fontSize: 14,
          }}
        />
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 2fr) minmax(260px, 1fr)",
          gap: 20,
          alignItems: "start",
        }}
      >
        <SlopeRouteMap
          key={mapKey}
          initialVertices={initialVertices}
          onVerticesChange={handleVerticesChange}
          slopes={slopes}
        />
        <SlopeSegmentList
          segments={segments}
          slopes={slopes}
          onSlopeChange={handleSlopeChange}
        />
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {vertices.length > 0 && (
          <button
            type="button"
            onClick={handleReset}
            style={{
              padding: "10px 16px",
              background: "none",
              border: "1px solid var(--ku-danger)",
              color: "var(--ku-danger)",
              borderRadius: 8,
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            지우고 다시 그리기
          </button>
        )}
        <button
          type="button"
          onClick={onCancel}
          style={{
            padding: "10px 16px",
            background: "none",
            border: "1px solid var(--ku-border)",
            borderRadius: 8,
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          취소
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={!canSave}
          style={{
            padding: "10px 20px",
            background: canSave ? "var(--ku-primary)" : "var(--ku-border)",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 500,
            cursor: canSave ? "pointer" : "not-allowed",
          }}
        >
          {saving ? "저장 중..." : "경로 저장"}
        </button>
      </div>

      {errors.length > 0 && vertices.length > 0 && (
        <ul
          style={{
            margin: 0,
            paddingLeft: 20,
            fontSize: 12,
            color: "var(--ku-text-2)",
          }}
        >
          {errors.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
