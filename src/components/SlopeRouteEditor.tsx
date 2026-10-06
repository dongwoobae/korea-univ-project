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
import { formatSlopeInput, toDegrees, type SlopeUnit } from "@/lib/slopeScale";
import type { SlopeRoutePoints } from "@/types/domain";

const SlopeRouteMap = dynamic(
  () => import("@/components/slope/SlopeRouteMap"),
  { ssr: false },
);

const UNIT_STORAGE_KEY = "ku_slope_input_unit";

// 편집기는 부모 페이지가 인증을 확인한 뒤에만 그려 서버 렌더링을 거치지 않는다.
// 그래서 첫 렌더에서 localStorage를 읽어도 hydration이 어긋나지 않는다.
function readUnitPreference(): SlopeUnit {
  try {
    return localStorage.getItem(UNIT_STORAGE_KEY) === "percent"
      ? "percent"
      : "deg";
  } catch {
    return "deg";
  }
}

function writeUnitPreference(unit: SlopeUnit) {
  try {
    localStorage.setItem(UNIT_STORAGE_KEY, unit);
  } catch {
    // 기억하지 못해도 입력은 된다.
  }
}

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
  initialSlopes: (number | null)[];
  saving: boolean;
  onSave: (name: string, segments: SlopeRoutePoints) => void | Promise<void>;
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
  const [snapToBuildings, setSnapToBuildings] = useState(false);
  const [unit, setUnit] = useState<SlopeUnit>(readUnitPreference);
  const [drafts, setDrafts] = useState<string[]>(() =>
    initialSlopes.map((slope) =>
      slope === null ? "" : formatSlopeInput(slope, unit),
    ),
  );
  const resetMapRef = useRef<() => void>(() => {});
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  const handleVerticesChange = useCallback((next: Vertex[]) => {
    setVertices(next);
    const count = Math.max(0, next.length - 1);
    setSlopes((prev) =>
      prev.length === count ? prev : Array.from({ length: count }, () => null),
    );
    setDrafts((prev) =>
      prev.length === count ? prev : Array.from({ length: count }, () => ""),
    );
  }, []);

  function handleDraftChange(index: number, raw: string) {
    setDrafts((prev) => prev.map((draft, i) => (i === index ? raw : draft)));
    const value = raw === "" ? null : toDegrees(Number(raw), unit);
    setSlopes((prev) => prev.map((slope, i) => (i === index ? value : slope)));
  }

  function handleUnitChange(next: SlopeUnit) {
    setUnit(next);
    writeUnitPreference(next);
    // 저장될 도 값은 그대로 두고 입력란 문자열만 새 단위로 다시 쓴다(설계 3.3).
    setDrafts((prev) =>
      slopes.map((slope, index) =>
        slope === null || !Number.isFinite(slope)
          ? (prev[index] ?? "")
          : formatSlopeInput(slope, next),
      ),
    );
  }

  function handleReset() {
    setConfirmReset(false);
    resetMapRef.current();
  }

  const segments = buildSegments(vertices);
  const errors = validateRoute(name, vertices, slopes);
  const canSave = errors.length === 0 && !saving;
  const dirty =
    name.trim() !== initialName.trim() ||
    !verticesEqual(vertices, initialVertices ?? []) ||
    !slopesEqual(slopes, initialSlopes);

  // 현장 실측값이라 잃으면 다시 재야 한다. 건물 상세 화면과 같은 방식이다.
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

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <SlopeRouteMap
          initialVertices={initialVertices}
          onVerticesChange={handleVerticesChange}
          slopes={slopes}
          snapToBuildings={snapToBuildings}
          onResetReady={(reset) => {
            resetMapRef.current = reset;
          }}
        />
        <label
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          <input
            type="checkbox"
            checked={snapToBuildings}
            onChange={(event) => setSnapToBuildings(event.target.checked)}
          />
          건물 외곽선에 붙이기
        </label>
        <fieldset
          style={{
            border: 0,
            padding: 0,
            margin: 0,
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: 16,
            fontSize: 13,
          }}
        >
          <legend style={{ padding: 0, fontWeight: 600, marginBottom: 6 }}>
            경사 단위
          </legend>
          {(["deg", "percent"] as const).map((option) => (
            <label
              key={option}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                cursor: "pointer",
              }}
            >
              <input
                type="radio"
                name="slope-unit"
                value={option}
                checked={unit === option}
                onChange={() => handleUnitChange(option)}
              />
              {option === "deg" ? "도(°)" : "퍼센트(%)"}
            </label>
          ))}
        </fieldset>
        <SlopeSegmentList
          segments={segments}
          drafts={drafts}
          slopes={slopes}
          unit={unit}
          onDraftChange={handleDraftChange}
        />
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {vertices.length > 0 && (
          <button
            type="button"
            onClick={() => setConfirmReset(true)}
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
            경로 지우고 다시 그리기
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

      {confirmReset && (
        <ConfirmModal
          message="그린 경로를 지우고 다시 그릴까요?"
          description="그린 선과 입력한 경사도가 모두 사라집니다. 현장에서 잰 값이라 되돌릴 수 없어요."
          confirmLabel="지우고 다시 그리기"
          onConfirm={handleReset}
          onCancel={() => setConfirmReset(false)}
        />
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
