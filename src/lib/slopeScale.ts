/**
 * 경사 단위와 입력 경고. 저장값(`SlopeRoutePoint.slope`)은 도(°)다. 법 기준이 비율이라
 * 경고는 %로 계산한다 — docs/specs/2026-10-06-slope-units-and-editor-design.md 2~4장.
 * 색 구간은 slopeBands.ts다.
 */

export const WALKWAY_RATIO = 1 / 18;
export const RELAXED_RATIO = 1 / 12;
export const RAMP_EXCEPTION_RATIO = 1 / 8;

export const MAX_SLOPE_DEG = 45;
const EXTREME_SLOPE_PERCENT = 30;

// tan(atan(x)) 왕복의 부동소수 오차가 정확한 경계값을 넘기지 않게 한다(설계 2.2).
export const BOUNDARY_TOLERANCE = 1e-9;

export function degToPercent(deg: number): number {
  return Math.tan((deg * Math.PI) / 180) * 100;
}

export function percentToDeg(percent: number): number {
  return (Math.atan(percent / 100) * 180) / Math.PI;
}

export function isSlopeDegInRange(deg: number): boolean {
  return Number.isFinite(deg) && deg >= 0 && deg <= MAX_SLOPE_DEG;
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
