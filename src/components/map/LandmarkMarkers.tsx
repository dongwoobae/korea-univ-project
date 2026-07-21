"use client";

import { Marker, Popup } from "react-leaflet";
import L from "leaflet";
import type { Landmark } from "@/types/domain";
import { useLanguage } from "@/lib/LanguageContext";

const LANDMARK_COLOR = "#F4B942";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

const landmarkMarkerIcon = (landmark: Landmark) => {
  const content = landmark.image_url
    ? `<img src="${escapeHtml(landmark.image_url)}" alt="" style="width:22px;height:22px;border-radius:50%;object-fit:cover;display:block;" />`
    : escapeHtml(landmark.icon);

  return L.divIcon({
    className: "",
    html: `<div data-testid="landmark-marker-${landmark.id}" style="width:34px;height:34px;background:${LANDMARK_COLOR};border:2.5px solid white;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:18px;box-shadow:0 2px 7px rgba(0,0,0,0.24);">${content}</div>`,
    iconAnchor: [17, 17],
    popupAnchor: [0, -20],
  });
};

function localizedText(
  landmark: Landmark,
  field: "name" | "description",
  lang: "ko" | "en" | "zh",
): string | null {
  if (field === "name") {
    if (lang === "en") return landmark.name_en ?? landmark.name;
    if (lang === "zh") return landmark.name_zh ?? landmark.name;
    return landmark.name;
  }

  if (lang === "en") return landmark.description_en ?? landmark.description;
  if (lang === "zh") return landmark.description_zh ?? landmark.description;
  return landmark.description;
}

interface LandmarkMarkersProps {
  landmarks: Landmark[];
  showLandmarks: boolean;
}

export default function LandmarkMarkers({
  landmarks,
  showLandmarks,
}: LandmarkMarkersProps) {
  const { lang } = useLanguage();
  if (!showLandmarks) return null;

  return (
    <>
      {landmarks.map((landmark) => {
        const name = localizedText(landmark, "name", lang);
        const description = localizedText(landmark, "description", lang);

        return (
          <Marker
            key={landmark.id}
            position={[landmark.lat, landmark.lng]}
            icon={landmarkMarkerIcon(landmark)}
            zIndexOffset={650}
          >
            <Popup>
              <div style={{ minWidth: 180, maxWidth: 240 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#222" }}>
                  <span style={{ marginRight: 6 }}>{landmark.icon}</span>
                  {name}
                </div>
                {description && (
                  <div style={{ fontSize: 12, color: "#666", marginTop: 5 }}>
                    {description}
                  </div>
                )}
                {landmark.photo_url && (
                  <img
                    src={landmark.photo_url}
                    alt={name ?? "명소 사진"}
                    style={{
                      width: "100%",
                      maxHeight: 150,
                      objectFit: "cover",
                      borderRadius: 6,
                      marginTop: 8,
                      display: "block",
                    }}
                  />
                )}
              </div>
            </Popup>
          </Marker>
        );
      })}
    </>
  );
}
