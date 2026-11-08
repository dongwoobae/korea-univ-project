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

/**
 * 공개 지도(`Map.tsx`, 15)를 뺀 지도들 — 관리자 작업 지도·경사도 편집 지도·건물 폴리곤 편집기·시설 위치 미니맵 — 이
 * 물러날 수 있는 최소 줌. 공개 지도보다 한 단계 넓다. 이동 범위(maxBounds)는 걸지 않는다 — 이 줌에서 `KU_BOUNDS`는
 * 화면보다 작아 Leaflet이 지도를 그 가운데에 묶고, 작업 화면에서는 목록·상세 패널이 캠퍼스를 덮는다(설계 2026-10-14 3.5)
 */
export const MAP_MIN_ZOOM = 14;

export function containsPoint(bounds: MapBounds, lat: number, lng: number) {
  return (
    lat >= bounds.south &&
    lat <= bounds.north &&
    lng >= bounds.west &&
    lng <= bounds.east
  );
}
