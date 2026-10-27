"use client";

import { Star } from "lucide-react";
import { useLanguage } from "@/lib/LanguageContext";
import type { Favorite } from "@/types/domain";
import { MENU_PANEL_ID } from "./mapMenu";

/** 여닫음은 부모가 정한다. 비어 있으면 초점을 받을 곳이 뿌리뿐이라 `tabIndex={-1}`(설계 5.4) */
export default function FavoritesList({
  favorites,
  onSelect,
}: {
  favorites: Favorite[];
  onSelect: (id: number, name: string) => void;
}) {
  const { t } = useLanguage();

  return (
    <div
      id={MENU_PANEL_ID.favorites}
      className="ku-favorites-list"
      role="dialog"
      aria-label={t("favorites")}
      tabIndex={-1}
    >
      <div className="ku-favorites-title">
        {t("favorites")}
        {favorites.length > 0 ? ` (${favorites.length})` : ""}
      </div>
      {favorites.length === 0 ? (
        <div className="ku-favorites-empty">{t("noFavorites")}</div>
      ) : (
        favorites.map((favorite) => (
          <button
            className="ku-favorite-row"
            key={favorite.id}
            type="button"
            onClick={() => onSelect(favorite.id, favorite.name)}
          >
            <Star size={14} fill="currentColor" aria-hidden="true" />
            <span>{favorite.name}</span>
          </button>
        ))
      )}
    </div>
  );
}
