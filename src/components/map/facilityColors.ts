import type { FacilityCode } from "@/types/domain";

export const FACILITY_COLORS: Record<FacilityCode, string> = {
  elevator: "#2563EB",
  restroom: "#16A34A",
  ramp: "#EA580C",
  parking: "#7C3AED",
  braille: "#CA8A04",
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

export function getFacilityColor(code: string, index: number): string {
  return (
    FACILITY_COLORS[code as FacilityCode] ??
    FALLBACK_PALETTE[index % FALLBACK_PALETTE.length]
  );
}
