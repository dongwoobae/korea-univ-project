"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import ConfirmModal from "@/components/ConfirmModal";
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

// 지도가 좌표를 다시 읽어 배열을 새로 만들어도(편집 없이 마운트만 해도)
// 참조가 아니라 값이 같으면 dirty가 아니어야 한다.
function verticesEqual(a: Vertex[], b: Vertex[]) {
  if (a.length !== b.length) return false;
  return a.every(
    (vertex, index) =>
      vertex.lat === b[index].lat && vertex.lng === b[index].lng,
  );
}

function slopesEqual(a: (number | null)[], b: (number | null)[]) {
  if (a.length !== b.length) return false;
  return a.every((slope, index) => slope === b[index]);
}

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
  const resetMapRef = useRef<() => void>(() => {});
  const [confirmLeave, setConfirmLeave] = useState(false);

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
    resetMapRef.current();
  }

  const segments = buildSegments(vertices);
  const errors = validateRoute(name, vertices, slopes);
  const canSave = errors.length === 0 && !saving;
  const dirty =
    name.trim() !== initialName ||
    !verticesEqual(vertices, initialVertices ?? []) ||
    !slopesEqual(slopes, initialSlopes);

  // 현장 실측값이라 잃으면 다시 재야 한다. 건물 상세 화면과 같은 방식으로
  // 탭을 닫거나 새로고침할 때도 경고한다.
  useEffect(() => {
    if (!dirty) return;
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [dirty]);

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
          initialVertices={initialVertices}
          onVerticesChange={handleVerticesChange}
          slopes={slopes}
          onResetReady={(reset) => {
            resetMapRef.current = reset;
          }}
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
          onClick={() => {
            if (dirty) {
              setConfirmLeave(true);
              return;
            }
            onCancel();
          }}
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

      {confirmLeave && (
        <ConfirmModal
          message="저장하지 않은 변경사항이 있어요"
          description="지금 나가면 그린 경로와 입력한 경사도가 사라집니다."
          confirmLabel="나가기"
          onConfirm={onCancel}
          onCancel={() => setConfirmLeave(false)}
        />
      )}
    </div>
  );
}
