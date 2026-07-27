import { expect, test } from "@playwright/test";
import { installMockBackend } from "./support/mockBackend";

/**
 * 다크 모드 대비 회귀 가드 (UX-P0-03).
 *
 * 픽셀 스냅샷 대신 computed-style을 스캔한다: 시스템 다크 모드에서
 * 관리자 화면에 (1) 다크 미디어쿼리가 실제 적용되고, (2) 미이관 하드코딩
 * 흰 배경(#fff류)이나 (3) 근검정 텍스트(#111류)가 남아 있지 않음을 단언한다.
 * 하드코딩 색상은 다크 토큰으로 반전되지 않으므로 이 스캔에 잡힌다.
 */

interface Violations {
  darkActive: boolean;
  bodyBg: string;
  nearWhiteBg: string[];
  nearBlackText: string[];
}

async function scanContrast(page: import("@playwright/test").Page) {
  return page.evaluate<Violations>(() => {
    const parse = (value: string) => {
      const match = value.match(/rgba?\(([^)]+)\)/);
      if (!match) return null;
      const parts = match[1].split(",").map((x) => parseFloat(x));
      return {
        r: parts[0],
        g: parts[1],
        b: parts[2],
        a: parts[3] === undefined ? 1 : parts[3],
      };
    };
    const label = (el: Element, extra = "") =>
      `${el.tagName.toLowerCase()}.${(el.getAttribute("class") ?? "").trim()}${extra}`;

    const nearWhiteBg: string[] = [];
    const nearBlackText: string[] = [];
    for (const el of Array.from(document.querySelectorAll("body *"))) {
      // Leaflet 지도 위젯(타일·툴팁·컨트롤)은 서드파티 UI로 P0-03 범위 밖
      // (다크 베이스맵은 별도 항목 UX-P2-02). 관리자 콘텐츠만 검사한다.
      if (el.closest(".leaflet-container") || el.closest(".leaflet-control"))
        continue;
      const cs = getComputedStyle(el);
      const bg = parse(cs.backgroundColor);
      // 불투명한 근백색 배경 = 반전되지 않은 하드코딩 흰색
      if (bg && bg.a === 1 && bg.r >= 245 && bg.g >= 245 && bg.b >= 245) {
        nearWhiteBg.push(label(el));
      }
      // 자기 자신이 직접 텍스트 노드를 가진 요소만 검사
      const ownsText = Array.from(el.childNodes).some(
        (node) => node.nodeType === 3 && (node.textContent ?? "").trim(),
      );
      if (ownsText) {
        const fg = parse(cs.color);
        if (fg && fg.a === 1 && fg.r <= 25 && fg.g <= 25 && fg.b <= 25) {
          nearBlackText.push(
            label(el, ` "${(el.textContent ?? "").trim().slice(0, 24)}"`),
          );
        }
      }
    }
    return {
      darkActive: getComputedStyle(
        document.documentElement,
      ).colorScheme.includes("dark"),
      bodyBg: getComputedStyle(document.body).backgroundColor,
      nearWhiteBg,
      nearBlackText,
    };
  });
}

const SCREENS = [
  { name: "건물 목록", path: "/admin/dashboard/buildings" },
  { name: "시설 목록", path: "/admin/dashboard/facilities" },
  { name: "경사도 목록", path: "/admin/dashboard/slopes" },
  { name: "명소 목록", path: "/admin/dashboard/landmarks" },
  { name: "건물 상세", path: "/admin/buildings/1" },
  { name: "건물 신규 등록", path: "/admin/buildings/new" },
];

test.describe("관리자 다크 모드 대비 회귀 가드 (P0-03)", () => {
  test.use({ colorScheme: "dark" });

  for (const screen of SCREENS) {
    test(`${screen.name} 화면에 하드코딩 밝은 색이 남지 않는다`, async ({
      page,
    }) => {
      await installMockBackend(page, { authenticated: true });
      await page.goto(screen.path);
      await page.waitForLoadState("networkidle");

      const result = await scanContrast(page);
      expect(result.darkActive).toBe(true);
      // 다크 배경이 실제로 적용됨 (밝은 배경이 아님)
      expect(result.bodyBg).not.toBe("rgb(255, 255, 255)");
      expect(
        result.nearWhiteBg,
        `미이관 흰 배경: ${result.nearWhiteBg.join(", ")}`,
      ).toHaveLength(0);
      expect(
        result.nearBlackText,
        `미이관 근검정 텍스트: ${result.nearBlackText.join(", ")}`,
      ).toHaveLength(0);
    });
  }

  test("시설 폼 모달에 하드코딩 밝은 색이 남지 않는다", async ({ page }) => {
    await installMockBackend(page, { authenticated: true });
    await page.goto("/admin/dashboard/facilities");
    await page.getByRole("button", { name: "+ 시설 추가" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();

    const result = await scanContrast(page);
    expect(
      result.nearWhiteBg,
      `미이관 흰 배경: ${result.nearWhiteBg.join(", ")}`,
    ).toHaveLength(0);
    expect(
      result.nearBlackText,
      `미이관 근검정 텍스트: ${result.nearBlackText.join(", ")}`,
    ).toHaveLength(0);
  });
});
