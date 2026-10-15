"use client";

import type {
  SlopeEditMode,
  SlopeEditorHandle,
} from "@/components/slope/types";

interface SlopeEditToolbarProps {
  editor: SlopeEditorHandle | null;
  /** 저장 중 */
  locked: boolean;
  onResetRequest: () => void;
}

const MODE_TOOLS: { mode: SlopeEditMode; symbol: string; label: string }[] = [
  { mode: "vertex", symbol: "◇", label: "꼭짓점 편집" },
  { mode: "drag", symbol: "✥", label: "통째로 옮기기" },
];

export default function SlopeEditToolbar({
  editor,
  locked,
  onResetRequest,
}: SlopeEditToolbarProps) {
  if (!editor) return null;
  const { state, commands } = editor;

  return (
    <div
      className="ku-slope-toolbar"
      role="toolbar"
      aria-label="경로 편집 도구"
    >
      {state.drawing ? (
        <>
          <button type="button" disabled={locked} onClick={commands.finishDraw}>
            끝내기
          </button>
          <button
            type="button"
            disabled={locked}
            onClick={commands.removeLastVertex}
          >
            마지막 꼭지점 제거
          </button>
          <button type="button" disabled={locked} onClick={commands.cancelDraw}>
            취소
          </button>
        </>
      ) : (
        <>
          <button
            type="button"
            disabled={locked || state.hasLine}
            onClick={commands.startDraw}
          >
            <span aria-hidden="true">✎</span> 그리기
          </button>
          {MODE_TOOLS.map((tool) => (
            <button
              key={tool.mode}
              type="button"
              aria-pressed={state.mode === tool.mode}
              disabled={locked || !state.hasLine}
              onClick={() => commands.setMode(tool.mode)}
            >
              <span aria-hidden="true">{tool.symbol}</span> {tool.label}
            </button>
          ))}
          <button
            type="button"
            aria-pressed={state.snap}
            disabled={locked}
            onClick={() => commands.setSnap(!state.snap)}
          >
            건물에 붙이기
          </button>
          <button
            type="button"
            disabled={locked || !state.hasLine}
            onClick={onResetRequest}
          >
            <span aria-hidden="true">⌫</span> 지우기
          </button>
        </>
      )}
    </div>
  );
}
