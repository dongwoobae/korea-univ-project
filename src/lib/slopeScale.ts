/**
 * 경사 단위와 색. 저장값(`SlopeRoutePoint.slope`)은 도(°)다. 법 기준이 비율이라
 * 색·경고는 %로 계산한다 — docs/specs/2026-10-06-slope-units-and-editor-design.md 2~4장.
 */

export const WALKWAY_RATIO = 1 / 18;
export const RELAXED_RATIO = 1 / 12;
export const RAMP_EXCEPTION_RATIO = 1 / 8;

export const MAX_SLOPE_DEG = 45;
const EXTREME_SLOPE_PERCENT = 30;

// tan(atan(x)) 왕복의 부동소수 오차가 정확한 경계값을 넘기지 않게 한다(설계 2.2).
const BOUNDARY_TOLERANCE = 1e-9;

export function degToPercent(deg: number): number {
  return Math.tan((deg * Math.PI) / 180) * 100;
}

export function percentToDeg(percent: number): number {
  return (Math.atan(percent / 100) * 180) / Math.PI;
}

export function isSlopeDegInRange(deg: number): boolean {
  return Number.isFinite(deg) && deg >= 0 && deg <= MAX_SLOPE_DEG;
}

export interface SlopeGradientStop {
  percent: number;
  color: string;
}

// 노랑의 10%는 1/12에서 따뜻한 색으로 넘어가는 전환 폭을 주려는 임의 값이다(설계 11.1).
export const SLOPE_GRADIENT_STOPS: readonly SlopeGradientStop[] = [
  { percent: 0, color: "#0465AF" },
  { percent: RELAXED_RATIO * 100, color: "#36A980" },
  { percent: 10, color: "#E6B816" },
  { percent: RAMP_EXCEPTION_RATIO * 100, color: "#D75A07" },
  { percent: 20, color: "#9A023C" },
];

export interface SlopeLevel {
  /** 이 단계의 상한(%, 포함). 마지막 단계는 Infinity */
  maxPercent: number;
  label: string;
}

export const SLOPE_LEVELS: readonly SlopeLevel[] = [
  { maxPercent: RELAXED_RATIO * 100, label: "기준 이내" },
  { maxPercent: RAMP_EXCEPTION_RATIO * 100, label: "특례 범위" },
  { maxPercent: Infinity, label: "초과" },
];

export interface SlopeReferenceLine {
  ratioLabel: string;
  percent: number;
  label: string;
}

export const SLOPE_REFERENCE_LINES: readonly SlopeReferenceLine[] = [
  { ratioLabel: "1/18", percent: WALKWAY_RATIO * 100, label: "보도 기준" },
  { ratioLabel: "1/12", percent: RELAXED_RATIO * 100, label: "완화 한도" },
  {
    ratioLabel: "1/8",
    percent: RAMP_EXCEPTION_RATIO * 100,
    label: "경사로 특례 한도",
  },
];

type Oklab = [number, number, number];

function srgbToLinear(channel: number): number {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function linearToSrgb(channel: number): number {
  const c =
    channel <= 0.0031308
      ? 12.92 * channel
      : 1.055 * channel ** (1 / 2.4) - 0.055;
  return Math.round(Math.min(1, Math.max(0, c)) * 255);
}

function hexToOklab(hex: string): Oklab {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [n >> 16, (n >> 8) & 255, n & 255].map(srgbToLinear);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function oklabToHex([L, a, b]: Oklab): string {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const rgb = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map(linearToSrgb);
  return `#${rgb
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase()}`;
}

function colorAtPercent(percent: number): string {
  const stops = SLOPE_GRADIENT_STOPS;
  if (percent <= stops[0].percent) return stops[0].color;
  for (let i = 1; i < stops.length; i++) {
    const upper = stops[i];
    if (percent > upper.percent) continue;
    const lower = stops[i - 1];
    const t = (percent - lower.percent) / (upper.percent - lower.percent);
    const from = hexToOklab(lower.color);
    const to = hexToOklab(upper.color);
    return oklabToHex(from.map((v, k) => v + (to[k] - v) * t) as Oklab);
  }
  return stops[stops.length - 1].color;
}

export function slopeColorFromDeg(deg: number): string {
  return colorAtPercent(degToPercent(Math.abs(deg)));
}

export type SlopeWarning = "relaxed-limit" | "extreme" | null;

export function slopeWarningFromDeg(deg: number): SlopeWarning {
  const percent = degToPercent(Math.abs(deg));
  if (percent > EXTREME_SLOPE_PERCENT + BOUNDARY_TOLERANCE) return "extreme";
  if (percent > RELAXED_RATIO * 100 + BOUNDARY_TOLERANCE)
    return "relaxed-limit";
  return null;
}

export type SlopeUnit = "deg" | "percent";

export function toDegrees(value: number, unit: SlopeUnit): number {
  return unit === "deg" ? value : percentToDeg(value);
}

export function fromDegrees(deg: number, unit: SlopeUnit): number {
  return unit === "deg" ? deg : degToPercent(deg);
}

export function formatPercent(percent: number): string {
  return `${percent.toFixed(1)}%`;
}

export function formatDeg(deg: number): string {
  return `${deg.toFixed(1)}°`;
}

export function formatSlopeInput(deg: number, unit: SlopeUnit): string {
  return String(Number(fromDegrees(deg, unit).toFixed(2)));
}
