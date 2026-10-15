import type { AdminCollectionPolicy } from "@/lib/adminCollection";
import { formatAdminUpdatedAt } from "@/lib/adminList";
import {
  readRoutePoints,
  readStoredSlopes,
  readStoredVertices,
  type Vertex,
} from "@/lib/slopeRoute";
import {
  formatDeg,
  slopeGradeFromDeg,
  type SlopeGrade,
} from "@/lib/slopeScale";
import type { SlopeSegment } from "@/types/domain";

export interface SlopeSegmentSummary {
  index: number;
  /** 저장값 그대로(m) */
  distance: number;
  /** 도 */
  slope: number;
  grade: SlopeGrade;
  from: [number, number];
  to: [number, number];
}

export interface SlopeRouteSummary {
  vertices: Vertex[];
  segments: SlopeSegmentSummary[];
  /** 0.1m 반올림 */
  totalDistance: number;
  maxSlope: number;
  gradeCounts: Record<SlopeGrade, number>;
  bounds: [[number, number], [number, number]];
}

export function verticesBounds(
  vertices: Vertex[],
): [[number, number], [number, number]] | null {
  if (vertices.length === 0) return null;
  const lats = vertices.map((vertex) => vertex.lat);
  const lngs = vertices.map((vertex) => vertex.lng);
  return [
    [Math.min(...lats), Math.min(...lngs)],
    [Math.max(...lats), Math.max(...lngs)],
  ];
}

/** 저장 형식을 `readRoutePoints`가 못 읽으면 null이다 — 목록은 그 행을 형식 오류로 보인다 */
export function summarizeSlopeRoute(raw: unknown): SlopeRouteSummary | null {
  const points = readRoutePoints(raw);
  if (!points) return null;
  const vertices = readStoredVertices(points);
  const slopes = readStoredSlopes(points);
  const [, ...measured] = points;
  const gradeCounts: Record<SlopeGrade, number> = {
    ok: 0,
    over: 0,
    extreme: 0,
  };
  const segments = slopes.map((slope, index): SlopeSegmentSummary => {
    const grade = slopeGradeFromDeg(slope);
    gradeCounts[grade] += 1;
    return {
      index,
      distance: measured[index].distance,
      slope,
      grade,
      from: [vertices[index].lat, vertices[index].lng],
      to: [vertices[index + 1].lat, vertices[index + 1].lng],
    };
  });
  const distanceSum = segments.reduce(
    (sum, segment) => sum + segment.distance,
    0,
  );
  return {
    vertices,
    segments,
    totalDistance: Math.round(distanceSum * 10) / 10,
    maxSlope: Math.max(...slopes),
    gradeCounts,
    bounds: verticesBounds(vertices)!,
  };
}

export interface SlopeListItem {
  route: SlopeSegment;
  summary: SlopeRouteSummary | null;
}

export type SlopeChip = "over" | "extreme";

export const SLOPE_CHIPS: { key: SlopeChip; label: string }[] = [
  { key: "over", label: "1/12 초과 포함" },
  { key: "extreme", label: "확인 필요" },
];

export function slopeDisplayName(route: Pick<SlopeSegment, "name">): string {
  return route.name?.trim() || "이름 없는 경로";
}

export const SLOPE_COLLECTION_POLICY: AdminCollectionPolicy<
  SlopeListItem,
  SlopeChip
> = {
  // 목 백엔드는 id를 숫자로 돌려준다
  id: ({ route }) => String(route.id),
  name: ({ route }) => slopeDisplayName(route),
  updatedAt: ({ route }) => route.updated_at,
  searchText: ({ route }) => [route.name],
  chips: {
    over: ({ summary }) =>
      Boolean(
        summary && summary.gradeCounts.over + summary.gradeCounts.extreme,
      ),
    extreme: ({ summary }) => Boolean(summary?.gradeCounts.extreme),
  },
};

/** 우선순위는 확인 필요 → 1/12 초과 → 기준 이내다 */
export function slopeRouteBadge(summary: SlopeRouteSummary | null): {
  label: string;
  tone: "missing" | "warn" | "ok";
} {
  if (!summary) return { label: "형식 오류", tone: "missing" };
  const { extreme, over } = summary.gradeCounts;
  if (extreme > 0)
    return { label: `확인 필요 ${extreme}구간`, tone: "missing" };
  if (over > 0) return { label: `1/12 초과 ${over}구간`, tone: "warn" };
  return { label: "기준 이내", tone: "ok" };
}

export function formatMeters(value: number): string {
  return `${value}m`;
}

export function formatSlopeRouteMeta(
  summary: SlopeRouteSummary | null,
  updatedAt: string | null,
): string {
  const updated = formatAdminUpdatedAt(updatedAt);
  if (!summary) return updated;
  return `${summary.segments.length}개 구간 · ${formatMeters(summary.totalDistance)} · 최대 ${formatDeg(summary.maxSlope)} · ${updated}`;
}
