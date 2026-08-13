"use client";

import {
  Accessibility,
  ArrowUpDown,
  GripVertical,
  Sparkles,
  SquareParking,
  Toilet,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import { facilityIconKey, type FacilityIconKey } from "@/lib/mapIcons";

// Leaflet divIcon은 HTML 문자열을, JSX는 컴포넌트를 요구해 같은 매핑을 두 벌 둔다.
export const FACILITY_ICON: Record<FacilityIconKey, LucideIcon> = {
  elevator: ArrowUpDown,
  restroom: Toilet,
  ramp: TrendingUp,
  parking: SquareParking,
  braille: GripVertical,
  fallback: Accessibility,
};

interface FacilityTypeIconProps {
  code: string | null | undefined;
  size?: number;
}

export function FacilityTypeIcon({ code, size = 18 }: FacilityTypeIconProps) {
  const Icon = FACILITY_ICON[facilityIconKey(code)];
  return <Icon size={size} aria-hidden="true" />;
}

export const LANDMARK_ICON = Sparkles;

export function LandmarkIcon({ size = 18 }: { size?: number }) {
  return <LANDMARK_ICON size={size} aria-hidden="true" />;
}
