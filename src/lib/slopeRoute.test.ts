import { describe, expect, it } from "vitest";
import {
  buildSegments,
  readRoutePoints,
  haversine,
  readStoredSlopes,
  readStoredVertices,
  toStoredSegments,
  validateRoute,
} from "./slopeRoute";
import { percentToDeg } from "./slopeScale";

// 위도 0.001도는 약 111.19m, 경도 0.001도는 위도 37.589에서 약 88.1m다.
const A = { lat: 37.589, lng: 127.032 };
const B = { lat: 37.59, lng: 127.032 };
const C = { lat: 37.59, lng: 127.033 };

describe("haversine", () => {
  it("위도 0.001도 차이를 약 111m로 계산한다", () => {
    expect(haversine(A.lat, A.lng, B.lat, B.lng)).toBeCloseTo(111.19, 1);
  });

  it("같은 지점 사이 거리는 0이다", () => {
    expect(haversine(A.lat, A.lng, A.lat, A.lng)).toBe(0);
  });
});

describe("buildSegments", () => {
  it("꼭짓점이 2개 미만이면 구간이 없다", () => {
    expect(buildSegments([])).toEqual([]);
    expect(buildSegments([A])).toEqual([]);
  });

  it("꼭짓점 n개에서 구간 n-1개를 만든다", () => {
    const segments = buildSegments([A, B, C]);
    expect(segments).toHaveLength(2);
    expect(segments[0].index).toBe(0);
    expect(segments[1].index).toBe(1);
  });

  it("구간 거리를 소수점 한 자리로 반올림한다", () => {
    expect(buildSegments([A, B])[0].distance).toBe(111.2);
  });

  // 거리를 들고 다니면 안 되는 이유. 선을 통째로 옮기면 경도 길이가 달라진다.
  it("같은 형상이라도 위도가 다르면 거리가 달라진다", () => {
    const near = buildSegments([
      { lat: 37.589, lng: 127.032 },
      { lat: 37.589, lng: 127.033 },
    ])[0].distance;
    const far = buildSegments([
      { lat: 60.0, lng: 127.032 },
      { lat: 60.0, lng: 127.033 },
    ])[0].distance;
    expect(near).not.toBe(far);
  });
});

describe("toStoredSegments", () => {
  it("첫 포인트는 좌표만 싣는다", () => {
    const stored = toStoredSegments([A, B], [7.2]);
    expect(stored[0]).toEqual({ lat: A.lat, lng: A.lng });
  });

  it("이후 포인트에 구간 값과 계산된 거리를 싣는다", () => {
    const stored = toStoredSegments([A, B], [7.2]);
    expect(stored[1]).toEqual({
      lat: B.lat,
      lng: B.lng,
      slope: 7.2,
      distance: 111.2,
    });
  });

  // 설계 2.2 — 자릿수 반올림은 %로 입력한 기준선 값을 위 칸으로 민다.
  it("경사도를 반올림하지 않는다", () => {
    expect(toStoredSegments([A, B], [7.26])[1].slope).toBe(7.26);
    const fromPercent = percentToDeg(12.5);
    expect(toStoredSegments([A, B], [fromPercent])[1].slope).toBe(fromPercent);
  });

  it("경사도 0도 값으로 저장한다", () => {
    expect(toStoredSegments([A, B], [0])[1].slope).toBe(0);
  });
});

describe("readStoredVertices / readStoredSlopes", () => {
  it("저장된 포인트에서 꼭짓점과 값을 되읽는다", () => {
    const stored = toStoredSegments([A, B, C], [7.2, 4.5]);
    expect(readStoredVertices(stored)).toEqual([
      { lat: A.lat, lng: A.lng },
      { lat: B.lat, lng: B.lng },
      { lat: C.lat, lng: C.lng },
    ]);
    expect(readStoredSlopes(stored)).toEqual([7.2, 4.5]);
  });
});

describe("validateRoute", () => {
  it("정상 입력에는 오류가 없다", () => {
    expect(validateRoute("정문 경사로", [A, B], [7.2])).toEqual([]);
  });

  it("이름이 비면 막는다", () => {
    expect(validateRoute("   ", [A, B], [7.2])).toContain(
      "경로 이름을 입력해주세요",
    );
  });

  it("꼭짓점이 2개 미만이면 막는다", () => {
    expect(validateRoute("이름", [A], [])).toContain(
      "지도에 경로를 그려주세요",
    );
  });

  it("입력값 개수가 구간 수와 어긋나면 막는다", () => {
    expect(validateRoute("이름", [A, B, C], [7.2])).toContain(
      "구간과 입력값이 어긋났어요. 지우고 다시 그려주세요",
    );
  });

  it("미입력 구간이 있으면 막는다", () => {
    expect(validateRoute("이름", [A, B], [null])).toContain(
      "1번 구간의 경사도를 입력해주세요",
    );
  });

  it("NaN과 Infinity를 막는다", () => {
    expect(validateRoute("이름", [A, B], [NaN])).toContain(
      "1번 구간의 경사도가 숫자가 아니에요",
    );
    expect(validateRoute("이름", [A, B], [Infinity])).toContain(
      "1번 구간의 경사도가 숫자가 아니에요",
    );
  });

  const RANGE_ERROR = "1번 구간의 경사도는 0~45°(0~100%) 사이여야 해요";

  it("음수를 막는다", () => {
    expect(validateRoute("이름", [A, B], [-0.1])).toContain(RANGE_ERROR);
  });

  it("45°까지 허용하고 45° 초과를 막는다", () => {
    expect(validateRoute("이름", [A, B], [45])).toEqual([]);
    expect(validateRoute("이름", [A, B], [45.01])).toContain(RANGE_ERROR);
  });

  // tan은 주기 함수라 %로 바꿔 검사하면 181°가 1.75%로 통과한다(설계 3.2).
  it("tan 주기성으로 범위를 비켜 가지 못한다", () => {
    for (const deg of [181, -179, 200]) {
      expect(validateRoute("이름", [A, B], [deg])).toContain(RANGE_ERROR);
    }
  });

  // 30%는 경고일 뿐 저장은 된다. 실제로 존재하는 급경사를 막으면 안 된다.
  it("30%를 넘어도 저장은 막지 않는다", () => {
    expect(validateRoute("이름", [A, B], [20])).toEqual([]);
  });

  it("같은 자리를 두 번 찍어 생긴 0m 구간을 막는다", () => {
    expect(validateRoute("이름", [A, A], [7.2])).toContain(
      "길이가 0m인 구간이 있어요. 같은 자리를 두 번 찍지 말아주세요",
    );
  });
});

describe("readRoutePoints", () => {
  const stored = toStoredSegments([A, B, C], [7.2, 4.5]);

  it("정상 행은 그대로 돌려준다", () => {
    expect(readRoutePoints(stored)).toEqual(stored);
  });

  // 운영 행에는 GPX 시절 키 ele: null이 남아 있다. 읽지 않을 뿐 거부하지 않는다.
  it("남은 ele 키는 통과시킨다", () => {
    const legacy = [
      { lat: A.lat, lng: A.lng, ele: null },
      { lat: B.lat, lng: B.lng, ele: null, slope: 7.2, distance: 12.4 },
    ];
    expect(readRoutePoints(legacy)).toEqual(legacy);
  });

  it("배열이 아니면 거른다", () => {
    expect(readRoutePoints("xx")).toBeNull();
    expect(readRoutePoints(null)).toBeNull();
    expect(readRoutePoints({ lat: 1, lng: 2 })).toBeNull();
  });

  it("포인트가 2개 미만이면 거른다", () => {
    expect(readRoutePoints([])).toBeNull();
    expect(readRoutePoints([stored[0]])).toBeNull();
  });

  it("좌표가 유한한 수가 아니면 경로 전체를 거른다", () => {
    expect(
      readRoutePoints([{ lat: null, lng: 127.032 }, stored[1]]),
    ).toBeNull();
    expect(
      readRoutePoints([{ lat: "37", lng: 127.032 }, stored[1]]),
    ).toBeNull();
    expect(
      readRoutePoints([
        stored[0],
        { lat: 37.59, lng: NaN, slope: 1, distance: 1 },
      ]),
    ).toBeNull();
  });

  // GPX 분기가 사라졌으므로 slope 없는 행은 그릴 방법이 없다. 0%로 그리면 평지로 보인다.
  it("slope나 distance가 없는 행을 거른다", () => {
    expect(
      readRoutePoints([
        { lat: A.lat, lng: A.lng },
        { lat: B.lat, lng: B.lng, distance: 12.4 },
      ]),
    ).toBeNull();
    expect(
      readRoutePoints([
        { lat: A.lat, lng: A.lng },
        { lat: B.lat, lng: B.lng, slope: 7.2 },
      ]),
    ).toBeNull();
  });

  it("값이 범위를 벗어나면 거른다", () => {
    const withMetrics = (slope: number, distance: number) => [
      { lat: A.lat, lng: A.lng },
      { lat: B.lat, lng: B.lng, slope, distance },
    ];
    expect(readRoutePoints(withMetrics(-1, 10))).toBeNull();
    expect(readRoutePoints(withMetrics(46, 10))).toBeNull();
    expect(readRoutePoints(withMetrics(181, 10))).toBeNull();
    expect(readRoutePoints(withMetrics(5, 0))).toBeNull();
    expect(readRoutePoints(withMetrics(5, -3))).toBeNull();
    expect(readRoutePoints(withMetrics(NaN, 10))).toBeNull();
    expect(readRoutePoints(withMetrics(5, NaN))).toBeNull();
    expect(readRoutePoints(withMetrics(5, Infinity))).toBeNull();
  });

  it("slope 0과 45는 받아들인다", () => {
    const withSlope = (slope: number) => [
      { lat: A.lat, lng: A.lng },
      { lat: B.lat, lng: B.lng, slope, distance: 10 },
    ];
    expect(readRoutePoints(withSlope(0))).not.toBeNull();
    expect(readRoutePoints(withSlope(45))).not.toBeNull();
  });
});
