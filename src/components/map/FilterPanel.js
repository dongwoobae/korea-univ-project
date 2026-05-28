"use client";
import { useState } from "react";
import { useLanguage } from "@/lib/LanguageContext";
import { getFacilityColor } from "./facilityColors";

export default function FilterPanel({ isMobile, facilityTypes, activeTypes, setActiveTypes }) {
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
