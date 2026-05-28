"use client";

const LEGEND_ITEMS = [
  { color: "#22c55e", label: "0 ~ 2%" },
  { color: "#84cc16", label: "2 ~ 5%" },
  { color: "#eab308", label: "5 ~ 8.3%" },
];

const LEGEND_ITEMS_ABOVE = [
  { color: "#f97316", label: "8.3 ~ 12%" },
  { color: "#ef4444", label: "12 ~ 15%" },
  { color: "#991b1b", label: "15% 이상" },
];

export default function SlopeLegend({ show, isMobile }) {
  if (!show || isMobile) return null;

  return (
    <div style={{
      position: "absolute",
      bottom: "calc(170px + env(safe-area-inset-bottom, 0px))",
      right: 10,
      zIndex: 1000,
      background: "rgba(255,255,255,0.95)",
      borderRadius: 8,
      border: "1px solid #e5e7eb",
      boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
      padding: "10px 12px",
      minWidth: 155,
    }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: "#111", marginBottom: 8 }}>경사도 범례</div>
      {LEGEND_ITEMS.map(({ color, label }) => (
        <div key={color} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <div style={{ width: 24, height: 4, background: color, borderRadius: 2, flexShrink: 0 }} />
          <span style={{ fontSize: 11, color: "#444" }}>{label}</span>
        </div>
      ))}
      <div style={{ borderTop: "1px dashed #f97316", margin: "5px 0 4px", paddingTop: 4 }}>
        <span style={{ fontSize: 9, color: "#f97316", fontWeight: 600 }}>▶ 법적 기준 1/12 (8.33%)</span>
      </div>
      {LEGEND_ITEMS_ABOVE.map(({ color, label }) => (
        <div key={color} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <div style={{ width: 24, height: 4, background: color, borderRadius: 2, flexShrink: 0 }} />
          <span style={{ fontSize: 11, color: "#444" }}>{label}</span>
        </div>
      ))}
    </div>
  );
}
