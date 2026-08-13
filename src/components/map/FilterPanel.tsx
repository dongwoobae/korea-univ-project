"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { ChevronDown, ChevronUp, Mountain } from "lucide-react";
import { useLanguage } from "@/lib/LanguageContext";
import { campusColor } from "@/lib/theme";
import { getFacilityColor } from "./facilityColors";
import { FacilityTypeIcon, LandmarkIcon } from "./iconography";
import SlopeLegend from "./SlopeLegend";

const CAMPUS_LIST = [
  {
    campus: "인문사회계",
    label: "인문·사회계",
    label_en: "Humanities",
    label_zh: "人文社科",
  },
  {
    campus: "자연계",
    label: "자연계",
    label_en: "Natural Sciences",
    label_zh: "自然科学",
  },
  {
    campus: "녹지캠퍼스",
    label: "녹지캠퍼스",
    label_en: "Green Campus",
    label_zh: "绿地校区",
  },
  {
    campus: "의료원",
    label: "의료원",
    label_en: "Medical Center",
    label_zh: "医疗院",
  },
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
  isFront,
  onActivate,
}) {
  const [campusSectionOpen, setCampusSectionOpen] = useState(false);
  const [facilitySectionOpen, setFacilitySectionOpen] = useState(false);
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);
  const { lang, t } = useLanguage();

  useEffect(() => {
    onOpenChange?.(mobileFilterOpen);
  }, [mobileFilterOpen, onOpenChange]);

  const activeCampusCount =
    Object.values(activeCampuses).filter(Boolean).length;
  const activeFacilityCount = Object.values(activeTypes).filter(Boolean).length;
  // 배지는 "기본값에서 벗어난 조건" 수. 명소 표시는 기본값이 true이므로
  // 숨겼을 때만(!showLandmarks) 활성 필터로 센다. 이렇게 하면 첫 로드 배지가 0이다.
  const totalActive =
    activeCampusCount +
    activeFacilityCount +
    Number(showSlope) +
    Number(!showLandmarks);

  const content = (
    <>
      <section className="ku-filter-section">
        <button
          className="ku-filter-heading"
          type="button"
          onClick={() => setCampusSectionOpen((open) => !open)}
          aria-expanded={campusSectionOpen}
        >
          <span>{t("campusTitle")}</span>
          <span className="ku-filter-chevron">
            {campusSectionOpen ? (
              <ChevronUp size={14} aria-hidden="true" />
            ) : (
              <ChevronDown size={14} aria-hidden="true" />
            )}
          </span>
        </button>
        {campusSectionOpen && (
          <div className="ku-chip-group">
            {CAMPUS_LIST.map((item) => {
              const active = activeCampuses[item.campus] ?? false;
              const itemColor = campusColor[item.campus];
              return (
                <Chip
                  key={item.campus}
                  active={active}
                  color={itemColor}
                  onClick={() =>
                    setActiveCampuses((previous) => ({
                      ...previous,
                      [item.campus]: !previous[item.campus],
                    }))
                  }
                >
                  <span
                    className="ku-chip-dot"
                    style={{ "--chip-color": itemColor } as CSSProperties}
                  />
                  {campusLabel(item, lang)}
                </Chip>
              );
            })}
          </div>
        )}
      </section>

      <section className="ku-filter-section">
        <button
          className="ku-filter-heading"
          type="button"
          onClick={() => setFacilitySectionOpen((open) => !open)}
          aria-expanded={facilitySectionOpen}
        >
          <span>{t("facilitySection")}</span>
          <span className="ku-filter-chevron">
            {facilitySectionOpen ? (
              <ChevronUp size={14} aria-hidden="true" />
            ) : (
              <ChevronDown size={14} aria-hidden="true" />
            )}
          </span>
        </button>
        {facilitySectionOpen && (
          <div className="ku-chip-group">
            {facilityTypes.map((item, index) => {
              const active = activeTypes[item.code] ?? false;
              const itemColor = getFacilityColor(item.code, index);
              return (
                <Chip
                  key={item.code}
                  active={active}
                  color={itemColor}
                  onClick={() =>
                    setActiveTypes((previous) => ({
                      ...previous,
                      [item.code]: !previous[item.code],
                    }))
                  }
                >
                  <FacilityTypeIcon code={item.code} size={15} />
                  {facilityLabel(item, lang)}
                </Chip>
              );
            })}
          </div>
        )}
      </section>

      <section className="ku-filter-section ku-filter-checks">
        <label className="ku-filter-check">
          <input
            type="checkbox"
            checked={showSlope}
            onChange={() => setShowSlope((show) => !show)}
          />
          <Mountain size={15} aria-hidden="true" />
          <span>{t("slopeToggle")}</span>
        </label>
        <label className="ku-filter-check">
          <input
            type="checkbox"
            checked={showLandmarks}
            onChange={() => setShowLandmarks((show) => !show)}
          />
          <LandmarkIcon size={15} />
          <span>{t("landmarkToggle")}</span>
        </label>
        <SlopeLegend show={showSlope} />
      </section>
    </>
  );

  return (
    <div
      className="ku-filter-panel"
      data-front={isFront}
      onPointerDownCapture={onActivate}
      onFocusCapture={onActivate}
      onDoubleClickCapture={(event) => event.stopPropagation()}
    >
      {isMobile ? (
        <>
          <button
            className="ku-mobile-filter-trigger"
            type="button"
            onClick={() => {
              onActivate();
              setMobileFilterOpen((open) => !open);
            }}
            aria-expanded={mobileFilterOpen}
          >
            <span>{t("filterTitle")}</span>
            <span className="ku-mobile-filter-badge">{totalActive}</span>
            {mobileFilterOpen ? (
              <ChevronUp size={14} aria-hidden="true" />
            ) : (
              <ChevronDown size={14} aria-hidden="true" />
            )}
          </button>
          {mobileFilterOpen && (
            <div className="ku-mobile-filter-content">{content}</div>
          )}
        </>
      ) : (
        content
      )}
    </div>
  );
}
