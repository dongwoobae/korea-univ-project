"use client";

import { Star } from "lucide-react";
import { useLanguage } from "@/lib/LanguageContext";
import type { Favorite } from "@/types/domain";

export default function FavoritesList({
  show,
  favorites,
  onSelect,
}: {
  show: boolean;
  favorites: Favorite[];
  onSelect: (id: number, name: string) => void;
}) {
  const { t } = useLanguage();
  if (!show) return null;

  return (
    <div
      className="ku-favorites-list"
      role="dialog"
      aria-label={t("favorites")}
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
