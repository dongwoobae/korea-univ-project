"use client";

import { Star, Volume2, X } from "lucide-react";
import type { LangCode } from "@/lib/translations";

interface SidePanelHeaderProps {
  displayName: string;
  collegeName: string | null | undefined;
  buildingName: string;
  lang: LangCode;
  isSpeaking: boolean;
  loading: boolean;
  isFavorite: boolean;
  onTts: () => void;
  onToggleFavorite: () => void;
  onClose: () => void;
  t: (key: string) => string;
}

export default function SidePanelHeader({
  displayName,
  collegeName,
  buildingName,
  lang,
  isSpeaking,
  loading,
  isFavorite,
  onTts,
  onToggleFavorite,
  onClose,
  t,
}: SidePanelHeaderProps) {
  return (
    <header className="ku-side-header">
      <div className="ku-side-heading-row">
        <div>
          {collegeName && <div className="ku-side-caption">{collegeName}</div>}
          <h2 className="ku-side-title">{displayName}</h2>
          {lang !== "ko" && (
            <div className="ku-side-subtitle">{buildingName}</div>
          )}
        </div>
        <button
          className="ku-side-close"
          type="button"
          onClick={onClose}
          aria-label="닫기"
        >
          <X size={17} aria-hidden="true" />
        </button>
      </div>
      <div className="ku-side-actions">
        <button
          className="ku-side-action"
          type="button"
          onClick={onTts}
          disabled={loading}
          aria-pressed={isSpeaking}
        >
          <Volume2 size={16} aria-hidden="true" />
          {isSpeaking ? t("stopSpeaking") : t("speakInfo")}
        </button>
        <button
          className="ku-side-action ku-side-action--favorite"
          type="button"
          onClick={onToggleFavorite}
          aria-label={isFavorite ? t("removeFavorite") : t("addFavorite")}
          aria-pressed={isFavorite}
        >
          <Star
            size={16}
            fill={isFavorite ? "currentColor" : "none"}
            aria-hidden="true"
          />
          {t("favorites")}
        </button>
      </div>
    </header>
  );
}
