"use client";

import { useState, useEffect } from "react";
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

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

export default function FacilityMap({ center, markerPosition, onMapClick }) {
  const [map, setMap] = useState(null);
  const [locating, setLocating] = useState(false);

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
