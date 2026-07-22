"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useLanguage } from "@/lib/LanguageContext";
import type {
  BuildingWithCollege,
  FacilityWithType,
  BuildingPhoto,
} from "@/types/domain";
import SidePanelHeader from "@/components/sidepanel/SidePanelHeader";
import PhotoCarousel from "@/components/sidepanel/PhotoCarousel";
import FacilityList from "@/components/sidepanel/FacilityList";

export type SidePanelPhoto = Pick<
  BuildingPhoto,
  "id" | "url" | "caption" | "caption_en" | "caption_zh"
>;

const FAVORITES_KEY = "ku_favorites";

function loadFavorites() {
  try {
    return JSON.parse(localStorage.getItem(FAVORITES_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function saveFavorites(list) {
  localStorage.setItem(FAVORITES_KEY, JSON.stringify(list));
}

const TTS_LANG_MAP = { ko: "ko-KR", en: "en-US", zh: "zh-CN" };

export default function SidePanel({ buildingId, buildingName, onClose }) {
  const { lang, t } = useLanguage();
  const [facilities, setFacilities] = useState<FacilityWithType[]>([]);
  const [building, setBuilding] = useState<BuildingWithCollege | null>(null);
  const [photos, setPhotos] = useState<SidePanelPhoto[]>([]);
  const [photoIndex, setPhotoIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState({
    building: false,
    facilities: false,
    photos: false,
  });
  const [isFavorite, setIsFavorite] = useState(false);
  const [isMobile, setIsMobile] = useState(
    typeof window !== "undefined" ? window.innerWidth < 768 : false,
  );
  const [visible, setVisible] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  // 모바일 아래로 스와이프 닫기: 드래그 중 손가락을 따라 내려가는 오프셋(px)
  const [dragOffset, setDragOffset] = useState(0);
  const dragStartY = useRef<number | null>(null);
  const draggedRef = useRef(false);
  // 임계값 판정은 리렌더 타이밍에 의존하지 않도록 ref로 최신 오프셋을 읽는다
  const offsetRef = useRef(0);

  // 모바일 감지
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // 슬라이드 인
  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), 10);
    return () => clearTimeout(timer);
  }, []);

  // Map.js에서 닫기 요청 시 슬라이드 아웃
  useEffect(() => {
    const handler = () => setVisible(false);
    window.addEventListener("sidePanelShouldClose", handler);
    return () => window.removeEventListener("sidePanelShouldClose", handler);
  }, []);

  // 즐겨찾기 초기 로드
  useEffect(() => {
    if (!buildingId) return;
    const favs = loadFavorites();
    setIsFavorite(favs.some((f) => f.id === buildingId));
  }, [buildingId]);

  // 데이터 fetch — label_en, label_zh 포함
  const fetchData = useCallback(async () => {
    if (!buildingId) return;
    setLoading(true);

    const [
      { data: buildingData, error: buildingError },
      { data: facilitiesData, error: facilitiesError },
      { data: photosData, error: photosError },
    ] = await Promise.all([
      supabase
        .from("buildings")
        .select("*, colleges(name, name_en, name_zh)")
        .eq("id", buildingId)
        .single(),
      supabase
        .from("building_facilities")
        .select("*, facility_types(label, label_en, label_zh, icon)")
        .eq("building_id", buildingId),
      supabase
        .from("building_photos")
        .select("id, url, caption, caption_en, caption_zh")
        .eq("building_id", buildingId)
        .order("created_at"),
    ]);

    // 조회 성공분만 갱신. 실패 섹션은 error 상태로 유지해 빈 상태와 구분.
    if (!buildingError) setBuilding(buildingData);
    if (!facilitiesError) setFacilities(facilitiesData ?? []);
    if (!photosError) setPhotos(photosData ?? []);
    setPhotoIndex(0);
    setErrors({
      building: Boolean(buildingError),
      facilities: Boolean(facilitiesError),
      photos: Boolean(photosError),
    });
    setLoading(false);
  }, [buildingId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // 언어에 따른 건물명
  const displayName =
    lang === "ko" ? buildingName : (building?.name_en ?? buildingName);

  // 언어에 따른 단과대명
  const collegeName = building?.colleges
    ? lang === "en"
      ? (building.colleges.name_en ?? building.colleges.name)
      : lang === "zh"
        ? (building.colleges.name_zh ?? building.colleges.name)
        : building.colleges.name
    : null;

  // 언어에 따른 시설 라벨
  function getFacilityLabel(facilityTypes) {
    if (!facilityTypes) return "";
    if (lang === "en") return facilityTypes.label_en ?? facilityTypes.label;
    if (lang === "zh") return facilityTypes.label_zh ?? facilityTypes.label;
    return facilityTypes.label;
  }

  function toggleFavorite() {
    const favs = loadFavorites();
    const isFirstTime = localStorage.getItem(FAVORITES_KEY) === null;
    const next = isFavorite
      ? favs.filter((f) => f.id !== buildingId)
      : [...favs, { id: buildingId, name: buildingName }];
    saveFavorites(next);
    window.dispatchEvent(new Event("favoritesUpdated"));
    setIsFavorite(!isFavorite);

    if (isFirstTime && !isFavorite) {
      window.dispatchEvent(
        new CustomEvent("showToast", {
          detail: { message: t("favoriteSavedMsg"), type: "info" },
        }),
      );
    }
  }

  function buildTtsText() {
    const name =
      lang === "ko" ? buildingName : (building?.name_en ?? buildingName);

    if (lang === "en") {
      let text = `This is ${name}. `;
      if (facilities.length === 0)
        return text + "No accessibility information available.";
      text += "Facilities: ";
      facilities.forEach((f) => {
        const label =
          f.facility_types?.label_en ?? f.facility_types?.label ?? "";
        const facilityName = f.name_en ?? f.name ?? label;
        text += `${facilityName}, ${f.is_installed ? "available" : "unavailable"}. `;
        const location = f.floor_info_en ?? f.floor_info;
        if (location) text += `Location: ${location}. `;
      });
      return text;
    }

    if (lang === "zh") {
      let text = `这是${name}。`;
      if (facilities.length === 0) return text + "暂无无障碍设施信息。";
      text += "设施情况：";
      facilities.forEach((f) => {
        const label =
          f.facility_types?.label_zh ?? f.facility_types?.label ?? "";
        const facilityName = f.name_zh ?? f.name ?? label;
        text += `${facilityName}，${f.is_installed ? "已安装" : "未安装"}。`;
        const location = f.floor_info_zh ?? f.floor_info;
        if (location) text += `位置：${location}。`;
      });
      return text;
    }

    // ko
    let text = `${name}입니다. `;
    if (facilities.length === 0) return text + "등록된 접근성 정보가 없습니다.";
    text += "시설 현황: ";
    facilities.forEach((f) => {
      const label = f.name ?? f.facility_types?.label ?? "";
      text += `${label} ${f.is_installed ? "설치됨" : "미설치"}. `;
      if (f.floor_info) text += `위치 ${f.floor_info}. `;
    });
    return text;
  }

  function handleTts() {
    if (!window.speechSynthesis) {
      window.dispatchEvent(
        new CustomEvent("showToast", {
          detail: { message: t("ttsNotSupported"), type: "error" },
        }),
      );
      return;
    }
    if (isSpeaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      return;
    }
    if (loading) return;
    const utter = new SpeechSynthesisUtterance(buildTtsText());
    utter.lang = TTS_LANG_MAP[lang] ?? "ko-KR";
    utter.rate = 1;
    utter.onend = () => setIsSpeaking(false);
    utter.onerror = () => setIsSpeaking(false);
    window.speechSynthesis.speak(utter);
    setIsSpeaking(true);
  }

  // 건물 변경 또는 패널 닫힐 때 TTS 중지
  useEffect(() => {
    window.speechSynthesis?.cancel();
    setIsSpeaking(false);
  }, [buildingId]);

  useEffect(() => {
    return () => window.speechSynthesis?.cancel();
  }, []);

  // 손잡이 스와이프: 아래로 임계값 이상 끌면 닫고, 그 이하면 제자리로 복귀
  const CLOSE_THRESHOLD = 80;
  function handleHandleTouchStart(event) {
    dragStartY.current = event.touches[0].clientY;
    draggedRef.current = false;
  }
  function handleHandleTouchMove(event) {
    if (dragStartY.current === null) return;
    const delta = event.touches[0].clientY - dragStartY.current;
    if (Math.abs(delta) > 6) draggedRef.current = true;
    // 아래 방향으로만 따라간다(위로 끌어도 패널이 딸려 올라가지 않게)
    if (delta > 0) {
      offsetRef.current = delta;
      setDragOffset(delta);
    }
  }
  function handleHandleTouchEnd() {
    const shouldClose = offsetRef.current > CLOSE_THRESHOLD;
    dragStartY.current = null;
    offsetRef.current = 0;
    setDragOffset(0);
    if (shouldClose) onClose();
  }
  // 실제 드래그가 없었던 순수 탭(키보드 활성화 포함)이면 닫기 동작으로 처리
  function handleHandleClick() {
    if (draggedRef.current) return;
    onClose();
  }

  return (
    <>
      {/* 모바일 배경 터치 시 닫기 */}
      {isMobile && (
        <div
          onClick={onClose}
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 999,
            background: "transparent",
          }}
        />
      )}

      <aside
        className="ku-side-panel"
        data-visible={visible}
        aria-label={`${displayName} 접근성 정보`}
        onDoubleClickCapture={(event) => event.stopPropagation()}
        style={
          isMobile && dragOffset > 0
            ? { transform: `translateY(${dragOffset}px)`, transition: "none" }
            : undefined
        }
      >
        {/* 모바일 스와이프 손잡이: 아래로 끌거나 눌러서 닫기 */}
        {isMobile && (
          <button
            className="ku-side-handle"
            type="button"
            aria-label={t("closeLabel")}
            onClick={handleHandleClick}
            onTouchStart={handleHandleTouchStart}
            onTouchMove={handleHandleTouchMove}
            onTouchEnd={handleHandleTouchEnd}
          />
        )}

        {/* 헤더 */}
        <SidePanelHeader
          displayName={displayName}
          collegeName={collegeName}
          buildingName={buildingName}
          lang={lang}
          isSpeaking={isSpeaking}
          loading={loading}
          isFavorite={isFavorite}
          onTts={handleTts}
          onToggleFavorite={toggleFavorite}
          onClose={onClose}
          t={t}
        />

        {/* 사진 캐러셀 */}
        <PhotoCarousel
          photos={photos}
          photoIndex={photoIndex}
          setPhotoIndex={setPhotoIndex}
          displayName={displayName}
          lang={lang}
          t={t}
        />

        {/* 시설 목록 */}
        <FacilityList
          loading={loading}
          error={errors.facilities}
          onRetry={fetchData}
          facilities={facilities}
          lang={lang}
          getFacilityLabel={getFacilityLabel}
          lastUpdated={building?.last_updated}
          t={t}
        />
      </aside>
    </>
  );
}
