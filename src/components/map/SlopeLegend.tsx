"use client";

const UPHILL_ITEMS = [
  { color: "#fed7aa", label: "1 ~ 2%" },
  { color: "#fca5a5", label: "2 ~ 5%" },
  { color: "#f97316", label: "5 ~ 8.3%" },
  { color: "#ef4444", label: "8.3 ~ 12%" },
  { color: "#991b1b", label: "12 ~ 15%" },
  { color: "#7f1d1d", label: "15% 이상" },
];

const DOWNHILL_ITEMS = [
  { color: "#bfdbfe", label: "1 ~ 2%" },
  { color: "#93c5fd", label: "2 ~ 5%" },
  { color: "#60a5fa", label: "5 ~ 8.3%" },
  { color: "#3b82f6", label: "8.3 ~ 12%" },
  { color: "#1d4ed8", label: "12 ~ 15%" },
  { color: "#1e3a5f", label: "15% 이상" },
];

function LegendRow({ color, label }) {
  return (
    <div
      style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}
    >
      <div
        style={{
          width: 24,
          height: 4,
          background: color,
          borderRadius: 2,
          flexShrink: 0,
        }}
      />
      <span style={{ fontSize: 11, color: "#444" }}>{label}</span>
    </div>
  );
}

export default function SlopeLegend({ show, isMobile }) {
  if (!show || isMobile) return null;

  return (
    <div
      style={{
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
      }}
    >
      <div
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: "#111",
          marginBottom: 8,
        }}
      >
        경사도 범례
      </div>

      <div
        style={{
          fontSize: 10,
          fontWeight: 600,
          color: "#dc2626",
          marginBottom: 4,
        }}
      >
        ▲ 오르막
      </div>
      {UPHILL_ITEMS.map(({ color, label }) => (
        <LegendRow key={color} color={color} label={label} />
      ))}

      <div
        style={{
          borderTop: "1px dashed #f97316",
          margin: "5px 0 4px",
          paddingTop: 4,
        }}
      >
        <span style={{ fontSize: 9, color: "#f97316", fontWeight: 600 }}>
          ▶ 법적 기준 1/12 (8.33%)
        </span>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          margin: "4px 0 6px",
        }}
      >
        <div
          style={{
            width: 24,
            height: 4,
            background: "#9ca3af",
            borderRadius: 2,
            flexShrink: 0,
          }}
        />
        <span style={{ fontSize: 11, color: "#444" }}>평지 (±1%)</span>
      </div>

      <div
        style={{
          fontSize: 10,
          fontWeight: 600,
          color: "#1d4ed8",
          marginBottom: 4,
        }}
      >
        ▼ 내리막
      </div>
      {DOWNHILL_ITEMS.map(({ color, label }) => (
        <LegendRow key={color} color={color} label={label} />
      ))}
    </div>
  );
}
