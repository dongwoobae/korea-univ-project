"use client";

import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { flushSync } from "react-dom";
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
  ChevronsLeft,
  LocateFixed,
  Map as MapIcon,
  Minus,
  Plus,
  Satellite,
  Star,
  X,
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
import FilterPanel, { type FilterSections } from "./FilterPanel";
import FeedbackButton from "./FeedbackButton";
import FavoritesList from "./FavoritesList";
import LanguageSwitcher from "./LanguageSwitcher";
import ThemeToggleButton from "./ThemeToggleButton";
import SlopeLayer from "./SlopeLayer";
import SlopeLegend from "./SlopeLegend";
import FacilityMarkers from "./FacilityMarkers";
import LandmarkMarkers from "./LandmarkMarkers";
import SubwayMarkers from "./SubwayMarkers";
import {
  revealLabelAboveSheet,
  setBuildingLabelEmphasis,
} from "./buildingLabel";
import { useMapData } from "./useMapData";
import MapErrorBanner from "./MapErrorBanner";
import MapBrowseList, {
  MapBrowsePanel,
  type MapBrowseItem,
} from "./MapBrowseList";
import MapMenuNav from "./MapMenuNav";
import MapMenuPanel from "./MapMenuPanel";
import { activeFilterCount, MENU_PANEL_ID, type MenuPanel } from "./mapMenu";
import { useMapMenu } from "./useMapMenu";
import MapViewportObserver, {
  containsMapPoint,
  type MapViewport,
} from "./MapViewportObserver";
import { CARTO_ATTRIBUTION, getCartoTileUrl } from "@/lib/mapTiles";
import { useColorMode } from "@/lib/useColorMode";
import "./map-ui.css";
import { KU_BOUNDS } from "@/lib/mapBounds";

const KU_CENTER: [number, number] = [37.5893, 127.0327];
const KU_LATLNG_BOUNDS = L.latLngBounds(
  [KU_BOUNDS.south, KU_BOUNDS.west],
  [KU_BOUNDS.north, KU_BOUNDS.east],
);

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
    map.setMaxBounds(KU_LATLNG_BOUNDS);
    map.setMinZoom(15);
    map.setMaxZoom(19);
  }, [map]);
  return null;
}

/** 지도를 누르면 메뉴 패널을 닫는다. 마커까지 잡으려고 DOM click을 듣는다 — 거르는 것과 이유는 설계 5.3 (docs/specs/2026-10-27-map-menu-design.md) */
function MapPressCloser({ onPress }: { onPress: () => void }) {
  const map = useMap();
  useEffect(() => {
    const container = map.getContainer();
    // @types/leaflet의 Handler에는 Map.Drag의 moved()가 없다
    const dragging = map.dragging as
      (L.Handler & { moved(): boolean }) | undefined;
    function handleClick(event: MouseEvent) {
      if (dragging?.moved()) return;
      if ((event.target as Element | null)?.closest(".leaflet-popup")) return;
      onPress();
    }
    container.addEventListener("click", handleClick);
    return () => container.removeEventListener("click", handleClick);
  }, [map, onPress]);
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
  darkMode: boolean,
) {
  const useBrightColors = tileMode === "satellite" || darkMode;
  const colors = useBrightColors ? satelliteCampusColor : campusColor;
  return (
    colors[feature?.properties?.campus ?? ""] ??
    (useBrightColors ? "#FF4D3D" : "#963A32")
  );
}

function baseStyle(
  feature: BuildingFeature | undefined,
  tileMode: TileMode,
  darkMode: boolean,
) {
  const color = buildingColor(feature, tileMode, darkMode);
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
  darkMode: boolean,
) {
  const color = buildingColor(feature, tileMode, darkMode);
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
    icon: null,
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
    icon: landmark.icon,
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
  // 닫는 0.28초 사이 다시 고르면 상세를 새로 띄우려고 key에 붙인다(docs/specs/2026-10-27-map-menu-design.md 5.5)
  const [sidePanelInstance, setSidePanelInstance] = useState(0);
  const [favoritesList, setFavoritesList] = useState<Favorite[]>(
    loadFavoritesFromStorage,
  );
  const [toast, setToast] = useState<{ message: string; type: string } | null>(
    null,
  );
  // MapWrapper가 ssr 없이 불러 첫 그리기에 window가 있다. 휴대폰에서 웹 메뉴가 한 번 그려지지 않게 처음부터 잰다
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  const [tileMode, setTileMode] = useState<keyof typeof TILES>("street");
  const darkMode = useColorMode() === "dark";
  const [showSlope, setShowSlope] = useState(false);
  const [showLandmarks, setShowLandmarks] = useState(true);
  const [viewport, setViewport] = useState<MapViewport | null>(null);
  const [frontMapPanel, setFrontMapPanel] = useState<"filter" | "browse">(
    "filter",
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [filterSections, setFilterSections] = useState<FilterSections>({
    campus: false,
    facility: false,
  });
  const menu = useMapMenu(isMobile);
  const { dismiss: dismissMenu, handleBreakpoint } = menu;
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
  const isMobileRef = useRef(isMobile);
  const closePanelTimerRef = useRef<number | null>(null);
  // 툴팁 좌표는 mousemove마다 바뀌므로 React state 대신 DOM을 직접 갱신
  // (state로 두면 마우스 이동마다 Map 전체가 리렌더되어 드래그가 무거워짐)
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  // 이름표 강조(설계 5.2). 마우스 올림은 mouseover마다 바뀌어 state 대신 ref로 두고, 선택은 상세 패널이 열린 건물을 따른다
  const hoveredBuildingIdRef = useRef<number | null>(null);
  const labelSelectedIdRef = useRef<number | null>(null);
  const selectedBuildingId = selectedBuilding?.id ?? null;

  useEffect(() => {
    const previous = labelSelectedIdRef.current;
    labelSelectedIdRef.current = selectedBuildingId;
    for (const id of [previous, selectedBuildingId]) {
      if (id === null) continue;
      setBuildingLabelEmphasis(layerMapRef.current[id]?.getTooltip(), {
        hovered: hoveredBuildingIdRef.current === id,
        selected: selectedBuildingId === id,
      });
    }
  }, [selectedBuildingId]);

  // 지하철역 선택(SubwayMarkers의 onSelect)은 활성 폴리곤을 건드리지 않는다. 남겨 두면 그 건물이 강조된 채 남고, 다시 누르면
  // 선택 대신 닫기로 읽힌다(click의 activeBuildingIdRef 비교)
  useEffect(() => {
    if (
      !activeLayerRef.current ||
      activeBuildingIdRef.current === selectedBuildingId
    )
      return;
    activeLayerRef.current.setStyle(
      baseStyle(
        featureMapRef.current[activeBuildingIdRef.current ?? -1],
        tileMode,
        darkMode,
      ),
    );
    activeLayerRef.current = null;
    activeBuildingIdRef.current = null;
  }, [selectedBuildingId, tileMode, darkMode]);

  // react-leaflet의 StyleFunction은 Feature<Geometry, any>를 넘긴다. 이 지도의
  // GeoJSON은 건물 폴리곤만 싣기에 좁혀 받는다.
  const geoJsonStyle = useCallback(
    (feature?: Feature<Geometry, GeoJsonProperties>) => {
      const building = feature as BuildingFeature | undefined;
      return activeBuildingIdRef.current === building?.properties?.id
        ? hoverStyle(building, tileMode, darkMode)
        : baseStyle(building, tileMode, darkMode);
    },
    [tileMode, darkMode],
  );

  // 모바일 감지. 폭 경계를 넘으면 열린 메뉴 패널을 닫는다(docs/specs/2026-10-27-map-menu-design.md 5.2)
  useEffect(() => {
    const check = () => {
      const mobile = window.innerWidth < 768;
      if (mobile === isMobileRef.current) return;
      isMobileRef.current = mobile;
      handleBreakpoint(() => setIsMobile(mobile));
    };
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, [handleBreakpoint]);

  // 건물을 고르는 길(폴리곤·검색·즐겨찾기·지하철역)이 모두 여기를 지난다. SubwayMarkers가 memo라 참조를 고정한다
  const selectBuilding = useCallback(
    (building: { id: number; name: string }) => {
      if (closePanelTimerRef.current !== null) {
        window.clearTimeout(closePanelTimerRef.current);
        closePanelTimerRef.current = null;
        setSidePanelInstance((instance) => instance + 1);
      }
      setSelectedBuilding(building);
      dismissMenu();
    },
    [dismissMenu],
  );

  function handleBuildingSelectFromSearch(feature: BuildingFeature) {
    const bId = feature.properties.id;
    if (activeLayerRef.current && activeBuildingIdRef.current !== bId) {
      activeLayerRef.current.setStyle(
        baseStyle(
          featureMapRef.current[activeBuildingIdRef.current ?? -1],
          tileMode,
          darkMode,
        ),
      );
    }
    const layer = layerMapRef.current[bId];
    if (layer) {
      layer.setStyle(hoverStyle(feature, tileMode, darkMode));
      activeLayerRef.current = layer;
      activeBuildingIdRef.current = bId;
    }
    selectBuilding({ id: bId, name: feature.properties.name });
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
            ? hoverStyle(feature, tileMode, darkMode)
            : baseStyle(feature, tileMode, darkMode),
        );
      });
    };
    window.addEventListener("favoritesUpdated", handler);
    return () => window.removeEventListener("favoritesUpdated", handler);
  }, [tileMode, darkMode]);

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
    // 다시 만든 층은 마우스 올림 없이 시작한다. 지난 층의 mouseout은 오지 않는다
    if (hoveredBuildingIdRef.current === bId)
      hoveredBuildingIdRef.current = null;
    const syncLabel = () =>
      setBuildingLabelEmphasis(layer.getTooltip(), {
        hovered: hoveredBuildingIdRef.current === bId,
        selected: labelSelectedIdRef.current === bId,
      });
    layer.on({
      // 타일·다크·데이터 버전으로 GeoJSON을 다시 만들면 이름표도 새로 열린다
      tooltipopen: syncLabel,
      mouseover(e: L.LeafletMouseEvent) {
        if (isMobileRef.current) return;
        hoveredBuildingIdRef.current = bId;
        syncLabel();
        // 이름이 보이는 확대에서는 이름표가 강조를 맡는다
        if ((mapRef.current?.getZoom() ?? 16) >= 17) return;
        layer.setStyle(hoverStyle(feature, tileMode, darkMode));
        // 선택된 건물은 이름표가 이미 떠 있다
        if (labelSelectedIdRef.current === bId) return;
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
        if (hoveredBuildingIdRef.current === bId) {
          hoveredBuildingIdRef.current = null;
          syncLabel();
        }
        setTooltip((prev) => ({ ...prev, visible: false }));
        if (activeLayerRef.current === layer) return;
        layer.setStyle(baseStyle(feature, tileMode, darkMode));
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
              darkMode,
            ),
          );
        }
        layer.setStyle(hoverStyle(feature, tileMode, darkMode));
        activeLayerRef.current = layer;
        activeBuildingIdRef.current = bId;
        selectBuilding({ id: bId, name: feature.properties.name });
        // 선택하면 이름표가 뜬다 — 커서 이름표를 겹쳐 두지 않는다
        setTooltip((prev) =>
          prev.visible ? { ...prev, visible: false } : prev,
        );
        if (isMobileRef.current && mapRef.current) {
          revealLabelAboveSheet(mapRef.current, layer.getTooltip());
        }
      },
    });
  }

  function handleSelectById(id: number, name: string) {
    if (activeLayerRef.current && activeBuildingIdRef.current !== id) {
      activeLayerRef.current.setStyle(
        baseStyle(
          featureMapRef.current[activeBuildingIdRef.current ?? -1],
          tileMode,
          darkMode,
        ),
      );
    }
    const layer = layerMapRef.current[id];
    if (layer) {
      layer.setStyle(hoverStyle(featureMapRef.current[id], tileMode, darkMode));
      activeLayerRef.current = layer;
      activeBuildingIdRef.current = id;
      mapRef.current?.fitBounds(layer.getBounds(), {
        maxZoom: 18,
        animate: true,
      });
    }
    selectBuilding({ id, name });
  }

  function handleClosePanel() {
    window.dispatchEvent(new Event("sidePanelShouldClose"));
    if (closePanelTimerRef.current !== null)
      window.clearTimeout(closePanelTimerRef.current);
    // 닫히는 사이 건물을 다시 고르면 selectBuilding이 이 타이머를 취소한다(docs/specs/2026-10-27-map-menu-design.md 5.5)
    closePanelTimerRef.current = window.setTimeout(() => {
      closePanelTimerRef.current = null;
      setSelectedBuilding(null);
      if (activeLayerRef.current) {
        activeLayerRef.current.setStyle(
          baseStyle(
            featureMapRef.current[activeBuildingIdRef.current ?? -1],
            tileMode,
            darkMode,
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
        if (!KU_LATLNG_BOUNDS.contains(location)) {
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

  function toggleMenuPanel(panel: MenuPanel) {
    if (panel === "favorites") setFavoritesList(loadFavoritesFromStorage());
    menu.toggle(panel);
  }

  // 모바일에서 메뉴로 건물을 고르면 상세가 열리며 아래 줄이 사라진다. 초점을 상세로 옮긴다(docs/specs/2026-10-27-map-menu-design.md 5.4)
  function pickBuildingFromMenu(select: () => void) {
    menu.closeAndRestoreFocus();
    if (menu.layout !== "bar") {
      select();
      return;
    }
    flushSync(select);
    document
      .querySelector<HTMLElement>(".ku-side-panel")
      ?.focus({ preventScroll: true });
  }

  function handleSearchBuilding(feature: BuildingFeature, label: string) {
    setSearchQuery(label);
    const latlngs = feature.geometry.coordinates[0].map(
      ([lng, lat]) => [lat, lng] as [number, number],
    );
    mapRef.current?.fitBounds(L.latLngBounds(latlngs), {
      maxZoom: 18,
      animate: true,
    });
    pickBuildingFromMenu(() => handleBuildingSelectFromSearch(feature));
  }

  function handleSearchLandmark(landmark: Landmark, label: string) {
    setSearchQuery(label);
    mapRef.current?.flyTo([landmark.lat, landmark.lng], 18, { animate: true });
    menu.closeAndRestoreFocus();
  }

  function handleFavoriteSelect(id: number, name: string) {
    pickBuildingFromMenu(() => handleSelectById(id, name));
  }

  function handleBrowseSelect(item: MapBrowseItem) {
    mapRef.current?.flyTo([item.lat, item.lng], 18, { animate: true });
    menu.closeAndRestoreFocus();
  }

  const { layout, openPanel } = menu;
  const menuCounts = {
    filter: activeFilterCount({
      activeCampuses,
      activeTypes,
      showSlope,
      showLandmarks,
    }),
    favorites: favoritesList.length,
    browse: browseItems.length,
  };
  const filterPanel = (
    <FilterPanel
      facilityTypes={facilityTypes}
      activeTypes={activeTypes}
      setActiveTypes={setActiveTypes}
      showSlope={showSlope}
      setShowSlope={setShowSlope}
      activeCampuses={activeCampuses}
      setActiveCampuses={setActiveCampuses}
      showLandmarks={showLandmarks}
      setShowLandmarks={setShowLandmarks}
      sections={filterSections}
      setSections={setFilterSections}
    />
  );
  const searchProps = {
    geoData,
    landmarks,
    favorites: favoritesList,
    query: searchQuery,
    onQueryChange: setSearchQuery,
    onSelectBuilding: handleSearchBuilding,
    onSelectLandmark: handleSearchLandmark,
  };

  return (
    <div
      className="ku-map-shell ku-font-scope"
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
        maxBounds={KU_LATLNG_BOUNDS}
        maxBoundsViscosity={0.7}
        ref={mapRef}
        zoomControl={false}
        // 표기는 아래 .ku-attribution 오버레이가 대신한다. 기본 컨트롤을 만들어
        // 두고 CSS로 가리면 그 규칙이 전역이라 관리자 지도의 표기까지 함께
        // 지워진다 — 그쪽에는 대신할 오버레이가 없다.
        attributionControl={false}
      >
        <TileLayer
          key={`${tileMode}-${darkMode ? "dark" : "light"}`}
          url={
            tileMode === "street"
              ? getCartoTileUrl(darkMode)
              : TILES.satellite.url
          }
          attribution={TILES[tileMode].attribution}
          subdomains={TILES[tileMode].subdomains}
          maxZoom={19}
        />
        <BoundsController />
        <MapViewportObserver onChange={setViewport} />
        <MapPressCloser onPress={dismissMenu} />
        <Pane
          name="buildingLabels"
          style={{ zIndex: 450, pointerEvents: "none" }}
        />
        {geoData && (
          <GeoJSON
            key={`${tileMode}-${darkMode}-${geoDataVersion}`}
            data={geoData}
            style={geoJsonStyle}
            onEachFeature={onEachFeature}
          />
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
          onSelect={selectBuilding}
        />
        {showSlope && slopes.length > 0 && (
          <SlopeLayer
            slopes={slopes}
            darkMap={tileMode === "street" && darkMode}
          />
        )}
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
                (darkMode
                  ? satelliteCampusColor[feature?.properties?.campus]
                  : campusColor[feature?.properties?.campus]) ??
                feature?.properties?.color,
              weight: 2,
              opacity: 0.45,
              fillColor:
                (darkMode
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

      {/* 메뉴는 Leaflet 컨테이너 밖에 둔다 — 안을 누르면 지도 누르기로 읽힌다(docs/specs/2026-10-27-map-menu-design.md 5.3) */}
      {layout === "expanded" && (
        <>
          <SearchControl
            {...searchProps}
            resultsHidden={openPanel !== null}
            onActivate={dismissMenu}
            inputRef={menu.triggerRefs.search}
            trailing={
              <>
                <button
                  ref={menu.triggerRefs.favorites}
                  className="ku-favorite-button"
                  type="button"
                  onClick={() => toggleMenuPanel("favorites")}
                  aria-label={
                    favoritesList.length > 0
                      ? `${t("favorites")} (${favoritesList.length})`
                      : t("favorites")
                  }
                  aria-expanded={openPanel === "favorites"}
                  aria-controls={MENU_PANEL_ID.favorites}
                  title={t("favorites")}
                >
                  <Star size={17} fill="currentColor" aria-hidden="true" />
                  {favoritesList.length > 0 && (
                    <span className="ku-favorite-badge" aria-hidden="true">
                      {favoritesList.length}
                    </span>
                  )}
                </button>
                <button
                  ref={menu.collapseButtonRef}
                  className="ku-icon-button"
                  type="button"
                  onClick={() => menu.setCollapsed(true)}
                  aria-label={t("menuCollapse")}
                  title={t("menuCollapse")}
                >
                  <ChevronsLeft size={18} aria-hidden="true" />
                </button>
              </>
            }
          />
          {openPanel === "favorites" && (
            <FavoritesList
              favorites={favoritesList}
              onSelect={handleFavoriteSelect}
            />
          )}
          <div
            className="ku-filter-panel"
            data-front={frontMapPanel === "filter"}
            onPointerDownCapture={() => setFrontMapPanel("filter")}
            onFocusCapture={() => setFrontMapPanel("filter")}
          >
            {filterPanel}
          </div>
          {!selectedBuilding && (
            <MapBrowseList
              items={browseItems}
              open={openPanel === "browse"}
              onToggle={() => toggleMenuPanel("browse")}
              onClose={menu.closeAndRestoreFocus}
              onSelect={handleBrowseSelect}
              isFront={frontMapPanel === "browse"}
              onActivate={() => setFrontMapPanel("browse")}
              triggerRef={menu.triggerRefs.browse}
            />
          )}
        </>
      )}

      {layout !== "expanded" && !(layout === "bar" && selectedBuilding) && (
        <MapMenuNav
          orientation={layout}
          openPanel={openPanel}
          counts={menuCounts}
          onToggle={toggleMenuPanel}
          triggerRefs={menu.triggerRefs}
          onExpand={
            layout === "rail" ? () => menu.setCollapsed(false) : undefined
          }
          expandButtonRef={menu.expandButtonRef}
        />
      )}

      {layout !== "expanded" && openPanel && (
        <MapMenuPanel
          layout={layout}
          panel={openPanel}
          title={openPanel === "filter" ? t("filterTitle") : undefined}
        >
          {openPanel === "search" && (
            <SearchControl
              {...searchProps}
              panelMode
              trailing={
                layout === "bar" ? (
                  <button
                    className="ku-icon-button ku-search-close"
                    type="button"
                    onClick={menu.closeAndRestoreFocus}
                    aria-label={t("searchClose")}
                    title={t("searchClose")}
                  >
                    <X size={18} aria-hidden="true" />
                  </button>
                ) : undefined
              }
            />
          )}
          {openPanel === "filter" && filterPanel}
          {openPanel === "favorites" && (
            <FavoritesList
              favorites={favoritesList}
              onSelect={handleFavoriteSelect}
            />
          )}
          {openPanel === "browse" && (
            <MapBrowsePanel
              items={browseItems}
              onSelect={handleBrowseSelect}
              onClose={menu.closeAndRestoreFocus}
            />
          )}
        </MapMenuPanel>
      )}

      <div
        className="ku-attribution"
        data-hidden={
          isMobile && (openPanel !== null || Boolean(selectedBuilding))
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
        className="ku-map-corner"
        data-panel-open={Boolean(selectedBuilding)}
        data-overlay-open={openPanel !== null}
      >
        <SlopeLegend show={showSlope} />
        <div className="ku-map-actions">
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
              setTileMode((mode) =>
                mode === "street" ? "satellite" : "street",
              )
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
          {layout === "expanded" && (
            <ThemeToggleButton
              className="ku-map-action ku-map-action--labeled"
              labelClassName="ku-map-action-label"
              iconSize={19}
            />
          )}
          <FeedbackButton />
        </div>
      </div>

      <LanguageSwitcher
        lang={lang}
        setLang={setLang}
        panelOpen={Boolean(selectedBuilding)}
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
          key={`${selectedBuilding.id}-${sidePanelInstance}`}
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
