"use client";

import { useEffect, useState } from "react";
import { MapContainer, TileLayer, GeoJSON, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const KU_CENTER = [37.5893, 127.0327];
//const KU_BOUNDS = L.latLngBounds([37.5855, 127.027], [37.594, 127.04]);
const KU_BOUNDS = L.latLngBounds(
  [37.582, 127.022], // SW 더 넓게
  [37.597, 127.045], // NE 더 넓게
);

const OVERPASS_QUERY = `
[out:json];
way["building"](37.5855,127.0270,37.5940,127.0400);
out geom;
`;

function osmToGeoJSON(elements) {
  return {
    type: "FeatureCollection",
    features: elements.map((el) => ({
      type: "Feature",
      properties: {
        id: el.id,
        name: el.tags?.["name"] ?? el.tags?.["name:ko"] ?? "이름 없음",
      },
      geometry: {
        type: "Polygon",
        coordinates: [el.geometry.map((p) => [p.lon, p.lat])],
      },
    })),
  };
}

function BoundsController() {
  const map = useMap();
  useEffect(() => {
    map.setMaxBounds(KU_BOUNDS);
    map.setMinZoom(15);
    map.setMaxZoom(19);
  }, [map]);
  return null;
}

export default function Map() {
  const [geoData, setGeoData] = useState(null);

  useEffect(() => {
    fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      body: OVERPASS_QUERY,
    })
      .then((res) => res.json())
      .then((data) => setGeoData(osmToGeoJSON(data.elements)))
      .catch((err) => console.error("Overpass fetch 실패:", err));
  }, []);

  return (
    <MapContainer
      center={KU_CENTER}
      zoom={16}
      style={{ width: "100%", height: "100vh" }}
      maxBounds={KU_BOUNDS}
      //maxBoundsViscosity={1.0}
      maxBoundsViscosity={0.7}
    >
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
        attribution="&copy; OpenStreetMap &copy; CARTO"
        subdomains="abcd"
        maxZoom={19}
      />
      <BoundsController />
      {geoData && (
        <GeoJSON
          data={geoData}
          style={{
            color: "#2563EB",
            weight: 1.5,
            fillColor: "#2563EB",
            fillOpacity: 0.2,
          }}
        />
      )}
    </MapContainer>
  );
}
