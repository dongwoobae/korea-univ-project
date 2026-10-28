import { describe, expect, it, vi } from "vitest";
import { FACILITY_ICON_SVG } from "@/lib/facilityStyleCatalog";
import { LANDMARK_CATEGORY_ICON_SVG } from "@/lib/mapIcons";
import {
  FACILITY_ICON,
  LANDMARK_CATEGORY_ICON,
  SLOPE_LINE_ICON_NODE,
} from "./iconography";

// iconography.tsx가 종류 저장소를 거쳐 supabaseClient를 import한다. 그 모듈은 import할 때 환경 변수로 클라이언트를 만들고,
// CI 단위 테스트 잡에는 그 변수가 없어 수집 단계에서 터진다.
vi.mock("@/lib/supabaseClient", () => ({ supabase: { from: vi.fn() } }));

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
    expect(Object.keys(FACILITY_ICON).sort()).toEqual(
      Object.keys(FACILITY_ICON_SVG).sort(),
    );
  });

  it("명소 아이콘도 마커와 JSX가 일치한다", () => {
    expect(LANDMARK_CATEGORY_ICON_SVG).toContain(
      `class="lucide ${lucideClass(LANDMARK_CATEGORY_ICON.displayName!)}"`,
    );
  });
});

describe("경사도 버튼 아이콘", () => {
  it("밑선으로 닫힌 산 모양이 아니라 열린 꺾은선 하나다", () => {
    expect(SLOPE_LINE_ICON_NODE).toHaveLength(1);
    const [tag, attrs] = SLOPE_LINE_ICON_NODE[0];
    expect(tag).toBe("path");
    // 닫기(z)도 가로 밑선(h)도 없다
    expect(String(attrs.d)).not.toMatch(/[zZhH]/);
  });
});
