"use client";

import {
  Accessibility,
  GripVertical,
  Sparkles,
  SquareParking,
  Toilet,
  TrendingUp,
  createLucideIcon,
  type LucideIcon,
} from "lucide-react";
import {
  ELEVATOR_ICON_NODE,
  facilityIconKey,
  landmarkEmoji,
  type FacilityIconKey,
} from "@/lib/mapIcons";

/**
 * 마커 SVG와 같은 노드에서 만든다 — 두 벌이 갈라지지 않게 하는 것이
 * `iconography.test.ts`의 짝 검사가 지키는 성질이다.
 */
const Elevator = createLucideIcon("elevator", ELEVATOR_ICON_NODE);

// Leaflet divIcon은 HTML 문자열을, JSX는 컴포넌트를 요구해 같은 매핑을 두 벌 둔다.
export const FACILITY_ICON: Record<FacilityIconKey, LucideIcon> = {
  elevator: Elevator,
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

export const LANDMARK_CATEGORY_ICON = Sparkles;

export function LandmarkCategoryIcon({ size = 18 }: { size?: number }) {
  return <LANDMARK_CATEGORY_ICON size={size} aria-hidden="true" />;
}

interface LandmarkEmojiProps {
  icon: string | null | undefined;
  size?: number;
}

export function LandmarkEmoji({ icon, size = 18 }: LandmarkEmojiProps) {
  return (
    <span aria-hidden="true" style={{ fontSize: size }}>
      {landmarkEmoji(icon)}
    </span>
  );
}
