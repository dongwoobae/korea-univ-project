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
    <div className="ku-side-content">
      {loading ? (
        <div className="ku-favorites-empty">{t("loading")}</div>
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
                  : (facility[`name_${lang}`] ?? facility.name ?? getFacilityLabel(facility.facility_types));
              const location =
                lang === "ko"
                  ? facility.floor_info
                  : (facility[`floor_info_${lang}`] ?? facility.floor_info);
              return (
                <div className="ku-facility-row" key={facility.id}>
                  <div className="ku-facility-main">
                    <div className="ku-facility-icon" role="img" aria-label={getFacilityLabel(facility.facility_types)}>
                      {facility.facility_types?.icon}
                    </div>
                    <div className="ku-facility-copy">
                      <div className="ku-facility-name">{name}</div>
                      {location && <div className="ku-facility-location">{location}</div>}
                    </div>
                    <span className="ku-status" data-installed={facility.is_installed}>
                      {facility.is_installed ? t("installed") : t("notInstalled")}
                    </span>
                  </div>
                  {facility.video_url && (
                    <video src={facility.video_url} controls playsInline style={{ width: "100%", maxHeight: 180, marginTop: 10, borderRadius: 8, background: "#000" }} />
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
      {lastUpdated && <div className="ku-last-updated">{t("lastUpdated")} {lastUpdated}</div>}
    </div>
  );
}
