import {
  Accessibility,
  ArrowUpDown,
  GripVertical,
  Sparkles,
  SquareParking,
  Toilet,
  TrainFront,
  TrendingUp,
} from "lucide-static";
import type { FacilityCode } from "@/types/domain";

export type FacilityIconKey = FacilityCode | "fallback";

const FACILITY_ICON_KEY: Record<FacilityCode, FacilityIconKey> = {
  elevator: "elevator",
  restroom: "restroom",
  ramp: "ramp",
  parking: "parking",
  braille: "braille",
};

export function facilityIconKey(
  code: string | null | undefined,
): FacilityIconKey {
  const key = code ?? "";
  return Object.hasOwn(FACILITY_ICON_KEY, key)
    ? FACILITY_ICON_KEY[key as FacilityCode]
    : "fallback";
}

export const FACILITY_ICON_SVG: Record<FacilityIconKey, string> = {
  elevator: ArrowUpDown,
  restroom: Toilet,
  ramp: TrendingUp,
  parking: SquareParking,
  braille: GripVertical,
  fallback: Accessibility,
};

export const LANDMARK_ICON_SVG = Sparkles;
export const SUBWAY_ICON_SVG = TrainFront;
export const FACILITY_CLUSTER_ICON_SVG = Accessibility;

/** lucide-static SVG는 24px 고정이라 자리 크기에 맞춰 덮어쓴다. */
export function sizedIconSvg(svg: string, size: number): string {
  return svg
    .replace('width="24"', `width="${size}"`)
    .replace('height="24"', `height="${size}"`);
}

export function facilityIconSvg(
  code: string | null | undefined,
  size: number,
): string {
  return sizedIconSvg(FACILITY_ICON_SVG[facilityIconKey(code)], size);
}
