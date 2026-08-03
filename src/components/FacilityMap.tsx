"use client";

import { useState, useEffect } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  GeoJSON,
  useMapEvents,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import type { Feature, FeatureCollection } from "geojson";
import "leaflet/dist/leaflet.css";
import {
  NEIGHBOR_STYLE,
  fetchNeighborBuildings,
} from "@/lib/neighborBuildings";
import { CARTO_ATTRIBUTION, getCartoTileUrl } from "@/lib/mapTiles";
import { usePrefersDarkMode } from "@/lib/usePrefersDarkMode";

const markerIcon = new L.Icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

function ClickHandler({ onMapClick }) {
  useMapEvents({
    click(e) {
      onMapClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

function MapInstanceCapture({ onReady }) {
  const map = useMap();
  useEffect(() => {
    onReady(map);
  }, [map, onReady]);
  return null;
}

export default function FacilityMap({
  center,
  markerPosition,
  onMapClick,
  highlightId,
}: {
  center: [number, number];
  markerPosition: [number, number] | null;
  onMapClick: (lat: number, lng: number) => void;
  highlightId?: number;
}) {
  const prefersDarkMode = usePrefersDarkMode();
  const [map, setMap] = useState<L.Map | null>(null);
  const [locating, setLocating] = useState(false);
  const [buildingFeatures, setBuildingFeatures] = useState<Feature[] | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;
    void fetchNeighborBuildings()
      .then((features) => {
        if (!cancelled) setBuildingFeatures(features);
      })
      .catch(() => {
        // 배경 건물은 보조 정보다. 실패해도 시설 위치 선택은 계속할 수 있다.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function handleLocate() {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        map?.flyTo([coords.latitude, coords.longitude], 18);
        onMapClick(coords.latitude, coords.longitude);
        setLocating(false);
      },
      () => setLocating(false),
      { timeout: 10000, enableHighAccuracy: true },
    );
  }

  return (
    <div style={{ position: "relative" }}>
      <MapContainer
        center={center}
        zoom={18}
        style={{ width: "100%", height: 250 }}
        scrollWheelZoom={true}
      >
        <TileLayer
          key={prefersDarkMode ? "dark" : "light"}
          url={getCartoTileUrl(prefersDarkMode)}
          attribution={CARTO_ATTRIBUTION}
          subdomains="abcd"
        />
        {buildingFeatures && (
          <GeoJSON
            key={buildingFeatures.length}
            data={
              {
                type: "FeatureCollection",
                features: buildingFeatures,
              } as FeatureCollection
            }
            style={(f) =>
              String(f?.properties?.bid) === String(highlightId ?? "")
                ? {
                    color: "#2563EB",
                    weight: 2,
                    fillColor: "#2563EB",
                    fillOpacity: 0.15,
                  }
                : NEIGHBOR_STYLE
            }
            interactive={false}
            onEachFeature={(f, layer) => {
              if (f.properties?.name) {
                layer.bindTooltip(f.properties.name, {
                  permanent: true,
                  direction: "center",
                  className: "bldg-label",
                });
              }
            }}
          />
        )}
        <MapInstanceCapture onReady={setMap} />
        <ClickHandler onMapClick={onMapClick} />
        {markerPosition && (
          <Marker position={markerPosition} icon={markerIcon} />
        )}
      </MapContainer>
      <button
        onClick={handleLocate}
        disabled={locating}
        title="현재 위치로 이동"
        style={{
          position: "absolute",
          bottom: 24,
          right: 8,
          zIndex: 1000,
          width: 34,
          height: 34,
          background: "#fff",
          border: "2px solid rgba(0,0,0,0.2)",
          borderRadius: 4,
          cursor: locating ? "wait" : "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 18,
          boxShadow: "0 1px 5px rgba(0,0,0,0.15)",
        }}
      >
        {locating ? "⏳" : "📍"}
      </button>
    </div>
  );
}
