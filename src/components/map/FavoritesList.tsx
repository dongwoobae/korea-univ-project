"use client";
import { useLanguage } from "@/lib/LanguageContext";

export default function FavoritesList({
  show,
  favorites,
  isMobile,
  onSelect,
  onClose,
}) {
  const { t } = useLanguage();

  if (!show) return null;

  return (
    <div
      style={{
        position: "absolute",
        top: isMobile ? 64 : 60,
        left: 16,
        zIndex: 1001,
        background: "#fff",
        borderRadius: 10,
        boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
        borderWidth: 1,
        borderStyle: "solid",
        borderColor: "#e5e7eb",
        width: isMobile ? "calc(100vw - 32px)" : 220,
        maxHeight: isMobile ? 200 : 320,
        overflowY: "auto",
      }}
    >
      <div
        style={{
          padding: "12px 14px",
          borderBottomWidth: 1,
          borderBottomStyle: "solid",
          borderBottomColor: "#f0f0f0",
          fontSize: 13,
          fontWeight: 600,
          color: "#111",
        }}
      >
        {t("favorites")}
        {favorites.length > 0 ? ` (${favorites.length})` : ""}
      </div>
      {favorites.length === 0 ? (
        <div
          style={{
            padding: "20px 14px",
            fontSize: 13,
            color: "#aaa",
            textAlign: "center",
          }}
        >
          {t("noFavorites")}
        </div>
      ) : (
        favorites.map((fav) => (
          <div
            key={fav.id}
            onClick={() => onSelect(fav.id, fav.name)}
            style={{
              padding: "10px 14px",
              fontSize: 13,
              color: "#333",
              cursor: "pointer",
              borderBottomWidth: 1,
              borderBottomStyle: "solid",
              borderBottomColor: "#f5f5f5",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "#f9f9f9")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "#fff")}
          >
            <span>⭐</span>
            <span style={{ flex: 1 }}>{fav.name}</span>
          </div>
        ))
      )}
    </div>
  );
}
