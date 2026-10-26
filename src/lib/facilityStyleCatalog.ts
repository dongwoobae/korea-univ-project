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
  SquareParking,
  Stethoscope,
  Toilet,
  TrainFront,
  TrendingUp,
  Utensils,
  Wifi,
} from "lucide-static";
import { ELEVATOR_ICON_SVG, sizedIconSvg } from "@/lib/mapIcons";

/** 관리자가 시설 종류에 고르는 아이콘·색. 설계: docs/specs/2026-10-26-facility-type-management-design.md 1.3 */

export const FACILITY_ICON_CHOICES = [
  { key: "accessibility", label: "휠체어" },
  { key: "elevator", label: "엘리베이터" },
  { key: "toilet", label: "화장실" },
  { key: "trending-up", label: "경사로" },
  { key: "square-parking", label: "주차" },
  { key: "grip-vertical", label: "점자" },
  { key: "sofa", label: "소파" },
  { key: "armchair", label: "의자" },
  { key: "door-open", label: "문" },
  { key: "baby", label: "수유·기저귀" },
  { key: "glass-water", label: "음수대" },
  { key: "bath", label: "욕실" },
  { key: "shower-head", label: "샤워" },
  { key: "heart-pulse", label: "자동심장충격기" },
  { key: "stethoscope", label: "보건" },
  { key: "ear", label: "청각 보조" },
  { key: "hand", label: "도움" },
  { key: "phone", label: "전화" },
  { key: "info", label: "안내" },
  { key: "bell", label: "호출벨" },
  { key: "utensils", label: "식당" },
  { key: "coffee", label: "카페" },
  { key: "bus", label: "버스" },
  { key: "train-front", label: "지하철" },
  { key: "footprints", label: "보행로" },
  { key: "map-pin", label: "위치" },
  { key: "printer", label: "프린터" },
  { key: "book-open", label: "열람" },
  { key: "wifi", label: "와이파이" },
  { key: "battery-charging", label: "충전" },
] as const;

export type FacilityIconKey = (typeof FACILITY_ICON_CHOICES)[number]["key"];

export const FACILITY_ICON_SVG: Record<FacilityIconKey, string> = {
  accessibility: Accessibility,
  elevator: ELEVATOR_ICON_SVG,
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

export const FACILITY_COLOR_CHOICES = [
  { hex: "#2D5FB0", label: "파랑" },
  { hex: "#2F7A4F", label: "초록" },
  { hex: "#0F766E", label: "청록" },
  { hex: "#B25617", label: "주황" },
  { hex: "#8A6A00", label: "황토" },
  { hex: "#6D4AB0", label: "보라" },
  { hex: "#BE185D", label: "분홍" },
  { hex: "#B91C1C", label: "빨강" },
  { hex: "#475569", label: "청회색" },
  { hex: "#666666", label: "회색" },
] as const;

export interface FacilityStyle {
  icon: FacilityIconKey;
  color: string;
}

export const FALLBACK_FACILITY_STYLE: FacilityStyle = {
  icon: "accessibility",
  color: "#666666",
};

const HEX_COLOR = /^#[0-9A-F]{6}$/;

export function isFacilityIconKey(value: unknown): value is FacilityIconKey {
  return typeof value === "string" && Object.hasOwn(FACILITY_ICON_SVG, value);
}

/** DB 검사가 없는 아이콘 키, 마이그레이션 전 행(칸 없음)까지 받아 칸마다 대체값으로 떨어뜨린다. 설계 1.1·2.4 */
export function facilityStyleOf(
  types: readonly {
    code: string;
    icon?: string | null;
    color?: string | null;
  }[],
  code: string | null | undefined,
): FacilityStyle {
  const type = code ? types.find((item) => item.code === code) : undefined;
  if (!type) return FALLBACK_FACILITY_STYLE;
  return {
    icon: isFacilityIconKey(type.icon)
      ? type.icon
      : FALLBACK_FACILITY_STYLE.icon,
    color:
      typeof type.color === "string" && HEX_COLOR.test(type.color)
        ? type.color
        : FALLBACK_FACILITY_STYLE.color,
  };
}

export function facilityIconSvg(icon: string, size: number): string {
  return sizedIconSvg(
    FACILITY_ICON_SVG[
      isFacilityIconKey(icon) ? icon : FALLBACK_FACILITY_STYLE.icon
    ],
    size,
  );
}
