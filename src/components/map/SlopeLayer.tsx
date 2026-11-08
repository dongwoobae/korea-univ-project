"use client";
import { scaledFontSize } from "@/lib/fontScale";
import { Polyline, Popup } from "react-leaflet";
import {
  SLOPE_CASING_CLASS,
  slopeBandFromDeg,
  slopeCasingStyle,
} from "@/lib/slopeBands";
import { useSlopeBands } from "@/lib/slopeBandsStore";
import { degToPercent, formatDeg, formatPercent } from "@/lib/slopeScale";
import { readRoutePoints } from "@/lib/slopeRoute";
import {
  STAIRS_HIT_CLASS,
  STAIRS_LINE_CLASS,
  readStairsPoints,
  stairsCasingStyle,
  stairsHitStyle,
  stairsLineStyle,
} from "@/lib/stairs";
import type { SlopeSegment } from "@/types/domain";

// /api/slopes는 id·name·kind·note·segments만 select한다. Row 전체를 받는 것처럼 쓰면
// 런타임에 없는 필드를 있는 것으로 보증하게 된다.
type SlopeRoute = Pick<
  SlopeSegment,
  "id" | "name" | "kind" | "note" | "segments"
>;

const LINE_WEIGHT = 5;
const LINE_OPACITY = 0.85;

export default function SlopeLayer({
  slopes,
  darkMap,
}: {
  slopes: SlopeRoute[];
  /** 어두운 거리 지도면 외곽선이 흰색이다 */
  darkMap: boolean;
}) {
  const { bands } = useSlopeBands();
  const casing = slopeCasingStyle(LINE_WEIGHT, darkMap);
  const stairsCasing = stairsCasingStyle(LINE_WEIGHT, darkMap);
  const stairs = slopes.flatMap((route) => {
    if (route.kind !== "stairs") return [];
    const points = readStairsPoints(route.segments);
    if (!points) return [];
    return [
      {
        key: `stairs-${route.id}`,
        route,
        positions: points.map(({ lat, lng }) => [lat, lng] as [number, number]),
      },
    ];
  });
  const lines = slopes.flatMap((route) => {
    if (route.kind === "stairs") return [];
    const points = readRoutePoints(route.segments);
    if (!points) return [];
    const [, ...measured] = points;
    return measured.map((point, i) => ({
      key: `${route.id}-${i}`,
      route,
      point,
      positions: [
        [points[i].lat, points[i].lng],
        [point.lat, point.lng],
      ] as [number, number][],
    }));
  });

  // 외곽선을 전부 먼저 마운트한다. SVG는 붙인 순서대로 쌓여, 구간마다 번갈아 그리면 다음 외곽선이 앞 선의 끝을 덮는다.
  // 계단은 경사로보다 먼저 붙여, 이어 붙인 계단 끝이 경사로 끝 밑으로 들어간다(설계 2026-11-06 7.2).
  // className·interactive는 최상위 prop이다 — react-leaflet은 pathOptions를 선을 붙인 뒤 setStyle로 넘기고,
  // Leaflet은 둘을 선을 만들 때만 읽는다
  return (
    <>
      {stairs.map(({ key, positions }) => (
        <Polyline
          key={`casing-${key}`}
          positions={positions}
          className={SLOPE_CASING_CLASS}
          interactive={false}
          pathOptions={stairsCasing}
        />
      ))}
      {lines.map(({ key, positions }) => (
        <Polyline
          key={`casing-${key}`}
          positions={positions}
          className={SLOPE_CASING_CLASS}
          interactive={false}
          pathOptions={casing}
        />
      ))}
      {stairs.map(({ key, positions }) => (
        <Polyline
          key={key}
          positions={positions}
          className={STAIRS_LINE_CLASS}
          interactive={false}
          pathOptions={stairsLineStyle(LINE_WEIGHT, LINE_OPACITY)}
        />
      ))}
      {stairs.map(({ key, route, positions }) => (
        <Polyline
          key={`hit-${key}`}
          positions={positions}
          className={STAIRS_HIT_CLASS}
          pathOptions={stairsHitStyle()}
        >
          <Popup>
            <div style={{ fontSize: scaledFontSize(13), lineHeight: 1.6 }}>
              <strong style={{ display: "block", marginBottom: 2 }}>
                계단
              </strong>
              <div>{route.name}</div>
              {route.note?.trim() && (
                <div
                  style={{
                    color: "var(--ku-text-3)",
                    fontSize: scaledFontSize(11),
                  }}
                >
                  {route.note}
                </div>
              )}
            </div>
          </Popup>
        </Polyline>
      ))}
      {lines.map(({ key, route, point, positions }) => (
        <Polyline
          key={key}
          positions={positions}
          pathOptions={{
            color: slopeBandFromDeg(bands, point.slope).color,
            weight: LINE_WEIGHT,
            opacity: LINE_OPACITY,
          }}
        >
          <Popup>
            <div style={{ fontSize: scaledFontSize(13), lineHeight: 1.6 }}>
              <div style={{ fontWeight: 600, marginBottom: 2 }}>
                {route.name}
              </div>
              <div>
                경사 <strong>{formatPercent(degToPercent(point.slope))}</strong>{" "}
                ({formatDeg(point.slope)})
              </div>
              <div
                style={{
                  color: "var(--ku-text-3)",
                  fontSize: scaledFontSize(11),
                }}
              >
                구간 거리 {point.distance}m
              </div>
            </div>
          </Popup>
        </Polyline>
      ))}
    </>
  );
}
