// src/components/SlopeLayer.js
"use client";
import { Polyline, Popup } from "react-leaflet";

function slopeColor(slope) {
  if (slope >= 15) return "#991b1b";
  if (slope >= 12) return "#ef4444";
  if (slope >= 8.33) return "#f97316";
  if (slope >= 5) return "#eab308";
  if (slope >= 2) return "#84cc16";
  return "#22c55e";
}

export default function SlopeLayer({ slopes }) {
  return slopes.flatMap((route) => {
    const segs = route.segments;
    if (!segs?.length) return [];

    return segs.slice(1).map((seg, i) => {
      const prev = segs[i];
      return (
        <Polyline
          key={`${route.id}-${i}`}
          positions={[[prev.lat, prev.lng], [seg.lat, seg.lng]]}
          pathOptions={{ color: slopeColor(seg.slope), weight: 5, opacity: 0.85 }}
        >
          <Popup>
            <div style={{ fontSize: 13, lineHeight: 1.6 }}>
              <div style={{ fontWeight: 600, marginBottom: 2 }}>{route.name}</div>
              <div>경사도 <strong>{seg.slope}%</strong></div>
              <div style={{ color: "#888", fontSize: 11 }}>구간 거리 {seg.distance}m</div>
            </div>
          </Popup>
        </Polyline>
      );
    });
  });
}
