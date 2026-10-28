"use client";

import { useState, useEffect, useRef } from "react";
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
import { neighborPointToLayer } from "@/lib/neighborLayer";
import { CARTO_ATTRIBUTION, getCartoTileUrl } from "@/lib/mapTiles";
import { useColorMode } from "@/lib/useColorMode";

// 공개 등록 요청 모달의 색. 관리자 화면은 크림슨을 넘긴다(설계 2026-10-14 3.6)
const PUBLIC_HIGHLIGHT_COLOR = "#2563EB";

const markerIcon = new L.Icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

function ClickHandler({
  onMapClick,
}: {
  onMapClick: (lat: number, lng: number) => void;
}) {
  useMapEvents({
    click(e) {
      onMapClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

function MapInstanceCapture({ onReady }: { onReady: (map: L.Map) => void }) {
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
  highlightColor = PUBLIC_HIGHLIGHT_COLOR,
  height = 250,
  followTheme = false,
}: {
  center: [number, number];
  markerPosition: [number, number] | null;
  onMapClick: (lat: number, lng: number) => void;
  highlightId?: number;
  highlightColor?: string;
  /** 지도 높이(px). 공개 등록 요청 모달은 기본값을 쓴다 */
  height?: number;
  /** 참이면 공개 화면 테마를 따른다. 거짓이면 관리자 화면 규칙대로 늘 밝다(docs/specs/2026-10-28-dark-mode-design.md 3.2) */
  followTheme?: boolean;
}) {
  const colorMode = useColorMode();
  const dark = followTheme && colorMode === "dark";
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

  // 위치 응답은 몇 초 뒤에 온다. 누른 때의 콜백을 부르면 그 사이 바뀐 상태(저장 중·끝남)를 보지 못한다.
  const onMapClickRef = useRef(onMapClick);
  useEffect(() => {
    onMapClickRef.current = onMapClick;
  });

  function handleLocate() {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        map?.flyTo([coords.latitude, coords.longitude], 18);
        onMapClickRef.current(coords.latitude, coords.longitude);
        setLocating(false);
      },
      () => setLocating(false),
      { timeout: 10000, enableHighAccuracy: true },
    );
  }

  return (
    <div
      className={followTheme ? undefined : "ku-light-scope"}
      style={{ position: "relative" }}
    >
      <MapContainer
        center={center}
        zoom={18}
        style={{ width: "100%", height }}
        scrollWheelZoom={true}
      >
        <TileLayer
          key={dark ? "dark" : "light"}
          url={getCartoTileUrl(dark)}
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
                    color: highlightColor,
                    weight: 2,
                    fillColor: highlightColor,
                    fillOpacity: 0.15,
                  }
                : NEIGHBOR_STYLE
            }
            interactive={false}
            pointToLayer={(_feature, latlng) => neighborPointToLayer(latlng)}
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
        className="ku-facility-map-locate"
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
          background: "var(--ku-surface)",
          border: "1px solid var(--ku-border-input)",
          borderRadius: "var(--ku-radius)",
          cursor: locating ? "wait" : "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 18,
          boxShadow: "var(--ku-shadow-raised)",
        }}
      >
        {locating ? "⏳" : "📍"}
      </button>
    </div>
  );
}
