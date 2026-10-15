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

/**
 * 모바일 전체 지도에서 도구 바의 아래 끝(지도 위쪽에서 잰다). admin-ui.css 모바일 `.ku-slope-toolbar`의 위 여백과
 * 두 줄 높이에 맞춘다 — 2026-10-15 Chromium에서 재니 320~480px 폭에서 도구가 두 줄로 접혔다. 310px 이하는 세 줄이라
 * 이 값이 모자라다. 한 줄일 때(520px 이상, 그리는 중)는 이 값이 실제보다 커서 경로가 조금 작게 맞춰질 뿐이다
 */
export const MOBILE_TOOLBAR_BOTTOM = 110;

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
