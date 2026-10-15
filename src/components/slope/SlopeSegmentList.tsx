"use client";

import type { RouteSegment } from "@/lib/slopeRoute";
import {
  SLOPE_GRADE_COLORS,
  SLOPE_GRADE_ON_COLORS,
  degToPercent,
  formatDeg,
  formatPercent,
  isSlopeDegInRange,
  slopeGradeFromDeg,
  slopeWarningFromDeg,
  type SlopeUnit,
} from "@/lib/slopeScale";
import { formatMeters } from "@/lib/slopeWorkspace";

interface SlopeSegmentListProps {
  segments: RouteSegment[];
  /** 입력란 문자열. 고른 단위 그대로다 */
  drafts: string[];
  /** 저장될 값(도). 경고와 환산값은 이것으로 계산한다 */
  slopes: (number | null)[];
  unit: SlopeUnit;
  onDraftChange: (index: number, raw: string) => void;
  disabled?: boolean;
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
  disabled = false,
}: SlopeSegmentListProps) {
  if (segments.length === 0) {
    return (
      <p className="ku-slope-card-empty">
        지도에서 경로를 그리면 구간이 나타납니다.
      </p>
    );
  }

  return (
    <div className="ku-slope-cards">
      {segments.map((segment) => {
        const value = slopes[segment.index];
        const measured =
          value !== null && value !== undefined && isSlopeDegInRange(value)
            ? value
            : null;
        const warning =
          measured === null ? null : slopeWarningFromDeg(measured);
        const grade = measured === null ? null : slopeGradeFromDeg(measured);
        const converted =
          measured === null
            ? null
            : unit === "deg"
              ? formatPercent(degToPercent(measured))
              : formatDeg(measured);
        return (
          <div key={segment.index} className="ku-slope-card">
            {/* 번호는 옆 "구간 n"이 읽는다. 값이 없거나 범위 밖이면 판정 색 대신 테두리만 둔다 */}
            <span
              className="ku-slope-card-index"
              aria-hidden="true"
              data-empty={grade === null || undefined}
              style={
                grade
                  ? {
                      background: SLOPE_GRADE_COLORS[grade],
                      color: SLOPE_GRADE_ON_COLORS[grade],
                    }
                  : undefined
              }
            >
              {segment.index + 1}
            </span>
            <div className="ku-slope-card-text">
              <div>
                <label htmlFor={`slope-${segment.index}`}>
                  구간 {segment.index + 1}
                </label>
                <span className="ku-slope-card-meta">
                  {" · "}
                  {formatMeters(segment.distance)}
                  {converted && ` · = ${converted}`}
                </span>
              </div>
              {warning && (
                <p
                  className="ku-slope-card-warning"
                  data-tone={warning === "extreme" ? "danger" : undefined}
                >
                  {WARNING_TEXT[warning]}
                </p>
              )}
            </div>
            <div className="ku-slope-card-input">
              <input
                id={`slope-${segment.index}`}
                aria-label={`구간 ${segment.index + 1} 경사도`}
                type="number"
                step="any"
                inputMode="decimal"
                value={drafts[segment.index] ?? ""}
                disabled={disabled}
                onChange={(event) =>
                  onDraftChange(segment.index, event.target.value)
                }
              />
              <span>{UNIT_SYMBOL[unit]}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
