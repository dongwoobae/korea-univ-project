import { describe, expect, it } from "vitest";
import { isUuid } from "./uuid";

describe("isUuid", () => {
  it("소문자·대문자 UUID를 받는다", () => {
    expect(isUuid("123e4567-e89b-12d3-a456-426614174000")).toBe(true);
    expect(isUuid("123E4567-E89B-12D3-A456-426614174000")).toBe(true);
  });

  it("형식이 다른 값은 거른다", () => {
    for (const value of ["", "r1", "../x", "123e4567e89b12d3a456426614174000"])
      expect(isUuid(value)).toBe(false);
    expect(isUuid("123e4567-e89b-12d3-a456-426614174000\n")).toBe(false);
  });
});
