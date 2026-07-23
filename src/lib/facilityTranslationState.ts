import type { Facility } from "@/types/domain";

type FacilityTranslationSource = Pick<
  Facility,
  | "name"
  | "name_en"
  | "name_zh"
  | "description"
  | "description_en"
  | "description_zh"
  | "floor_info"
  | "floor_info_en"
  | "floor_info_zh"
  | "translation_status"
>;

const translationFields = [
  ["name", "name_en", "name_zh"],
  ["description", "description_en", "description_zh"],
  ["floor_info", "floor_info_en", "floor_info_zh"],
] as const;

function hasText(value: string | null | undefined) {
  return Boolean(value?.trim());
}

export function facilityNeedsTranslation(facility: FacilityTranslationSource) {
  if (facility.translation_status !== "translated") return true;

  return translationFields.some(
    ([source, english, chinese]) =>
      hasText(facility[source]) &&
      (!hasText(facility[english]) || !hasText(facility[chinese])),
  );
}

export function getFacilityTranslationTexts(
  facility: Pick<Facility, "name" | "description" | "floor_info">,
) {
  const texts: Record<string, string> = {};
  if (hasText(facility.name)) texts.name = facility.name!.trim();
  if (hasText(facility.description))
    texts.description = facility.description!.trim();
  if (hasText(facility.floor_info))
    texts.floor_info = facility.floor_info!.trim();
  return texts;
}
