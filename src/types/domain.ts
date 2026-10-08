import type { Feature, Polygon } from "geojson";
import type { Database } from "@supabase-types";

type Tables = Database["public"]["Tables"];

export type Building = Tables["buildings"]["Row"];
export type Facility = Tables["building_facilities"]["Row"];
export type FacilityType = Tables["facility_types"]["Row"];
export type FacilityPhoto = Tables["facility_photos"]["Row"];
export type College = Tables["colleges"]["Row"];
export type BuildingPhoto = Tables["building_photos"]["Row"];
export type Landmark = Tables["landmarks"]["Row"];

/** 프론트가 아이콘·색을 아는 시설 코드. 이 밖의 값은 폴백으로 떨어진다. */
export type FacilityCode =
  "elevator" | "restroom" | "ramp" | "parking" | "braille";

/** slope_segments.segments(jsonb)의 시작 꼭짓점 */
export interface SlopeRouteStart {
  lat: number;
  lng: number;
}

/** 시작 다음 꼭짓점. 앞 꼭짓점에서 여기까지 구간의 값을 싣는다 */
export interface SlopeRoutePoint extends SlopeRouteStart {
  /** 구간 경사. 단위는 도(°), 0~45. 판정은 src/lib/slopeScale.ts */
  slope: number;
  /** 구간 길이(m) */
  distance: number;
}

/** readRoutePoints를 통과한 경로 */
export type SlopeRoutePoints = [SlopeRouteStart, ...SlopeRoutePoint[]];

/** segments는 jsonb라 readRoutePoints로 읽기 전에는 모양을 믿지 않는다 */
export type SlopeSegment = Tables["slope_segments"]["Row"];

/**
 * 조인 형상 — 쿼리마다 select하는 필드가 달라 조인 부분은 Partial로 넓혀
 * 서브셋 select 결과도 할당 가능하게 한다.
 */
export type FacilityWithType = Facility & {
  facility_types: Partial<
    Pick<FacilityType, "code" | "label" | "label_en" | "label_zh">
  > | null;
  /** 조회가 facility_photos를 embed한 경우에만 있다 */
  facility_photos?: Pick<
    FacilityPhoto,
    "id" | "storage_path" | "sort_order" | "created_at"
  >[];
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
