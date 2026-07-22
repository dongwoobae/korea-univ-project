"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import {
  MapContainer,
  TileLayer,
  GeoJSON,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import type { FeatureCollection } from "geojson";
import "leaflet/dist/leaflet.css";
import type { Favorite } from "@/types/domain";
import { campusColor } from "@/lib/theme";
import SidePanel from "@/components/SidePanel";
import Toast from "@/components/Toast";
import { useLanguage } from "@/lib/LanguageContext";
import SearchControl from "./SearchControl";
import FilterPanel from "./FilterPanel";
import FeedbackButton from "./FeedbackButton";
import FavoritesList from "./FavoritesList";
import LanguageSwitcher from "./LanguageSwitcher";
import SlopeLayer from "./SlopeLayer";
import FacilityMarkers from "./FacilityMarkers";
import LandmarkMarkers from "./LandmarkMarkers";
import SubwayMarkers from "./SubwayMarkers";
import { useMapData } from "./useMapData";
import "./map-ui.css";

const KU_CENTER: [number, number] = [37.5893, 127.0327];
const KU_BOUNDS = L.latLngBounds([37.578, 127.018], [37.6, 127.048]);

const TILES = {
  street: {
    url: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors &middot; &copy; <a href="https://carto.com/attributions" target="_blank" rel="noopener noreferrer">CARTO</a>',
    subdomains: "abcd",
  },
  satellite: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution:
      'Tiles &copy; <a href="https://www.esri.com" target="_blank" rel="noopener noreferrer">Esri</a> &mdash; Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
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

function buildingColor(feature) {
  return campusColor[feature?.properties?.campus] ?? "#963A32";
}

function baseStyle(feature) {
  const color = buildingColor(feature);
  return {
    color,
    weight: 1.5,
    opacity: 0.55,
    fillColor: color,
    fillOpacity: 0.18,
  };
}

function hoverStyle(feature) {
  const color = buildingColor(feature);
  return {
    color,
    weight: 2.5,
    opacity: 0.9,
    fillColor: color,
    fillOpacity: 0.38,
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
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);
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
  const featureMapRef = useRef<Record<number, unknown>>({});
  const favoriteIdsRef = useRef(
    new Set(loadFavoritesFromStorage().map((f) => f.id)),
  );
  // isMobile을 ref로도 관리 — onEachFeature 클로저에서 항상 최신값 참조
  const isMobileRef = useRef(false);

  const geoJsonStyle = useCallback(
    (feature) => baseStyle(feature),
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
        baseStyle(featureMapRef.current[activeBuildingIdRef.current ?? -1]),
      );
    }
    const layer = layerMapRef.current[bId];
    if (layer) {
      layer.setStyle(hoverStyle(feature));
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
        const isActive = activeBuildingIdRef.current === numId;
        const feature = featureMapRef.current[numId];
        layer.setStyle(isActive ? hoverStyle(feature) : baseStyle(feature));
      });
    };
    window.addEventListener("favoritesUpdated", handler);
    return () => window.removeEventListener("favoritesUpdated", handler);
  }, []);

  function onEachFeature(feature, layer) {
    const bId = feature.properties.id;
    layerMapRef.current[bId] = layer;
    featureMapRef.current[bId] = feature;
    layer.on({
      mouseover(e) {
        if (isMobileRef.current) return;
        layer.setStyle(hoverStyle(feature));
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
        setTooltip((prev) => ({ ...prev, visible: false }));
        if (activeLayerRef.current === layer) return;
        layer.setStyle(baseStyle(feature));
      },
      click() {
        if (activeBuildingIdRef.current === bId) {
          handleClosePanel();
          return;
        }
        if (activeLayerRef.current && activeLayerRef.current !== layer) {
          activeLayerRef.current.setStyle(
            baseStyle(featureMapRef.current[activeBuildingIdRef.current ?? -1]),
          );
        }
        layer.setStyle(hoverStyle(feature));
        activeLayerRef.current = layer;
        activeBuildingIdRef.current = bId;
        setSelectedBuilding({ id: bId, name: feature.properties.name });
      },
    });
  }

  function handleSelectById(id, name) {
    if (activeLayerRef.current && activeBuildingIdRef.current !== id) {
      activeLayerRef.current.setStyle(
        baseStyle(featureMapRef.current[activeBuildingIdRef.current ?? -1]),
      );
    }
    const layer = layerMapRef.current[id];
    if (layer) {
      layer.setStyle(hoverStyle(featureMapRef.current[id]));
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
          baseStyle(featureMapRef.current[activeBuildingIdRef.current ?? -1]),
        );
        activeLayerRef.current = null;
        activeBuildingIdRef.current = null;
      }
    }, 280);
  }

  function locateUser() {
    if (!navigator.geolocation) {
      setToast({ message: "현재 위치를 사용할 수 없는 브라우저입니다.", type: "info" });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const location: [number, number] = [coords.latitude, coords.longitude];
        if (!KU_BOUNDS.contains(location)) {
          setToast({ message: "지도 영역 밖입니다", type: "info" });
          return;
        }
        mapRef.current?.flyTo(location, 18, {
          animate: true,
        });
      },
      () =>
        setToast({
          message: "위치 권한을 확인해 주세요.",
          type: "info",
        }),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  return (
    <div className="ku-map-shell">
      {/* 로딩 오버레이 */}
      {loadingMap && (
        <div className="ku-map-loading">
          <div className="ku-map-spinner" />
          <div>{t("loadingMap")}</div>
        </div>
      )}

      <MapContainer
        center={KU_CENTER}
        zoom={16}
        style={{ width: "100%", height: "100%" }}
        maxBounds={KU_BOUNDS}
        maxBoundsViscosity={0.7}
        ref={mapRef}
        zoomControl={false}
      >
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
              onBuildingSelect={handleBuildingSelectFromSearch}
              favorites={favoritesList}
              favoritesOpen={showFavorites}
              onToggleFavorites={() => {
                setFavoritesList(loadFavoritesFromStorage());
                setShowFavorites((show) => !show);
              }}
              onSearchOpen={(open) => {
                if (open) setShowFavorites(false);
              }}
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
              color:
                campusColor[feature?.properties?.campus] ??
                feature?.properties?.color,
              weight: 2,
              opacity: 0.45,
              fillColor:
                campusColor[feature?.properties?.campus] ??
                feature?.properties?.color,
              fillOpacity: 0.05,
              dashArray: "5 4",
            })}
            interactive={false}
          />
        )}
      </MapContainer>

      <div
        className="ku-attribution"
        data-hidden={isMobile && (mobileFilterOpen || Boolean(selectedBuilding))}
      >
        <img src="/kuis-logo.png" alt="고려대학교 지속가능원" />
        <span className="ku-attribution-separator" aria-hidden="true" />
        <span>
          Leaflet · ©{" "}
          <a
            href={
              tileMode === "street"
                ? "https://www.openstreetmap.org/copyright"
                : "https://www.esri.com"
            }
            target="_blank"
            rel="noopener noreferrer"
          >
            {tileMode === "street" ? "OpenStreetMap" : "Esri"}
          </a>
        </span>
      </div>

      <div
        className="ku-map-actions"
        data-panel-open={Boolean(selectedBuilding)}
        data-overlay-open={mobileFilterOpen}
      >
        <div className="ku-map-zoom" aria-label="지도 확대 및 축소">
          <button className="ku-map-action" type="button" onClick={() => mapRef.current?.zoomIn()} title="확대" aria-label="확대">＋</button>
          <button className="ku-map-action" type="button" onClick={() => mapRef.current?.zoomOut()} title="축소" aria-label="축소">−</button>
        </div>
        <button className="ku-map-action" type="button" onClick={locateUser} title="현재 위치" aria-label="현재 위치">
          <span aria-hidden="true">📍</span>
        </button>
        <button
          className="ku-map-action"
          type="button"
          onClick={() => setTileMode((mode) => (mode === "street" ? "satellite" : "street"))}
          title={tileMode === "street" ? "항공사진으로 전환" : "지도로 전환"}
          aria-label={tileMode === "street" ? "항공사진으로 전환" : "지도로 전환"}
        >
          <span aria-hidden="true">{tileMode === "street" ? "🛰️" : "🗺️"}</span>
        </button>
        <FeedbackButton />
      </div>

      <FavoritesList
        show={showFavorites}
        favorites={favoritesList}
        onSelect={(id, name) => {
          handleSelectById(id, name);
          setShowFavorites(false);
        }}
      />

      <LanguageSwitcher
        isMobile={isMobile}
        lang={lang}
        setLang={setLang}
        panelOpen={Boolean(selectedBuilding)}
      />

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
        onOpenChange={setMobileFilterOpen}
      />

      {/* 툴팁 — 데스크탑만 */}
      {!isMobile && tooltip.visible && (
        <div className="ku-map-tooltip" style={{ left: tooltip.x, top: tooltip.y }}>
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
