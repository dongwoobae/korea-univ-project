"use client";

import {
  SLOPE_GRADIENT_STOPS,
  SLOPE_LEVELS,
  SLOPE_REFERENCE_LINES,
  percentToDeg,
  slopeColorFromDeg,
} from "@/lib/slopeScale";

const SCALE_MAX_PERCENT =
  SLOPE_GRADIENT_STOPS[SLOPE_GRADIENT_STOPS.length - 1].percent;
const GRADIENT_SAMPLES = 40;

// CSS 그라데이션은 sRGB로 섞어 지도 선 색(OKLab)과 어긋난다. 지도와 같은 함수에서 뽑는다.
const GRADIENT = `linear-gradient(to right, ${Array.from(
  { length: GRADIENT_SAMPLES + 1 },
  (_, i) => {
    const ratio = i / GRADIENT_SAMPLES;
    const color = slopeColorFromDeg(percentToDeg(ratio * SCALE_MAX_PERCENT));
    return `${color} ${(ratio * 100).toFixed(1)}%`;
  },
).join(", ")})`;

function trim(value: number) {
  return String(Number(value.toFixed(2)));
}

function position(percent: number) {
  return `${(Math.min(percent, SCALE_MAX_PERCENT) / SCALE_MAX_PERCENT) * 100}%`;
}

function levelLabel(index: number) {
  const { label, maxPercent: upper } = SLOPE_LEVELS[index];
  if (index === 0) {
    return `${label} · ${trim(upper)}% 이하 (${trim(percentToDeg(upper))}°)`;
  }
  const lower = SLOPE_LEVELS[index - 1].maxPercent;
  if (upper === Infinity) {
    return `${label} · ${trim(lower)}% 초과 (${trim(percentToDeg(lower))}°~)`;
  }
  return `${label} · ${trim(lower)} – ${trim(upper)}% (${trim(percentToDeg(lower))}–${trim(percentToDeg(upper))}°)`;
}

export default function SlopeLegend({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <div className="ku-slope-legend" aria-label="경사도 범례">
      <div className="ku-slope-legend-title">경사도 범례</div>
      <div className="ku-slope-scale" aria-hidden="true">
        <div className="ku-slope-scale-levels">
          {SLOPE_LEVELS.map((level, index) => {
            const lower = index === 0 ? 0 : SLOPE_LEVELS[index - 1].maxPercent;
            const upper = Math.min(level.maxPercent, SCALE_MAX_PERCENT);
            return (
              <span
                className="ku-slope-scale-level"
                key={level.label}
                style={{
                  left: position(lower),
                  right: `calc(100% - ${position(upper)})`,
                }}
              >
                {level.label}
              </span>
            );
          })}
        </div>
        <div
          className="ku-slope-scale-bar"
          style={{ backgroundImage: GRADIENT }}
        />
        <div className="ku-slope-scale-ticks">
          {SLOPE_LEVELS.slice(0, -1).map((level) => (
            <span
              className="ku-slope-scale-tick"
              key={level.label}
              style={{ left: position(level.maxPercent) }}
            >
              <span>{trim(level.maxPercent)}%</span>
              <span>{trim(percentToDeg(level.maxPercent))}°</span>
            </span>
          ))}
        </div>
      </div>
      <ul className="ku-visually-hidden">
        {SLOPE_LEVELS.map((level, index) => (
          <li key={level.label}>{levelLabel(index)}</li>
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
