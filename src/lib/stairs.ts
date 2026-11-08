import { slopeCasingStyle } from "@/lib/slopeBands";
import { verticesEqual } from "@/lib/slopeDraft";
import {
  buildSegments,
  haversine,
  isCoordinate,
  type Vertex,
} from "@/lib/slopeRoute";
import type { StairsPoints } from "@/types/domain";

export const STAIRS_LINE_COLOR = "#78716C";
// 길이 0 대시에 둥근 끝을 줘 점으로 그린다. 외곽선(선 굵기 + 3)의 점끼리 붙지 않을 간격이다(설계 7.1)
export const STAIRS_DASH = "0 14";
export const STAIRS_JOIN_RADIUS_M = 10;
export const STAIRS_LINE_CLASS = "ku-stairs-line";
export const STAIRS_HIT_CLASS = "ku-stairs-hit";
export const OSM_STAIRS_SNAPSHOT_URL = "/osm-stairs.geojson";

// 점선은 점 위만 눌린다. 누르기는 보이지 않는 굵은 선이 받는다
const HIT_WEIGHT = 16;
const JOINED_EPSILON_M = 0.01;

export function stairsLineStyle(weight: number, opacity = 1) {
  return {
    color: STAIRS_LINE_COLOR,
    weight,
    opacity,
    dashArray: STAIRS_DASH,
    lineCap: "round" as const,
  };
}

export function stairsCasingStyle(weight: number, darkMap: boolean, fade = 1) {
  return {
    ...slopeCasingStyle(weight, darkMap, fade),
    dashArray: STAIRS_DASH,
    lineCap: "round" as const,
  };
}

export function stairsHitStyle() {
  return { color: STAIRS_LINE_COLOR, weight: HIT_WEIGHT, opacity: 0 };
}

export function readStairsPoints(raw: unknown): StairsPoints | null {
  if (!Array.isArray(raw) || raw.length < 2) return null;
  if (!raw.every(isCoordinate)) return null;
  return raw.map(({ lat, lng }) => ({ lat, lng })) as StairsPoints;
}

export function polylineLength(vertices: Vertex[]): number {
  let total = 0;
  for (let i = 1; i < vertices.length; i++) {
    total += haversine(
      vertices[i - 1].lat,
      vertices[i - 1].lng,
      vertices[i].lat,
      vertices[i].lng,
    );
  }
  return Math.round(total * 10) / 10;
}

export function validateStairs(name: string, vertices: Vertex[]): string[] {
  const errors: string[] = [];
  if (!name.trim()) errors.push("계단 이름을 입력해주세요");
  if (vertices.length < 2) errors.push("지도에 계단을 그려주세요");
  if (buildSegments(vertices).some((segment) => segment.distance === 0)) {
    errors.push("길이가 0m인 구간이 있어요. 같은 자리를 두 번 찍지 말아주세요");
  }
  return errors;
}

export type StairsEnd = "start" | "end";

export interface RouteEndpoint {
  /** `{경로 id}:start` 또는 `{경로 id}:end` */
  key: string;
  routeName: string;
  point: Vertex;
}

export interface StairsJoin {
  end: StairsEnd;
  endpoint: RouteEndpoint;
  /** 0.1m 반올림 */
  distance: number;
}

interface Ranked {
  endpoint: RouteEndpoint;
  distance: number;
}

function rankEndpoints(
  point: Vertex,
  endpoints: RouteEndpoint[],
  radius: number,
): Ranked[] {
  return endpoints
    .map((endpoint) => ({
      endpoint,
      distance: haversine(
        point.lat,
        point.lng,
        endpoint.point.lat,
        endpoint.point.lng,
      ),
    }))
    .filter(({ distance }) => distance <= radius)
    .sort((a, b) => a.distance - b.distance);
}

/** 설계 6.3. 이미 끝점에 붙은 끝은 제안하지 않는다 — 기존 계단을 열면 토글이 처음에 보이지 않는다 */
export function suggestStairsJoins(
  vertices: Vertex[],
  endpoints: RouteEndpoint[],
  radius = STAIRS_JOIN_RADIUS_M,
): StairsJoin[] {
  if (vertices.length < 2) return [];
  const start = rankEndpoints(vertices[0], endpoints, radius);
  const end = rankEndpoints(vertices[vertices.length - 1], endpoints, radius);
  let startPick: Ranked | undefined = start[0];
  let endPick: Ranked | undefined = end[0];
  if (startPick && endPick && startPick.endpoint.key === endPick.endpoint.key) {
    if (startPick.distance <= endPick.distance) endPick = end[1];
    else startPick = start[1];
  }
  const joins: StairsJoin[] = [];
  const picks: [StairsEnd, Ranked | undefined][] = [
    ["start", startPick],
    ["end", endPick],
  ];
  for (const [which, pick] of picks) {
    if (!pick || pick.distance < JOINED_EPSILON_M) continue;
    joins.push({
      end: which,
      endpoint: pick.endpoint,
      distance: Math.round(pick.distance * 10) / 10,
    });
  }
  return joins;
}

export function applyStairsJoins(
  vertices: Vertex[],
  joins: StairsJoin[],
  enabled: Record<StairsEnd, boolean>,
): Vertex[] {
  const next = vertices.map(({ lat, lng }) => ({ lat, lng }));
  for (const join of joins) {
    if (!enabled[join.end]) continue;
    const { lat, lng } = join.endpoint.point;
    next[join.end === "start" ? 0 : next.length - 1] = { lat, lng };
  }
  return next;
}

export interface StairsCandidate {
  osmWayId: number;
  name: string | null;
  vertices: Vertex[];
}

interface SnapshotFeature {
  properties?: { osmWayId?: unknown; name?: unknown };
  geometry?: { type?: unknown; coordinates?: unknown };
}

function isLngLat(value: unknown): value is [number, number] {
  return (
    Array.isArray(value) &&
    value.length >= 2 &&
    typeof value[0] === "number" &&
    Number.isFinite(value[0]) &&
    typeof value[1] === "number" &&
    Number.isFinite(value[1])
  );
}

/** 파일이 깨졌으면 null. 형식이 틀린 계단 하나는 빼고 나머지를 쓴다 */
export function readStairsSnapshot(raw: unknown): StairsCandidate[] | null {
  if (typeof raw !== "object" || raw === null) return null;
  const { type, features } = raw as { type?: unknown; features?: unknown };
  if (type !== "FeatureCollection" || !Array.isArray(features)) return null;
  const candidates: StairsCandidate[] = [];
  for (const feature of features as (SnapshotFeature | null)[]) {
    const id = feature?.properties?.osmWayId;
    const name = feature?.properties?.name;
    const coordinates = feature?.geometry?.coordinates;
    if (feature?.geometry?.type !== "LineString") continue;
    if (typeof id !== "number" || !Number.isSafeInteger(id) || id <= 0)
      continue;
    if (
      !Array.isArray(coordinates) ||
      coordinates.length < 2 ||
      !coordinates.every(isLngLat)
    )
      continue;
    candidates.push({
      osmWayId: id,
      name: typeof name === "string" && name.trim() ? name : null,
      vertices: coordinates.map(([lng, lat]) => ({ lat, lng })),
    });
  }
  return candidates;
}

export function availableCandidates(
  candidates: StairsCandidate[],
  confirmed: ReadonlySet<number>,
): StairsCandidate[] {
  return candidates.filter((candidate) => !confirmed.has(candidate.osmWayId));
}

export interface StairsDraftValues {
  name: string;
  note: string;
  vertices: Vertex[];
}

/** 이름·설명은 저장할 때 트림하므로 앞뒤 공백은 보지 않는다 */
export function stairsDraftDirty(
  current: StairsDraftValues,
  initial: StairsDraftValues,
): boolean {
  return (
    current.name.trim() !== initial.name.trim() ||
    current.note.trim() !== initial.note.trim() ||
    !verticesEqual(current.vertices, initial.vertices)
  );
}
