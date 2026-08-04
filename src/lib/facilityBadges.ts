import { facilityNeedsTranslation } from "@/lib/facilityTranslationState";

export type FacilityBadge = "missing" | "translation_needed";

type FacilityBadgeSource = { is_installed: boolean | null } & Parameters<
  typeof facilityNeedsTranslation
>[0];

export function getFacilityBadges(
  facility: FacilityBadgeSource,
): FacilityBadge[] {
  const badges: FacilityBadge[] = [];
  if (facility.is_installed !== true) badges.push("missing");
  if (facilityNeedsTranslation(facility)) badges.push("translation_needed");
  return badges;
}
