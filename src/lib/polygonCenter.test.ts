import { describe, expect, it } from "vitest";
import type { Feature, Point, Polygon } from "geojson";
import {
  KU_CENTER,
  getBuildingViewCenter,
  getPointLatLng,
  getPolygonRingCenter,
} from "./polygonCenter";

function polygon(ring: [number, number][]): Feature<Polygon> {
  return {
    type: "Feature",
    geometry: { type: "Polygon", coordinates: [ring] },
    properties: {},
  };
}

describe("getPolygonRingCenter", () => {
  it("링 좌표의 평균점을 [lat, lng] 순서로 돌려준다", () => {
    const center = getPolygonRingCenter(
      polygon([
        [127.0, 37.0],
        [127.2, 37.0],
        [127.2, 37.4],
        [127.0, 37.4],
      ]),
    );

    expect(center[0]).toBeCloseTo(37.2, 10);
    expect(center[1]).toBeCloseTo(127.1, 10);
  });

  it("bbox 중심이 아니라 평균을 쓴다", () => {
    // 아래 변에 점이 하나 더 있어 평균은 아래로 쏠린다. bbox 중심이면 37.5.
    const center = getPolygonRingCenter(
      polygon([
        [127.0, 37.0],
        [127.5, 37.0],
        [127.5, 38.0],
        [127.0, 38.0],
        [127.25, 37.0],
      ]),
    );

    expect(center[0]).toBeCloseTo(37.4, 10);
  });

  it("폴리곤이 없으면 캠퍼스 중심으로 폴백한다", () => {
    expect(getPolygonRingCenter(null)).toEqual(KU_CENTER);
  });

  it("링이 비어 있으면 캠퍼스 중심으로 폴백한다", () => {
    expect(getPolygonRingCenter(polygon([]))).toEqual(KU_CENTER);
  });

  it("Point geometry면 캠퍼스 중심으로 폴백한다", () => {
    const point = {
      type: "Feature",
      geometry: { type: "Point", coordinates: [127.03, 37.58] },
      properties: {},
    } as unknown as Feature<Polygon>;

    expect(getPolygonRingCenter(point)).toEqual(KU_CENTER);
  });
});

function point(lng: number, lat: number): Feature<Point> {
  return {
    type: "Feature",
    geometry: { type: "Point", coordinates: [lng, lat] },
    properties: {},
  };
}

describe("getPointLatLng", () => {
  it("점(Point) geojson이면 [lat, lng]을 돌려준다", () => {
    expect(getPointLatLng(point(127.0316, 37.5889))).toEqual([
      37.5889, 127.0316,
    ]);
  });

  it("폴리곤이나 빈 값이면 null이다", () => {
    expect(
      getPointLatLng(
        polygon([
          [127.03, 37.58],
          [127.04, 37.58],
          [127.04, 37.59],
        ]),
      ),
    ).toBeNull();
    expect(getPointLatLng(null)).toBeNull();
  });
});

describe("getBuildingViewCenter", () => {
  it("점(Point) geojson이면 그 점에서 연다", () => {
    expect(getBuildingViewCenter(point(127.0316, 37.5889))).toEqual([
      37.5889, 127.0316,
    ]);
  });

  it("폴리곤이면 링 평균점, 없으면 캠퍼스 중심이다", () => {
    const shape = polygon([
      [127.03, 37.58],
      [127.04, 37.58],
      [127.04, 37.59],
      [127.03, 37.59],
    ]);
    expect(getBuildingViewCenter(shape)).toEqual(getPolygonRingCenter(shape));
    expect(getBuildingViewCenter(null)).toEqual(KU_CENTER);
  });
});
