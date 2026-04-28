"use client";

import { useEffect, useState, useRef } from "react";
import { MapContainer, TileLayer, GeoJSON, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import SidePanel from "@/components/SidePanel";

const KU_CENTER = [37.5893, 127.0327];
const KU_BOUNDS = L.latLngBounds([37.578, 127.018], [37.6, 127.048]);

function osmToGeoJSON(elements) {
  return {
    type: "FeatureCollection",
    features: elements
      .filter((el) => el.geometry?.length > 0)
      .filter((el) => el.tags?.["name"] ?? el.tags?.["name:ko"])
      .map((el) => ({
        type: "Feature",
        properties: {
          id: el.id,
          name: el.tags?.["name"] ?? el.tags?.["name:ko"],
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

function SearchControl({ geoData }) {
  const map = useMap();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    if (!geoData || query.trim() === "") {
      setResults([]);
      return;
    }
    const matched = geoData.features
      .filter((f) => f.properties.name?.includes(query))
      .slice(0, 6);
    setResults(matched);
  }, [query, geoData]);

  function handleSelect(feature) {
    const coords = feature.geometry.coordinates[0];
    const latlngs = coords.map(([lon, lat]) => [lat, lon]);
    const bounds = L.latLngBounds(latlngs);
    map.fitBounds(bounds, { maxZoom: 18, animate: true });
    setQuery(feature.properties.name);
    setResults([]);
  }

  return (
    <div
      style={{
        position: "absolute",
        top: 16,
        left: 50,
        zIndex: 1000,
        width: 260,
      }}
    >
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setTimeout(() => setIsFocused(false), 150)}
        placeholder="건물 검색..."
        style={{
          width: "100%",
          padding: "10px 14px",
          border: "1px solid #ddd",
          borderRadius: results.length > 0 && isFocused ? "8px 8px 0 0" : "8px",
          fontSize: 14,
          outline: "none",
          boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
          background: "#fff",
        }}
      />
      {results.length > 0 && isFocused && (
        <ul
          style={{
            margin: 0,
            padding: 0,
            listStyle: "none",
            background: "#fff",
            border: "1px solid #ddd",
            borderTop: "none",
            borderRadius: "0 0 8px 8px",
            boxShadow: "0 4px 8px rgba(0,0,0,0.1)",
            overflow: "hidden",
          }}
        >
          {results.map((f) => (
            <li
              key={f.properties.id}
              onMouseDown={() => handleSelect(f)}
              style={{
                padding: "9px 14px",
                fontSize: 13,
                cursor: "pointer",
                borderBottom: "1px solid #f0f0f0",
                color: "#333",
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.background = "#f5f5f5")
              }
              onMouseLeave={(e) => (e.currentTarget.style.background = "#fff")}
            >
              {f.properties.name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function Map() {
  const [geoData, setGeoData] = useState(null);
  const [tooltip, setTooltip] = useState({
    visible: false,
    name: "",
    x: 0,
    y: 0,
  });
  const [selectedBuilding, setSelectedBuilding] = useState(null);
  const mapRef = useRef(null);
  const activeLayerRef = useRef(null);

  useEffect(() => {
    fetch("/api/buildings")
      .then((res) => res.json())
      .then((data) => {
        if (!data.elements) return;
        setGeoData(osmToGeoJSON(data.elements));
      })
      .catch((err) => console.error("buildings fetch 실패:", err));
  }, []);

  function onEachFeature(feature, layer) {
    layer.on({
      mouseover(e) {
        layer.setStyle({ fillOpacity: 0.5, weight: 2.5 });
        const { clientX, clientY } = e.originalEvent;
        const mapEl = mapRef.current?.getContainer();
        if (!mapEl) return;
        const rect = mapEl.getBoundingClientRect();
        setTooltip({
          visible: true,
          name: feature.properties.name,
          x: clientX - rect.left + 12,
          y: clientY - rect.top - 36,
        });
      },
      mousemove(e) {
        const { clientX, clientY } = e.originalEvent;
        const mapEl = mapRef.current?.getContainer();
        if (!mapEl) return;
        const rect = mapEl.getBoundingClientRect();
        setTooltip((prev) => ({
          ...prev,
          x: clientX - rect.left + 12,
          y: clientY - rect.top - 36,
        }));
      },
      mouseout() {
        if (activeLayerRef.current !== layer) {
          layer.setStyle({ fillOpacity: 0.2, weight: 1.5 });
        }
        setTooltip((prev) => ({ ...prev, visible: false }));
      },
      click() {
        if (activeLayerRef.current && activeLayerRef.current !== layer) {
          activeLayerRef.current.setStyle({ fillOpacity: 0.2, weight: 1.5 });
        }
        layer.setStyle({ fillOpacity: 0.5, weight: 2.5 });
        activeLayerRef.current = layer;
        setSelectedBuilding({
          id: feature.properties.id,
          name: feature.properties.name,
        });
      },
    });
  }

  function handleClosePanel() {
    setSelectedBuilding(null);
    if (activeLayerRef.current) {
      activeLayerRef.current.setStyle({ fillOpacity: 0.2, weight: 1.5 });
      activeLayerRef.current = null;
    }
  }

  return (
    <div style={{ position: "relative", width: "100%", height: "100vh" }}>
      <MapContainer
        center={KU_CENTER}
        zoom={16}
        style={{ width: "100%", height: "100%" }}
        maxBounds={KU_BOUNDS}
        maxBoundsViscosity={0.7}
        ref={mapRef}
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
          attribution="&copy; OpenStreetMap &copy; CARTO"
          subdomains="abcd"
          maxZoom={19}
        />
        <BoundsController />
        {geoData && (
          <>
            <GeoJSON
              data={geoData}
              style={{
                color: "#2563EB",
                weight: 1.5,
                fillColor: "#2563EB",
                fillOpacity: 0.2,
              }}
              onEachFeature={onEachFeature}
            />
            <SearchControl geoData={geoData} />
          </>
        )}
      </MapContainer>

      {tooltip.visible && (
        <div
          style={{
            position: "absolute",
            left: tooltip.x,
            top: tooltip.y,
            background: "#fff",
            border: "1px solid #ddd",
            borderRadius: 6,
            padding: "6px 10px",
            fontSize: 13,
            fontWeight: 500,
            color: "#333",
            pointerEvents: "none",
            zIndex: 1000,
            boxShadow: "0 2px 6px rgba(0,0,0,0.1)",
            whiteSpace: "nowrap",
          }}
        >
          {tooltip.name}
        </div>
      )}

      {selectedBuilding && (
        <SidePanel
          buildingId={selectedBuilding.id}
          buildingName={selectedBuilding.name}
          onClose={handleClosePanel}
        />
      )}
    </div>
  );
}
