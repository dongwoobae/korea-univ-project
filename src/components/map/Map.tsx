"use client";

import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import Image from "next/image";
import {
  MapContainer,
  TileLayer,
  GeoJSON,
  Marker,
  Circle,
  Pane,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import {
  LocateFixed,
  Map as MapIcon,
  Minus,
  Plus,
  Satellite,
} from "lucide-react";
import type {
  Feature,
  FeatureCollection,
  GeoJsonProperties,
  Geometry,
} from "geojson";
import "leaflet/dist/leaflet.css";
import type {
  BuildingFeature,
  Favorite,
  Landmark,
  MapFacility,
} from "@/types/domain";
import { campusColor, satelliteCampusColor } from "@/lib/theme";
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
import MapErrorBanner from "./MapErrorBanner";
import MapBrowseList, { type MapBrowseItem } from "./MapBrowseList";
import MapViewportObserver, {
  containsMapPoint,
  type MapViewport,
} from "./MapViewportObserver";
import { CARTO_ATTRIBUTION, getCartoTileUrl } from "@/lib/mapTiles";
import { usePrefersDarkMode } from "@/lib/usePrefersDarkMode";
import "./map-ui.css";

const KU_CENTER: [number, number] = [37.5893, 127.0327];
const KU_BOUNDS = L.latLngBounds([37.578, 127.018], [37.6, 127.048]);

const userLocationIcon = L.divIcon({
  className: "ku-user-location",
  html: '<span class="ku-user-location-dot"></span>',
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

const TILES = {
  street: {
    attribution: CARTO_ATTRIBUTION,
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

type TileMode = keyof typeof TILES;

function buildingColor(
  feature: BuildingFeature | undefined,
  tileMode: TileMode,
  prefersDarkMode: boolean,
) {
  const useBrightColors = tileMode === "satellite" || prefersDarkMode;
  const colors = useBrightColors ? satelliteCampusColor : campusColor;
  return (
    colors[feature?.properties?.campus ?? ""] ??
    (useBrightColors ? "#FF4D3D" : "#963A32")
  );
}

function baseStyle(
  feature: BuildingFeature | undefined,
  tileMode: TileMode,
  prefersDarkMode: boolean,
) {
  const color = buildingColor(feature, tileMode, prefersDarkMode);
  const satellite = tileMode === "satellite";
  return {
    color,
    weight: satellite ? 2.4 : 1.5,
    opacity: satellite ? 1 : 0.55,
    fillColor: color,
    fillOpacity: satellite ? 0.42 : 0.18,
  };
}

function hoverStyle(
  feature: BuildingFeature | undefined,
  tileMode: TileMode,
  prefersDarkMode: boolean,
) {
  const color = buildingColor(feature, tileMode, prefersDarkMode);
  const satellite = tileMode === "satellite";
  return {
    color,
    weight: satellite ? 3.5 : 2.5,
    opacity: satellite ? 1 : 0.9,
    fillColor: color,
    fillOpacity: satellite ? 0.62 : 0.38,
  };
}

function localizedValue(
  ko: string | null | undefined,
  en: string | null | undefined,
  zh: string | null | undefined,
  lang: "ko" | "en" | "zh",
) {
  return lang === "en" ? (en ?? ko) : lang === "zh" ? (zh ?? ko) : ko;
}

function facilityBrowseItem(
  facility: MapFacility,
  lang: "ko" | "en" | "zh",
): MapBrowseItem {
  const name =
    localizedValue(
      facility.name ?? facility.facility_types?.label,
      facility.name_en ?? facility.facility_types?.label_en,
      facility.name_zh ?? facility.facility_types?.label_zh,
      lang,
    ) ?? "";
  const type =
    localizedValue(
      facility.facility_types?.label,
      facility.facility_types?.label_en,
      facility.facility_types?.label_zh,
      lang,
    ) ?? "";
  const location =
    localizedValue(
      facility.buildings?.name,
      facility.buildings?.name_en,
      undefined,
      lang,
    ) ??
    localizedValue(
      facility.floor_info,
      facility.floor_info_en,
      facility.floor_info_zh,
      lang,
    );

  return {
    key: `facility-${facility.id}`,
    kind: "facility",
    code: facility.facility_types?.code ?? null,
    name,
    detail: [type, location].filter(Boolean).join(" · "),
    lat: facility.lat!,
    lng: facility.lng!,
  };
}

function landmarkBrowseItem(
  landmark: Landmark,
  lang: "ko" | "en" | "zh",
  detail: string,
): MapBrowseItem {
  return {
    key: `landmark-${landmark.id}`,
    kind: "landmark",
    code: null,
    name:
      localizedValue(landmark.name, landmark.name_en, landmark.name_zh, lang) ??
      landmark.name,
    detail,
    lat: landmark.lat,
    lng: landmark.lng,
  };
}

function mapDistanceMeters(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
) {
  const earthRadius = 6_371_000;
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const latitudeDelta = toRadians(to.lat - from.lat);
  const longitudeDelta = toRadians(to.lng - from.lng);
  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(toRadians(from.lat)) *
      Math.cos(toRadians(to.lat)) *
      Math.sin(longitudeDelta / 2) ** 2;
  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export default function Map() {
  const {
    geoData,
    geoDataVersion,
    loadingMap,
    facilities,
    facilityTypes,
    activeTypes,
    setActiveTypes,
    slopes,
    campusBoundaries,
    landmarks,
    statuses,
    retry,
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
  const [favoritesList, setFavoritesList] = useState<Favorite[]>(
    loadFavoritesFromStorage,
  );
  const [toast, setToast] = useState<{ message: string; type: string } | null>(
    null,
  );
  const [isMobile, setIsMobile] = useState(false);
  const [tileMode, setTileMode] = useState<keyof typeof TILES>("street");
  const prefersDarkMode = usePrefersDarkMode();
  const [showSlope, setShowSlope] = useState(false);
  const [showLandmarks, setShowLandmarks] = useState(true);
  const [viewport, setViewport] = useState<MapViewport | null>(null);
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);
  const [frontMapPanel, setFrontMapPanel] = useState<"filter" | "browse">(
    "filter",
  );
  const [userLocation, setUserLocation] = useState<{
    lat: number;
    lng: number;
    accuracy: number;
  } | null>(null);
  const [locating, setLocating] = useState(false);
  const [activeCampuses, setActiveCampuses] = useState({
    의료원: false,
    녹지캠퍼스: false,
    인문사회계: false,
    자연계: false,
  });
  const { lang, setLang, t } = useLanguage();
  const buildingLabelsVisible = (viewport?.zoom ?? 16) >= (isMobile ? 18 : 17);

  const browseItems = useMemo(() => {
    const facilityItems = facilities
      .filter(
        (facility) =>
          activeTypes[facility.facility_types?.code ?? ""] &&
          containsMapPoint(viewport, facility.lat!, facility.lng!),
      )
      .map((facility) => facilityBrowseItem(facility, lang));
    const landmarkItems = showLandmarks
      ? landmarks
          .filter((landmark) =>
            containsMapPoint(viewport, landmark.lat, landmark.lng),
          )
          .map((landmark) =>
            landmarkBrowseItem(landmark, lang, t("landmarkItem")),
          )
      : [];

    const origin = userLocation ?? {
      lat: ((viewport?.north ?? 0) + (viewport?.south ?? 0)) / 2,
      lng: ((viewport?.east ?? 0) + (viewport?.west ?? 0)) / 2,
    };

    return [...facilityItems, ...landmarkItems].sort(
      (a, b) =>
        mapDistanceMeters(origin, a) - mapDistanceMeters(origin, b) ||
        a.name.localeCompare(b.name, lang),
    );
  }, [
    activeTypes,
    facilities,
    lang,
    landmarks,
    showLandmarks,
    t,
    userLocation,
    viewport,
  ]);

  const mapRef = useRef<L.Map | null>(null);
  const activeLayerRef = useRef<L.Polygon | null>(null);
  const activeBuildingIdRef = useRef<number | null>(null);
  const layerMapRef = useRef<Record<number, L.Polygon>>({});
  const featureMapRef = useRef<Record<number, BuildingFeature>>({});
  const favoriteIdsRef = useRef(
    new Set(loadFavoritesFromStorage().map((f: Favorite) => f.id)),
  );
  // isMobile을 ref로도 관리 — onEachFeature 클로저에서 항상 최신값 참조
  const isMobileRef = useRef(false);
  // 툴팁 좌표는 mousemove마다 바뀌므로 React state 대신 DOM을 직접 갱신
  // (state로 두면 마우스 이동마다 Map 전체가 리렌더되어 드래그가 무거워짐)
  const tooltipRef = useRef<HTMLDivElement | null>(null);

  // react-leaflet의 StyleFunction은 Feature<Geometry, any>를 넘긴다. 이 지도의
  // GeoJSON은 건물 폴리곤만 싣기에 좁혀 받는다.
  const geoJsonStyle = useCallback(
    (feature?: Feature<Geometry, GeoJsonProperties>) => {
      const building = feature as BuildingFeature | undefined;
      return activeBuildingIdRef.current === building?.properties?.id
        ? hoverStyle(building, tileMode, prefersDarkMode)
        : baseStyle(building, tileMode, prefersDarkMode);
    },
    [tileMode, prefersDarkMode],
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

  function handleBuildingSelectFromSearch(feature: BuildingFeature) {
    const bId = feature.properties.id;
    if (activeLayerRef.current && activeBuildingIdRef.current !== bId) {
      activeLayerRef.current.setStyle(
        baseStyle(
          featureMapRef.current[activeBuildingIdRef.current ?? -1],
          tileMode,
          prefersDarkMode,
        ),
      );
    }
    const layer = layerMapRef.current[bId];
    if (layer) {
      layer.setStyle(hoverStyle(feature, tileMode, prefersDarkMode));
      activeLayerRef.current = layer;
      activeBuildingIdRef.current = bId;
    }
    setSelectedBuilding({ id: bId, name: feature.properties.name });
  }

  useEffect(() => {
    const handler = (e: Event) =>
      setToast((e as CustomEvent<{ message: string; type: string }>).detail);
    window.addEventListener("showToast", handler);
    return () => window.removeEventListener("showToast", handler);
  }, []);

  useEffect(() => {
    const handler = () => {
      const updated = loadFavoritesFromStorage();
      setFavoritesList(updated);
      favoriteIdsRef.current = new Set(updated.map((f: Favorite) => f.id));
      Object.entries(layerMapRef.current).forEach(([id, layer]) => {
        const numId = Number(id);
        const isActive = activeBuildingIdRef.current === numId;
        const feature = featureMapRef.current[numId];
        layer.setStyle(
          isActive
            ? hoverStyle(feature, tileMode, prefersDarkMode)
            : baseStyle(feature, tileMode, prefersDarkMode),
        );
      });
    };
    window.addEventListener("favoritesUpdated", handler);
    return () => window.removeEventListener("favoritesUpdated", handler);
  }, [tileMode, prefersDarkMode]);

  useEffect(() => {
    Object.entries(layerMapRef.current).forEach(([id, layer]) => {
      const feature = featureMapRef.current[Number(id)];
      if (!feature) return;
      const label = localizedValue(
        feature.properties.name,
        feature.properties.name_en,
        feature.properties.name_zh,
        lang,
      );
      if (label) layer.getTooltip()?.setContent(label);
    });
  }, [lang]);

  useEffect(() => {
    if (!buildingLabelsVisible) return;
    setTooltip((previous) =>
      previous.visible ? { ...previous, visible: false } : previous,
    );
  }, [buildingLabelsVisible]);

  function onEachFeature(feature: BuildingFeature, layer: L.Polygon) {
    const bId = feature.properties.id;
    layerMapRef.current[bId] = layer;
    featureMapRef.current[bId] = feature;
    const label = localizedValue(
      feature.properties.name,
      feature.properties.name_en,
      feature.properties.name_zh,
      lang,
    );
    if (label) {
      layer.bindTooltip(label, {
        permanent: true,
        direction: "center",
        className: "ku-building-label",
        opacity: 1,
        interactive: false,
        pane: "buildingLabels",
      });
    }
    layer.on({
      mouseover(e: L.LeafletMouseEvent) {
        if (isMobileRef.current || (mapRef.current?.getZoom() ?? 16) >= 17) {
          return;
        }
        layer.setStyle(hoverStyle(feature, tileMode, prefersDarkMode));
        const { clientX, clientY } = e.originalEvent;
        const mapEl = mapRef.current?.getContainer();
        if (!mapEl) return;
        const rect = mapEl.getBoundingClientRect();
        setTooltip({
          visible: true,
          name: feature.properties.name,
          name_en: feature.properties.name_en ?? "",
          x: clientX - rect.left + 12,
          y: clientY - rect.top - 36,
        });
      },
      mousemove(e: L.LeafletMouseEvent) {
        if (isMobileRef.current || (mapRef.current?.getZoom() ?? 16) >= 17) {
          return;
        }
        const tooltipEl = tooltipRef.current;
        const mapEl = mapRef.current?.getContainer();
        if (!tooltipEl || !mapEl) return;
        const { clientX, clientY } = e.originalEvent;
        const rect = mapEl.getBoundingClientRect();
        tooltipEl.style.left = `${clientX - rect.left + 12}px`;
        tooltipEl.style.top = `${clientY - rect.top - 36}px`;
      },
      mouseout() {
        setTooltip((prev) => ({ ...prev, visible: false }));
        if (activeLayerRef.current === layer) return;
        layer.setStyle(baseStyle(feature, tileMode, prefersDarkMode));
      },
      click() {
        if (activeBuildingIdRef.current === bId) {
          handleClosePanel();
          return;
        }
        if (activeLayerRef.current && activeLayerRef.current !== layer) {
          activeLayerRef.current.setStyle(
            baseStyle(
              featureMapRef.current[activeBuildingIdRef.current ?? -1],
              tileMode,
              prefersDarkMode,
            ),
          );
        }
        layer.setStyle(hoverStyle(feature, tileMode, prefersDarkMode));
        activeLayerRef.current = layer;
        activeBuildingIdRef.current = bId;
        setSelectedBuilding({ id: bId, name: feature.properties.name });
      },
    });
  }

  function handleSelectById(id: number, name: string) {
    if (activeLayerRef.current && activeBuildingIdRef.current !== id) {
      activeLayerRef.current.setStyle(
        baseStyle(
          featureMapRef.current[activeBuildingIdRef.current ?? -1],
          tileMode,
          prefersDarkMode,
        ),
      );
    }
    const layer = layerMapRef.current[id];
    if (layer) {
      layer.setStyle(
        hoverStyle(featureMapRef.current[id], tileMode, prefersDarkMode),
      );
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
          baseStyle(
            featureMapRef.current[activeBuildingIdRef.current ?? -1],
            tileMode,
            prefersDarkMode,
          ),
        );
        activeLayerRef.current = null;
        activeBuildingIdRef.current = null;
      }
    }, 280);
  }

  function locateUser() {
    if (!navigator.geolocation) {
      setToast({ message: t("locateUnsupported"), type: "info" });
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setLocating(false);
        const location: [number, number] = [coords.latitude, coords.longitude];
        if (!KU_BOUNDS.contains(location)) {
          setToast({ message: t("locateOutside"), type: "info" });
          return;
        }
        setUserLocation({
          lat: coords.latitude,
          lng: coords.longitude,
          accuracy: coords.accuracy,
        });
        mapRef.current?.flyTo(location, 18, {
          animate: true,
        });
      },
      (error) => {
        setLocating(false);
        const message =
          error.code === error.PERMISSION_DENIED
            ? t("locateDenied")
            : error.code === error.TIMEOUT
              ? t("locateTimeout")
              : t("locateUnavailable");
        setToast({ message, type: "error" });
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  return (
    <div
      className="ku-map-shell"
      data-building-labels-visible={buildingLabelsVisible}
    >
      {/* 로딩 오버레이 */}
      {loadingMap && (
        <div className="ku-map-loading">
          <div className="ku-map-spinner" />
          <div>{t("loadingMap")}</div>
        </div>
      )}

      {/* 데이터 소스 오류 배너 (비차단·재시도) */}
      <MapErrorBanner statuses={statuses} retry={retry} t={t} />

      <MapContainer
        center={KU_CENTER}
        zoom={16}
        style={{ width: "100%", height: "100%" }}
        maxBounds={KU_BOUNDS}
        maxBoundsViscosity={0.7}
        ref={mapRef}
        zoomControl={false}
        // 표기는 아래 .ku-attribution 오버레이가 대신한다. 기본 컨트롤을 만들어
        // 두고 CSS로 가리면 그 규칙이 전역이라 관리자 지도의 표기까지 함께
        // 지워진다 — 그쪽에는 대신할 오버레이가 없다.
        attributionControl={false}
      >
        <TileLayer
          key={`${tileMode}-${prefersDarkMode ? "dark" : "light"}`}
          url={
            tileMode === "street"
              ? getCartoTileUrl(prefersDarkMode)
              : TILES.satellite.url
          }
          attribution={TILES[tileMode].attribution}
          subdomains={TILES[tileMode].subdomains}
          maxZoom={19}
        />
        <BoundsController />
        <MapViewportObserver onChange={setViewport} />
        <Pane
          name="buildingLabels"
          style={{ zIndex: 450, pointerEvents: "none" }}
        />
        {geoData && (
          <>
            <GeoJSON
              key={`${tileMode}-${prefersDarkMode}-${geoDataVersion}`}
              data={geoData}
              style={geoJsonStyle}
              onEachFeature={onEachFeature}
            />
            <SearchControl
              geoData={geoData}
              landmarks={landmarks}
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
        {userLocation && (
          <>
            <Circle
              center={[userLocation.lat, userLocation.lng]}
              radius={userLocation.accuracy}
              pathOptions={{
                color: "#2563eb",
                weight: 1,
                opacity: 0.5,
                fillColor: "#2563eb",
                fillOpacity: 0.12,
              }}
            />
            <Marker
              position={[userLocation.lat, userLocation.lng]}
              icon={userLocationIcon}
              title={t("myLocationMarker")}
              alt={t("myLocationMarker")}
            />
          </>
        )}
        <FacilityMarkers
          facilities={facilities}
          activeTypes={activeTypes}
          zoom={viewport?.zoom ?? 16}
        />
        <LandmarkMarkers
          landmarks={landmarks}
          showLandmarks={showLandmarks}
          zoom={viewport?.zoom ?? 16}
          showLabels={buildingLabelsVisible}
        />
        <SubwayMarkers
          lang={lang}
          zoom={viewport?.zoom ?? 16}
          onSelect={setSelectedBuilding}
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
                (prefersDarkMode
                  ? satelliteCampusColor[feature?.properties?.campus]
                  : campusColor[feature?.properties?.campus]) ??
                feature?.properties?.color,
              weight: 2,
              opacity: 0.45,
              fillColor:
                (prefersDarkMode
                  ? satelliteCampusColor[feature?.properties?.campus]
                  : campusColor[feature?.properties?.campus]) ??
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
        data-hidden={
          isMobile && (mobileFilterOpen || Boolean(selectedBuilding))
        }
      >
        <Image
          src="/kuis-logo.png"
          alt="고려대학교 지속가능원"
          width={510}
          height={84}
        />
        <span className="ku-attribution-separator" aria-hidden="true" />
        <span>
          ©{" "}
          <a
            href="https://www.openstreetmap.org/copyright"
            target="_blank"
            rel="noopener noreferrer"
          >
            OpenStreetMap
          </a>{" "}
          · ©{" "}
          {tileMode === "street" ? (
            <a
              href="https://carto.com/attributions"
              target="_blank"
              rel="noopener noreferrer"
            >
              CARTO
            </a>
          ) : (
            <a
              href="https://www.esri.com"
              target="_blank"
              rel="noopener noreferrer"
            >
              Esri
            </a>
          )}{" "}
          ·{" "}
          <a
            href="https://leafletjs.com/"
            target="_blank"
            rel="noopener noreferrer"
          >
            Leaflet
          </a>
        </span>
      </div>

      <div
        className="ku-map-actions"
        data-panel-open={Boolean(selectedBuilding)}
        data-overlay-open={mobileFilterOpen}
      >
        <div className="ku-map-zoom" aria-label="지도 확대 및 축소">
          <button
            className="ku-map-action"
            type="button"
            onClick={() => mapRef.current?.zoomIn()}
            title="확대"
            aria-label="확대"
          >
            <Plus size={19} aria-hidden="true" />
          </button>
          <button
            className="ku-map-action"
            type="button"
            onClick={() => mapRef.current?.zoomOut()}
            title="축소"
            aria-label="축소"
          >
            <Minus size={19} aria-hidden="true" />
          </button>
        </div>
        <button
          className="ku-map-action ku-map-action--labeled"
          type="button"
          onClick={locateUser}
          title={t("myLocation")}
          aria-label={t("myLocation")}
          disabled={locating}
          data-locating={locating}
          aria-busy={locating}
        >
          <LocateFixed size={19} aria-hidden="true" />
          <span className="ku-map-action-label">{t("myLocation")}</span>
        </button>
        <button
          className="ku-map-action ku-map-action--labeled"
          type="button"
          onClick={() =>
            setTileMode((mode) => (mode === "street" ? "satellite" : "street"))
          }
          title={
            tileMode === "street" ? t("tileToSatellite") : t("tileToStreet")
          }
          aria-label={
            tileMode === "street" ? t("tileToSatellite") : t("tileToStreet")
          }
        >
          {tileMode === "street" ? (
            <Satellite size={19} aria-hidden="true" />
          ) : (
            <MapIcon size={19} aria-hidden="true" />
          )}
          <span className="ku-map-action-label">
            {tileMode === "street" ? t("tileSatellite") : t("tileStreet")}
          </span>
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
        lang={lang}
        setLang={setLang}
        panelOpen={Boolean(selectedBuilding)}
      />

      {!selectedBuilding && !mobileFilterOpen && (
        <MapBrowseList
          items={browseItems}
          isFront={frontMapPanel === "browse"}
          onActivate={() => setFrontMapPanel("browse")}
          onSelect={(item) => {
            mapRef.current?.flyTo([item.lat, item.lng], 18, { animate: true });
          }}
        />
      )}

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
        isFront={frontMapPanel === "filter"}
        onActivate={() => setFrontMapPanel("filter")}
      />

      {/* 툴팁 — 데스크탑만 */}
      {!isMobile && tooltip.visible && (
        <div
          ref={tooltipRef}
          className="ku-map-tooltip"
          style={{ left: tooltip.x, top: tooltip.y }}
        >
          {lang === "ko" ? tooltip.name : (tooltip.name_en ?? tooltip.name)}
        </div>
      )}

      {selectedBuilding && (
        <SidePanel
          key={selectedBuilding.id}
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
