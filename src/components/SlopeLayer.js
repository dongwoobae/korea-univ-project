// src/components/SlopeLayer.js
"use client";
import { Polyline } from "react-leaflet";

function slopeColor(slope) {
  if (slope >= 8) return "#ef4444";
  if (slope >= 5) return "#facc15";
  return "#22c55e";
}

export default function SlopeLayer({ slopes }) {
  return slopes.flatMap((route) => {
    const segs = route.segments;
    if (!segs?.length) return [];

    const groups = [];
    let group = null;

    for (let i = 1; i < segs.length; i++) {
      const color = slopeColor(segs[i].slope);
      if (!group || group.color !== color) {
        group = { color, points: [[segs[i - 1].lat, segs[i - 1].lng]] };
        groups.push(group);
      }
      group.points.push([segs[i].lat, segs[i].lng]);
    }

    return groups.map((g) => (
      <Polyline
        key={`${route.id}-${g.points[0][0]}-${g.points[0][1]}`}
        positions={g.points}
        pathOptions={{ color: g.color, weight: 5, opacity: 0.85 }}
      />
    ));
  });
}
