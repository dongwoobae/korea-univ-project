import { describe, expect, it } from "vitest";
import type { Feature, Polygon } from "geojson";
import { KU_CENTER, getPolygonRingCenter } from "./polygonCenter";

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
