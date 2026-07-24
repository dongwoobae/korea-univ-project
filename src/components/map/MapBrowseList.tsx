"use client";

import { useEffect, useRef, useState } from "react";
import { useLanguage } from "@/lib/LanguageContext";

export interface MapBrowseItem {
  key: string;
  kind: "facility" | "landmark";
  icon: string;
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
        <span aria-hidden="true">☷</span>
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
              ×
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
                    <span className="ku-map-browse-icon" aria-hidden="true">
                      {item.icon}
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
