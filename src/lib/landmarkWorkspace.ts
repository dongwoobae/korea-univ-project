import type { AdminCollectionPolicy } from "@/lib/adminCollection";
import {
  inferCampusFromPoint,
  type CampusBoundaryCollection,
} from "@/lib/campusGeometry";
import { landmarkEmoji } from "@/lib/mapIcons";
import type { Landmark } from "@/types/domain";

export type LandmarkChip = "no-photo" | "translation";

export const LANDMARK_CHIPS: { key: LandmarkChip; label: string }[] = [
  { key: "no-photo", label: "사진 없음" },
  { key: "translation", label: "번역 없음" },
];

function hasText(value: string | null | undefined) {
  return Boolean(value?.trim());
}

const translationFields = [
  ["name", "name_en", "name_zh"],
  ["description", "description_en", "description_zh"],
] as const;

type LandmarkTranslationSource = Pick<
  Landmark,
  | "name"
  | "name_en"
  | "name_zh"
  | "description"
  | "description_en"
  | "description_zh"
>;

/**
 * 명소에는 번역 상태 컬럼이 없어 값만 본다. 원문이 있는 필드의 영문·중문이 하나라도 비면 필요하다
 * (설계 2026-10-14 5장 — 시설의 번역 필요와 같은 규칙).
 */
export function landmarkNeedsTranslation(landmark: LandmarkTranslationSource) {
  return translationFields.some(
    ([source, english, chinese]) =>
      hasText(landmark[source]) &&
      (!hasText(landmark[english]) || !hasText(landmark[chinese])),
  );
}

export function landmarkDisplayName(landmark: Pick<Landmark, "name">): string {
  return landmark.name?.trim() || "이름 없는 명소";
}

export const LANDMARK_COLLECTION_POLICY: AdminCollectionPolicy<
  Landmark,
  LandmarkChip
> = {
  id: (landmark) => landmark.id,
  name: landmarkDisplayName,
  updatedAt: (landmark) => landmark.updated_at,
  searchText: (landmark) => [
    landmark.name,
    landmark.name_en,
    landmark.name_zh,
    landmark.description,
  ],
  chips: {
    "no-photo": (landmark) => !hasText(landmark.photo_url),
    translation: landmarkNeedsTranslation,
  },
};

/** `landmarks`에는 캠퍼스 컬럼이 없어 좌표로 판정한다. 경계를 받기 전에는 빈 값이다 */
export function landmarkCampusLabel(
  point: { lat: number; lng: number },
  boundaries: CampusBoundaryCollection | null,
): string {
  if (!boundaries) return "";
  return (
    inferCampusFromPoint([point.lng, point.lat], boundaries) ?? "캠퍼스 밖"
  );
}

export interface LandmarkFormValues {
  name: string;
  name_en: string;
  name_zh: string;
  description: string;
  description_en: string;
  description_zh: string;
  icon: string;
  lat: string;
  lng: string;
}

export function landmarkFormFromRow(
  landmark: Landmark | null,
): LandmarkFormValues {
  return {
    name: landmark?.name ?? "",
    name_en: landmark?.name_en ?? "",
    name_zh: landmark?.name_zh ?? "",
    description: landmark?.description ?? "",
    description_en: landmark?.description_en ?? "",
    description_zh: landmark?.description_zh ?? "",
    icon: landmarkEmoji(landmark?.icon),
    lat: landmark?.lat != null ? String(landmark.lat) : "",
    lng: landmark?.lng != null ? String(landmark.lng) : "",
  };
}

function coordinate(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

const TEXT_FIELDS = [
  "name",
  "name_en",
  "name_zh",
  "description",
  "description_en",
  "description_zh",
  "icon",
] as const;

/**
 * 상세 패널의 초안 비교. 저장할 때 트림하므로 앞뒤 공백은 보지 않는다.
 * 기존 명소의 사진은 고르는 즉시 저장하므로 초안이 아니다. 새 명소는 저장할 때 올릴 사진도 초안이다.
 */
export function landmarkFormDirty(
  form: LandmarkFormValues,
  landmark: Landmark | null,
  pendingPhoto: File | null,
): boolean {
  const base = landmarkFormFromRow(landmark);
  return (
    TEXT_FIELDS.some((field) => form[field].trim() !== base[field].trim()) ||
    coordinate(form.lat) !== coordinate(base.lat) ||
    coordinate(form.lng) !== coordinate(base.lng) ||
    (landmark === null && pendingPhoto !== null)
  );
}

export function validateLandmarkForm(form: LandmarkFormValues): string | null {
  if (!form.name.trim()) return "명소 이름을 입력해주세요";
  if (!form.icon.trim()) return "이모지를 골라주세요";
  if (coordinate(form.lat) === null || coordinate(form.lng) === null) {
    return "지도에서 위치를 선택해주세요";
  }
  return null;
}

function textOrNull(value: string) {
  return value.trim() || null;
}

/** 사진 주소는 싣지 않는다 — 실으면 즉시 바꾼 사진을 폼이 처음 읽은 값으로 되돌린다 */
export function buildLandmarkPayload(form: LandmarkFormValues) {
  return {
    name: form.name.trim(),
    name_en: textOrNull(form.name_en),
    name_zh: textOrNull(form.name_zh),
    description: textOrNull(form.description),
    description_en: textOrNull(form.description_en),
    description_zh: textOrNull(form.description_zh),
    icon: form.icon.trim(),
    lat: parseFloat(form.lat),
    lng: parseFloat(form.lng),
  };
}
