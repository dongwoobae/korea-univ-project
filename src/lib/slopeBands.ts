/**
 * 경사 색 구간. 관리자가 `app_settings`의 `slope_bands`로 고치고 공개 지도와 관리자 화면이 같은 구간으로 그린다
 * — docs/specs/2026-10-19-slope-bands-design.md 2장.
 */
import {
  BOUNDARY_TOLERANCE,
  RAMP_EXCEPTION_RATIO,
  RELAXED_RATIO,
  WALKWAY_RATIO,
  degToPercent,
  formatSlopeInput,
  percentToDeg,
} from "@/lib/slopeScale";

// interface가 아니라 type이다 — Supabase의 Json 형에 그대로 넣으려면 암묵적 인덱스 시그니처가 필요하다
export type SlopeBand = {
  name: string;
  /** %, 반올림하지 않는다. 마지막 구간만 null(그 위 전부) */
  upperPercent: number | null;
  color: string;
  description: string;
};

export type SlopeBandsSetting = { bands: SlopeBand[] };

export type SlopeBandsValidation =
  { ok: true; value: SlopeBandsSetting } | { ok: false; errors: string[] };

export const SLOPE_BANDS_SETTING_KEY = "slope_bands";
export const MIN_SLOPE_BANDS = 2;
export const MAX_SLOPE_BANDS = 6;
// 45°(MAX_SLOPE_DEG)의 %. degToPercent(45)는 부동소수로 100보다 조금 작아 그 값으로 두면 100을 거부한다
export const MAX_UPPER_PERCENT = 100;
const MAX_NAME_LENGTH = 20;
const MAX_DESCRIPTION_LENGTH = 200;
const MIN_UPPER_GAP = 0.01;

export const DEFAULT_SLOPE_BANDS: readonly SlopeBand[] = [
  {
    name: "보도 기준 이내",
    upperPercent: WALKWAY_RATIO * 100,
    color: "#8BC34A",
    description: "보도 기준 1/18 이하",
  },
  {
    name: "완화 범위",
    upperPercent: RELAXED_RATIO * 100,
    color: "#FFD600",
    description: "완화 한도 1/12 이하",
  },
  {
    name: "특례 범위",
    upperPercent: RAMP_EXCEPTION_RATIO * 100,
    color: "#FF9800",
    description: "경사로 특례 한도 1/8 이하",
  },
  { name: "초과", upperPercent: null, color: "#E53935", description: "" },
];

const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;

export function isHexColor(value: string): boolean {
  return HEX_COLOR.test(value);
}

/** 관리자 폼과 API가 같이 쓴다. 통과하면 정규화한 값을, 아니면 오류 문구 목록을 돌려준다 */
export function validateSlopeBands(value: unknown): SlopeBandsValidation {
  const raw =
    value && typeof value === "object"
      ? (value as { bands?: unknown }).bands
      : undefined;
  if (!Array.isArray(raw))
    return { ok: false, errors: ["범례 설정 형식이 올바르지 않아요"] };
  if (raw.length < MIN_SLOPE_BANDS || raw.length > MAX_SLOPE_BANDS)
    return {
      ok: false,
      errors: [`구간은 ${MIN_SLOPE_BANDS}~${MAX_SLOPE_BANDS}개여야 해요`],
    };

  const errors: string[] = [];
  const bands: SlopeBand[] = [];
  let previousUpper: number | null = null;
  raw.forEach((entry: unknown, index) => {
    const label = `구간 ${index + 1}`;
    const fields =
      entry && typeof entry === "object"
        ? (entry as Record<string, unknown>)
        : {};

    const name = typeof fields.name === "string" ? fields.name.trim() : "";
    if (name.length < 1 || name.length > MAX_NAME_LENGTH)
      errors.push(`${label}의 이름을 1~${MAX_NAME_LENGTH}자로 적어 주세요`);

    const description =
      fields.description === undefined
        ? ""
        : typeof fields.description === "string"
          ? fields.description.trim()
          : null;
    if (description === null || description.length > MAX_DESCRIPTION_LENGTH)
      errors.push(`${label}의 설명은 ${MAX_DESCRIPTION_LENGTH}자까지예요`);

    const color =
      typeof fields.color === "string" && isHexColor(fields.color)
        ? fields.color.toUpperCase()
        : null;
    if (!color) errors.push(`${label}의 색은 #RRGGBB 꼴로 적어 주세요`);

    const upper = fields.upperPercent;
    let upperPercent: number | null = null;
    if (index === raw.length - 1) {
      if (upper !== null) errors.push("마지막 구간에는 상한을 두지 않아요");
    } else if (
      typeof upper !== "number" ||
      !Number.isFinite(upper) ||
      upper <= 0 ||
      upper > MAX_UPPER_PERCENT
    ) {
      errors.push(
        `${label}의 상한을 0%보다 크고 ${MAX_UPPER_PERCENT}% 이하로 적어 주세요`,
      );
    } else {
      // 간격이 판정 허용오차보다 좁으면 뒤 구간의 정확한 상한이 앞 구간으로 판정된다(설계 2.4)
      if (
        previousUpper !== null &&
        upper - previousUpper < MIN_UPPER_GAP - BOUNDARY_TOLERANCE
      )
        errors.push(
          `${label}의 상한은 앞 구간보다 ${MIN_UPPER_GAP}%p 이상 커야 해요`,
        );
      upperPercent = upper;
    }
    previousUpper = upperPercent;

    bands.push({
      name,
      upperPercent,
      color: color ?? "",
      description: description ?? "",
    });
  });

  return errors.length > 0
    ? { ok: false, errors }
    : { ok: true, value: { bands } };
}

/** DB 값을 읽는다. 일부 구간만 살리면 경계가 끊기거나 마지막 구간이 상한을 가져, 실패하면 기본값 전체로 그린다 */
export function readSlopeBands(value: unknown): readonly SlopeBand[] {
  const result = validateSlopeBands(value);
  if (result.ok) return result.value.bands;
  console.warn("[slope-bands] 저장된 범례를 읽지 못해 기본값으로 그린다", {
    errors: result.errors,
  });
  return DEFAULT_SLOPE_BANDS;
}

export function slopeBandIndexFromDeg(
  bands: readonly SlopeBand[],
  deg: number,
): number {
  const percent = degToPercent(Math.abs(deg));
  const last = bands.length - 1;
  for (let index = 0; index < last; index++) {
    const upper = bands[index].upperPercent;
    if (upper !== null && percent <= upper + BOUNDARY_TOLERANCE) return index;
  }
  return last;
}

export function slopeBandFromDeg(
  bands: readonly SlopeBand[],
  deg: number,
): SlopeBand {
  return bands[slopeBandIndexFromDeg(bands, deg)];
}

const DARK_TEXT = "#1C1917";
const LIGHT_TEXT = "#FFFFFF";

function relativeLuminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [n >> 16, (n >> 8) & 255, n & 255].map((channel) => {
    const c = channel / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(a: string, b: string): number {
  const [lighter, darker] = [relativeLuminance(a), relativeLuminance(b)].sort(
    (x, y) => y - x,
  );
  return (lighter + 0.05) / (darker + 0.05);
}

/** 관리자가 아무 색이나 고를 수 있어 글자색을 표로 정할 수 없다(설계 5장) */
export function readableTextOn(
  hex: string,
): typeof DARK_TEXT | typeof LIGHT_TEXT {
  return contrastRatio(hex, DARK_TEXT) >= contrastRatio(hex, LIGHT_TEXT)
    ? DARK_TEXT
    : LIGHT_TEXT;
}

function percentText(percent: number): string {
  return formatSlopeInput(percentToDeg(percent), "percent");
}

function degText(percent: number): string {
  return formatSlopeInput(percentToDeg(percent), "deg");
}

/** 범례 칸의 접근 이름에 붙는 범위(설계 4.4) */
export function slopeBandRangeLabel(
  bands: readonly SlopeBand[],
  index: number,
): string {
  const upper = bands[index].upperPercent;
  const lower = index === 0 ? null : bands[index - 1].upperPercent;
  if (lower === null && upper !== null)
    return `${percentText(upper)}% 이하 (${degText(upper)}°)`;
  if (lower !== null && upper === null)
    return `${percentText(lower)}% 초과 (${degText(lower)}°~)`;
  if (lower !== null && upper !== null)
    return `${percentText(lower)}–${percentText(upper)}% (${degText(lower)}–${degText(upper)}°)`;
  return "";
}

export const SLOPE_CASING_CLASS = "ku-slope-casing";
const CASING_EXTRA_WEIGHT = 3;

/** 선 밑 외곽선. 관리자가 고른 색마다 대비를 맞출 수 없어 색과 무관하게 선을 바탕에서 떼어 낸다(설계 4.1) */
export function slopeCasingStyle(
  lineWeight: number,
  darkMap: boolean,
  fade = 1,
) {
  return {
    color: darkMap ? "#FFFFFF" : "#1C1917",
    weight: lineWeight + CASING_EXTRA_WEIGHT,
    opacity: (darkMap ? 0.6 : 0.5) * fade,
  };
}
