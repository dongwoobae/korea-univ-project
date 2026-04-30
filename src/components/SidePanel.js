"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useLanguage } from "@/lib/LanguageContext";

const FAVORITES_KEY = "ku_favorites";

function loadFavorites() {
  try {
    return JSON.parse(localStorage.getItem(FAVORITES_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function saveFavorites(list) {
  localStorage.setItem(FAVORITES_KEY, JSON.stringify(list));
}

export default function SidePanel({ buildingId, buildingName, onClose }) {
  const { lang, t } = useLanguage();
  const [facilities, setFacilities] = useState([]);
  const [building, setBuilding] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isFavorite, setIsFavorite] = useState(false);
  const [isMobile, setIsMobile] = useState(
    typeof window !== "undefined" ? window.innerWidth < 768 : false,
  );
  const [visible, setVisible] = useState(false);

  // 모바일 감지
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // 슬라이드 인
  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), 10);
    return () => clearTimeout(timer);
  }, []);

  // Map.js에서 닫기 요청 시 슬라이드 아웃
  useEffect(() => {
    const handler = () => setVisible(false);
    window.addEventListener("sidePanelShouldClose", handler);
    return () => window.removeEventListener("sidePanelShouldClose", handler);
  }, []);

  // 즐겨찾기 초기 로드
  useEffect(() => {
    if (!buildingId) return;
    const favs = loadFavorites();
    setIsFavorite(favs.some((f) => f.id === buildingId));
  }, [buildingId]);

  // 데이터 fetch — label_en, label_zh 포함
  useEffect(() => {
    if (!buildingId) return;
    setLoading(true);

    async function fetchData() {
      const [{ data: buildingData }, { data: facilitiesData }] =
        await Promise.all([
          supabase.from("buildings").select("*").eq("id", buildingId).single(),
          supabase
            .from("building_facilities")
            .select("*, facility_types(label, label_en, label_zh, icon)")
            .eq("building_id", buildingId),
        ]);
      setBuilding(buildingData);
      setFacilities(facilitiesData ?? []);
      setLoading(false);
    }

    fetchData();
  }, [buildingId]);

  // 언어에 따른 건물명
  const displayName =
    lang === "ko" ? buildingName : (building?.name_en ?? buildingName);

  // 언어에 따른 시설 라벨
  function getFacilityLabel(facilityTypes) {
    if (!facilityTypes) return "";
    if (lang === "en") return facilityTypes.label_en ?? facilityTypes.label;
    if (lang === "zh") return facilityTypes.label_zh ?? facilityTypes.label;
    return facilityTypes.label;
  }

  function toggleFavorite() {
    const favs = loadFavorites();
    const isFirstTime = localStorage.getItem(FAVORITES_KEY) === null;
    const next = isFavorite
      ? favs.filter((f) => f.id !== buildingId)
      : [...favs, { id: buildingId, name: buildingName }];
    saveFavorites(next);
    window.dispatchEvent(new Event("favoritesUpdated"));
    setIsFavorite(!isFavorite);

    if (isFirstTime && !isFavorite) {
      window.dispatchEvent(
        new CustomEvent("showToast", {
          detail: { message: t("favoriteSavedMsg"), type: "info" },
        }),
      );
    }
  }

  const transition = "transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)";

  const panelStyle = isMobile
    ? {
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        width: "100%",
        height: "62vh",
        background: "#fff",
        borderRadius: "16px 16px 0 0",
        zIndex: 1000,
        overflowY: "auto",
        boxShadow: "0 -4px 20px rgba(0,0,0,0.12)",
        transform: visible ? "translateY(0)" : "translateY(100%)",
        transition,
      }
    : {
        position: "absolute",
        top: 0,
        right: 0,
        width: 320,
        height: "100%",
        background: "#fff",
        borderLeft: "1px solid #e5e7eb",
        zIndex: 1000,
        overflowY: "auto",
        boxShadow: "-4px 0 12px rgba(0,0,0,0.08)",
        transform: visible ? "translateX(0)" : "translateX(100%)",
        transition,
      };

  return (
    <>
      {/* 모바일 배경 터치 시 닫기 */}
      {isMobile && (
        <div
          onClick={onClose}
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 999,
            background: "transparent",
          }}
        />
      )}

      <div style={panelStyle}>
        {/* 모바일 드래그 핸들 */}
        {isMobile && (
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              padding: "10px 0 4px",
            }}
          >
            <div
              style={{
                width: 36,
                height: 4,
                borderRadius: 2,
                background: "#ddd",
              }}
            />
          </div>
        )}

        {/* 헤더 */}
        <div
          style={{
            padding: "14px 16px",
            borderBottom: "1px solid #f0f0f0",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 600, color: "#111" }}>
              {displayName}
            </div>
            {/* 한국어가 아닐 때는 한국어 원명을 서브텍스트로 표시 */}
            {lang !== "ko" && (
              <div style={{ fontSize: 12, color: "#888", marginTop: 3 }}>
                {buildingName}
              </div>
            )}
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              flexShrink: 0,
            }}
          >
            {/* 즐겨찾기 버튼 */}
            <button
              onClick={toggleFavorite}
              title={isFavorite ? t("removeFavorite") : t("addFavorite")}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                fontSize: 20,
                padding: "2px 6px",
                lineHeight: 1,
              }}
            >
              {isFavorite ? "⭐" : "☆"}
            </button>
            {/* 닫기 버튼 */}
            <button
              onClick={onClose}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                fontSize: 18,
                color: "#888",
                padding: "2px 6px",
              }}
            >
              ✕
            </button>
          </div>
        </div>

        {/* 사진 */}
        {building?.photo_url ? (
          <img
            src={building.photo_url}
            alt={displayName}
            style={{ width: "100%", height: 160, objectFit: "cover" }}
          />
        ) : (
          <div
            style={{
              width: "100%",
              height: 160,
              background: "#f5f5f5",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#aaa",
              fontSize: 13,
            }}
          >
            {t("noPhoto")}
          </div>
        )}

        {/* 시설 목록 */}
        <div style={{ padding: 16 }}>
          {loading ? (
            <div
              style={{
                color: "#aaa",
                fontSize: 13,
                textAlign: "center",
                paddingTop: 20,
              }}
            >
              {t("loading")}
            </div>
          ) : facilities.length === 0 ? (
            <div
              style={{
                color: "#aaa",
                fontSize: 13,
                textAlign: "center",
                paddingTop: 20,
              }}
            >
              {t("noFacilityInfo")}
            </div>
          ) : (
            <>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: "#888",
                  marginBottom: 10,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                {t("facilitiesTitle")}
              </div>
              {facilities.map((f) => (
                <div
                  key={f.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "10px 0",
                    borderBottom: "1px solid #f5f5f5",
                  }}
                >
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 8,
                      background: f.is_installed ? "#EAF3DE" : "#FCEBEB",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 16,
                      flexShrink: 0,
                    }}
                  >
                    {f.facility_types?.icon}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{ fontSize: 13, fontWeight: 500, color: "#222" }}
                    >
                      {f.name ?? getFacilityLabel(f.facility_types)}
                    </div>
                    {f.description && (
                      <div
                        style={{ fontSize: 12, color: "#888", marginTop: 2 }}
                      >
                        {f.description}
                      </div>
                    )}
                    {f.floor_info && (
                      <div style={{ fontSize: 12, color: "#888" }}>
                        {f.floor_info}
                      </div>
                    )}
                  </div>
                  <span
                    style={{
                      fontSize: 11,
                      padding: "3px 8px",
                      borderRadius: 20,
                      fontWeight: 500,
                      flexShrink: 0,
                      background: f.is_installed ? "#EAF3DE" : "#FCEBEB",
                      color: f.is_installed ? "#3B6D11" : "#A32D2D",
                    }}
                  >
                    {f.is_installed ? t("installed") : t("notInstalled")}
                  </span>
                </div>
              ))}
            </>
          )}
          {building?.last_updated && (
            <div style={{ marginTop: 16, fontSize: 11, color: "#bbb" }}>
              {t("lastUpdated")} {building.last_updated}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
