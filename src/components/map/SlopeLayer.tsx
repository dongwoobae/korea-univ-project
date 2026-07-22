"use client";
import { Polyline, Popup } from "react-leaflet";
import { slopeColor } from "@/lib/theme";

function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function medianFilter(points, half = 2) {
  return points.map((p, i) => {
    const start = Math.max(0, i - half);
    const end = Math.min(points.length - 1, i + half);
    const eles = points
      .slice(start, end + 1)
      .map((pt) => pt.ele)
      .sort((a, b) => a - b);
    return { ...p, ele: eles[Math.floor(eles.length / 2)] };
  });
}

function processRawPoints(points) {
  if (points.length < 2)
    return points.map((p) => ({ ...p, slope: 0, distance: 0 }));
  const smoothed = medianFilter(points);
  const result = [{ ...smoothed[0], slope: 0, distance: 0 }];
  let accumDist = 0;
  let segStartIdx = 0;
  for (let i = 1; i < smoothed.length; i++) {
    accumDist += haversine(
      smoothed[i - 1].lat,
      smoothed[i - 1].lng,
      smoothed[i].lat,
      smoothed[i].lng,
    );
    const isLast = i === smoothed.length - 1;
    if (accumDist >= 10 || (isLast && accumDist >= 5)) {
      const eleDiff = smoothed[i].ele - smoothed[segStartIdx].ele;
      const rawSlope = accumDist > 0 ? (eleDiff / accumDist) * 100 : 0;
      const slope = Math.abs(rawSlope) > 30 ? 0 : rawSlope;
      result.push({
        lat: smoothed[i].lat,
        lng: smoothed[i].lng,
        ele: smoothed[i].ele,
        slope: Math.round(slope * 10) / 10,
        distance: Math.round(accumDist * 10) / 10,
      });
      segStartIdx = i;
      accumDist = 0;
    } else if (isLast && result.length > 1) {
      const last = result[result.length - 1];
      last.lat = smoothed[i].lat;
      last.lng = smoothed[i].lng;
      last.ele = smoothed[i].ele;
    }
  }
  return result;
}

export default function SlopeLayer({ slopes }) {
  return slopes.flatMap((route) => {
    const raw = route.segments;
    if (!raw?.length) return [];

    // 구버전(slope 필드 있음) / 신버전(raw points) 자동 감지
    const segs = raw[1]?.slope !== undefined ? raw : processRawPoints(raw);

    return segs.slice(1).map((seg, i) => {
      const prev = segs[i];
      const absoluteSlope = Math.abs(seg.slope);
      return (
        <Polyline
          key={`${route.id}-${i}`}
          positions={[
            [prev.lat, prev.lng],
            [seg.lat, seg.lng],
          ]}
          pathOptions={{
            color: slopeColor(absoluteSlope),
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
                경사 <strong>{absoluteSlope}%</strong>
              </div>
              <div style={{ color: "#888", fontSize: 11 }}>
                구간 거리 {seg.distance}m
              </div>
            </div>
          </Popup>
        </Polyline>
      );
    });
  });
}
