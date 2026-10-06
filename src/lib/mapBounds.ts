/**
 * 캠퍼스 지도 표시 범위. Leaflet을 import하지 않는다 — src/lib/neighborLayer.ts
 * 파일 주석의 SSR 제약. 좌표 순서를 이름으로 못박는다(설계 2026-10-06 5.4).
 */
export interface MapBounds {
  south: number;
  west: number;
  north: number;
  east: number;
}

export const KU_BOUNDS: MapBounds = {
  south: 37.578,
  west: 127.018,
  north: 37.6,
  east: 127.048,
};

export function containsPoint(bounds: MapBounds, lat: number, lng: number) {
  return (
    lat >= bounds.south &&
    lat <= bounds.north &&
    lng >= bounds.west &&
    lng <= bounds.east
  );
}
