import { describe, expect, it } from "vitest";
import { FACILITY_ICON_SVG, LANDMARK_CATEGORY_ICON_SVG } from "@/lib/mapIcons";
import { FACILITY_ICON, LANDMARK_CATEGORY_ICON } from "./iconography";

function lucideClass(displayName: string): string {
  return `lucide-${displayName.replace(/(?<!^)([A-Z])/g, "-$1").toLowerCase()}`;
}

describe("아이콘 테이블 짝 맞추기", () => {
  it("시설 키마다 마커 SVG와 JSX 컴포넌트가 같은 아이콘을 가리킨다", () => {
    for (const [key, Icon] of Object.entries(FACILITY_ICON)) {
      expect(
        FACILITY_ICON_SVG[key as keyof typeof FACILITY_ICON_SVG],
      ).toContain(`class="lucide ${lucideClass(Icon.displayName!)}"`);
    }
  });

  it("명소 아이콘도 마커와 JSX가 일치한다", () => {
    expect(LANDMARK_CATEGORY_ICON_SVG).toContain(
      `class="lucide ${lucideClass(LANDMARK_CATEGORY_ICON.displayName!)}"`,
    );
  });
});
