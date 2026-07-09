import type { Database } from "@supabase-types";

type Tables = Database["public"]["Tables"];

export type Building = Tables["buildings"]["Row"];
export type Facility = Tables["building_facilities"]["Row"];
export type FacilityType = Tables["facility_types"]["Row"];
export type College = Tables["colleges"]["Row"];
export type BuildingPhoto = Tables["building_photos"]["Row"];

/** facilityColors의 알려진 시설 코드 */
export type FacilityCode = "elevator" | "restroom" | "ramp" | "parking" | "braille";

/** slope_segments.segments(jsonb) 내부 포인트 */
export interface SlopePoint {
  lat: number;
  lng: number;
  ele: number | null;
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
  facility_types: Partial<Pick<FacilityType, "code" | "label" | "label_en" | "label_zh" | "icon">> | null;
};

export type BuildingWithCollege = Building & {
  colleges: Partial<Pick<College, "name" | "name_en" | "name_zh">> | null;
};
