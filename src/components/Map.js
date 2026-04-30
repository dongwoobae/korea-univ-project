"use client";

import { useEffect, useState, useRef } from "react";
import {
  MapContainer,
  TileLayer,
  GeoJSON,
  useMap,
  Marker,
  Popup,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import SidePanel from "@/components/SidePanel";

const KU_CENTER = [37.5893, 127.0327];
const KU_BOUNDS = L.latLngBounds([37.578, 127.018], [37.6, 127.048]);

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
        left: 56,
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
  const [loadingMap, setLoadingMap] = useState(true);
  const [tooltip, setTooltip] = useState({
    visible: false,
    name: "",
    x: 0,
    y: 0,
  });
  const [selectedBuilding, setSelectedBuilding] = useState(null);
  const mapRef = useRef(null);
  const activeLayerRef = useRef(null);
  const [facilities, setFacilities] = useState([]);
  const [activeTypes, setActiveTypes] = useState({
    elevator: false,
    restroom: false,
    ramp: false,
    parking: false,
    braille: false,
  });

  const FACILITY_COLORS = {
    elevator: "#2563EB",
    restroom: "#16A34A",
    ramp: "#EA580C",
    parking: "#7C3AED",
    braille: "#CA8A04",
  };

  const FACILITY_TYPES = [
    { code: "elevator", label: "엘리베이터", icon: "🛗" },
    { code: "restroom", label: "장애인 화장실", icon: "🚻" },
    { code: "ramp", label: "경사로", icon: "♿" },
    { code: "parking", label: "장애인 주차", icon: "🅿️" },
    { code: "braille", label: "점자 안내판", icon: "👁️" },
  ];

  const facilityMarkerIcon = (code, icon) =>
    L.divIcon({
      className: "",
      html: `<div style="
        width:30px;height:30px;
        background:${FACILITY_COLORS[code] ?? "#666"};
        border:2.5px solid white;border-radius:50%;
        display:flex;align-items:center;justify-content:center;
        font-size:14px;box-shadow:0 2px 6px rgba(0,0,0,0.25);
      ">${icon}</div>`,
      iconAnchor: [15, 15],
      popupAnchor: [0, -18],
    });

  useEffect(() => {
    fetch("/api/facilities")
      .then((r) => r.json())
      .then((data) => setFacilities(data ?? []))
      .catch(console.error);
  }, []);

  useEffect(() => {
    setLoadingMap(true);
    fetch("/api/buildings")
      .then((res) => res.json())
      .then((data) => {
        if (!data.features) return;
        setGeoData(data);
      })
      .catch((err) => console.error("buildings fetch 실패:", err))
      .finally(() => setLoadingMap(false));
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

  const SUBWAY_STATIONS = [
    {
      id: 9000001,
      name: "고려대역",
      line: "6호선",
      lat: 37.5895,
      lng: 127.0363,
    },
    { id: 9000002, name: "안암역", line: "6호선", lat: 37.5862, lng: 127.0294 },
    { id: 9000003, name: "보문역", line: "6호선", lat: 37.5853, lng: 127.0194 },
  ];

  const subwayIcon = (name) =>
    L.divIcon({
      className: "",
      html: `
    <div style="
      display: flex; flex-direction: column; align-items: center;
      filter: drop-shadow(0 2px 4px rgba(0,0,0,0.35));
    ">
      <div style="
        background: #B9282D; color: white;
        border: 2.5px solid white; border-radius: 50%;
        width: 32px; height: 32px;
        display: flex; align-items: center; justify-content: center;
        font-size: 16px; font-weight: bold;
      ">🚇</div>
      <div style="
        background: #B9282D; color: white;
        border-radius: 10px; padding: 2px 7px;
        font-size: 11px; font-weight: 700;
        margin-top: 3px; white-space: nowrap;
        border: 1.5px solid white;
      ">${name}</div>
    </div>
  `,
      iconAnchor: [16, 44],
      popupAnchor: [0, -46],
    });

  return (
    <div style={{ position: "relative", width: "100%", height: "100vh" }}>
      {/* 로딩 오버레이 */}
      {loadingMap && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 2000,
            background: "rgba(255,255,255,0.85)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 16,
          }}
        >
          <div
            style={{
              width: 40,
              height: 40,
              border: "3px solid #e5e7eb",
              borderTop: "3px solid #2563EB",
              borderRadius: "50%",
              animation: "spin 0.8s linear infinite",
            }}
          />
          <div style={{ fontSize: 14, color: "#555" }}>지도 불러오는 중...</div>
          <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        </div>
      )}

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
              key={JSON.stringify(geoData)}
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
        {/* 시설 마커 */}
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

        {/* 지하철역 마커 */}
        {SUBWAY_STATIONS.map((s) => (
          <Marker
            key={s.name}
            position={[s.lat, s.lng]}
            icon={subwayIcon(s.name)}
            zIndexOffset={1000}
            eventHandlers={{
              click() {
                setSelectedBuilding({
                  id: s.id,
                  name: s.name,
                });
              },
            }}
          ></Marker>
        ))}
      </MapContainer>

      {/* 시설 토글 패널 */}
      <div
        style={{
          position: "absolute",
          bottom: 24,
          left: 16,
          zIndex: 1000,
          background: "#fff",
          borderRadius: 10,
          padding: "12px 14px",
          boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
          border: "1px solid #e5e7eb",
          minWidth: 160,
        }}
      >
        {/* <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: "#888",
            marginBottom: 8,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
          }}
        >
          시설 필터
        </div> */}
        {FACILITY_TYPES.map((t) => (
          <label
            key={t.code}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 7,
              cursor: "pointer",
              marginBottom: 6,
            }}
          >
            <input
              type="checkbox"
              checked={activeTypes[t.code]}
              onChange={() =>
                setActiveTypes((prev) => ({ ...prev, [t.code]: !prev[t.code] }))
              }
              style={{
                accentColor: FACILITY_COLORS[t.code],
                width: 14,
                height: 14,
              }}
            />
            <span style={{ fontSize: 14 }}>{t.icon}</span>
            <span style={{ fontSize: 12, color: "#333" }}>{t.label}</span>
          </label>
        ))}
      </div>

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
