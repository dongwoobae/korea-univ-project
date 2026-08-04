import type { Feature, Polygon } from "geojson";

export const KU_CENTER: [number, number] = [37.5893, 127.0327];

/**
 * 폴리곤 링 좌표의 평균점.
 *
 * bbox 중심이 아니라 **평균**이라는 점이 중요하다. `PolygonEditor`가 이 값으로
 * `setView(center, 18)`을 하므로, 프리뷰가 다른 계산을 쓰면 편집 버튼을 누르는
 * 순간 지도가 튄다. 두 화면이 이 함수 하나만 보게 한다.
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
