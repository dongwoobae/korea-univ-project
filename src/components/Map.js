"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import {
  MapContainer,
  TileLayer,
  GeoJSON,
  useMap,
  Marker,
  Popup,
  ZoomControl,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import SidePanel from "@/components/SidePanel";
import Toast from "@/components/Toast";
import { supabase } from "@/lib/supabaseClient";
import { useLanguage } from "@/lib/LanguageContext";

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

const VOICE_LANG_MAP = { ko: "ko-KR", en: "en-US", zh: "zh-CN" };

function SearchControl({ geoData, isMobile, onBuildingSelect }) {
  const map = useMap();
  const { lang, t } = useLanguage();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [isFocused, setIsFocused] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef(null);

  useEffect(() => {
    if (!geoData || query.trim() === "") {
      setResults([]);
      return;
    }
    const q = query.toLowerCase();
    const matched = geoData.features
      .filter(
        (f) =>
          f.properties.name?.includes(query) ||
          f.properties.name_en?.toLowerCase().includes(q),
      )
      .slice(0, 6);
    setResults(matched);
  }, [query, geoData]);

  function handleSelect(feature) {
    const coords = feature.geometry.coordinates[0];
    const latlngs = coords.map(([lon, lat]) => [lat, lon]);
    const bounds = L.latLngBounds(latlngs);
    map.fitBounds(bounds, { maxZoom: 18, animate: true });
    setQuery(
      lang === "ko"
        ? feature.properties.name
        : (feature.properties.name_en ?? feature.properties.name),
    );
    setResults([]);
    onBuildingSelect?.(feature);
  }

  function handleVoiceSearch(e) {
    e.preventDefault();
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert(t("voiceNotSupported"));
      return;
    }
    if (isListening) {
      recognitionRef.current?.stop();
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = VOICE_LANG_MAP[lang] ?? "ko-KR";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    recognition.onerror = () => setIsListening(false);
    recognition.onresult = (ev) => {
      setQuery(ev.results[0][0].transcript);
    };
    recognitionRef.current = recognition;
    recognition.start();
  }

  return (
    <div
      style={{
        position: "absolute",
        top: 16,
        left: 56,
        zIndex: 1000,
        width: isMobile ? "calc(100vw - 188px)" : 260,
      }}
    >
      <div style={{ position: "relative" }}>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setTimeout(() => setIsFocused(false), 150)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && results.length > 0) handleSelect(results[0]);
          }}
          placeholder={t("searchPlaceholder")}
          style={{
            width: "100%",
            padding: "10px 38px 10px 14px",
            borderWidth: 1,
            borderStyle: "solid",
            borderColor: "#ddd",
            borderRadius: results.length > 0 && isFocused ? "8px 8px 0 0" : "8px",
            fontSize: isMobile ? 16 : 14,
            outline: "none",
            boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
            background: "#fff",
            boxSizing: "border-box",
          }}
        />
        <button
          onMouseDown={handleVoiceSearch}
          title={t("voiceSearch")}
          style={{
            position: "absolute",
            right: 8,
            top: "50%",
            transform: "translateY(-50%)",
            background: "none",
            border: "none",
            cursor: "pointer",
            fontSize: 16,
            padding: "0 2px",
            lineHeight: 1,
            color: isListening ? "#ef4444" : "#999",
            animation: isListening ? "micPulse 1s ease-in-out infinite" : "none",
          }}
        >
          🎤
        </button>
      </div>
      {results.length > 0 && isFocused && (
        <ul
          style={{
            margin: 0,
            padding: 0,
            listStyle: "none",
            background: "#fff",
            borderWidth: 1,
            borderStyle: "solid",
            borderColor: "#ddd",
            borderTopWidth: 0,
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
                padding: isMobile ? "12px 14px" : "9px 14px",
                fontSize: 13,
                cursor: "pointer",
                borderBottomWidth: 1,
                borderBottomStyle: "solid",
                borderBottomColor: "#f0f0f0",
                color: "#333",
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.background = "#f5f5f5")
              }
              onMouseLeave={(e) => (e.currentTarget.style.background = "#fff")}
            >
              {lang === "ko"
                ? f.properties.name
                : (f.properties.name_en ?? f.properties.name)}
            </li>
          ))}
        </ul>
      )}
      <style>{`
        @keyframes micPulse {
          0%, 100% { opacity: 1; transform: translateY(-50%) scale(1); }
          50% { opacity: 0.5; transform: translateY(-50%) scale(1.2); }
        }
      `}</style>
    </div>
  );
}

const FACILITY_COLORS = {
  elevator: "#2563EB",
  restroom: "#16A34A",
  ramp: "#EA580C",
  parking: "#7C3AED",
  braille: "#CA8A04",
};
const FALLBACK_PALETTE = [
  "#0891B2",
  "#BE185D",
  "#15803D",
  "#B45309",
  "#6D28D9",
  "#0F766E",
  "#C2410C",
  "#1D4ED8",
  "#7E22CE",
  "#047857",
];
function getFacilityColor(code, index) {
  return (
    FACILITY_COLORS[code] ?? FALLBACK_PALETTE[index % FALLBACK_PALETTE.length]
  );
}

const SUBWAY_STATIONS = [
  {
    id: 9000001,
    name: "고려대역",
    name_en: "Goryeodae Station",
    name_zh: "高丽大站",
    line: "6호선",
    lat: 37.5895,
    lng: 127.0363,
  },
  {
    id: 9000002,
    name: "안암역",
    name_en: "Anam Station",
    name_zh: "安岩站",
    line: "6호선",
    lat: 37.5862,
    lng: 127.0294,
  },
  {
    id: 9000003,
    name: "보문역",
    name_en: "Bomun Station",
    name_zh: "普门站",
    line: "6호선",
    lat: 37.5853,
    lng: 127.0194,
  },
];

function loadFavoritesFromStorage() {
  try {
    return JSON.parse(localStorage.getItem("ku_favorites") ?? "[]");
  } catch {
    return [];
  }
}

const LANG_BUTTONS = [
  { code: "ko", label: "한", title: "한국어" },
  { code: "en", label: "EN", title: "English" },
  { code: "zh", label: "中", title: "中文" },
];

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
  const [geoData, setGeoData] = useState(null);
  const [loadingMap, setLoadingMap] = useState(true);
  const [tooltip, setTooltip] = useState({
    visible: false,
    name: "",
    name_en: "",
    x: 0,
    y: 0,
  });
  const [selectedBuilding, setSelectedBuilding] = useState(null);
  const [showFavorites, setShowFavorites] = useState(false);
  const [favoritesList, setFavoritesList] = useState([]);
  const [facilities, setFacilities] = useState([]);
  const [facilityTypes, setFacilityTypes] = useState([]);
  const [activeTypes, setActiveTypes] = useState({});
  const [showFilter, setShowFilter] = useState(false);
  const [toast, setToast] = useState(null);
  const [isMobile, setIsMobile] = useState(false);
  const { lang, setLang, t } = useLanguage();

  const mapRef = useRef(null);
  const activeLayerRef = useRef(null);
  const activeBuildingIdRef = useRef(null);
  const layerMapRef = useRef({});
  const favoriteIdsRef = useRef(
    new Set(loadFavoritesFromStorage().map((f) => f.id)),
  );
  // ✅ isMobile을 ref로도 관리 — onEachFeature 클로저에서 항상 최신값 참조
  const isMobileRef = useRef(false);

  const geoJsonStyle = useCallback(
    (feature) => baseStyle(favoriteIdsRef.current.has(feature.properties.id)),
    [], // favoriteIdsRef는 ref라 deps 불필요
  );

  // 모바일 감지 — state + ref 동시 업데이트
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

  const facilityMarkerIcon = (code, icon) =>
    L.divIcon({
      className: "",
      html: `<div style="width:30px;height:30px;background:${FACILITY_COLORS[code] ?? "#666"};border:2.5px solid white;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:14px;box-shadow:0 2px 6px rgba(0,0,0,0.25);">${icon}</div>`,
      iconAnchor: [15, 15],
      popupAnchor: [0, -18],
    });

  const subwayIcon = (name) =>
    L.divIcon({
      className: "",
      html: `<div style="display:flex;flex-direction:column;align-items:center;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.35))"><div style="background:#B9282D;color:white;border:2.5px solid white;border-radius:50%;width:32px;height:32px;display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:bold;">🚇</div><div style="background:#B9282D;color:white;border-radius:10px;padding:2px 7px;font-size:11px;font-weight:700;margin-top:3px;white-space:nowrap;border:1.5px solid white;">${name}</div></div>`,
      iconAnchor: [16, 44],
      popupAnchor: [0, -46],
    });

  function getFacilityLabel(ft) {
    if (lang === "en") return ft.label_en ?? ft.label;
    if (lang === "zh") return ft.label_zh ?? ft.label;
    return ft.label;
  }

  // 검색에서 건물 선택 → layer 하이라이트 + SidePanel 열기
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

  // 토스트
  useEffect(() => {
    const handler = (e) => setToast(e.detail);
    window.addEventListener("showToast", handler);
    return () => window.removeEventListener("showToast", handler);
  }, []);

  // 즐겨찾기 초기 로드 + 실시간 동기화
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

  // 건물 GeoJSON
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

  // 시설 마커 데이터
  useEffect(() => {
    fetch("/api/facilities")
      .then((r) => r.json())
      .then((data) => setFacilities(data ?? []))
      .catch(() => {});
  }, []);

  // facility_types DB에서 동적 로드
  useEffect(() => {
    supabase
      .from("facility_types")
      .select("code, label, label_en, label_zh, icon")
      .then(({ data }) => {
        if (!data) return;
        setFacilityTypes(data);
        setActiveTypes(Object.fromEntries(data.map((ft) => [ft.code, false])));
      });
  }, []);

  function onEachFeature(feature, layer) {
    const bId = feature.properties.id;
    layerMapRef.current[bId] = layer;

    layer.on({
      mouseover(e) {
        // ✅ isMobileRef.current 사용 — 스테이트 클로저 문제 없음
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
        // ✅ 활성 레이어는 mouseout으로 스타일 리셋하지 않음
        //    모바일 터치 시 click 전 mouseout이 발생해도 active 레이어 보호
        if (activeLayerRef.current === layer) return;
        const isFav = favoriteIdsRef.current.has(bId);
        layer.setStyle(baseStyle(isFav));
        setTooltip((prev) => ({ ...prev, visible: false }));
      },
      click() {
        if (activeBuildingIdRef.current === bId) {
          handleClosePanel();
          return;
        }
        if (activeLayerRef.current && activeLayerRef.current !== layer) {
          const prevId = activeBuildingIdRef.current;
          activeLayerRef.current.setStyle(
            baseStyle(favoriteIdsRef.current.has(prevId)),
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
    // 기존 active layer 원복
    if (activeLayerRef.current && activeBuildingIdRef.current !== id) {
      activeLayerRef.current.setStyle(
        baseStyle(favoriteIdsRef.current.has(activeBuildingIdRef.current)),
      );
    }
    // layer 하이라이트 + 줌
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
        const prevId = activeBuildingIdRef.current;
        activeLayerRef.current.setStyle(
          baseStyle(favoriteIdsRef.current.has(prevId)),
        );
        activeLayerRef.current = null;
        activeBuildingIdRef.current = null;
      }
    }, 280);
  }

  function renderFilterPanel() {
    if (!isMobile) {
      return (
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
            borderWidth: 1,
            borderStyle: "solid",
            borderColor: "#e5e7eb",
            minWidth: 160,
          }}
        >
          {facilityTypes.map((ft, i) => (
            <label
              key={ft.code}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 7,
                cursor: "pointer",
                marginBottom: i < facilityTypes.length - 1 ? 6 : 0,
              }}
            >
              <input
                type="checkbox"
                checked={activeTypes[ft.code] ?? false}
                onChange={() =>
                  setActiveTypes((prev) => ({
                    ...prev,
                    [ft.code]: !prev[ft.code],
                  }))
                }
                style={{
                  accentColor: getFacilityColor(ft.code, i),
                  width: 14,
                  height: 14,
                }}
              />
              <span style={{ fontSize: 14 }}>{ft.icon}</span>
              <span style={{ fontSize: 12, color: "#333" }}>
                {getFacilityLabel(ft)}
              </span>
            </label>
          ))}
        </div>
      );
    }

    // 모바일: 토글 버튼 + 가로 스크롤 칩
    return (
      <div
        style={{
          position: "absolute",
          bottom: 24,
          left: 0,
          right: 0,
          zIndex: 1000,
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          gap: 8,
          paddingLeft: 16,
        }}
      >
        {showFilter && (
          <div
            style={{
              display: "flex",
              gap: 8,
              overflowX: "auto",
              paddingRight: 16,
              paddingBottom: 2,
              msOverflowStyle: "none",
              scrollbarWidth: "none",
            }}
          >
            {facilityTypes.map((ft, i) => {
              const active = activeTypes[ft.code] ?? false;
              const color = getFacilityColor(ft.code, i);
              return (
                <button
                  key={ft.code}
                  onClick={() =>
                    setActiveTypes((prev) => ({
                      ...prev,
                      [ft.code]: !prev[ft.code],
                    }))
                  }
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 5,
                    padding: "7px 12px",
                    borderRadius: 20,
                    borderWidth: "1.5px",
                    borderStyle: "solid",
                    borderColor: active ? color : "#ddd",
                    background: active ? color : "#fff",
                    color: active ? "#fff" : "#555",
                    fontSize: 12,
                    fontWeight: active ? 600 : 400,
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                    boxShadow: "0 1px 4px rgba(0,0,0,0.1)",
                    transition: "all 0.15s",
                  }}
                >
                  <span>{ft.icon}</span>
                  <span>{getFacilityLabel(ft)}</span>
                </button>
              );
            })}
          </div>
        )}
        <button
          onClick={() => setShowFilter((v) => !v)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "8px 14px",
            borderRadius: 20,
            borderWidth: 1,
            borderStyle: "solid",
            borderColor: "#ddd",
            background: showFilter ? "#2563EB" : "#fff",
            color: showFilter ? "#fff" : "#333",
            fontSize: 13,
            fontWeight: 500,
            cursor: "pointer",
            boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
            transition: "all 0.15s",
          }}
        >
          <span>🔍</span>
          <span>{t("filterTitle")}</span>
          <span style={{ fontSize: 10 }}>{showFilter ? "▲" : "▼"}</span>
        </button>
      </div>
    );
  }

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
              borderWidth: 3,
              borderStyle: "solid",
              borderColor: "#e5e7eb",
              borderTopColor: "#2563EB",
              borderRadius: "50%",
              animation: "spin 0.8s linear infinite",
            }}
          />
          <div style={{ fontSize: 14, color: "#555" }}>{t("loadingMap")}</div>
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
        zoomControl={false}
      >
        <ZoomControl position="bottomright" />
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
        {SUBWAY_STATIONS.map((s) => {
          const displayName =
            lang === "ko" ? s.name : lang === "en" ? s.name_en : s.name_zh;
          return (
            <Marker
              key={s.name}
              position={[s.lat, s.lng]}
              icon={subwayIcon(displayName)}
              zIndexOffset={1000}
              eventHandlers={{
                click() {
                  setSelectedBuilding({ id: s.id, name: displayName });
                },
              }}
            />
          );
        })}
      </MapContainer>

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

      {/* 즐겨찾기 패널 — 모바일: top:64로 검색창과 안 겹치게 */}
      {showFavorites && (
        <div
          style={{
            position: "absolute",
            top: isMobile ? 64 : 60,
            left: 16,
            zIndex: 1001,
            background: "#fff",
            borderRadius: 10,
            boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
            borderWidth: 1,
            borderStyle: "solid",
            borderColor: "#e5e7eb",
            width: isMobile ? "calc(100vw - 32px)" : 220,
            maxHeight: isMobile ? 200 : 320,
            overflowY: "auto",
          }}
        >
          <div
            style={{
              padding: "12px 14px",
              borderBottomWidth: 1,
              borderBottomStyle: "solid",
              borderBottomColor: "#f0f0f0",
              fontSize: 13,
              fontWeight: 600,
              color: "#111",
            }}
          >
            {t("favorites")}
            {favoritesList.length > 0 ? ` (${favoritesList.length})` : ""}
          </div>
          {favoritesList.length === 0 ? (
            <div
              style={{
                padding: "20px 14px",
                fontSize: 13,
                color: "#aaa",
                textAlign: "center",
              }}
            >
              {t("noFavorites")}
            </div>
          ) : (
            favoritesList.map((fav) => (
              <div
                key={fav.id}
                onClick={() => {
                  handleSelectById(fav.id, fav.name);
                  setShowFavorites(false);
                }}
                style={{
                  padding: "10px 14px",
                  fontSize: 13,
                  color: "#333",
                  cursor: "pointer",
                  borderBottomWidth: 1,
                  borderBottomStyle: "solid",
                  borderBottomColor: "#f5f5f5",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.background = "#f9f9f9")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.background = "#fff")
                }
              >
                <span>⭐</span>
                <span style={{ flex: 1 }}>{fav.name}</span>
              </div>
            ))
          )}
        </div>
      )}

      {/* 언어 버튼 — 모바일: 우상단 가로 / 데스크탑: 좌측 세로 */}
      <div
        style={{
          position: "absolute",
          ...(isMobile ? { top: 16, right: 16 } : { top: 60, left: 16 }),
          zIndex: 1000,
          background: "#fff",
          borderWidth: 1,
          borderStyle: "solid",
          borderColor: "#ddd",
          borderRadius: 8,
          boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
          overflow: "hidden",
          display: "flex",
          flexDirection: isMobile ? "row" : "column",
        }}
      >
        {LANG_BUTTONS.map((l, i) => (
          <button
            key={l.code}
            onClick={() => setLang(l.code)}
            title={l.title}
            style={{
              width: 36,
              height: isMobile ? 36 : 30,
              borderWidth: 0,
              borderStyle: "solid",
              borderColor: "#eee",
              // shorthand 충돌 방지: 구분선만 개별 속성으로
              ...(isMobile
                ? { borderLeftWidth: i > 0 ? 1 : 0 }
                : { borderTopWidth: i > 0 ? 1 : 0 }),
              background: lang === l.code ? "#2563EB" : "#fff",
              color: lang === l.code ? "#fff" : "#555",
              fontSize: 12,
              fontWeight: lang === l.code ? 700 : 400,
              cursor: "pointer",
              transition: "background 0.15s",
            }}
          >
            {l.label}
          </button>
        ))}
      </div>

      {/* 시설 필터 */}
      {renderFilterPanel()}

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
