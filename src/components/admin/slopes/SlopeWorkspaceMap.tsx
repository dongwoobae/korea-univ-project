"use client";

import { Fragment } from "react";
import { Marker, Polyline } from "react-leaflet";
import L from "leaflet";
import AdminWorkspaceMap from "@/components/admin/workspace/AdminWorkspaceMap";
import type { WorkspaceMapSlotProps } from "@/components/admin/workspace/types";
import {
  SLOPE_CASING_CLASS,
  slopeBandFromDeg,
  slopeCasingStyle,
  type SlopeBand,
} from "@/lib/slopeBands";
import { useSlopeBands } from "@/lib/slopeBandsStore";
import {
  SLOPE_COLLECTION_POLICY,
  type SlopeListItem,
  type SlopeRouteSummary,
} from "@/lib/slopeWorkspace";

const DIMMED_OPACITY = 0.28;

// 고른 경로는 key를 바꿔 다시 붙고(아래), 검색으로 빠졌다 돌아온 경로도 다시 붙어 SVG 맨 뒤로 간다. 외곽선은 붙을 때마다
// 맨 앞(아래)으로 보내 다른 경로의 선을 덮지 않게 한다. 별도 pane은 쓰지 않는다 — 그 SVG는 globals.css의 will-change
// 규칙 밖이라 드래그 끝 밀림이 돌아오고, 위 pane의 SVG가 아래 pane의 클릭을 가린다(설계 2026-10-19 11장)
const SEND_TO_BACK = {
  add: (event: L.LeafletEvent) => {
    (event.target as L.Path).bringToBack();
  },
};

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
  bands: readonly SlopeBand[];
  selected: boolean;
  dimmed: boolean;
  onSelect: (id: string) => void;
}

function RouteLines({
  id,
  summary,
  bands,
  selected,
  dimmed,
  onSelect,
}: RouteLinesProps) {
  const weight = selected ? 7 : 5;
  const opacity = dimmed ? DIMMED_OPACITY : 1;
  const casing = slopeCasingStyle(weight, false, opacity);
  return summary.segments.map((segment) => (
    <Fragment key={segment.index}>
      <Polyline
        positions={[segment.from, segment.to]}
        className={SLOPE_CASING_CLASS}
        interactive={false}
        pathOptions={{ ...casing, lineCap: "round" }}
        eventHandlers={SEND_TO_BACK}
      />
      <Polyline
        positions={[segment.from, segment.to]}
        // className은 Leaflet이 선을 만들 때만 읽는다. react-leaflet은 pathOptions를 선을 붙인 뒤 setStyle로 넘겨 거기 두면 빠진다
        className={`ku-slope-route ku-slope-route-${id}`}
        pathOptions={{
          color: slopeBandFromDeg(bands, segment.slope).color,
          weight,
          opacity,
          lineCap: "round",
        }}
        eventHandlers={{ click: () => onSelect(id) }}
      />
    </Fragment>
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
  const { bands } = useSlopeBands();
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
            bands={bands}
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
            bands={bands}
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
