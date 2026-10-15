import type { Feature, Geometry, Polygon } from "geojson";

export const KU_CENTER: [number, number] = [37.5893, 127.0327];

/**
 * 폴리곤 링 좌표의 평균점(bbox 중심이 아니다). 링이 없으면 캠퍼스 중심.
 */
export function getPolygonRingCenter(
  geojson: Feature<Polygon> | null,
): [number, number] {
  const ring = geojson?.geometry?.coordinates?.[0];
  if (!Array.isArray(ring) || ring.length === 0) return KU_CENTER;
  const avgLat = ring.reduce((sum, coord) => sum + coord[1], 0) / ring.length;
  const avgLng = ring.reduce((sum, coord) => sum + coord[0], 0) / ring.length;
  return [avgLat, avgLng];
}

/** buildings의 점(Point) geojson(지하철역)이면 그 좌표를 [lat, lng]로, 아니면 null */
export function getPointLatLng(
  geojson: Feature<Geometry> | null,
): [number, number] | null {
  const geometry = geojson?.geometry;
  if (geometry?.type !== "Point") return null;
  const [lng, lat] = geometry.coordinates;
  return [lat, lng];
}

/**
 * 건물 폴리곤 프리뷰와 편집기가 여는 중심. 두 화면이 이 함수 하나만 봐야 편집을 누르는 순간 지도가 튀지 않는다.
 */
export function getBuildingViewCenter(
  geojson: Feature<Geometry> | null,
): [number, number] {
  return (
    getPointLatLng(geojson) ??
    getPolygonRingCenter(geojson as Feature<Polygon> | null)
  );
}
