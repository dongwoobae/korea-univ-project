"use client";

import { useEffect, useRef, useState } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";
import type { Feature } from "geojson";
import { useLanguage } from "@/lib/LanguageContext";
import { campusColor } from "@/lib/theme";

const VOICE_LANG_MAP = { ko: "ko-KR", en: "en-US", zh: "zh-CN" };

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  onresult: (ev: {
    results: ArrayLike<ArrayLike<{ transcript: string }>>;
  }) => void;
  start(): void;
  stop(): void;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function localizedName(properties, lang) {
  if (lang === "ko") return properties.name;
  if (lang === "zh")
    return properties.name_zh || properties.name_en || properties.name;
  return properties.name_en || properties.name;
}

export default function SearchControl({
  geoData,
  onBuildingSelect,
  favorites,
  favoritesOpen,
  onToggleFavorites,
  onSearchOpen,
}) {
  const map = useMap();
  const { lang, t } = useLanguage();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Feature[]>([]);
  const [isFocused, setIsFocused] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  useEffect(() => {
    const trimmed = query.trim();
    if (!geoData || !trimmed) {
      setResults([]);
      return;
    }

    const normalizedQuery = trimmed.toLocaleLowerCase();
    setResults(
      geoData.features
        .filter((feature) => {
          const name = localizedName(feature.properties, lang);
          return name?.toLocaleLowerCase().includes(normalizedQuery);
        })
        .slice(0, 6),
    );
  }, [query, geoData, lang]);

  function handleSelect(feature) {
    const coords = feature.geometry.coordinates[0];
    const latlngs = coords.map(([lon, lat]) => [lat, lon]);
    map.fitBounds(L.latLngBounds(latlngs), { maxZoom: 18, animate: true });
    setQuery(localizedName(feature.properties, lang));
    setResults([]);
    setIsFocused(false);
    onSearchOpen?.(false);
    onBuildingSelect?.(feature);
  }

  function handleVoiceSearch(event) {
    event.preventDefault();
    const speechWindow = window as unknown as {
      SpeechRecognition?: SpeechRecognitionCtor;
      webkitSpeechRecognition?: SpeechRecognitionCtor;
    };
    const SpeechRecognition =
      speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;

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
    recognition.onresult = (result) => {
      setQuery(result.results[0][0].transcript);
      setIsFocused(true);
      onSearchOpen?.(true);
    };
    recognitionRef.current = recognition;
    recognition.start();
  }

  const favoriteIds = new Set(favorites.map((favorite) => favorite.id));

  return (
    <div
      className="ku-search-control"
      onDoubleClickCapture={(event) => event.stopPropagation()}
    >
      <div className="ku-search-row">
        <div className="ku-search-field">
          <span className="ku-search-icon" role="img" aria-label="검색">
            🔍
          </span>
          <input
            className="ku-search-input"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onFocus={() => {
              setIsFocused(true);
              onSearchOpen?.(true);
            }}
            onBlur={() =>
              window.setTimeout(() => {
                setIsFocused(false);
                onSearchOpen?.(false);
              }, 150)
            }
            onKeyDown={(event) => {
              if (event.key === "Enter" && results.length > 0)
                handleSelect(results[0]);
            }}
            placeholder={t("searchPlaceholder")}
            aria-label={t("searchPlaceholder")}
          />
          <button
            className="ku-voice-button"
            type="button"
            onMouseDown={handleVoiceSearch}
            aria-label={t("voiceSearch")}
            title={t("voiceSearch")}
            data-listening={isListening}
          >
            <span aria-hidden="true">🎤</span>
          </button>
        </div>
        <button
          className="ku-favorite-button"
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={onToggleFavorites}
          aria-label={t("favorites")}
          aria-expanded={favoritesOpen}
          title={t("favorites")}
        >
          <span aria-hidden="true">★</span>
        </button>
      </div>

      {results.length > 0 && isFocused && !favoritesOpen && (
        <ul className="ku-search-results" aria-label="검색 결과">
          {results.map((feature) => {
            const properties = feature.properties;
            const campus = properties?.campus ?? "";
            return (
              <li key={properties?.id}>
                <button
                  className="ku-search-result"
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => handleSelect(feature)}
                >
                  <span className="ku-search-result-name">
                    {localizedName(properties, lang)}
                  </span>
                  {campus && (
                    <span
                      className="ku-search-result-campus"
                      style={{
                        "--campus-color": campusColor[campus],
                      } as React.CSSProperties}
                    >
                      {campus}
                    </span>
                  )}
                  {favoriteIds.has(properties?.id) && (
                    <span className="ku-search-result-star" aria-label="즐겨찾기">
                      ★
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
