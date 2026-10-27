"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Mic, Search, Star, X } from "lucide-react";
import type { FeatureCollection } from "geojson";
import type {
  BuildingFeature,
  BuildingFeatureProperties,
  Favorite,
  Landmark,
} from "@/types/domain";
import type { LangCode } from "@/lib/translations";
import { useLanguage } from "@/lib/LanguageContext";
import { campusColor } from "@/lib/theme";
import { LandmarkEmoji } from "./iconography";
import { MENU_PANEL_ID } from "./mapMenu";

const VOICE_LANG_MAP = { ko: "ko-KR", en: "en-US", zh: "zh-CN" };

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onresult: (ev: {
    results: ArrayLike<ArrayLike<{ transcript: string }>>;
  }) => void;
  start(): void;
  stop(): void;
  abort?: () => void;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

type SearchResult =
  | {
      kind: "building";
      feature: BuildingFeature;
      name: string;
      campus: string;
      id: number;
    }
  | { kind: "landmark"; landmark: Landmark; name: string };

function localizedName(properties: BuildingFeatureProperties, lang: LangCode) {
  if (lang === "ko") return properties.name;
  if (lang === "zh")
    return properties.name_zh || properties.name_en || properties.name;
  return properties.name_en || properties.name;
}

function localizedLandmarkName(landmark: Landmark, lang: LangCode) {
  if (lang === "en") return landmark.name_en ?? landmark.name;
  if (lang === "zh") return landmark.name_zh ?? landmark.name;
  return landmark.name;
}

// 세 언어 이름 필드에 대한 리터럴 부분일치 — 음차/로마자 변환 없음.
function matchInfo(fields: (string | null | undefined)[], query: string) {
  let match = false;
  let starts = false;
  for (const field of fields) {
    if (!field) continue;
    const lower = field.toLocaleLowerCase();
    if (lower.includes(query)) {
      match = true;
      if (lower.startsWith(query)) starts = true;
    }
  }
  return { match, rank: starts ? 0 : 1 };
}

/**
 * 검색창과 결과. 지도 이동은 고른 쪽(`Map`)이 한다 — 메뉴는 Leaflet 컨테이너 밖에 있다
 * (설계: docs/specs/2026-10-27-map-menu-design.md 5.3).
 */
export default function SearchControl({
  geoData,
  landmarks,
  favorites,
  query,
  onQueryChange,
  onSelectBuilding,
  onSelectLandmark,
  resultsHidden = false,
  onActivate,
  panelMode = false,
  inputRef,
  trailing,
}: {
  geoData: FeatureCollection | null;
  landmarks: Landmark[] | null;
  favorites: Favorite[];
  query: string;
  onQueryChange: (query: string) => void;
  onSelectBuilding: (feature: BuildingFeature, label: string) => void;
  onSelectLandmark: (landmark: Landmark, label: string) => void;
  /** 펼친 모습에서 즐겨찾기·목록이 열려 있으면 결과를 숨긴다 */
  resultsHidden?: boolean;
  onActivate?: () => void;
  /** 접힌 줄·모바일의 검색 패널. Esc는 결과만이 아니라 패널을 닫는다(설계 4.2) */
  panelMode?: boolean;
  inputRef?: (element: HTMLInputElement | null) => void;
  trailing?: ReactNode;
}) {
  const { lang, t } = useLanguage();
  const listboxId = useId();
  const [activeIndex, setActiveIndex] = useState(-1);
  const [open, setOpen] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const ownInputRef = useRef<HTMLInputElement | null>(null);
  const blurTimerRef = useRef<number | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);

  function setInput(element: HTMLInputElement | null) {
    ownInputRef.current = element;
    inputRef?.(element);
  }

  // 패널이 닫혀 사라질 때 늦게 오는 흐림 타이머·음성 결과가 닫힌 패널에 닿지 않게 한다
  useEffect(
    () => () => {
      if (blurTimerRef.current !== null)
        window.clearTimeout(blurTimerRef.current);
      recognitionRef.current?.abort?.();
    },
    [],
  );

  const optionId = useCallback(
    (index: number) => `${listboxId}-opt-${index}`,
    [listboxId],
  );

  const matchedResults = useMemo(() => {
    const trimmed = query.trim();
    if (!trimmed) return [];

    const normalizedQuery = trimmed.toLocaleLowerCase();
    const buildingMatches: { rank: number; result: SearchResult }[] = [];
    if (geoData) {
      for (const feature of geoData.features as BuildingFeature[]) {
        const properties =
          feature.properties ?? ({} as BuildingFeatureProperties);
        const info = matchInfo(
          [properties.name, properties.name_en, properties.name_zh],
          normalizedQuery,
        );
        if (info.match) {
          buildingMatches.push({
            rank: info.rank,
            result: {
              kind: "building",
              feature,
              name: localizedName(properties, lang),
              campus: properties.campus ?? "",
              id: properties.id,
            },
          });
        }
      }
    }

    const landmarkMatches: { rank: number; result: SearchResult }[] = [];
    for (const landmark of landmarks ?? []) {
      const info = matchInfo(
        [landmark.name, landmark.name_en, landmark.name_zh],
        normalizedQuery,
      );
      if (info.match) {
        landmarkMatches.push({
          rank: info.rank,
          result: {
            kind: "landmark",
            landmark,
            name: localizedLandmarkName(landmark, lang),
          },
        });
      }
    }

    // 건물 먼저, 명소 뒤. 각 그룹 내에서 startsWith(rank 0)가 부분일치(rank 1)보다 앞.
    // Array.sort는 안정 정렬이라 동순위는 위 삽입 순서를 유지한다.
    const combined = [...buildingMatches, ...landmarkMatches];
    combined.sort((a, b) => a.rank - b.rank);
    return combined.map((entry) => entry.result);
  }, [query, geoData, lang, landmarks]);
  const totalCount = matchedResults.length;
  const results = matchedResults.slice(0, 8);

  const hasQuery = query.trim().length > 0;
  const listOpen = open && isFocused && !resultsHidden && hasQuery;
  const showListbox = listOpen && results.length > 0;
  const showNoResults = listOpen && results.length === 0;

  // 활성 옵션을 뷰포트 안으로 스크롤
  useEffect(() => {
    if (activeIndex < 0 || !listRef.current) return;
    const option = listRef.current.querySelector<HTMLElement>(
      `#${CSS.escape(optionId(activeIndex))}`,
    );
    option?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, optionId]);

  function closeList() {
    setOpen(false);
    setIsFocused(false);
    setActiveIndex(-1);
  }

  function handleSelect(result: SearchResult) {
    closeList();
    if (result.kind === "building")
      onSelectBuilding(result.feature, result.name);
    else onSelectLandmark(result.landmark, result.name);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    const len = results.length;
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        if (!listOpen) {
          setOpen(true);
        } else {
          setActiveIndex((index) => Math.min(index + 1, len - 1));
        }
        break;
      case "ArrowUp":
        event.preventDefault();
        setActiveIndex((index) => Math.max(index - 1, 0));
        break;
      case "Home":
        if (listOpen) {
          event.preventDefault();
          setActiveIndex(0);
        }
        break;
      case "End":
        if (listOpen) {
          event.preventDefault();
          setActiveIndex(len - 1);
        }
        break;
      case "Enter":
        event.preventDefault();
        if (activeIndex >= 0 && activeIndex < len)
          handleSelect(results[activeIndex]);
        else if (len > 0) handleSelect(results[0]);
        break;
      case "Escape":
        if (listOpen && !panelMode) {
          event.preventDefault();
          setOpen(false);
          setActiveIndex(-1);
        }
        break;
      default:
        break;
    }
  }

  function handleClear() {
    onQueryChange("");
    setActiveIndex(-1);
    setOpen(false);
    ownInputRef.current?.focus();
  }

  function notifyVoice(messageKey: string) {
    window.dispatchEvent(
      new CustomEvent("showToast", {
        detail: { message: t(messageKey), type: "error" },
      }),
    );
  }

  function handleVoiceSearch(event: React.MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    const speechWindow = window as unknown as {
      SpeechRecognition?: SpeechRecognitionCtor;
      webkitSpeechRecognition?: SpeechRecognitionCtor;
    };
    const SpeechRecognition =
      speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      notifyVoice("voiceNotSupported");
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
    recognition.onerror = (event) => {
      setIsListening(false);
      const code = event?.error;
      // 사용자가 직접 중지(stop)한 경우는 오류가 아니므로 안내하지 않는다.
      if (code === "aborted") return;
      if (code === "not-allowed" || code === "service-not-allowed") {
        notifyVoice("voicePermissionDenied");
      } else if (code === "network") {
        notifyVoice("voiceNetworkError");
      } else {
        // no-speech 및 기타 인식 실패
        notifyVoice("voiceNoSpeech");
      }
    };
    recognition.onresult = (result) => {
      onQueryChange(result.results[0][0].transcript);
      setActiveIndex(-1);
      setIsFocused(true);
      setOpen(true);
      onActivate?.();
    };
    recognitionRef.current = recognition;
    recognition.start();
  }

  const favoriteIds = new Set(favorites.map((favorite) => favorite.id));

  return (
    <div id={MENU_PANEL_ID.search} className="ku-search-control">
      <div className="ku-search-row">
        <div className="ku-search-field">
          <span className="ku-search-icon">
            <Search size={16} aria-hidden="true" />
          </span>
          <input
            ref={setInput}
            className="ku-search-input"
            type="search"
            role="combobox"
            aria-expanded={showListbox}
            aria-controls={listboxId}
            aria-autocomplete="list"
            aria-activedescendant={
              activeIndex >= 0 ? optionId(activeIndex) : undefined
            }
            value={query}
            onChange={(event) => {
              onQueryChange(event.target.value);
              setActiveIndex(-1);
              setOpen(true);
              onActivate?.();
            }}
            onFocus={() => {
              if (blurTimerRef.current !== null) {
                window.clearTimeout(blurTimerRef.current);
                blurTimerRef.current = null;
              }
              setIsFocused(true);
              setOpen(true);
              onActivate?.();
            }}
            onBlur={() => {
              blurTimerRef.current = window.setTimeout(() => {
                blurTimerRef.current = null;
                setIsFocused(false);
              }, 150);
            }}
            onKeyDown={handleKeyDown}
            placeholder={t("searchPlaceholder")}
            aria-label={t("searchPlaceholder")}
          />
          {hasQuery && (
            <button
              className="ku-search-clear"
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={handleClear}
              aria-label={t("searchClear")}
              title={t("searchClear")}
            >
              <X size={15} aria-hidden="true" />
            </button>
          )}
          <button
            className="ku-voice-button"
            type="button"
            onMouseDown={handleVoiceSearch}
            aria-label={t("voiceSearch")}
            title={t("voiceSearch")}
            data-listening={isListening}
          >
            <Mic size={17} aria-hidden="true" />
          </button>
          <span className="ku-visually-hidden" role="status" aria-live="polite">
            {isListening ? t("voiceListening") : ""}
          </span>
        </div>
        {trailing}
      </div>

      {showListbox && (
        <ul
          ref={listRef}
          id={listboxId}
          role="listbox"
          className="ku-search-results"
          aria-label={t("searchResultsLabel")}
        >
          {results.map((result, index) => {
            const active = index === activeIndex;
            return (
              <li
                key={
                  result.kind === "building"
                    ? `b-${result.id}`
                    : `l-${result.landmark.id}`
                }
                id={optionId(index)}
                role="option"
                aria-selected={active}
                className="ku-search-result"
                data-active={active}
                data-kind={result.kind}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => handleSelect(result)}
              >
                {result.kind === "landmark" && (
                  <span className="ku-search-result-icon">
                    <LandmarkEmoji icon={result.landmark.icon} size={15} />
                  </span>
                )}
                <span className="ku-search-result-name">{result.name}</span>
                {result.kind === "building" && result.campus && (
                  <span
                    className="ku-search-result-campus"
                    style={
                      {
                        "--campus-color": campusColor[result.campus],
                      } as React.CSSProperties
                    }
                  >
                    {result.campus}
                  </span>
                )}
                {result.kind === "landmark" && (
                  <span className="ku-search-result-tag">
                    {t("landmarkToggle")}
                  </span>
                )}
                {result.kind === "building" && favoriteIds.has(result.id) && (
                  <span className="ku-search-result-star">
                    <Star size={13} fill="currentColor" aria-hidden="true" />
                    <span className="ku-visually-hidden">{t("favorites")}</span>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {showListbox && totalCount > 8 && (
        <div className="ku-search-note">{t("searchMany")}</div>
      )}

      {showNoResults && (
        <div className="ku-search-empty" role="status">
          {t("searchNoResults")}
        </div>
      )}

      <div className="ku-search-count" role="status" aria-live="polite">
        {/* 8개로 잘려도 실제 총 개수를 안내(초과 시 searchMany 문구와 함께 정합) */}
        {showListbox ? `${totalCount}${t("searchCountUnit")}` : ""}
      </div>
    </div>
  );
}
