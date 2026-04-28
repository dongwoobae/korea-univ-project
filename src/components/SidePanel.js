"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function SidePanel({ buildingId, buildingName, onClose }) {
  const [facilities, setFacilities] = useState([]);
  const [building, setBuilding] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!buildingId) return;
    setLoading(true);

    async function fetchData() {
      const [{ data: buildingData }, { data: facilitiesData }] =
        await Promise.all([
          supabase.from("buildings").select("*").eq("id", buildingId).single(),
          supabase
            .from("building_facilities")
            .select("*, facility_types(label, icon)")
            .eq("building_id", buildingId),
        ]);
      setBuilding(buildingData);
      setFacilities(facilitiesData ?? []);
      setLoading(false);
    }

    fetchData();
  }, [buildingId]);

  return (
    <div
      style={{
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
      }}
    >
      <div
        style={{
          padding: "16px",
          borderBottom: "1px solid #f0f0f0",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
        }}
      >
        <div>
          <div style={{ fontSize: 16, fontWeight: 600, color: "#111" }}>
            {buildingName}
          </div>
          {building && (
            <div style={{ fontSize: 12, color: "#888", marginTop: 3 }}>
              {building.name_en}
            </div>
          )}
        </div>
        <button
          onClick={onClose}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            fontSize: 18,
            color: "#888",
          }}
        >
          ✕
        </button>
      </div>

      {building?.photo_url ? (
        <img
          src={building.photo_url}
          alt={buildingName}
          style={{ width: "100%", height: 180, objectFit: "cover" }}
        />
      ) : (
        <div
          style={{
            width: "100%",
            height: 180,
            background: "#f5f5f5",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#aaa",
            fontSize: 13,
          }}
        >
          사진 없음
        </div>
      )}

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
            불러오는 중...
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
            등록된 접근성 정보가 없어요
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
              시설 현황
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
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: "#222" }}>
                    {f.name ?? f.facility_types?.label}
                  </div>
                  {f.description && (
                    <div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>
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
                    background: f.is_installed ? "#EAF3DE" : "#FCEBEB",
                    color: f.is_installed ? "#3B6D11" : "#A32D2D",
                  }}
                >
                  {f.is_installed ? "설치" : "미설치"}
                </span>
              </div>
            ))}
          </>
        )}
        {building?.last_updated && (
          <div style={{ marginTop: 16, fontSize: 11, color: "#bbb" }}>
            마지막 업데이트: {building.last_updated}
          </div>
        )}
      </div>
    </div>
  );
}
