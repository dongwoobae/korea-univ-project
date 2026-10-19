"use client";

import { useCallback, useState } from "react";
import {
  draftsFromSlopes,
  redraftForUnit,
  resizeToSegments,
  slopeDraftDirty,
  type SlopeDraftValues,
} from "@/lib/slopeDraft";
import { buildSegments, validateRoute, type Vertex } from "@/lib/slopeRoute";
import { toDegrees, type SlopeUnit } from "@/lib/slopeScale";

const UNIT_STORAGE_KEY = "ku_slope_input_unit";

export const SLOPE_UNIT_OPTIONS: {
  unit: SlopeUnit;
  symbol: string;
  label: string;
}[] = [
  { unit: "deg", symbol: "°", label: "도(°)" },
  { unit: "percent", symbol: "%", label: "퍼센트(%)" },
];

// 작업 화면의 선택은 서버 스냅숏(useWorkspaceSelection의 빈 주소)에서 닫힘이라 편집 패널은 hydration 뒤에야 처음
// 그려진다. 범례 편집 모달도 버튼을 누른 뒤에야 그려진다. 그래서 첫 렌더에서 localStorage를 읽어도 hydration이 어긋나지 않는다.
export function readSlopeUnitPreference(): SlopeUnit {
  try {
    return localStorage.getItem(UNIT_STORAGE_KEY) === "percent"
      ? "percent"
      : "deg";
  } catch {
    return "deg";
  }
}

export function writeSlopeUnitPreference(unit: SlopeUnit) {
  try {
    localStorage.setItem(UNIT_STORAGE_KEY, unit);
  } catch {
    // 기억하지 못해도 입력은 된다.
  }
}

/** initial은 마운트 때만 읽는다. 다른 경로를 열려면 key로 새로 세운다 */
export function useSlopeRouteDraft(initial: {
  name: string;
  vertices: Vertex[] | null;
  slopes: (number | null)[];
}) {
  const [initialValues] = useState<SlopeDraftValues>(() => ({
    name: initial.name,
    vertices: initial.vertices ?? [],
    slopes: initial.slopes,
  }));
  const [name, setName] = useState(initialValues.name);
  const [vertices, setVertices] = useState<Vertex[]>(initialValues.vertices);
  const [slopes, setSlopes] = useState<(number | null)[]>(initialValues.slopes);
  const [unit, setUnit] = useState<SlopeUnit>(readSlopeUnitPreference);
  const [drafts, setDrafts] = useState<string[]>(() =>
    draftsFromSlopes(initialValues.slopes, unit),
  );

  // 편집 패널이 초안에 실어 지도로 넘긴다. 참조가 바뀌면 렌더마다 초안을 다시 내놓게 된다
  const handleVerticesChange = useCallback((next: Vertex[]) => {
    setVertices(next);
    setSlopes((previous) => resizeToSegments(previous, next.length, null));
    setDrafts((previous) => resizeToSegments(previous, next.length, ""));
  }, []);

  function handleDraftChange(index: number, raw: string) {
    setDrafts((previous) =>
      previous.map((draft, i) => (i === index ? raw : draft)),
    );
    const value = raw === "" ? null : toDegrees(Number(raw), unit);
    setSlopes((previous) =>
      previous.map((slope, i) => (i === index ? value : slope)),
    );
  }

  function handleUnitChange(next: SlopeUnit) {
    setUnit(next);
    writeSlopeUnitPreference(next);
    setDrafts((previous) => redraftForUnit(slopes, previous, next));
  }

  return {
    name,
    setName,
    vertices,
    slopes,
    drafts,
    unit,
    segments: buildSegments(vertices),
    errors: validateRoute(name, vertices, slopes),
    dirty: slopeDraftDirty({ name, vertices, slopes }, initialValues),
    handleVerticesChange,
    handleDraftChange,
    handleUnitChange,
  };
}
