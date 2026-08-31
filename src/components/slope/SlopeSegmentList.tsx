"use client";

import { slopeWarning, type RouteSegment } from "@/lib/slopeRoute";

interface SlopeSegmentListProps {
  segments: RouteSegment[];
  slopes: (number | null)[];
  onSlopeChange: (index: number, value: number | null) => void;
}

const WARNING_TEXT = {
  legal: "법적 기준(1/12) 초과",
  extreme: "이 값이 맞나요? 30%를 넘는 보행 경사로는 매우 드뭅니다",
} as const;

export default function SlopeSegmentList({
  segments,
  slopes,
  onSlopeChange,
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
        const warning =
          value !== null && value !== undefined && Number.isFinite(value)
            ? slopeWarning(value)
            : null;
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
                value={value ?? ""}
                onChange={(event) => {
                  const raw = event.target.value;
                  onSlopeChange(segment.index, raw === "" ? null : Number(raw));
                }}
                style={{
                  width: 110,
                  padding: "8px 10px",
                  border: "1px solid var(--ku-border)",
                  borderRadius: 8,
                  fontSize: 14,
                }}
              />
              <span style={{ fontSize: 13 }}>%</span>
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
