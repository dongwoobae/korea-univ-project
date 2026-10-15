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
          <ToolButton
            symbol="✓"
            label="끝내기"
            disabled={locked}
            onClick={commands.finishDraw}
          />
          <ToolButton
            symbol="↶"
            label="마지막 꼭지점 제거"
            disabled={locked}
            onClick={commands.removeLastVertex}
          />
          <ToolButton
            symbol="✕"
            label="취소"
            disabled={locked}
            onClick={commands.cancelDraw}
          />
        </>
      ) : (
        <>
          <ToolButton
            symbol="✎"
            label="그리기"
            disabled={locked || state.hasLine}
            onClick={commands.startDraw}
          />
          {MODE_TOOLS.map((tool) => (
            <ToolButton
              key={tool.mode}
              symbol={tool.symbol}
              label={tool.label}
              pressed={state.mode === tool.mode}
              disabled={locked || !state.hasLine}
              onClick={() => commands.setMode(tool.mode)}
            />
          ))}
          <ToolButton
            symbol="▦"
            label="건물에 붙이기"
            pressed={state.snap}
            disabled={locked}
            onClick={() => commands.setSnap(!state.snap)}
          />
          <ToolButton
            symbol="⌫"
            label="지우기"
            disabled={locked || !state.hasLine}
            onClick={onResetRequest}
          />
        </>
      )}
    </div>
  );
}

// 지도 위 빈 폭이 좁으면 CSS가 글자를 시각적으로만 숨긴다. 접근 이름은 글자가 맡는다
function ToolButton({
  symbol,
  label,
  pressed,
  disabled,
  onClick,
}: {
  symbol: string;
  label: string;
  pressed?: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
    >
      <span aria-hidden="true">{symbol}</span>
      <span className="ku-slope-toolbar-text">{label}</span>
    </button>
  );
}
