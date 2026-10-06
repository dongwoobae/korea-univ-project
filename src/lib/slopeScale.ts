/**
 * 경사 단위와 색 칸. 저장값(`SlopeRoutePoint.slope`)은 도(°)다. 법 기준이 비율이라
 * 칸·경고는 %로 비교한다 — docs/specs/2026-10-06-slope-units-and-editor-design.md 2~4장.
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

export interface SlopeBand {
  /** 이 칸의 상한(%, 포함). 마지막 칸은 Infinity */
  maxPercent: number;
  color: string;
}

export const SLOPE_BANDS: readonly SlopeBand[] = [
  { maxPercent: 2, color: "#91D4C6" },
  { maxPercent: WALKWAY_RATIO * 100, color: "#36A980" },
  { maxPercent: RELAXED_RATIO * 100, color: "#0465AF" },
  { maxPercent: RAMP_EXCEPTION_RATIO * 100, color: "#E6B816" },
  { maxPercent: 15, color: "#D75A07" },
  { maxPercent: Infinity, color: "#9A023C" },
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

function bandForPercent(percent: number): SlopeBand {
  return (
    SLOPE_BANDS.find(
      (band) => percent <= band.maxPercent + BOUNDARY_TOLERANCE,
    ) ?? SLOPE_BANDS[SLOPE_BANDS.length - 1]
  );
}

export function slopeColorFromDeg(deg: number): string {
  return bandForPercent(degToPercent(Math.abs(deg))).color;
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
