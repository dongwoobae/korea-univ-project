"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import {
  MapContainer,
  TileLayer,
  GeoJSON,
  useMap,
  ZoomControl,
} from "react-leaflet";
import L from "leaflet";
import type { FeatureCollection } from "geojson";
import "leaflet/dist/leaflet.css";
import type { Favorite } from "@/types/domain";
import SidePanel from "@/components/SidePanel";
import Toast from "@/components/Toast";
import { useLanguage } from "@/lib/LanguageContext";
import SearchControl from "./SearchControl";
import FilterPanel from "./FilterPanel";
import FeedbackButton from "./FeedbackButton";
import FavoritesList from "./FavoritesList";
import LanguageSwitcher from "./LanguageSwitcher";
import SlopeLegend from "./SlopeLegend";
import SlopeLayer from "./SlopeLayer";
import FacilityMarkers from "./FacilityMarkers";
import LandmarkMarkers from "./LandmarkMarkers";
import SubwayMarkers from "./SubwayMarkers";
import { useMapData } from "./useMapData";

const KU_CENTER: [number, number] = [37.5893, 127.0327];
const KU_BOUNDS = L.latLngBounds([37.578, 127.018], [37.6, 127.048]);

const TILES = {
  street: {
    url: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
    attribution: "&copy; OpenStreetMap &copy; CARTO",
    subdomains: "abcd",
  },
  satellite: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution:
      "Tiles &copy; Esri &mdash; Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community",
    subdomains: "abc",
  },
};

function BoundsController() {
  const map = useMap();
  useEffect(() => {
    map.setMaxBounds(KU_BOUNDS);
    map.setMinZoom(15);
    map.setMaxZoom(19);
  }, [map]);
  return null;
}

function loadFavoritesFromStorage() {
  try {
    return JSON.parse(localStorage.getItem("ku_favorites") ?? "[]");
  } catch {
    return [];
  }
}

function baseStyle(isFav) {
  return {
    color: isFav ? "#FACC15" : "#2563EB",
    weight: isFav ? 3 : 1.5,
    fillColor: "#2563EB",
    fillOpacity: 0.2,
  };
}

function hoverStyle(isFav) {
  return {
    color: isFav ? "#FACC15" : "#2563EB",
    weight: isFav ? 3 : 2.5,
    fillColor: "#2563EB",
    fillOpacity: 0.5,
  };
}

export default function Map() {
  const {
    geoData,
    loadingMap,
    facilities,
    facilityTypes,
    activeTypes,
    setActiveTypes,
    slopes,
    campusBoundaries,
    landmarks,
  } = useMapData();
  const [tooltip, setTooltip] = useState({
    visible: false,
    name: "",
    name_en: "",
    x: 0,
    y: 0,
  });
  const [selectedBuilding, setSelectedBuilding] = useState<{
    id: number;
    name: string;
  } | null>(null);
  const [showFavorites, setShowFavorites] = useState(false);
  const [favoritesList, setFavoritesList] = useState<Favorite[]>([]);
  const [toast, setToast] = useState<{ message: string; type: string } | null>(
    null,
  );
  const [isMobile, setIsMobile] = useState(false);
  const [tileMode, setTileMode] = useState("street");
  const [showSlope, setShowSlope] = useState(false);
  const [showLandmarks, setShowLandmarks] = useState(true);
  const [activeCampuses, setActiveCampuses] = useState({
    의료원: false,
    녹지캠퍼스: false,
    인문사회계: false,
    자연계: false,
  });
  const { lang, setLang, t } = useLanguage();

  const mapRef = useRef<L.Map | null>(null);
  const activeLayerRef = useRef<L.Polygon | null>(null);
  const activeBuildingIdRef = useRef<number | null>(null);
  const layerMapRef = useRef<Record<number, L.Polygon>>({});
  const favoriteIdsRef = useRef(
    new Set(loadFavoritesFromStorage().map((f) => f.id)),
  );
  // isMobile을 ref로도 관리 — onEachFeature 클로저에서 항상 최신값 참조
  const isMobileRef = useRef(false);

  const geoJsonStyle = useCallback(
    (feature) => baseStyle(favoriteIdsRef.current.has(feature.properties.id)),
    [],
  );

  // 모바일 감지
  useEffect(() => {
    const check = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      isMobileRef.current = mobile;
    };
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  function handleBuildingSelectFromSearch(feature) {
    const bId = feature.properties.id;
    if (activeLayerRef.current && activeBuildingIdRef.current !== bId) {
      activeLayerRef.current.setStyle(
        baseStyle(favoriteIdsRef.current.has(activeBuildingIdRef.current)),
      );
    }
    const layer = layerMapRef.current[bId];
    if (layer) {
      layer.setStyle(hoverStyle(favoriteIdsRef.current.has(bId)));
      activeLayerRef.current = layer;
      activeBuildingIdRef.current = bId;
    }
    setSelectedBuilding({ id: bId, name: feature.properties.name });
  }

  useEffect(() => {
    const handler = (e) => setToast(e.detail);
    window.addEventListener("showToast", handler);
    return () => window.removeEventListener("showToast", handler);
  }, []);

  useEffect(() => {
    const initial = loadFavoritesFromStorage();
    setFavoritesList(initial);
    favoriteIdsRef.current = new Set(initial.map((f) => f.id));
    const handler = () => {
      const updated = loadFavoritesFromStorage();
      setFavoritesList(updated);
      favoriteIdsRef.current = new Set(updated.map((f) => f.id));
      Object.entries(layerMapRef.current).forEach(([id, layer]) => {
        const numId = Number(id);
        const isFav = favoriteIdsRef.current.has(numId);
        const isActive = activeBuildingIdRef.current === numId;
        layer.setStyle(isActive ? hoverStyle(isFav) : baseStyle(isFav));
      });
    };
    window.addEventListener("favoritesUpdated", handler);
    return () => window.removeEventListener("favoritesUpdated", handler);
  }, []);

  function onEachFeature(feature, layer) {
    const bId = feature.properties.id;
    layerMapRef.current[bId] = layer;
    layer.on({
      mouseover(e) {
        if (isMobileRef.current) return;
        const isFav = favoriteIdsRef.current.has(bId);
        layer.setStyle(hoverStyle(isFav));
        const { clientX, clientY } = e.originalEvent;
        const mapEl = mapRef.current?.getContainer();
        if (!mapEl) return;
        const rect = mapEl.getBoundingClientRect();
        setTooltip({
          visible: true,
          name: feature.properties.name,
          name_en: feature.properties.name_en,
          x: clientX - rect.left + 12,
          y: clientY - rect.top - 36,
        });
      },
      mousemove(e) {
        if (isMobileRef.current) return;
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
        if (activeLayerRef.current === layer) return;
        layer.setStyle(baseStyle(favoriteIdsRef.current.has(bId)));
        setTooltip((prev) => ({ ...prev, visible: false }));
      },
      click() {
        if (activeBuildingIdRef.current === bId) {
          handleClosePanel();
          return;
        }
        if (activeLayerRef.current && activeLayerRef.current !== layer) {
          activeLayerRef.current.setStyle(
            baseStyle(favoriteIdsRef.current.has(activeBuildingIdRef.current)),
          );
        }
        layer.setStyle(hoverStyle(favoriteIdsRef.current.has(bId)));
        activeLayerRef.current = layer;
        activeBuildingIdRef.current = bId;
        setSelectedBuilding({ id: bId, name: feature.properties.name });
      },
    });
  }

  function handleSelectById(id, name) {
    if (activeLayerRef.current && activeBuildingIdRef.current !== id) {
      activeLayerRef.current.setStyle(
        baseStyle(favoriteIdsRef.current.has(activeBuildingIdRef.current)),
      );
    }
    const layer = layerMapRef.current[id];
    if (layer) {
      layer.setStyle(hoverStyle(favoriteIdsRef.current.has(id)));
      activeLayerRef.current = layer;
      activeBuildingIdRef.current = id;
      mapRef.current?.fitBounds(layer.getBounds(), {
        maxZoom: 18,
        animate: true,
      });
    }
    setSelectedBuilding({ id, name });
  }

  function handleClosePanel() {
    window.dispatchEvent(new Event("sidePanelShouldClose"));
    setTimeout(() => {
      setSelectedBuilding(null);
      if (activeLayerRef.current) {
        activeLayerRef.current.setStyle(
          baseStyle(favoriteIdsRef.current.has(activeBuildingIdRef.current)),
        );
        activeLayerRef.current = null;
        activeBuildingIdRef.current = null;
      }
    }, 280);
  }

  return (
    <div style={{ position: "relative", width: "100%", height: "100dvh" }}>
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
              borderWidth: 3,
              borderStyle: "solid",
              borderColor: "#e5e7eb",
              borderTopColor: "#2563EB",
              borderRadius: "50%",
              animation: "spin 0.8s linear infinite",
            }}
          />
          <div style={{ fontSize: 14, color: "#555" }}>{t("loadingMap")}</div>
          <style>{`
            @keyframes spin { to { transform: rotate(360deg) } }
            .leaflet-bottom.leaflet-right {
              bottom: env(safe-area-inset-bottom, 0px) !important;
            }
          `}</style>
        </div>
      )}

      <style>{`.leaflet-top.leaflet-right { top: ${isMobile ? "46px" : "6px"}; }`}</style>

      <MapContainer
        center={KU_CENTER}
        zoom={16}
        style={{ width: "100%", height: "100%" }}
        maxBounds={KU_BOUNDS}
        maxBoundsViscosity={0.7}
        ref={mapRef}
        zoomControl={false}
      >
        <ZoomControl position="topright" />
        <TileLayer
          key={tileMode}
          url={TILES[tileMode].url}
          attribution={TILES[tileMode].attribution}
          subdomains={TILES[tileMode].subdomains}
          maxZoom={19}
        />
        <BoundsController />
        {geoData && (
          <>
            <GeoJSON
              key={JSON.stringify(geoData)}
              data={geoData}
              style={geoJsonStyle}
              onEachFeature={onEachFeature}
            />
            <SearchControl
              geoData={geoData}
              isMobile={isMobile}
              onBuildingSelect={handleBuildingSelectFromSearch}
            />
          </>
        )}
        <FacilityMarkers facilities={facilities} activeTypes={activeTypes} />
        <LandmarkMarkers landmarks={landmarks} showLandmarks={showLandmarks} />
        <SubwayMarkers
          lang={lang}
          onSelect={(station) => setSelectedBuilding(station)}
        />
        {showSlope && slopes.length > 0 && <SlopeLayer slopes={slopes} />}
        {campusBoundaries && (
          <GeoJSON
            key={JSON.stringify(activeCampuses)}
            data={
              {
                type: "FeatureCollection",
                features: campusBoundaries.features.filter(
                  (f) =>
                    activeCampuses[
                      f.properties?.campus as keyof typeof activeCampuses
                    ],
                ),
              } as FeatureCollection
            }
            style={(feature) => ({
              color: feature?.properties?.color,
              weight: 2,
              fillColor: feature?.properties?.color,
              fillOpacity: 0.18,
              dashArray: "5 4",
            })}
            interactive={false}
          />
        )}
      </MapContainer>

      {/* 고려대학교 사회공헌원 로고 */}
      <div
        style={{
          position: "absolute",
          bottom: "calc(22px + env(safe-area-inset-bottom, 0px))",
          right: 10,
          zIndex: 1000,
          background: "rgba(255,255,255,0.85)",
          borderRadius: 6,
          padding: "4px 8px",
          pointerEvents: "none",
          boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
          display: "flex",
          alignItems: "center",
        }}
      >
        <img
          src="/kuis-logo.png"
          alt="고려대학교 사회공헌원 KU Institute for Sustainability"
          style={{ height: isMobile ? 20 : 28, display: "block" }}
        />
      </div>

      {/* 항공사진 출처 라벨 */}
      {tileMode === "satellite" && (
        <div
          style={{
            position: "absolute",
            bottom: "calc(56px + env(safe-area-inset-bottom, 0px))",
            right: 10,
            zIndex: 1000,
            background: "rgba(0,0,0,0.55)",
            color: "#fff",
            fontSize: 10,
            padding: "3px 7px",
            borderRadius: 4,
            pointerEvents: "none",
            whiteSpace: "nowrap",
          }}
        >
          Esri World Imagery
        </div>
      )}

      {/* 항공/지도 전환 버튼 */}
      <button
        onClick={() =>
          setTileMode((m) => (m === "street" ? "satellite" : "street"))
        }
        title={tileMode === "street" ? "항공사진으로 전환" : "지도로 전환"}
        style={{
          position: "absolute",
          top: isMobile ? 130 : 82,
          right: 10,
          zIndex: 1000,
          width: 36,
          height: 36,
          borderRadius: 8,
          background: tileMode === "satellite" ? "#1d4ed8" : "#fff",
          border: "1px solid #ddd",
          boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
          cursor: "pointer",
          fontSize: 18,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {tileMode === "street" ? "🛰️" : "🗺️"}
      </button>

      {/* 즐겨찾기 버튼 */}
      <button
        onClick={() => {
          setFavoritesList(loadFavoritesFromStorage());
          setShowFavorites((v) => !v);
        }}
        title={t("favorites")}
        style={{
          position: "absolute",
          top: 16,
          left: 16,
          zIndex: 1000,
          width: 36,
          height: 36,
          borderRadius: 8,
          background: showFavorites ? "#FEF08A" : "#fff",
          borderWidth: 1,
          borderStyle: "solid",
          borderColor: "#ddd",
          boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
          cursor: "pointer",
          fontSize: 18,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        ⭐
      </button>

      <FeedbackButton isMobile={isMobile} />

      <SlopeLegend show={showSlope} isMobile={isMobile} />

      <FavoritesList
        show={showFavorites}
        favorites={favoritesList}
        isMobile={isMobile}
        onSelect={(id, name) => {
          handleSelectById(id, name);
          setShowFavorites(false);
        }}
        onClose={() => setShowFavorites(false)}
      />

      <LanguageSwitcher isMobile={isMobile} lang={lang} setLang={setLang} />

      <FilterPanel
        isMobile={isMobile}
        facilityTypes={facilityTypes}
        activeTypes={activeTypes}
        setActiveTypes={setActiveTypes}
        showSlope={showSlope}
        setShowSlope={setShowSlope}
        activeCampuses={activeCampuses}
        setActiveCampuses={setActiveCampuses}
        showLandmarks={showLandmarks}
        setShowLandmarks={setShowLandmarks}
      />

      {/* 툴팁 — 데스크탑만 */}
      {!isMobile && tooltip.visible && (
        <div
          style={{
            position: "absolute",
            left: tooltip.x,
            top: tooltip.y,
            background: "#fff",
            borderWidth: 1,
            borderStyle: "solid",
            borderColor: "#ddd",
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
          {lang === "ko" ? tooltip.name : (tooltip.name_en ?? tooltip.name)}
        </div>
      )}

      {selectedBuilding && (
        <SidePanel
          buildingId={selectedBuilding.id}
          buildingName={selectedBuilding.name}
          onClose={handleClosePanel}
        />
      )}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
}
