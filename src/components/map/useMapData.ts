"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { FacilityType } from "@/types/domain";

/**
 * 지도에 필요한 원격 데이터(건물 GeoJSON·시설·시설유형·경사·캠퍼스 경계)를
 * 로드하는 훅. 지도 상호작용 로직(refs/이벤트)과 분리하기 위해 추출.
 */
export function useMapData() {
  const [geoData, setGeoData] = useState<any>(null);
  const [loadingMap, setLoadingMap] = useState(true);
  const [facilities, setFacilities] = useState<any[]>([]);
  const [facilityTypes, setFacilityTypes] = useState<FacilityType[]>([]);
  const [activeTypes, setActiveTypes] = useState<Record<string, boolean>>({});
  const [slopes, setSlopes] = useState<any[]>([]);
  const [campusBoundaries, setCampusBoundaries] = useState<any>(null);

  useEffect(() => {
    setLoadingMap(true);
    fetch("/api/buildings")
      .then((res) => res.json())
      .then((data) => {
        if (!data.features) return;
        setGeoData(data);
      })
      .catch((err) => console.error("buildings fetch 실패:", err))
      .finally(() => setLoadingMap(false));
  }, []);

  useEffect(() => {
    fetch("/api/facilities")
      .then((r) => r.json())
      .then((data) => setFacilities(data ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    supabase
      .from("facility_types")
      .select("code, label, label_en, label_zh, icon")
      .then(({ data }) => {
        if (!data) return;
        setFacilityTypes(data);
        setActiveTypes(Object.fromEntries(data.map((ft) => [ft.code, false])));
      });
  }, []);

  useEffect(() => {
    fetch("/api/slopes")
      .then((r) => r.json())
      .then((data) => setSlopes(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch("/campus-boundaries.geojson")
      .then((r) => r.json())
      .then((data) => setCampusBoundaries(data))
      .catch(() => {});
  }, []);

  return {
    geoData,
    loadingMap,
    facilities,
    facilityTypes,
    activeTypes,
    setActiveTypes,
    slopes,
    campusBoundaries,
  };
}
