import { describe, expect, it } from "vitest";
import { parseFacilityFields } from "./facilityFields";

const base = { facility_code: "elevator" };

describe("parseFacilityFields", () => {
  it("빈 문자열은 null로, 앞뒤 공백은 지운다", () => {
    expect(
      parseFacilityFields({
        ...base,
        name: "  후문 엘리베이터 ",
        description: "",
        floor_info: " ",
      }),
    ).toEqual({
      facility_code: "elevator",
      name: "후문 엘리베이터",
      description: null,
      floor_info: null,
      is_installed: true,
      lat: null,
      lng: null,
    });
  });

  it("유형이 없으면 거부한다", () => {
    expect(parseFacilityFields({ name: "x" })).toBeNull();
    expect(parseFacilityFields({ facility_code: "  " })).toBeNull();
  });

  it("글자 수 상한을 넘으면 거부한다", () => {
    expect(parseFacilityFields({ ...base, name: "가".repeat(101) })).toBeNull();
    expect(
      parseFacilityFields({ ...base, description: "가".repeat(1001) }),
    ).toBeNull();
    expect(
      parseFacilityFields({ ...base, floor_info: "가".repeat(101) }),
    ).toBeNull();
    expect(
      parseFacilityFields({ ...base, name: "가".repeat(100) }),
    ).not.toBeNull();
  });

  it("좌표는 둘 다 있거나 둘 다 없어야 하고 범위 안이어야 한다", () => {
    expect(
      parseFacilityFields({ ...base, lat: 37.5, lng: 127.03 }),
    ).toMatchObject({ lat: 37.5, lng: 127.03 });
    expect(
      parseFacilityFields({ ...base, lat: "37.5", lng: "127.03" }),
    ).toMatchObject({ lat: 37.5, lng: 127.03 });
    expect(parseFacilityFields({ ...base, lat: 37.5 })).toBeNull();
    expect(parseFacilityFields({ ...base, lat: 91, lng: 0 })).toBeNull();
    expect(parseFacilityFields({ ...base, lat: 0, lng: 181 })).toBeNull();
    expect(parseFacilityFields({ ...base, lat: "abc", lng: "1" })).toBeNull();
  });

  it("설치 상태는 불리언만 받고 없으면 설치로 둔다", () => {
    expect(parseFacilityFields({ ...base, is_installed: false })).toMatchObject(
      { is_installed: false },
    );
    expect(parseFacilityFields({ ...base, is_installed: "false" })).toBeNull();
  });

  it("객체가 아니면 거부한다", () => {
    expect(parseFacilityFields(null)).toBeNull();
    expect(parseFacilityFields("elevator")).toBeNull();
  });
});
