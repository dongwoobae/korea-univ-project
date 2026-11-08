// fetchOsmStairs.ts가 Node로 바로 불러 @/ 경로와 런타임 import를 쓰지 않는다
type Ring = [number, number][];

export interface StairsFeature {
  type: "Feature";
  properties: { osmWayId: number; name: string | null };
  geometry: { type: "LineString"; coordinates: [number, number][] };
}

export interface StairsSnapshot {
  type: "FeatureCollection";
  attribution: string;
  license: string;
  fetchedAt: string;
  features: StairsFeature[];
}

export interface BoundingBox {
  south: number;
  west: number;
  north: number;
  east: number;
}

interface CampusFeature {
  geometry?: { type?: unknown; coordinates?: unknown };
}

interface OverpassElement {
  type?: unknown;
  id?: unknown;
  tags?: Record<string, unknown>;
  geometry?: { lat?: unknown; lon?: unknown }[];
}

function readCampusRings(raw: unknown): Ring[] {
  const features = (raw as { features?: unknown } | null)?.features;
  if (!Array.isArray(features))
    throw new Error("캠퍼스 경계 파일 형식이 아니에요");
  const rings: Ring[] = [];
  for (const feature of features as (CampusFeature | null)[]) {
    const geometry = feature?.geometry;
    if (!Array.isArray(geometry?.coordinates)) continue;
    if (geometry.type === "Polygon")
      rings.push((geometry.coordinates as Ring[])[0]);
    if (geometry.type === "MultiPolygon")
      for (const polygon of geometry.coordinates as Ring[][])
        rings.push(polygon[0]);
  }
  if (rings.length === 0) throw new Error("캠퍼스 경계가 비었어요");
  return rings;
}

export function pointInRing(lng: number, lat: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (
      yi > lat !== yj > lat &&
      lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi
    )
      inside = !inside;
  }
  return inside;
}

export function campusBoundingBox(campuses: unknown): BoundingBox {
  const points = readCampusRings(campuses).flat();
  return {
    south: Math.min(...points.map(([, lat]) => lat)),
    west: Math.min(...points.map(([lng]) => lng)),
    north: Math.max(...points.map(([, lat]) => lat)),
    east: Math.max(...points.map(([lng]) => lng)),
  };
}

export function overpassStairsQuery(box: BoundingBox): string {
  return `[out:json][timeout:60];way["highway"="steps"](${box.south},${box.west},${box.north},${box.east});out tags geom;`;
}

/** 설계 5.2·5.3 */
export function buildStairsSnapshot(
  overpass: unknown,
  campuses: unknown,
  fetchedAt: string,
): StairsSnapshot {
  const elements = (overpass as { elements?: unknown } | null)?.elements;
  if (!Array.isArray(elements))
    throw new Error("Overpass 응답 형식이 아니에요");
  const rings = readCampusRings(campuses);
  const features: StairsFeature[] = [];
  for (const element of elements as (OverpassElement | null)[]) {
    if (element?.type !== "way" || element.tags?.highway !== "steps") continue;
    if (typeof element.id !== "number" || !Array.isArray(element.geometry))
      continue;
    const coordinates = element.geometry.flatMap((point) =>
      typeof point?.lat === "number" && typeof point?.lon === "number"
        ? [[point.lon, point.lat] as [number, number]]
        : [],
    );
    if (
      coordinates.length < 2 ||
      coordinates.length !== element.geometry.length
    )
      continue;
    const inCampus = coordinates.some(([lng, lat]) =>
      rings.some((ring) => pointInRing(lng, lat, ring)),
    );
    if (!inCampus) continue;
    const name = element.tags?.name;
    features.push({
      type: "Feature",
      properties: {
        osmWayId: element.id,
        name: typeof name === "string" && name.trim() ? name : null,
      },
      geometry: { type: "LineString", coordinates },
    });
  }
  // 갱신 diff를 읽을 수 있게 번호순으로 둔다(설계 5.3)
  features.sort((a, b) => a.properties.osmWayId - b.properties.osmWayId);
  return {
    type: "FeatureCollection",
    attribution: "© OpenStreetMap contributors",
    license: "ODbL-1.0",
    fetchedAt,
    features,
  };
}
