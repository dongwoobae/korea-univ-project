"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { useLanguage } from "@/lib/LanguageContext";
import { campusColor } from "@/lib/theme";
import { getFacilityColor } from "./facilityColors";
import SlopeLegend from "./SlopeLegend";

const CAMPUS_LIST = [
  { campus: "인문사회계", label: "인문·사회계", label_en: "Humanities", label_zh: "人文社科" },
  { campus: "자연계", label: "자연계", label_en: "Natural Sciences", label_zh: "自然科学" },
  { campus: "녹지캠퍼스", label: "녹지캠퍼스", label_en: "Green Campus", label_zh: "绿地校区" },
  { campus: "의료원", label: "의료원", label_en: "Medical Center", label_zh: "医疗院" },
];

function campusLabel(item, lang) {
  if (lang === "en") return item.label_en;
  if (lang === "zh") return item.label_zh;
  return item.label;
}

function facilityLabel(item, lang) {
  if (lang === "en") return item.label_en ?? item.label;
  if (lang === "zh") return item.label_zh ?? item.label;
  return item.label;
}

function Chip({ active, color, onClick, children }) {
  return (
    <button
      className="ku-chip"
      type="button"
      data-active={active}
      onClick={onClick}
      style={{ "--chip-color": color } as CSSProperties}
    >
      {children}
    </button>
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
  onOpenChange,
}) {
  const [campusSectionOpen, setCampusSectionOpen] = useState(true);
  const [facilitySectionOpen, setFacilitySectionOpen] = useState(false);
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);
  const { lang, t } = useLanguage();

  useEffect(() => {
    onOpenChange?.(mobileFilterOpen);
  }, [mobileFilterOpen, onOpenChange]);

  const activeCampusCount = Object.values(activeCampuses).filter(Boolean).length;
  const activeFacilityCount = Object.values(activeTypes).filter(Boolean).length;
  const totalActive = activeCampusCount + activeFacilityCount + Number(showSlope) + Number(showLandmarks);

  const content = (
    <>
      <section className="ku-filter-section">
        <button className="ku-filter-heading" type="button" onClick={() => setCampusSectionOpen((open) => !open)} aria-expanded={campusSectionOpen}>
          <span>{t("campusTitle")} <span className="ku-filter-count">{activeCampusCount}</span></span>
          <span className="ku-filter-chevron">{campusSectionOpen ? "▲" : "▼"}</span>
        </button>
        {campusSectionOpen && (
          <div className="ku-chip-group">
            {CAMPUS_LIST.map((item) => {
              const active = activeCampuses[item.campus] ?? false;
              const itemColor = campusColor[item.campus];
              return (
                <Chip key={item.campus} active={active} color={itemColor} onClick={() => setActiveCampuses((previous) => ({ ...previous, [item.campus]: !previous[item.campus] }))}>
                  <span className="ku-chip-dot" style={{ "--chip-color": itemColor } as CSSProperties} />
                  {campusLabel(item, lang)}
                </Chip>
              );
            })}
          </div>
        )}
      </section>

      <section className="ku-filter-section">
        <button className="ku-filter-heading" type="button" onClick={() => setFacilitySectionOpen((open) => !open)} aria-expanded={facilitySectionOpen}>
          <span>{t("facilitySection")} <span className="ku-filter-count">{activeFacilityCount}</span></span>
          <span className="ku-filter-chevron">{facilitySectionOpen ? "▲" : "▼"}</span>
        </button>
        {facilitySectionOpen && (
          <div className="ku-chip-group">
            {facilityTypes.map((item, index) => {
              const active = activeTypes[item.code] ?? false;
              const itemColor = getFacilityColor(item.code, index);
              return (
                <Chip key={item.code} active={active} color={itemColor} onClick={() => setActiveTypes((previous) => ({ ...previous, [item.code]: !previous[item.code] }))}>
                  <span role="img" aria-label={facilityLabel(item, lang)}>{item.icon}</span>
                  {facilityLabel(item, lang)}
                </Chip>
              );
            })}
          </div>
        )}
      </section>

      <section className="ku-filter-section ku-filter-checks">
        <label className="ku-filter-check">
          <input type="checkbox" checked={showSlope} onChange={() => setShowSlope((show) => !show)} />
          <span role="img" aria-label="경사도">📐</span><span>{t("slopeToggle")}</span>
        </label>
        <label className="ku-filter-check">
          <input type="checkbox" checked={showLandmarks} onChange={() => setShowLandmarks((show) => !show)} />
          <span role="img" aria-label="캠퍼스 명소">✨</span><span>{t("landmarkToggle")}</span>
        </label>
        <SlopeLegend show={showSlope} />
      </section>
    </>
  );

  return (
    <div className="ku-filter-panel">
      {isMobile ? (
        <>
          <button className="ku-mobile-filter-trigger" type="button" onClick={() => setMobileFilterOpen((open) => !open)} aria-expanded={mobileFilterOpen}>
            <span>{t("filterTitle")}</span><span className="ku-mobile-filter-badge">{totalActive}</span><span aria-hidden="true">{mobileFilterOpen ? "▲" : "▼"}</span>
          </button>
          {mobileFilterOpen && <div className="ku-mobile-filter-content">{content}</div>}
        </>
      ) : content}
    </div>
  );
}
