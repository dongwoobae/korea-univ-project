"use client";

import { useEffect, useState } from "react";
import type { FeatureCollection } from "geojson";
import { supabase } from "@/lib/supabaseClient";
import { assignCampusesToBuildings } from "@/lib/campusGeometry";
import type {
  FacilityType,
  Landmark,
  MapFacility,
  SlopeSegment,
} from "@/types/domain";

/**
 * 지도에 필요한 원격 데이터(건물 GeoJSON·시설·시설유형·경사·캠퍼스 경계)를
 * 로드하는 훅. 지도 상호작용 로직(refs/이벤트)과 분리하기 위해 추출.
 */
export function useMapData() {
  const [geoData, setGeoData] = useState<FeatureCollection | null>(null);
  const [loadingMap, setLoadingMap] = useState(true);
  const [facilities, setFacilities] = useState<MapFacility[]>([]);
  const [facilityTypes, setFacilityTypes] = useState<FacilityType[]>([]);
  const [activeTypes, setActiveTypes] = useState<Record<string, boolean>>({});
  const [slopes, setSlopes] = useState<SlopeSegment[]>([]);
  const [campusBoundaries, setCampusBoundaries] =
    useState<FeatureCollection | null>(null);
  const [landmarks, setLandmarks] = useState<Landmark[]>([]);

  useEffect(() => {
    setLoadingMap(true);
    Promise.all([
      fetch("/api/buildings").then((response) => response.json()),
      fetch("/campus-boundaries.geojson").then((response) => response.json()),
    ])
      .then(([buildings, boundaries]) => {
        if (!buildings.features || !boundaries.features) return;
        setCampusBoundaries(boundaries);
        setGeoData(assignCampusesToBuildings(buildings, boundaries));
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
    fetch("/api/landmarks")
      .then((r) => r.json())
      .then((data) => setLandmarks(Array.isArray(data) ? data : []))
      .catch(() => setLandmarks([]));
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
    landmarks,
  };
}
