"use client";
import { Polyline, Popup } from "react-leaflet";

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

// 안암역에서 걸어간다는 기준: 안암역에서 멀어지는 방향을 보행 진행 방향으로 봄
const ANAM = { lat: 37.5862, lng: 127.0294 };

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

function slopeColor(slope) {
  if (slope >= -1 && slope <= 1) return "#9ca3af"; // 평지
  const abs = Math.abs(slope);
  if (slope > 1) {
    // 오르막: 빨강 계열
    if (abs >= 15) return "#7f1d1d";
    if (abs >= 12) return "#991b1b";
    if (abs >= 8.33) return "#ef4444";
    if (abs >= 5) return "#f97316";
    if (abs >= 2) return "#fca5a5";
    return "#fed7aa";
  } else {
    // 내리막: 파랑 계열
    if (abs >= 15) return "#1e3a5f";
    if (abs >= 12) return "#1d4ed8";
    if (abs >= 8.33) return "#3b82f6";
    if (abs >= 5) return "#60a5fa";
    if (abs >= 2) return "#93c5fd";
    return "#bfdbfe";
  }
}

export default function SlopeLayer({ slopes }) {
  return slopes.flatMap((route) => {
    const raw = route.segments;
    if (!raw?.length) return [];

    // 구버전(slope 필드 있음) / 신버전(raw points) 자동 감지
    const segs = raw[1]?.slope !== undefined ? raw : processRawPoints(raw);

    return segs.slice(1).map((seg, i) => {
      const prev = segs[i];
      // 안암역에서 더 먼 점을 도착으로 보고 부호를 안암역 기준으로 재정렬
      const oriented =
        haversine(seg.lat, seg.lng, ANAM.lat, ANAM.lng) >=
        haversine(prev.lat, prev.lng, ANAM.lat, ANAM.lng)
          ? seg.slope
          : -seg.slope;
      return (
        <Polyline
          key={`${route.id}-${i}`}
          positions={[
            [prev.lat, prev.lng],
            [seg.lat, seg.lng],
          ]}
          pathOptions={{
            color: slopeColor(oriented),
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
                {oriented > 1 ? "오르막" : oriented < -1 ? "내리막" : "평지"}{" "}
                <strong>{Math.abs(oriented)}%</strong>
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
