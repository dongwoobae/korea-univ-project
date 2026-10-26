import { describe, expect, it } from "vitest";
import { campusColor } from "@/lib/theme";

function contrastWithWhite(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 1.05 / (0.2126 * r + 0.7152 * g + 0.0722 * b + 0.05);
}

// 선택된 필터 칩은 이 색으로 채우고 흰 글자를 얹는다(2026-10-16-square-corners-design.md). 시설 종류 색은 facilityStyleCatalog.test.ts
describe("캠퍼스 칩 채움색", () => {
  it("흰 글자와 대비가 4.5:1 이상이다", () => {
    for (const hex of Object.values(campusColor))
      expect(contrastWithWhite(hex), hex).toBeGreaterThanOrEqual(4.5);
  });
});
