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
      <div className="ku-slope-scale" aria-hidden="true">
        <div className="ku-slope-scale-bar">
          {SLOPE_BANDS.map((band) => (
            <span
              className="ku-slope-scale-step"
              key={band.color}
              style={{ backgroundColor: band.color }}
            />
          ))}
        </div>
        <div className="ku-slope-scale-ticks">
          {SLOPE_BANDS.slice(0, -1).map((band, index) => (
            <span
              className="ku-slope-scale-tick"
              key={band.color}
              style={{ left: `${((index + 1) / SLOPE_BANDS.length) * 100}%` }}
            >
              <span>{trim(band.maxPercent)}%</span>
              <span>{trim(percentToDeg(band.maxPercent))}°</span>
            </span>
          ))}
        </div>
      </div>
      <ul className="ku-visually-hidden">
        {SLOPE_BANDS.map((band, index) => (
          <li key={band.color}>{bandLabel(index)}</li>
        ))}
      </ul>
      {SLOPE_REFERENCE_LINES.map((line) => (
        <div className="ku-slope-threshold" key={line.ratioLabel}>
          ▶ {line.label} {line.ratioLabel} · {trim(line.percent)}% ·{" "}
          {trim(percentToDeg(line.percent))}°
        </div>
      ))}
    </div>
  );
}
