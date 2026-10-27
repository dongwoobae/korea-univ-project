"use client";

import { List, X } from "lucide-react";
import { useLanguage } from "@/lib/LanguageContext";
import { FacilityTypeIcon, LandmarkEmoji } from "./iconography";
import { MENU_PANEL_ID } from "./mapMenu";

export interface MapBrowseItem {
  key: string;
  kind: "facility" | "landmark";
  /** facility 전용. landmark는 icon을 쓴다. */
  code: string | null;
  /** landmark 전용. facility는 code로 아이콘을 고른다. */
  icon: string | null;
  name: string;
  detail: string;
  lat: number;
  lng: number;
}

interface MapBrowsePanelProps {
  items: MapBrowseItem[];
  onSelect: (item: MapBrowseItem) => void;
  onClose: () => void;
}

/** 목록 패널 내용. 펼친 모습(왼쪽 아래 버튼 위)과 메뉴 패널이 같이 쓴다 */
export function MapBrowsePanel({
  items,
  onSelect,
  onClose,
}: MapBrowsePanelProps) {
  const { t } = useLanguage();

  return (
    <section
      className="ku-map-browse-panel"
      id={MENU_PANEL_ID.browse}
      aria-labelledby="map-browse-title"
    >
      <div className="ku-map-browse-heading">
        <div>
          <h2 id="map-browse-title">{t("mapBrowseTitle")}</h2>
          <p>{t("mapBrowseDescription")}</p>
        </div>
        <button
          type="button"
          aria-label={t("closeMapBrowse")}
          onClick={onClose}
        >
          <X size={17} aria-hidden="true" />
        </button>
      </div>

      {items.length === 0 ? (
        <p className="ku-map-browse-empty">{t("mapBrowseEmpty")}</p>
      ) : (
        <ul className="ku-map-browse-list">
          {items.map((item) => (
            <li key={item.key}>
              <button type="button" onClick={() => onSelect(item)}>
                <span className="ku-map-browse-icon">
                  {item.kind === "landmark" ? (
                    <LandmarkEmoji icon={item.icon} size={16} />
                  ) : (
                    <FacilityTypeIcon code={item.code} size={16} />
                  )}
                </span>
                <span className="ku-map-browse-copy">
                  <strong>{item.name}</strong>
                  <span>{item.detail}</span>
                </span>
                <span className="ku-map-browse-move">{t("showOnMap")}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** 펼친 모습의 왼쪽 아래 "현재 지도 목록". 접힌 줄·모바일에는 없다(멘토링 설계 6.2·6.3) */
export default function MapBrowseList({
  items,
  open,
  onToggle,
  onClose,
  onSelect,
  isFront,
  onActivate,
  triggerRef,
}: MapBrowsePanelProps & {
  open: boolean;
  onToggle: () => void;
  isFront: boolean;
  onActivate: () => void;
  triggerRef: (element: HTMLElement | null) => void;
}) {
  const { t } = useLanguage();

  return (
    <div
      className="ku-map-browse"
      data-open={open}
      data-front={isFront}
      onPointerDownCapture={onActivate}
      onFocusCapture={onActivate}
    >
      <button
        ref={triggerRef}
        className="ku-map-browse-trigger"
        type="button"
        aria-expanded={open}
        aria-controls={MENU_PANEL_ID.browse}
        onClick={() => {
          onActivate();
          onToggle();
        }}
      >
        <List size={16} aria-hidden="true" />
        <span>{t("mapBrowse")}</span>
        <strong>{items.length}</strong>
      </button>

      {open && (
        <MapBrowsePanel items={items} onSelect={onSelect} onClose={onClose} />
      )}
    </div>
  );
}
