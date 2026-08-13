"use client";

import {
  Accessibility,
  ArrowUpDown,
  GripVertical,
  SquareParking,
  Toilet,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import { facilityIconKey, type FacilityIconKey } from "@/lib/mapIcons";

// mapIcons.ts의 SVG 테이블과 같은 키 union을 써서 한쪽만 고치면 타입 오류가 난다.
const FACILITY_ICON: Record<FacilityIconKey, LucideIcon> = {
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
