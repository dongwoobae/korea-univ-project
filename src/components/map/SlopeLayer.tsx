"use client";
import { Polyline, Popup } from "react-leaflet";
import { slopeColor } from "@/lib/theme";
import type { SlopePoint, SlopeSegment } from "@/types/domain";

/**
 * 구버전 행은 slope·distance를 계산해 저장했고 신버전은 원시 포인트만 담는다.
 * 어느 쪽이 왔는지는 아래 SlopeLayer가 slope 유무로 가른다.
 */
type StoredPoint = SlopePoint & { slope?: number; distance?: number };
type MetricPoint = SlopePoint & { slope: number; distance: number };

function haversine(lat1: number, lng1: number, lat2: number, lng2: number) {
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

function medianFilter(points: SlopePoint[], half = 2): SlopePoint[] {
  return points.map((p, i) => {
    const start = Math.max(0, i - half);
    const end = Math.min(points.length - 1, i + half);
    const eles = points
      .slice(start, end + 1)
      .map((pt) => pt.ele ?? 0)
      .sort((a, b) => a - b);
    return { ...p, ele: eles[Math.floor(eles.length / 2)] };
  });
}

function processRawPoints(points: SlopePoint[]): MetricPoint[] {
  if (points.length < 2)
    return points.map((p) => ({ ...p, slope: 0, distance: 0 }));
  const smoothed = medianFilter(points);
  const result: MetricPoint[] = [{ ...smoothed[0], slope: 0, distance: 0 }];
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
      const eleDiff = (smoothed[i].ele ?? 0) - (smoothed[segStartIdx].ele ?? 0);
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

export default function SlopeLayer({ slopes }: { slopes: SlopeSegment[] }) {
  return slopes.flatMap((route) => {
    const raw = route.segments as StoredPoint[] | null;
    if (!raw?.length) return [];

    // 구버전(slope 필드 있음) / 신버전(raw points) 자동 감지
    const segs: MetricPoint[] =
      raw[1]?.slope !== undefined
        ? (raw as MetricPoint[])
        : processRawPoints(raw);

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
