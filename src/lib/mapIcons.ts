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

export const LANDMARK_CATEGORY_ICON_SVG = Sparkles;
export const SUBWAY_ICON_SVG = TrainFront;
export const FACILITY_CLUSTER_ICON_SVG = Accessibility;

export const LANDMARK_FALLBACK_EMOJI = "✨";

/** 키캡(1️⃣)만 숫자·#·*로 시작한다. 그 밖의 ASCII는 아래에서 허용하지 않는다. */
const KEYCAP = /^[0-9#*]️?⃣$/;

/**
 * 이어 붙이는 부품(ZWJ·이형 선택자·스킨톤·태그)까지 허용하되,
 * `Extended_Pictographic`만으로는 국기(Regional_Indicator)가 빠진다.
 */
const EMOJI_ONLY =
  /^[\p{Extended_Pictographic}\p{Regional_Indicator}‍️\u{1F3FB}-\u{1F3FF}\u{E0020}-\u{E007F}]+$/u;

/** 부품만 있고 글리프가 없는 값(ZWJ 단독 등)을 막는다. */
const HAS_GLYPH = /[\p{Extended_Pictographic}\p{Regional_Indicator}]/u;

/**
 * 타입은 `string`이지만 배포 창에서는 필드 자체가 오지 않는다 —
 * 근거는 `docs/specs/2026-08-18-restore-landmark-emoji-design.md`의
 * "배포 순서" 절에 있다.
 *
 * 이모지가 아닌 값까지 걸러내는 이유는
 * `docs/specs/2026-09-03-landmark-emoji-picker-design.md`의 "렌더 가드" 절에 있다.
 */
export function landmarkEmoji(icon: string | null | undefined): string {
  const value = icon?.trim();
  if (!value) return LANDMARK_FALLBACK_EMOJI;
  const isEmoji =
    KEYCAP.test(value) || (EMOJI_ONLY.test(value) && HAS_GLYPH.test(value));
  return isEmoji ? value : LANDMARK_FALLBACK_EMOJI;
}

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
