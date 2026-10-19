import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_SLOPE_BANDS,
  MAX_SLOPE_BANDS,
  MIN_SLOPE_BANDS,
  readSlopeBands,
  readableTextOn,
  slopeBandFromDeg,
  slopeBandIndexFromDeg,
  slopeBandRangeLabel,
  slopeCasingStyle,
  validateSlopeBands,
  type SlopeBand,
} from "./slopeBands";
import {
  RAMP_EXCEPTION_RATIO,
  RELAXED_RATIO,
  WALKWAY_RATIO,
  percentToDeg,
} from "./slopeScale";

function band(
  upperPercent: number | null,
  overrides: Partial<SlopeBand> = {},
): SlopeBand {
  return {
    name: "구간",
    upperPercent,
    color: "#8BC34A",
    description: "",
    ...overrides,
  };
}

function setting(...uppers: (number | null)[]) {
  return { bands: uppers.map((upper) => band(upper)) };
}

function errorsOf(value: unknown): string[] {
  const result = validateSlopeBands(value);
  return result.ok ? [] : result.errors;
}

const GAP_ERROR = "구간 2의 상한은 앞 구간보다 0.01%p 이상 커야 해요";
const RANGE_ERROR_1 = "구간 1의 상한을 0%보다 크고 100% 이하로 적어 주세요";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("DEFAULT_SLOPE_BANDS", () => {
  it("상한은 비율 상수를 반올림하지 않은 값이고 마지막은 null이다", () => {
    expect(DEFAULT_SLOPE_BANDS.map((entry) => entry.upperPercent)).toEqual([
      WALKWAY_RATIO * 100,
      RELAXED_RATIO * 100,
      RAMP_EXCEPTION_RATIO * 100,
      null,
    ]);
  });

  it("색은 연두·노랑·주황·빨강이다", () => {
    expect(DEFAULT_SLOPE_BANDS.map((entry) => entry.color)).toEqual([
      "#8BC34A",
      "#FFD600",
      "#FF9800",
      "#E53935",
    ]);
  });

  it("검증을 그대로 통과한다", () => {
    expect(validateSlopeBands({ bands: DEFAULT_SLOPE_BANDS })).toEqual({
      ok: true,
      value: { bands: DEFAULT_SLOPE_BANDS },
    });
  });
});

describe("validateSlopeBands — 개수와 형식", () => {
  it(`${MIN_SLOPE_BANDS}~${MAX_SLOPE_BANDS}개만 받는다`, () => {
    expect(errorsOf(setting(null))).toEqual(["구간은 2~6개여야 해요"]);
    expect(errorsOf(setting(1, 2, 3, 4, 5, 6, null))).toEqual([
      "구간은 2~6개여야 해요",
    ]);
    expect(errorsOf(setting(1, null))).toEqual([]);
    expect(errorsOf(setting(1, 2, 3, 4, 5, null))).toEqual([]);
  });

  it("객체가 아니거나 bands가 배열이 아니면 형식 오류다", () => {
    for (const value of [null, "nope", {}, { bands: "nope" }]) {
      expect(errorsOf(value)).toEqual(["범례 설정 형식이 올바르지 않아요"]);
    }
  });
});

describe("validateSlopeBands — 상한", () => {
  it("같거나 역순인 상한을 거부한다", () => {
    expect(errorsOf(setting(5, 5, null))).toEqual([GAP_ERROR]);
    expect(errorsOf(setting(6, 5, null))).toEqual([GAP_ERROR]);
  });

  // 5.01 − 5는 부동소수로 0.009999999999999787이다. 허용오차 없이 비교하면 사람이 친 5.01을 거부한다(설계 2.4)
  it("앞 상한보다 0.01%p 이상 커야 한다", () => {
    expect(errorsOf(setting(5, 5.009, null))).toEqual([GAP_ERROR]);
    expect(errorsOf(setting(5, 5.01, null))).toEqual([]);
  });

  it("0보다 크고 100 이하다", () => {
    expect(errorsOf(setting(0, null))).toEqual([RANGE_ERROR_1]);
    expect(errorsOf(setting(100.01, null))).toEqual([RANGE_ERROR_1]);
    expect(errorsOf(setting(NaN, null))).toEqual([RANGE_ERROR_1]);
    expect(errorsOf(setting(Infinity, null))).toEqual([RANGE_ERROR_1]);
    expect(errorsOf(setting(100, null))).toEqual([]);
  });

  it("마지막 구간만 상한이 없다", () => {
    expect(errorsOf(setting(5, 10))).toEqual([
      "마지막 구간에는 상한을 두지 않아요",
    ]);
    expect(errorsOf(setting(5, null, null))).toEqual([
      "구간 2의 상한을 0%보다 크고 100% 이하로 적어 주세요",
    ]);
  });
});

describe("validateSlopeBands — 이름·설명·색", () => {
  it("이름은 앞뒤 공백을 떼고 1~20자다", () => {
    expect(errorsOf({ bands: [band(5, { name: "   " }), band(null)] })).toEqual(
      ["구간 1의 이름을 1~20자로 적어 주세요"],
    );
    expect(
      errorsOf({ bands: [band(5, { name: "가".repeat(21) }), band(null)] }),
    ).toEqual(["구간 1의 이름을 1~20자로 적어 주세요"]);
    const result = validateSlopeBands({
      bands: [band(5, { name: ` ${"가".repeat(20)} ` }), band(null)],
    });
    expect(result.ok && result.value.bands[0].name).toBe("가".repeat(20));
  });

  it("설명은 비어도 되고 200자까지다", () => {
    expect(
      errorsOf({
        bands: [band(5, { description: "가".repeat(201) }), band(null)],
      }),
    ).toEqual(["구간 1의 설명은 200자까지예요"]);
    expect(
      errorsOf({
        bands: [band(5, { description: "가".repeat(200) }), band(null)],
      }),
    ).toEqual([]);
  });

  it("색은 #RRGGBB이고 대문자로 바꾼다", () => {
    for (const color of ["#FFF", "red", "#GGGGGG"]) {
      expect(errorsOf({ bands: [band(5, { color }), band(null)] })).toEqual([
        "구간 1의 색은 #RRGGBB 꼴로 적어 주세요",
      ]);
    }
    const result = validateSlopeBands({
      bands: [band(5, { color: "#ffd600" }), band(null)],
    });
    expect(result.ok && result.value.bands[0].color).toBe("#FFD600");
  });
});

describe("readSlopeBands", () => {
  it("읽지 못하면 기본값 전체로 그리고 경고를 남긴다", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    for (const value of [null, { bands: "nope" }, setting(5, 10)]) {
      expect(readSlopeBands(value)).toBe(DEFAULT_SLOPE_BANDS);
    }
    expect(warn).toHaveBeenCalledTimes(3);
  });

  it("검증을 통과하면 정규화한 값이다", () => {
    expect(
      readSlopeBands({ bands: [band(5, { color: "#abcdef" }), band(null)] }),
    ).toEqual([band(5, { color: "#ABCDEF" }), band(null)]);
  });
});

describe("slopeBandIndexFromDeg", () => {
  const bands = DEFAULT_SLOPE_BANDS;
  const boundaries = [
    WALKWAY_RATIO * 100,
    RELAXED_RATIO * 100,
    RAMP_EXCEPTION_RATIO * 100,
  ];

  // %로 친 경계를 도로 바꿔 넣어도 그 경계의 구간이다(2026-10-06 설계 8.2와 같은 실패를 고정)
  it("경계값은 그 구간에 들고 바로 위는 다음 구간이다", () => {
    boundaries.forEach((percent, index) => {
      expect(slopeBandIndexFromDeg(bands, percentToDeg(percent))).toBe(index);
      expect(slopeBandIndexFromDeg(bands, percentToDeg(percent + 0.001))).toBe(
        index + 1,
      );
    });
  });

  it("0은 첫 구간, 45°는 마지막 구간, 내리막은 절댓값이다", () => {
    expect(slopeBandIndexFromDeg(bands, 0)).toBe(0);
    expect(slopeBandIndexFromDeg(bands, 45)).toBe(3);
    expect(slopeBandIndexFromDeg(bands, -7.2)).toBe(3);
    expect(slopeBandIndexFromDeg(bands, -3)).toBe(0);
  });

  it("E2E가 쓰는 값의 구간 색", () => {
    expect(
      [1, 3, 4, 6, 7.2, 10].map((deg) => slopeBandFromDeg(bands, deg).color),
    ).toEqual([
      "#8BC34A",
      "#8BC34A",
      "#FFD600",
      "#FF9800",
      "#E53935",
      "#E53935",
    ]);
  });
});

describe("readableTextOn", () => {
  it("WCAG 대비가 높은 쪽 글자색을 고른다", () => {
    expect(
      ["#8BC34A", "#FFD600", "#FF9800", "#E53935"].map(readableTextOn),
    ).toEqual(["#1C1917", "#1C1917", "#1C1917", "#FFFFFF"]);
  });
});

describe("slopeBandRangeLabel", () => {
  it("첫·가운데·마지막 구간의 범위", () => {
    expect(
      DEFAULT_SLOPE_BANDS.map((_, index) =>
        slopeBandRangeLabel(DEFAULT_SLOPE_BANDS, index),
      ),
    ).toEqual([
      "5.56% 이하 (3.18°)",
      "5.56–8.33% (3.18–4.76°)",
      "8.33–12.5% (4.76–7.13°)",
      "12.5% 초과 (7.13°~)",
    ]);
  });
});

describe("slopeCasingStyle", () => {
  it("굵기는 선 + 3, 색·불투명도는 바탕 지도에 따른다", () => {
    expect(slopeCasingStyle(5, false)).toEqual({
      color: "#1C1917",
      weight: 8,
      opacity: 0.5,
    });
    expect(slopeCasingStyle(9, true)).toEqual({
      color: "#FFFFFF",
      weight: 12,
      opacity: 0.6,
    });
  });

  it("선이 흐려진 비율만큼 같이 흐려진다", () => {
    expect(slopeCasingStyle(5, false, 0.28).opacity).toBeCloseTo(0.14, 10);
  });
});
