"use client";

import { useEffect, useRef, useState } from "react";
import { List, X } from "lucide-react";
import { useLanguage } from "@/lib/LanguageContext";
import { FacilityTypeIcon, LandmarkIcon } from "./iconography";

export interface MapBrowseItem {
  key: string;
  kind: "facility" | "landmark";
  /** kind가 facility일 때의 시설 유형 코드. landmark는 아이콘이 고정이라 쓰지 않는다. */
  code: string | null;
  name: string;
  detail: string;
  lat: number;
  lng: number;
}

interface MapBrowseListProps {
  items: MapBrowseItem[];
  onSelect: (item: MapBrowseItem) => void;
  isFront: boolean;
  onActivate: () => void;
}

export default function MapBrowseList({
  items,
  onSelect,
  isFront,
  onActivate,
}: MapBrowseListProps) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) closeButtonRef.current?.focus();
  }, [open]);

  return (
    <div
      className="ku-map-browse"
      data-open={open}
      data-front={isFront}
      onPointerDownCapture={onActivate}
      onFocusCapture={onActivate}
    >
      <button
        className="ku-map-browse-trigger"
        type="button"
        aria-expanded={open}
        aria-controls="map-browse-panel"
        onClick={() => {
          onActivate();
          setOpen((value) => !value);
        }}
      >
        <List size={16} aria-hidden="true" />
        <span>{t("mapBrowse")}</span>
        <strong>{items.length}</strong>
      </button>

      {open && (
        <section
          className="ku-map-browse-panel"
          id="map-browse-panel"
          aria-labelledby="map-browse-title"
        >
          <div className="ku-map-browse-heading">
            <div>
              <h2 id="map-browse-title">{t("mapBrowseTitle")}</h2>
              <p>{t("mapBrowseDescription")}</p>
            </div>
            <button
              ref={closeButtonRef}
              type="button"
              aria-label={t("closeMapBrowse")}
              onClick={() => setOpen(false)}
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
                  <button
                    type="button"
                    onClick={() => {
                      onSelect(item);
                      setOpen(false);
                    }}
                  >
                    <span className="ku-map-browse-icon">
                      {item.kind === "landmark" ? (
                        <LandmarkIcon size={16} />
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
      )}
    </div>
  );
}
