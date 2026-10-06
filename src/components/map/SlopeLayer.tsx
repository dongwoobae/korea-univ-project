"use client";
import { Polyline, Popup } from "react-leaflet";
import {
  degToPercent,
  formatDeg,
  formatPercent,
  slopeColorFromDeg,
} from "@/lib/slopeScale";
import { readRoutePoints } from "@/lib/slopeRoute";
import type { SlopeSegment } from "@/types/domain";

// /api/slopes는 id·name·segments만 select한다. Row 전체를 받는 것처럼 쓰면
// 런타임에 없는 필드를 있는 것으로 보증하게 된다.
type SlopeRoute = Pick<SlopeSegment, "id" | "name" | "segments">;

export default function SlopeLayer({ slopes }: { slopes: SlopeRoute[] }) {
  return slopes.flatMap((route) => {
    const points = readRoutePoints(route.segments);
    if (!points) return [];
    const [, ...measured] = points;

    return measured.map((point, i) => {
      const prev = points[i];
      return (
        <Polyline
          key={`${route.id}-${i}`}
          positions={[
            [prev.lat, prev.lng],
            [point.lat, point.lng],
          ]}
          pathOptions={{
            color: slopeColorFromDeg(point.slope),
            weight: 5,
            opacity: 0.85,
          }}
        >
          <Popup>
            <div style={{ fontSize: 13, lineHeight: 1.6 }}>
              <div style={{ fontWeight: 600, marginBottom: 2 }}>
                {route.name}
              </div>
              <div>
                경사 <strong>{formatPercent(degToPercent(point.slope))}</strong>{" "}
                ({formatDeg(point.slope)})
              </div>
              <div style={{ color: "#888", fontSize: 11 }}>
                구간 거리 {point.distance}m
              </div>
            </div>
          </Popup>
        </Polyline>
      );
    });
  });
}
