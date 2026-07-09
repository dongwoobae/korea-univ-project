"use client";

import type { LangCode } from "@/lib/translations";
import type { FacilityWithType } from "@/types/domain";

interface FacilityListProps {
  loading: boolean;
  facilities: FacilityWithType[];
  lang: LangCode;
  getFacilityLabel: (facilityTypes: FacilityWithType["facility_types"]) => string;
  lastUpdated: string | null | undefined;
  t: (key: string) => string;
}

export default function FacilityList({
  loading,
  facilities,
  lang,
  getFacilityLabel,
  lastUpdated,
  t,
}: FacilityListProps) {
  return (
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
                padding: "10px 0",
                borderBottom: "1px solid #f5f5f5",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
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
                  <div style={{ fontSize: 13, fontWeight: 500, color: "#222" }}>
                    {lang === "ko"
                      ? (f.name ?? getFacilityLabel(f.facility_types))
                      : (f[`name_${lang}`] ?? f.name ?? getFacilityLabel(f.facility_types))}
                  </div>
                  {f.description && (
                    <div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>
                      {lang === "ko" ? f.description : (f[`description_${lang}`] ?? f.description)}
                    </div>
                  )}
                  {f.floor_info && (
                    <div style={{ fontSize: 12, color: "#888" }}>
                      {lang === "ko" ? f.floor_info : (f[`floor_info_${lang}`] ?? f.floor_info)}
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
              {f.video_url && (
                <div style={{ marginTop: 8 }}>
                  <video
                    src={f.video_url}
                    controls
                    playsInline
                    style={{
                      width: "100%",
                      borderRadius: 6,
                      background: "#000",
                      maxHeight: 180,
                    }}
                  />
                  {f.video_caption && (
                    <div style={{ fontSize: 12, color: "#555", marginTop: 4 }}>
                      {lang === "ko"
                        ? f.video_caption
                        : (f[`video_caption_${lang}`] ?? f.video_caption)}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </>
      )}
      {lastUpdated && (
        <div style={{ marginTop: 16, fontSize: 11, color: "#bbb" }}>
          {t("lastUpdated")} {lastUpdated}
        </div>
      )}
    </div>
  );
}
