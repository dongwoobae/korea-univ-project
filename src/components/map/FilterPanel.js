"use client";
import { useState } from "react";
import { useLanguage } from "@/lib/LanguageContext";
import { getFacilityColor } from "./facilityColors";

const CAMPUS_LIST = [
  { campus: "인문사회계", label: "인문·사회계", color: "#2563EB", lightBg: false },
  { campus: "자연계", label: "자연계", color: "#DC143C", lightBg: false },
  { campus: "녹지캠퍼스", label: "녹지캠퍼스", color: "#86EFAC", lightBg: true },
  { campus: "의료원", label: "의료원", color: "#F9A8D4", lightBg: true },
];

export default function FilterPanel({ isMobile, facilityTypes, activeTypes, setActiveTypes, showSlope, setShowSlope, activeCampuses, setActiveCampuses }) {
  const [showFilter, setShowFilter] = useState(false);
  const { lang, t } = useLanguage();

  function getFacilityLabel(ft) {
    if (lang === "en") return ft.label_en ?? ft.label;
    if (lang === "zh") return ft.label_zh ?? ft.label;
    return ft.label;
  }

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
          padding: "12px 14px",
          boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
          borderWidth: 1,
          borderStyle: "solid",
          borderColor: "#e5e7eb",
          minWidth: 160,
        }}
      >
        <button
          onClick={() => setShowSlope((v) => !v)}
          title={showSlope ? "경사도 숨기기" : "경사도 표시"}
          style={{ display: "flex", alignItems: "center", gap: 4, width: "100%", marginBottom: 10, padding: "4px 0", borderRadius: 6, background: showSlope ? "#2563EB" : "transparent", border: "none", cursor: "pointer", fontSize: 12, color: showSlope ? "#fff" : "#555", fontWeight: 500, whiteSpace: "nowrap", justifyContent: "center" }}
        >
          📐 경사도
        </button>
        <div style={{ borderTop: "1px solid #e5e7eb", marginBottom: 10 }} />
        <div style={{ fontSize: 11, color: "#888", fontWeight: 600, marginBottom: 6 }}>캠퍼스</div>
        {CAMPUS_LIST.map((c) => (
          <label
            key={c.campus}
            style={{ display: "flex", alignItems: "center", gap: 7, cursor: "pointer", marginBottom: 6 }}
          >
            <input
              type="checkbox"
              checked={activeCampuses?.[c.campus] ?? false}
              onChange={() => setActiveCampuses((prev) => ({ ...prev, [c.campus]: !prev[c.campus] }))}
              style={{ accentColor: c.color, width: 14, height: 14 }}
            />
            <span style={{ width: 10, height: 10, borderRadius: 2, background: c.color, display: "inline-block", flexShrink: 0 }} />
            <span style={{ fontSize: 12, color: "#333" }}>{c.label}</span>
          </label>
        ))}
        <div style={{ borderTop: "1px solid #e5e7eb", marginBottom: 10, marginTop: 4 }} />
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
                setActiveTypes((prev) => ({ ...prev, [ft.code]: !prev[ft.code] }))
              }
              style={{
                accentColor: getFacilityColor(ft.code, i),
                width: 14,
                height: 14,
              }}
            />
            <span style={{ fontSize: 14 }}>{ft.icon}</span>
            <span style={{ fontSize: 12, color: "#333" }}>{getFacilityLabel(ft)}</span>
          </label>
        ))}
      </div>
    );
  }

  return (
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
          {CAMPUS_LIST.map((c) => {
            const active = activeCampuses?.[c.campus] ?? false;
            return (
              <button
                key={c.campus}
                onClick={() => setActiveCampuses((prev) => ({ ...prev, [c.campus]: !prev[c.campus] }))}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                  padding: "7px 12px",
                  borderRadius: 20,
                  borderWidth: "1.5px",
                  borderStyle: "solid",
                  borderColor: active ? c.color : "#ddd",
                  background: active ? c.color : "#fff",
                  color: active ? (c.lightBg ? "#333" : "#fff") : "#555",
                  fontSize: 12,
                  fontWeight: active ? 600 : 400,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                  boxShadow: "0 1px 4px rgba(0,0,0,0.1)",
                  transition: "all 0.15s",
                }}
              >
                {c.label}
              </button>
            );
          })}
          <div style={{ width: 1, background: "#e5e7eb", flexShrink: 0, margin: "4px 0" }} />
          {facilityTypes.map((ft, i) => {
            const active = activeTypes[ft.code] ?? false;
            const color = getFacilityColor(ft.code, i);
            return (
              <button
                key={ft.code}
                onClick={() =>
                  setActiveTypes((prev) => ({ ...prev, [ft.code]: !prev[ft.code] }))
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
        onClick={() => setShowSlope((v) => !v)}
        title={showSlope ? "경사도 숨기기" : "경사도 표시"}
        style={{ display: "flex", alignItems: "center", gap: 4, padding: "8px 14px", borderRadius: 20, borderWidth: 1, borderStyle: "solid", borderColor: showSlope ? "#2563EB" : "#ddd", background: showSlope ? "#2563EB" : "#fff", color: showSlope ? "#fff" : "#333", fontSize: 13, fontWeight: 500, cursor: "pointer", boxShadow: "0 2px 8px rgba(0,0,0,0.12)", transition: "all 0.15s", whiteSpace: "nowrap" }}
      >
        📐 경사도
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
        }}
      >
        <span>🔍</span>
        <span>{t("filterTitle")}</span>
        <span style={{ fontSize: 10 }}>{showFilter ? "▲" : "▼"}</span>
      </button>
    </div>
  );
}
