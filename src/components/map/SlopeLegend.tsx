"use client";

const ITEMS = [
  { color: "#B5AFA8", label: "평지 (±1%)" },
  { color: "#DDC26A", label: "1 – 2%" },
  { color: "#D89A3A", label: "2 – 5%" },
  { color: "#C96C24", label: "5 – 8.3%" },
  { color: "#AE3B1E", label: "8.3 – 12%" },
  { color: "#7A1414", label: "12% 이상" },
];

export default function SlopeLegend({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <div className="ku-slope-legend" aria-label="경사도 범례">
      <div className="ku-slope-legend-title">경사도 범례</div>
      {ITEMS.map((item) => (
        <div className="ku-slope-row" key={item.color}>
          <span
            className="ku-slope-line"
            style={{ "--slope-color": item.color } as React.CSSProperties}
          />
          <span>{item.label}</span>
        </div>
      ))}
      <div className="ku-slope-threshold">▶ 법적 기준 1/12 (8.33%)</div>
    </div>
  );
}
