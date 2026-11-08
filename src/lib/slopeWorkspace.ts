import type { AdminCollectionPolicy } from "@/lib/adminCollection";
import { formatAdminUpdatedAt } from "@/lib/adminList";
import {
  readRoutePoints,
  readStoredSlopes,
  readStoredVertices,
  type Vertex,
} from "@/lib/slopeRoute";
import { formatDeg } from "@/lib/slopeScale";
import {
  polylineLength,
  readStairsPoints,
  type RouteEndpoint,
} from "@/lib/stairs";
import type { SlopeSegment } from "@/types/domain";

export interface SlopeSegmentSummary {
  index: number;
  /** 저장값 그대로(m) */
  distance: number;
  /** 도 */
  slope: number;
  from: [number, number];
  to: [number, number];
}

export interface SlopeRouteSummary {
  vertices: Vertex[];
  segments: SlopeSegmentSummary[];
  /** 0.1m 반올림 */
  totalDistance: number;
  maxSlope: number;
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
  // 지금은 readRoutePoints가 두 점 미만을 먼저 거른다. 그 불변식이 바뀌어도 경계 없는 경로가 지도 focus까지 가지 않게 막는다.
  const bounds = verticesBounds(vertices);
  if (!bounds) return null;
  const slopes = readStoredSlopes(points);
  const [, ...measured] = points;
  const segments = slopes.map((slope, index): SlopeSegmentSummary => ({
    index,
    distance: measured[index].distance,
    slope,
    from: [vertices[index].lat, vertices[index].lng],
    to: [vertices[index + 1].lat, vertices[index + 1].lng],
  }));
  const distanceSum = segments.reduce(
    (sum, segment) => sum + segment.distance,
    0,
  );
  return {
    vertices,
    segments,
    totalDistance: Math.round(distanceSum * 10) / 10,
    maxSlope: Math.max(...slopes),
    bounds,
  };
}

export interface StairsSummary {
  vertices: Vertex[];
  /** 0.1m 반올림 */
  length: number;
  bounds: [[number, number], [number, number]];
}

export function summarizeStairs(raw: unknown): StairsSummary | null {
  const points = readStairsPoints(raw);
  if (!points) return null;
  const vertices = points.map(({ lat, lng }) => ({ lat, lng }));
  const bounds = verticesBounds(vertices);
  if (!bounds) return null;
  return { vertices, length: polylineLength(vertices), bounds };
}

/** 읽는 곳마다 kind로 먼저 나눈다 — 계단 행이 readRoutePoints로 가면 형식 오류가 된다(설계 2026-11-06 4.2) */
export type SlopeListItem =
  | { kind: "slope"; route: SlopeSegment; summary: SlopeRouteSummary | null }
  | { kind: "stairs"; route: SlopeSegment; summary: StairsSummary | null };
export type SlopeRouteListItem = Extract<SlopeListItem, { kind: "slope" }>;
export type StairsListItem = Extract<SlopeListItem, { kind: "stairs" }>;

export function slopeListItem(route: SlopeSegment): SlopeListItem {
  return route.kind === "stairs"
    ? { kind: "stairs", route, summary: summarizeStairs(route.segments) }
    : { kind: "slope", route, summary: summarizeSlopeRoute(route.segments) };
}

export function slopeDisplayName(route: Pick<SlopeSegment, "name">): string {
  return route.name?.trim() || "이름 없는 경로";
}

export type SlopeChip = "slope" | "stairs";

export const SLOPE_CHIPS: { key: SlopeChip; label: string }[] = [
  { key: "slope", label: "경사로" },
  { key: "stairs", label: "계단" },
];

// 구간 색은 관리자가 고치는 값이라 칩 조건으로 두지 않는다(설계 2026-10-19 5장). 칩은 종류다(설계 2026-11-06 6.5)
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
    slope: (item) => item.kind === "slope",
    stairs: (item) => item.kind === "stairs",
  },
};

/** 판정 배지는 없다. 형식 오류는 판정이 아니라 읽기 실패 표시라 남긴다(설계 2026-10-19 5장) */
export function slopeRouteBadge(
  summary: object | null,
): { label: "형식 오류"; tone: "missing" } | null {
  return summary ? null : { label: "형식 오류", tone: "missing" };
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

export function formatSlopeListMeta(item: SlopeListItem): string {
  if (item.kind === "slope")
    return formatSlopeRouteMeta(item.summary, item.route.updated_at);
  const updated = formatAdminUpdatedAt(item.route.updated_at);
  return item.summary
    ? `계단 · ${formatMeters(item.summary.length)} · ${updated}`
    : updated;
}

export function slopeRouteEndpoints(items: SlopeListItem[]): RouteEndpoint[] {
  return items.flatMap((item) => {
    if (item.kind !== "slope" || !item.summary) return [];
    const id = SLOPE_COLLECTION_POLICY.id(item);
    const routeName = slopeDisplayName(item.route);
    const { vertices } = item.summary;
    return [
      { key: `${id}:start`, routeName, point: vertices[0] },
      { key: `${id}:end`, routeName, point: vertices[vertices.length - 1] },
    ];
  });
}

export function confirmedOsmWayIds(items: SlopeListItem[]): Set<number> {
  return new Set(
    items.flatMap((item) =>
      item.kind === "stairs" && item.route.osm_way_id !== null
        ? [Number(item.route.osm_way_id)]
        : [],
    ),
  );
}
