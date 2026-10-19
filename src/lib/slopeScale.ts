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

export type SlopeGrade = "ok" | "over" | "extreme";

export const SLOPE_GRADES: readonly SlopeGrade[] = ["ok", "over", "extreme"];

export function slopeGradeFromDeg(deg: number): SlopeGrade {
  const warning = slopeWarningFromDeg(deg);
  if (warning === "extreme") return "extreme";
  return warning === "relaxed-limit" ? "over" : "ok";
}

// 관리자 화면 전용 판정 3색(설계 2026-10-14 2.1).
export const SLOPE_GRADE_COLORS: Record<SlopeGrade, string> = {
  ok: "#1B9E77",
  over: "#E6AB02",
  extreme: "#A50F15",
};

// 데이터 색이라 라이트·다크가 같다.
export const SLOPE_GRADE_ON_COLORS: Record<SlopeGrade, string> = {
  ok: "#1C1917",
  over: "#1C1917",
  extreme: "#FFFFFF",
};

export const SLOPE_GRADE_LABELS: Record<SlopeGrade, string> = {
  ok: "기준 이내",
  over: "1/12 초과",
  extreme: "확인 필요",
};

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
