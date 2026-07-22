"use client";

import { Marker, Popup } from "react-leaflet";
import L from "leaflet";
import type { MapFacility } from "@/types/domain";
import { useLanguage } from "@/lib/LanguageContext";
import { FACILITY_COLORS } from "./facilityColors";

const facilityMarkerIcon = (code: string, icon: string, id: string) =>
  L.divIcon({
    className: "",
    html: `<div data-testid="facility-marker-${id}" style="width:34px;height:34px;background:${FACILITY_COLORS[code as keyof typeof FACILITY_COLORS] ?? "#666"};border:2px solid white;border-radius:50% 50% 50% 4px;display:flex;align-items:center;justify-content:center;font-size:15px;box-shadow:0 2px 7px rgba(28,25,23,0.28);transform:rotate(-45deg);"><span style="transform:rotate(45deg)">${icon}</span></div>`,
    iconAnchor: [17, 30],
    popupAnchor: [0, -30],
  });

interface FacilityMarkersProps {
  facilities: MapFacility[];
  activeTypes: Record<string, boolean>;
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
}: FacilityMarkersProps) {
  const { lang } = useLanguage();
  return (
    <>
      {facilities
        .filter((f) => activeTypes[f.facility_types?.code ?? ""])
        .map((f) => (
          <Marker
            key={f.id}
            // lat/lng는 /api/facilities에서 not-null 필터를 거쳐 항상 존재
            position={[f.lat!, f.lng!]}
            icon={facilityMarkerIcon(
              f.facility_types?.code ?? "",
              f.facility_types?.icon ?? "",
              f.id,
            )}
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
        ))}
    </>
  );
}
