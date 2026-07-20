import { describe, expect, it } from "vitest";
import { validateFacilityForm } from "./facilityForm";

describe("validateFacilityForm", () => {
  const base = { facility_code: "elevator", lat: "37.5", lng: "127.0" };

  it("유형 미선택이면 오류 메시지를 반환한다", () => {
    expect(
      validateFacilityForm(
        { ...base, facility_code: "" },
        { standalone: false },
      ),
    ).toBe("시설 유형을 선택해주세요");
  });

  it("독립 시설은 좌표가 없으면 오류 메시지를 반환한다", () => {
    expect(
      validateFacilityForm({ ...base, lat: "", lng: "" }, { standalone: true }),
    ).toBe("지도를 클릭해 위치를 선택해주세요");
  });

  it("독립 시설이라도 좌표가 있으면 통과한다", () => {
    expect(validateFacilityForm(base, { standalone: true })).toBeNull();
  });

  it("건물 시설은 좌표가 없어도 통과한다", () => {
    expect(
      validateFacilityForm(
        { ...base, lat: "", lng: "" },
        { standalone: false },
      ),
    ).toBeNull();
  });
});
