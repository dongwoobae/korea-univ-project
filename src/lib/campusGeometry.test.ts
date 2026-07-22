import { describe, expect, it } from "vitest";
import type { FeatureCollection, Polygon } from "geojson";
import {
  assignCampusesToBuildings,
  inferCampusFromGeometry,
} from "./campusGeometry";

const boundaries: FeatureCollection<Polygon, { campus: string }> = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: { campus: "서쪽" },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [0, 0],
            [5, 0],
            [5, 5],
            [0, 5],
            [0, 0],
          ],
        ],
      },
    },
    {
      type: "Feature",
      properties: { campus: "동쪽" },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [5, 0],
            [10, 0],
            [10, 5],
            [5, 5],
            [5, 0],
          ],
        ],
      },
    },
  ],
};

function building(coordinates: number[][]) {
  return {
    type: "Feature" as const,
    properties: { campus: "DB의 다른 구분자" },
    geometry: { type: "Polygon" as const, coordinates: [coordinates] },
  };
}

describe("campus geometry", () => {
  it("건물 영역이 포함된 캠퍼스를 반환한다", () => {
    expect(
      inferCampusFromGeometry(
        building([
          [1, 1],
          [2, 1],
          [2, 2],
          [1, 2],
          [1, 1],
        ]),
        boundaries,
      ),
    ).toBe("서쪽");
  });

  it("경계에 걸친 건물은 더 많은 외곽점이 포함된 캠퍼스로 배정한다", () => {
    expect(
      inferCampusFromGeometry(
        building([
          [4, 1],
          [8, 1],
          [8, 2],
          [6, 3],
          [4, 1],
        ]),
        boundaries,
      ),
    ).toBe("동쪽");
  });

  it("DB campus를 공간 판정 결과로 덮어쓴다", () => {
    const result = assignCampusesToBuildings(
      {
        type: "FeatureCollection",
        features: [
          building([
            [6, 1],
            [7, 1],
            [7, 2],
            [6, 2],
            [6, 1],
          ]),
        ],
      },
      boundaries,
    );
    expect(result.features[0].properties?.campus).toBe("동쪽");
  });
});
