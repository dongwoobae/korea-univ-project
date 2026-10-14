"use client";

import { Marker, Tooltip } from "react-leaflet";
import L from "leaflet";
import AdminWorkspaceMap from "@/components/admin/workspace/AdminWorkspaceMap";
import type {
  DetailDraftPin,
  LatLngTuple,
  WorkspaceMapSlotProps,
} from "@/components/admin/workspace/types";
import { landmarkDisplayName } from "@/lib/landmarkWorkspace";
import { landmarkEmoji, LANDMARK_FALLBACK_EMOJI } from "@/lib/mapIcons";
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
  creating: boolean;
  draft: DetailDraftPin | null;
  onSelect: (id: string) => void;
}

export default function LandmarkWorkspaceMap({
  landmarks,
  selected,
  creating,
  draft,
  onSelect,
  ...slot
}: LandmarkWorkspaceMapProps) {
  const editor = draft && !draft.saving ? draft : null;
  const savedPosition: LatLngTuple | null = selected
    ? [selected.lat, selected.lng]
    : null;
  const pinPosition = draft ? draft.position : savedPosition;
  const pinId = selected?.id ?? "new";
  const pinEmoji = selected
    ? landmarkEmoji(draft?.emoji ?? selected.icon)
    : landmarkEmoji(draft?.emoji ?? LANDMARK_FALLBACK_EMOJI);
  const pinLabel = selected ? landmarkDisplayName(selected) : "새 명소";

  return (
    <AdminWorkspaceMap
      {...slot}
      onMapClick={
        editor ? (lat, lng) => editor.setPosition([lat, lng]) : undefined
      }
    >
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
      {pinPosition && (selected || creating) && (
        <Marker
          key={pinId}
          position={pinPosition}
          icon={markerIcon(pinId, pinEmoji, true)}
          draggable={editor !== null}
          zIndexOffset={1000}
          title={pinLabel}
          eventHandlers={{
            click: () => {
              if (selected) onSelect(selected.id);
            },
            dragend: (event) => {
              const { lat, lng } = (event.target as L.Marker).getLatLng();
              editor?.setPosition([lat, lng]);
            },
          }}
        >
          <Tooltip
            permanent
            direction="top"
            offset={[0, -22]}
            className="ku-workspace-marker-tooltip"
          >
            {pinLabel}
          </Tooltip>
        </Marker>
      )}
    </AdminWorkspaceMap>
  );
}
