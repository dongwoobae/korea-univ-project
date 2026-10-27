"use client";

import type { Ref } from "react";
import {
  ChevronsRight,
  List,
  Search,
  SlidersHorizontal,
  Star,
  type LucideIcon,
} from "lucide-react";
import { useLanguage } from "@/lib/LanguageContext";
import { MENU_PANEL_ID, type MenuPanel } from "./mapMenu";

const ITEMS: { panel: MenuPanel; icon: LucideIcon; labelKey: string }[] = [
  { panel: "search", icon: Search, labelKey: "menuSearch" },
  { panel: "filter", icon: SlidersHorizontal, labelKey: "menuFilter" },
  { panel: "favorites", icon: Star, labelKey: "favorites" },
  { panel: "browse", icon: List, labelKey: "menuBrowse" },
];

/** 웹 접힌 줄(rail)과 모바일 아래 줄(bar). 설계: docs/specs/2026-10-27-map-menu-design.md 3·4장 */
export default function MapMenuNav({
  orientation,
  openPanel,
  counts,
  onToggle,
  triggerRefs,
  onExpand,
  expandButtonRef,
}: {
  orientation: "rail" | "bar";
  openPanel: MenuPanel | null;
  counts: Partial<Record<MenuPanel, number>>;
  onToggle: (panel: MenuPanel) => void;
  triggerRefs: Record<MenuPanel, (element: HTMLElement | null) => void>;
  onExpand?: () => void;
  expandButtonRef?: Ref<HTMLButtonElement>;
}) {
  const { t } = useLanguage();

  return (
    <nav
      className={`ku-menu-nav ku-menu-nav--${orientation}`}
      aria-label={t("menuLabel")}
    >
      {onExpand && (
        <>
          <button
            ref={expandButtonRef}
            className="ku-menu-button"
            type="button"
            aria-label={t("menuExpandLabel")}
            onClick={onExpand}
          >
            <ChevronsRight size={20} aria-hidden="true" />
            <span className="ku-menu-label">{t("menuExpand")}</span>
          </button>
          <span className="ku-menu-divider" aria-hidden="true" />
        </>
      )}
      {ITEMS.map(({ panel, icon: Icon, labelKey }) => {
        const label = t(labelKey);
        const count = counts[panel] ?? 0;
        return (
          <button
            key={panel}
            ref={triggerRefs[panel]}
            className="ku-menu-button"
            type="button"
            aria-label={count > 0 ? `${label} (${count})` : label}
            aria-expanded={openPanel === panel}
            aria-controls={MENU_PANEL_ID[panel]}
            onClick={() => onToggle(panel)}
          >
            <Icon size={20} aria-hidden="true" />
            <span className="ku-menu-label">{label}</span>
            {count > 0 && (
              <span className="ku-menu-badge" aria-hidden="true">
                {count}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
}
