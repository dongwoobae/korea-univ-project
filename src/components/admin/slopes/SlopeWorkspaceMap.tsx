"use client";

import { Marker, Polyline } from "react-leaflet";
import L from "leaflet";
import AdminWorkspaceMap from "@/components/admin/workspace/AdminWorkspaceMap";
import type { WorkspaceMapSlotProps } from "@/components/admin/workspace/types";
import { SLOPE_GRADE_COLORS } from "@/lib/slopeScale";
import {
  SLOPE_COLLECTION_POLICY,
  type SlopeListItem,
  type SlopeRouteSummary,
} from "@/lib/slopeWorkspace";

const DIMMED_OPACITY = 0.28;

// 렌더마다 새 아이콘을 만들면 react-leaflet이 마커 DOM을 매번 갈아 끼운다(LandmarkWorkspaceMap과 같은 이유).
const labelCache = new Map<number, L.DivIcon>();

function segmentLabel(number: number) {
  const cached = labelCache.get(number);
  if (cached) return cached;
  const icon = L.divIcon({
    className: "ku-slope-segment-label",
    html: String(number),
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });
  labelCache.set(number, icon);
  return icon;
}

interface RouteLinesProps {
  id: string;
  summary: SlopeRouteSummary;
  selected: boolean;
  dimmed: boolean;
  onSelect: (id: string) => void;
}

function RouteLines({
  id,
  summary,
  selected,
  dimmed,
  onSelect,
}: RouteLinesProps) {
  return summary.segments.map((segment) => (
    <Polyline
      key={segment.index}
      positions={[segment.from, segment.to]}
      pathOptions={{
        color: SLOPE_GRADE_COLORS[segment.grade],
        weight: selected ? 7 : 5,
        opacity: dimmed ? DIMMED_OPACITY : 1,
        lineCap: "round",
        // Leaflet은 className을 선을 만들 때만 붙인다. 경로마다 바뀌지 않는 값만 둔다
        className: `ku-slope-route ku-slope-route-${id}`,
      }}
      eventHandlers={{ click: () => onSelect(id) }}
    />
  ));
}

interface SlopeWorkspaceMapProps extends WorkspaceMapSlotProps {
  /** 거른 결과 전체(페이지와 상관없다). 저장 형식이 깨진 경로는 그리지 않는다 */
  routes: SlopeListItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export default function SlopeWorkspaceMap({
  routes,
  selectedId,
  onSelect,
  ...slot
}: SlopeWorkspaceMapProps) {
  const selected =
    routes.find((item) => SLOPE_COLLECTION_POLICY.id(item) === selectedId) ??
    null;

  return (
    <AdminWorkspaceMap {...slot}>
      {routes.map((item) => {
        const id = SLOPE_COLLECTION_POLICY.id(item);
        if (!item.summary || id === selectedId) return null;
        return (
          <RouteLines
            key={id}
            id={id}
            summary={item.summary}
            selected={false}
            dimmed={selectedId !== null}
            onSelect={onSelect}
          />
        );
      })}
      {/* 따로 된 key로 다시 붙여 SVG 맨 뒤(위)에 그린다. 흐린 선 밑에 고른 선이 깔리지 않게 한다 */}
      {selected?.summary && (
        <>
          <RouteLines
            key={`selected:${selectedId}`}
            id={SLOPE_COLLECTION_POLICY.id(selected)}
            summary={selected.summary}
            selected
            dimmed={false}
            onSelect={onSelect}
          />
          {selected.summary.segments.map((segment) => (
            <Marker
              key={`label:${selectedId}:${segment.index}`}
              position={[
                (segment.from[0] + segment.to[0]) / 2,
                (segment.from[1] + segment.to[1]) / 2,
              ]}
              icon={segmentLabel(segment.index + 1)}
              interactive={false}
              keyboard={false}
            />
          ))}
        </>
      )}
    </AdminWorkspaceMap>
  );
}
