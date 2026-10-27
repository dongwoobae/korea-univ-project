"use client";

import {
  type CSSProperties,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import { ChevronDown, ChevronUp, Mountain } from "lucide-react";
import { useLanguage } from "@/lib/LanguageContext";
import type { LangCode } from "@/lib/translations";
import type { FacilityType } from "@/types/domain";
import { campusColor } from "@/lib/theme";
import { facilityStyleOf } from "@/lib/facilityStyleCatalog";
import { FacilityTypeIcon, LandmarkCategoryIcon } from "./iconography";
import { MENU_PANEL_ID } from "./mapMenu";

export type CampusKey = "인문사회계" | "자연계" | "녹지캠퍼스" | "의료원";

/** 캠퍼스 필터 토글 맵. 키는 CAMPUS_LIST의 campus 값과 같다. */
export type CampusFlags = Record<CampusKey, boolean>;

/** 캠퍼스·시설 절의 펼침. 패널을 닫았다 열어도 남도록 `Map`이 든다(설계 6.1) */
export type FilterSections = { campus: boolean; facility: boolean };

/** FilterPanel이 그리는 시설 유형 — 종류 저장소의 행 */
type FilterFacilityType = Pick<
  FacilityType,
  "code" | "label" | "label_en" | "label_zh" | "icon" | "color"
>;

type CampusItem = {
  campus: CampusKey;
  label: string;
  label_en: string;
  label_zh: string;
};

const CAMPUS_LIST: CampusItem[] = [
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

function campusLabel(item: CampusItem, lang: LangCode) {
  if (lang === "en") return item.label_en;
  if (lang === "zh") return item.label_zh;
  return item.label;
}

function facilityLabel(item: FilterFacilityType, lang: LangCode) {
  if (lang === "en") return item.label_en ?? item.label;
  if (lang === "zh") return item.label_zh ?? item.label;
  return item.label;
}

function Chip({
  active,
  color,
  onClick,
  children,
}: {
  active: boolean;
  color: string;
  onClick: () => void;
  children: ReactNode;
}) {
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

/** 필터 절. 바깥 카드(펼침)나 메뉴 패널(접힌 줄·모바일)은 `Map`이 씌운다 */
export default function FilterPanel({
  facilityTypes,
  activeTypes,
  setActiveTypes,
  showSlope,
  setShowSlope,
  activeCampuses,
  setActiveCampuses,
  showLandmarks,
  setShowLandmarks,
  sections,
  setSections,
}: {
  facilityTypes: FilterFacilityType[];
  activeTypes: Record<string, boolean>;
  setActiveTypes: Dispatch<SetStateAction<Record<string, boolean>>>;
  showSlope: boolean;
  setShowSlope: Dispatch<SetStateAction<boolean>>;
  activeCampuses: CampusFlags;
  setActiveCampuses: Dispatch<SetStateAction<CampusFlags>>;
  showLandmarks: boolean;
  setShowLandmarks: Dispatch<SetStateAction<boolean>>;
  sections: FilterSections;
  setSections: Dispatch<SetStateAction<FilterSections>>;
}) {
  const { lang, t } = useLanguage();
  const campusSectionOpen = sections.campus;
  const facilitySectionOpen = sections.facility;

  return (
    <div id={MENU_PANEL_ID.filter} className="ku-filter-sections">
      <section className="ku-filter-section">
        <button
          className="ku-filter-heading"
          type="button"
          onClick={() =>
            setSections((previous) => ({
              ...previous,
              campus: !previous.campus,
            }))
          }
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
          onClick={() =>
            setSections((previous) => ({
              ...previous,
              facility: !previous.facility,
            }))
          }
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
            {facilityTypes.map((item) => {
              const active = activeTypes[item.code] ?? false;
              const itemColor = facilityStyleOf(facilityTypes, item.code).color;
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
          <LandmarkCategoryIcon size={15} />
          <span>{t("landmarkToggle")}</span>
        </label>
      </section>
    </div>
  );
}
