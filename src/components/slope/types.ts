import type { Vertex } from "@/lib/slopeRoute";

export type SlopeEditMode = "vertex" | "drag";

export interface SlopeEditorState {
  hasLine: boolean;
  drawing: boolean;
  mode: SlopeEditMode;
  snap: boolean;
}

export interface SlopeEditorCommands {
  startDraw(): void;
  finishDraw(): void;
  removeLastVertex(): void;
  cancelDraw(): void;
  setMode(mode: SlopeEditMode): void;
  setSnap(on: boolean): void;
  /** 선과 미리보기를 지우고 그리기를 다시 켠다 */
  reset(): void;
}

/**
 * 편집 지도가 내놓는다. 편집 패널은 지도의 형제라 페이지를 거쳐 받는다.
 * owner가 지금 편집 패널과 다르면 낡은 것이다
 */
export interface SlopeEditorHandle {
  /** "edit:{id}" | "edit:new" */
  owner: string;
  state: SlopeEditorState;
  commands: SlopeEditorCommands;
}

/** 편집 패널이 내놓는다. 지도는 이것으로 미리보기를 칠하고 꼭짓점 변경을 돌려준다 */
export interface SlopeEditDraft {
  owner: string;
  slopes: (number | null)[];
  /** 저장 중. 지도 편집을 잠근다 */
  locked: boolean;
  /** 지금 초안의 경계(모바일 전체 지도 focus) */
  bounds: [[number, number], [number, number]] | null;
  onVerticesChange: (vertices: Vertex[]) => void;
}
