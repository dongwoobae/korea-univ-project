export interface FacilityFieldValues {
  facility_code: string;
  name: string;
  description: string;
  floor_info: string;
  is_installed: boolean;
  lat: string;
  lng: string;
}

export const EMPTY_FACILITY_FIELDS: FacilityFieldValues = {
  facility_code: "",
  name: "",
  description: "",
  floor_info: "",
  is_installed: true,
  lat: "",
  lng: "",
};

/** facility_requests의 check 제약과 같다. */
export const FACILITY_FIELD_LIMITS = {
  name: 100,
  description: 1000,
  floor_info: 100,
} as const;

export interface ParsedFacilityFields {
  facility_code: string;
  name: string | null;
  description: string | null;
  floor_info: string | null;
  is_installed: boolean;
  lat: number | null;
  lng: number | null;
}

function optionalText(
  value: unknown,
  limit: number,
): string | null | undefined {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (trimmed.length > limit) return undefined;
  return trimmed === "" ? null : trimmed;
}

function optionalNumber(value: unknown): number | null | undefined {
  if (value === undefined || value === null || value === "") return null;
  const parsed = typeof value === "string" ? Number(value) : value;
  return typeof parsed === "number" && Number.isFinite(parsed)
    ? parsed
    : undefined;
}

/** 서버 검증. 클라이언트의 validateFacilityForm은 유형·좌표만 보므로 대신 쓰지 않는다(설계 3.2). */
export function parseFacilityFields(
  input: unknown,
): ParsedFacilityFields | null {
  if (!input || typeof input !== "object") return null;
  const value = input as Record<string, unknown>;

  const code =
    typeof value.facility_code === "string" ? value.facility_code.trim() : "";
  if (!code) return null;

  const name = optionalText(value.name, FACILITY_FIELD_LIMITS.name);
  const description = optionalText(
    value.description,
    FACILITY_FIELD_LIMITS.description,
  );
  const floor = optionalText(
    value.floor_info,
    FACILITY_FIELD_LIMITS.floor_info,
  );
  if (name === undefined || description === undefined || floor === undefined)
    return null;

  if (
    value.is_installed !== undefined &&
    typeof value.is_installed !== "boolean"
  )
    return null;

  const lat = optionalNumber(value.lat);
  const lng = optionalNumber(value.lng);
  if (lat === undefined || lng === undefined) return null;
  if ((lat === null) !== (lng === null)) return null;
  if (lat !== null && (lat < -90 || lat > 90)) return null;
  if (lng !== null && (lng < -180 || lng > 180)) return null;

  return {
    facility_code: code,
    name,
    description,
    floor_info: floor,
    is_installed: value.is_installed ?? true,
    lat,
    lng,
  };
}
