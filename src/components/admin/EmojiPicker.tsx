"use client";

import { useId, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { CompactEmoji } from "emojibase";
import emojiData from "emojibase-data/ko/compact.json";
import {
  EMOJI_GROUP_ORDER,
  emojiGroupLabel,
  groupEmoji,
  searchEmoji,
} from "@/lib/emojiPicker";
import { useModalFocus } from "@/lib/useModalFocus";

const COLUMNS = 8;

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
  onClose: () => void;
  selected: string;
}

/**
 * `useModalFocus`를 쓰는 이유는 초점 덫이 아니라 **Escape 때문**이다. 모달의
 * 핸들러가 `document`에 capture로 붙어 있어 컨테이너에서 가로챌 수 없다.
 * 대신 모듈 스코프 `dialogStack`의 최상단이 되면 모달 쪽 핸들러가 조기
 * 반환하므로, 피커가 열려 있는 동안의 Escape는 피커만 닫는다.
 */
export default function EmojiPicker({
  onSelect,
  onClose,
  selected,
}: EmojiPickerProps) {
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState(EMOJI_GROUP_ORDER[0]);
  const [cursor, setCursor] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const fieldId = useId();

  const containerRef = useModalFocus<HTMLDivElement>({
    onClose,
    initialFocusRef: searchRef,
  });

  const grouped = useMemo(() => groupEmoji(emojiData), []);
  const shown = useMemo(
    () =>
      query.trim() ? searchEmoji(emojiData, query) : (grouped[group] ?? []),
    [query, group, grouped],
  );

  /** 격자 전체를 탭 정지점으로 두면 가장 큰 그룹에서 388번을 눌러야 빠져나간다. */
  function moveCursor(next: number) {
    const clamped = Math.max(0, Math.min(shown.length - 1, next));
    setCursor(clamped);
    const cell = gridRef.current?.children[clamped];
    if (cell instanceof HTMLElement) {
      cell.focus();
      cell.scrollIntoView({ block: "nearest" });
    }
  }

  function handleGridKeyDown(event: React.KeyboardEvent) {
    const moves: Record<string, number> = {
      ArrowRight: 1,
      ArrowLeft: -1,
      ArrowDown: COLUMNS,
      ArrowUp: -COLUMNS,
    };
    if (event.key in moves) {
      event.preventDefault();
      moveCursor(cursor + moves[event.key]);
      return;
    }
    if (event.key === "Home") {
      event.preventDefault();
      moveCursor(0);
    } else if (event.key === "End") {
      event.preventDefault();
      moveCursor(shown.length - 1);
    }
  }

  const tabStyle = (active: boolean): CSSProperties => ({
    padding: "4px 9px",
    fontSize: 12,
    borderRadius: 999,
    border: `1px solid ${active ? "#C08A2D" : "#ddd"}`,
    background: active ? "#FDF6E7" : "white",
    color: active ? "#7A5C16" : "#555",
    cursor: "pointer",
    whiteSpace: "nowrap",
  });

  return (
    <div
      ref={containerRef}
      role="group"
      aria-label="이모지 선택"
      style={{
        marginTop: 6,
        border: "1px solid #ddd",
        borderRadius: 8,
        background: "white",
        padding: 10,
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <label
        htmlFor={`${fieldId}-search`}
        style={{ fontSize: 12, color: "#555" }}
      >
        이모지 검색
      </label>
      <input
        id={`${fieldId}-search`}
        ref={searchRef}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setCursor(0);
        }}
        placeholder="예: 나무, 다람쥐, 벚꽃"
        style={{
          padding: "7px 9px",
          border: "1px solid #ddd",
          borderRadius: 6,
          fontSize: 13,
        }}
      />

      {!query.trim() && (
        <div
          role="tablist"
          aria-label="이모지 분류"
          style={{ display: "flex", gap: 5, flexWrap: "wrap" }}
        >
          {EMOJI_GROUP_ORDER.map((id) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={id === group}
              onClick={() => {
                setGroup(id);
                setCursor(0);
              }}
              style={tabStyle(id === group)}
            >
              {emojiGroupLabel(id)}
            </button>
          ))}
        </div>
      )}

      <div
        ref={gridRef}
        role="listbox"
        aria-label="이모지"
        onKeyDown={handleGridKeyDown}
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${COLUMNS}, 1fr)`,
          gap: 2,
          maxHeight: 200,
          overflowY: "auto",
        }}
      >
        {shown.map((emoji: CompactEmoji, index) => (
          <button
            key={emoji.hexcode}
            type="button"
            role="option"
            aria-selected={emoji.unicode === selected}
            aria-label={emoji.label}
            tabIndex={index === cursor ? 0 : -1}
            onFocus={() => setCursor(index)}
            onClick={() => onSelect(emoji.unicode)}
            style={{
              fontSize: 20,
              lineHeight: 1,
              padding: 4,
              border:
                emoji.unicode === selected
                  ? "1px solid #C08A2D"
                  : "1px solid transparent",
              borderRadius: 5,
              background:
                emoji.unicode === selected ? "#FDF6E7" : "transparent",
              cursor: "pointer",
            }}
          >
            <span aria-hidden="true">{emoji.unicode}</span>
          </button>
        ))}
      </div>

      {shown.length === 0 && (
        <div aria-live="polite" style={{ fontSize: 12, color: "#888" }}>
          검색 결과가 없어요. 분류에서 골라보세요.
        </div>
      )}
    </div>
  );
}
