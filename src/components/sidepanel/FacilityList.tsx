"use client";

import type { LangCode } from "@/lib/translations";
import type { FacilityWithType } from "@/types/domain";

interface FacilityListProps {
  loading: boolean;
  error?: boolean;
  onRetry?: () => void;
  facilities: FacilityWithType[];
  lang: LangCode;
  getFacilityLabel: (
    facilityTypes: FacilityWithType["facility_types"],
  ) => string;
  lastUpdated: string | null | undefined;
  t: (key: string) => string;
}

export default function FacilityList({
  loading,
  error,
  onRetry,
  facilities,
  lang,
  getFacilityLabel,
  lastUpdated,
  t,
}: FacilityListProps) {
  return (
    <div className="ku-side-content">
      {loading ? (
        <div className="ku-favorites-empty">{t("loading")}</div>
      ) : error ? (
        <div
          className="ku-facility-error"
          role="alert"
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            textAlign: "center",
            padding: "32px 20px",
            color: "#991B1B",
          }}
        >
          <p style={{ margin: 0 }}>{t("facilityLoadError")}</p>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              style={{
                marginTop: 12,
                background: "#991B1B",
                color: "#fff",
                border: "none",
                borderRadius: 8,
                padding: "8px 16px",
                fontSize: 14,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {t("errRetry")}
            </button>
          )}
        </div>
      ) : facilities.length === 0 ? (
        <div className="ku-favorites-empty">{t("noFacilityInfo")}</div>
      ) : (
        <>
          <h3 className="ku-facility-title">{t("facilitiesTitle")}</h3>
          <div className="ku-facility-list">
            {facilities.map((facility) => {
              const name =
                lang === "ko"
                  ? (facility.name ?? getFacilityLabel(facility.facility_types))
                  : (facility[`name_${lang}`] ??
                    facility.name ??
                    getFacilityLabel(facility.facility_types));
              const location =
                lang === "ko"
                  ? facility.floor_info
                  : (facility[`floor_info_${lang}`] ?? facility.floor_info);
              const videoCaption =
                lang === "ko"
                  ? facility.video_caption
                  : (facility[`video_caption_${lang}`] ??
                    facility.video_caption);
              return (
                <div className="ku-facility-row" key={facility.id}>
                  <div className="ku-facility-main">
                    <div
                      className="ku-facility-icon"
                      role="img"
                      aria-label={getFacilityLabel(facility.facility_types)}
                    >
                      {facility.facility_types?.icon}
                    </div>
                    <div className="ku-facility-copy">
                      <div className="ku-facility-name">{name}</div>
                      {location && (
                        <div className="ku-facility-location">{location}</div>
                      )}
                    </div>
                    <span
                      className="ku-status"
                      data-installed={facility.is_installed}
                    >
                      {facility.is_installed
                        ? t("installed")
                        : t("notInstalled")}
                    </span>
                  </div>
                  {facility.video_url && (
                    <figure className="ku-facility-video">
                      <video
                        src={facility.video_url}
                        controls
                        playsInline
                        aria-label={`${name} ${t("videoLabelSuffix")}`}
                        style={{
                          width: "100%",
                          maxHeight: 180,
                          borderRadius: 8,
                          background: "#000",
                        }}
                      />
                      {videoCaption && (
                        <figcaption className="ku-facility-video-caption">
                          {videoCaption}
                        </figcaption>
                      )}
                    </figure>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
      {lastUpdated && (
        <div className="ku-last-updated">
          {t("lastUpdated")} {lastUpdated}
        </div>
      )}
    </div>
  );
}
