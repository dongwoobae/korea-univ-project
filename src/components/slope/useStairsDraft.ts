"use client";

import { useCallback, useState } from "react";
import type { Vertex } from "@/lib/slopeRoute";
import { stairsDraftDirty, type StairsDraftValues } from "@/lib/stairs";

/** initial은 마운트 때만 읽는다. 다른 계단을 열려면 key로 새로 세운다 */
export function useStairsDraft(initial: {
  name: string;
  note: string;
  vertices: Vertex[] | null;
}) {
  const [initialValues] = useState<StairsDraftValues>(() => ({
    name: initial.name,
    note: initial.note,
    vertices: initial.vertices ?? [],
  }));
  const [name, setName] = useState(initialValues.name);
  const [note, setNote] = useState(initialValues.note);
  const [vertices, setVertices] = useState<Vertex[]>(initialValues.vertices);

  // 편집 패널이 초안에 실어 지도로 넘긴다. 참조가 바뀌면 렌더마다 초안을 다시 내놓게 된다
  const handleVerticesChange = useCallback(
    (next: Vertex[]) => setVertices(next),
    [],
  );

  return {
    name,
    setName,
    note,
    setNote,
    vertices,
    handleVerticesChange,
    dirty: stairsDraftDirty({ name, note, vertices }, initialValues),
  };
}
