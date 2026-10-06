import { describe, expect, it } from "vitest";
import { KU_BOUNDS, containsPoint } from "./mapBounds";

describe("containsPoint", () => {
  it("캠퍼스 중심은 범위 안이다", () => {
    expect(containsPoint(KU_BOUNDS, 37.5893, 127.0327)).toBe(true);
  });

  it("경계선은 범위 안이다", () => {
    expect(containsPoint(KU_BOUNDS, KU_BOUNDS.south, KU_BOUNDS.west)).toBe(
      true,
    );
    expect(containsPoint(KU_BOUNDS, KU_BOUNDS.north, KU_BOUNDS.east)).toBe(
      true,
    );
  });

  // 무명 숫자 쌍이면 이 실수를 타입이 못 잡는다(설계 5.4).
  it("위도와 경도를 뒤집으면 범위 밖이다", () => {
    expect(containsPoint(KU_BOUNDS, 127.0327, 37.5893)).toBe(false);
  });

  it("캠퍼스 밖 좌표는 범위 밖이다", () => {
    expect(containsPoint(KU_BOUNDS, 37.5, 127.0)).toBe(false);
  });
});
