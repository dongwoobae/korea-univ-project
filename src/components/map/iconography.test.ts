import { describe, expect, it, vi } from "vitest";
import { FACILITY_ICON_SVG } from "@/lib/facilityStyleCatalog";
import { LANDMARK_CATEGORY_ICON_SVG } from "@/lib/mapIcons";
import { FACILITY_ICON, LANDMARK_CATEGORY_ICON } from "./iconography";

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
