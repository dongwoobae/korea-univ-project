import type { FacilityCode } from "@/types/domain";
import { facilityColor } from "@/lib/theme";

const FACILITY_COLORS: Record<FacilityCode, string> = {
  ...facilityColor,
};

const FALLBACK_PALETTE = [
  "#0891B2",
  "#BE185D",
  "#15803D",
  "#B45309",
  "#6D28D9",
  "#0F766E",
  "#C2410C",
  "#1D4ED8",
  "#7E22CE",
  "#047857",
];

function knownColor(code: string): string | undefined {
  return Object.hasOwn(FACILITY_COLORS, code)
    ? FACILITY_COLORS[code as FacilityCode]
    : undefined;
}

export function getFacilityMarkerColor(code: string): string {
  return knownColor(code) ?? "#666";
}

export function getFacilityColor(code: string, index: number): string {
  return knownColor(code) ?? FALLBACK_PALETTE[index % FALLBACK_PALETTE.length];
}
