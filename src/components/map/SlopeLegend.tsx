"use client";

import {
  SLOPE_BANDS,
  SLOPE_REFERENCE_LINES,
  percentToDeg,
} from "@/lib/slopeScale";

function trim(value: number) {
  return String(Number(value.toFixed(2)));
}

function bandLabel(index: number) {
  const upper = SLOPE_BANDS[index].maxPercent;
  if (index === 0) {
    return `평지 · ${trim(upper)}% 이하 (${trim(percentToDeg(upper))}°)`;
  }
  const lower = SLOPE_BANDS[index - 1].maxPercent;
  if (upper === Infinity) {
    return `${trim(lower)}% 초과 (${trim(percentToDeg(lower))}°~)`;
  }
  return `${trim(lower)} – ${trim(upper)}% (${trim(percentToDeg(lower))}–${trim(percentToDeg(upper))}°)`;
}

export default function SlopeLegend({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <div className="ku-slope-legend" aria-label="경사도 범례">
      <div className="ku-slope-legend-title">경사도 범례</div>
      {SLOPE_BANDS.map((band, index) => (
        <div className="ku-slope-row" key={band.color}>
          <span
            className="ku-slope-line"
            style={{ "--slope-color": band.color } as React.CSSProperties}
          />
          <span>{bandLabel(index)}</span>
        </div>
      ))}
      {SLOPE_REFERENCE_LINES.map((line) => (
        <div className="ku-slope-threshold" key={line.ratioLabel}>
          ▶ {line.label} {line.ratioLabel} · {trim(line.percent)}% ·{" "}
          {trim(percentToDeg(line.percent))}°
        </div>
      ))}
    </div>
  );
}
