import { describe, expect, it } from "vitest";
import {
  FACILITY_CLUSTER_ICON_SVG,
  LANDMARK_CATEGORY_ICON_SVG,
  LANDMARK_FALLBACK_EMOJI,
  SUBWAY_ICON_SVG,
  facilityIconKey,
  facilityIconSvg,
  landmarkEmoji,
  sizedIconSvg,
} from "./mapIcons";

describe("facilityIconKey", () => {
  it("알려진 시설 코드는 전용 키로 간다", () => {
    expect(facilityIconKey("elevator")).toBe("elevator");
    expect(facilityIconKey("restroom")).toBe("restroom");
    expect(facilityIconKey("ramp")).toBe("ramp");
    expect(facilityIconKey("parking")).toBe("parking");
    expect(facilityIconKey("braille")).toBe("braille");
  });

  it("모르는 코드와 빈 값은 fallback으로 간다", () => {
    expect(facilityIconKey("unknown_code")).toBe("fallback");
    expect(facilityIconKey("")).toBe("fallback");
    expect(facilityIconKey(null)).toBe("fallback");
    expect(facilityIconKey(undefined)).toBe("fallback");
    expect(facilityIconKey("constructor")).toBe("fallback");
    expect(facilityIconKey("__proto__")).toBe("fallback");
  });
});

describe("facilityIconSvg", () => {
  it("코드마다 서로 다른 lucide 아이콘을 준다", () => {
    expect(facilityIconSvg("elevator", 17)).toContain("lucide-arrow-up-down");
    expect(facilityIconSvg("restroom", 17)).toContain("lucide-toilet");
    expect(facilityIconSvg("ramp", 17)).toContain("lucide-trending-up");
    expect(facilityIconSvg("parking", 17)).toContain("lucide-square-parking");
    expect(facilityIconSvg("braille", 17)).toContain("lucide-grip-vertical");
    expect(facilityIconSvg("unknown_code", 17)).toContain(
      "lucide-accessibility",
    );
  });

  it("요청한 크기를 SVG 속성에 반영한다", () => {
    const svg = facilityIconSvg("ramp", 17);
    expect(svg).toContain('width="17"');
    expect(svg).toContain('height="17"');
    expect(svg).not.toContain('width="24"');
  });

  it("색은 부모에서 상속받도록 currentColor를 유지한다", () => {
    expect(facilityIconSvg("ramp", 17)).toContain('stroke="currentColor"');
  });
});

describe("sizedIconSvg", () => {
  it("width·height만 바꾸고 stroke-width는 건드리지 않는다", () => {
    const out = sizedIconSvg(LANDMARK_CATEGORY_ICON_SVG, 15);
    expect(out).toContain('width="15"');
    expect(out).toContain('height="15"');
    expect(out).toContain('stroke-width="2"');
  });
});

describe("마커 전용 아이콘", () => {
  it("명소·지하철·시설 클러스터 아이콘을 노출한다", () => {
    expect(LANDMARK_CATEGORY_ICON_SVG).toContain("lucide-sparkles");
    expect(SUBWAY_ICON_SVG).toContain("lucide-train-front");
    expect(FACILITY_CLUSTER_ICON_SVG).toContain("lucide-accessibility");
  });
});

describe("landmarkEmoji", () => {
  it("저장된 이모지를 그대로 돌려준다", () => {
    expect(landmarkEmoji("🐿️")).toBe("🐿️");
    expect(landmarkEmoji("  🐿️  ")).toBe("🐿️");
  });

  it("값이 없으면 기본 이모지로 떨어진다", () => {
    expect(landmarkEmoji(null)).toBe(LANDMARK_FALLBACK_EMOJI);
    expect(landmarkEmoji(undefined)).toBe(LANDMARK_FALLBACK_EMOJI);
    expect(landmarkEmoji("")).toBe(LANDMARK_FALLBACK_EMOJI);
    expect(landmarkEmoji("   ")).toBe(LANDMARK_FALLBACK_EMOJI);
  });
});
