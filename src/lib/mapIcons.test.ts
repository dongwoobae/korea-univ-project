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
  it("코드마다 서로 다른 아이콘을 준다", () => {
    expect(facilityIconSvg("elevator", 17)).toContain("lucide-elevator");
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
    expect(facilityIconSvg("elevator", 17)).toContain('stroke="currentColor"');
  });
});

describe("엘리베이터 커스텀 아이콘", () => {
  it("승강기 문과 위·아래 화살표로 그려진다", () => {
    const svg = facilityIconSvg("elevator", 17);
    expect(svg).toContain('d="M12 9v13"');
    expect(svg).toContain("<rect");
    expect(svg).toContain('d="m6 5 2-2 2 2"');
    expect(svg).toContain('d="m14 5 2 2 2-2"');
  });

  it("lucide 규격을 따라 나머지 시설 아이콘과 나란히 선다", () => {
    const svg = facilityIconSvg("elevator", 17);
    expect(svg).toContain('viewBox="0 0 24 24"');
    expect(svg).toContain('stroke-width="2"');
    expect(svg).toContain('stroke-linecap="round"');
    expect(svg).toContain('fill="none"');
  });

  // key는 React 전용이라 SVG 속성으로 새면 안 된다.
  it("React key가 SVG 문자열로 새지 않는다", () => {
    expect(facilityIconSvg("elevator", 17)).not.toContain("key=");
  });

  // sizedIconSvg는 첫 width만 바꾼다. 상자의 width="16"이 앞에 오면 크기가
  // 엉뚱한 곳에 먹는다.
  it("크기 조절이 svg에만 걸리고 상자 치수는 그대로다", () => {
    const svg = facilityIconSvg("elevator", 17);
    expect(svg).toContain('<svg class="lucide lucide-elevator"');
    expect(svg).toContain('width="17" height="17"');
    expect(svg).toContain('width="16" height="13"');
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

  // RLS가 with check (true)라 REST로 직접 쓴 값이 여기까지 온다. DB check는
  // 길이만 봐서 이모지가 아닌 값을 막지 못한다.
  it("이모지가 아닌 값은 기본 이모지로 떨어진다", () => {
    expect(landmarkEmoji("ABCDEFGHIJKLMNO!")).toBe(LANDMARK_FALLBACK_EMOJI);
    expect(landmarkEmoji("가나다")).toBe(LANDMARK_FALLBACK_EMOJI);
    expect(landmarkEmoji("0123456789012345")).toBe(LANDMARK_FALLBACK_EMOJI);
    expect(landmarkEmoji("‮")).toBe(LANDMARK_FALLBACK_EMOJI);
    expect(landmarkEmoji("‍‍‍")).toBe(LANDMARK_FALLBACK_EMOJI);
  });

  it("이모지에 글자가 섞이면 기본 이모지로 떨어진다", () => {
    expect(landmarkEmoji("🌳ABCDEFGHIJKLM")).toBe(LANDMARK_FALLBACK_EMOJI);
  });

  it("ZWJ 시퀀스와 스킨톤 조합은 그대로 돌려준다", () => {
    expect(landmarkEmoji("👨‍👩‍👧‍👦")).toBe("👨‍👩‍👧‍👦");
    expect(landmarkEmoji("🧑🏽‍🚀")).toBe("🧑🏽‍🚀");
    expect(landmarkEmoji("🏳️‍🌈")).toBe("🏳️‍🌈");
  });

  // Extended_Pictographic만으로는 이 둘이 걸러진다 — 국기는 Regional_Indicator,
  // 키캡은 숫자에 U+20E3이 붙은 형태다.
  it("국기와 키캡도 그대로 돌려준다", () => {
    expect(landmarkEmoji("🇰🇷")).toBe("🇰🇷");
    expect(landmarkEmoji("🏴󠁧󠁢󠁳󠁣󠁴󠁿")).toBe("🏴󠁧󠁢󠁳󠁣󠁴󠁿");
    expect(landmarkEmoji("1️⃣")).toBe("1️⃣");
    expect(landmarkEmoji("#️⃣")).toBe("#️⃣");
  });
});
