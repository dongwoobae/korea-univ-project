import { describe, expect, it } from "vitest";
import {
  FACILITY_COLOR_CHOICES,
  FACILITY_ICON_CHOICES,
  FACILITY_ICON_SVG,
  FALLBACK_FACILITY_STYLE,
  facilityIconSvg,
  facilityStyleOf,
  isFacilityIconKey,
} from "@/lib/facilityStyleCatalog";

function contrastWithWhite(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 1.05 / (0.2126 * r + 0.7152 * g + 0.0722 * b + 0.05);
}

const types = [
  { code: "ramp", icon: "trending-up", color: "#B25617" },
  { code: "odd_icon", icon: "not-an-icon", color: "#2D5FB0" },
  { code: "odd_color", icon: "sofa", color: "red" },
  { code: "before_migration" },
];

describe("아이콘 목록", () => {
  it("30개이고 키마다 마커 SVG가 같은 lucide 아이콘이다", () => {
    expect(FACILITY_ICON_CHOICES).toHaveLength(30);
    for (const { key } of FACILITY_ICON_CHOICES)
      expect(FACILITY_ICON_SVG[key], key).toContain(
        `class="lucide lucide-${key}"`,
      );
  });

  it("키가 겹치지 않고 이름이 비지 않는다", () => {
    const keys = FACILITY_ICON_CHOICES.map((choice) => choice.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const choice of FACILITY_ICON_CHOICES)
      expect(choice.label.trim()).not.toBe("");
  });

  it("목록에 있는 키만 아이콘 키로 인정한다", () => {
    expect(isFacilityIconKey("sofa")).toBe(true);
    expect(isFacilityIconKey("not-an-icon")).toBe(false);
    expect(isFacilityIconKey("constructor")).toBe(false);
    expect(isFacilityIconKey(null)).toBe(false);
  });
});

describe("색 목록", () => {
  it("10개이고 모두 흰 아이콘과 대비가 4.5:1 이상인 대문자 #RRGGBB다", () => {
    expect(FACILITY_COLOR_CHOICES).toHaveLength(10);
    for (const { hex } of FACILITY_COLOR_CHOICES) {
      expect(hex).toMatch(/^#[0-9A-F]{6}$/);
      expect(contrastWithWhite(hex), hex).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("대체 색도 목록에 있다", () => {
    expect(FACILITY_COLOR_CHOICES.map((choice) => choice.hex)).toContain(
      FALLBACK_FACILITY_STYLE.color,
    );
  });
});

describe("facilityStyleOf", () => {
  it("행의 아이콘·색을 돌려준다", () => {
    expect(facilityStyleOf(types, "ramp")).toEqual({
      icon: "trending-up",
      color: "#B25617",
    });
  });

  it("모르는 코드와 빈 코드는 대체값이다", () => {
    expect(facilityStyleOf(types, "unknown")).toEqual(FALLBACK_FACILITY_STYLE);
    expect(facilityStyleOf(types, null)).toEqual(FALLBACK_FACILITY_STYLE);
    expect(facilityStyleOf([], "ramp")).toEqual(FALLBACK_FACILITY_STYLE);
  });

  it("목록에 없는 아이콘·형식이 틀린 색은 그 칸만 대체값이다", () => {
    expect(facilityStyleOf(types, "odd_icon")).toEqual({
      icon: "accessibility",
      color: "#2D5FB0",
    });
    expect(facilityStyleOf(types, "odd_color")).toEqual({
      icon: "sofa",
      color: "#666666",
    });
  });

  it("마이그레이션 전처럼 칸이 없는 행도 대체값이다", () => {
    expect(facilityStyleOf(types, "before_migration")).toEqual(
      FALLBACK_FACILITY_STYLE,
    );
  });
});

describe("facilityIconSvg", () => {
  it("크기를 반영하고 색은 부모에서 상속한다", () => {
    const svg = facilityIconSvg("trending-up", 17);
    expect(svg).toContain("lucide-trending-up");
    expect(svg).toContain('width="17"');
    expect(svg).toContain('stroke="currentColor"');
  });

  it("모르는 키는 대체 아이콘이다", () => {
    expect(facilityIconSvg("not-an-icon", 17)).toContain(
      "lucide-accessibility",
    );
  });

  it("엘리베이터는 직접 그린 아이콘이고 크기가 svg에만 걸린다", () => {
    const svg = facilityIconSvg("elevator", 17);
    expect(svg).toContain('<svg class="lucide lucide-elevator"');
    expect(svg).toContain('width="17" height="17"');
    expect(svg).toContain('width="16" height="13"');
  });
});
