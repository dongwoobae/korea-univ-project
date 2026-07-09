import type { Database } from "@supabase-types";

type Tables = Database["public"]["Tables"];

export type Building = Tables["buildings"]["Row"];
export type Facility = Tables["building_facilities"]["Row"];
export type FacilityType = Tables["facility_types"]["Row"];
export type College = Tables["colleges"]["Row"];
export type BuildingPhoto = Tables["building_photos"]["Row"];

/** facilityColors의 알려진 시설 코드 */
export type FacilityCode = "elevator" | "restroom" | "ramp" | "parking" | "braille";
