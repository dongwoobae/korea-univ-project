"use client";

import { Marker, Tooltip } from "react-leaflet";
import L from "leaflet";
import AdminWorkspaceMap from "@/components/admin/workspace/AdminWorkspaceMap";
import type { WorkspaceMapSlotProps } from "@/components/admin/workspace/types";
import { landmarkDisplayName } from "@/lib/landmarkWorkspace";
import { landmarkEmoji } from "@/lib/mapIcons";
import type { Landmark } from "@/types/domain";

// 렌더마다 새 아이콘을 만들면 react-leaflet이 마커 DOM을 매번 갈아 끼운다(FacilityWorkspaceMap과 같은 이유).
const iconCache = new Map<string, L.DivIcon>();

function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (char) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[char] ?? char,
  );
}

function markerIcon(id: string, emoji: string, selected: boolean) {
  const key = `${id}|${emoji}|${selected}`;
  const cached = iconCache.get(key);
  if (cached) return cached;
  const size = selected ? 38 : 30;
  const icon = L.divIcon({
    className: "",
    html: `<div class="ku-landmark-marker${selected ? " ku-landmark-marker--selected" : ""}" data-testid="admin-landmark-marker-${escapeHtml(id)}"><span aria-hidden="true">${escapeHtml(emoji)}</span></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
  iconCache.set(key, icon);
  return icon;
}

interface LandmarkWorkspaceMapProps extends WorkspaceMapSlotProps {
  /** 거른 결과 전체(페이지와 상관없다) */
  landmarks: Landmark[];
  selected: Landmark | null;
  onSelect: (id: string) => void;
}

export default function LandmarkWorkspaceMap({
  landmarks,
  selected,
  onSelect,
  ...slot
}: LandmarkWorkspaceMapProps) {
  return (
    <AdminWorkspaceMap {...slot}>
      {landmarks.map((landmark) =>
        landmark.id === selected?.id ? null : (
          <Marker
            key={landmark.id}
            position={[landmark.lat, landmark.lng]}
            icon={markerIcon(landmark.id, landmarkEmoji(landmark.icon), false)}
            title={landmarkDisplayName(landmark)}
            eventHandlers={{ click: () => onSelect(landmark.id) }}
          />
        ),
      )}
      {selected && (
        <Marker
          key={selected.id}
          position={[selected.lat, selected.lng]}
          icon={markerIcon(selected.id, landmarkEmoji(selected.icon), true)}
          zIndexOffset={1000}
          title={landmarkDisplayName(selected)}
          eventHandlers={{ click: () => onSelect(selected.id) }}
        >
          <Tooltip
            permanent
            direction="top"
            offset={[0, -22]}
            className="ku-workspace-marker-tooltip"
          >
            {landmarkDisplayName(selected)}
          </Tooltip>
        </Marker>
      )}
    </AdminWorkspaceMap>
  );
}
