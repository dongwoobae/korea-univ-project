"use client";

import { Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import type { MapFacility } from "@/types/domain";
import { useLanguage } from "@/lib/LanguageContext";
import { groupByPixelGrid } from "@/lib/mapMarkerLayout";
import { FACILITY_COLORS } from "./facilityColors";

const facilityMarkerIcon = (code: string, icon: string, id: string) =>
  L.divIcon({
    className: "",
    html: `<div data-testid="facility-marker-${id}" style="width:34px;height:34px;background:${FACILITY_COLORS[code as keyof typeof FACILITY_COLORS] ?? "#666"};border:2px solid white;border-radius:50% 50% 50% 4px;display:flex;align-items:center;justify-content:center;font-size:15px;box-shadow:0 2px 7px rgba(28,25,23,0.28);transform:rotate(-45deg);"><span style="transform:rotate(45deg)">${icon}</span></div>`,
    iconAnchor: [17, 30],
    popupAnchor: [0, -30],
  });

const facilityClusterIcon = (count: number) =>
  L.divIcon({
    className: "",
    html: `<div class="ku-marker-cluster" data-testid="facility-marker-cluster"><span aria-hidden="true">♿</span><strong>${count}</strong></div>`,
    iconSize: [42, 42],
    iconAnchor: [21, 21],
  });

interface FacilityMarkersProps {
  facilities: MapFacility[];
  activeTypes: Record<string, boolean>;
  zoom: number;
}

function localized(
  ko: string | null | undefined,
  en: string | null | undefined,
  zh: string | null | undefined,
  lang: "ko" | "en" | "zh",
) {
  return lang === "en" ? (en ?? ko) : lang === "zh" ? (zh ?? ko) : ko;
}

export default function FacilityMarkers({
  facilities,
  activeTypes,
  zoom,
}: FacilityMarkersProps) {
  const { lang } = useLanguage();
  const map = useMap();
  const visibleFacilities = facilities.filter(
    (facility) => activeTypes[facility.facility_types?.code ?? ""],
  );
  const groups =
    zoom < 18
      ? groupByPixelGrid(visibleFacilities, (facility) =>
          map.project(L.latLng(facility.lat!, facility.lng!), zoom),
        )
      : visibleFacilities.map((facility) => [facility]);

  return (
    <>
      {groups.map((group) => {
        if (group.length > 1) {
          const bounds = L.latLngBounds(
            group.map((facility) => [facility.lat!, facility.lng!]),
          );
          return (
            <Marker
              key={`facility-cluster-${group.map((item) => item.id).join("-")}`}
              position={bounds.getCenter()}
              icon={facilityClusterIcon(group.length)}
              title={`${group.length} ${localized("시설", "facilities", "个设施", lang)}`}
              alt={`${group.length} ${localized("시설", "facilities", "个设施", lang)}`}
              zIndexOffset={520}
              eventHandlers={{
                click() {
                  map.fitBounds(bounds, {
                    padding: [48, 48],
                    maxZoom: 18,
                    animate: true,
                  });
                },
              }}
            />
          );
        }

        const f = group[0];
        const name =
          localized(
            f.name ?? f.facility_types?.label,
            f.name_en ?? f.facility_types?.label_en,
            f.name_zh ?? f.facility_types?.label_zh,
            lang,
          ) ?? "";
        return (
          <Marker
            key={f.id}
            // lat/lng는 /api/facilities에서 not-null 필터를 거쳐 항상 존재
            position={[f.lat!, f.lng!]}
            icon={facilityMarkerIcon(
              f.facility_types?.code ?? "",
              f.facility_types?.icon ?? "",
              f.id,
            )}
            title={name}
            alt={name}
            zIndexOffset={500}
          >
            <Popup>
              <div style={{ fontSize: 13, fontWeight: 600 }}>
                {localized(
                  f.name ?? f.facility_types?.label,
                  f.name_en ?? f.facility_types?.label_en,
                  f.name_zh ?? f.facility_types?.label_zh,
                  lang,
                )}
              </div>
              {localized(
                f.description,
                f.description_en,
                f.description_zh,
                lang,
              ) && (
                <div style={{ fontSize: 12, color: "#666", marginTop: 2 }}>
                  {localized(
                    f.description,
                    f.description_en,
                    f.description_zh,
                    lang,
                  )}
                </div>
              )}
              {localized(
                f.floor_info,
                f.floor_info_en,
                f.floor_info_zh,
                lang,
              ) && (
                <div style={{ fontSize: 12, color: "#888" }}>
                  {localized(
                    f.floor_info,
                    f.floor_info_en,
                    f.floor_info_zh,
                    lang,
                  )}
                </div>
              )}
              {f.buildings?.name && (
                <div style={{ fontSize: 11, color: "#aaa", marginTop: 4 }}>
                  {localized(
                    f.buildings.name,
                    f.buildings.name_en,
                    undefined,
                    lang,
                  )}
                </div>
              )}
            </Popup>
          </Marker>
        );
      })}
    </>
  );
}
