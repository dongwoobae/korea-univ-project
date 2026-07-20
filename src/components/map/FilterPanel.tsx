"use client";
import { useState } from "react";
import { useLanguage } from "@/lib/LanguageContext";
import { getFacilityColor } from "./facilityColors";

const CAMPUS_LIST = [
  {
    campus: "인문사회계",
    label: "인문·사회계",
    label_en: "Humanities & Social Sciences",
    label_zh: "人文社科",
    color: "#2563EB",
    lightBg: false,
  },
  {
    campus: "자연계",
    label: "자연계",
    label_en: "Natural Sciences",
    label_zh: "自然科学",
    color: "#DC143C",
    lightBg: false,
  },
  {
    campus: "녹지캠퍼스",
    label: "녹지캠퍼스",
    label_en: "Green Campus",
    label_zh: "绿地校区",
    color: "#86EFAC",
    lightBg: true,
  },
  {
    campus: "의료원",
    label: "의료원",
    label_en: "Medical Center",
    label_zh: "医疗院",
    color: "#F9A8D4",
    lightBg: true,
  },
];

function getCampusLabel(c, lang) {
  if (lang === "en") return c.label_en;
  if (lang === "zh") return c.label_zh;
  return c.label;
}

function getFacilityLabel(ft, lang) {
  if (lang === "en") return ft.label_en ?? ft.label;
  if (lang === "zh") return ft.label_zh ?? ft.label;
  return ft.label;
}

function Chip({ active, color, activeTextColor = "#fff", onClick, children }) {
  return (
    <button
      onClick={onClick}
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
        color: active ? activeTextColor : "#555",
        fontSize: 12,
        fontWeight: active ? 600 : 400,
        cursor: "pointer",
        whiteSpace: "nowrap",
        boxShadow: "0 1px 4px rgba(0,0,0,0.1)",
        transition: "all 0.15s",
      }}
    >
      {children}
    </button>
  );
}

function MobileFilterSheet({
  facilityTypes,
  activeTypes,
  setActiveTypes,
  activeCampuses,
  setActiveCampuses,
  showLandmarks,
  setShowLandmarks,
  onClose,
}) {
  const { lang, t } = useLanguage();
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 1200,
        background: "#fff",
        borderRadius: "16px 16px 0 0",
        boxShadow: "0 -4px 20px rgba(0,0,0,0.18)",
        maxHeight: "45vh",
        display: "flex",
        flexDirection: "column",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
    >
      <div style={{ padding: "10px 16px 0", flexShrink: 0 }}>
        <div
          style={{
            width: 36,
            height: 4,
            borderRadius: 2,
            background: "#e5e7eb",
            margin: "0 auto 10px",
          }}
        />
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 4,
          }}
        >
          <span style={{ fontSize: 14, fontWeight: 600, color: "#111" }}>
            {t("filterTitle")}
          </span>
          <button
            onClick={onClose}
            aria-label="닫기"
            style={{
              border: "none",
              background: "none",
              fontSize: 18,
              color: "#888",
              cursor: "pointer",
              padding: 4,
              lineHeight: 1,
            }}
          >
            ✕
          </button>
        </div>
      </div>
      <div style={{ overflowY: "auto", padding: "8px 16px 16px" }}>
        <div
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: "#888",
            marginBottom: 8,
          }}
        >
          {t("campusTitle")}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {CAMPUS_LIST.map((c) => {
            const active = activeCampuses?.[c.campus] ?? false;
            return (
              <Chip
                key={c.campus}
                active={active}
                color={c.color}
                activeTextColor={c.lightBg ? "#333" : "#fff"}
                onClick={() =>
                  setActiveCampuses((prev) => ({
                    ...prev,
                    [c.campus]: !prev[c.campus],
                  }))
                }
              >
                {getCampusLabel(c, lang)}
              </Chip>
            );
          })}
        </div>
        <div style={{ borderTop: "1px solid #e5e7eb", margin: "14px 0" }} />
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <Chip
            active={showLandmarks}
            color="#F4B942"
            activeTextColor="#333"
            onClick={() => setShowLandmarks((v) => !v)}
          >
            <span>✨</span>
            <span>
              {lang === "en" ? "Landmarks" : lang === "zh" ? "景点" : "명소"}
            </span>
          </Chip>
        </div>
        <div style={{ borderTop: "1px solid #e5e7eb", margin: "14px 0" }} />
        <div
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: "#888",
            marginBottom: 8,
          }}
        >
          {t("facilitySection")}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {facilityTypes.map((ft, i) => {
            const active = activeTypes[ft.code] ?? false;
            return (
              <Chip
                key={ft.code}
                active={active}
                color={getFacilityColor(ft.code, i)}
                onClick={() =>
                  setActiveTypes((prev) => ({
                    ...prev,
                    [ft.code]: !prev[ft.code],
                  }))
                }
              >
                <span>{ft.icon}</span>
                <span>{getFacilityLabel(ft, lang)}</span>
              </Chip>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function FilterPanel({
  isMobile,
  facilityTypes,
  activeTypes,
  setActiveTypes,
  showSlope,
  setShowSlope,
  activeCampuses,
  setActiveCampuses,
  showLandmarks,
  setShowLandmarks,
}) {
  const [showFilter, setShowFilter] = useState(false);
  const { lang, t } = useLanguage();

  if (!isMobile) {
    return (
      <div
        style={{
          position: "absolute",
          bottom: "calc(24px + env(safe-area-inset-bottom, 0px))",
          left: 16,
          zIndex: 1000,
          background: "#fff",
          borderRadius: 10,
          padding: "14px 17px",
          boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
          borderWidth: 1,
          borderStyle: "solid",
          borderColor: "#e5e7eb",
          minWidth: 192,
        }}
      >
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            width: "100%",
            marginBottom: 12,
            cursor: "pointer",
          }}
        >
          <input
            type="checkbox"
            checked={showSlope}
            onChange={() => setShowSlope((v) => !v)}
            style={{ accentColor: "#2563EB", width: 17, height: 17 }}
          />
          <span style={{ fontSize: 17 }}>📐</span>
          <span style={{ fontSize: 14, color: "#333", fontWeight: 500 }}>
            {t("slopeToggle")}
          </span>
        </label>
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            width: "100%",
            marginBottom: 12,
            cursor: "pointer",
          }}
        >
          <input
            type="checkbox"
            checked={showLandmarks}
            onChange={() => setShowLandmarks((v) => !v)}
            style={{ accentColor: "#F4B942", width: 17, height: 17 }}
          />
          <span style={{ fontSize: 17 }}>✨</span>
          <span style={{ fontSize: 14, color: "#333", fontWeight: 500 }}>
            {lang === "en" ? "Landmarks" : lang === "zh" ? "景点" : "명소"}
          </span>
        </label>
        <div style={{ borderTop: "1px solid #e5e7eb", marginBottom: 12 }} />
        <div
          style={{
            fontSize: 13,
            color: "#888",
            fontWeight: 600,
            marginBottom: 7,
          }}
        >
          {t("campusTitle")}
        </div>
        {CAMPUS_LIST.map((c) => (
          <label
            key={c.campus}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              cursor: "pointer",
              marginBottom: 7,
            }}
          >
            <input
              type="checkbox"
              checked={activeCampuses?.[c.campus] ?? false}
              onChange={() =>
                setActiveCampuses((prev) => ({
                  ...prev,
                  [c.campus]: !prev[c.campus],
                }))
              }
              style={{ accentColor: c.color, width: 17, height: 17 }}
            />
            <span
              style={{
                width: 12,
                height: 12,
                borderRadius: 2,
                background: c.color,
                display: "inline-block",
                flexShrink: 0,
              }}
            />
            <span style={{ fontSize: 14, color: "#333" }}>
              {getCampusLabel(c, lang)}
            </span>
          </label>
        ))}
        <div
          style={{
            borderTop: "1px solid #e5e7eb",
            marginBottom: 12,
            marginTop: 4,
          }}
        />
        {facilityTypes.map((ft, i) => (
          <label
            key={ft.code}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              cursor: "pointer",
              marginBottom: i < facilityTypes.length - 1 ? 7 : 0,
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
                width: 17,
                height: 17,
              }}
            />
            <span style={{ fontSize: 17 }}>{ft.icon}</span>
            <span style={{ fontSize: 14, color: "#333" }}>
              {getFacilityLabel(ft, lang)}
            </span>
          </label>
        ))}
      </div>
    );
  }

  return (
    <>
      <div
        style={{
          position: "absolute",
          bottom: "calc(24px + env(safe-area-inset-bottom, 0px))",
          left: 0,
          right: 0,
          zIndex: 1000,
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          gap: 8,
          paddingLeft: 16,
          pointerEvents: "none",
        }}
      >
        <button
          onClick={() => setShowSlope((v) => !v)}
          title={showSlope ? "경사도 숨기기" : "경사도 표시"}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            padding: "8px 14px",
            borderRadius: 20,
            borderWidth: 1,
            borderStyle: "solid",
            borderColor: showSlope ? "#2563EB" : "#ddd",
            background: showSlope ? "#2563EB" : "#fff",
            color: showSlope ? "#fff" : "#333",
            fontSize: 13,
            fontWeight: 500,
            cursor: "pointer",
            boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
            transition: "all 0.15s",
            whiteSpace: "nowrap",
            pointerEvents: "auto",
          }}
        >
          📐 {t("slopeToggle")}
        </button>
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
            pointerEvents: "auto",
          }}
        >
          <span>🔍</span>
          <span>{t("filterTitle")}</span>
          <span style={{ fontSize: 10 }}>{showFilter ? "▲" : "▼"}</span>
        </button>
      </div>
      {showFilter && (
        <MobileFilterSheet
          facilityTypes={facilityTypes}
          activeTypes={activeTypes}
          setActiveTypes={setActiveTypes}
          activeCampuses={activeCampuses}
          setActiveCampuses={setActiveCampuses}
          showLandmarks={showLandmarks}
          setShowLandmarks={setShowLandmarks}
          onClose={() => setShowFilter(false)}
        />
      )}
    </>
  );
}
