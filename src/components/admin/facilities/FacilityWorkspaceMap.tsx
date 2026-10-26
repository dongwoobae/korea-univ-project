"use client";

import { Marker, Tooltip } from "react-leaflet";
import L from "leaflet";
import AdminWorkspaceMap from "@/components/admin/workspace/AdminWorkspaceMap";
import type {
  DetailDraftPin,
  LatLngTuple,
  WorkspaceMapSlotProps,
} from "@/components/admin/workspace/types";
import { facilityDisplayName } from "@/lib/facilityWorkspace";
import {
  FALLBACK_FACILITY_STYLE,
  facilityIconSvg,
  facilityStyleOf,
  type FacilityStyle,
} from "@/lib/facilityStyleCatalog";
import { useFacilityTypes } from "@/lib/facilityTypesStore";
import type { FacilityWithType } from "@/types/domain";

// 렌더마다 새 아이콘을 만들면 react-leaflet이 마커 DOM을 매번 갈아 끼운다(FacilityMarkers와 같은 이유).
const iconCache = new Map<string, L.DivIcon>();

function markerIcon(id: string, style: FacilityStyle, selected: boolean) {
  // 키에 아이콘이 없으면 아이콘만 바꾼 종류의 옛 아이콘이 이 키로 남는다
  const key = `${id}|${style.icon}|${style.color}|${selected}`;
  const cached = iconCache.get(key);
  if (cached) return cached;
  const size = selected ? 30 : 24;
  const icon = L.divIcon({
    className: "",
    html: `<div class="ku-workspace-marker${selected ? " ku-workspace-marker--selected" : ""}" data-testid="admin-facility-marker-${id}" style="background:${style.color}"><span aria-hidden="true">${facilityIconSvg(style.icon, selected ? 15 : 12)}</span></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
  iconCache.set(key, icon);
  return icon;
}

interface FacilityWorkspaceMapProps extends WorkspaceMapSlotProps {
  /** 거른 결과 전체(페이지와 상관없다) */
  facilities: FacilityWithType[];
  selected: FacilityWithType | null;
  creating: boolean;
  draft: DetailDraftPin | null;
  onSelect: (id: string) => void;
}

export default function FacilityWorkspaceMap({
  facilities,
  selected,
  creating,
  draft,
  onSelect,
  ...slot
}: FacilityWorkspaceMapProps) {
  const { types } = useFacilityTypes();
  const editor = draft && !draft.saving ? draft : null;
  const savedPosition: LatLngTuple | null =
    selected && selected.lat != null && selected.lng != null
      ? [selected.lat, selected.lng]
      : null;
  const pinPosition = draft ? draft.position : savedPosition;
  const pinCode = selected?.facility_code ?? null;
  const pinLabel = selected ? facilityDisplayName(selected) : "새 시설";

  return (
    <AdminWorkspaceMap
      {...slot}
      onMapClick={
        editor ? (lat, lng) => editor.setPosition([lat, lng]) : undefined
      }
    >
      {facilities.map((facility) =>
        facility.id === selected?.id ||
        facility.lat == null ||
        facility.lng == null ? null : (
          <Marker
            key={facility.id}
            position={[facility.lat, facility.lng]}
            icon={markerIcon(
              facility.id,
              facilityStyleOf(types, facility.facility_code),
              false,
            )}
            title={facilityDisplayName(facility)}
            eventHandlers={{ click: () => onSelect(facility.id) }}
          />
        ),
      )}
      {pinPosition && (selected || creating) && (
        <Marker
          key={selected?.id ?? "new"}
          position={pinPosition}
          icon={
            selected
              ? markerIcon(selected.id, facilityStyleOf(types, pinCode), true)
              : markerIcon(
                  "new",
                  {
                    icon: FALLBACK_FACILITY_STYLE.icon,
                    color: "var(--ku-primary)",
                  },
                  true,
                )
          }
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
            offset={[0, -18]}
            className="ku-workspace-marker-tooltip"
          >
            {pinLabel}
          </Tooltip>
        </Marker>
      )}
    </AdminWorkspaceMap>
  );
}
