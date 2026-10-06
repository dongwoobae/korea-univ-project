import type {
  SlopeRoutePoint,
  SlopeRoutePoints,
  SlopeRouteStart,
} from "@/types/domain";
import { isSlopeDegInRange } from "@/lib/slopeScale";

/** 지도에서 찍은 꼭짓점. 고도는 쓰지 않는다. */
export interface Vertex {
  lat: number;
  lng: number;
}

/** 구간 하나. index는 vertices[index] → vertices[index + 1]을 뜻한다. */
export interface RouteSegment {
  index: number;
  distance: number;
}

/** 건축법상 경사로 기준 1/12 */
export const LEGAL_SLOPE_LIMIT = 8.33;
/** 이 위는 오타를 의심한다. 저장은 막지 않는다. */
export const EXTREME_SLOPE_LIMIT = 30;
/** 45도. 이 위는 보행 노면이 아니라 입력 사고로 본다. */
export const MAX_SLOPE_INPUT = 100;

const EARTH_RADIUS_M = 6371000;

function toRadians(degrees: number) {
  return (degrees * Math.PI) / 180;
}

export function haversine(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
) {
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function round1(value: number) {
  return Math.round(value * 10) / 10;
}

export function buildSegments(vertices: Vertex[]): RouteSegment[] {
  if (vertices.length < 2) return [];
  const segments: RouteSegment[] = [];
  for (let i = 0; i < vertices.length - 1; i++) {
    const raw = haversine(
      vertices[i].lat,
      vertices[i].lng,
      vertices[i + 1].lat,
      vertices[i + 1].lng,
    );
    segments.push({ index: i, distance: round1(raw) });
  }
  return segments;
}

export function slopeWarning(slope: number): "extreme" | "legal" | null {
  if (slope > EXTREME_SLOPE_LIMIT) return "extreme";
  if (slope > LEGAL_SLOPE_LIMIT) return "legal";
  return null;
}

export function validateRoute(
  name: string,
  vertices: Vertex[],
  slopes: (number | null)[],
): string[] {
  const errors: string[] = [];
  if (!name.trim()) errors.push("경로 이름을 입력해주세요");
  if (vertices.length < 2) errors.push("지도에 경로를 그려주세요");

  const segments = buildSegments(vertices);
  if (vertices.length >= 2 && slopes.length !== segments.length) {
    errors.push("구간과 입력값이 어긋났어요. 지우고 다시 그려주세요");
  }
  if (segments.some((segment) => segment.distance === 0)) {
    errors.push("길이가 0m인 구간이 있어요. 같은 자리를 두 번 찍지 말아주세요");
  }

  slopes.forEach((slope, index) => {
    const label = `${index + 1}번 구간의 경사도`;
    if (slope === null) {
      errors.push(`${label}를 입력해주세요`);
      return;
    }
    if (!Number.isFinite(slope)) {
      errors.push(`${label}가 숫자가 아니에요`);
      return;
    }
    if (slope < 0) errors.push(`${label}는 0 이상이어야 해요`);
    else if (slope > MAX_SLOPE_INPUT)
      errors.push(`${label}는 ${MAX_SLOPE_INPUT}% 이하여야 해요`);
  });

  return errors;
}

export function toStoredSegments(
  vertices: Vertex[],
  slopes: number[],
): SlopeRoutePoints {
  const segments = buildSegments(vertices);
  const [start, ...rest] = vertices;
  return [
    { lat: start.lat, lng: start.lng },
    ...rest.map((vertex, index) => ({
      lat: vertex.lat,
      lng: vertex.lng,
      // 반올림하지 않는다 — 설계 2.2
      slope: slopes[index],
      distance: segments[index].distance,
    })),
  ];
}

export function readStoredVertices(points: SlopeRoutePoints): Vertex[] {
  return points.map(({ lat, lng }) => ({ lat, lng }));
}

export function readStoredSlopes(points: SlopeRoutePoints): number[] {
  const [, ...measured] = points;
  return measured.map((point) => point.slope);
}

function isCoordinate(value: unknown): value is SlopeRouteStart {
  if (typeof value !== "object" || value === null) return false;
  const point = value as Record<string, unknown>;
  return (
    typeof point.lat === "number" &&
    Number.isFinite(point.lat) &&
    typeof point.lng === "number" &&
    Number.isFinite(point.lng)
  );
}

function hasValidMetrics(point: SlopeRouteStart): point is SlopeRoutePoint {
  const { slope, distance } = point as Partial<SlopeRoutePoint>;
  return (
    typeof slope === "number" &&
    isSlopeDegInRange(slope) &&
    typeof distance === "number" &&
    Number.isFinite(distance) &&
    distance > 0
  );
}

/**
 * 저장 포맷의 유일한 decoder다. 공개 지도와 관리자 편집 화면이 같은 규칙으로 읽어야
 * 한쪽이 버린 행을 다른 쪽이 열어 다시 저장하는 일이 없다.
 *
 * jsonb는 어떤 모양이든 담을 수 있고 slope_segments는 authenticated 전체에
 * 쓰기가 열려 있다. 못 쓰는 행은 부분 복구하지 않고 통째로 버린다. 좌표 일부를
 * 버리면 없던 선이 그려지고, 경사값이 깨진 행을 살리면 평지로 표시된다.
 */
export function readRoutePoints(raw: unknown): SlopeRoutePoints | null {
  if (!Array.isArray(raw) || raw.length < 2) return null;
  if (!raw.every(isCoordinate)) return null;
  const [start, ...rest] = raw as SlopeRouteStart[];
  if (!rest.every(hasValidMetrics)) return null;
  return [start, ...rest];
}
