import { describe, expect, it } from "vitest";
import {
  MAX_SLOPE_DEG,
  RAMP_EXCEPTION_RATIO,
  RELAXED_RATIO,
  SLOPE_BANDS,
  WALKWAY_RATIO,
  degToPercent,
  formatDeg,
  formatPercent,
  formatSlopeInput,
  fromDegrees,
  isSlopeDegInRange,
  percentToDeg,
  slopeColorFromDeg,
  slopeWarningFromDeg,
  toDegrees,
} from "./slopeScale";

const BAND_COLORS = [
  "#91D4C6",
  "#36A980",
  "#0465AF",
  "#E6B816",
  "#D75A07",
  "#9A023C",
];

// 변환을 거치지 않은 %로 칸을 찾는다. 테스트의 기대값 계산용.
const colorOfExactPercent = (percent: number) =>
  SLOPE_BANDS.find((band) => percent <= band.maxPercent)!.color;

describe("degToPercent / percentToDeg", () => {
  it("45°는 100%다", () => {
    expect(degToPercent(45)).toBeCloseTo(100, 10);
    expect(percentToDeg(100)).toBeCloseTo(45, 10);
  });

  it("10°는 17.63%다", () => {
    expect(degToPercent(10)).toBeCloseTo(17.633, 3);
  });

  it("왕복하면 값이 돌아온다", () => {
    for (const deg of [0, 1.1, 4.7636, 7.2, 10.4, 45]) {
      expect(percentToDeg(degToPercent(deg))).toBeCloseTo(deg, 10);
    }
  });
});

describe("기준선", () => {
  it("비율에서 나온다", () => {
    expect(WALKWAY_RATIO * 100).toBeCloseTo(5.5556, 4);
    expect(RELAXED_RATIO * 100).toBeCloseTo(8.3333, 4);
    expect(RAMP_EXCEPTION_RATIO * 100).toBe(12.5);
  });
});

describe("isSlopeDegInRange", () => {
  it("0°와 45°를 포함한다", () => {
    expect(isSlopeDegInRange(0)).toBe(true);
    expect(isSlopeDegInRange(MAX_SLOPE_DEG)).toBe(true);
  });

  // tan은 주기 함수라 %로 바꾼 뒤 검사하면 181°가 1.75%로 통과한다(설계 3.2).
  it("범위 밖 각도는 tan 값과 무관하게 거부한다", () => {
    for (const deg of [-0.1, 45.01, 90, 181, -179, 200]) {
      expect(isSlopeDegInRange(deg)).toBe(false);
    }
  });

  it("퍼센트 경계 100%는 통과하고 100.01%와 음수는 거부한다(설계 8.2)", () => {
    expect(isSlopeDegInRange(percentToDeg(100))).toBe(true);
    expect(isSlopeDegInRange(percentToDeg(100.01))).toBe(false);
    expect(isSlopeDegInRange(percentToDeg(-1))).toBe(false);
  });

  it("유한하지 않은 값을 거부한다", () => {
    expect(isSlopeDegInRange(NaN)).toBe(false);
    expect(isSlopeDegInRange(Infinity)).toBe(false);
  });
});

describe("slopeColorFromDeg", () => {
  it("색 순서가 설계와 같다", () => {
    expect(SLOPE_BANDS.map((band) => band.color)).toEqual(BAND_COLORS);
  });

  it("경계값은 그 칸에 포함되고 바로 위는 다음 칸이다", () => {
    SLOPE_BANDS.slice(0, -1).forEach((band, index) => {
      expect(slopeColorFromDeg(percentToDeg(band.maxPercent))).toBe(
        BAND_COLORS[index],
      );
      expect(slopeColorFromDeg(percentToDeg(band.maxPercent + 0.01))).toBe(
        BAND_COLORS[index + 1],
      );
    });
  });

  it("E2E가 쓰는 값의 칸", () => {
    expect(slopeColorFromDeg(1)).toBe("#91D4C6");
    expect(slopeColorFromDeg(3)).toBe("#36A980");
    expect(slopeColorFromDeg(7.2)).toBe("#D75A07");
    expect(slopeColorFromDeg(10)).toBe("#9A023C");
  });

  it("부동소수 오차로 경계를 살짝 넘어도 그 칸에 남는다", () => {
    expect(slopeColorFromDeg(percentToDeg(100 / 12 + 1e-12))).toBe("#0465AF");
  });
});

// 설계 2.2 — 자릿수 반올림은 어떤 경계값을 반드시 위 칸으로 민다. 저장은 반올림 없이.
describe("% 입력이 도 저장을 거쳐도 같은 칸에 남는다", () => {
  it.each([
    WALKWAY_RATIO * 100,
    RELAXED_RATIO * 100,
    RAMP_EXCEPTION_RATIO * 100,
    2,
    5.56,
    8.33,
    12.5,
    15,
  ])("%s%%", (percent) => {
    expect(slopeColorFromDeg(percentToDeg(percent))).toBe(
      colorOfExactPercent(percent),
    );
  });
});

describe("slopeWarningFromDeg", () => {
  it("정확한 1/12는 경고가 없다", () => {
    expect(slopeWarningFromDeg(percentToDeg(100 / 12))).toBeNull();
  });

  it("1/12를 넘으면 완화 한도 경고다", () => {
    expect(slopeWarningFromDeg(percentToDeg(8.34))).toBe("relaxed-limit");
    expect(slopeWarningFromDeg(16.69)).toBe("relaxed-limit");
    expect(slopeWarningFromDeg(percentToDeg(30))).toBe("relaxed-limit");
  });

  it("30%를 넘으면 강한 경고다", () => {
    expect(slopeWarningFromDeg(16.71)).toBe("extreme");
    expect(slopeWarningFromDeg(45)).toBe("extreme");
  });
});

describe("입력 단위", () => {
  it("도는 그대로, %는 도로 바꾼다", () => {
    expect(toDegrees(7.2, "deg")).toBe(7.2);
    expect(toDegrees(12.5, "percent")).toBeCloseTo(7.1250163, 7);
    expect(fromDegrees(10, "deg")).toBe(10);
    expect(fromDegrees(10, "percent")).toBeCloseTo(17.633, 3);
  });

  it("입력란 문자열은 둘째 자리까지, 뒤 0 없이", () => {
    expect(formatSlopeInput(7.2, "deg")).toBe("7.2");
    expect(formatSlopeInput(10, "percent")).toBe("17.63");
    expect(formatSlopeInput(percentToDeg(12.5), "deg")).toBe("7.13");
    expect(formatSlopeInput(percentToDeg(12.5), "percent")).toBe("12.5");
  });

  it("표시 문자열", () => {
    expect(formatPercent(degToPercent(10))).toBe("17.6%");
    expect(formatDeg(10)).toBe("10.0°");
  });
});
