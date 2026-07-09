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
    <div
      style={{
        padding: "14px 16px",
        borderBottom: "1px solid #f0f0f0",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 16, fontWeight: 600, color: "#111" }}>
          {displayName}
        </div>
        {collegeName && (
          <div
            style={{
              fontSize: 12,
              color: "#2563EB",
              marginTop: 3,
              fontWeight: 500,
            }}
          >
            {collegeName}
          </div>
        )}
        {/* 한국어가 아닐 때는 한국어 원명을 서브텍스트로 표시 */}
        {lang !== "ko" && (
          <div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>
            {buildingName}
          </div>
        )}
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          flexShrink: 0,
        }}
      >
        {/* TTS 버튼 */}
        <button
          onClick={onTts}
          title={isSpeaking ? t("stopSpeaking") : t("speakInfo")}
          style={{
            background: "none",
            border: "none",
            cursor: loading ? "default" : "pointer",
            fontSize: 18,
            padding: "2px 6px",
            lineHeight: 1,
            opacity: loading ? 0.4 : 1,
            color: isSpeaking ? "#2563EB" : "#888",
            animation: isSpeaking
              ? "speakPulse 1.2s ease-in-out infinite"
              : "none",
          }}
          disabled={loading}
        >
          🔊
        </button>
        {/* 즐겨찾기 버튼 */}
        <button
          onClick={onToggleFavorite}
          title={isFavorite ? t("removeFavorite") : t("addFavorite")}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            fontSize: 20,
            padding: "2px 6px",
            lineHeight: 1,
          }}
        >
          {isFavorite ? "⭐" : "☆"}
        </button>
        {/* 닫기 버튼 */}
        <button
          onClick={onClose}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            fontSize: 18,
            color: "#888",
            padding: "2px 6px",
          }}
        >
          ✕
        </button>
      </div>
      <style>{`
        @keyframes speakPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}
