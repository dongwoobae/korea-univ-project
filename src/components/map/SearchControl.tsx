"use client";
import { useEffect, useState, useRef } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";
import { useLanguage } from "@/lib/LanguageContext";

const VOICE_LANG_MAP = { ko: "ko-KR", en: "en-US", zh: "zh-CN" };

export default function SearchControl({ geoData, isMobile, onBuildingSelect }) {
  const map = useMap();
  const { lang, t } = useLanguage();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [isFocused, setIsFocused] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef(null);

  useEffect(() => {
    if (!geoData || query.trim() === "") {
      setResults([]);
      return;
    }
    const q = query.toLowerCase();
    const matched = geoData.features
      .filter(
        (f) =>
          f.properties.name?.includes(query) ||
          f.properties.name_en?.toLowerCase().includes(q),
      )
      .slice(0, 6);
    setResults(matched);
  }, [query, geoData]);

  function handleSelect(feature) {
    const coords = feature.geometry.coordinates[0];
    const latlngs = coords.map(([lon, lat]) => [lat, lon]);
    const bounds = L.latLngBounds(latlngs);
    map.fitBounds(bounds, { maxZoom: 18, animate: true });
    setQuery(
      lang === "ko"
        ? feature.properties.name
        : (feature.properties.name_en ?? feature.properties.name),
    );
    setResults([]);
    onBuildingSelect?.(feature);
  }

  function handleVoiceSearch(e) {
    e.preventDefault();
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert(t("voiceNotSupported"));
      return;
    }
    if (isListening) {
      recognitionRef.current?.stop();
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = VOICE_LANG_MAP[lang] ?? "ko-KR";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    recognition.onerror = () => setIsListening(false);
    recognition.onresult = (ev) => {
      setQuery(ev.results[0][0].transcript);
    };
    recognitionRef.current = recognition;
    recognition.start();
  }

  return (
    <div
      style={{
        position: "absolute",
        top: 16,
        left: 56,
        zIndex: 1000,
        width: isMobile ? "calc(100vw - 188px)" : 260,
      }}
    >
      <div style={{ position: "relative" }}>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setTimeout(() => setIsFocused(false), 150)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && results.length > 0) handleSelect(results[0]);
          }}
          placeholder={t("searchPlaceholder")}
          style={{
            width: "100%",
            padding: "10px 38px 10px 14px",
            borderWidth: 1,
            borderStyle: "solid",
            borderColor: "#ddd",
            borderRadius: results.length > 0 && isFocused ? "8px 8px 0 0" : "8px",
            fontSize: isMobile ? 16 : 14,
            outline: "none",
            boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
            background: "#fff",
            boxSizing: "border-box",
          }}
        />
        <button
          onMouseDown={handleVoiceSearch}
          title={t("voiceSearch")}
          style={{
            position: "absolute",
            right: 8,
            top: "50%",
            transform: "translateY(-50%)",
            background: "none",
            border: "none",
            cursor: "pointer",
            fontSize: 16,
            padding: "0 2px",
            lineHeight: 1,
            color: isListening ? "#ef4444" : "#999",
            animation: isListening ? "micPulse 1s ease-in-out infinite" : "none",
          }}
        >
          🎤
        </button>
      </div>
      {results.length > 0 && isFocused && (
        <ul
          style={{
            margin: 0,
            padding: 0,
            listStyle: "none",
            background: "#fff",
            borderTopWidth: 0,
            borderRightWidth: 1,
            borderBottomWidth: 1,
            borderLeftWidth: 1,
            borderStyle: "solid",
            borderColor: "#ddd",
            borderRadius: "0 0 8px 8px",
            boxShadow: "0 4px 8px rgba(0,0,0,0.1)",
            overflow: "hidden",
          }}
        >
          {results.map((f) => (
            <li
              key={f.properties.id}
              onMouseDown={() => handleSelect(f)}
              style={{
                padding: isMobile ? "12px 14px" : "9px 14px",
                fontSize: 13,
                cursor: "pointer",
                borderBottomWidth: 1,
                borderBottomStyle: "solid",
                borderBottomColor: "#f0f0f0",
                color: "#333",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "#f5f5f5")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "#fff")}
            >
              {lang === "ko"
                ? f.properties.name
                : (f.properties.name_en ?? f.properties.name)}
            </li>
          ))}
        </ul>
      )}
      <style>{`
        @keyframes micPulse {
          0%, 100% { opacity: 1; transform: translateY(-50%) scale(1); }
          50% { opacity: 0.5; transform: translateY(-50%) scale(1.2); }
        }
      `}</style>
    </div>
  );
}
