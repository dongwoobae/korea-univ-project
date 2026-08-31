import { describe, expect, it } from "vitest";
import {
  buildSegments,
  haversine,
  isManualRoute,
  readStoredSlopes,
  readStoredVertices,
  slopeWarning,
  toStoredSegments,
  validateRoute,
} from "./slopeRoute";

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
  it("첫 포인트에는 slope와 distance가 없다", () => {
    const stored = toStoredSegments([A, B], [7.2]);
    expect(stored[0]).toEqual({ lat: A.lat, lng: A.lng, ele: null });
  });

  it("이후 포인트에 구간 값과 계산된 거리를 싣는다", () => {
    const stored = toStoredSegments([A, B], [7.2]);
    expect(stored[1]).toEqual({
      lat: B.lat,
      lng: B.lng,
      ele: null,
      slope: 7.2,
      distance: 111.2,
    });
  });

  it("모든 포인트에 ele: null이 있다", () => {
    const stored = toStoredSegments([A, B, C], [7.2, 4.5]);
    expect(stored.every((point) => point.ele === null)).toBe(true);
  });

  it("경사도를 소수점 한 자리로 반올림한다", () => {
    expect(toStoredSegments([A, B], [7.26])[1].slope).toBe(7.3);
  });

  // SlopeLayer의 구버전 감지가 raw[1].slope를 본다. 0도 통과해야 한다.
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

describe("slopeWarning", () => {
  it("8.33 이하는 경고가 없다", () => {
    expect(slopeWarning(8.33)).toBeNull();
  });

  it("8.33 초과 30 이하는 법적 기준 경고다", () => {
    expect(slopeWarning(8.34)).toBe("legal");
    expect(slopeWarning(30)).toBe("legal");
  });

  it("30 초과는 강한 경고다", () => {
    expect(slopeWarning(30.1)).toBe("extreme");
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

  it("음수를 막는다", () => {
    expect(validateRoute("이름", [A, B], [-0.1])).toContain(
      "1번 구간의 경사도는 0 이상이어야 해요",
    );
  });

  it("100까지 허용하고 100 초과를 막는다", () => {
    expect(validateRoute("이름", [A, B], [100])).toEqual([]);
    expect(validateRoute("이름", [A, B], [100.1])).toContain(
      "1번 구간의 경사도는 100% 이하여야 해요",
    );
  });

  // 30%는 경고일 뿐 저장은 된다. 실제로 존재하는 급경사를 막으면 안 된다.
  it("30을 넘어도 저장은 막지 않는다", () => {
    expect(validateRoute("이름", [A, B], [45])).toEqual([]);
  });

  it("같은 자리를 두 번 찍어 생긴 0m 구간을 막는다", () => {
    expect(validateRoute("이름", [A, A], [7.2])).toContain(
      "길이가 0m인 구간이 있어요. 같은 자리를 두 번 찍지 말아주세요",
    );
  });
});

describe("isManualRoute", () => {
  it("gpx_file이 null이면 수기 경로다", () => {
    expect(isManualRoute({ gpx_file: null })).toBe(true);
    expect(isManualRoute({ gpx_file: "정문.gpx" })).toBe(false);
  });
});
