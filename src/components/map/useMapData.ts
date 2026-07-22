"use client";

import { useCallback, useEffect, useState } from "react";
import type { FeatureCollection } from "geojson";
import { supabase } from "@/lib/supabaseClient";
import { assignCampusesToBuildings } from "@/lib/campusGeometry";
import type {
  FacilityType,
  Landmark,
  MapFacility,
  SlopeSegment,
} from "@/types/domain";

/** 개별 데이터 소스의 로드 상태. */
export type SourceStatus = "loading" | "error" | "ready";

export type MapDataSource =
  | "buildings"
  | "facilities"
  | "slopes"
  | "landmarks"
  | "facilityTypes";

export type MapDataStatuses = Record<MapDataSource, SourceStatus>;
export type MapDataRetry = Record<MapDataSource, () => void>;

/**
 * 지도에 필요한 원격 데이터(건물 GeoJSON·시설·시설유형·경사·캠퍼스 경계)를
 * 로드하는 훅. 지도 상호작용 로직(refs/이벤트)과 분리하기 위해 추출.
 *
 * 소스별로 status(loading|error|ready)와 retry를 노출한다. 접근성 데이터
 * (facilities/slopes)의 실패는 빈 배열로 대체하지 않고 error 상태로 유지해
 * "정보 없음"과 구분한다.
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

  const [buildingsStatus, setBuildingsStatus] =
    useState<SourceStatus>("loading");
  const [facilitiesStatus, setFacilitiesStatus] =
    useState<SourceStatus>("loading");
  const [facilityTypesStatus, setFacilityTypesStatus] =
    useState<SourceStatus>("loading");
  const [slopesStatus, setSlopesStatus] = useState<SourceStatus>("loading");
  const [landmarksStatus, setLandmarksStatus] =
    useState<SourceStatus>("loading");

  const loadBuildings = useCallback(() => {
    setBuildingsStatus("loading");
    setLoadingMap(true);
    Promise.all([
      fetch("/api/buildings").then((response) => {
        if (!response.ok) throw new Error(`buildings ${response.status}`);
        return response.json();
      }),
      fetch("/campus-boundaries.geojson").then((response) => {
        if (!response.ok) throw new Error(`boundaries ${response.status}`);
        return response.json();
      }),
    ])
      .then(([buildings, boundaries]) => {
        if (!buildings.features || !boundaries.features) {
          throw new Error("buildings/boundaries 응답 형식 오류");
        }
        setCampusBoundaries(boundaries);
        setGeoData(assignCampusesToBuildings(buildings, boundaries));
        setBuildingsStatus("ready");
      })
      .catch((err) => {
        console.error("buildings fetch 실패:", err);
        setBuildingsStatus("error");
      })
      .finally(() => setLoadingMap(false));
  }, []);

  const loadFacilities = useCallback(() => {
    setFacilitiesStatus("loading");
    fetch("/api/facilities")
      .then((r) => {
        if (!r.ok) throw new Error(`facilities ${r.status}`);
        return r.json();
      })
      .then((data) => {
        setFacilities(Array.isArray(data) ? data : []);
        setFacilitiesStatus("ready");
      })
      .catch((err) => {
        // 접근성 데이터: 실패를 빈 배열로 대체하지 않고 error로 유지.
        console.error("facilities fetch 실패:", err);
        setFacilitiesStatus("error");
      });
  }, []);

  const loadFacilityTypes = useCallback(() => {
    setFacilityTypesStatus("loading");
    supabase
      .from("facility_types")
      .select("code, label, label_en, label_zh, icon")
      .then(({ data, error }) => {
        if (error || !data) {
          if (error) console.error("facility_types fetch 실패:", error);
          setFacilityTypesStatus("error");
          return;
        }
        setFacilityTypes(data);
        setActiveTypes(Object.fromEntries(data.map((ft) => [ft.code, false])));
        setFacilityTypesStatus("ready");
      });
  }, []);

  const loadSlopes = useCallback(() => {
    setSlopesStatus("loading");
    fetch("/api/slopes")
      .then((r) => {
        if (!r.ok) throw new Error(`slopes ${r.status}`);
        return r.json();
      })
      .then((data) => {
        setSlopes(Array.isArray(data) ? data : []);
        setSlopesStatus("ready");
      })
      .catch((err) => {
        // 접근성 데이터: 실패를 빈 배열로 대체하지 않고 error로 유지.
        console.error("slopes fetch 실패:", err);
        setSlopesStatus("error");
      });
  }, []);

  const loadLandmarks = useCallback(() => {
    setLandmarksStatus("loading");
    fetch("/api/landmarks")
      .then((r) => {
        if (!r.ok) throw new Error(`landmarks ${r.status}`);
        return r.json();
      })
      .then((data) => {
        setLandmarks(Array.isArray(data) ? data : []);
        setLandmarksStatus("ready");
      })
      .catch((err) => {
        console.error("landmarks fetch 실패:", err);
        setLandmarksStatus("error");
      });
  }, []);

  useEffect(() => {
    loadBuildings();
  }, [loadBuildings]);
  useEffect(() => {
    loadFacilities();
  }, [loadFacilities]);
  useEffect(() => {
    loadFacilityTypes();
  }, [loadFacilityTypes]);
  useEffect(() => {
    loadSlopes();
  }, [loadSlopes]);
  useEffect(() => {
    loadLandmarks();
  }, [loadLandmarks]);

  const statuses: MapDataStatuses = {
    buildings: buildingsStatus,
    facilities: facilitiesStatus,
    slopes: slopesStatus,
    landmarks: landmarksStatus,
    facilityTypes: facilityTypesStatus,
  };

  const retry: MapDataRetry = {
    buildings: loadBuildings,
    facilities: loadFacilities,
    slopes: loadSlopes,
    landmarks: loadLandmarks,
    facilityTypes: loadFacilityTypes,
  };

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
    statuses,
    retry,
  };
}
