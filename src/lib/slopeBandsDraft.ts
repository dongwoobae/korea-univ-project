import {
  MAX_SLOPE_BANDS,
  MAX_UPPER_PERCENT,
  MIN_SLOPE_BANDS,
  validateSlopeBands,
  type SlopeBand,
  type SlopeBandsValidation,
} from "@/lib/slopeBands";
import {
  MAX_SLOPE_DEG,
  degToPercent,
  formatSlopeInput,
  percentToDeg,
  type SlopeUnit,
} from "@/lib/slopeScale";

/**
 * 범례 편집 모달의 구간 한 줄. 상한은 숫자와 입력 문자열을 따로 든다 — 화면 문자열(`5.56`)을 다시 읽어 저장하면
 * 경계가 반올림한 쪽으로 움직인다(설계 2026-10-19 6.2).
 */
export interface SlopeBandDraftRow {
  /** React key. 행을 더하거나 지워도 다른 행의 것은 그대로다 */
  key: number;
  name: string;
  color: string;
  description: string;
  /** %. 마지막 행과 상한을 아직 넣지 않은 행은 null */
  upperPercent: number | null;
  upperInput: string;
  /** 범위 밖 입력의 문구. 있는 동안 upperPercent는 그 전 값이다 */
  upperError: string | null;
}

const UPPER_RANGE_ERROR: Record<SlopeUnit, string> = {
  deg: `0°보다 크고 ${MAX_SLOPE_DEG}° 이하로 적어 주세요`,
  percent: `0%보다 크고 ${MAX_UPPER_PERCENT}% 이하로 적어 주세요`,
};

let lastKey = 0;

function nextKey(): number {
  lastKey += 1;
  return lastKey;
}

function formatUpper(upperPercent: number | null, unit: SlopeUnit): string {
  return upperPercent === null
    ? ""
    : formatSlopeInput(percentToDeg(upperPercent), unit);
}

export function draftFromBands(
  bands: readonly SlopeBand[],
  unit: SlopeUnit,
): SlopeBandDraftRow[] {
  return bands.map((band) => ({
    key: nextKey(),
    name: band.name,
    color: band.color,
    description: band.description,
    upperPercent: band.upperPercent,
    upperInput: formatUpper(band.upperPercent, unit),
    upperError: null,
  }));
}

/** 사용자가 상한 칸을 고쳤을 때만 부른다. % 입력은 친 그대로, 도 입력은 바꾼 결과를 반올림하지 않고 든다 */
export function editUpper(
  row: SlopeBandDraftRow,
  raw: string,
  unit: SlopeUnit,
): SlopeBandDraftRow {
  if (raw.trim() === "")
    return { ...row, upperInput: raw, upperPercent: null, upperError: null };
  const value = Number(raw);
  const max = unit === "deg" ? MAX_SLOPE_DEG : MAX_UPPER_PERCENT;
  // 도는 %로 바꾸기 전에 검사한다 — tan은 주기 함수라 190°가 약 17.6%로 통과한다
  if (!Number.isFinite(value) || value <= 0 || value > max)
    return { ...row, upperInput: raw, upperError: UPPER_RANGE_ERROR[unit] };
  return {
    ...row,
    upperInput: raw,
    upperPercent: unit === "percent" ? value : degToPercent(value),
    upperError: null,
  };
}

/** 숫자는 그대로 두고 입력란만 새 단위로 다시 쓴다. 범위 밖 입력은 버리고 마지막으로 받아들인 숫자로 되돌린다 */
export function redraftBandsForUnit(
  rows: SlopeBandDraftRow[],
  unit: SlopeUnit,
): SlopeBandDraftRow[] {
  return rows.map((row) => ({
    ...row,
    upperInput: formatUpper(row.upperPercent, unit),
    upperError: null,
  }));
}

export function addBand(rows: SlopeBandDraftRow[]): SlopeBandDraftRow[] {
  if (rows.length >= MAX_SLOPE_BANDS) return rows;
  const insertAt = rows.length - 1;
  const added: SlopeBandDraftRow = {
    key: nextKey(),
    name: "",
    color: rows[insertAt - 1].color,
    description: "",
    upperPercent: null,
    upperInput: "",
    upperError: null,
  };
  return [...rows.slice(0, insertAt), added, rows[insertAt]];
}

export function removeBand(
  rows: SlopeBandDraftRow[],
  index: number,
): SlopeBandDraftRow[] {
  if (rows.length <= MIN_SLOPE_BANDS) return rows;
  const next = rows.filter((_, i) => i !== index);
  if (index === rows.length - 1) {
    const last = next.length - 1;
    next[last] = {
      ...next[last],
      upperPercent: null,
      upperInput: "",
      upperError: null,
    };
  }
  return next;
}

export function validateBandsDraft(
  rows: SlopeBandDraftRow[],
): SlopeBandsValidation {
  return validateSlopeBands({
    bands: rows.map(({ name, upperPercent, color, description }) => ({
      name,
      upperPercent,
      color,
      description,
    })),
  });
}

export function draftHasInputError(rows: SlopeBandDraftRow[]): boolean {
  return rows.some((row) => row.upperError !== null);
}

/** 상한 입력란 옆에 보이는 다른 단위 환산값 */
export function convertedUpper(
  row: SlopeBandDraftRow,
  unit: SlopeUnit,
): string | null {
  if (row.upperPercent === null || row.upperError !== null) return null;
  const other: SlopeUnit = unit === "deg" ? "percent" : "deg";
  return `${formatUpper(row.upperPercent, other)}${other === "deg" ? "°" : "%"}`;
}
