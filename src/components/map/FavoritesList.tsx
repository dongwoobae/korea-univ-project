"use client";

import { useLanguage } from "@/lib/LanguageContext";

export default function FavoritesList({ show, favorites, onSelect }) {
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
            <span aria-hidden="true">★</span>
            <span>{favorite.name}</span>
          </button>
        ))
      )}
    </div>
  );
}
