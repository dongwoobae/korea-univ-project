"use client";

import type { RouteSegment } from "@/lib/slopeRoute";
import {
  degToPercent,
  formatDeg,
  formatPercent,
  isSlopeDegInRange,
  slopeWarningFromDeg,
  type SlopeUnit,
} from "@/lib/slopeScale";

interface SlopeSegmentListProps {
  segments: RouteSegment[];
  /** 입력란 문자열. 고른 단위 그대로다 */
  drafts: string[];
  /** 저장될 값(도). 경고와 환산값은 이것으로 계산한다 */
  slopes: (number | null)[];
  unit: SlopeUnit;
  onDraftChange: (index: number, raw: string) => void;
}

const WARNING_TEXT = {
  "relaxed-limit": "1/12 완화 한도 초과",
  extreme: "이 값이 맞나요? 30%(약 16.7°)를 넘는 보행 경사로는 매우 드뭅니다",
} as const;

const UNIT_SYMBOL: Record<SlopeUnit, string> = { deg: "°", percent: "%" };

export default function SlopeSegmentList({
  segments,
  drafts,
  slopes,
  unit,
  onDraftChange,
}: SlopeSegmentListProps) {
  if (segments.length === 0) {
    return (
      <div style={{ fontSize: 13, color: "var(--ku-text-3)" }}>
        지도에서 경로를 그리면 구간이 나타납니다.
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {segments.map((segment) => {
        const value = slopes[segment.index];
        const measured =
          value !== null && value !== undefined && isSlopeDegInRange(value)
            ? value
            : null;
        const warning = measured === null ? null : slopeWarningFromDeg(measured);
        const converted =
          measured === null
            ? null
            : unit === "deg"
              ? formatPercent(degToPercent(measured))
              : formatDeg(measured);
        return (
          <div
            key={segment.index}
            style={{
              border: "1px solid var(--ku-border)",
              borderRadius: 8,
              padding: 12,
            }}
          >
            <label
              htmlFor={`slope-${segment.index}`}
              style={{ fontSize: 13, fontWeight: 600 }}
            >
              구간 {segment.index + 1}
            </label>
            <span
              style={{
                fontSize: 12,
                color: "var(--ku-text-3)",
                marginLeft: 8,
              }}
            >
              {segment.distance}m
            </span>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                marginTop: 6,
              }}
            >
              <input
                id={`slope-${segment.index}`}
                aria-label={`구간 ${segment.index + 1} 경사도`}
                type="number"
                step="0.1"
                inputMode="decimal"
                value={drafts[segment.index] ?? ""}
                onChange={(event) =>
                  onDraftChange(segment.index, event.target.value)
                }
                style={{
                  width: 110,
                  padding: "8px 10px",
                  border: "1px solid var(--ku-border)",
                  borderRadius: 8,
                  fontSize: 14,
                }}
              />
              <span style={{ fontSize: 13 }}>{UNIT_SYMBOL[unit]}</span>
              {converted && (
                <span
                  className="ku-slope-converted"
                  style={{ fontSize: 12, color: "var(--ku-text-3)" }}
                >
                  = {converted}
                </span>
              )}
            </div>
            {warning && (
              <div
                style={{
                  marginTop: 6,
                  fontSize: 12,
                  color:
                    warning === "extreme"
                      ? "var(--ku-danger)"
                      : "var(--ku-text-2)",
                }}
              >
                {WARNING_TEXT[warning]}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
