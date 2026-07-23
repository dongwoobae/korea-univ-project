import { describe, expect, it } from "vitest";
import {
  facilityNeedsTranslation,
  getFacilityTranslationTexts,
} from "./facilityTranslationState";

const translatedFacility = {
  id: "facility-1",
  name: "중앙 경사로",
  name_en: "Central ramp",
  name_zh: "中央坡道",
  description: "정문 방향",
  description_en: "Toward the main gate",
  description_zh: "正门方向",
  floor_info: null,
  floor_info_en: null,
  floor_info_zh: null,
  translation_status: "translated",
} as const;

describe("facility translation state", () => {
  it("실패·대기 상태는 번역 필요로 판단한다", () => {
    expect(
      facilityNeedsTranslation({
        ...translatedFacility,
        translation_status: "failed",
      }),
    ).toBe(true);
    expect(
      facilityNeedsTranslation({
        ...translatedFacility,
        translation_status: "pending",
      }),
    ).toBe(true);
  });

  it("원문이 있는 번역 필드가 비어 있으면 번역 필요로 판단한다", () => {
    expect(
      facilityNeedsTranslation({
        ...translatedFacility,
        description_zh: null,
      }),
    ).toBe(true);
  });

  it("원문이 없는 필드의 빈 번역은 허용한다", () => {
    expect(facilityNeedsTranslation(translatedFacility)).toBe(false);
  });

  it("번역 요청에는 공백을 제거한 원문만 포함한다", () => {
    expect(
      getFacilityTranslationTexts({
        name: "  중앙 경사로 ",
        description: "",
        floor_info: " 1층 ",
      }),
    ).toEqual({ name: "중앙 경사로", floor_info: "1층" });
  });
});
