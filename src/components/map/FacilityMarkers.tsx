"use client";

import { Marker, Popup } from "react-leaflet";
import L from "leaflet";
import { FACILITY_COLORS } from "./facilityColors";

const facilityMarkerIcon = (code: string, icon: string) =>
  L.divIcon({
    className: "",
    html: `<div style="width:30px;height:30px;background:${FACILITY_COLORS[code as keyof typeof FACILITY_COLORS] ?? "#666"};border:2.5px solid white;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:14px;box-shadow:0 2px 6px rgba(0,0,0,0.25);">${icon}</div>`,
    iconAnchor: [15, 15],
    popupAnchor: [0, -18],
  });

interface FacilityMarkersProps {
  facilities: any[];
  activeTypes: Record<string, boolean>;
}

export default function FacilityMarkers({
  facilities,
  activeTypes,
}: FacilityMarkersProps) {
  return (
    <>
      {facilities
        .filter((f) => activeTypes[f.facility_types?.code])
        .map((f) => (
          <Marker
            key={f.id}
            position={[f.lat, f.lng]}
            icon={facilityMarkerIcon(
              f.facility_types?.code,
              f.facility_types?.icon,
            )}
            zIndexOffset={500}
          >
            <Popup>
              <div style={{ fontSize: 13, fontWeight: 600 }}>
                {f.name ?? f.facility_types?.label}
              </div>
              {f.description && (
                <div style={{ fontSize: 12, color: "#666", marginTop: 2 }}>
                  {f.description}
                </div>
              )}
              {f.floor_info && (
                <div style={{ fontSize: 12, color: "#888" }}>
                  {f.floor_info}
                </div>
              )}
              <div style={{ fontSize: 11, color: "#aaa", marginTop: 4 }}>
                {f.buildings?.name}
              </div>
            </Popup>
          </Marker>
        ))}
    </>
  );
}
