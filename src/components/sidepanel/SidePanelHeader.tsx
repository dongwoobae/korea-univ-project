"use client";

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
          {lang !== "ko" && <div className="ku-side-subtitle">{buildingName}</div>}
        </div>
        <button className="ku-side-close" type="button" onClick={onClose} aria-label="닫기">✕</button>
      </div>
      <div className="ku-side-actions">
        <button
          className="ku-side-action"
          type="button"
          onClick={onTts}
          disabled={loading}
          aria-pressed={isSpeaking}
        >
          <span aria-hidden="true">🔊</span> {isSpeaking ? t("stopSpeaking") : t("speakInfo")}
        </button>
        <button
          className="ku-side-action ku-side-action--favorite"
          type="button"
          onClick={onToggleFavorite}
          aria-pressed={isFavorite}
        >
          <span aria-hidden="true">{isFavorite ? "★" : "☆"}</span> {t("favorites")}
        </button>
      </div>
    </header>
  );
}
