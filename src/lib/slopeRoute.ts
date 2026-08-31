import type { SlopePoint } from "@/types/domain";

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
): SlopePoint[] {
  const segments = buildSegments(vertices);
  return vertices.map((vertex, index) => {
    if (index === 0) return { lat: vertex.lat, lng: vertex.lng, ele: null };
    return {
      lat: vertex.lat,
      lng: vertex.lng,
      ele: null,
      slope: round1(slopes[index - 1]),
      distance: segments[index - 1].distance,
    };
  });
}

export function readStoredVertices(segments: SlopePoint[]): Vertex[] {
  return segments.map((point) => ({ lat: point.lat, lng: point.lng }));
}

/**
 * 값이 없는 구간은 0이 아니라 null이다. 0으로 읽으면 미입력이 "평지 0%"로
 * 화면에 채워지고 저장 시 그대로 굳는다 — 이 기능이 없애려던 실패 양상이다.
 */
export function readStoredSlopes(segments: SlopePoint[]): (number | null)[] {
  return segments.slice(1).map((point) => point.slope ?? null);
}

export function isManualRoute(route: { gpx_file: string | null }) {
  return route.gpx_file === null;
}
