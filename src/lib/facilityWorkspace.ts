import type { AdminCollectionPolicy } from "@/lib/adminCollection";
import {
  EMPTY_FACILITY_FIELDS,
  type FacilityFieldValues,
} from "@/lib/facilityFields";
import { facilityNeedsTranslation } from "@/lib/facilityTranslationState";
import type { Facility, FacilityWithType } from "@/types/domain";

export type FacilityChip = "missing" | "translation" | "no-video";

export const FACILITY_CHIPS: { key: FacilityChip; label: string }[] = [
  { key: "missing", label: "미설치" },
  { key: "translation", label: "번역 필요" },
  { key: "no-video", label: "동영상 없음" },
];

export function facilityDisplayName(facility: FacilityWithType): string {
  return facility.name ?? facility.facility_types?.label ?? "이름 없는 시설";
}

export const FACILITY_COLLECTION_POLICY: AdminCollectionPolicy<
  FacilityWithType,
  FacilityChip
> = {
  id: (facility) => facility.id,
  name: facilityDisplayName,
  updatedAt: (facility) => facility.updated_at,
  searchText: (facility) => [
    facility.name,
    facility.name_en,
    facility.name_zh,
    facility.description,
  ],
  chips: {
    missing: (facility) => facility.is_installed === false,
    translation: (facility) => facilityNeedsTranslation(facility),
    "no-video": (facility) => !facility.video_url?.trim(),
  },
};

export function facilityFormFromRow(
  facility: Facility | null,
): FacilityFieldValues {
  if (!facility) return { ...EMPTY_FACILITY_FIELDS };
  return {
    facility_code: facility.facility_code ?? "",
    name: facility.name ?? "",
    description: facility.description ?? "",
    floor_info: facility.floor_info ?? "",
    is_installed: facility.is_installed ?? true,
    lat: facility.lat != null ? String(facility.lat) : "",
    lng: facility.lng != null ? String(facility.lng) : "",
  };
}

function coordinate(value: string): number | null {
  if (!value) return null;
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * 독립 시설 상세 패널의 초안 비교. 층 정보는 독립 시설에 없다.
 * 기존 시설의 설치 상태는 세그먼트가 바로 저장하므로 보지 않는다(설계 2026-10-14 4.2).
 */
export function facilityFormDirty(
  form: FacilityFieldValues,
  facility: Facility | null,
): boolean {
  const base = facilityFormFromRow(facility);
  return (
    form.facility_code !== base.facility_code ||
    form.name !== base.name ||
    form.description !== base.description ||
    coordinate(form.lat) !== coordinate(base.lat) ||
    coordinate(form.lng) !== coordinate(base.lng) ||
    (facility === null && form.is_installed !== base.is_installed)
  );
}
