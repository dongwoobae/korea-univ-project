import type {
  Feature,
  FeatureCollection,
  Geometry,
  MultiPolygon,
  Polygon,
  Position,
} from "geojson";

type CampusProperties = { campus?: string | null } & Record<string, unknown>;
export type CampusAreaGeometry = Polygon | MultiPolygon;
export type CampusBoundaryCollection = FeatureCollection<
  CampusAreaGeometry,
  CampusProperties
>;

function isAreaGeometry(
  geometry: Geometry | null | undefined,
): geometry is CampusAreaGeometry {
  return geometry?.type === "Polygon" || geometry?.type === "MultiPolygon";
}

function pointOnSegment(point: Position, start: Position, end: Position) {
  const [x, y] = point;
  const [x1, y1] = start;
  const [x2, y2] = end;
  const cross = (y - y1) * (x2 - x1) - (x - x1) * (y2 - y1);
  if (Math.abs(cross) > 1e-12) return false;
  return (
    x >= Math.min(x1, x2) &&
    x <= Math.max(x1, x2) &&
    y >= Math.min(y1, y2) &&
    y <= Math.max(y1, y2)
  );
}

function pointInRing(point: Position, ring: Position[]) {
  let inside = false;
  for (let i = 0, previous = ring.length - 1; i < ring.length; previous = i++) {
    const currentPoint = ring[i];
    const previousPoint = ring[previous];
    if (pointOnSegment(point, previousPoint, currentPoint)) return true;
    const intersects =
      currentPoint[1] > point[1] !== previousPoint[1] > point[1] &&
      point[0] <
        ((previousPoint[0] - currentPoint[0]) * (point[1] - currentPoint[1])) /
          (previousPoint[1] - currentPoint[1]) +
          currentPoint[0];
    if (intersects) inside = !inside;
  }
  return inside;
}

function pointInPolygon(point: Position, polygon: Position[][]) {
  if (!polygon[0] || !pointInRing(point, polygon[0])) return false;
  return polygon.slice(1).every((hole) => !pointInRing(point, hole));
}

function pointInArea(point: Position, geometry: CampusAreaGeometry) {
  const polygons =
    geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  return polygons.some((polygon) => pointInPolygon(point, polygon));
}

function exteriorPoints(geometry: CampusAreaGeometry) {
  const polygons =
    geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  return polygons.flatMap((polygon) => polygon[0]?.slice(0, -1) ?? []);
}

function averagePoint(points: Position[]): Position | null {
  if (points.length === 0) return null;
  const [x, y] = points.reduce(
    ([sumX, sumY], point) => [sumX + point[0], sumY + point[1]],
    [0, 0],
  );
  return [x / points.length, y / points.length];
}

export function inferCampusFromGeometry(
  value: Feature | Geometry | null | undefined,
  boundaries: CampusBoundaryCollection | null | undefined,
) {
  const geometry = value?.type === "Feature" ? value.geometry : value;
  if (!isAreaGeometry(geometry) || !boundaries) return null;

  const points = exteriorPoints(geometry);
  const representativePoint = averagePoint(points);
  let bestCampus: string | null = null;
  let bestScore = 0;

  for (const boundary of boundaries.features) {
    const campus = boundary.properties?.campus;
    if (!campus || !isAreaGeometry(boundary.geometry)) continue;
    const containedPoints = points.filter((point) =>
      pointInArea(point, boundary.geometry),
    ).length;
    const representativeInside =
      representativePoint && pointInArea(representativePoint, boundary.geometry)
        ? 0.5
        : 0;
    const score = containedPoints + representativeInside;
    if (score > bestScore) {
      bestCampus = campus;
      bestScore = score;
    }
  }

  return bestCampus;
}

export function assignCampusesToBuildings(
  buildings: FeatureCollection,
  boundaries: CampusBoundaryCollection,
): FeatureCollection {
  return {
    ...buildings,
    features: buildings.features.map((feature) => ({
      ...feature,
      properties: {
        ...feature.properties,
        campus: inferCampusFromGeometry(feature, boundaries),
      },
    })),
  };
}
