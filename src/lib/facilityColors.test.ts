import { describe, expect, it } from "vitest";
import {
  getFacilityMarkerColor,
  getFacilityColor,
} from "@/components/map/facilityColors";

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
    expect(getFacilityColor("unknown_code", 0)).toBe("#0891B2");
  });

  it("프로토타입 속성 이름도 팔레트로 떨어진다", () => {
    expect(getFacilityColor("constructor", 0)).toBe("#0891B2");
  });
});
