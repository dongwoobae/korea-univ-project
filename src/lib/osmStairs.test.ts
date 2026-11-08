import { describe, expect, it } from "vitest";
import {
  buildStairsSnapshot,
  campusBoundingBox,
  overpassStairsQuery,
  pointInRing,
} from "./osmStairs";

const SQUARE: [number, number][] = [
  [127.0, 37.0],
  [127.1, 37.0],
  [127.1, 37.1],
  [127.0, 37.1],
  [127.0, 37.0],
];

const CAMPUSES = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: { campus: "시험" },
      geometry: { type: "Polygon", coordinates: [SQUARE] },
    },
  ],
};

function way(
  id: number,
  points: [number, number][],
  tags: Record<string, string> = { highway: "steps" },
) {
  return {
    type: "way",
    id,
    tags,
    geometry: points.map(([lon, lat]) => ({ lat, lon })),
  };
}

describe("pointInRing", () => {
  it("다각형 안팎을 가른다", () => {
    expect(pointInRing(127.05, 37.05, SQUARE)).toBe(true);
    expect(pointInRing(127.2, 37.05, SQUARE)).toBe(false);
  });
});

describe("campusBoundingBox", () => {
  it("모든 캠퍼스 꼭짓점의 경계다", () => {
    expect(campusBoundingBox(CAMPUSES)).toEqual({
      south: 37.0,
      west: 127.0,
      north: 37.1,
      east: 127.1,
    });
  });
});

describe("overpassStairsQuery", () => {
  it("경계 안의 계단 way를 좌표와 함께 묻는다", () => {
    expect(
      overpassStairsQuery({ south: 37, west: 127, north: 37.1, east: 127.1 }),
    ).toBe(
      '[out:json][timeout:60];way["highway"="steps"](37,127,37.1,127.1);out tags geom;',
    );
  });
});

describe("buildStairsSnapshot", () => {
  const overpass = {
    elements: [
      way(
        30,
        [
          [127.05, 37.05],
          [127.06, 37.06],
        ],
        { highway: "steps", name: "본관 계단" },
      ),
      way(10, [
        [127.09, 37.05],
        [127.2, 37.05],
      ]),
      way(20, [
        [127.3, 37.3],
        [127.4, 37.4],
      ]),
      way(
        40,
        [
          [127.05, 37.05],
          [127.06, 37.06],
        ],
        { highway: "footway" },
      ),
      way(50, [[127.05, 37.05]]),
    ],
  };

  it("캠퍼스에 꼭짓점이 하나라도 걸친 계단만, 번호순으로 담는다", () => {
    const snapshot = buildStairsSnapshot(
      overpass,
      CAMPUSES,
      "2026-11-06T00:00:00Z",
    );
    expect(snapshot).toMatchObject({
      type: "FeatureCollection",
      attribution: "© OpenStreetMap contributors",
      license: "ODbL-1.0",
      fetchedAt: "2026-11-06T00:00:00Z",
    });
    expect(snapshot.features.map((feature) => feature.properties)).toEqual([
      { osmWayId: 10, name: null },
      { osmWayId: 30, name: "본관 계단" },
    ]);
    expect(snapshot.features[1].geometry).toEqual({
      type: "LineString",
      coordinates: [
        [127.05, 37.05],
        [127.06, 37.06],
      ],
    });
  });

  it("깨진 응답이나 빈 캠퍼스는 던진다 — 스크립트가 파일을 덮지 않는다", () => {
    expect(() => buildStairsSnapshot({}, CAMPUSES, "t")).toThrow();
    expect(() =>
      buildStairsSnapshot(
        overpass,
        { type: "FeatureCollection", features: [] },
        "t",
      ),
    ).toThrow();
  });
});
