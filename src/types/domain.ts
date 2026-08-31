import type { Feature, Polygon } from "geojson";
import type { Database } from "@supabase-types";

type Tables = Database["public"]["Tables"];

export type Building = Tables["buildings"]["Row"];
export type Facility = Tables["building_facilities"]["Row"];
export type FacilityType = Tables["facility_types"]["Row"];
export type College = Tables["colleges"]["Row"];
export type BuildingPhoto = Tables["building_photos"]["Row"];
export type Landmark = Tables["landmarks"]["Row"];

/** 프론트가 아이콘·색을 아는 시설 코드. 이 밖의 값은 폴백으로 떨어진다. */
export type FacilityCode =
  "elevator" | "restroom" | "ramp" | "parking" | "braille";

/** slope_segments.segments(jsonb) 내부 포인트 */
export interface SlopePoint {
  lat: number;
  lng: number;
  /** GPX 측정 원본에만 있다. 수기 경로는 null (GPX 폐기 시 제거) */
  ele: number | null;
  /** 수기 경로의 구간 값. 첫 포인트에는 없다 */
  slope?: number;
  distance?: number;
}

/** 경사 경로 (slope_segments Row + segments를 구체 타입으로) */
export type SlopeSegment = Omit<Tables["slope_segments"]["Row"], "segments"> & {
  segments: SlopePoint[];
};

/**
 * 조인 형상 — 쿼리마다 select하는 필드가 달라 조인 부분은 Partial로 넓혀
 * 서브셋 select 결과도 할당 가능하게 한다.
 */
export type FacilityWithType = Facility & {
  facility_types: Partial<
    Pick<FacilityType, "code" | "label" | "label_en" | "label_zh">
  > | null;
};

export type BuildingWithCollege = Building & {
  colleges: Partial<Pick<College, "name" | "name_en" | "name_zh">> | null;
};

/** /api/facilities 응답 — 시설 Row + 조인된 유형/건물명 */
export type MapFacility = FacilityWithType & {
  buildings: Partial<Pick<Building, "name" | "name_en">> | null;
};

/** localStorage("ku_favorites")에 저장되는 즐겨찾기 항목 */
export interface Favorite {
  id: number;
  name: string;
}

/** /api/buildings가 돌려주는 폴리곤 피처의 properties */
export interface BuildingFeatureProperties {
  id: number;
  name: string;
  name_en?: string | null;
  name_zh?: string | null;
  campus?: string | null;
}

export type BuildingFeature = Feature<Polygon, BuildingFeatureProperties>;
