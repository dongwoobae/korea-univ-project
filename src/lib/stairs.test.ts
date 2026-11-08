import { describe, expect, it } from "vitest";
import {
  applyStairsJoins,
  availableCandidates,
  polylineLength,
  readStairsPoints,
  readStairsSnapshot,
  stairsCasingStyle,
  stairsDraftDirty,
  stairsLineStyle,
  suggestStairsJoins,
  validateStairs,
  type RouteEndpoint,
} from "./stairs";

// 위도 0.00001도는 약 1.11m다(slopeRoute.test.ts의 기준과 같다)
const S = { lat: 37.589, lng: 127.032 };
const E = { lat: 37.58908, lng: 127.032 };

function endpoint(key: string, lat: number, lng = 127.032): RouteEndpoint {
  return { key, routeName: key, point: { lat, lng } };
}

describe("readStairsPoints", () => {
  it("두 점 미만이나 좌표가 아닌 원소는 형식 오류다", () => {
    expect(readStairsPoints([S])).toBeNull();
    expect(readStairsPoints([S, { lat: "37.5", lng: 127 }])).toBeNull();
    expect(readStairsPoints("nope")).toBeNull();
  });

  it("좌표 밖의 키는 버리고 좌표만 돌려준다", () => {
    expect(readStairsPoints([S, { ...E, slope: 3, distance: 8.9 }])).toEqual([
      S,
      E,
    ]);
  });
});

describe("polylineLength", () => {
  it("꼭짓점 사이 거리의 합을 0.1m로 반올림한다", () => {
    expect(polylineLength([S, { lat: 37.59, lng: 127.032 }])).toBe(111.2);
    expect(polylineLength([S])).toBe(0);
  });
});

describe("validateStairs", () => {
  it("이름·두 점·길이 0 구간을 본다", () => {
    expect(validateStairs("", [S, E])).toEqual(["계단 이름을 입력해주세요"]);
    expect(validateStairs("계단", [S])).toEqual(["지도에 계단을 그려주세요"]);
    expect(validateStairs("계단", [S, S])).toEqual([
      "길이가 0m인 구간이 있어요. 같은 자리를 두 번 찍지 말아주세요",
    ]);
    expect(validateStairs("계단", [S, E])).toEqual([]);
  });
});

describe("suggestStairsJoins", () => {
  it("10m 안의 가장 가까운 경사로 끝점을 고른다", () => {
    const joins = suggestStairsJoins(
      [S, E],
      [endpoint("near", 37.58897), endpoint("nearer", 37.58898)],
    );
    expect(joins).toEqual([
      {
        end: "start",
        endpoint: endpoint("nearer", 37.58898),
        distance: 2.2,
      },
    ]);
  });

  it("10m 밖의 끝점은 고르지 않는다", () => {
    expect(suggestStairsJoins([S, E], [endpoint("far", 37.5889)])).toEqual([]);
  });

  it("두 끝이 같은 끝점을 고르면 가까운 끝만 잇고, 다른 끝은 다음 끝점을 고른다", () => {
    const shared = endpoint("shared", 37.58903);
    const next = endpoint("next", 37.58916);
    expect(suggestStairsJoins([S, E], [shared, next])).toEqual([
      { end: "start", endpoint: shared, distance: 3.3 },
      { end: "end", endpoint: next, distance: 8.9 },
    ]);
  });

  it("이미 끝점에 붙은 끝은 제안하지 않고, 다른 끝도 그 끝점을 가져가지 않는다", () => {
    expect(
      suggestStairsJoins(
        [S, { lat: 37.58905, lng: 127.032 }],
        [endpoint("on", S.lat)],
      ),
    ).toEqual([]);
  });
});

describe("applyStairsJoins", () => {
  it("켠 끝만 끝점 좌표로 바꾼다", () => {
    const joins = suggestStairsJoins(
      [S, E],
      [endpoint("a", 37.58897), endpoint("b", 37.58911)],
    );
    expect(joins).toHaveLength(2);
    expect(
      applyStairsJoins([S, E], joins, { start: true, end: false }),
    ).toEqual([{ lat: 37.58897, lng: 127.032 }, E]);
  });
});

describe("readStairsSnapshot", () => {
  const feature = (
    osmWayId: unknown,
    coordinates: unknown,
    name: unknown = null,
  ) => ({
    type: "Feature",
    properties: { osmWayId, name },
    geometry: { type: "LineString", coordinates },
  });

  it("GeoJSON [lng, lat]를 꼭짓점으로 바꾸고, 빈 이름은 null이다", () => {
    expect(
      readStairsSnapshot({
        type: "FeatureCollection",
        features: [
          feature(
            7,
            [
              [127.032, 37.589],
              [127.0321, 37.5891],
            ],
            " ",
          ),
        ],
      }),
    ).toEqual([
      {
        osmWayId: 7,
        name: null,
        vertices: [
          { lat: 37.589, lng: 127.032 },
          { lat: 37.5891, lng: 127.0321 },
        ],
      },
    ]);
  });

  it("FeatureCollection이 아니면 null, 틀린 계단 하나는 빼고 나머지를 쓴다", () => {
    expect(readStairsSnapshot({ features: [] })).toBeNull();
    expect(
      readStairsSnapshot({
        type: "FeatureCollection",
        features: [
          feature(-1, [
            [127, 37],
            [127.1, 37.1],
          ]),
          feature(8, [[127, 37]]),
          feature(
            9,
            [
              [127, 37],
              [127.1, 37.1],
            ],
            "본관 계단",
          ),
        ],
      })?.map((candidate) => candidate.osmWayId),
    ).toEqual([9]);
  });
});

describe("availableCandidates", () => {
  it("확정된 OSM 번호를 뺀다", () => {
    const candidates = [
      { osmWayId: 1, name: null, vertices: [S, E] },
      { osmWayId: 2, name: null, vertices: [S, E] },
    ];
    expect(
      availableCandidates(candidates, new Set([1])).map((c) => c.osmWayId),
    ).toEqual([2]);
  });
});

describe("stairsDraftDirty", () => {
  const initial = { name: "계단", note: "", vertices: [S, E] };
  it("앞뒤 공백은 보지 않고, 값이 같으면 새 배열이어도 깨끗하다", () => {
    expect(
      stairsDraftDirty(
        { name: " 계단 ", note: "", vertices: [{ ...S }, { ...E }] },
        initial,
      ),
    ).toBe(false);
    expect(stairsDraftDirty({ ...initial, note: "우회" }, initial)).toBe(true);
  });
});

describe("선 스타일", () => {
  it("선과 외곽선이 같은 점선 무늬다", () => {
    expect(stairsLineStyle(5)).toMatchObject({
      color: "#78716C",
      weight: 5,
      dashArray: "0 14",
      lineCap: "round",
    });
    expect(stairsCasingStyle(5, false)).toMatchObject({
      weight: 8,
      dashArray: "0 14",
      lineCap: "round",
    });
  });
});
