"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "@geoman-io/leaflet-geoman-free";
import "@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css";

export default function PolygonEditor({ geojson, onSave, onCancel }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const drawnItemsRef = useRef(null);

  useEffect(() => {
    if (mapRef.current) return;

    let center = [37.5893, 127.0327];
    if (geojson?.geometry?.coordinates?.[0]?.length > 0) {
      const coords = geojson.geometry.coordinates[0];
      const avgLat = coords.reduce((s, c) => s + c[1], 0) / coords.length;
      const avgLng = coords.reduce((s, c) => s + c[0], 0) / coords.length;
      center = [avgLat, avgLng];
    }

    const map = L.map(containerRef.current, {
      scrollWheelZoom: true,
    }).setView(center, 18);
    mapRef.current = map;

    L.tileLayer(
      "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
      { attribution: "© OpenStreetMap © CARTO", subdomains: "abcd" },
    ).addTo(map);

    const drawnItems = new L.FeatureGroup();
    map.addLayer(drawnItems);
    drawnItemsRef.current = drawnItems;

    if (geojson) {
      const layer = L.geoJSON(geojson, {
        style: { color: "#2563EB", weight: 2, fillOpacity: 0.3 },
      });
      layer.eachLayer((l) => {
        drawnItems.addLayer(l);
        l.pm.enable({ allowSelfIntersection: false });
        l.pm.disable();
      });
    }

    map.pm.addControls({
      position: "topleft",
      drawPolygon: true,
      editMode: true,
      dragMode: true,
      cutPolygon: false,
      removalMode: true,
      drawMarker: false,
      drawCircle: false,
      drawPolyline: false,
      drawRectangle: false,
      drawCircleMarker: false,
      rotateMode: false,
    });

    map.on("pm:create", (e) => {
      drawnItems.clearLayers();
      drawnItems.addLayer(e.layer);
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  function handleSave() {
    const layers = drawnItemsRef.current?.getLayers() ?? [];
    if (layers.length === 0) {
      alert("폴리곤을 그려주세요");
      return;
    }
    onSave(layers[0].toGeoJSON());
  }

  return (
    <div>
      <div style={{ fontSize: 12, color: "#888", marginBottom: 8 }}>
        🖱️ 드래그로 통째 이동 · 꼭짓점 클릭으로 세부 편집 · 삭제 후 새로 그리기
        가능
      </div>
      <div
        ref={containerRef}
        style={{
          width: "100%",
          height: 420,
          borderRadius: 8,
          overflow: "hidden",
          border: "1px solid #ddd",
        }}
      />
      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <button
          onClick={onCancel}
          style={{
            flex: 1,
            padding: "10px",
            background: "none",
            border: "1px solid #ddd",
            borderRadius: 8,
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          취소
        </button>
        <button
          onClick={handleSave}
          style={{
            flex: 1,
            padding: "10px",
            background: "#2563EB",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          저장
        </button>
      </div>
    </div>
  );
}
