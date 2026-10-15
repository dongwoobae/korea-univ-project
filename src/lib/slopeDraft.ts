import type { Vertex } from "@/lib/slopeRoute";
import {
  formatSlopeInput,
  isSlopeDegInRange,
  type SlopeUnit,
} from "@/lib/slopeScale";

export interface SlopeDraftValues {
  name: string;
  vertices: Vertex[];
  slopes: (number | null)[];
}

// 지도가 좌표를 다시 읽어 배열을 새로 만들어도(편집 없이 마운트만 해도)
// 참조가 아니라 값이 같으면 dirty가 아니어야 한다.
function verticesEqual(a: Vertex[], b: Vertex[]) {
  if (a.length !== b.length) return false;
  return a.every(
    (vertex, index) =>
      vertex.lat === b[index].lat && vertex.lng === b[index].lng,
  );
}

function slopesEqual(a: (number | null)[], b: (number | null)[]) {
  if (a.length !== b.length) return false;
  return a.every((slope, index) => slope === b[index]);
}

/** 이름은 저장할 때 트림하므로 앞뒤 공백은 보지 않는다 */
export function slopeDraftDirty(
  current: SlopeDraftValues,
  initial: SlopeDraftValues,
): boolean {
  return (
    current.name.trim() !== initial.name.trim() ||
    !verticesEqual(current.vertices, initial.vertices) ||
    !slopesEqual(current.slopes, initial.slopes)
  );
}

/** 구간 수가 같으면 같은 참조를 돌려줘 상태 갱신이 다시 그리기를 일으키지 않는다 */
export function resizeToSegments<T>(
  previous: T[],
  vertexCount: number,
  empty: T,
): T[] {
  const count = Math.max(0, vertexCount - 1);
  return previous.length === count
    ? previous
    : Array.from({ length: count }, () => empty);
}

export function draftsFromSlopes(
  slopes: (number | null)[],
  unit: SlopeUnit,
): string[] {
  return slopes.map((slope) =>
    slope === null ? "" : formatSlopeInput(slope, unit),
  );
}

/**
 * 저장될 도 값은 그대로 두고 입력란 문자열만 새 단위로 다시 쓴다(설계 2026-10-06 3.3).
 * 범위 밖 값은 tan이 주기 함수라 %로 바꾸면 다른 값처럼 보이므로 쓰던 문자열을 그대로 둔다(3.2).
 */
export function redraftForUnit(
  slopes: (number | null)[],
  previous: string[],
  unit: SlopeUnit,
): string[] {
  return slopes.map((slope, index) =>
    slope === null || !Number.isFinite(slope) || !isSlopeDegInRange(slope)
      ? (previous[index] ?? "")
      : formatSlopeInput(slope, unit),
  );
}
