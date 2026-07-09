"use client";

import { useState, useEffect } from "react";
import { MapContainer, TileLayer, Marker, GeoJSON, useMapEvents, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { supabase } from "@/lib/supabaseClient";

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
  useEffect(() => { onReady(map); }, [map, onReady]);
  return null;
}

export default function FacilityMap({ center, markerPosition, onMapClick, highlightId }) {
  const [map, setMap] = useState(null);
  const [locating, setLocating] = useState(false);
  const [buildingFeatures, setBuildingFeatures] = useState(null);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from("buildings")
      .select("id, name, geojson")
      .eq("is_deleted", false)
      .not("geojson", "is", null)
      .then(({ data }) => {
        if (cancelled) return;
        setBuildingFeatures(
          (data ?? [])
            .filter((b) => (b.geojson as any)?.geometry)
            .map((b) => {
              const g = b.geojson as any;
              return { ...g, properties: { ...(g.properties ?? {}), bid: b.id, name: b.name } };
            }),
        );
      });
    return () => { cancelled = true; };
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
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
          attribution="&copy; OpenStreetMap &copy; CARTO"
          subdomains="abcd"
        />
        {buildingFeatures && (
          <GeoJSON
            key={buildingFeatures.length}
            data={{ type: "FeatureCollection", features: buildingFeatures } as any}
            style={(f) =>
              String(f.properties.bid) === String(highlightId ?? "")
                ? { color: "#2563EB", weight: 2, fillColor: "#2563EB", fillOpacity: 0.15 }
                : { color: "#9ca3af", weight: 1, fillColor: "#9ca3af", fillOpacity: 0.2 }
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
        {markerPosition && <Marker position={markerPosition} icon={markerIcon} />}
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
