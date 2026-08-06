import { describe, expect, it } from "vitest";
import { getFacilityBadges } from "./facilityBadges";

const cleanFacility = {
  is_installed: true,
  name: "중앙 경사로",
  name_en: "Central ramp",
  name_zh: "中央坡道",
  description: null,
  description_en: null,
  description_zh: null,
  floor_info: null,
  floor_info_en: null,
  floor_info_zh: null,
  translation_status: "translated",
} as const;

describe("getFacilityBadges", () => {
  it("정상 시설에는 배지가 없다", () => {
    expect(getFacilityBadges(cleanFacility)).toEqual([]);
  });

  it("is_installed가 참이 아니면 missing을 붙인다", () => {
    expect(
      getFacilityBadges({ ...cleanFacility, is_installed: false }),
    ).toEqual(["missing"]);
    expect(getFacilityBadges({ ...cleanFacility, is_installed: null })).toEqual(
      ["missing"],
    );
  });

  it("번역이 필요하면 translation_needed를 붙인다", () => {
    expect(
      getFacilityBadges({ ...cleanFacility, translation_status: "failed" }),
    ).toEqual(["translation_needed"]);
  });

  it("원문이 있는데 번역 필드가 비면 translation_needed를 붙인다", () => {
    expect(getFacilityBadges({ ...cleanFacility, name_zh: null })).toEqual([
      "translation_needed",
    ]);
  });

  it("둘 다 해당하면 미설치가 먼저 온다", () => {
    expect(
      getFacilityBadges({
        ...cleanFacility,
        is_installed: false,
        translation_status: "failed",
      }),
    ).toEqual(["missing", "translation_needed"]);
  });
});
