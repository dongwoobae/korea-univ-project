"use client";

import {
  Accessibility,
  Armchair,
  Baby,
  Bath,
  BatteryCharging,
  Bell,
  BookOpen,
  Bus,
  Coffee,
  DoorOpen,
  Ear,
  Footprints,
  GlassWater,
  GripVertical,
  Hand,
  HeartPulse,
  Info,
  MapPin,
  Phone,
  Printer,
  ShowerHead,
  Sofa,
  Sparkles,
  SquareParking,
  Stethoscope,
  Toilet,
  TrainFront,
  TrendingUp,
  Utensils,
  Wifi,
  createLucideIcon,
  type LucideIcon,
} from "lucide-react";
import {
  facilityStyleOf,
  type FacilityIconKey,
} from "@/lib/facilityStyleCatalog";
import { useFacilityTypes } from "@/lib/facilityTypesStore";
import { ELEVATOR_ICON_NODE, landmarkEmoji } from "@/lib/mapIcons";

/**
 * 마커 SVG와 같은 노드에서 만든다 — 두 벌이 갈라지지 않게 하는 것이
 * `iconography.test.ts`의 짝 검사가 지키는 성질이다.
 */
const Elevator = createLucideIcon("elevator", ELEVATOR_ICON_NODE);

// Leaflet divIcon은 HTML 문자열을, JSX는 컴포넌트를 요구해 같은 매핑을 두 벌 둔다(마커 쪽은 facilityStyleCatalog.ts).
export const FACILITY_ICON: Record<FacilityIconKey, LucideIcon> = {
  accessibility: Accessibility,
  elevator: Elevator,
  toilet: Toilet,
  "trending-up": TrendingUp,
  "square-parking": SquareParking,
  "grip-vertical": GripVertical,
  sofa: Sofa,
  armchair: Armchair,
  "door-open": DoorOpen,
  baby: Baby,
  "glass-water": GlassWater,
  bath: Bath,
  "shower-head": ShowerHead,
  "heart-pulse": HeartPulse,
  stethoscope: Stethoscope,
  ear: Ear,
  hand: Hand,
  phone: Phone,
  info: Info,
  bell: Bell,
  utensils: Utensils,
  coffee: Coffee,
  bus: Bus,
  "train-front": TrainFront,
  footprints: Footprints,
  "map-pin": MapPin,
  printer: Printer,
  "book-open": BookOpen,
  wifi: Wifi,
  "battery-charging": BatteryCharging,
};

interface FacilityTypeIconProps {
  code: string | null | undefined;
  size?: number;
}

export function FacilityTypeIcon({ code, size = 18 }: FacilityTypeIconProps) {
  const { types, loaded, status } = useFacilityTypes();
  // 처음 받기 전에 휠체어 대체 아이콘이 번쩍이지 않게 자리만 둔다. 받기에 실패했으면 대체 아이콘이다
  if (!loaded && status === "loading")
    return (
      <span
        aria-hidden="true"
        style={{ display: "inline-block", width: size, height: size }}
      />
    );
  const Icon = FACILITY_ICON[facilityStyleOf(types, code).icon];
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
