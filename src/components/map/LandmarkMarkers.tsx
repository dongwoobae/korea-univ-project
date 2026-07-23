"use client";

import { Marker, Popup, useMap } from "react-leaflet";
import Image from "next/image";
import L from "leaflet";
import type { Landmark } from "@/types/domain";
import { useLanguage } from "@/lib/LanguageContext";
import { groupByPixelGrid } from "@/lib/mapMarkerLayout";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

const landmarkMarkerIcon = (
  landmark: Landmark,
  name: string,
  showLabel: boolean,
) => {
  const icon = escapeHtml(landmark.icon || "✨");
  return L.divIcon({
    className: "",
    html: `<div style="display:flex;flex-direction:column;align-items:center;gap:3px;white-space:nowrap"><div data-testid="landmark-marker-${landmark.id}" style="width:30px;height:30px;background:white;border:2px solid #C08A2D;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:15px;box-shadow:0 2px 7px rgba(28,25,23,0.22);">${icon}</div>${showLabel ? `<span data-testid="landmark-label" style="padding:2px 5px;border-radius:999px;color:#7A5C16;background:rgba(255,255,255,.92);box-shadow:0 1px 3px rgba(28,25,23,.12);font:700 10.5px Pretendard,sans-serif">${escapeHtml(name)}</span>` : ""}</div>`,
    iconAnchor: [17, 17],
    popupAnchor: [0, -20],
  });
};

const landmarkClusterIcon = (count: number) =>
  L.divIcon({
    className: "",
    html: `<div class="ku-marker-cluster ku-marker-cluster--landmark" data-testid="landmark-marker-cluster"><span aria-hidden="true">✨</span><strong>${count}</strong></div>`,
    iconSize: [42, 42],
    iconAnchor: [21, 21],
  });

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
  zoom: number;
}

export default function LandmarkMarkers({
  landmarks,
  showLandmarks,
  zoom,
}: LandmarkMarkersProps) {
  const { lang } = useLanguage();
  const map = useMap();
  if (!showLandmarks) return null;

  const groups =
    zoom < 18
      ? groupByPixelGrid(landmarks, (landmark) =>
          map.project(L.latLng(landmark.lat, landmark.lng), zoom),
        )
      : landmarks.map((landmark) => [landmark]);

  return (
    <>
      {groups.map((group) => {
        if (group.length > 1) {
          const bounds = L.latLngBounds(
            group.map((landmark) => [landmark.lat, landmark.lng]),
          );
          return (
            <Marker
              key={`landmark-cluster-${group.map((item) => item.id).join("-")}`}
              position={bounds.getCenter()}
              icon={landmarkClusterIcon(group.length)}
              title={`${group.length} ${lang === "en" ? "landmarks" : lang === "zh" ? "个景点" : "명소"}`}
              alt={`${group.length} ${lang === "en" ? "landmarks" : lang === "zh" ? "个景点" : "명소"}`}
              zIndexOffset={670}
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

        const landmark = group[0];
        const name = localizedText(landmark, "name", lang);
        const description = localizedText(landmark, "description", lang);

        return (
          <Marker
            key={landmark.id}
            position={[landmark.lat, landmark.lng]}
            icon={landmarkMarkerIcon(
              landmark,
              name ?? landmark.name,
              zoom >= 18,
            )}
            title={name ?? landmark.name}
            alt={name ?? landmark.name}
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
                  <div
                    style={{
                      position: "relative",
                      width: "100%",
                      height: 150,
                      borderRadius: 6,
                      marginTop: 8,
                      overflow: "hidden",
                    }}
                  >
                    <Image
                      src={landmark.photo_url}
                      alt={name ?? "명소 사진"}
                      fill
                      sizes="240px"
                      unoptimized
                      style={{ objectFit: "cover" }}
                    />
                  </div>
                )}
              </div>
            </Popup>
          </Marker>
        );
      })}
    </>
  );
}
