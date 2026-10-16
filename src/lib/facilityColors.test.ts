import { describe, expect, it } from "vitest";
import {
  FALLBACK_PALETTE,
  getFacilityMarkerColor,
  getFacilityColor,
} from "@/components/map/facilityColors";
import { campusColor, facilityColor } from "@/lib/theme";

describe("getFacilityMarkerColor", () => {
  it("알려진 코드는 지정색을, 모르는 코드는 회색을 준다", () => {
    expect(getFacilityMarkerColor("ramp")).toBe("#B25617");
    expect(getFacilityMarkerColor("unknown_code")).toBe("#666");
  });

  it("프로토타입 속성 이름도 폴백으로 떨어진다", () => {
    expect(getFacilityMarkerColor("constructor")).toBe("#666");
    expect(getFacilityMarkerColor("toString")).toBe("#666");
  });
});

describe("getFacilityColor", () => {
  it("모르는 코드는 인덱스로 팔레트를 돈다", () => {
    expect(getFacilityColor("unknown_code", 0)).toBe("#0E7490");
  });

  it("프로토타입 속성 이름도 팔레트로 떨어진다", () => {
    expect(getFacilityColor("constructor", 0)).toBe("#0E7490");
  });
});

function contrastWithWhite(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return 1.05 / (luminance + 0.05);
}

// 선택된 필터 칩은 이 색으로 채우고 흰 글자를 얹는다(2026-10-16-square-corners-design.md)
describe("필터 칩 채움색", () => {
  it("흰 글자와 대비가 4.5:1 이상이다", () => {
    const colors = [
      ...Object.values(facilityColor),
      ...Object.values(campusColor),
      ...FALLBACK_PALETTE,
    ];
    for (const hex of colors) {
      expect(contrastWithWhite(hex), hex).toBeGreaterThanOrEqual(4.5);
    }
  });
});
